"""Research-only compilation and integrity checks. No application import, DB or network.

Run from any directory: python3 /absolute/path/to/working/build_artifacts.py
Input: reviewed workstream CSV/JSON files. Output: consolidated research CSV/Bib/stats.
This is not a statistical meta-analysis script.
"""
import collections
import csv
import hashlib
import json
import pathlib
import re
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parents[1]
WORK = ROOT / 'working'
FIELDS = list(next(csv.DictReader((WORK / 'sw_evidence.csv').open(encoding='utf-8'))))
LOG_FIELDS = ['record_type', 'query_id', 'date', 'source', 'query', 'url', 'title',
              'returned_count', 'decision', 'exclusion_reason', 'access_status',
              'study_id', 'raw_record', 'notes']


def read_csv(path):
    with path.open(encoding='utf-8', newline='') as f:
        return list(csv.DictReader(f))


def write_csv(path, rows, fields):
    with path.open('w', encoding='utf-8', newline='') as f:
        w = csv.DictWriter(f, fields, extrasaction='ignore')
        w.writeheader()
        w.writerows(rows)


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def flatten_text(value):
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return '\n'.join(map(flatten_text, value))
    if isinstance(value, dict):
        if 'text' in value:
            return value['text']
        return '\n'.join(flatten_text(v) for k, v in value.items()
                         if k in ('result', 'value', 'content'))
    return ''


def safe_url(url):
    parts = urllib.parse.urlsplit(url)
    args = urllib.parse.parse_qsl(parts.query, keep_blank_values=True)
    if any(k.lower() in ('token', 'access_token', 'signature') for k, _ in args):
        args = [(k, '[REDACTED_PUBLIC_SEARCH_PARAMETER]') if k.lower() in
                ('token', 'access_token', 'signature') else (k, v) for k, v in args]
        return urllib.parse.urlunsplit(parts._replace(query=urllib.parse.urlencode(args)))
    return url


bundle = json.loads((WORK / 'hc_bundle.json').read_text())
hc_rows = bundle['rows']
review = WORK / 'hc18_review.json'
if review.exists():
    patch = json.loads(review.read_text())
    updated = patch.get('updated_row', patch)
    if updated.get('evidence_id') == 'HC18':
        hc_rows = [updated if r['evidence_id'] == 'HC18' else r for r in hc_rows]
        bundle['studies']['HC-S14'].update({k: v for k, v in updated.items()
                                          if k in bundle['studies']['HC-S14']})
write_csv(WORK / 'hc_evidence.csv', hc_rows, FIELDS)
write_json(WORK / 'hc_studies.json', bundle['studies'])
rows = hc_rows + sum([read_csv(WORK / f'{prefix}_evidence.csv')
                     for prefix in ('sw', 'ac', 'kr')], [])
assert len({r['evidence_id'] for r in rows}) == len(rows)
assert all(set(r) == set(FIELDS) for r in rows), 'Evidence field mismatch'
assert all(all(str(r[k]).strip() for k in FIELDS if k != 'doi') for r in rows)
write_csv(ROOT / 'evidence_matrix.csv', rows, FIELDS)
studies = {r['study_id']: r for r in rows}

# Study linkage marks indexed copies; a search return does not mean abstract/full-text review.
aliases = {
    'HC-S01': ['an inter-comparison of the holi', 'an inter (hci:beach)', 'rutty%20et%20al_2020'],
    'HC-S03': ['bioclimatic comfort and the thermal'],
    'HC-S05': ['여름철 해변지역의 인간 열환경지수', 'human thermal sensation and comfort of beach', 'jako201627037746173'],
    'HC-S09': ['inter-comparison of the holiday climate index (hci)', 'atmosphere-07-00080', 'atmos7060080'],
    'HC-S11': ['egu24-5058'],
    'HC-S14': ['preferred climates for tourism', 'c038p061.pdf'],
    'KR-S01': ['기상요소변화와 해변 관광객 유입간의 관계'],
}


def identify(title, url):
    text = (title + ' ' + url).lower()
    # HCI Europe must precede broadly truncated HCI:Beach title matching.
    if any(a in text for a in aliases['HC-S09']):
        return 'HC-S09'
    for sid, s in studies.items():
        doi = s['doi'].lower()
        if doi and doi != 'nr' and doi in urllib.parse.unquote(text):
            return sid
        title_key = s['title'].lower().rstrip('.')
        if title_key in text or any(a in text for a in aliases.get(sid, [])):
            return sid
    return ''


logs = []
seen_url = set()
for path in sorted((ROOT / 'search_records').glob('HC-Q*.json')):
    d = json.loads(path.read_text())
    qid = d.get('query_id', d.get('id'))
    if 'records' in d:
        records = d['records']
    elif 'results' in d and d.get('record_format'):
        # Recompilation after prose-minimized archiving.
        records = d['results']
        q = d['queries'][0]
        d.update(q)
        qid = q['query_id']
    else:
        text = flatten_text(d['result'])
        if 'exa' in d['source']:
            found = re.findall(r'(?:^|\n)Title: ([\s\S]*?)\nURL: ([^\n]+)', text)
        else:
            found = re.findall(r'^([^\n]+) \((https?://[^\n]+)\)\n', text, re.M)
        records = [dict(title=t.strip(), url=u.strip(), record_id=f'result-{i}')
                   for i, (t, u) in enumerate(found, 1)]
    for i, record in enumerate(records, 1):
        title, url = record['title'], safe_url(record['url'])
        sid = identify(title, url)
        decision, reason = 'not_extracted_candidate', '관련 가능 반환; 우선 원연구·직접 결과 중심 범위에서 추가 원문 검토하지 않음'
        if sid:
            decision, reason = 'linked_to_included_study', '선정 연구의 검색 반환/서지 사본; 접근 단계는 별도 행 참조'
        elif any(x in (title + ' ' + url).lower() for x in
                 ['youtube', 'arxiv.org', '금융위원회', '조달청', '저비용항공사', 'k-상품군',
                  '스포츠 현장관람', 'platform', 'curricula vitae', 'english drill',
                  'glenn burns', 'retire in', 'geography and geology', 'hotel firms',
                  'zoo', 'snow tourism', 'ski', '외자구매', '주철관']):
            decision, reason = 'excluded_scope', '제목/검색 맥락상 대상 물활동·환경 결과와 무관하거나 관광 홍보'
        elif any(x in title.lower() for x in ['search results', 'journal articles:', '검색결과', 'browse articles', 'special issue', '교수진소개', 'research profile']):
            decision, reason = 'excluded_listing', '논문 자체가 아닌 목록/인물/검색/특집 페이지'
        if url in seen_url:
            decision, reason = 'duplicate_url', '이미 반환된 URL; 독립 논문/표본으로 합산하지 않음'
        seen_url.add(url)
        logs.append(dict(record_type='search_return', query_id=qid, date=d['date'],
                         source=d['source'], query=d['query'], url=url, title=title,
                         returned_count=len(records), decision=decision,
                         exclusion_reason=reason, access_status='search_return_only',
                         study_id=sid, raw_record=str(path.relative_to(ROOT)) + '#' + record.get('record_id', f'result-{i}'),
                         notes='공개 검색 결과의 서명/토큰 매개변수는 삭제 표시' if url != record['url'] else ''))

for r in json.loads((ROOT / 'search_records/HC-reading-log.json').read_text()):
    logs.append(dict(r, record_type='retrieval_attempt', notes=r.get('note', '')))
for i, m in enumerate(json.loads((ROOT / 'search_records/HC-crossref-metadata.json').read_text()), 1):
    sid = m['study_id']
    logs.append(dict(record_type='metadata_lookup', query_id=f'HC-M{i:02}', date=m['date'],
                     source='Crossref public API via urllib', query='DOI bibliographic metadata lookup',
                     url=m['url'], title=studies[sid]['title'], returned_count='',
                     decision='metadata_checked' if m['status'] != 'failed' else 'access_failed',
                     exclusion_reason=m.get('error', ''), access_status=m['status'], study_id=sid,
                     raw_record='search_records/HC-crossref-metadata.json',
                     notes='서지 조회는 논문 초록/원문 검토 아님; HC-S14 권수 충돌은 원출처/저자기관 우선'))
write_csv(WORK / 'hc_search_log.csv', logs, LOG_FIELDS)
for prefix in ('sw', 'ac', 'kr'):
    for r in read_csv(WORK / f'{prefix}_search_log.csv'):
        r['record_type'] = ('search_return' if 'search' in r['source'].lower() else 'retrieval_attempt')
        r['url'] = safe_url(r['url'])
        r['notes'] = r.get('notes', '')
        logs.append(r)
write_csv(ROOT / 'search_log.csv', logs, LOG_FIELDS)

# Citation keys are study IDs, permitting direct joins with the claim matrix.
meta = {x['study_id']: x.get('metadata', {}) for x in
        json.loads((ROOT / 'search_records/HC-crossref-metadata.json').read_text())}
bib = ['% Verified source records; access checked 2026-09-14. Evidence IDs join via study_id.\n']
for sid, original in bundle['studies'].items():
    s = studies[sid]
    m = meta[sid]
    kind = 'misc' if s['source_type'] == 'conference_abstract' else 'article'
    fields = dict(title=s['title'], author=' and '.join(s['authors'].split('; ')),
                  year=re.search(r'\d{4}', s['year']).group(), doi=s['doi'], url=s['url'],
                  urldate='2026-09-14', note=f'{sid}; {s["access_status"]}; {s["source_type"]}')
    for k, out in [('container-title', 'journal'), ('volume', 'volume'), ('issue', 'number'), ('page', 'pages')]:
        if m.get(k):
            fields[out] = m[k][0] if isinstance(m[k], list) else m[k]
    if sid == 'HC-S03':
        fields.update(journal='International Journal of Biometeorology', volume='59', number='1', pages='37--45')
    if sid == 'HC-S05':
        fields.update(journal='한국조경학회지', volume='44', number='4', pages='100--108')
    if sid == 'HC-S08':
        fields['journal'] = 'The Canadian Geographer / Le géographe canadien'
    if sid == 'HC-S11':
        fields.pop('journal', None)
        fields.update(howpublished='EGU General Assembly 2024, EGU24-5058', year='2024')
        fields['note'] += '; conference year verified; Crossref later deposit date is not a journal publication date'
    if sid == 'HC-S14':
        fields.update(volume='38', pages='61--73')
        fields['note'] += '; Crossref volume 45 conflicts with directly checked Lund author institutional volume 38; use 38. Publisher PDF access failed, not full-text verified'
    escaped = {k: str(v).replace('&', '\\&').replace('%', '\\%').replace('\n', ' ') for k, v in fields.items()}
    bib.append('@' + kind + '{' + sid + ',\n' + ',\n'.join('  ' + k + ' = {' + v + '}' for k, v in escaped.items()) + '\n}\n')
key_map = {
    'Gueritee2015Following': 'SW-S01', 'Gueritee2015Cool': 'SW-S02',
    'Arnold2017Surfers': 'SW-S03', 'Macaluso2011Water': 'SW-S04',
    'Busan2025BeachWater': 'SW-S05', 'KHOA2026RipNotice': 'SW-S06',
    'KMALightning': 'SW-S07', 'KMATyphoon': 'SW-S08', 'ChoiKim2026Rip': 'SW-S09',
    'CDC2025HealthyHotTubs': 'SW-S10', 'CDC2025HotTubLegionella': 'SW-S11',
    'KimHeo2019Gangneung': 'KR-S01',
}
for prefix in ('sw', 'ac', 'kr'):
    text = (WORK / f'{prefix}_references.bib').read_text()
    for old, new in key_map.items():
        text = re.sub(r'(@\w+\{)' + re.escape(old) + ',', r'\g<1>' + new + ',', text)
    bib.append(text)
(ROOT / 'references.bib').write_text('\n'.join(bib), encoding='utf-8')

# Counts distinguish engine returns, retrieval operations, sources and claims.
returns = [r for r in logs if r['record_type'] == 'search_return']
stats = dict(claims=len(rows), distinct_sources=len(studies),
             source_types=dict(collections.Counter(s['source_type'] for s in studies.values())),
             access_statuses=dict(collections.Counter(s['access_status'] for s in studies.values())),
             search_return_records=len(returns), unique_returned_urls=len({r['url'] for r in returns}),
             query_bundles=len({r['query_id'] for r in returns}),
             recorded_query_strings=len({(r['query_id'], r['query']) for r in returns}),
             log_rows=len(logs), record_types=dict(collections.Counter(r['record_type'] for r in logs)),
             source_ids=sorted(studies), evidence_ids=[r['evidence_id'] for r in rows],
             note='Query bundles can contain multiple exact queries. No database total-hit estimate; no full systematic-screening count inferred.')
stats['by_workstream'] = {}
for prefix in ('HC', 'sw', 'ac', 'KR'):
    selected = [r for r in returns if r['query_id'].startswith(prefix)]
    stats['by_workstream'][prefix] = dict(return_records=len(selected),
        bundles=len({r['query_id'] for r in selected}),
        recorded_query_strings=len({(r['query_id'], r['query']) for r in selected}))
stats['executed_query_strings'] = stats['query_bundles'] + 3
stats['query_count_note'] = 'ac-search1 contains four executed queries in one call; returned results are not assigned to one of the four when tool provenance does not distinguish them. Other bundles each contain one query.'
stats['normalized_access'] = dict(collections.Counter(
    'full_text_checked' if s['access_status'].startswith('full_text_checked') else 'abstract_only'
    for s in studies.values()))
stats['journal_research_access'] = dict(collections.Counter(
    'full_text_checked' if s['access_status'].startswith('full_text_checked') else 'abstract_only'
    for s in studies.values() if s['source_type'] in ('empirical_peer_reviewed', 'index_development')))
write_json(WORK / 'research_stats.json', stats)
print(json.dumps(stats, ensure_ascii=False, indent=2))

"""Check research artifact joins and pre-existing file preservation, without running products."""
import collections
import csv
import datetime
import hashlib
import json
import pathlib
import re
import subprocess
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parents[1]
REPO = ROOT.parents[2]
WORK = ROOT / 'working'
issues = []


def read_csv(path):
    with path.open(encoding='utf-8', newline='') as f:
        return list(csv.DictReader(f))


def git(*args):
    return subprocess.run(['git', '--no-optional-locks', '-C', str(REPO), *args],
                          check=True, text=True, capture_output=True, timeout=30).stdout.strip()


matrix = read_csv(ROOT / 'evidence_matrix.csv')
logs = read_csv(ROOT / 'search_log.csv')
eids = {r['evidence_id'] for r in matrix}
sids = {r['study_id'] for r in matrix}
qids = {r['query_id'] for r in logs}
if len(eids) != len(matrix):
    issues.append('duplicate evidence_id')
if any(len(r) != 31 or None in r for r in matrix):
    issues.append('matrix column count differs from 31')
for r in matrix:
    for qid in r['search_ids'].split(';'):
        if qid.strip() not in qids:
            issues.append(f'{r["evidence_id"]}: missing query_id {qid}')

bib = (ROOT / 'references.bib').read_text()
keys = re.findall(r'@\w+\{([^,]+),', bib)
if len(set(keys)) != len(keys):
    issues.append('duplicate BibTeX key')
if sids - set(keys):
    issues.append('missing bibliography keys: ' + repr(sids - set(keys)))
doi_by_sid = {}
for part in re.split(r'(?=@\w+\{)', bib):
    key = re.match(r'@\w+\{([^,]+),', part)
    doi = re.search(r'\bdoi\s*=\s*\{([^}]+)\}', part)
    if key and doi:
        doi_by_sid[key[1]] = doi[1].lower()
for r in matrix:
    if r['doi'] and r['doi'] != 'NR' and r['doi'].lower() != doi_by_sid.get(r['study_id']):
        issues.append(f'{r["evidence_id"]}: matrix/Bib DOI mismatch')

for r in logs:
    relative, _, anchor = r['raw_record'].partition('#')
    p = ROOT / relative
    if not p.exists():
        issues.append(f'{r["query_id"]}: missing return metadata file {relative}')
    elif anchor and r['record_type'] == 'search_return':
        data = json.loads(p.read_text())
        if isinstance(data, dict) and data.get('record_format'):
            candidates = {x['record_id'] for x in data['results']}
            if anchor not in candidates:
                issues.append(f'{r["query_id"]}: missing return ID {anchor}')
    if r['url'] and urllib.parse.urlsplit(r['url']).scheme not in ('http', 'https'):
        issues.append(f'{r["query_id"]}: malformed URL')

mdfiles = [ROOT / n for n in ['README.md', 'legacy_audit.md', 'research_protocol.md', 'synthesis.md']]
local_links = 0
for p in mdfiles:
    text = p.read_text()
    ids = set(re.findall(r'\b(?:HC|SW|AC|KR)\d{2}\b', text))
    if ids - eids:
        issues.append(p.name + ': unknown evidence IDs ' + repr(ids - eids))
    # Inline code is not Markdown link syntax.
    clean = re.sub(r'`[^`]*`', '', text)
    for target in re.findall(r'\[[^\]\n]+\]\(([^\s)]+)\)', clean):
        target = target.strip('<>')
        if target.startswith(('http:', 'https:', '#')):
            continue
        local_links += 1
        file_part = urllib.parse.unquote(target.split('#')[0])
        dest = (p.parent / file_part).resolve()
        if not dest.exists() and dest != (WORK / 'validation.json').resolve():
            issues.append(f'{p.name}: missing file link {target}')

baseline = json.loads((WORK / 'baseline.json').read_text())
changed = []
for relative, original in baseline['files'].items():
    p = REPO / relative
    if not p.exists() or hashlib.sha256(p.read_bytes()).hexdigest() != original:
        changed.append(relative)
if changed:
    issues.append('pre-existing Pongdang files changed: ' + repr(changed))
branch, head = git('branch', '--show-current'), git('rev-parse', 'HEAD')
if branch != baseline['branch'] or head != baseline['head']:
    issues.append('Pongdang branch/HEAD changed')
status = git('status', '--short')
new_outside = sorted(set(x for x in status.splitlines() if 'docs/research/' not in x)
                     - set(baseline['status'].strip().splitlines()))
removed_status = sorted(set(baseline['status'].strip().splitlines())
                        - set(x for x in status.splitlines() if 'docs/research/' not in x))
if new_outside or removed_status:
    issues.append('Git status outside research differs from baseline')

legacy = json.loads((WORK / 'reviewed_legacy_files.json').read_text())
legacy_changed = []
for f in legacy['files']:
    p = pathlib.Path(legacy['repository_path']) / f['path']
    if not p.exists() or hashlib.sha256(p.read_bytes()).hexdigest() != f['sha256']:
        legacy_changed.append(f['path'])
if legacy_changed:
    issues.append('reviewed legacy files changed: ' + repr(legacy_changed))

result = dict(checked_at_kst=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).isoformat(),
    passed=not issues, issues=issues, evidence_rows=len(matrix), evidence_columns=31,
    distinct_studies=len(sids), bib_entries=len(keys), bibliography_trace_only_entries=len(keys)-len(sids),
    log_rows=len(logs), record_types=dict(collections.Counter(r['record_type'] for r in logs)),
    checked_local_document_links=local_links, baseline_files_checked=len(baseline['files']),
    changed_preexisting_files=changed, branch=branch, head=head,
    status_new_outside_research=new_outside, status_missing_from_baseline=removed_status,
    legacy_reviewed_files_checked=len(legacy['files']), legacy_changed_files=legacy_changed,
    checks='CSV structure/ID uniqueness; evidence-search joins; Bib study IDs/DOI joins; metadata file/return IDs; local document links; pre-existing file hashes/Git status; reviewed legacy file hashes',
    not_performed='No product tests/build/lint, API/DB access, deployment or statistical meta-analysis. No independent duplicate study screening. No claim that external URLs remain permanently accessible.')
(WORK / 'validation.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
print(json.dumps(result, ensure_ascii=False, indent=2))
raise SystemExit(0 if result['passed'] else 1)

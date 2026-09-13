"""Keep actual search return metadata without redistributing article prose.

Run only after build_artifacts.py. Does not contact search engines or touch product files.
Original title/URL/query/return ID/selection are retained from recorded CSV rows.
"""
import collections
import csv
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[1]
with (ROOT / 'search_log.csv').open(encoding='utf-8', newline='') as f:
    rows = list(csv.DictReader(f))
groups = collections.defaultdict(list)
for row in rows:
    if row['record_type'] == 'search_return':
        groups[row['raw_record'].split('#')[0]].append(row)

for relative, records in groups.items():
    path = ROOT / relative
    # KR file includes retrieval metadata as well; already contains no full article prose.
    if relative == 'working/kr_search_records.json':
        continue
    old = json.loads(path.read_text())
    original_queries = old.get('original_query_specification', old.get('queries')) if isinstance(old, dict) else None
    queries = {}
    results = []
    for i, row in enumerate(records, 1):
        queries.setdefault(row['query_id'], {k: row[k] for k in
            ['query_id', 'date', 'source', 'query', 'returned_count']})
        results.append(dict(record_id=row['raw_record'].partition('#')[2] or f'result-{i}',
            return_order=i, query_id=row['query_id'], title=row['title'], url=row['url'],
            decision=row['decision'], exclusion_reason=row['exclusion_reason'],
            study_id=row['study_id'], access_status_at_return=row['access_status'], notes=row['notes']))
    data = dict(record_format='search_return_metadata_v1',
        note='Actual returned titles, URLs, query strings, IDs and decisions retained. Full abstracts/article text and long search excerpts omitted. Signed public-search URL parameters redacted where present. This is not a verbatim engine-response archive.',
        queries=list(queries.values()), results=results)
    if original_queries:
        data['original_query_specification'] = original_queries
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
print(f'Preserved search-return metadata in {len(groups)-1} files; KR metadata file left intact.')

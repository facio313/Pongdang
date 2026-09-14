import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codeReviewText, collectCodeReferences, displayCodeName } from '../src/codeReference.ts';

const dataset = {
  key: 'metrics', title: '측정 자료', source: '공식 제공처',
  columns: [
    { key: 'id', label: 'ID' }, { key: 'name', label: '항목' },
    { key: 'unit', label: '단위' }, { key: 'source', label: '출처' },
    { key: 'value', label: '값' },
  ],
};

test('code reference keeps field scopes, raw values, counts and bounded row examples', () => {
  const rows = [1, 2, 3, 4].map((id) => ({ id, name: 'air_temperature_c', unit: 'degC', source: 'KMA', value: 0 }));
  const original = structuredClone(rows);
  const entries = collectCodeReferences(dataset, rows);
  assert.equal(entries.length, 3);
  const metric = entries.find((entry) => entry.field === 'name');
  assert.deepEqual(metric, {
    field: 'name', fieldLabel: '항목', raw: 'air_temperature_c', label: '기온', resolved: true,
    count: 4, rowIds: ['1', '2', '3'], origins: ['기상청 (KMA)'],
  });
  assert.deepEqual(rows, original);
});

test('unknown codes retain traceable context, with no inferred meaning or payload leakage', () => {
  const rows = [{ id: 7, name: 'toString', unit: 'toString', source: 'future-provider', value: { secret: 'not-a-code' }, raw_payload: 'private' }];
  const entries = collectCodeReferences(dataset, rows);
  assert.equal(entries.length, 3);
  assert.ok(entries.every((entry) => !entry.resolved && entry.label === '설명 확인 필요'));
  assert.deepEqual(entries.map((entry) => entry.field).sort(), ['name', 'source', 'unit']);
  const exported = codeReviewText(dataset, entries);
  assert.ok(exported.includes('future-provider'));
  assert.ok(exported.includes('"example_row_ids":["7"]'));
  assert.ok(!exported.includes('private') && !exported.includes('not-a-code'));
});

test('code reference ignores noncode fields and empty or structured values, preserving zero codes', () => {
  const entries = collectCodeReferences(dataset, [
    { id: 1, name: '', unit: null, source: {}, value: 'future-code', task_name: 'not-allowlisted' },
    { id: 2, name: undefined, unit: [], source: '', value: 7 },
    { id: 3, name: 0, unit: '', source: '' },
  ]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].raw, '0');
  assert.deepEqual(entries[0].origins, []);
  assert.equal(displayCodeName('metrics', 'name', ''), undefined);
  assert.equal(displayCodeName('metrics', 'value', 'unknown'), undefined);
});

test('a provider error with an unverified service meaning stays in the review list', () => {
  const jobs = { key: 'collection-jobs', title: 'API 갱신 작업', source: '공식 API', columns: [{ key: 'id', label: 'ID' }, { key: 'task_name', label: '작업' }, { key: 'last_error', label: '오류 코드' }] };
  const entries = collectCodeReferences(jobs, [{ id: 1, task_name: 'khoa_roms', last_error: 'PROVIDER_10' }]);
  assert.equal(entries[0].resolved, false);
  assert.ok(entries[0].label.includes('해당 서비스 명세 확인 필요'));
  assert.equal(entries[0].raw, 'PROVIDER_10');
  assert.equal(entries[0].guidance.url, 'https://www.data.go.kr/data/15142227/openapi.do');
  assert.ok(entries[0].guidance.text.includes('요청 파라미터 값·형식 오류'));
  const mixed = collectCodeReferences(jobs, [
    { id: 1, task_name: 'khoa_roms', last_error: 'PROVIDER_10' },
    { id: 2, task_name: 'another_service', last_error: 'PROVIDER_10' },
  ]).filter((entry) => entry.field === 'last_error');
  assert.equal(mixed.length, 2);
  assert.equal(mixed.filter((entry) => entry.guidance).length, 1);
  assert.deepEqual(mixed.find((entry) => entry.guidance).rowIds, ['1']);
});

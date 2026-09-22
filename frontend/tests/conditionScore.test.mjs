import assert from 'node:assert/strict';
import test from 'node:test';
import { conditionScore, conditionScoreText, scoreCoverageText, tideTimeLabel, conditionScoreExpiry, conditionComponentsText, conditionPath, conditionTargetInRange, conditionRetentionText, metricText, evidenceText, evidenceSummary, safetyStatusText, dataStatusText, productPlaces } from '../src/productData.ts';

const index = {
  label: '활동 조건 참고 점수', status: 'partial', score: 76.3,
  coverage: 0.75, available_components: 3, total_components: 4,
  reason_codes: ['activity_support_unknown'],
  components: [
    { metric: 'water_temperature', label: '수온', value: 21.3, unit: '°C', score: 62, weight: 1, reason_codes: [] },
    { metric: 'wind_speed', label: '풍속', value: null, unit: 'm/s', score: null, weight: 1, reason_codes: ['measurement_not_collected'] },
  ],
};

test('provider-classified water places retain actual IDs and empty regions without requiring raw beach type', () => {
  const place = { id: 71, name: '경포', place_kind: 'beach', region: '', address: '강원특별자치도 강릉시 창해로', lat: 37.8, lng: 128.9 };
  const page = productPlaces([place]);
  assert.equal(page.rows[0].type, 'beach');
  assert.equal(page.rows[0].id, 71);
  assert.equal(page.rows[0].name, '경포');
  assert.equal(page.rows[0].region, '');
  assert.equal(page.rows[0].catalog_verification, null);
  assert.equal(page.total, 1);
});

test('display uses the new computed condition index while missing legacy safety scores stay unknown', () => {
  assert.equal(conditionScore({ environment_score: null, condition_score: index }), 76.3);
  assert.equal(conditionScore({ environment_score: 99 }), null);
  assert.equal(conditionScore(undefined), null);
  assert.equal(conditionScore({ condition_score: { ...index, score: 0, status: 'evaluated' } }), 0);
  for (const score of [null, undefined, NaN, Infinity, -1, 101, '85'])
    assert.equal(conditionScore({ condition_score: { ...index, score } }), null);
  for (const status of ['blocked', 'unavailable'])
    assert.equal(conditionScore({ condition_score: { ...index, status } }), null);
});

test('partial score includes actual coverage, missing fields and its non-safety meaning', () => {
  const text = conditionScoreText({ condition_score: index });
  assert.match(text, /76.3점/);
  assert.match(text, /75% \(3\/4개\)/);
  assert.match(text, /일부 근거로 계산/);
  assert.match(text, /안전 판정이 아닙니다/);
  assert.match(text, /활동 지원 여부 미확인/);
  const components = conditionComponentsText({ condition_score: index });
  assert.match(components, /수온 21.3°C → 62점/);
  assert.match(components, /풍속 – → – · 아직 수집된 측정값 없음/);
  assert.match(conditionScoreText({ condition_score: { ...index, status: 'blocked', score: null } }), /공식 제한 또는 활동 미지원으로 계산 보류/);
});

test('the score-adjacent coverage label exposes partial evidence without changing the score', () => {
  const data = { condition_score: { ...index, available_components: 2, coverage: 0.5 } };
  assert.equal(scoreCoverageText(data), '부분 점수 · 근거 2/4 (50%)');
  assert.equal(conditionScore(data), 76.3);
  assert.equal(scoreCoverageText({ condition_score: {
    ...index, status: 'evaluated', available_components: 4, coverage: 1,
  } }), '근거 4/4 (100%)');
  assert.equal(scoreCoverageText(undefined), '근거 정보 없음');
  assert.equal(scoreCoverageText({ condition_score: { ...index, available_components: undefined } }), '부분 점수 · 근거 정보 없음');
});

test('tide times retain their actual KST date across midnight and year boundaries', () => {
  assert.equal(tideTimeLabel('2026-09-20T14:30:00Z'), '9/20 23:30 KST');
  assert.equal(tideTimeLabel('2026-09-20T16:30:00Z'), '9/21 01:30 KST');
  assert.equal(tideTimeLabel('2026-09-21T00:00:00+09:00'), '9/21 00:00 KST');
  assert.equal(tideTimeLabel('2026-12-31T15:00:00Z'), '1/1 00:00 KST');
  for (const value of [undefined, null, '', 'invalid-date'])
    assert.equal(tideTimeLabel(value), '–');
});

test('retained snapshots disclose their original time rather than a later requested target', () => {
  const data = { retained: true, at: '2026-09-22T03:00:00Z', retained_at: '2026-09-21T00:00:00Z' };
  assert.equal(conditionRetentionText(data), '이전 결과 · 9/21 09:00 KST 기준 · 새 자료 대기');
  assert.equal(conditionRetentionText({ ...data, projection: { computed_at: '2026-09-21T00:05:00Z' } }),
    '이전 결과 · 9/21 09:05 KST 기준 · 새 자료 대기');
});

test('the collapsed evidence line keeps coverage and never turns a missing score into a number', () => {
  const data = { mode: 'observation', at: '2026-09-19T13:57:00Z', condition_score: index };
  const line = evidenceSummary(data);
  assert.match(line, /참고 점수 76.3/);
  // 브라우저 테스트가 .hm-why-note 안에서 이 문자열을 찾습니다.
  assert.match(line, /근거 확보 3\/4/);
  assert.match(line, /관측 22:57 KST/);
  // 접힌 줄이 짧아졌다고 없는 값이 0 이나 판정으로 바뀌지 않습니다.
  assert.match(evidenceSummary({ ...data, condition_score: { ...index, score: null } }), /참고 점수 –/);
  assert.match(evidenceSummary({ ...data, condition_score: { ...index, status: 'blocked', score: null } }), /계산 보류/);
  assert.match(evidenceSummary({ ...data, mode: 'forecast' }), /예보 22:57 KST/);
  assert.equal(evidenceSummary(undefined), '근거 확보 자료를 읽지 못했습니다.');
});

test('server status enums reach the screen as sentences, and unknown never reads as fine', () => {
  assert.match(safetyStatusText({ safety_status: 'unknown' }), /안전하다는 뜻이 아닙니다/);
  assert.match(safetyStatusText(undefined), /unknown/);
  assert.match(safetyStatusText({ safety_status: 'restricted' }), /공식 제한/);
  assert.match(safetyStatusText({ safety_status: 'caution' }), /주의 사항/);
  // 정상 상태는 덧붙일 말이 없습니다. 예전에는 문단이 「available」로 시작했습니다.
  assert.equal(dataStatusText('available'), '');
  assert.equal(dataStatusText(undefined), '');
  assert.match(dataStatusText('no_forecast_data'), /연결된 예보 자료 없음/);
  assert.match(dataStatusText('outside_forecast_horizon'), /예보 지원 기간 밖/);
  assert.equal(dataStatusText('no_data'), '자료 없음');
  assert.equal(dataStatusText('partial'), '일부 자료');
  assert.equal(dataStatusText('unavailable'), '제공 불가');
  assert.equal(dataStatusText('evaluated'), '평가 완료');
  // 모르는 코드를 유리한 상태로 바꾸지 않고 코드를 남깁니다.
  assert.match(dataStatusText('some_new_code'), /자료 상태 some_new_code/);
});

test('date scores request selected KST forecast rather than current observations', () => {
  const path = conditionPath(42, 'surf', '2026-09-17T12:00:00+09:00');
  const params = new URLSearchParams(path.split('?')[1]);
  assert.equal(params.get('spot_id'), '42');
  assert.equal(params.get('activity'), 'surf');
  assert.equal(params.get('mode'), 'forecast');
  assert.equal(params.get('at'), '2026-09-17T12:00:00+09:00');
  const now = Date.parse('2026-09-17T12:00:00+09:00');
  assert.equal(conditionTargetInRange(undefined, now), false);
  assert.equal(conditionTargetInRange('not-a-date', now), false);
  assert.equal(conditionTargetInRange('2026-08-01T12:00:00+09:00', now), false);
  assert.equal(conditionTargetInRange('2026-09-18T12:00:00+09:00', now), true);
});

test('nearby context scores show the actual context source and server-evaluated measurement', () => {
  const data = {
    mode: 'forecast', at: '2026-09-17T03:00:00Z', metrics: [],
    context_metrics: [{ station_name: '공식 관측소', relation: 'nearby_station_context',
      evidence: [{ provider: 'khoa_beach', observed_at: '2026-09-17T03:00:00Z' }] }],
    condition_score: { ...index, components: [{ ...index.components[0], status: 'evaluated' }] },
  };
  assert.equal(metricText(data, 'water_temperature'), '21.3°C');
  assert.match(evidenceText(data), /주변 관측소 참고 공식 관측소/);
  assert.doesNotMatch(evidenceText(data), /근거 없음/);
  assert.equal(metricText({ ...data, condition_score: { ...index, components: [{ ...index.components[0], status: 'unavailable' }] } }, 'water_temperature'), '–');
});

test('current score expiry follows its evaluated station evidence, excluding unused stale fields', () => {
  const data = {
    metrics: [{ name: 'air_temperature', station_id: 1, evidence: [{ valid_until: '2026-09-16T01:00:00Z' }] }],
    context_metrics: [{ name: 'water_temperature', station_id: 2, evidence: [{ valid_until: '2026-09-17T04:00:00Z' }] }],
    condition_score: { ...index, components: [{ ...index.components[0], station_id: 2, status: 'evaluated' }] },
  };
  assert.equal(conditionScoreExpiry(data), Date.parse('2026-09-17T04:00:00Z'));
  assert.equal(conditionScoreExpiry(undefined), undefined);
  assert.equal(conditionScoreExpiry({ ...data, condition_score: { components: [] } }), undefined);
});

test('stored-score refresh hints do not replace evidence validity and pending states keep their explanation', () => {
  const refreshAfter = '2026-09-21T03:10:00Z';
  assert.equal(conditionScoreExpiry({ metrics: [], projection: { status: 'ready', refresh_after: refreshAfter } }), undefined);
  assert.equal(conditionScoreExpiry({ metrics: [], projection: { status: 'pending', refresh_after: refreshAfter } }), undefined);
  assert.equal(conditionScoreText({ condition_score: { ...index, score: null, status: 'unavailable', reason_codes: ['condition_projection_pending'] } }), '새 데이터를 반영해 점수를 갱신하고 있습니다.');
  assert.equal(conditionScoreText({ condition_score: { ...index, score: null, status: 'unavailable', reason_codes: ['condition_projection_unavailable_for_target'] } }), '선택한 시간에 저장된 점수가 없습니다.');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { retainConditionData, retainConditions } from '../src/retainConditionData.ts';

function condition(score = 80, names = ['air_temperature', 'wave_height']) {
  return {
    spot_id: 7, activity: 'swim', mode: 'observation', at: '2026-09-21T00:00:00Z',
    safety_status: 'unknown', support_status: 'unknown', metrics: [], reason_codes: [],
    condition_score: { score, status: score === null ? 'unavailable' : 'partial',
      components: names.map(metric => ({ metric, score: 50, status: 'evaluated', value: 23, unit: '°C' })),
      available_components: names.length, total_components: 4 },
  };
}

test('pending, missing and reduced evidence retain one coherent previous result', () => {
  const previous = condition();
  for (const next of [condition(null, []), condition(99, ['air_temperature']), condition(99, ['air_temperature', 'wind_speed'])]) {
    const kept = retainConditions(previous, next);
    assert.deepEqual(kept, { ...previous, retained: true });
    assert.equal(kept.at, previous.at);
    assert.equal(kept.condition_score, previous.condition_score);
  }
});

test('a lower or zero score with adequate evidence replaces the old score', () => {
  for (const score of [15, 0]) {
    const next = condition(score);
    assert.equal(retainConditions(condition(), next), next);
  }
});

test('restrictions and different places or activities are never hidden by retention', () => {
  const previous = condition();
  for (const changes of [{ safety_status: 'restricted' }, { support_status: 'unsupported' },
    { spot_id: 8 }, { activity: 'surf' }, { mode: 'forecast' }]) {
    const next = { ...condition(null, []), ...changes };
    assert.equal(retainConditions(previous, next), next);
  }
});

test('server-revoked evidence cannot be restored from detail, summary or recommendation cache', () => {
  const previous = condition();
  const revoked = { ...condition(null, []), projection: { status: 'pending', retention_allowed: false } };
  assert.equal(retainConditions(previous, revoked), revoked);
  const summary = { ...condition(null, []), retention_allowed: false };
  assert.equal(retainConditionData('water-index/conditions/summary?spot_ids=7',
    { rows: [previous] }, { rows: [summary] }).rows[0], summary);
  const recommendation = { choice: null, conditions: [revoked] };
  assert.equal(retainConditionData('water-index/recommendation?spot_id=7',
    { choice: { activity: 'swim', score: 80 }, conditions: [previous] }, recommendation), recommendation);
});

test('series keep missing targets and merge by target time, never by position', () => {
  const path = 'water-index/conditions/series?spot_id=7&targets=a,b';
  const first = { ...condition(), mode: 'forecast' };
  const second = { ...condition(60), mode: 'forecast', at: '2026-09-21T03:00:00Z' };
  const fresh = { ...second, condition_score: condition(20).condition_score };
  const result = retainConditionData(path, { rows: [first, second] }, { rows: [fresh] });
  assert.equal(result.rows.find(r => r.at === first.at).condition_score.score, 80);
  assert.equal(result.rows.find(r => r.at === second.at).condition_score.score, 20);
});

test('summary keeps unavailable places and respects newly blocked rows', () => {
  const path = 'water-index/conditions/summary?spot_ids=7';
  const previous = { rows: [condition()] };
  const missing = retainConditionData(path, previous, { rows: [], unavailable: [{ spot_id: 7, reason: 'pending' }] });
  assert.equal(missing.rows[0].condition_score.score, 80);
  const blocked = { ...condition(null, []), safety_status: 'restricted' };
  assert.equal(retainConditionData(path, previous, { rows: [blocked] }).rows[0], blocked);
});

test('recommendations survive incomplete updates but immediately accept restrictions', () => {
  const path = 'water-index/recommendation?spot_id=7';
  const previous = { choice: { activity: 'swim', score: 80 }, conditions: [condition()] };
  const incomplete = { choice: null, conditions: [condition(null, [])] };
  assert.equal(retainConditionData(path, previous, incomplete).choice.score, 80);
  const restricted = { choice: null, conditions: [{ ...condition(null, []), safety_status: 'restricted' }] };
  assert.equal(retainConditionData(path, previous, restricted), restricted);
});

test('failed reads preserve public conditions, never private or unrelated resources', () => {
  const previous = condition();
  assert.deepEqual(retainConditionData('water-index/conditions?spot_id=7', previous, undefined), { ...previous, retained: true });
  assert.equal(retainConditionData('travel/preferences', previous, undefined), undefined);
  assert.equal(retainConditionData('water-index/conditions?spot_id=7', undefined, undefined), undefined);
});

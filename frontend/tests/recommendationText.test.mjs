import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ALTERNATIVE_LABEL,
  TIDE_DISCLAIMER,
  activityHeadline,
  activityRecommendationDisplay,
  alternativeGroups,
  alternativeText,
  choiceReason,
  recommendationLookupWarning,
  rejectionReason,
  tideLine,
} from '../src/recommendationText.ts';

test('excluded activities never reappear as numeric recommendations while their source score stays intact', () => {
  const conditions = {
    support_status: 'supported',
    condition_score: { status: 'partial', score: 98.5 },
  };
  const ranked = { dropped: true, rules_applied: ['essential_measurement_missing'] };
  assert.deepEqual(activityRecommendationDisplay(conditions, ranked), {
    score: null, eligibility: '추천 제외 · 필수 근거 부족',
  });
  assert.equal(conditions.condition_score.score, 98.5);
  assert.deepEqual(activityRecommendationDisplay(conditions, {
    ...ranked, rules_applied: ['water_too_cold_for_immersion'],
  }), { score: null, eligibility: '추천 제외 · 수온 기준 미충족' });
  assert.deepEqual(activityRecommendationDisplay(conditions, {
    ...ranked, rules_applied: ['new_server_rule'],
  }), { score: null, eligibility: '추천 제외' });
});

test('unsupported and unavailable activities show their evidence state without inventing safety judgments', () => {
  const conditions = { support_status: 'unsupported', condition_score: { status: 'partial', score: 97 } };
  assert.deepEqual(activityRecommendationDisplay(conditions), { score: null, eligibility: '활동 미지원' });
  assert.equal(conditions.condition_score.score, 97);
  assert.deepEqual(activityRecommendationDisplay({ condition_score: { status: 'unavailable', score: null } }), {
    score: null, eligibility: '산정 불가 · 근거 부족',
  });
  assert.deepEqual(activityRecommendationDisplay({ condition_score: { status: 'blocked', score: null } }, {
    dropped: true, rules_applied: ['activity_blocked'],
  }), { score: null, eligibility: '산정 보류 · 공식 제한 또는 활동 미지원' });
  assert.deepEqual(activityRecommendationDisplay(undefined), { score: null });
});

test('tide demotion and partial coverage do not change an eligible activity score', () => {
  const conditions = { condition_score: { status: 'partial', score: 76.3 } };
  assert.deepEqual(activityRecommendationDisplay(conditions, {
    dropped: false, demoted: true, rules_applied: ['tide_phase_product_rule'],
  }), { score: 76.3 });
  assert.deepEqual(activityRecommendationDisplay({ condition_score: { status: 'evaluated', score: 0 } }, {
    dropped: false, rules_applied: [],
  }), { score: 0 });
});

const reason = (code, extra = {}) => ({
  code, activity: null, rival: null, metric: null, label: null, value: null,
  unit: null, threshold: null, station_name: null, relation: null,
  distance_km: null, minutes: null, ...extra,
});

const recommendation = (changes = {}) => ({
  contract_version: 'water-recommendation.v1',
  model_id: 'pongdang-activity-recommendation', model_version: '1.0.0',
  scientific_validation: 'not_evaluated',
  spot_id: 1, place_name: '소프트웨어 고정값', place_kind: 'beach',
  at: '2026-01-02T00:00:00+00:00', as_of: '2026-01-02T00:00:00+00:00',
  mode: 'observation',
  choice: { activity: 'swim', score: 82, status: 'evaluated' },
  ranked: [], reasons: [], tide: null, alternatives: [],
  rules: [], limitations: [], reason_codes: [],
  ...changes,
});

const tide = (changes = {}) => ({
  status: 'available', phase: 'near_high',
  minutes_to_high: 40, minutes_to_low: 380,
  minutes_since_high: null, minutes_since_low: null,
  high_at: null, low_at: null, height: 1.2, unit: 'm',
  station_name: '소프트웨어 고정값', spatial_relation: 'nearby_station_context',
  distance_km: 2, reason_codes: ['events_are_not_safe_activity_windows'],
  ...changes,
});

test('a failed tide lookup is explicit without erasing the available score', () => {
  const rec = recommendation({ reasons: [reason('tide_lookup_unavailable')] });
  assert.equal(rec.choice.score, 82);
  assert.deepEqual(tideLine(rec), {
    code: 'tide_lookup_unavailable',
    text: '간조·만조 조회에 실패해 물때 기준은 적용하지 않았습니다. 표시된 점수는 안전 판정이 아닙니다.',
  });
  assert.equal(tideLine(recommendation()), null);
});

test('optional context failures are disclosed without claiming the scores failed', () => {
  for (const code of ['place_lookup_unavailable', 'alternatives_lookup_unavailable',
    'alternative_conditions_unavailable', 'recommendation_context_unavailable']) {
    const rec = recommendation({ reason_codes: [code] });
    assert.equal(recommendationLookupWarning(rec),
      '추천 보조 자료 일부를 불러오지 못했습니다. 확인된 활동 점수와 지표를 표시합니다.');
    assert.equal(rec.choice.score, 82);
    assert.equal(recommendationLookupWarning(recommendation({ reasons: [reason(code)] })),
      recommendationLookupWarning(rec));
  }
  assert.equal(recommendationLookupWarning(recommendation()), null);
});

test('a chosen activity with no server reason gets no invented sentence', () => {
  // 모르는 것을 「좋아서」로 바꾸면 근거가 아니라 넘겨짚기가 됩니다.
  assert.equal(choiceReason(recommendation()), null);
  assert.equal(choiceReason(undefined), null);
  assert.equal(rejectionReason(recommendation()), null);
  assert.equal(tideLine(recommendation()), null);
});

test('the waves say which of swimming and surfing today is', () => {
  const surf = choiceReason(recommendation({
    choice: { activity: 'surf', score: 88, status: 'evaluated' },
    reasons: [
      reason('wave_favours_surf', { activity: 'surf', rival: 'swim', label: '파고', value: 1.1, unit: 'm', threshold: 20 }),
      reason('wave_period_context', { activity: 'surf', label: '파주기', value: 9.2, unit: 's' }),
    ],
  }));
  assert.equal(surf.code, 'wave_favours_surf');
  assert.equal(surf.text, '파고 1.1m · 파주기 9.2s — 오늘은 수영보다 서핑에 맞는 파도예요');

  const swim = choiceReason(recommendation({
    reasons: [reason('wave_favours_swim', { activity: 'swim', rival: 'surf', label: '파고', value: 0.2, unit: 'm' })],
  }));
  assert.match(swim.text, /^파고 0\.2m — 파도가 잔잔해서 바다 수영에 맞아요$/);
});

test('a higher scoring rest is named as the runner-up, not hidden', () => {
  const line = choiceReason(recommendation({
    reasons: [reason('water_activity_preferred', { activity: 'swim', rival: 'relax', value: 82, threshold: 96.7 })],
  }));
  assert.match(line.text, /휴식 점수가 더 높지만/);
  assert.match(line.text, /수영을 먼저 권해요$/);
});

test('cold water is the reason the sea is out, with the threshold it used', () => {
  const line = rejectionReason(recommendation({
    choice: null,
    reasons: [
      reason('water_too_cold_for_immersion', { activity: 'swim', label: '수온', value: 12, unit: '°C', threshold: 18 }),
      reason('air_below_beach_preference', { activity: 'swim', label: '기온', value: 9, unit: '°C', threshold: 21 }),
    ],
  }));
  assert.equal(line.text, '수온 12°C · 기온 9°C — 바다에 들어가기에는 낮아요(수온 18°C 아래)');
});

test('a missing measurement reads as unjudged, never as bad conditions', () => {
  const line = rejectionReason(recommendation({
    reasons: [
      reason('essential_measurement_missing', { activity: 'rafting', metric: 'river_level' }),
      reason('essential_measurement_missing', { activity: 'onsen', metric: 'bath_water_temperature' }),
    ],
  }));
  // 빠진 지표가 아니라 빠진 **활동**이 먼저 옵니다 -- 사용자가 궁금한 것은
  // «왜 온천이 아닌가» 이기 때문입니다.
  assert.match(line.text, /^래프팅 · 온천은 이곳의 하천 수위 · 시설 욕조 수온 자료가 없어/);
  assert.match(line.text, /조건이 나쁜 것과 다릅니다$/);
});

test('every tide sentence carries the disclaimer, in both directions', () => {
  const rest = { activity: 'relax', score: 71, status: 'evaluated' };
  const ahead = tideLine(recommendation({
    choice: rest,
    tide: tide(),
    reasons: [reason('tide_phase_product_rule', { activity: 'swim', minutes: 40, threshold: 60 })],
  }));
  assert.match(ahead.text, /^지금은 만조 40분 전 — /);
  assert.ok(ahead.text.endsWith(TIDE_DISCLAIMER));

  const passed = tideLine(recommendation({
    choice: rest,
    tide: tide({ phase: 'near_low', minutes_since_low: 20 }),
    reasons: [reason('tide_phase_product_rule', { activity: 'swim', minutes: -20, threshold: 60 })],
  }));
  assert.match(passed.text, /^지금은 간조 지난 지 20분 — /);
  assert.ok(passed.text.endsWith(TIDE_DISCLAIMER));

  // 물때로 미뤘는데도 바다가 그대로 뽑히면(대신 올릴 활동이 없는 날) 「바다
  // 대신」이라고 말하지 않습니다. 바로 위에서 수영을 권해 놓고 아래에서
  // 말리는 문장이 되기 때문입니다.
  const stillSea = tideLine(recommendation({
    choice: { activity: 'swim', score: 93.8, status: 'evaluated' },
    tide: tide(),
    reasons: [reason('tide_phase_product_rule', { activity: 'swim', minutes: 40, threshold: 60 })],
  }));
  assert.match(stillSea.text, /^지금은 만조 40분 전이에요\. 물때를 보고 시간을 고르세요\./);
  assert.ok(!stillSea.text.includes('바다 대신'));
  assert.ok(stillSea.text.endsWith(TIDE_DISCLAIMER));

  const rising = tideLine(recommendation({ tide: tide({ phase: 'rising' }) }));
  assert.match(rising.text, /^물이 드는 중이에요\. /);
  assert.ok(rising.text.endsWith(TIDE_DISCLAIMER));
});

test('alternatives are grouped as places to go, never as a mood', () => {
  const rec = recommendation({
    alternatives: [
      { kind: 'onsen', spot_id: 7, name: '테스트 온천', distance_km: 12.34, address: null, region: null, best_activity: null, score: null },
      { kind: 'meal', spot_id: 8, name: '테스트 카페', distance_km: null, address: null, region: null, best_activity: null, score: null },
      { kind: 'valley', spot_id: 9, name: '테스트 계곡', distance_km: 8, address: null, region: null, best_activity: 'swim', score: 71 },
    ],
  });
  const groups = alternativeGroups(rec);
  assert.deepEqual(groups.map((group) => group.kind), ['onsen', 'meal', 'valley']);
  assert.equal(groups[0].label, ALTERNATIVE_LABEL.onsen);
  assert.equal(alternativeText(rec.alternatives[0]), '테스트 온천 · 12.3km');
  // 거리가 없으면 거리 칸을 지어내지 않습니다.
  assert.equal(alternativeText(rec.alternatives[1]), '테스트 카페');
  assert.equal(alternativeText(rec.alternatives[2]), '테스트 계곡 · 8.0km · 수영 71점');
  assert.deepEqual(alternativeGroups(undefined), []);
});

test('resting is named as a day out of the water, not as sitting by it', () => {
  assert.equal(activityHeadline('relax'), '물에 들어가지 않는 하루');
  assert.equal(activityHeadline('swim'), '수영');
  assert.equal(activityHeadline('surf'), '서핑');
});

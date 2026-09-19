import assert from 'node:assert/strict';
import test from 'node:test';
import { scoreTitle, verdictOf, limitingFactor, strongFactor, scoreReason, componentBars } from '../src/scoreMeaning.ts';

const component = (metric, label, value, unit, score, extra = {}) => ({
  metric, label, value, unit, score, weight: 1,
  status: score === null ? 'unavailable' : 'evaluated',
  reason_codes: [], criterion: '', ...extra,
});

const conditions = (components) => ({
  condition_score: {
    label: '활동 조건 참고 점수', status: 'evaluated', score: 70,
    coverage: 1, available_components: components.length, total_components: components.length,
    model_id: 'pongdang-activity-conditions', model_version: '1.0.0',
    methodology: '', sources: [], reason_codes: [], components,
  },
});

test('the score title always names the activity it belongs to', () => {
  assert.equal(scoreTitle('swim'), '수영 적합도');
  assert.equal(scoreTitle('mudflat'), '갯벌 적합도');
  assert.equal(scoreTitle('onsen'), '온천 적합도');
});

test('every activity and grade pair produces a verdict, and an unscored one produces none', () => {
  const activities = ['swim', 'surf', 'relax', 'mudflat', 'onsen', 'rafting'];
  const gradeKeys = ['excellent', 'good', 'fair', 'caution', 'poor'];
  for (const activity of activities)
    for (const gradeKey of gradeKeys) {
      const verdict = verdictOf(activity, gradeKey);
      assert.equal(typeof verdict, 'string', `${activity}/${gradeKey}`);
      // 동사와 꼬리를 공백 없이 잇습니다. 「수영하기에 좋은」·「쉬기에는 아쉬운」.
      assert.match(verdict, /기에(는)? .+ 조건이에요$/, verdict);
    }
  assert.equal(verdictOf('swim', 'good'), '수영하기에 좋은 조건이에요');
  assert.equal(verdictOf('mudflat', 'poor'), '갯벌에 나가기에는 권하지 않는 조건이에요');
  // 값이 없을 때 문장을 지어내면 「모름」이 「괜찮음」으로 바뀝니다.
  assert.equal(verdictOf('swim', 'unscored'), null);
});

test('the limiting factor is the lowest scored component and names its measured value', () => {
  const data = conditions([
    component('water_temperature', '수온', 26.4, '°C', 92),
    component('wave_height', '파고', 1.4, 'm', 31),
    component('wind_speed', '풍속', 4.2, 'm/s', 78),
  ]);
  const factor = limitingFactor(data);
  assert.equal(factor.metric, 'wave_height');
  assert.equal(factor.score, 31);
  assert.equal(factor.valueText, '1.4m');
  assert.match(factor.text, /^파고 1\.4m — /);
});

test('a tie keeps the order the server sent, since that is the activity\'s own condition order', () => {
  const data = conditions([
    component('water_temperature', '수온', 20, '°C', 40),
    component('wind_speed', '풍속', 9, 'm/s', 40),
  ]);
  assert.equal(limitingFactor(data).metric, 'water_temperature');
  assert.equal(strongFactor(data).metric, 'water_temperature');
});

test('components without a score are never candidates, so missing evidence cannot read as bad conditions', () => {
  const data = conditions([
    component('water_temperature', '수온', 24, '°C', 85),
    component('wind_speed', '풍속', null, 'm/s', null, { reason_codes: ['measurement_not_collected'] }),
  ]);
  // 풍속은 점수가 없을 뿐 0점이 아닙니다.
  assert.equal(limitingFactor(data), null);
  assert.equal(strongFactor(data).metric, 'water_temperature');
});

test('nothing scored at all leaves both factors empty rather than inventing one', () => {
  const data = conditions([
    component('wind_speed', '풍속', null, 'm/s', null, { reason_codes: ['measurement_not_collected'] }),
  ]);
  assert.equal(limitingFactor(data), null);
  assert.equal(strongFactor(data), null);
  assert.equal(limitingFactor(undefined), null);
  assert.equal(strongFactor({}), null);
});

test('when every component is already comfortable there is nothing to blame, so the strength is told instead', () => {
  const data = conditions([
    component('water_temperature', '수온', 26.4, '°C', 88),
    component('air_temperature', '기온', 27, '°C', 95),
  ]);
  assert.equal(limitingFactor(data), null);
  assert.match(scoreReason(data).text, /^기온 27°C — 오늘 가장 좋은 조건/);
});

test('the reason line falls back to missing evidence, never to a comfortable-sounding sentence', () => {
  assert.equal(scoreReason(undefined).text, '근거가 부족해 점수를 내지 못했어요');
  const blocked = conditions([
    component('river_level', '하천 수위', null, 'm', null, { reason_codes: ['local_operating_range_required'] }),
  ]);
  assert.equal(scoreReason(blocked).text, '근거가 부족해 점수를 내지 못했어요');
});

test('a low score is reported as the limiting factor rather than the strength', () => {
  const data = conditions([
    component('water_temperature', '수온', 14, '°C', 12),
    component('air_temperature', '기온', 27, '°C', 95),
  ]);
  assert.match(scoreReason(data).text, /^수온 14°C — 이 조건이 점수를 가장 많이 낮췄어요$/);
});

test('component bars keep unscored rows with their reason, so the card cannot claim it shows everything', () => {
  const data = conditions([
    component('water_temperature', '수온', 21.3, '°C', 62),
    component('wind_speed', '풍속', null, 'm/s', null, { reason_codes: ['measurement_not_collected'] }),
    component('river_flow', '유량', null, 'm³/s', null, { status: 'unconfigured', reason_codes: ['brand_new_code'] }),
  ]);
  const bars = componentBars(data);
  assert.equal(bars.length, 3);
  assert.deepEqual(
    bars.map((bar) => [bar.metric, bar.score, bar.evaluated]),
    [['water_temperature', 62, true], ['wind_speed', null, false], ['river_flow', null, false]],
  );
  assert.equal(bars[0].valueText, '21.3°C');
  assert.equal(bars[1].valueText, '–');
  assert.equal(bars[1].reasons, '아직 수집된 측정값 없음');
  // 사전에 없는 코드는 감추지 않고 원문 그대로 내보냅니다.
  assert.equal(bars[2].reasons, 'brand_new_code');
  assert.deepEqual(componentBars(undefined), []);
});

test('a zero score stays a real value in the bars and is not flattened into missing evidence', () => {
  const bars = componentBars(conditions([component('wave_height', '파고', 2.6, 'm', 0)]));
  assert.equal(bars[0].score, 0);
  assert.equal(bars[0].evaluated, true);
});

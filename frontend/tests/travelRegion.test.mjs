import assert from 'node:assert/strict';
import test from 'node:test';
import { getTravelRegion, setTravelRegion, travelRegionLabel, travelRegionOptions } from '../src/travelRegion.ts';

const catalog = { provinces: [{ code: 'gangwon', label: '강원특별자치도', districts: [
  { code: 'sokcho', label: '속초시' },
  { code: 'goseong', label: '고성군' },
  { code: 'donghae', label: '동해시' },
] }] };

test('travel districts include the province so ambiguous district names keep their Gangwon scope', () => {
  assert.deepEqual(travelRegionOptions(catalog), [
    { value: 'gangwon', label: '강원도 전체' },
    { value: 'gangwon sokcho', label: '속초시' },
    { value: 'gangwon goseong', label: '고성군' },
    { value: 'gangwon donghae', label: '동해시' },
  ]);
  assert.deepEqual(travelRegionOptions(), [{ value: 'gangwon', label: '강원도 전체' }]);
});

test('travel scope labels show canonical and saved human-readable regions without widening them', () => {
  for (const region of ['gangwon', 'Gangwon-do', '강원특별자치도']) {
    assert.equal(travelRegionLabel(region, catalog), '강원도 전체');
  }
  for (const region of ['gangwon sokcho', 'sokcho-si', '속초', '강원도 속초시']) {
    assert.equal(travelRegionLabel(region, catalog), '속초시');
  }
  assert.equal(travelRegionLabel('gangwon goseong'), '고성군');
  assert.equal(travelRegionLabel('고성', catalog), '고성');
  assert.equal(travelRegionLabel('donghae', catalog), 'donghae');
  assert.equal(travelRegionLabel('부산 해운대'), '부산 해운대');
  assert.equal(travelRegionLabel('51:820'), '지역 미확인');
  assert.equal(travelRegionLabel(undefined), '지역 미확인');
});

test('the shared travel region remains selected until a user or server response changes it', () => {
  assert.equal(getTravelRegion(), null);
  setTravelRegion('gangwon goseong');
  assert.equal(getTravelRegion(), 'gangwon goseong');
  setTravelRegion('속초시');
  assert.equal(getTravelRegion(), '속초시');
  setTravelRegion('gangwon');
  assert.equal(getTravelRegion(), 'gangwon');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { placeDetailsPath, placeDetailsStatusText, placeDetailsMissingText, placeExtraDetails, placeHomepageUrl, placeOperatingSchedule, operatingHoursNeedsSeasonCaveat } from '../src/placeDetails.ts';
import { distanceLabel, hasPlaceCoordinates, placeDistanceKm } from '../src/placeDistance.ts';

test('stored detail reads batch stable unique positive IDs and enforce the page bound', () => {
  assert.equal(placeDetailsPath([]), null);
  assert.equal(placeDetailsPath([NaN, Infinity, 0, -1, 3.5]), null);
  assert.equal(placeDetailsPath([8, 2, 8, 1]), 'place-details?spot_ids=1,2,8');
  const ids = placeDetailsPath(Array.from({ length: 250 }, (_, index) => index + 1)).split('=')[1].split(',');
  assert.equal(ids.length, 100);
  assert.equal(ids.at(-1), '100');
});

test('missing provider values, no collection, and failed collection remain distinct', () => {
  assert.equal(placeDetailsStatusText('available'), null);
  assert.match(placeDetailsStatusText('empty'), /제공하지/);
  assert.match(placeDetailsStatusText('pending'), /아직 수집하지/);
  assert.match(placeDetailsStatusText('failed'), /실패/);
  assert.equal(placeDetailsMissingText('available'), '정보 미제공');
  assert.equal(placeDetailsMissingText('empty'), '정보 미제공');
  assert.equal(placeDetailsMissingText('pending'), '미수집');
  assert.equal(placeDetailsMissingText('failed'), '수집 실패');
  assert.notEqual(placeDetailsStatusText('unmatched'), placeDetailsStatusText('unsupported'));
});

test('provider website links require an unauthenticated HTTPS URL', () => {
  assert.equal(placeHomepageUrl('https://example.test/place'), 'https://example.test/place');
  for (const value of [null, '', 'javascript:alert(1)', 'data:text/html,test', 'http://example.test', '//example.test', 'https://user:pass@example.test', '<a href="https://example.test">homepage</a>']) {
    assert.equal(placeHomepageUrl(value), undefined);
  }
});

test('published hours retain seasonal, holiday and older stored guidance during refresh failures', () => {
  const detail = {
    status: 'available', refresh_failed: true, refresh_pending: true,
    fetched_at: '2025-06-01T00:00:00Z',
    opening_hours: '09:00–18:00\n매표 마감 17:00',
    opening_period: '7월–8월', rest_days: '매주 월요일', details: [],
  };
  // 개장 기간이 먼저입니다. 「이용시간 상시 개방」이 혼자 앞에 서면 개장
  // 기간 밖의 해수욕장에서 그 한 줄이 「지금 가도 된다」로 읽힙니다.
  assert.deepEqual(placeOperatingSchedule(detail), [
    { label: '개장 기간', value: '7월–8월' },
    { label: '이용시간', value: '09:00–18:00\n매표 마감 17:00' },
    { label: '휴무일', value: '매주 월요일' },
  ]);
});

test('additional activity schedules preserve provider labels without duplicating hours or including unrelated info', () => {
  const detail = {
    opening_hours: '상시 개방', opening_period: null, rest_days: '연중무휴',
    details: [
      { section: 'info', label: '이용시간', value: '상시 개방' },
      { section: 'info', label: '래프팅 운영시간', value: '10:00, 14:00 / 사전 예약' },
      { section: 'info', label: '튜브 체험시간', value: '11:00–16:00' },
      { section: 'info', label: '이용요금', value: '10,000원' },
      { section: 'room', label: '입장시간', value: '15:00' },
      { section: 'info', label: '운영시간', value: '  ' },
    ],
  };
  assert.deepEqual(placeOperatingSchedule(detail), [
    { label: '이용시간', value: '상시 개방' },
    { label: '휴무일', value: '연중무휴' },
    { label: '래프팅 운영시간', value: '10:00, 14:00 / 사전 예약' },
    { label: '튜브 체험시간', value: '11:00–16:00' },
  ]);
});

test('missing schedules remain empty instead of acquiring generic opening times', () => {
  assert.deepEqual(placeOperatingSchedule(), []);
  assert.deepEqual(placeOperatingSchedule({ opening_hours: null, opening_period: '', rest_days: ' ', details: [] }), []);
});

test('extra details omit visitor information duplicates while preserving unique and conflicting provider guidance', () => {
  const entries = [
    { section: 'intro', key: 'usetime', label: '이용시간', value: ' 상시  개방 ' },
    { section: 'intro', key: 'parking', label: '주차시설', value: '가능' },
    { section: 'intro', key: 'infocenter', label: '문의및안내', value: '033-640-4920' },
    { section: 'info', key: 'info:1', label: '휴무일', value: '연중무휴' },
    { section: 'intro', key: 'usetimeleports', label: '이용시간', value: '09:00–18:00' },
    { section: 'info', key: 'info:2', label: '래프팅 운영시간', value: '상시 개방' },
    { section: 'room', key: '0:parking', label: '객실 · 주차시설', value: '가능' },
    { section: 'intro', key: 'heritage1', label: '세계문화유산유무', value: '0' },
    { section: 'common', key: 'addr1', label: '주소', value: '강원특별자치도 강릉시' },
    { section: 'info', key: 'info:3', label: '입장료', value: '무료' },
  ];
  const detail = { opening_hours: '상시 개방', parking: '가능', contact: '033-640-4920', rest_days: '연중무휴', details: entries };
  assert.deepEqual(placeExtraDetails(detail), entries.slice(4));
  assert.equal(detail.details.length, 10);
  assert.deepEqual(placeExtraDetails({ ...detail, contact: null }).filter(entry => entry.key === 'infocenter'), [entries[2]]);
  assert.deepEqual(placeExtraDetails(), []);
});

test('facility details disappear only when the same labeled value is included in the visible facility summary', () => {
  const entries = [
    { section: 'intro', key: 'restroom', label: '화장실', value: '가능' },
    { section: 'info', key: 'info:1', label: '샤워 시설', value: '유료' },
    { section: 'info', key: 'info:2', label: '탈의실', value: '가능' },
    { section: 'info', key: 'info:3', label: '샤워 시설', value: '무료' },
  ];
  assert.deepEqual(placeExtraDetails({ facilities: '화장실: 가능\n샤워 시설: 유료', details: entries }), entries.slice(2));
  assert.deepEqual(placeExtraDetails({ facilities: null, details: entries }), entries);
});

test('straight-line distances use coordinates including zero and never manufacture missing locations', () => {
  assert.equal(placeDistanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 0 }), 0);
  const oneDegree = placeDistanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
  assert.ok(Math.abs(oneDegree - 111.195) < 0.001);
  const dateline = placeDistanceKm({ lat: 0, lng: 179.9 }, { lat: 0, lng: -179.9 });
  assert.ok(Math.abs(dateline - 22.239) < 0.001);
  for (const point of [null, undefined, { lat: null, lng: 128 }, { lat: NaN, lng: 128 }, { lat: 91, lng: 128 }, { lat: 37, lng: -181 }]) {
    assert.equal(hasPlaceCoordinates(point), false);
    assert.equal(placeDistanceKm(point, { lat: 37.8, lng: 128.9 }), null);
  }
  assert.equal(distanceLabel(null), '–');
  assert.equal(distanceLabel(NaN), '–');
  assert.equal(distanceLabel(0), '0 m');
  assert.equal(distanceLabel(0.54), '540 m');
  assert.equal(distanceLabel(oneDegree), '111.2 km');
});

test('"상시 개방" operating hours are flagged as different from an opening season', () => {
  // 이용 정보에 「운영시간 상시 개방」만 서 있으면 10월 해수욕장에서 그 한 줄이
  // 「지금 가도 된다」로 읽힙니다. 두 필드는 다른 것을 말합니다.
  assert.ok(operatingHoursNeedsSeasonCaveat({ opening_hours: '상시 개방', opening_period: null }));
  assert.ok(operatingHoursNeedsSeasonCaveat({ opening_hours: '연중무휴', opening_period: '' }));
  // 개장 기간이 적혀 있으면 그 행 옆에서 뜻이 저절로 통합니다. 덧붙이지 않습니다.
  assert.ok(!operatingHoursNeedsSeasonCaveat({ opening_hours: '상시 개방', opening_period: '7.12~8.18' }));
  // 개장 기간도 「연중」이면 화면에 남는 말이 「언제나 열려 있다」뿐입니다.
  assert.ok(operatingHoursNeedsSeasonCaveat({ opening_hours: '상시 개방', opening_period: '연중' }));
  // 시각이 적힌 보통의 운영시간에는 아무 말도 붙이지 않습니다.
  assert.ok(!operatingHoursNeedsSeasonCaveat({ opening_hours: '09:00~18:00', opening_period: null }));
  assert.ok(!operatingHoursNeedsSeasonCaveat(undefined));
  // 목록에 없는 말은 추측하지 않습니다 -- 「하절기」가 상시라고 읽지 않습니다.
  assert.ok(!operatingHoursNeedsSeasonCaveat({ opening_hours: '하절기 개방', opening_period: null }));
});

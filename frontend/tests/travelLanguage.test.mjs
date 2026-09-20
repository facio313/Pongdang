import assert from 'node:assert/strict';
import test from 'node:test';
import { requestInLanguage } from '../src/travelLanguage.ts';

const request = Object.freeze({
  dates: ['2026-09-21'], region: 'gangwon', preferred_tags: ['조용한 휴식'],
  activity: 'relax', transport: 'driving', keyword_selection: [],
});

test('changing the catalogue language preserves the canonical Gangwon scope', () => {
  for (const locale of ['en', 'ja', 'zh-CN']) {
    const result = requestInLanguage(request, locale);
    assert.equal(result.locale, locale);
    assert.equal(result.region, 'gangwon');
    assert.deepEqual(result.preferred_tags, request.preferred_tags);
    assert.deepEqual(result.dates, request.dates);
  }
  assert.equal(request.region, 'gangwon');
  assert.equal(requestInLanguage(request, 'ko').region, 'gangwon');
});

test('changing the request language retains explicit regions, coordinates and selected place IDs', () => {
  const explicit = { ...request, locale: 'en', region: 'Gangneung',
    origin: { label: 'My origin', latitude: 37.8, longitude: 128.9 }, must_include: [23] };
  const result = requestInLanguage(explicit, 'ja');
  assert.deepEqual(result, { ...explicit, locale: 'ja' });
  assert.equal(explicit.locale, 'en');
});

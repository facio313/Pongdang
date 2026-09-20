import assert from 'node:assert/strict';
import test from 'node:test';
import { dateLocale, messages, t } from '../src/i18n.ts';
import { setTravelLanguage } from '../src/travelLanguage.ts';
import { WebcamPreviewError } from '../src/livecamPreviewApi.ts';

test('every translated message preserves its interpolation contract in all three languages', () => {
  const placeholders = value => [...new Set(value.match(/\{\w+\}/g) ?? [])].sort();
  for (const [source, translations] of Object.entries(messages)) {
    assert.equal(translations.length, 3, source);
    for (const translation of translations) {
      assert.ok(translation.trim(), source);
      assert.deepEqual(placeholders(translation), placeholders(source), source);
    }
  }
});

test('UI text switches languages while provider values and unknown copy remain exact', () => {
  const name = '강문해변 <original> {score}';
  assert.equal(t('{name} 대표 사진', { name }, 'en'), `Photo of ${name}`);
  assert.equal(t('{name} 대표 사진', { name }, 'zh-CN'), `${name}的代表照片`);
  assert.equal(t('{name} 대표 사진', { name }, 'ja'), `${name}の写真`);
  assert.equal(t(name, {}, 'en'), name);
  assert.equal(t('{name} 대표 사진', { name }, 'ko'), `${name} 대표 사진`);
  assert.equal(dateLocale('en'), 'en-GB');
  assert.equal(dateLocale('zh-CN'), 'zh-CN');
  assert.equal(dateLocale('ja'), 'ja-JP');
});

test('an existing structured retry error changes language without changing its retry duration', () => {
  const error = new WebcamPreviewError(['Windy 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.'], 90);
  assert.match(error.message, /약 2분/);
  try {
    setTravelLanguage('en');
    assert.doesNotMatch(error.localizedMessage(), /[가-힣]/);
    assert.match(error.localizedMessage(), /2/);
    setTravelLanguage('ja');
    assert.doesNotMatch(error.localizedMessage(), /[가-힣]/);
    assert.match(error.localizedMessage(), /2/);
    assert.equal(error.retrySeconds, 90);
  } finally {
    setTravelLanguage('ko');
  }
});

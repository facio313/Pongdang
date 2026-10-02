import assert from 'node:assert/strict';
import test from 'node:test';
import { hasFinalConsonant, josa, withJosa } from '../src/josa.ts';

test('a final consonant decides the particle', () => {
  // 활동 이름 여섯 개. 전부 받침으로 끝납니다.
  for (const word of ['수영', '서핑', '휴식', '갯벌', '온천', '래프팅'])
    assert.equal(josa(word, '이/가'), '이', word);
  assert.equal(josa('바다', '이/가'), '가');
  assert.equal(josa('분위기', '이/가'), '가');

  assert.equal(josa('장소 유형', '을/를'), '을');
  assert.equal(josa('동행자', '을/를'), '를');
  assert.equal(josa('교통수단', '을/를'), '을');

  assert.equal(josa('수온', '은/는'), '은');
  assert.equal(josa('파고', '은/는'), '는');

  assert.equal(josa('수온', '와/과'), '과');
  assert.equal(josa('파고', '와/과'), '와');
});

test('a word the helper cannot read gets no particle at all', () => {
  // 측정값은 기호로 끝나 받침을 판정할 수 없습니다. 어느 쪽을 골라도 절반은
  // 틀리므로 아무것도 붙이지 않습니다.
  for (const value of ['1.4m', '8m/s', '24°C', '', '   ', 'Gyeongpo', '海']) {
    assert.equal(josa(value, '이/가'), '', value);
    assert.equal(withJosa(value, '이/가'), value, value);
  }
  assert.equal(hasFinalConsonant('1.4m'), undefined);
  assert.equal(hasFinalConsonant(''), undefined);
});

test('a trailing digit follows how it is read aloud', () => {
  assert.equal(josa('3', '이/가'), '이'); // 삼
  assert.equal(josa('2', '이/가'), '가'); // 이
  assert.equal(josa('7', '을/를'), '을'); // 칠
  assert.equal(josa('9', '을/를'), '를'); // 구
});

test('an ㄹ ending takes 로 rather than 으로', () => {
  assert.equal(josa('서울', '으로/로'), '로');
  assert.equal(josa('바다', '으로/로'), '로');
  assert.equal(josa('지도', '으로/로'), '로');
  assert.equal(josa('수영장', '으로/로'), '으로');
});

test('withJosa builds the value a template interpolates', () => {
  assert.equal(withJosa('수영', '이/가'), '수영이');
  assert.equal(withJosa('바다', '이/가'), '바다가');
  assert.equal(withJosa('장소 유형', '을/를'), '장소 유형을');
  assert.equal(withJosa('분위기', '을/를'), '분위기를');
});

test('no screen string carries the unresolved bracket form', async () => {
  const { readdirSync, readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const brackets = /이\(가\)|가\(이\)|을\(를\)|를\(을\)|은\(는\)|는\(은\)|와\(과\)|과\(와\)/;
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      return entry.isDirectory() ? walk(path) : [path];
    });
  const offenders = walk(new URL('../src', import.meta.url).pathname)
    .filter((path) => /\.(ts|tsx)$/.test(path))
    // 헬퍼 자신은 그 괄호 형태를 「고치려는 대상」으로 주석에 적습니다.
    .filter((path) => !path.endsWith('/josa.ts'))
    .filter((path) => brackets.test(readFileSync(path, 'utf8')));
  assert.deepEqual(offenders, []);
});

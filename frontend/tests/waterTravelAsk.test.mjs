import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import ts from 'typescript';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('.') && context.parentURL?.includes('/src/') && !/\.[a-z]+$/.test(specifier)) {
      for (const extension of ['.ts', '.tsx']) {
        const candidate = new URL(specifier + extension, context.parentURL);
        if (existsSync(candidate)) return next(candidate.href, context);
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true };
    if (url.endsWith('.tsx')) return { format: 'module', source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText, shortCircuit: true };
    return next(url, context);
  },
});

const { kstDate } = await import('../src/productData.ts');
const {
  WATER_TRAVEL_PREMISE,
  askWaterTravel,
  waterTravelConditionPath,
  waterTravelUserMessage,
} = await import('../src/waterTravelAsk.ts');

test('recommend selections are a water-travel information request, not a free-form instruction', () => {
  const answers = waterTravelUserMessage({
    answers: ['물에 들어가고 싶어요', '친구랑 하루', '차량'],
  });
  assert.match(answers, new RegExp(WATER_TRAVEL_PREMISE));
  assert.match(answers, /답변: 물에 들어가고 싶어요\. 친구랑 하루\. 차량/);
  assert.doesNotMatch(answers, /이 조건으로 장소와 활동을 추천해 주세요/);
  const keywords = waterTravelUserMessage({ keywords: ['서핑', '온천'] });
  assert.match(keywords, /키워드: 서핑, 온천/);
  const both = waterTravelUserMessage({
    answers: ['물에 들어가고 싶어요'],
    keywords: ['서핑'],
  });
  assert.match(both, /답변: 물에 들어가고 싶어요/);
  assert.match(both, /키워드: 서핑/);
});

test('today reads collected observations and a later date uses the noon forecast window', () => {
  assert.equal(waterTravelConditionPath(), null);
  assert.match(waterTravelConditionPath(7, 'swim', kstDate()), /mode=observation/);
  const tomorrow = new Date(Date.now() + 86400000).toLocaleDateString('sv-SE', {
    timeZone: 'Asia/Seoul',
  });
  assert.match(waterTravelConditionPath(7, 'swim', tomorrow), /mode=forecast/);
});

test('recommend Luna asks send the form travel contract with the water-travel message', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, '/pongdang/api/data/ai/chat');
    const body = JSON.parse(init.body);
    assert.equal(body.travel.action, 'recommend');
    assert.equal(body.travel.request.activity, 'surf');
    assert.match(body.message, /전제: 퐁당의 물 여행 관련 정보를 찾습니다/);
    return Response.json({
      answer: '조회된 장소를 안내합니다.',
      fallback: true,
      travel_results: { recommendations: { recommendations: [] } },
    });
  });
  const result = await askWaterTravel('/pongdang/', {
    request: {
      dates: ['2026-09-16'],
      region: '강릉',
      preferred_tags: ['서핑'],
      activity: 'surf',
      transport: 'driving',
      day_trip: true,
    },
    answers: ['물에 들어가고 싶어요'],
    keywords: ['서핑'],
  });
  assert.equal(result.answer, '조회된 장소를 안내합니다.');
});

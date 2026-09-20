import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { AiRequestError, aiStatusText, ConversationRequest, displayTime, requestJson, safeInternalLink, safeSourceUrl } from '../src/aiApi.ts';

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
const { contextLink, featurePath, readRoute, featurePages } = await import('../src/featureRoutes.ts');
const { AiResponseView } = await import('../src/AiConciergePage.tsx');

const response = {
  request_id: 'request-fixture', status: 'completed', answer: '조회된 근거를 확인해 주세요.', clarification: null, fallback: false, provider: 'openai', model: 'gpt-5.6-luna',
  scope: { timezone: 'Asia/Seoul', as_of: '2026-01-01T00:00:00Z', queries: [] },
  candidates: [{ candidate_id: 'spot:17', spot_id: 17, name: '경포해변', region: '강릉', type: 'beach', lat: null, lng: null, catalog_source: '공개 장소 목록', catalog_verified_at: null, links: [{ label: '물때', href: '#tide?spot_id=17' }] }],
  facts: [{ fact_id: 'fact-1', text: '현재 유효한 수온 자료가 없습니다.', evidence_refs: ['snapshot:fixture'], feature: 'temperature', data_status: 'no_data', metadata: { observed_at: null, station_id: 4 } }], sources: [{ id: 'official', name: '공식 출처', url: 'https://www.khoa.go.kr/' }],
  warnings: ['입수 안전은 알 수 없습니다.'], limitations: ['자료 부족으로 추천을 보류합니다.'], features: ['temperature'], reason_codes: [], context: { spot_id: 17, activity: 'swim' }, sections: [],
};
test('safe destinations preserve base path and only real routes and known selectors', () => {
  const href = '#water-forecast?spot_id=17&activity=surf';
  assert.equal(safeInternalLink(href), href);
  assert.equal(new URL(href, 'https://example.test/pongdang/').pathname, '/pongdang/');
  for (const unsafe of ['https://evil.test', '//evil.test', 'javascript:alert(1)', '#unknown', '#data?sql=select', '#tide?spot_id=-1', '#tide?spot_id=1&spot_id=2', '#ai?system=admin', '#data\\evil']) assert.equal(safeInternalLink(unsafe), null);
  assert.equal(safeSourceUrl('javascript:alert(1)'), null);
  assert.equal(safeSourceUrl('https://user:secret@example.test'), null);
  assert.equal(safeSourceUrl('http://example.test'), null);
});
test('readiness is not a paid connectivity check, and failures are explicit', () => {
  assert.match(aiStatusText({ enabled: true, status: 'ready_to_try', reason: null, model: 'gpt-5.6-luna' }), /질문 전송 시 확인/);
  assert.match(aiStatusText({ enabled: false, status: 'unconfigured', reason: 'key_missing', model: null }), /준비 전/);
  assert.match(aiStatusText({ enabled: false, status: 'disabled', reason: 'disabled', model: null }), /비활성화/);
  assert.match(aiStatusText({ enabled: true, status: 'access_error', reason: 'unauthorized', model: null }), /접근 실패/);
});
test('local operator status is explicit while ordinary readiness messages stay unchanged', () => {
  const states = [
    { enabled: true, status: 'ready_to_try', reason: null, model: 'gpt-5.6-luna' },
    { enabled: false, status: 'unconfigured', reason: 'ai_not_configured', model: null },
    { enabled: false, status: 'disabled', reason: 'ai_disabled', model: null },
    { enabled: true, status: 'access_error', reason: 'unauthorized', model: null },
    { enabled: true, status: 'unknown', reason: null, model: null },
  ];
  for (const status of states) {
    const normal = aiStatusText(status);
    assert.doesNotMatch(normal, /로컬 테스트|임시 운영자/);
    assert.equal(aiStatusText({ ...status, auth_mode: 'local_operator' }), '로컬 테스트 · 이 컴퓨터의 임시 운영자 세션 · ' + normal);
  }
  assert.equal(aiStatusText(states[0]), 'AI 설정 준비됨 · 실제 OpenAI 연결은 질문 전송 시 확인합니다.');
});
test('POST keeps SSO same-origin and sends bounded conversational roles without client observations', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    assert.equal(url, '/pongdang/api/data/ai/chat');
    assert.equal(init.credentials, 'same-origin');
    assert.equal(init.method, 'POST');
    const body = JSON.parse(init.body);
    assert.equal(body.history.length, 8);
    assert.deepEqual(Object.keys(body.history[0]), ['role', 'content']);
    assert.deepEqual(body.context, { spot_id: 17, activity: 'surf' });
    assert.deepEqual(init.headers, { 'Content-Type': 'application/json' });
    assert.equal(init.cache, 'no-store');
    return Response.json(response);
  });
  const client = new ConversationRequest();
  const result = await client.send('/pongdang/', ' 내일 오후에는? ', Array.from({ length: 12 }, () => ({ role: 'user', content: '이전 질문', temperature: 99 })), { spot_id: 17, activity: 'surf' });
  assert.equal(result.candidates[0].spot_id, 17);
});
test('duplicate submission is blocked synchronously; cancellation ignores even a late success', async (t) => {
  let resolve;
  let count = 0;
  let signal;
  t.mock.method(globalThis, 'fetch', async (_url, init) => { count++; signal = init.signal; return new Promise((done) => { resolve = done; }); });
  const client = new ConversationRequest();
  const first = client.send('/', '질문', [], {});
  assert.equal(await client.send('/', '중복 질문', [], {}), null);
  assert.equal(count, 1);
  client.cancel();
  assert.equal(signal.aborted, true);
  resolve(Response.json(response));
  assert.equal(await first, null);
  assert.equal(client.controller, null);
});
test('new conversation can start while old request completes, with no context leak', async (t) => {
  const pending = [];
  t.mock.method(globalThis, 'fetch', async (_url, init) => new Promise((resolve) => pending.push({ resolve, body: JSON.parse(init.body) })));
  const client = new ConversationRequest();
  const old = client.send('/', '이전 질문', [{ role: 'user', content: '옛 대화' }], { spot_id: 17 });
  client.cancel();
  const next = client.send('/', '새 질문', [], {});
  pending[0].resolve(Response.json(response));
  assert.equal(await old, null);
  assert.deepEqual(pending[1].body.history, []);
  assert.deepEqual(pending[1].body.context, {});
  pending[1].resolve(Response.json({ ...response, request_id: 'new' }));
  assert.equal((await next).request_id, 'new');
});
test('HTTP auth/quota errors and malformed JSON never expose raw errors', async (t) => {
  for (const [status, code] of [[401, 'unauthenticated'], [403, 'forbidden'], [429, 'rate_limited'], [422, 'invalid_request'], [503, 'unavailable']]) {
    t.mock.method(globalThis, 'fetch', async () => new Response('private upstream text', { status }));
    await assert.rejects(requestJson('/', 'ai/status', new AbortController().signal), (error) => error instanceof AiRequestError && error.code === code && !error.message.includes('private upstream'));
  }
  t.mock.method(globalThis, 'fetch', async () => new Response('broken JSON'));
  await assert.rejects(requestJson('/', 'ai/status', new AbortController().signal), { code: 'invalid_response' });
});
test('known SSO configuration failures explain the server prerequisite without exposing details or requesting a key', async (t) => {
  for (const [detail, code, path] of [
    ['AUTH_NOT_CONFIGURED', 'auth_not_configured', 'ai/status'],
    ['SSO_ORIGINS_NOT_CONFIGURED', 'sso_origins_not_configured', 'ai/chat'],
  ]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ detail, internal_error: 'private upstream text' }, { status: 503 }));
    await assert.rejects(requestJson('/pongdang/', path, new AbortController().signal, path === 'ai/chat' ? { message: '질문', history: [], context: {} } : undefined), (error) => {
      assert.ok(error instanceof AiRequestError);
      assert.equal(error.code, code);
      assert.match(error.message, /SSO 로그인 연동/);
      assert.match(error.message, /설정되지 않아/);
      assert.match(error.message, /기존 데이터 조회 화면은 계속 이용할 수 있습니다/);
      assert.doesNotMatch(error.message, /private upstream|AUTH_NOT_CONFIGURED|SSO_ORIGINS_NOT_CONFIGURED|API|키|다시 시도/);
      return true;
    });
  }
});
test('only the known local session 401 asks to reopen the local session', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ detail: 'LOCAL_OPERATOR_SESSION_REQUIRED', private_error: 'private upstream text' }, { status: 401 }));
  await assert.rejects(requestJson('/pongdang/', 'ai/status', new AbortController().signal), (error) => {
    assert.ok(error instanceof AiRequestError);
    assert.equal(error.code, 'local_session_required');
    assert.equal(error.message, '로컬 테스트 세션이 없거나 만료됐습니다. 로컬 실행 명령으로 세션을 다시 열어 주세요.');
    assert.doesNotMatch(error.message, /private upstream|LOCAL_OPERATOR_SESSION_REQUIRED|API|키/);
    return true;
  });
  for (const payload of [null, [], { detail: { code: 'LOCAL_OPERATOR_SESSION_REQUIRED' } }, { detail: 'LOCAL_OPERATOR_SESSION_REQUIRED private upstream text' }, { detail: 'SSO_AUTHENTICATION_REQUIRED' }]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json(payload, { status: 401 }));
    await assert.rejects(requestJson('/', 'ai/status', new AbortController().signal), (error) => {
      assert.equal(error.code, 'unauthenticated');
      assert.equal(error.message, '로그인이 필요합니다. 기존 SSO 로그인을 확인한 뒤 다시 시도해 주세요.');
      return true;
    });
  }
  for (const [status, code] of [[403, 'forbidden'], [503, 'unavailable']]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ detail: 'LOCAL_OPERATOR_SESSION_REQUIRED' }, { status }));
    await assert.rejects(requestJson('/', 'ai/status', new AbortController().signal), { code });
  }
});
test('unexpected configuration-shaped error bodies remain generic and do not override HTTP auth failures', async (t) => {
  for (const payload of [
    null, [], { detail: { code: 'AUTH_NOT_CONFIGURED' } },
    { detail: 'AUTH_NOT_CONFIGURED private upstream text' },
    { detail: 'UNKNOWN_FAILURE private upstream text' },
  ]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json(payload, { status: 503 }));
    await assert.rejects(requestJson('/', 'ai/status', new AbortController().signal), (error) => {
      assert.equal(error.code, 'unavailable');
      assert.doesNotMatch(error.message, /private upstream|AUTH_NOT_CONFIGURED|UNKNOWN_FAILURE/);
      return true;
    });
  }
  for (const [status, code] of [[401, 'unauthenticated'], [403, 'forbidden']]) {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ detail: 'AUTH_NOT_CONFIGURED' }, { status }));
    await assert.rejects(requestJson('/', 'ai/status', new AbortController().signal), { code });
  }
});
test('real feature links resolve to bounded existing reads and preserve context', () => {
  assert.deepEqual(readRoute('#ai?spot_id=17&activity=surf'), { page: 'ai', spotId: 17, activity: 'surf', from: null, until: null });
  assert.equal(readRoute('#demo').page, 'data');
  assert.equal(readRoute('#collector').page, 'info');
  assert.equal(readRoute('#livecam').page, 'livecam');
  assert.equal(readRoute('#livecam-test').page, 'livecam');
  assert.equal(readRoute('#livecam-test?spot_id=17').spotId, 17);
  assert.equal(readRoute('#water-index-map?spot_id=17').spotId, 17);
  assert.equal(contextLink({ spot_id: 17, activity: 'surf' }), '#ai?spot_id=17&activity=surf');
  const timed = contextLink({spot_id: 17}, {from: '2026-01-01T00:00:00Z', until: '2026-01-02T00:00:00Z'});
  assert.equal(readRoute(timed).from, '2026-01-01T00:00:00Z');
  assert.equal(safeInternalLink(timed), timed);
  for (const feature of Object.keys(featurePages)) {
    const path = featurePath(feature, 17, 'surf', '2026-01-01T00:00:00Z', '2026-01-02T00:00:00Z');
    assert.ok(path);
    assert.doesNotMatch(path, /demo|collector/);
    assert.match(path, ['first-swim', 'favorites', 'travel-history'].includes(feature) ? /limit=100/ : /page_size=100/);
  }
  assert.equal(featurePath('water-forecast', undefined, 'swim', '', ''), null);
});
test('server final facts and source times render as escaped text with safe links', () => {
  const payload = structuredClone(response);
  payload.answer = '<script>unsafe()</script> ![image](https://evil.test/image)';
  payload.candidates[0].links.push({ label: 'unsafe link', href: 'javascript:alert(1)' });
  payload.sources.push({ id: 'unsafe', name: '<img src=x>', url: 'javascript:alert(1)' });
  const html = renderToStaticMarkup(createElement(AiResponseView, { response: payload }));
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script|<img|<iframe|javascript:/);
  assert.match(html, /href="#tide\?spot_id=17"/);
  assert.match(html, /자료 부족/);
  assert.match(html, /관측소 자료/);
  assert.match(html, /관측 시각/);
  assert.match(html, /기록 없음/);
  assert.match(html, /KST/);
  assert.match(html, /noopener noreferrer/);
  assert.match(html, /snapshot:fixture/);
});
test('fallback credits deterministic data, and stale facts are visibly distinguished', () => {
  const payload = structuredClone(response);
  payload.fallback = true;
  payload.provider = 'deterministic';
  payload.facts[0].data_status = 'stale';
  const html = renderToStaticMarkup(createElement(AiResponseView, { response: payload }));
  assert.match(html, /기존 자료 기반 대체 응답/);
  assert.match(html, /갱신 지연/);
  assert.doesNotMatch(html, /Luna · 서버 근거 검증 완료/);
  assert.equal(displayTime(null), '기록 없음');
  assert.equal(displayTime('bad date'), '기록 없음');
});

test('section references compose the response and cannot drop remaining caution facts or nested forecast inputs', () => {
  const payload = structuredClone(response);
  payload.sections = [{ title: '후보 비교', fact_ids: ['fact-1'], candidate_ids: ['spot:17'] }];
  payload.facts[0].metadata.inputs = [{ provider: '공식 예보 제공처', numeric_value: 0.4, unit: 'm', observed_at: '2026-01-02T03:00:00Z', issued_at: null, fetched_at: '2026-01-01T00:00:00Z', valid_until: '2026-01-02T06:00:00Z' }];
  payload.facts.push({ fact_id: 'mandatory', text: '공식 제한을 확인하지 못했습니다.', evidence_refs: [], feature: 'restriction', data_status: 'unknown', metadata: {} });
  const html = renderToStaticMarkup(createElement(AiResponseView, { response: payload }));
  assert.match(html, /후보 비교/);
  assert.match(html, /공식 제한을 확인하지 못했습니다/);
  assert.match(html, /공식 예보 제공처/);
  assert.match(html, /0.4/);
  assert.match(html, /유효 기한/);
  assert.match(html, /발표 시각/);
});
test('Korean conversation UTF-8 length stays under the server body limit', async (t) => {
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    assert.ok(new TextEncoder().encode(init.body).length <= 15000);
    assert.ok(JSON.parse(init.body).history.length < 8);
    return Response.json(response);
  });
  await new ConversationRequest().send('/', '가'.repeat(2000), Array.from({length: 8}, () => ({ role: 'user', content: '나'.repeat(2000) })), {});
});


test('feature reads and AI share precise SSO rejection messages and reject HTML login success', async (t) => {
  for (const path of ['ai/chat', 'notifications/subscriptions', 'travel/signals']) {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ detail: 'ORIGIN_NOT_ALLOWED' }, { status: 403 }));
    await assert.rejects(requestJson('/pongdang/', path, new AbortController().signal), error => {
      assert.equal(error.code, 'forbidden');
      assert.match(error.message, /허용 출처\(Origin\)/);
      assert.match(error.message, /공개 자료가 보여도/);
      return true;
    });
  }
  t.mock.method(globalThis, 'fetch', async () => new Response('<html>login</html>', { headers: { 'Content-Type': 'text/html' } }));
  await assert.rejects(requestJson('/pongdang/', 'travel/signals', new AbortController().signal), { code: 'unauthenticated' });
});

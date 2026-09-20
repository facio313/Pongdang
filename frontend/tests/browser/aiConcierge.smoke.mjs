import assert from 'node:assert/strict';
// Optional browser smoke: run against a local production preview with Playwright.
// Every API response is intercepted; this never invokes OpenAI or production data.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const { webkit } = await import(process.env.PONGDANG_PLAYWRIGHT_MODULE ?? 'playwright');
const artifactDir = mkdtempSync(join(tmpdir(), 'pongdang-ai-browser-'));
const browser = await webkit.launch({ headless: true });
const base = process.env.PONGDANG_BROWSER_TEST_URL ?? 'http://127.0.0.1:4178/pongdang/';
const baseUrl = new URL(base);
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(baseUrl.hostname), 'Only a local preview is allowed');
const stamp = '2026-01-01T00:00:00Z';
const fixture = {
 request_id:'browser-fixture',status:'completed',answer:'같은 조건으로 조회한 장소의 근거를 확인해 주세요.',clarification:null,fallback:false,provider:'openai',model:'gpt-5.6-luna',scope:{timezone:'Asia/Seoul',as_of:stamp,queries:[{spot_id:17,activity:'swim'}]},
 candidates:[{candidate_id:'spot:17',spot_id:17,name:'경포해변',region:'강릉',type:'beach',lat:null,lng:null,catalog_source:'공개 장소 자료',catalog_verified_at:null,links:[{label:'물때 자료',href:'#tide?spot_id=17'},{label:'예보 자료',href:'#water-forecast?spot_id=17'}]}],
 facts:[{fact_id:'fact-1',text:'현재 유효한 수온 자료가 없습니다.',evidence_refs:['snapshot:fixture'],feature:'temperature',data_status:'no_data',metadata:{station_id:4,evidence:[{observed_at:null,issued_at:null,fetched_at:stamp,provider:'공식 관측 출처',unit:null}]}},{fact_id:'fact-2',text:'공식 제한 상태가 확인되지 않아 추천을 보류합니다.',evidence_refs:[],feature:'restrictions',data_status:'unknown',metadata:{}}],sources:[{id:'source-1',name:'공식 출처',url:'https://www.khoa.go.kr/'}],warnings:['입수 안전은 알 수 없습니다.'],limitations:['자료 부족'],features:['place_conditions'],reason_codes:[],context:{spot_id:17,activity:'swim'},sections:[{title:'장소별 조건 비교',candidate_ids:['spot:17'],fact_ids:['fact-1']}]};
const context = await browser.newContext({viewport:{width:1280,height:900}});
const page = await context.newPage();
const errors=[]; page.on('pageerror', error=>errors.push(error.message));
let mode='success'; let statusMode='ready'; const chatBodies=[]; const reads=[]; const pending=[];
await context.route('**/*', async route=>{
 const req=route.request(); const url=new URL(req.url());
 if(url.origin!==baseUrl.origin){await route.abort();return;}
 if(!url.pathname.includes('/api/')) {await route.continue();return;}
 reads.push(url.pathname+url.search);
 const send=(payload,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(payload)});
 if(url.pathname.endsWith('/ai/status')) {
  if(statusMode==='unauthenticated') return send({detail:'private upstream text'},401);
  return send(statusMode==='disabled'?{enabled:false,status:'unconfigured',reason:'key_missing',model:null}:{enabled:true,status:'ready_to_try',reason:null,model:'gpt-5.6-luna'});
 }
 if(url.pathname.endsWith('/ai/chat')){
  chatBodies.push(req.postDataJSON());
  if(mode==='hold'){pending.push(route);return;}
  if(mode==='failure')return send({detail:'private upstream text'},403);
  return send(fixture);
 }
 if(url.pathname.endsWith('/summary'))return send({queried_at:stamp,datasets:[],heartbeat:null,providers:[],tasks:[],forecasts:[]});
 if(url.pathname.endsWith('/catalog'))return send([]);
 if(url.pathname.endsWith('/datasets/spots'))return send({rows:[{id:17,name:'경포해변',type:'beach',region:'강릉'}],total:1,page:1,page_size:100,queried_at:stamp});
 if(url.pathname.endsWith('/tides/events'))return send({rows:[],status:'no_data',as_of:stamp,total:0});
 return send({rows:[],status:'no_data',as_of:stamp,has_more:false});
});
try {
 await page.goto(base+'?data=demo#ai');
 await page.getByText('실제 OpenAI 연결은 질문 전송 시 확인합니다.',{exact:false}).waitFor();
 assert.match(page.url(),/data=data/);
 assert.equal(chatBodies.length,0);
 await page.getByRole('button',{name:'오늘 강원도에서 수영 조건을 확인할 수 있는 곳이 있어?',exact:true}).click();
 await page.getByLabel('질문',{exact:true}).press('Control+Enter');
 await page.getByRole('heading',{name:'장소별 조건 비교',exact:true}).waitFor();
 await page.getByText('현재 유효한 수온 자료가 없습니다.',{exact:true}).waitFor();
 await page.getByText('공식 제한 상태가 확인되지 않아 추천을 보류합니다.',{exact:true}).waitFor();
 await page.getByText('원본 근거의 시각·출처',{exact:true}).click();
 await page.getByText('공식 관측 출처',{exact:true}).waitFor();
 assert.equal(chatBodies.length,1);
 assert.ok(!('numeric_value' in chatBodies[0].context));
 await page.screenshot({path:join(artifactDir, 'desktop.png'),fullPage:true});
 await page.getByRole('link',{name:'물때 자료',exact:true}).click();
 await page.getByRole('heading',{name:'물때 타이머 · 실제 자료 조회',exact:true}).waitFor();
 await page.getByText('조회 조건에 해당하는 저장 자료가 없습니다.',{exact:false}).waitFor();
 assert.ok(reads.some(path=>path.includes('/tides/events?')&&path.includes('spot_id=17')&&path.includes('page_size=100')));
 await page.getByRole('link',{name:'이 조건으로 AI에게 물어보기',exact:true}).click();
 await page.getByLabel('질문',{exact:true}).fill('수영 말고 서핑으로');
 mode='hold'; await page.getByLabel('질문',{exact:true}).press('Control+Enter');
 await page.getByRole('button',{name:'요청 취소',exact:true}).waitFor();
 await page.evaluate(()=>{const form=document.querySelector('.ai-form');form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
 assert.equal(chatBodies.length,2);
 assert.equal(chatBodies[1].context.spot_id,17);
 await page.getByRole('button',{name:'요청 취소',exact:true}).click();
 await page.getByText('요청을 취소했습니다.',{exact:false}).waitFor();
 await pending.shift().fulfill({status:200,contentType:'application/json',body:JSON.stringify(fixture)}).catch(()=>{});
 assert.equal(await page.getByRole('heading',{name:'장소별 조건 비교',exact:true}).count(),0);
 await page.getByRole('button',{name:'새 대화',exact:true}).click();
 mode='success';await page.getByLabel('질문',{exact:true}).fill('새 대화에서는 어떤 기능이 있어?');
 await page.getByRole('button',{name:'질문 전송',exact:true}).click();
 await page.getByRole('heading',{name:'장소별 조건 비교',exact:true}).waitFor();
 assert.deepEqual(chatBodies.at(-1).history,[]);assert.deepEqual(chatBodies.at(-1).context,{});
 mode='failure';await page.getByLabel('질문',{exact:true}).fill('다음 질문');await page.getByRole('button',{name:'질문 전송',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'Pongdang 접근 권한'}).waitFor();
 assert.equal((await page.locator('body').innerText()).includes('private upstream text'),false);
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'새 대화',exact:true}).click();
 statusMode='disabled';await page.reload();await page.getByText('AI 준비 전',{exact:false}).waitFor();
 assert.equal(await page.getByRole('link',{name:'데이터 조회',exact:true}).count(),2);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
 await page.screenshot({path:join(artifactDir, 'mobile.png'),fullPage:true});
 statusMode='unauthenticated';await page.reload();await page.getByText('로그인이 필요합니다.',{exact:false}).waitFor();
 assert.equal(await page.getByRole('button',{name:'질문 전송',exact:true}).isDisabled(),true);
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({result:'PASS',desktop:'1280x900',mobile:'390x844',scenarios:['initial readiness does not call provider','keyboard example submission','server sections and mandatory evidence','nested source/time disclosure','card to actual tide read','real spot context','synchronous duplicate blocking','cancel ignores late output','new conversation removes history/context','sanitized auth errors','missing-key fallback UI','mobile no page overflow','SSO status failure disables submit'],chatRequests:chatBodies.length,screenshots:[join(artifactDir, 'desktop.png'),join(artifactDir, 'mobile.png')]},null,2));
} finally {await browser.close();}

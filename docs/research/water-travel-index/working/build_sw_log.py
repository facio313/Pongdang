import json,pathlib,csv,re
B=pathlib.Path('docs/research/water-travel-index')
fields='query_id date source query url title returned_count decision exclusion_reason access_status study_id raw_record'.split()
out=[]
def identify(s):
 s=s.lower()
 if any(x in s for x in ['thermal_comfort_following','thermal comfort following immersion','0031938414006192','physbeh.2014.12.016']):return 'SW-S01'
 if any(x in s for x in ['determinants_of_thermal_comfort','determinants of thermal comfort','sms.12360','25440756']):return 'SW-S02'
 if any(x in s for x in ['acute illness among surfers','5860265','28498895','986_acute','186/7/866','3813104']):return 'SW-S03'
 if any(x in s for x in ['three different water temperatures on dehydration','60372','scispo.2010.10.004','667850']):return 'SW-S04'
 if '20250513busan_research_59' in s:return 'SW-S05'
 if '67092' in s:return 'SW-S06'
 if 'lightning.do' in s:return 'SW-S07'
 if 'typhoon.do' in s:return 'SW-S08'
 if 'f450647' in s:return 'SW-S09'
 return ''
for p in sorted((B/'search_records').glob('sw-q*.json')):
 d=json.loads(p.read_text()); parts=[x.strip() for x in d['result'].split('--------------------------------------------------------------------------------') if x.strip()]
 records=[]
 for i,x in enumerate(parts):
  head=x.split('cite')[0].strip()
  m=re.search(r'\((https?://.*)\)\s*$',head,re.S)
  url=m.group(1) if m else ''
  title=head[:m.start()].strip() if m else head[:200]
  sid=identify(title+' '+url)
  reason=''
  if sid:
   decision='selected_study_record';reason='해당연구/공식자료를후속열람;URL중복은독립연구아님'
  elif any(t in (title+' '+url).lower() for t in ['harmonization','28558279','994_incidence','surferhealthstudy']):
   decision='related_duplicate_dataset';reason='Arnold2017동일서퍼연구/후속QMRA가능;독립역학표본으로추가계수안함;원문추출미수행'
  elif any(t in (title+' '+url).lower() for t in ['thermal strain during','785399','8733577']):
   decision='background_tracing';reason='Perspective/리뷰;Macaluso2011원연구추적에사용;새독립표본아님'
  elif any(t in (title+' '+url).lower() for t in ['thermal comfort during and following','5924262','77050170','fingerprint','curriculum','linkedin','profile/julien','openalex.org','researchgate.net','pubmed.ncbi.nlm.nih.gov/23066614/?']):
   decision='exclude_duplicate_or_metadata';reason='학위논문·재게시·서지/저자페이지;독립연구로계수안함'
  elif any(t in (title+' '+url).lower() for t in ['reddit.com','wikipedia.org','tistory','blogspot','youtube','shopper','duolingo','geconomy','our ocean','ourocean','oneuldon','everyhealth','safekorea-kor','기고','국립국어','수리온','korean.go.kr','arxiv.org/1306','arxiv.org/1006','arxiv.org/1509','우황','국선도','수성기요','여군','수석','수필']):
   decision='exclude';reason='활동별환경-결과원자료와무관하거나비학술/비1차소개자료'
  elif any(t in (title+' '+url).lower() for t in ['korea.kr','mof.go.kr','go.kr','childcare','waterboards','redcross','watersmart','kaosts','학술대회','자료','요령','수질']):
   decision='not_extracted_candidate';reason='관련행정/모니터링/학술후보;선정공식출처로범위집중;이반환기록은원문미검토(포괄검색아님)'
  elif any(t in (title+' '+url).lower() for t in ['swim','water','temperature','immersion','thermal','core','wetsuit','dehydrat','수영','수온','열쾌적','gastrointestinal']):
   decision='not_extracted_candidate';reason='관련생리/수질후보;이번종합은직접쾌적감·고온반증·강우코호트에집중하여추가원문검토안함'
  else:
   decision='exclude';reason='반환제목/스니펫에서목표활동-환경-결과연결부족'
  records.append(dict(query_id=d['query_id'],date=d['date'],source=d['source'],query=d['query'],url=url,title=title,returned_count=len(parts),decision=decision,exclusion_reason=reason,access_status='search_snippet_only',study_id=sid,raw_record=str(p.relative_to(B))+'#result-'+str(i+1)))
 out+=records
open_titles={'sw-o01':'Thermal comfort following immersion','sw-o02':'Acute Illness Among Surfers','sw-o03':'Core temperature response to immersed bicycle ergometer exercise','sw-o04':'이안류/해양레저 서비스 안내','sw-o05':'Acute Illness Among Surfers','sw-o06':'Acute Illness Among Surfers','sw-o07':'The determinants of thermal comfort in cool water','sw-o08':'부산 해수욕장 수질 조사2025','sw-o09':'해수욕장의 환경관리에 관한 지침(2022연혁)','sw-o10':'Thermal Strain During Open-Water Swimming Competition','sw-o11':'Thermal Strain During Open-Water Swimming Competition','sw-o12':'물놀이 전후 스트레칭 알고 계시죠?','sw-o13':'부산 해수욕장 수질 조사2024','sw-o14':'Effects of three different water temperatures on dehydration in competitive swimmers','sw-o15':'국민행동요령-태풍','sw-o16':'이안류/해양레저 서비스 안내','sw-o17':'Acute Illness Among Surfers','sw-o18':'Effects of three different water temperatures on dehydration in competitive swimmers','sw-o19':'국민행동요령-낙뢰','sw-o20':'Acute Illness Among Surfers','sw-o21':'The determinants of thermal comfort in cool water','sw-o22':'해수욕장 수질 및 백사장 토양오염 조사2025','sw-o23':'국립해양조사원 이안류 위험지수의 통계적 평가 연구','sw-o24':'국립해양조사원 이안류 위험지수의 통계적 평가 연구','sw-o25':'국립해양조사원 이안류 위험지수의 통계적 평가 연구'}
failed={'sw-o02':'CAPTCHA','sw-o03':'HTTP429','sw-o08':'web_fetch실패','sw-o10':'CAPTCHA','sw-o13':'timeout','sw-o14':'HTTP403','sw-o17':'timeout','sw-o20':'redirect_safety_error'}
for p in sorted((B/'search_records').glob('sw-o*.json')):
 d=json.loads(p.read_text());id=d['query_id']; q=d.get('query',''); summary=d.get('response_summary','')
 m=re.search(r'\((https?://.*?)\)',summary)
 url=d.get('url') or (q if q.startswith('http') else (m.group(1) if m else ''))
 sid=identify(url+' '+open_titles[id])
 status='full_text_checked'; decision='include';reason='관련방법·결과·한계직접확인'
 if id in failed:status='access_failed';decision='access_failed';reason=failed[id]
 elif id=='sw-o09':status='metadata_only';decision='exclude_unread_body';reason='2022연혁제목만표시;조문/현행성미확인'
 elif id=='sw-o18':status='abstract_only';decision='include_abstract_only';reason='출판사초록확인;원문유료벽'
 elif id=='sw-o21':status='bibliographic_verified';decision='metadata_verification';reason='원고와DOI/저널/연도대조'
 elif id=='sw-o11':decision='background_tracing';reason='Perspective논문;원연구Macaluso추적용'
 elif id=='sw-o12':decision='exclude';reason='2015대중안내;현재선택공식행동요령으로대체'
 elif id=='sw-o04':status='partial_text_checked';decision='continue_reading';reason='본문후반추가열람 sw-o16'
 if id in ['sw-o23','sw-o24']:status='partial_text_checked';decision='continue_reading';reason='순차방법/결과/토의열람sw-o23–25'
 out.append(dict(query_id=id,date=d['date'],source=d['source'],query=q,url=url,title=open_titles[id],returned_count=1,decision=decision,exclusion_reason=reason,access_status=status,study_id=sid,raw_record=str(p.relative_to(B))))
 d['url']=url;d['title']=open_titles[id];d['access_status']=status;d['decision']=decision;d['review_note']=reason;d.pop('working_cache',None);d.pop('response_summary',None)
 if id=='sw-o22':d['reviewed_locations']='PDF1–3쪽표1/2·시각확인;7쪽결론(본문텍스트)'
 p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n')
with (B/'working/sw_search_log.csv').open('w',newline='') as f:
 w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(out)
print('log_records',len(out),'search_queries',len(set(r['query_id'] for r in out if '-q' in r['query_id'])),'returned_search_records',sum('-q' in r['query_id'] for r in out),'open_attempts',sum('-o' in r['query_id'] for r in out))


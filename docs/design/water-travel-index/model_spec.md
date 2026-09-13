# 물 여행 적합도 모델 설계 명세

문서 버전 `0.1.0-draft` · 2026-09-14 KST · **설계 초안 / 제품 미구현**

이 명세는 [기존 근거 종합](../../research/water-travel-index/synthesis.md), [규칙 감사](../../research/water-travel-index/legacy_audit.md), [주장별 근거표](../../research/water-travel-index/evidence_matrix.csv)를 설계로 옮긴다. 기존 실행 코드·프론트엔드·DB·배포를 변경하지 않는다. 활동별 가중치가 실증적으로 추정되었다고 전제하지 않으며, 미정 파라미터가 있는 모델은 평가 불가 상태로 남긴다.

구체 필드·enum은 [canonical_contract.md](canonical_contract.md), 값의 지위와 출처는 [parameter_evidence.csv](parameter_evidence.csv), API와 UI 연결은 [api_contract.md](api_contract.md) 및 [frontend_integration.md](frontend_integration.md), 실증 검증은 [validation_plan.md](validation_plan.md)를 따른다. 이 문서의 수치와 기존 코드 값은 파라미터 근거표와 연결되어야 한다.

## 1. 현재 계약과 설계의 경계

확인한 Pongdang 작업 트리는 `feature/api @ d07cd23279808e74c1998d849c240a48e06d06d2`다. 기존 미커밋 변경을 포함한 실제 파일을 읽었다. 시작 파일216개의 해시·Git 상태는 [source_baseline.json](source_baseline.json)에 보존했다. 이번 단계에서 Multtara 실행 코드를 추가 실행·import하거나 DB·네트워크·자격증명에 의존하지 않는다. 비교 기준은 앞선 읽기 전용 감사의 `main @ b160cf1c07cc0f299f9d83839557a1e987c47be4`다.

현 프론트엔드의 `WaterForecastPage`, `WaterIndexHubPage`, `WaterIndexMapPage`, `FirstSwimPage`는 점수/추천이 준비 중임을 명시하고 `FeatureData`로 `/api/data`의 허용된 자료를 읽는다. `data.ts`의 `RowsResult`/`Row`는 일반 자료표 타입이며 과학적 평가 DTO가 아니다. `codeNames.ts`의 여섯 활동 라벨은 제품의 검증된 지원 범위를 확정하지 않는다. 기존 raw scores/forecasts/calibrations 테이블의 존재도 계산기나 보정 데이터 존재를 뜻하지 않는다.

**현 단계의 공개 기본 모델은 unimplemented이며 score와 preference.score/ranking은 null이다.** 이후 별도 구현·승인을 거쳐도 공식 자료 표시, 규칙 구현 테스트, 사용자 결과에 대한 검증을 순서대로 구분한다. 현재 수집 성공·최신 heartbeat를 모델 검증 완료로 바꾸지 않는다.

## 2. 평가 단위와 목표 결과

평가 키는 `spot_id × activity × target × context × model_id × model_version × parameter_set_version`이며, 계산에 허용된 지식 시점 `as_of`와 실제 입력 revision 목록을 함께 보존한다. 하나의 장소·활동·기간에 여러 자료 제공자가 있을 수 있다. 평가 대상 기간과 입력 집계기간은 다르다.

저장 target manifest의 `target_id`는 평가 레코드가 없는 정상 null 행에도 안정된 식별자를 제공한다. 행의 `as_of`는 평가 당시의 불변 지식 기준시각이고 envelope의 `as_of`는 조회 cutoff이므로 non-null 행 as_of≤조회 as_of만 강제한다. 평가 레코드가 없는 target 진단 행은 as_of=null이고, 실제 사용 입력이 있는 평가는 불변 행 as_of가 필수다. GET은 오래된 평가의 as_of/evaluated_at를 현재로 바꾸거나 ID 생성을 위해 저장하지 않는다. 후속 저장·선택 정책에서 현재 적용 조건을 충족하지 못한 평가를 최신 결과로 표시하지 않는다.

| 계층 | 목표 | 출력의 의미 | 근거 |
|---|---|---|---|
| 활동 지원 | 이 장소에서 이 활동을 제공/허용하는 범위인지 | supported / unsupported / unknown | 장소 유형만으로 활동을 추정한 legacy 매핑의 한계; AC03–AC04, AC08–AC11과 저장소 감사 |
| 안전·제한 | 확인해야 할 운영/위험 조건에서 금지·주의·자료 부족이 있는지 | 제한 상태와 확인 범위. 개인 안전 확률 아님 | SW04–SW13, AC08–AC10 |
| 환경 | 특정 활동/목표에 대한 환경 조건의 기술 또는 모델별 지수 | 평가값 또는 null. 낮은 값과 평가 불가 분리 | HC01–HC10, SW01–SW03, AC01–AC07 |
| 선호 | 명시한 사용자 모집단의 만족·의향·실제 선택 중 하나 | 별도 결과모형. 현재 not_modelled | HC02–HC06, HC18, KR01, AC12–AC15 |
| 추천 문구 | 위 상태와 활동을 설명하고 필요한 행동 안내 | 설명 코드에 따른 정보 제공. 선호 확률/최고 활동 순위 아님 | 결과 분리의 설계 종합; SW08–SW13, AC08–AC10 |
| 입력 품질 | 사용한 자료가 정의·시간·공간·수정본 조건에 맞는지 | 개수·구체 결손·노후·충돌; 확률 confidence 아님 | 수집 계약 및 HC01, SW07, SW11, AC10 |
| 모델 근거/검증 | 어떤 출처·파라미터·대상에서 무엇을 검증했는지 | 문헌 직접성·모델 상태·검증 범위 | 근거표 전체; 자체 등급이며 GRADE 아님 |

열적 쾌적/만족(A), 진술 선호/의향(B1), 관측 행동(B2), 안전·가능 조건(C)은 별도 outcome ID로 관리한다. 클릭·해변 방문·수영 참여·만족도를 서로의 정답 라벨로 대체하지 않는다. 서핑 정보조회(AC02)와 심박/수행부하(AC01)는 각 결과를 그대로 보존한다.

## 3. 활동 지원을 먼저 확인

`support`는 장소별 검증 레코드를 요구한다. 최소 계약은 `spot_id, activity, allowed_area/route, operator_or_authority, support_status, evidence_ref, verified_at, valid_from, valid_until, mapping_version`이다. 이 구조는 **미구현 필요자료 계약**이며 기존 `spots.type` 값을 바꾼 새 사실이 아니다.

- supported: 해당 활동·위치/구간·시설유형·운영 범위가 확인되고 지원 근거가 평가 시간에 유효하다.
- unsupported: 확인된 활동 미제공/금지 유형·범위다. 단순 자료 없음으로 unsupported를 만들지 않는다.
- unknown: 장소 등록만 있거나 범위·활동·시각·검증 근거가 부족하다.
- 일시적 운영 폐쇄·입욕 금지는 support를 삭제하거나 장소 영구 미지원으로 바꾸지 않고 safety.restrictions로 표현한다.

해안도로→수영/서핑, 저수지→래프팅, 모든 풀/워터파크→온천 같은 자동 매핑은 채택하지 않는다. 공식 예보 지점도 해당 활동의 현재 운영 허가를 보장하지 않는다. 지점/관측소/실제 이용 구역이 다른 경우 승인된 공간 매핑과 대표성 검수가 없으면 unknown이다.

support가 supported가 아니면 활동별 환경·안전 평가를 진행하지 않는다. 독립된 공식 장소 경고는 별도로 전달하되, 활동 안전 평가 완료로 표시하지 않는다. 지원 unknown과 현재 공식 출입금지가 동시에 존재하면 경고/행동코드를 함께 유지한다.

## 4. 안전 상태와 결정 순서

좋은 날씨와 위험을 같은 가중합에 넣지 않는다. 안전 규칙은 `rule_id, required_inputs, applicability, predicate, effect, source/evidence, parameter_ids, ruleset_version`을 가진다. 미정 임계값의 비교식을 실행 가능한 기본값으로 채우지 않는다.

supported 활동의 안전 상태 우선순위는 다음이다.

1. 현재 관할·활동/구역·대상시간에 해당하는 확인된 금지 조건이 있으면 **restricted**. 다른 자료가 없어도 확인된 금지는 유지하며, 누락된 필수 항목도 따로 반환한다.
2. 금지가 없고 필수 확인 항목의 부재·노후·충돌·공간 불일치·미구현이 있으면 **unknown**. 알려진 주의 정보는 warnings에 보존한다.
3. 모든 필수 항목이 확인되고 주의 조건이 있으면 **caution**.
4. 승인된 **비어 있지 않은** 필수 확인목록이 완전하며 금지·주의가 없을 때만 **no_known_restriction**. 확인한 조건 범위 안의 제한 부재이며 ‘안전’ 판정이 아니다.
5. 지원 확인에서 멈춘 경우 **not_assessed**.

`required_checks_complete=true`를 빈 배열에 대한 all() 결과로 만들지 않는다. 목록 자체가 미승인/TBD이면 false다. support≠supported이면 not_assessed, 지원된 활동의 확인된 금지가 있으면 restricted를 유지하고, 그 외에 목록 미승인/TBD이면 unknown이다. collection_warning.status=bulletin을 active로 취급하지 않는다. 데이터베이스에 공지가 없다는 이유만으로 ‘공식 제한 없음’을 만들지 않으며, 해당 공지를 빠짐없이 확인할 수 있는 권위 있는 현재 자료와 적용 범위가 필요하다.

확인된 제한은 완화 파라미터가 아니라 별도 조건이다. 다른 입력의 점수·confidence가 높아도 restricted→caution/no_known_restriction으로 올라갈 수 없다. 경고가 만료되면 자동으로 안전해지는 것이 아니라, 그 시점의 필수 근거를 다시 확인하여 unknown이 될 수 있다.

### 공식 정책 후보의 적용 범위

마지막 천둥 후30분 안내(SW09)는 그 출처·장소·실제 천둥 정보가 확인되는 범위의 운영 규칙 초안이다. hot tub 물40°C 초과 제한과5세 미만 이용 제한(SW12)은 CDC의 시설 hot tub/spa 대상 지침이다. 이를 한국 모든 수영·온천 시설의 법적 기준으로 확대하지 않는다. CDC의50세 이상 Legionella 취약군(SW13)은 감염 안내이며 열적 감점계수로 쓰지 않는다. 가족 수영15/18/31°C, 이안류 코드30/55, 전국 공통 유량 기준은 새로운 모델에 자동 채택하지 않는다. 최신 관할 계약·대상·단위·시간 정의 검수와 파라미터 등록이 선행되어야 한다.

## 5. 활동별 필수 입력과 선택 입력

**필수/선택은 데이터 수집량의 우선순위가 아니라 해당 평가를 산출하는 계약**이다. 아래 항목은 안전 요구를 제안하는 초안이며, 활동별 승인된 규칙 목록은 G_SUPPORT/G_INPUT_CONTRACT/G_RULE_VERIFICATION에서 확정한다. 필요한 항목을 수집할 수 없다고 선택 입력으로 낮춰 평가를 통과시키지 않는다. 필수 입력 집합이 미승인이면 평가 불가다.

공통 필수: 검증된 장소-활동 지원, 시간/구역의 적용 범위, 공식 운영·출입 제한 확인, 모델/규칙/파라미터 버전, 필요한 관측소 매핑, 입력의 단위·집계·유효성·수정본 provenance. 야외 물접촉 활동은 적용 가능한 기상·해양/하천 위험 확인을 포함한다. 실내 시설에 야외 낙뢰 규칙을 기계적으로 추가하지 않고 시설/노출 범위별 적용성을 명시한다.

| 활동 | 안전 계층의 필수 입력 초안 | 환경 계층의 필수 입력/모델 준비조건 | 선택 입력과 사용 제한 |
|---|---|---|---|
| swim | 공식 구역/운영·입수 제한, 해당 수역의 수질 적합/권고 상태, 적용되는 낙뢰·파랑·이안류 또는 하천 위험, 수온과 노출/장비/대상자 범위, 감독·숙련 정책의 적용성 | 입수 중/퇴수 후 등 결과 정의, 대표 수온·노출시간·장비·활동 상태. 기온/RH/바람을 사용하는 모델이면 그 정의도 필수. **함수·임계 미정으로 score=null** | 혼잡·구름/일사·사용자 선호. 이것으로 수질·이안류 결손을 대체하지 않는다. SW01–SW07, SW11; HC06–HC09 |
| surf | 공식 운영·입수 제한, 물접촉 수질, 적용되는 기상·이안류·해안 위험, 브레이크/구역과 숙련·장비 조건 | 현지 파고 정의(유의/최대/쇄파대), 주기, 파향/풍향과 해안 방향, 풍속, 명시 숙련. 열노출 평가시 수온·장비·시간 추가필수. **한국 선호/환경함수 미정** | 공식 surfing_skill/등급은 원자료 설명으로 별도 표시; 혼잡·개인 목표는 미보정. 외국 문헌 경계 복사 금지. AC01–AC02, AC11, SW04–SW05 |
| relax | 실제 휴식/걷기 가능 구역과 접근/운영 제한; 해안 접근·낙뢰·폭풍 등 해당 노출의 통제. 비접촉으로 확인된 휴식에는 미생물 수질검사를 자동 필수화하지 않음 | 결과를 걷기/앉아서 쉬기/관광방문 중 명시. HCI 실험이면 일최고기온·평균RH·구름·일강수·평균풍속의 정확한 일집계와 검수된 변환/원표 필수 | 그늘/복사·착의·노출길이·혼잡. 이를 추가하면 원HCI와 다른 별도 모델/파라미터 버전이다. HC01–HC05, HC09–HC18 |
| mudflat | 검증된 체험 구역/경로, 운영자·기관 체험창과 귀환 안내, 조석·흐름/침수 조건에 대한 현장 승인, 안개/기상/경로 통제; 물접촉/채취 유형에 맞는 수질·오염 권고 | 체험내용·노출/보행조건 정의. 기상과 만족/참여의 정량 함수·필수 변수 집합은 **미정**. 공식 체험창 안에 있다는 사실을 점수로 환산하지 않음 | 기온·RH·일사·혼잡은 조사 후보. 간조±고정시간은 필수 안전자료의 대체가 아니다. AC08–AC09 |
| onsen | 실제 시설 유형(hot tub/온천탕/노천/일반풀 구분), 운영·위생 제한, 시설 실측 욕조수온, 시설 이용/연령 제한과 개인 해당 여부; 노천이면 적용 외부 통제 | 실내외·탈의/입욕/퇴수 상태, 욕조수온·체류시간, 명시 개인 요구. 방온도 사용하는 실험은 해당 측정 필수. **종합 선호 가중치·수온 fit 미정** | 혼잡·편의시설·대피공간·목표수온은 명시적 요구 일치만 설명. medical 효과나 더 추우면 가점 생성 금지. AC05–AC07, SW12–SW13 |
| rafting | 실제 승인 운항 구간/운영자, 해당 보트·장비·숙련·감독, 현재 구간 운영 제한·상류강우/방류/하천 위험, 물접촉 오염 권고, 지점별 수리 기준의 유효한 버전 | 구간에 검증된 유량 또는 수위→유량 관계, 시간 변동, 보트/숙련별 목표 결과 및 현지 보정. **Q 임계와 선호곡선 미정** | 기온·수온·열장비는 사용하는 열평가에는 조건부 필수. 혼잡·체험목표는 보정 후보. 다른 강의cfs 값을 전용하지 않음. AC03–AC04, AC10 |

대상자 정보는 사용자 계정·의료 DB를 새로 만들지 않는 최소 context 계약으로 다룬다. 현재 general/family 라벨만으로 나이·건강·숙련·보호자 감독·장비가 확인되었다고 하지 않는다. 이 정보가 필요한 모델에서 미입력이면 context_missing 또는 model_outside_validated_scope이다. 의료 민감정보를 공개 GET URL에 넣지 않는다. 개인화 모델과 민감정보 처리 경로는 이번 공개 API 초안의 구현 범위가 아니다.

### 누락 처리

| 조건 | 처리 |
|---|---|
| 필수 안전 입력 없음/불명 단위/노후/충돌/공간 불일치 | 지원된 활동의 확인된 금지가 있으면 restricted 유지, 그 외 unknown. score=null, missing/stale/conflict 등 구체 사유 표시. 지원 평가에서 중단됐으면 not_assessed |
| 필수 환경 입력만 부족, 안전 필수 확인은 완료 | safety 결과 유지, environment.not_evaluable, score=null. 주의가 있으면 recommendation.conditional_information으로 주의·미평가를 함께 설명; 주의도 없으면 unavailable |
| 선택 입력 없음 | 기본 모델이 그 입력 없이 명세상 정의되어 있을 때만 기본 모델을 그대로 평가. 가중치 재분배·결측0 대입 금지 |
| 확장모델이 선택 입력을 실제 계산에 사용 | 해당 계산에서 필수로 취급하여 lineage·validity에 포함. 빠지면 명시한 다른 모델/버전으로 전환하거나 평가 불가; 묵시적 축소 금지 |
| 모두 입력되었으나 곡선/파라미터/대상 검증 미정 | 미구현은 model_unimplemented; 공개 게이트 미통과는 withheld(model_not_released); 허용 모델의 필수 입력/파라미터 결손은 not_evaluable. 수집완전성과 모델미검증을 따로 표시 |
| 검수된 모델이 정상 계산한0점 | evaluated, score=0. null/데이터 부족/위험 확률로 바꾸지 않음 |
| 충분한 입력의 높은 환경값+확인된 금지 | restricted, 공개 score=null/withheld, do_not_proceed; 내부 계산을 유지해도 공개 추천에 사용 금지 |

관측값이0인 것, provider의 결측 코드, 범위형 강수 문구, 단위 없는 수치, 빈 응답을 구별한다. numeric_value가 없지만 text_value가 있는 정상 서술 예보를 수치0으로 읽지 않는다.

## 6. 점수 척도와 잠정 모델

### 기본 설계

초기 상태는 안전/지원/품질·원자료를 설명하고 자체 점수는 null로 반환하는 **evidence-only** 단계다. 가중치를 균등 배분하거나 모든 결측을 중간값으로 놓은 임시 점수를 기본값으로 만들지 않는다. 이 단계의 유용성은 필요한 근거와 평가 불가 이유를 정확히 전달하는 데 있다.

향후 `index_0_100`을 사용할 때는 모델 레지스트리에 다음을 반드시 명시한다.

- target outcome: 이 계약의 index_0_100은 규칙상 환경지수에 한정한다. 미래 열감각 예측은 별도의 environment prediction 계약, 만족·선호·선택 예측은 별도 preference 모델/DTO에서 결과·척도를 명시하고 버전을 올린다. 현재 환경 점수 필드의 의미를 조용히 바꾸지 않는다.
- score definition: 함수·변환·단위와0/100의 기준. 표본 백분위인지 가중 규칙인지 별도 정의.
- interpretation: 해당 모델의 범위 안에서만 해석; 만족 확률·안전 확률·참여율 아님.
- comparison_scope: 같은 활동/목표/버전/대상/집계에 한정. 서로 다른 활동 모델 간 비교가능성은 null.
- rounding/clipping/missing rule: 각각 parameter_id에 기록하고 원문식과 표시변환을 구분.

활동별 최저/최고를0/100에 맞추거나 순위를 백분위로 바꿨다는 사실만으로 공통 효용이 만들어지지 않는다. 동일 활동 안에서도 다른 모델 버전의 점수를 바로 비교하지 않고 버전 차이를 표시한다.

### 오프라인 HCI:Beach 재현 후보

`hci-beach-reproduction@0.1.0-experimental-draft`는 원연구 정의를 확인하는 비교 기준이다. **relax 만족 모델로 출시하는 후보와도 구분**한다.

원문 확인된 결합 형식은 `HCI = 2·TC + 4·A + 3·P + W`다(HC01; PAR_HCI_WEIGHTS). 계수는 HCI 명세의 구성이고 한국 사용자 데이터에서 추정한 회귀 가중치가 아니다. 일최고기온·평균RH, 구름%, 일강수량mm, 평균풍속km/h가 필요하다. 정확한 일 경계·열지수 변환·원표 모든 band와 endpoint·반올림/clip은 원문 대조 및 파라미터 검수 전 미정이다. legacy에 있던 구현 상수·표를 원문직접 값으로 자동 승격하지 않는다.

완전한 하루를 집계한 관측 지수는 하루 종료 전에 관측값으로 확정할 수 없다. 당일 일부 관측+남은 예보를 합치면 mixed이며 별도 집계 규칙/검증이 필요하다. 하루 총강수를1시간 강수/강수확률로 바꾸지 않고, SKY 범주 상한을 실측 구름%로 바꾸지 않는다. 시간대 추천으로 사용하지 않는다. HCI가 산출되더라도 선호·안전·활동 순위는 생성하지 않는다. HC01–HC05, HC10–HC14.

필수 원표 전사와 집계 검수가 완료되면 먼저 오프라인 재현 결과를 원표 예제와 비교한다. 다음 별도 한국 결과모형 후보는 `korea-relax-…` 같은 다른 model_id와 parameter_set_version을 갖고, 원HCI에서 바꾼 항목·대안을 명시한다. 연구 완료 전 계수는 null이다.

### 기온·습도·체감지수

기온+RH 모델, 검수된 열지수 모델, 두 입력군을 비교하는 확장 모델을 별도 후보로 둔다. 기온과RH를 이미 포함한 Humidex에 두 항을 독립 효과처럼 추가 가중하지 않는다. 데이터가 이를 지지하는지는 장소·시기를 분리한 검증에서 확인한다. HC08의 높은 상관만으로 습도가 모든 활동에서 불필요하다고 결론 내리지 않는다. 열지수°C와 실제 기온/수온°C는 서로 다른 변수다.

## 7. 자료 계약과 시간·공간 정합성

현재 `SourceBatch`와 allowlist는 numeric_value/text_value/unit/mode, provider ID, station, observed_at/issued_at/fetched_at, 유효기간을 보존한다. 새 평가는 이 자료의 **명시적 읽기 투영**이어야 한다. raw 응답·인증 URL·임의 SQL·legacy DB를 노출하거나 요구하지 않는다. source_version과 content hash/lineage를 통해 선택한 증거를 고정한다.

| 항목 | 결정 |
|---|---|
| 계산용 값 vs 표시 | numeric_value는 유한 수치 또는 null, unit은 명시 단위. text_value의 ‘미만’, ‘~’, 코드 설명은 숫자로 추정하지 않는다. `24°C` 같은 표시문자열로 계산하지 않는다. |
| 같은 온도 단위의 표기 | 어댑터의 degC/°C는 원본 unit을 보존하고 검수된 unit transform으로 동일 계산 단위에 연결한다. 이름만 같은 이종 변수는 통합하지 않는다. 변환 방법/버전/원래 값도 남긴다. |
| 파고/풍속 | maximum_wave_height와 wave_height, maximum_wind_speed와 wind_speed를 혼용하지 않는다. 바다부이의 wave_height를 현지 쇄파고로 간주하지 않는다. |
| 조류·유량 | current_speed의 m/s와cm/s, 조위cm의 기준면, river_level의 m와 river_flow의m³/s를 구분한다. 공간/수리 보정 없는 대체 금지. |
| 수질 | 채수 지점·층·검사일·검사항목·단위·운영 판정의 유효성 필요. DO/pH를 미생물 적합 상태로 변환하지 않는다. |
| 유효창 vs 집계창 | valid_from/valid_until은 공급/정규화된 적용창이다. 평균/최대/누적의 관측 집계창은 aggregation으로 따로 남긴다. unknown aggregation을 시간창 길이로 채우지 않는다. |
| 예보 | 기존 forecast observed_at는 대상 시작시각이므로 time_role을 명시한다. issued_at 미상은 null, fetched_at로 발표시각 대체 금지. |
| 신선도 | 현재 worker 반복주기·어댑터TTL은 과학적 최대나이가 아니다. 적용 모델별 허용나이·지점 대표성은 파라미터 미정이면 판단 불가. |
| 충돌 | 같은 지점·변수·시간이어도 서로 다른 출처의 불일치를 조용히 평균하거나 높은 점수 쪽으로 선택하지 않는다. 사전 승인된 우선순위/조정 규칙이 없으면 input_conflict. |
| 수정본 | 원provider ID의 새 버전과 이전 superseded 증거를 보존한다. 늦게 받은 보정값을 예전 평가의 당시 입력으로 사용하지 않는다. |

### as_of와 역사적 재현

사용 입력은 불변 행 as_of, 미사용 참조 입력은 envelope as_of를 기준으로 `fetched_at≤as_of`, 관측이면 `observed_at≤as_of`, 제공된 issue time이면 `issued_at≤as_of`를 검사한다. 이 조건은 시간 누출을 막는 필요조건이고, 미상 issue time이나 변하는 메타데이터의 역사 상태를 완전히 재현하는 충분조건은 아니다.

현재 저장 구조의 최신 state=stale/superseded 투영과 수정 가능한 장소/관측소 메타데이터만으로 과거 상태를 정확히 재현할 수 있다고 가정하지 않는다. 평가 당시 입력의 값/단위/공간 매핑/수정본/규칙·파라미터를 고정한 **불변 assessment manifest** 또는 동등한 시간 버전 이력이 있어야 historical as_of 요청을 제공한다. 이력이 없으면 API에서 지원하지 않음을 명시하고 현재 자료로 과거 점수를 재작성하지 않는다. 저장 구현·스키마 변경은 후속 작업이며 이 문서는 DB를 변경하지 않는다.

집계 모델은 PAR_AGGREGATION_POLICY가 지정하는 원시 시간구간 coverage·누락·관측/예보·지식 시점 요건을 먼저 검증하여 직접 입력을 만든다. 일집계는 하루 원시 샘플들의 validity 전체 교집합으로 정의하지 않는다. 완성된 집계 입력의 대상 기간과 이용 가능 시점을 별도로 기록한 뒤, 이를 다른 직접 입력 및 지원·안전 조건과 정합시킨다. 원시 lineage와 원래 만료/수정 정보는 그대로 보존한다. 과거 일집계 재현은 당시의 manifest와 집계 규칙으로 평가하며, 현재 stale 표기를 역사적 사실 삭제나 현재 효력 연장에 이용하지 않는다. 필요한 집계 정책이 미정이면 일별 HCI도 실행 불가다.

### 실제 예보 범위

공식 제품의 실제 target interval 목록에서 coverage를 도출한다. 반일 제품을12개의 시간별 독립 점수로 복제하지 않는다. 일별 제품의 날짜를 임의의 정오 평가로 환원하지 않는다. 예보가 없는 요청 날짜에는 outside_forecast_horizon과 null을 표현하거나 목록에 자료를 만들지 않고 coverage/미포함 이유를 반환한다. 범위 내부의 누락은 input_missing으로 구분한다.

환경 예보가 존재하는 기간과 안전 평가가 가능한 기간도 다르다. 오늘 확인된 운영/수질/낙뢰 상태를 미래 일주일로 연장하지 않는다. 각 계층 coverage를 따로 계산하고, 공개 평가에 필요한 교집합이 없으면 evaluated가 아니다.

기간 평가 target과 조회 요청은 각각 `[start_at,end_at)`, `[from,until)`다. 기간 일부만 조건이 충족되면 전체가 평가된 것처럼 한 점수를 주지 않는다. 모델이 선언한 실제 target/규칙 경계로 저장된 평가 목록만 반환하고 gap을 명시한다. 조회 범위와 겹치는 원target interval은 잘라서 새 예보로 만들지 않으며, 범위를 넘어 겹치는 부분을 표시한다. 요청 기간 전체에 대한 임의 시간평균·최저점 요약은 제공하지 않는다. API의31일 조회 상한은 PAR_API_MAX_WINDOW_DAYS라는 부하 제한이며 예보 기간이 아니다.

## 8. 상태·사유·문구 정책

단일 상태가 모든 정보를 대신하지 않는다. 평가 상태는 대표 분기이며 safety/data_quality/model에는 모든 적용 이유를 보존한다.

| 대표 조건 | assessment_status | 공개 score | 추천·설명 |
|---|---|---|---|
| 확인된 활동 미지원 | unsupported | null | not_supported, 이 장소의 해당 활동 미지원 |
| 활동 지원 미확인 | support_unknown | null | check_required, 지원 범위 확인 필요; 별도 공식 경고 유지 |
| 지원됨+확인된 안전 금지 | withheld | null | do_not_proceed, 활동·구역·제한 사유 제시 |
| 예보 대상이 실제 환경 제공창 밖 | outside_forecast_horizon | null | 범위 밖의 환경 자료 미제공. 안전 unknown/제한은 별도 유지 |
| 지원됨+필수 안전 미확인 | withheld | null | check_required, 안전 확인에 필요한 자료 부족 |
| 모델 미구현 | model_unimplemented | null | 평가 준비 중. 수집 상태와 구분 |
| 구현/오프라인 후보이나 공개 모델·범위 게이트 미통과 | withheld | null | model_not_released, 공개 점수 제공 불가. candidate/experimental을 검증된 모델로 표시하지 않음 |
| 모델은 구현됐으나 필수 환경/문맥/파라미터 부족 | not_evaluable | null | 평가 불가와 구체 missing/expired/unit/context 사유 |
| 구현된 허용 모델·완전한 필요조건·정상 계산 | evaluated | 계산값 | 주의 조건이면 conditional_information, 그 외 information_only. 점수만으로 권장 활동 생성 금지 |

여러 조건이 동시에 존재할 때 대표 상태 순서는 **unsupported → support_unknown → 확인된 안전 금지(withheld) → outside_forecast_horizon → 필수 안전 결손(withheld) → model_unimplemented → 공개 모델·범위 게이트 미통과(withheld) → not_evaluable → evaluated**다. 순위에서 밀린 다른 사유도 reason_codes/coverage/각 계층에 남긴다. outside_forecast_horizon을 대표로 표현해도 safety.status와 추천의 check_required/do_not_proceed를 완화하지 않는다. API·화면·계약 검증은 이 결정표를 공유한다.

사유 코드는 API와 같은 소문자 snake_case를 사용한다: activity_unsupported, activity_support_unknown, official_restriction, required_safety_check_missing, input_missing, input_stale, input_conflict, input_unit_unknown, input_aggregation_unknown, station_mapping_unverified, issue_time_unknown, outside_forecast_horizon, context_missing, model_unimplemented, model_not_released, parameter_unresolved, model_outside_validated_scope, preference_not_modelled, cross_activity_comparison_unvalidated, history_not_reproducible. 각 코드의 정확한 의미와 HTTP 오류와의 구분은 API 문서가 기준이다.

‘점수가 높으니 수영하기 안전해요’, ‘비가 없으니 수질이 좋아요’, ‘서핑85점이 온천80점보다 사람들이 선호해요’ 같은 문구는 허용하지 않는다. 설명은 ‘공식 입수 제한으로 수영 평가를 표시하지 않습니다’, ‘수질 확인 자료가 부족하여 입수 여부를 판단할 수 없습니다’, ‘제공된 예보 범위 밖입니다’, ‘실험 지수이며 개인 만족이나 안전 확률이 아닙니다’처럼 상태·활동·필요 확인을 연결한다.

## 9. 기여 요인과 불확실성

기여 요인은 재현 가능한 **모델 계산상의 설명**이어야 한다. HCI 결합을 재현했다면 확인된 항별 rating/계수/가중 기여를 제공할 수 있다. 근거가 단순 방향 설명뿐이면 contribution=null, direction=unknown/not_scored로 두고 relevant_input/explanation_code만 제공한다. 범위형 강수·정성 공식 등급에 숫자 기여를 만들지 않는다.

문헌 불확실성(표본/효과 CI/직접성), 입력 불확실성(결측/오차/지연/공간 차이), 파라미터 민감도, 모델 외부 검증 오차를 별도로 기록한다. legacy confidence·coverage와 결측 하한/상한은 경험적으로 보정된 확률/CI가 아니므로 새 응답의 data_quality 또는 uncertainty에 의미를 바꿔 복사하지 않는다. 미래 통계 모형이 구간 추정을 지원할 때만 방법·대상·명목 수준·검증 결과와 함께 별도 버전으로 추가한다.

## 10. 모델 수명주기와 출시 조건

| 상태 | 가능한 일 | 공개 승격 조건 |
|---|---|---|
| unimplemented | 원자료·불가 이유 설명, 명세 검토 | 자체 score 없음 |
| experimental | 검수된 입력/파라미터로 오프라인 재현·민감도·비교 | 공개 registry에 자동 노출하지 않음; 실자료 API fallback 사용 금지 |
| candidate | 한국 결과 자료와 내부 검증, 범위별 model card 작성 | 공개 숫자 점수 금지. 내부검증 범위 내라는 이유만으로 출시하지 않음 |
| validated | 명시한 대상·활동·장소/기후·계절·결과에 대한 외부 검증을 통과한 범위 | G_SUPPORT/G_INPUT_CONTRACT/G_PARAMETER_TRACE/G_RULE_VERIFICATION/G_EXTERNAL_VALIDATION/G_FE_RELEASE/G_OPERATIONS의 해당 게이트 통과 |
| retired | 기존 평가와 근거의 역사 조회 | 신규 평가에 사용하지 않음 |

과학적 파라미터 변경, 활동/대상/시간집계 변경, 위험 규칙 변경은 model/ruleset/parameter 버전 변경과 영향 검토를 요구한다. 단순 설명문 수정과 근거 패키지 업데이트도 기록하되 새 근거만 추가됐다고 기존 보정 성능이 갱신된 것처럼 표시하지 않는다.

현재 승인되지 않은 필수 변수·파라미터·성능 합격선·현장 검증을 ‘TBD이지만 기본값으로 출시’하지 않는다. 후속 구현은 이 설계를 코드로 재현하는 검증과 실제 사용자 결과를 설명하는 검증을 각각 통과해야 한다. 상세한 비교군·한국 조사·시간/장소 분리·결측/민감도 검증은 [validation_plan.md](validation_plan.md)에 정의한다.

공개 숫자 점수는 PAR_PUBLIC_SCORE_RELEASE_POLICY에 따라 validated + external_validation_passed + 해당 검증범위·적용 출시 게이트 충족을 모두 요구한다. 운영 제한·지원 미확인·필수 결손은 이후에도 점수를 null로 만든다. 실험 수치가 문서용 오프라인 예시에 등장해도 이 조건의 실제 충족을 의미하지 않는다.

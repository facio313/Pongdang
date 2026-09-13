# Pongdang API 재검증 결과

재검증 시각: 2026-09-13T23:43:05.063048+09:00 ~ 2026-09-13T23:46:22.254973+09:00

사용자가 갱신한 로컬 엑셀의 현재 인증값으로 이전 실패 항목과 성공 대조 항목을 다시 조회했다. 최초 보고서와 결과는 보존했다. 키·원본 전체 응답·인증값이 포함된 URL은 이 문서에 기록하지 않았다.

**이전 실패에서 실제 데이터 수신 성공으로 전환된 항목은 6개다.** 먼저 확인하도록 안내했던 핵심 6개 중 해양 3개와 해양환경공단 2개가 해결됐고, 기상특보는 코드 30을 유지했다.

최초 검사와 이번 재검증을 합쳐 실제 자료 수신 근거가 있는 체크리스트 항목은 20개다. 이 중 이번에 다시 호출하지 않은 기존 성공 항목은 최초 검사 시점의 결과를 유지하는 것이며 재검증 성공으로 집계하지 않았다.

## 새로 성공한 항목

| ID | 서비스 | 이번 결과 |
|---|---|---|
| MAP-02 | [Kakao 지도 REST/장소 검색 API](https://developers.kakao.com/docs/ko/kakaomap/rest-api) | HTTP 200, 실제 자료 수신 (2개 경로) |
| MAR-05 | [해양수산부 국립해양조사원_조위관측소 최신 관측데이터](https://www.data.go.kr/data/15155508/openapi.do) | HTTP 200, 실제 자료 수신 (1개 경로) |
| MAR-06 | [해양수산부 국립해양조사원_해양관측부이 최신 관측데이터](https://www.data.go.kr/data/15155516/openapi.do) | HTTP 200, 실제 자료 수신 (1개 경로) |
| MAR-08 | [해양수산부 국립해양조사원_조위관측소 실측·예측 조위 조회](https://www.data.go.kr/data/15142507/openapi.do) | HTTP 200, 실제 자료 수신 (1개 경로) |
| WQ-02 | [해양환경공단_해양환경측정망 관측서비스](https://www.data.go.kr/data/15059973/openapi.do) | HTTP 200, 실제 자료 수신 (1개 경로) |
| WQ-03 | [해양환경공단_해양환경측정망 정점조회 서비스](https://www.data.go.kr/data/15059966/openapi.do) | HTTP 200, 실제 자료 수신 (1개 경로) |

## 아직 확인할 항목

- **기상특보:** 핵심 우선 목록에서 남은 인증 거절 항목이다. 해당 서비스의 활용신청·승인 및 키 연결 반영 상태를 확인한다. [기상특보 신청 페이지](https://www.data.go.kr/data/15000415/openapi.do)
- **카카오 지도 JavaScript SDK:** REST 장소검색과 주소검색은 성공했지만 엑셀의 JavaScript 키로는 로컬·운영 origin 모두 HTTP 403, `App(Pongdang) disabled OPEN_MAP_AND_LOCAL service.` 응답이 계속됐다. 캐시를 피하는 쿼리와 no-cache 헤더로도 재확인했다. 이 결과만으로 서로 다른 앱의 키인지 또는 제공처 반영 문제인지는 확정할 수 없다. 엑셀 `키 묶음` 시트 D9가 활성화한 앱의 JavaScript 키인지, 그 앱의 카카오맵 사용 설정과 SDK 도메인을 확인한다. [공식 설정](https://developers.kakao.com/docs/ko/kakaomap/common)
- **API허브 AWS:** 이번 최종 결과는 **HTTP 200, 실제 관측 행 수신 미확인**. 최초 검사의 HTTP 403 활용신청 필요 오류 이후 이번 첫 요청은 20초 시간 초과, 45초 제한 재시도는 HTTP 200이었다. 최종 응답에서 신청 필요 오류는 확인되지 않았지만 관측 행을 확인하지 못했으므로 자료 수신 성공이나 승인 완료로 단정하지 않는다. [AWS 자료](https://apihub.kma.go.kr/apiList.do?seqApi=2&seqApiSub=239)

### 서비스 인증 거절이 유지된 목록

아래 항목은 현재 키로 HTTP 403, 코드 30, 등록되지 않은 서비스키 응답이다. 여러 서비스가 같은 키로 성공하므로 키 전체의 무효로 해석하지 않는다. 미신청이면 신청하고, 이미 신청했다면 승인·이용기간·키 연결 및 반영 상태를 확인한다. [공식 오류코드 설명](https://www.data.go.kr/tcs/dss/selectErrCodePopupView.do)

| ID | 서비스 | 신청·확인 링크 |
|---|---|---|
| AIR-01 | 한국환경공단_에어코리아_대기오염정보 | [공식 페이지](https://www.data.go.kr/data/15073861/openapi.do) |
| AIR-02 | 한국환경공단_에어코리아_측정소정보 | [공식 페이지](https://www.data.go.kr/data/15073877/openapi.do) |
| ASTRO-01 | 한국천문연구원_출몰시각 정보 | [공식 페이지](https://www.data.go.kr/data/15012688/openapi.do) |
| HYD-03 | 한국수자원공사_수문 방류정보 조회 서비스 | [공식 페이지](https://www.data.go.kr/data/15140222/openapi.do) |
| KMA-03 | 기상청_기상특보 조회서비스 | [공식 페이지](https://www.data.go.kr/data/15000415/openapi.do) |
| KMA-04 | 기상청_예보구역정보 조회서비스 | [공식 페이지](https://www.data.go.kr/data/15057111/openapi.do) |
| KMA-07 | 기상청_해양기상관측자료 조회서비스 (공공기관 대상 조건 확인) | [공식 페이지](https://www.data.go.kr/data/15043550/openapi.do) |
| MAR-10 | 해양수산부 국립해양조사원_조석예보(시계열) | [공식 페이지](https://www.data.go.kr/data/15156022/openapi.do) |
| MAR-11 | 해양수산부 국립해양조사원_해수유동 관측소 실측 유향·유속 | [공식 페이지](https://www.data.go.kr/data/15155531/openapi.do) |
| MAR-12 | 해양수산부 국립해양조사원_조류예보(시계열) | [공식 페이지](https://www.data.go.kr/data/15156024/openapi.do) |
| MAR-14 | 해양수산부 국립해양조사원_ROMS 수치예측모델 조회 | [공식 페이지](https://www.data.go.kr/data/15142227/openapi.do) |
| TOUR-02 | 한국관광공사_영문 관광정보 서비스_GW | [공식 페이지](https://www.data.go.kr/data/15101753/openapi.do) |
| TOUR-03 | 한국관광공사_일문 관광정보 서비스_GW | [공식 페이지](https://www.data.go.kr/data/15101760/openapi.do) |
| TOUR-04 | 한국관광공사_중문 간체 관광정보 서비스_GW | [공식 페이지](https://www.data.go.kr/data/15101764/openapi.do) |
| TOUR-05 | 한국관광공사_중문 번체 관광정보 서비스_GW | [공식 페이지](https://www.data.go.kr/data/15101769/openapi.do) |
| TOUR-06 | 한국관광공사_빅데이터_지역별 방문자수_GW | [공식 페이지](https://www.data.go.kr/data/15101972/openapi.do) |
| WQ-04 | 해양환경공단_해양수질자동측정망 특별관리해역 관측서비스 | [공식 페이지](https://www.data.go.kr/data/15059977/openapi.do) |

## 이번 검사 전후 비교

| ID | 경로 또는 구분 | 이전 | 이번 |
|---|---|---|---|
| MAR-05 | https://apis.data.go.kr/1192136/dtRecent/GetDTRecentApiService | 인증 거절: 코드 30 | 성공: 실제 1행 |
| MAR-06 | https://apis.data.go.kr/1192136/twRecent/GetTWRecentApiService | 인증 거절: 코드 30 | 성공: 실제 1행 |
| MAR-08 | https://apis.data.go.kr/1192136/surveyTideLevel/GetSurveyTideLevelApiService | 인증 거절: 코드 30 | 성공: 실제 1행 |
| MAR-10 | https://apis.data.go.kr/1192136/tideFcstTime/GetTideFcstTimeApiService | 인증 거절: 코드 30 | 인증 거절: 코드 30 |
| MAR-11 | https://apis.data.go.kr/1192136/hfCurrent/GetHFCurrentApiService | 인증 거절: 코드 30 | 인증 거절: 코드 30 |
| MAR-12 | https://apis.data.go.kr/1192136/crntFcstTime/GetCrntFcstTimeApiService | 인증 거절: 코드 30 | 인증 거절: 코드 30 |
| MAR-13 | https://apis.data.go.kr/1192136/noonWave/GetNoonWaveApiService | 성공: 실제 1행 | 성공: 실제 1행 |
| MAR-14 | https://apis.data.go.kr/1192136/roms/GetRomsApiService | 인증 거절: 코드 30 | 인증 거절: 코드 30 |
| KMA-01 | 단기예보 | 성공: 실제 2행 | 성공: 실제 1행 |
| KMA-03 | 특보목록 | 인증 거절: 코드 30 | 인증 거절: 코드 30 |
| KMA-04 | 예보구역코드 | 인증 거절: 코드 30 | 인증 거절: 코드 30 |
| KMA-06 | API허브 해양기상부이 | 성공: 실제 2행 | 성공: 실제 2행 |
| KMA-06 | API허브 AWS | 활용신청 필요: API허브가 AWS API 활용신청을 명시적으로 요구 | HTTP 200, 실제 관측 행 수신 미확인 |
| KMA-07 | 해양기상 파고부이 | 인증 거절: 코드 30 | 인증 거절: 코드 30 |
| AIR-01 | 대기오염 실측 | 인증 거절: 코드 30 | 인증 거절: 코드 30 |
| AIR-02 | 측정소정보 | 인증 거절: 코드 30 | 인증 거절: 코드 30 |
| ASTRO-01 | 서울 출몰시각 | 인증 거절: 코드 30 | 인증 거절: 코드 30 |
| WQ-02 | https://apis.data.go.kr/B553931/service/OceansNemoService2/getOceansNemo2 | 인증 거절: 코드 30 | 성공: 실제 1행 |
| WQ-03 | https://apis.data.go.kr/B553931/service/OceansNemoInfoService1/getOceansNemoInfo1 | 인증 거절: 코드 30 | 성공: 실제 1행 |
| WQ-04 | https://apis.data.go.kr/B553931/service/OceansWemoService1/getOceansWemo1 | 인증 거절: 코드 30 | 인증 거절: 코드 30 |
| TOUR-02 | https://apis.data.go.kr/B551011/EngService2/locationBasedList2 | 인증 거절: 코드 30 | 인증 거절: 코드 30 |
| TOUR-03 | https://apis.data.go.kr/B551011/JpnService2/locationBasedList2 | 인증 거절: 코드 30 | 인증 거절: 코드 30 |
| TOUR-04 | https://apis.data.go.kr/B551011/ChsService2/locationBasedList2 | 인증 거절: 코드 30 | 인증 거절: 코드 30 |
| TOUR-05 | https://apis.data.go.kr/B551011/ChtService2/locationBasedList2 | 인증 거절: 코드 30 | 인증 거절: 코드 30 |
| TOUR-06 | https://apis.data.go.kr/B551011/DataLabService/locgoRegnVisitrDDList | 인증 거절: 코드 30 | 인증 거절: 코드 30 |
| HYD-03 | https://apis.data.go.kr/B500001/DamDisChargeInfo/flugdschginfo | 인증 거절: 코드 30 | 인증 거절: 코드 30 |
| TOUR-01 | https://apis.data.go.kr/B551011/KorService2/locationBasedList2 | 성공: 실제 1행 | 성공: 실제 1행 |
| MAP-02 | https://dapi.kakao.com/v2/local/search/keyword.json | 카카오맵 비활성화 응답 | 성공: 실제 1행 |
| MAP-02 | https://dapi.kakao.com/v2/local/search/address.json | 카카오맵 비활성화 응답 | 성공: 실제 1행 |
| MAP-01 | http://localhost:5173 | 카카오맵 비활성화 응답 | 카카오맵 비활성화 응답 |
| MAP-01 | https://bonifacio.work | 카카오맵 비활성화 응답 | 카카오맵 비활성화 응답 |
| MAP-03 | 미호출 | 실제 키 미입력, 호출 제외 | 실제 키 미입력, 호출 제외 |

## 새로 받은 공개 데이터 표본

표본의 관측 시각과 대상 지점을 함께 확인해야 한다. 전국 관측자료 첫 행을 받았다는 사실은 강릉 대상 지점의 매핑 완료를 의미하지 않는다.

### MAR-05 해양수산부 국립해양조사원_조위관측소 최신 관측데이터

```json
{
  "obsvtrNm": "군산",
  "lot": 126.56305,
  "lat": 35.97555,
  "obsrvnDt": "2026-09-13 23:00",
  "wspd": 4.5,
  "artmp": 23.2,
  "wtem": 25.0,
  "bscTdlvHgt": 78.0,
  "crdir": null,
  "crsp": null
}
```

### MAR-06 해양수산부 국립해양조사원_해양관측부이 최신 관측데이터

```json
{
  "obsvtrNm": "경포대해수욕장",
  "lot": 128.93188,
  "lat": 37.80897,
  "obsrvnDt": "2026-09-13 23:00",
  "wspd": 3.6,
  "artmp": 23.2,
  "wvhgt": 0.4,
  "wvpd": 5.0,
  "crdir": 323.91,
  "crsp": 19.9,
  "wtem": 23.18
}
```

### MAR-08 해양수산부 국립해양조사원_조위관측소 실측·예측 조위 조회

```json
{
  "obsvtrNm": "인천",
  "lat": 37.45194,
  "lot": 126.59222,
  "obsrvnDt": "2026-09-13 00:00",
  "bscTdlvHgt": 30.0,
  "tdlvHgt": 9.0
}
```

### WQ-02 해양환경공단_해양환경측정망 관측서비스

```json
{
  "oceanNm": "남해",
  "stnpntCode": "021803",
  "stnpntKoreanNm": "섬진강하구3",
  "obsrYear": "2025",
  "obsrMt": "08",
  "obsrDe": "2025-08-22",
  "wtrtmpSfclyr": "28.488",
  "doxySfclyr": "8.508"
}
```

### WQ-03 해양환경공단_해양환경측정망 정점조회 서비스

```json
{
  "stnpnt_code": "021803",
  "ocean_nm": "남해",
  "lon": "127.7863888889",
  "lat": "35.0166666667"
}
```

### MAP-02 Kakao 지도 REST/장소 검색 API

```json
{
  "place_name": "경포해수욕장",
  "address_name": "강원특별자치도 강릉시 강문동 산 1",
  "x": "128.910210247605",
  "y": "37.8034055083125"
}
```

### MAP-02 Kakao 지도 REST/장소 검색 API

```json
{
  "address_name": "강원특별자치도 강릉시 창해로 514",
  "x": "128.907481194757",
  "y": "37.8057701120176"
}
```

## 검사 범위

- 현재 맥에서 공식 HTTPS API를 소량 조회했다. 운영 서버 IP와 실제 브라우저 지도 렌더링은 검증하지 않았다.
- 앱 코드·엑셀·DB는 변경하지 않았고 자동 수집이나 DB 적재를 실행하지 않았다.
- 네이버·WAMIS에는 실제 키가 없어 해당 API 인증 호출을 하지 않았다.

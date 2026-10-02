import { t } from "./i18n";
import { AppShell } from "./AppShell";
import { ScoreExplainer } from "./pongdangUi";
import "./dataSourcesPage.css";

/** 사용자용 「데이터 출처」.
 *
 *  사이드 메뉴의 「데이터 출처와 갱신」은 `DataWorkspace` + `DataInfoPage` 로
 *  이어져 있었습니다. 그 화면은 테이블 코드명 · 수집 작업 이름 ·
 *  은퇴한 합성 예시의 내부 이력 · 「앱 화면 / 포트폴리오」 구분을 담은
 *  **개발자 콘솔**입니다. 쓰는 사람이 그 문을 열면
 *  자기가 볼 화면이 아니라는 것만 알게 됩니다.
 *
 *  그 화면은 `#info?dev=1` 로 남겨 두고, 이 자리에는 세 가지만 둡니다:
 *  **누가 준 자료인지 · 얼마나 자주 받는지 · 점수를 어떻게 매기는지.**
 *
 *  제공 기관 이름과 쓰임은 수집기가 실제로 쓰는 provider 에서 왔습니다
 *  (`backend/app/ingestion/*.py`). 여기서 새로 지어낸 출처는 없습니다.
 */

interface Source {
  name: string;
  what: string;
  cadence: string;
}

/** 제공 기관과 받는 자료. 수집기의 provider 와 1:1 입니다 -- 이 표에만 있고
 *  수집기에 없는 기관을 적으면 화면이 없는 출처를 주장하는 셈입니다. */
const SOURCES: Source[] = [
  {
    name: "기상청",
    what: "기온 · 습도 · 바람 · 강수 · 단기 예보 · 특보 · 자외선",
    cadence: "관측은 수십 분, 예보는 발표 주기마다",
  },
  {
    name: "국립해양조사원",
    what: "수온 · 파고 · 파주기 · 조위 · 유속 · 만조와 간조 예측",
    cadence: "관측은 수십 분, 조석 예측은 발표 주기마다",
  },
  {
    name: "해양환경공단",
    what: "해역 수질 조사 결과와 조사 지점",
    cadence: "조사 일정에 따라 (수개월 간격일 수 있습니다)",
  },
  {
    name: "국립환경과학원",
    what: "하천 · 호소 수질 조사 결과",
    cadence: "조사 일정에 따라",
  },
  {
    name: "국립수산과학원",
    what: "연안 실시간 수온",
    cadence: "한 시간 단위",
  },
  {
    name: "한국수자원조사기술원",
    what: "하천 수위",
    cadence: "관측 주기마다",
  },
  {
    name: "한국관광공사 TourAPI",
    what: "장소 이름 · 주소 · 개장 기간 · 이용시간 · 편의시설 · 사진",
    cadence: "제공처가 고칠 때마다",
  },
  {
    name: "카카오 로컬",
    what: "주변 음식점 · 카페 · 명소와 행정구역 확인",
    cadence: "조회할 때마다",
  },
  {
    name: "한국천문연구원",
    what: "일출 · 일몰 시각",
    cadence: "하루 단위",
  },
  {
    name: "Windy Webcams",
    what: "물가 라이브캠 목록과 미리보기",
    cadence: "목록 유효기간마다",
  },
];

export function DataSourcesPage() {
  return (
    <AppShell tab={undefined} title={t("데이터 출처")}>
      <div className="pd-card ds-card">
        <div className="pd-card-title">{t("어디서 받은 자료인가요")}</div>
        <p className="pd-note">
          {t("퐁당은 공공기관이 공개한 자료를 그대로 받아서 보여 줍니다. 값을 보정하거나 빈 값을 채우지 않습니다.")}
        </p>
        <dl className="ds-sources">
          {SOURCES.map((source) => (
            <div className="ds-source" key={source.name}>
              <dt>{t(source.name)}</dt>
              <dd>
                <span className="ds-what">{t(source.what)}</span>
                <span className="ds-cadence">{t(source.cadence)}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="pd-card ds-card">
        <div className="pd-card-title">{t("얼마나 자주 갱신되나요")}</div>
        <p className="pd-note">
          {t("화면은 30분마다 자료를 다시 확인합니다. 각 숫자 옆의 「마지막 업데이트」가 그 값이 언제 기준인지 말합니다 — 새 자료가 아직 없으면 이전 값을 그대로 두고, 임의로 바꾸지 않습니다.")}
        </p>
        <p className="pd-note">
          {t("기관마다 공개 주기가 다릅니다. 수질 조사처럼 몇 달에 한 번인 자료는 오래된 날짜가 그대로 보일 수 있고, 그 날짜를 숨기지 않습니다.")}
        </p>
      </div>

      <div className="pd-card ds-card">
        <div className="pd-card-title">{t("점수는 어떻게 매기나요")}</div>
        <p className="pd-note">
          {t("고른 활동을 하기에 지금 조건이 얼마나 맞는지를 0~100으로 나타낸 참고 점수입니다. 활동마다 보는 조건이 다르고, 실제로 측정값이 들어온 항목만 같은 비중으로 평균냅니다 — 없는 값을 0점으로 넣지 않습니다.")}
        </p>
        {/* 척도 · 계산 방식 · 출처 전문은 이미 한 곳에 있습니다. 같은 설명을 두
            군데 적으면 한쪽만 고쳐집니다. */}
        <ScoreExplainer />
        <p className="pd-note">
          {t("점수는 참고용이며 안전 판정이 아닙니다. 공식 운영 여부와 현장 상황은 따로 확인해 주세요.")}
        </p>
      </div>
    </AppShell>
  );
}

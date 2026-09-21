import { t } from "./i18n.ts";
import { useMemo, useState } from "react";
import { KakaoMapCanvas, type MapControlApi } from "./KakaoMapCanvas";
import { gradeOf } from "./groupAGrade";
import { MASCOT_ALT, mascotUrl } from "./mascots";
import { DESKTOP_MAP } from "./desktopMap";
import {
  DesktopMapShell,
  DesktopNav,
  DesktopShell,
  FootNote,
} from "./pongdangDesktop";
import {
  ComponentBars,
  GradeIcon,
  Icon,
  ScoreExplainer,
  ScoreReason,
  Skeleton,
  StateChip,
} from "./pongdangUi";
import { EvidenceNote } from "./EvidenceNote";
import { activities, type Activity } from "./aiApi";
import { componentBars, scoreReason, scoreTitle } from "./scoreMeaning";
import {
  conditionScore,
  dateLabel,
  formatValue,
  metricText,
  type ConditionSummary,
  type Place,
} from "./productData";
import { isInitialLoad } from "./useResource";
import { useConditions } from "./useConditions";
import { useConditionSummaries } from "./useConditionSummaries";
import { mappablePlaces } from "./useWaterPlaces";
import { useWaterPlaceBrowser } from "./useWaterPlaceBrowser";
import { WaterPlaceFilters, WaterPlacePagination } from "./WaterPlaceControls";
import { usePlacesById } from "./usePlacesById";
import { spotLink } from "./spotsRoute";
import "./mapDesktop.css";

// 데스크탑 지도입니다. 지도가 화면의 지배 요소입니다.
//
// 핸드오프 18c 는 「얇은 띠 히어로 + 352px 목록 | 지도」 2열이었습니다. 그
// 구성에서는 지도가 아무리 커도 화면의 한 칸이고, 근거 · 저장 코스를 읽으려면
// 지도를 스크롤 밖으로 밀어내야 했습니다. 그래서 **지도를 뷰포트 전체로 띄우고
// 나머지를 그 위에 얹는** 구성으로 바꿨습니다(DesktopMapShell).
//
// 디자인 시스템 v2 는 그대로 지킵니다: 히어로(코발트) 레이어의 역할이 원래
// 「오늘의 상태 · 지도 · 라이브캠」이므로(§01) 지도 면이 곧 히어로 레이어이고,
// 코발트 면은 상단 네비 띠 하나뿐입니다(§07 히어로는 화면당 하나). 검색 · 목록 ·
// 근거 · 상태 칩은 전부 밝은 레이어 패널 안에 둡니다(§07).
//
// 예전에는 이 화면에 훅이 하나도 없었습니다. 지점 목록 · 수온 · 근거 막대 ·
// 편의 시설이 전부 파일 안 상수였고, 같은 라우트의 모바일 지도는 그동안 실제
// 장소와 조건을 읽고 있었습니다. 이제 모바일과 **같은 훅**을 씁니다.
//
// 지도 컴포넌트는 모바일과 같은 KakaoMapCanvas 를 그대로 씁니다 -- 데스크탑
// 비율로 커졌을 뿐입니다.

/** 점수를 매길 활동. 모바일 지도는 수영 기준이므로 같은 기준을 씁니다. */
const ACTIVITY: Activity = "swim";

/** 지점 한 줄.
 *
 *  **스스로 조회하지 않습니다.** 예전에는 줄마다 useConditions 를 불렀고,
 *  목록이 100줄이면 지도에 들어가는 것만으로 조건 조회가 100건 나갔습니다.
 *  서버의 연결 슬롯은 네 개뿐이라 그 요청들은 서로를 굶겨 상당수가 503 으로
 *  돌아왔고, 만료된 근거를 만나면 줄마다 재조회 루프까지 돌았습니다.
 *
 *  이제 목록 전체의 요약을 MapDesktop 이 한 번(묶음당 한 요청) 조회해
 *  내려줍니다. 한 줄이 쓰는 사실은 그대로입니다. */
function SpotRow({
  place,
  summary,
  loading,
  selected,
  onSelect,
}: {
  place: Place;
  summary?: Pick<ConditionSummary, "condition_score" | "water_temperature" | "retained">;
  loading: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const score = conditionScore(summary);
  const grade = gradeOf(score);
  return (
    <button
      type="button"
      className={"mk-spot" + (selected ? " is-selected" : "")}
      data-grade={grade.key}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="pd-dk-num mk-spot-score">
        {loading ? <Skeleton width="1.6em" label={t("점수 조회 중")} /> : (score ?? "–")}
      </span>
      <span className="mk-spot-body">
        <span className="mk-spot-name">{place.name}</span>
        <span className="mk-spot-grade">
          <GradeIcon gradeKey={grade.key} size={12} />
          {t(grade.label)}
          {summary?.retained && <> · {t("이전 관측")}</>}
        </span>
      </span>
      <span className="pd-dk-num mk-spot-temp">
        {formatValue(summary?.water_temperature?.value, summary?.water_temperature?.unit)}
      </span>
    </button>
  );
}

export function MapDesktop() {
  // 지도 조작 API 는 지도가 준비된 뒤 effect 에서 넘어옵니다.
  const [mapApi, setMapApi] = useState<MapControlApi | null>(null);
  const browser = useWaterPlaceBrowser();
  const { search, setSearch, places } = browser;
  const [selectedId, setSelectedId] = useState<number | null>(() => {
    const value = Number(
      new URLSearchParams(window.location.hash.split("?")[1]).get("spot_id"),
    );
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  });
  const selectedPlace = usePlacesById(selectedId === null ? [] : [selectedId]);
  const allRows = useMemo(
    () => [...new Map(
      [...(places.rows ?? []), ...selectedPlace.rows].map((place) => [place.id, place]),
    ).values()],
    [places.rows, selectedPlace.rows],
  );
  const pinned = useMemo(() => mappablePlaces(allRows), [allRows]);
  const markers = useMemo(
    () =>
      pinned.map(({ place, latitude, longitude }) => ({
        id: String(place.id),
        latitude,
        longitude,
      })),
    [pinned],
  );
  const rows = useMemo(() => pinned.map(({ place }) => place), [pinned]);
  const selected = selectedId !== null
    ? allRows.find((place) => place.id === selectedId)
    : rows.find((place) => place.id === places.defaultPlaceId) ?? rows[0];
  // 목록 전체의 점수 · 수온은 **묶음으로 한 번** 조회합니다. 줄마다 부르지
  // 않습니다(useConditionSummaries 의 주석 참고).
  const summaries = useConditionSummaries(
    useMemo(() => (places.rows ?? []).map((place) => place.id), [places.rows]),
    ACTIVITY,
  );
  // 오른쪽 패널과 아래 근거는 고른 지점 하나만 조회합니다.
  const conditions = useConditions(selected?.id, ACTIVITY, undefined, !!selected);
  const selectedScore = conditionScore(conditions.data);
  const selectedGrade = gradeOf(selectedScore);
  const unmapped = allRows.length - pinned.length;

  return (
    <DesktopShell fullscreen>
      <DesktopMapShell
        nav={
          <DesktopNav
            active="map"
            context={t("{region} · {date} · 지도에 표시된 지점 {count}곳", { region: browser.regionLabel, date: dateLabel(), count: pinned.length })}
            onMap
          />
        }
        map={
          <KakaoMapCanvas
            markers={markers}
            selectedId={selected ? String(selected.id) : null}
            insets={{
              top: DESKTOP_MAP.nav,
              left: DESKTOP_MAP.panel,
              right: selected ? DESKTOP_MAP.panel : DESKTOP_MAP.edge,
              bottom: DESKTOP_MAP.edge,
            }}
            renderMarker={(id) => {
              const place = rows.find((item) => item.id === Number(id));
              if (!place) return null;
              // 핀마다 조회하지 않습니다 -- 그러면 100번이 됩니다. 목록과 같은
              // 묶음 요약을 읽으므로 고르기 전에도 점수를 말할 수 있습니다.
              const isSelected = place.id === selected?.id;
              const score = isSelected
                ? selectedScore
                : conditionScore(summaries.byId.get(place.id));
              const grade = gradeOf(score);
              return (
                <button
                  type="button"
                  className={"mk-pin" + (isSelected ? " is-selected" : "")}
                  data-grade={grade.key}
                  aria-pressed={isSelected}
                  aria-label={t("{name} 퐁당 {score} {grade}", { name: place.name, score: score ?? "–", grade: t(grade.label) })}
                  onClick={() => setSelectedId(place.id)}
                >
                  <span className="pd-dk-num mk-pin-core">{score ?? "–"}</span>
                  <span className="mk-pin-label">{place.name}</span>
                </button>
              );
            }}
            onReady={setMapApi}
          />
        }
      >
        <aside className="pd-dk-mappanel is-start" aria-label={t("지점 목록")}>
          {/* 예전에는 지도 면 왼쪽 위에 떠 있던 뱃지입니다. 풀스크린에서는
              지도 위에 설 자리가 패널과 겹치므로 패널의 첫 줄로 들어왔습니다. */}
          <div className="pd-dk-mappanel-badge">{t("카카오 지도 · 보이는 지점의 점수를 묶어서 조회합니다")}</div>
          {/* 예전에는 히어로에 「수영 · 서핑 · 온천 · 주차 · 샤워장」 필터가
              있었고 눌러도 목록이 바뀌지 않았습니다. 동작하지 않는 컨트롤은
              두지 않습니다. 대신 실제로 목록을 바꾸는 검색을, 걸러낼 지점 목록
              바로 위에 둡니다. */}
          <label className="mk-search">
            <Icon name="search" size={17} />
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setSelectedId(null);
              }}
              maxLength={100}
              placeholder={t("장소명 · 지역 검색")}
              aria-label={t("장소명·지역 검색")}
            />
          </label>
          <WaterPlaceFilters
            district={browser.district} kind={browser.kind}
            onDistrict={(district) => { browser.setDistrict(district); setSelectedId(null); }}
            onKind={(kind) => { browser.setKind(kind); setSelectedId(null); }}
          />

          <div className="pd-dk-kick mk-side-kick">
            {t("지점 {count}곳 · {activity} 점수", { count: pinned.length, activity: t(activities[ACTIVITY]) })}
          </div>
          {selectedId !== null && !selected && (
            <p className="mk-note" role={selectedPlace.error ? "alert" : "status"}>
              {selectedPlace.error ?? (selectedPlace.loading
                ? t("선택한 장소를 조회하고 있습니다.")
                : t("선택한 장소를 찾을 수 없습니다."))}
            </p>
          )}
          {rows.map((place) => (
            <SpotRow
              key={place.id}
              place={place}
              summary={place.id === selected?.id ? {
                retained: conditions.data?.retained,
                condition_score: conditions.data?.condition_score,
                water_temperature: conditions.data?.metrics.find((metric) => metric.name === "water_temperature"),
              } : summaries.byId.get(place.id)}
              loading={place.id === selected?.id ? conditions.loading : summaries.loading}
              selected={place.id === selected?.id}
              onSelect={() => setSelectedId(place.id)}
            />
          ))}
          {!rows.length && (
            <p className="mk-note" role={places.error ? "alert" : "status"}>
              {places.error ??
                (places.loading ? t("장소를 조회하고 있습니다.") : t("검색 결과 없음"))}
            </p>
          )}

          <WaterPlacePagination {...places} count={places.rows?.length ?? 0} onPage={(page) => { browser.setPage(page); setSelectedId(null); }} />
          <p className="mk-note">{t("현재 페이지와 선택한 장소 중 좌표가 있는 곳을 표시합니다.")}{unmapped > 0 &&
              t(" 좌표가 아직 확인되지 않은 {count}곳은 지도에 찍지 않았습니다 — 없는 위치를 임의로 만들지 않습니다.", { count: unmapped })}
          </p>
          <div className="mk-alert">
            <Icon name="warning" size={15} />{t("값이 없는 상태가 안전을 뜻하지 않습니다")}</div>
        </aside>

        <div className="pd-dk-mapcontrols">
          <button type="button" aria-label={t("확대")} onClick={() => mapApi?.zoomIn()}>
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
          <button type="button" aria-label={t("축소")} onClick={() => mapApi?.zoomOut()}>
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M5 12h14" />
            </svg>
          </button>
          <button
            type="button"
            className="is-accent"
            aria-label={t("현재 위치로 이동")}
            onClick={() => void mapApi?.locate()}
          >
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
            </svg>
          </button>
        </div>

        {/* 오른쪽 패널. 예전에는 지도 위에 뜬 작은 카드(이름 · 점수)와, 스크롤을
            내려야 나오는 근거 행이 따로 있었습니다. 고른 지점에 대해 화면이 할
            말은 하나이므로 한 패널에 모읍니다 -- 지점 · 점수 · 근거 막대 · 설명 ·
            상세 링크, 그리고 전역 주의 문구까지.

            예전에는 근거 막대가 「파고 0.6m 적정 72%」처럼 지어낸 비율이었고,
            편의 시설은 주차 · 샤워장이 늘 「있음」이었습니다. 이제 점수를 이루는
            실제 항목을 그립니다. 편의 시설을 내려주는 API 는 없으므로 그 칸은
            없앴습니다 -- 「정보 없음」 아이콘만 남기면 있는 기능처럼 보입니다. */}
        <aside className="pd-dk-mappanel is-end" aria-label={t("선택 지점 근거")}>
          <div className="pd-dk-kick mk-evidence-kick">{t("선택 지점")}</div>
          {selected ? (
            <>
              <div className="mk-detail-head">
                <img
                  src={mascotUrl("swim")}
                  alt={MASCOT_ALT}
                  width={52}
                  height={52}
                />
                <div className="mk-detail-lead">
                  <div className="mk-detail-name">{selected.name}</div>
                  <div className="mk-detail-meta">
                    {selected.address ?? t("주소 없음")} {t("· 수온")}{" "}
                    {metricText(conditions.data, "water_temperature")}
                  </div>
                </div>
                <div className="mk-detail-score" data-grade={selectedGrade.key}>
                  <div className="pd-dk-num mk-detail-score-num">
                    {isInitialLoad(conditions) ? (
                      <Skeleton width="1.4em" label={t("점수 조회 중")} />
                    ) : (
                      (selectedScore ?? "–")
                    )}
                  </div>
                  <div className="mk-detail-score-grade">
                    <GradeIcon gradeKey={selectedGrade.key} size={13} />
                    {selectedGrade.label}
                  </div>
                </div>
              </div>
              <div className="mk-detail-actions">
                <a className="pd-dk-button" href="#my-courses">{t("코스에 추가")}</a>
                <a className="mk-detail-link" href={spotLink(selected)}>
                  {selected.name} {t("상세 →")}</a>
              </div>
              <div className="mk-evidence-head-row">
                <h2 className="mk-evidence-title">
                  {activities[ACTIVITY]} {t("점수 근거")}</h2>
                <StateChip kind={conditions.data ? "live" : "no_data"} />
              </div>
              <p className="mk-note">
                {t("{score}를 이루는 항목입니다. 각 조건의 점수를 같은 비중으로 평균낸 값이 총점입니다.", { score: scoreTitle(ACTIVITY) })}</p>
              <ComponentBars
                bars={componentBars(conditions.data)}
                loading={isInitialLoad(conditions)}
              />
              <ScoreReason
                text={scoreReason(conditions.data).text}
                loading={isInitialLoad(conditions)}
              />
              <EvidenceNote
                data={conditions.data}
                className="mk-note"
                chip={false}
              />
              <ScoreExplainer data={conditions.data} />
            </>
          ) : (
            <p className="mk-note" role="status">{t("지점을 고르면 그 지점의 점수 근거를 조회합니다.")}</p>
          )}

          {/* 전역 주의 문구입니다. 페이지가 스크롤되지 않으므로 화면 아래에 둘
              자리가 없어 이 패널의 마지막에 들어옵니다 -- 자리를 옮겼을 뿐
              생략하지 않습니다. */}
          <FootNote
            wave={false}
            missing={t("편의 시설 · 안전요원 정보 · 조위 시계열")}
            note={t("마커 좌표는 서버가 준 실제 값입니다. 목록의 점수는 지점마다 따로 묻지 않고 묶어서 한 번에 조회하며, 근거가 없는 지점은 «–» 입니다. NULL · unknown 은 안전한 상태를 뜻하지 않습니다.")}
          />
        </aside>
      </DesktopMapShell>
    </DesktopShell>
  );
}

import { t } from "./i18n";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { KakaoMapsLoadError, loadKakaoMaps, type KakaoMap, type KakaoMapsNamespace } from "./kakaoMaps";
import { createKakaoMapScene, type MapInsets, type MapMarker, type MountedMarker } from "./kakaoMapScene";
import "./kakaoMap.css";

const NO_PATHS: readonly (readonly (readonly number[])[])[] = [];
export type { MapInsets } from "./kakaoMapScene";

/** 지도 위에 얹는 컨트롤이 쓸 수 있는 조작입니다. 지도 인스턴스 자체를 밖으로
 *  내보내지 않고, 실제로 동작하는 조작만 좁게 넘깁니다. */
export interface MapControlApi {
  zoomIn(): void;
  zoomOut(): void;
  /** 브라우저 위치 권한으로 현재 위치로 이동합니다. 권한이 없거나 실패하면
   *  아무 일도 하지 않고 false 를 돌려줍니다 -- 실패를 성공처럼 보이게 하지
   *  않습니다. */
  locate(): Promise<boolean>;
}

/** 지도 인스턴스를 밖으로 내보내지 않고, 조작만 감싸 넘깁니다. */
function mapControls(map: KakaoMap, sdk: KakaoMapsNamespace): MapControlApi {
  return {
    zoomIn: () => map.setLevel(Math.max(1, map.getLevel() - 1)),
    zoomOut: () => map.setLevel(Math.min(14, map.getLevel() + 1)),
    locate: () =>
      new Promise<boolean>((resolve) => {
        if (!navigator.geolocation) return resolve(false);
        navigator.geolocation.getCurrentPosition(
          (position) => {
            map.setCenter(
              new sdk.LatLng(
                position.coords.latitude,
                position.coords.longitude,
              ),
            );
            resolve(true);
          },
          // 권한 거부 · 실패는 조용히 false 입니다. 실패를 성공처럼 보이게
          // 하지 않습니다.
          () => resolve(false),
          { timeout: 10000 },
        );
      }),
  };
}

export function KakaoMapCanvas({ markers, selectedId, renderMarker, paths = NO_PATHS, overlay, onReady, insets, preserveViewport = false }: {
  markers: readonly MapMarker[];
  paths?: readonly (readonly (readonly number[])[])[];
  selectedId: string | null;
  renderMarker: (id: string) => ReactNode;
  /** 지도 면 위에 겹쳐 그릴 것(뱃지 · 컨트롤 · 선택 패널). 지도가 뜬 뒤에만
   *  보입니다. */
  overlay?: ReactNode;
  /** 지도가 준비되면 조작 API 를, 정리되면 null 을 넘깁니다. 렌더 중이 아니라
   *  effect 안에서 호출되므로 부모는 이 값을 state 에 담아 두면 됩니다. */
  onReady?: (api: MapControlApi | null) => void;
  /** 패널이 덮는 가장자리. **주면 아래 .wim-panel 추정은 쓰지 않습니다.**
   *  풀스크린 지도처럼 좌 · 우 · 아래를 동시에 덮는 화면은 추정으로 맞출 수
   *  없으므로 화면이 직접 말합니다. */
  insets?: MapInsets;
  /** 코스를 편집하는 동안에는 마커·경로만 갱신하고 사용자가 보던 위치를 유지합니다. */
  preserveViewport?: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  // insets 는 지도 생성 effect 의 의존성에 **넣지 않습니다.** 넣으면 패널이
  // 열리고 닫힐 때마다 지도를 통째로 다시 만듭니다(report.md R01 과 같은
  // 함정). 최신 값만 ref 로 들고 가고, 바뀌면 fit() 만 다시 부릅니다.
  const insetsRef = useRef(insets);
  const preserveViewportRef = useRef(preserveViewport);
  useEffect(() => {
    insetsRef.current = insets;
    preserveViewportRef.current = preserveViewport;
  });
  // 객체 참조가 아니라 값으로 비교해야 매 렌더 새로 만든 리터럴에 반응하지
  // 않습니다.
  const insetsKey = JSON.stringify(insets ?? null);
  // onReady 를 지도 생성 effect 의 의존성에 넣으면, 부모가 인라인 함수를 넘길
  // 때마다 지도를 통째로 다시 만들게 됩니다. 최신 콜백만 ref 로 들고 갑니다.
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  });
  const [attempt, setAttempt] = useState(0);
  const runtime = useRef<{
    scene: ReturnType<typeof createKakaoMapScene>;
    resize: ResizeObserver;
  } | null>(null);
  const [result, setResult] = useState<{
    attempt: number;
    markers: MountedMarker[];
    scene?: ReturnType<typeof createKakaoMapScene>;
    boundsKey?: string;
    error?: string;
  }>();
  const active = result?.attempt === attempt ? result : undefined;

  // 지도 수명은 화면/재시도에만 묶습니다. 순서·선택 변경은 아래에서 내용만 갱신합니다.
  useEffect(() => () => {
    onReadyRef.current?.(null);
    runtime.current?.resize.disconnect();
    runtime.current?.scene.destroy();
    runtime.current = null;
  }, [attempt]);

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const controller = new AbortController();

    void loadKakaoMaps(import.meta.env.VITE_KAKAO_MAP_KEY ?? "", controller.signal)
      .then((sdk) => {
        if (controller.signal.aborted) return;
        if (!runtime.current) {
          const scene = createKakaoMapScene(element, sdk);
          const resize = new ResizeObserver(() => {
            scene.map.relayout();
            if (scene.hasFitted() && !preserveViewportRef.current) scene.fit(insetsRef.current);
          });
          runtime.current = { scene, resize };
          resize.observe(element);
          onReadyRef.current?.(mapControls(scene.map, sdk));
        }
        const { scene } = runtime.current;
        const content = scene.update(markers, paths);
        setResult(previous => previous?.attempt === attempt && previous.scene === scene
          && previous.markers === content.markers && previous.boundsKey === content.boundsKey
          ? previous : { attempt, scene, ...content });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          onReadyRef.current?.(null);
          runtime.current?.resize.disconnect();
          runtime.current?.scene.destroy();
          runtime.current = null;
          setResult({ attempt, markers: [], error: error instanceof KakaoMapsLoadError
            ? error.message
            : "카카오 지도를 불러오지 못했습니다. 지도 사용 설정이나 네트워크 연결을 확인해 주세요." });
        }
      });
    return () => controller.abort();
  }, [attempt, markers, paths]);

  useEffect(() => {
    // Portal contents are mounted after the SDK creates its empty containers.
    // Reapply them so Kakao measures the final button size for its anchors.
    active?.scene?.refreshMarkers();
  }, [active]);

  useEffect(() => {
    active?.markers.forEach(({ id, overlay }) => overlay.setZIndex(id === selectedId ? 3 : 2));
  }, [active, selectedId]);

  // 패널이 열리고 닫혀 덮이는 면적이 달라지면 화면을 다시 맞춥니다. 지도를
  // 다시 만들지는 않습니다 -- fit() 만 부릅니다.
  useEffect(() => {
    if (!preserveViewport || !active?.scene?.hasFitted()) active?.scene?.fit(insetsRef.current);
  }, [active, insetsKey, preserveViewport]);

  return (
    <>
      <div className="wim-map-canvas" ref={container} role="region" aria-label={t("카카오 지도")} />
      {active && !active.error && overlay}
      {!active && <div className="wim-map-status" role="status">{t("지도를 불러오는 중입니다.")}</div>}
      {active?.error && (
        <div className="wim-map-status">
          <p role="alert">{t(active.error)}</p>
          <button onClick={() => setAttempt((value) => value + 1)}>{t("지도 다시 불러오기")}</button>
        </div>
      )}
      {active?.markers.map(({ id, element }) => createPortal(renderMarker(id), element, id))}
    </>
  );
}

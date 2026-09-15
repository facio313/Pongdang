import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { KakaoMapsLoadError, loadKakaoMaps, type KakaoCustomOverlay } from "./kakaoMaps";
import { MAP_LOCATIONS } from "./mapLocations";
import "./kakaoMap.css";

const NO_PATHS: readonly (readonly (readonly number[])[])[] = [];

interface MapMarker {
  id: string;
  latitude: number;
  longitude: number;
}

interface MountedMarker {
  id: string;
  element: HTMLDivElement;
  overlay: KakaoCustomOverlay;
}

export function KakaoMapCanvas({ markers, selectedId, renderMarker, paths = NO_PATHS }: {
  markers: readonly MapMarker[];
  paths?: readonly (readonly (readonly number[])[])[];
  selectedId: string | null;
  renderMarker: (id: string) => ReactNode;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    attempt: number;
    markers: MountedMarker[];
    fit?: () => void;
    error?: string;
  }>();
  const active = result?.attempt === attempt ? result : undefined;

  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const controller = new AbortController();
    let cleanup = () => {};

    void loadKakaoMaps(import.meta.env.VITE_KAKAO_MAP_KEY ?? "", controller.signal)
      .then((sdk) => {
        if (controller.signal.aborted) return;
        const map = new sdk.Map(element, {
          center: new sdk.LatLng(MAP_LOCATIONS.gyeongpo.latitude, MAP_LOCATIONS.gyeongpo.longitude),
          level: 7,
        });
        const bounds = new sdk.LatLngBounds();
        const mounted: MountedMarker[] = [];
        const lines: { setMap(map: null): void }[] = [];
        const resize = new ResizeObserver(() => fit());
        cleanup = () => {
          resize.disconnect();
          lines.forEach(line => line.setMap(null));
          mounted.forEach(({ overlay }) => overlay.setMap(null));
          element.replaceChildren();
        };
        for (const marker of markers) {
          const position = new sdk.LatLng(marker.latitude, marker.longitude);
          bounds.extend(position);
          const content = document.createElement("div");
          content.className = "wim-map-marker";
          mounted.push({
            id: marker.id,
            element: content,
            overlay: new sdk.CustomOverlay({
              map, position, content, xAnchor: 0.5, yAnchor: 1, zIndex: 2,
            }),
          });
        }
        for (const path of paths) {
          if (path.some(point => point.length !== 2 || !point.every(Number.isFinite) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90)) continue;
          const points = path.map(point => new sdk.LatLng(point[1], point[0]));
          if (points.length < 2 || !sdk.Polyline) continue;
          points.forEach(point => bounds.extend(point));
          lines.push(new sdk.Polyline({ map, path: points, strokeWeight: 4, strokeColor: "#1d4ed8", strokeOpacity: 0.85 }));
        }
        function fit() {
          if (controller.signal.aborted || !element!.clientWidth || !element!.clientHeight) return;
          map.relayout();
          mounted.forEach(({ element: content, overlay }) => overlay.setContent(content));
          const panel = element!.parentElement?.querySelector(".wim-panel")
            ?.getBoundingClientRect();
          const stacked = panel && panel.width > element!.clientWidth * 0.8;
          const edge = panel ? 48 : 16;
          const markerHeight = Math.max(0, ...mounted.map(({ element: content }) => content.offsetHeight));
          if (bounds.isEmpty()) return;
          map.setBounds(bounds, markerHeight + 16, stacked ? edge : (panel?.width ?? 0) + edge,
            stacked ? panel.height + edge : edge, edge);
        }
        fit();
        resize.observe(element);
        setResult({ attempt, markers: mounted, fit });
      })
      .catch((error: unknown) => {
        cleanup();
        if (!controller.signal.aborted) {
          setResult({ attempt, markers: [], error: error instanceof KakaoMapsLoadError
            ? error.message
            : "카카오 지도를 불러오지 못했습니다. 지도 사용 설정이나 네트워크 연결을 확인해 주세요." });
        }
      });
    return () => {
      controller.abort();
      cleanup();
    };
  }, [attempt, markers, paths]);

  useEffect(() => {
    // Portal contents are mounted after the SDK creates its empty containers.
    // Reapply them so Kakao measures the final button size for its anchors.
    active?.markers.forEach(({ element, overlay }) => overlay.setContent(element));
    active?.fit?.();
  }, [active]);

  useEffect(() => {
    active?.markers.forEach(({ id, overlay }) => overlay.setZIndex(id === selectedId ? 3 : 2));
  }, [active, selectedId]);

  return (
    <>
      <div className="wim-map-canvas" ref={container} role="region" aria-label="카카오 지도" />
      {!active && <div className="wim-map-status" role="status">지도를 불러오는 중입니다.</div>}
      {active?.error && (
        <div className="wim-map-status">
          <p role="alert">{active.error}</p>
          <button onClick={() => setAttempt((value) => value + 1)}>지도 다시 불러오기</button>
        </div>
      )}
      {active?.markers.map(({ id, element }) => createPortal(renderMarker(id), element, id))}
    </>
  );
}

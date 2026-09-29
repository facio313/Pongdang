import type { KakaoCustomOverlay, KakaoMapsNamespace } from "./kakaoMaps.ts";
import { MAP_LOCATIONS } from "./mapLocations.ts";

export interface MapMarker {
  id: string;
  latitude: number;
  longitude: number;
}

export interface MountedMarker extends MapMarker {
  element: HTMLDivElement;
  overlay: KakaoCustomOverlay;
}

export interface MapInsets {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

/** Keep one SDK map and reconcile its contents without resetting the camera. */
export function createKakaoMapScene(element: HTMLDivElement, sdk: KakaoMapsNamespace) {
  const map = new sdk.Map(element, {
    center: new sdk.LatLng(MAP_LOCATIONS.gyeongpo.latitude, MAP_LOCATIONS.gyeongpo.longitude),
    level: 7,
  });
  let mounted: MountedMarker[] = [];
  let lines: { setMap(map: null): void }[] = [];
  let bounds = new sdk.LatLngBounds();
  let pathsKey = "";
  let fitted = false;

  function update(markers: readonly MapMarker[], paths: readonly (readonly (readonly number[])[])[]) {
    const ids = new Set(markers.map(({ id }) => id));
    const removed = mounted.filter(({ id }) => !ids.has(id));
    if (removed.length) {
      removed.forEach(({ overlay }) => overlay.setMap(null));
      mounted = mounted.filter(({ id }) => ids.has(id));
    }
    bounds = new sdk.LatLngBounds();
    for (const marker of markers) {
      const position = new sdk.LatLng(marker.latitude, marker.longitude);
      bounds.extend(position);
      const existing = mounted.find(({ id }) => id === marker.id);
      if (existing) {
        if (existing.latitude !== marker.latitude || existing.longitude !== marker.longitude) {
          existing.overlay.setPosition(position);
          existing.latitude = marker.latitude;
          existing.longitude = marker.longitude;
        }
        continue;
      }
      const content = element.ownerDocument.createElement("div");
      content.className = "wim-map-marker";
      mounted = [...mounted, {
        ...marker,
        element: content,
        overlay: new sdk.CustomOverlay({ map, position, content, xAnchor: 0.5, yAnchor: 1, zIndex: 2 }),
      }];
    }
    const validPaths = paths.filter(path => path.length >= 2 && path.every(point =>
      point.length === 2 && point.every(Number.isFinite) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90,
    ));
    const nextPathsKey = JSON.stringify(validPaths);
    const replaceLines = nextPathsKey !== pathsKey;
    if (replaceLines) {
      lines.forEach(line => line.setMap(null));
      lines = [];
      pathsKey = nextPathsKey;
    }
    for (const path of validPaths) {
      if (!sdk.Polyline) continue;
      const points = path.map(point => new sdk.LatLng(point[1], point[0]));
      points.forEach(point => bounds.extend(point));
      if (replaceLines) {
        lines.push(new sdk.Polyline({ map, path: points, strokeWeight: 4, strokeColor: "#1d4ed8", strokeOpacity: 0.85 }));
      }
    }
    const boundsKey = bounds.isEmpty() ? "" : JSON.stringify([
      bounds.getSouthWest().getLat(), bounds.getSouthWest().getLng(),
      bounds.getNorthEast().getLat(), bounds.getNorthEast().getLng(),
    ]);
    return { markers: mounted, boundsKey };
  }

  function refreshMarkers() {
    // React portals fill these containers after the SDK creates the overlays.
    mounted.forEach(({ element: content, overlay }) => overlay.setContent(content));
  }

  function fit(insets?: MapInsets) {
    if (!element.clientWidth || !element.clientHeight || bounds.isEmpty()) return;
    map.relayout();
    const markerHeight = Math.max(0, ...mounted.map(({ element: content }) => content.offsetHeight));
    if (insets) {
      map.setBounds(bounds, markerHeight + 16 + (insets.top ?? 16),
        insets.right ?? 16, insets.bottom ?? 16, insets.left ?? 16);
    } else {
      const panel = element.parentElement?.querySelector(".wim-panel")?.getBoundingClientRect();
      const stacked = panel && panel.width > element.clientWidth * 0.8;
      const edge = panel ? 48 : 16;
      map.setBounds(bounds, markerHeight + 16, stacked ? edge : (panel?.width ?? 0) + edge,
        stacked ? panel.height + edge : edge, edge);
    }
    fitted = true;
  }

  return {
    map, update, refreshMarkers, fit,
    hasFitted: () => fitted,
    destroy() {
      lines.forEach(line => line.setMap(null));
      mounted.forEach(({ overlay }) => overlay.setMap(null));
      lines = [];
      mounted = [];
      element.replaceChildren();
    },
  };
}

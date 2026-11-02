/** A read-only copy of actual API responses. No provider calls or user records. */
export interface ArchiveManifest {
  version: 1;
  captured_at: string;
  source_release?: string;
  requests: Record<string, string>;
  attachments?: Record<string, string>;
}

type Row = Record<string, unknown>;
type Entry = { key: string; url: URL; file: string };
let manifest: ArchiveManifest | undefined;
let entries: Entry[] = [];
const responses = new Map<string, Promise<unknown>>();

export const ARCHIVE_READ_ONLY = "보관 모드에서는 실시간 조회·AI·경로 계산·저장·알림을 이용할 수 없습니다. 보관된 실제 자료를 둘러봐 주세요.";
const MISSING = "이 조건의 자료는 보관하지 않았습니다. 보관된 장소와 기준 시각의 자료를 선택해 주세요.";

export function archiveManifest() { return manifest; }
export function isArchiveMode() { return manifest !== undefined; }
/** Only data display time is fixed. Browser timeouts and authentication are not. */
export function dataNow() { return manifest ? Date.parse(manifest.captured_at) : Date.now(); }
export function dataNowIso() { return new Date(dataNow()).toISOString(); }

function localFile(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_./-]+$/.test(value) &&
    !value.startsWith("/") && !value.split("/").includes("..");
}

export function configureArchive(value: unknown) {
  if (value === undefined) {
    manifest = undefined;
    entries = [];
    responses.clear();
    return;
  }
  const candidate = object(value);
  if (candidate.version !== 1 || typeof candidate.captured_at !== "string" ||
      !Number.isFinite(Date.parse(candidate.captured_at))) throw new Error("보관 자료의 기준 시각을 확인할 수 없습니다.");
  const requests = object(candidate.requests);
  for (const [key, file] of Object.entries(requests)) {
    if (!localFile(file) || key.startsWith("/") || key.includes(":") || key.includes("#") || key.split("?")[0].split("/").includes("..")) {
      throw new Error("보관 자료 경로를 확인할 수 없습니다.");
    }
  }
  manifest = candidate as unknown as ArchiveManifest;
  entries = Object.entries(requests).map(([key, file]) => ({ key, url: new URL(key, "https://archive.invalid/"), file: file as string }));
  responses.clear();
}

export async function initializeArchive(base: string, fetcher: typeof fetch = fetch) {
  const response = await fetcher(`${base}archive/manifest.json`, { cache: "no-store", credentials: "same-origin", signal: AbortSignal.timeout(10000) });
  // The live SPA serves index.html for an absent path. Both are explicit absence.
  if (response.status === 404 || (response.ok && response.headers.get("content-type")?.includes("text/html"))) return;
  if (!response.ok) throw new Error("보관 자료 설정을 불러오지 못했습니다. 잠시 후 다시 열어 주세요.");
  configureArchive(await response.json());
}

export function canonicalArchivePath(path: string) {
  const url = new URL(path, "https://archive.invalid/");
  for (const key of ["spot_ids"]) {
    if (url.searchParams.has(key)) url.searchParams.set(key, [...new Set(url.searchParams.get(key)!.split(","))].sort((a, b) => Number(a) - Number(b)).join(","));
  }
  url.searchParams.sort();
  return url.pathname.slice(1) + (url.search ? url.search : "");
}

function object(value: unknown): Row {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("보관 자료 형식을 확인할 수 없습니다.");
  return value as Row;
}
function rows(value: unknown, field = "rows"): Row[] {
  const selected = Array.isArray(value) ? value : object(value)[field];
  if (!Array.isArray(selected)) throw new Error("보관 자료 목록을 확인할 수 없습니다.");
  return selected.map(object);
}
function ids(params: URLSearchParams) {
  return new Set((params.get("spot_ids") ?? params.get("spot_id") ?? "").split(",").filter(Boolean).map(Number));
}
function parameter(url: URL, key: string) {
  return url.searchParams.get(key) ?? ({ activity: "swim", mode: "observation", locale: "ko" } as Record<string, string>)[key] ?? "";
}
function matching(url: URL, keys: string[] = []) {
  return entries.filter(entry => entry.url.pathname === url.pathname && keys.every(key => parameter(entry.url, key) === parameter(url, key)));
}
async function load(base: string, entry: Entry, signal: AbortSignal | undefined, fetcher: typeof fetch) {
  signal?.throwIfAborted();
  let pending = responses.get(entry.file);
  if (!pending) {
    pending = fetcher(`${base}archive/${entry.file}`, { credentials: "same-origin", signal }).then(async response => {
      if (!response.ok || response.headers.get("content-type")?.includes("text/html")) throw new Error("보관 자료 파일을 불러오지 못했습니다.");
      return response.json() as Promise<unknown>;
    }).catch(error => { responses.delete(entry.file); throw error; });
    responses.set(entry.file, pending);
  }
  return pending;
}
function unique(items: Row[], field: string) {
  return [...new Map(items.map(row => [row[field], row])).values()];
}
function page(items: Row[], params: URLSearchParams) {
  const size = Math.min(100, Math.max(1, Number(params.get("page_size")) || 100));
  const number = Math.max(1, Math.floor(Number(params.get("page")) || 1));
  const start = (number - 1) * size;
  return { rows: items.slice(start, start + size), total: items.length, page: number, page_size: size, has_more: start + size < items.length };
}

/** Every miss fails closed; archive mode never falls through to a live API. */
export async function readArchiveData<T>(base: string, path: string, method = "GET", signal?: AbortSignal, fetcher: typeof fetch = fetch): Promise<T> {
  if (!manifest) throw new Error("보관 모드가 활성화되지 않았습니다.");
  if (method !== "GET") throw new Error(ARCHIVE_READ_ONLY);
  const url = new URL(path, "https://archive.invalid/");
  const endpoint = url.pathname.slice(1);
  if (/^(travel\/(?!keywords$|capabilities$)|notifications(?:\/|$)|ai(?:\/|$)|refresh(?:\/|$)|livecams(?:\/|$))/.test(endpoint) && endpoint !== "livecams/preview/places") throw new Error(ARCHIVE_READ_ONLY);
  const read = (entry: Entry) => load(base, entry, signal, fetcher);
  const readAll = async (selected: Entry[]) => {
    if (!selected.length) throw new Error(MISSING);
    return Promise.all(selected.map(read));
  };
  if (endpoint === "places" || endpoint === "livecams/preview/places") {
    const source = new URL("/places", url);
    source.searchParams.set("locale", parameter(url, "locale"));
    const payloads = await readAll(matching(source, ["locale"]));
    let items = unique(payloads.flatMap(value => rows(value)), "id");
    const wanted = ids(url.searchParams);
    if (wanted.size) items = items.filter(row => wanted.has(Number(row.id)) || (Array.isArray(row.alias_ids) && row.alias_ids.some(id => wanted.has(Number(id)))));
    for (const [query, field] of [["province", "province_code"], ["district", "district_code"], ["kind", "place_kind"]]) {
      const filter = url.searchParams.get(query);
      if (filter) items = items.filter(row => row[field] === filter);
    }
    const search = (url.searchParams.get("q") ?? "").trim().toLocaleLowerCase();
    if (search) items = items.filter(row => [row.name, row.address, row.region].some(value => typeof value === "string" && value.toLocaleLowerCase().includes(search)));
    return (endpoint === "livecams/preview/places" ? items : page(items, url.searchParams)) as T;
  }
  if (endpoint === "attachments" || endpoint === "place-details") {
    const payloads = await readAll(matching(url, endpoint === "place-details" ? ["locale"] : []));
    const wanted = ids(url.searchParams);
    const items = unique(payloads.flatMap(value => rows(value, "items")), "spot_id").filter(row => !wanted.size || wanted.has(Number(row.spot_id)));
    return { ...object(payloads[0]), items } as T;
  }
  if (endpoint === "water-index/conditions/summary") {
    const payloads = await readAll(matching(url, ["activity", "mode"]));
    const wanted = ids(url.searchParams);
    const selectedRows = unique(payloads.flatMap(value => rows(value)), "spot_id").filter(row => wanted.has(Number(row.spot_id)));
    const unavailable = unique(payloads.flatMap(value => rows(object(value).unavailable ?? [])), "spot_id").filter(row => wanted.has(Number(row.spot_id)));
    for (const id of wanted) if (!selectedRows.some(row => row.spot_id === id) && !unavailable.some(row => row.spot_id === id)) unavailable.push({ spot_id: id, reason: "archive_not_captured" });
    return { ...object(payloads[0]), rows: selectedRows, unavailable } as T;
  }
  if (endpoint === "water-index/conditions" || endpoint === "water-index/recommendation") {
    const exact = entries.find(entry => canonicalArchivePath(entry.key) === canonicalArchivePath(path));
    if (exact) return await read(exact) as T;
    const target = url.searchParams.get("at");
    const own = matching(url, endpoint.endsWith("recommendation") ? ["spot_id", "mode"] : ["spot_id", "mode", "activity"]);
    for (const entry of own) {
      const payload = object(await read(entry));
      if (!target || Date.parse(String(payload.at)) === Date.parse(target)) return payload as T;
    }
    if (endpoint === "water-index/conditions") {
      const source = new URL(url); source.pathname = "/water-index/recommendation";
      for (const entry of matching(source, ["spot_id", "mode"])) {
        const payload = object(await read(entry));
        const condition = rows(payload, "conditions").find(row => row.activity === parameter(url, "activity") && (!target || Date.parse(String(row.at)) === Date.parse(target)));
        if (condition) return condition as T;
      }
    }
    throw new Error(MISSING);
  }
  if (endpoint === "water-index/conditions/series") {
    const payloads = await readAll(matching(url, ["spot_id", "activity"]));
    const targets = new Set((url.searchParams.get("targets") ?? "").split(",").map(Date.parse));
    const selected = unique(payloads.flatMap(value => rows(value)), "at").filter(row => targets.has(Date.parse(String(row.at))));
    return { ...object(payloads[0]), rows: selected } as T;
  }
  if (endpoint.startsWith("datasets/")) {
    const payloads = await readAll(matching(url));
    let items = unique(payloads.flatMap(value => rows(value)), "id");
    const filterColumn = url.searchParams.get("filter_column");
    if (filterColumn) items = items.filter(row => String(row[filterColumn] ?? "") === url.searchParams.get("filter_value"));
    const search = (url.searchParams.get("q") ?? "").toLocaleLowerCase();
    if (search) items = items.filter(row => Object.values(row).some(value => typeof value === "string" && value.toLocaleLowerCase().includes(search)));
    const sort = url.searchParams.get("sort") ?? "id";
    const direction = url.searchParams.get("direction") === "asc" ? 1 : -1;
    items.sort((left, right) => direction * (typeof left[sort] === "number" && typeof right[sort] === "number" ? Number(left[sort]) - Number(right[sort]) : String(left[sort] ?? "").localeCompare(String(right[sort] ?? ""))));
    return { ...object(payloads[0]), ...page(items, url.searchParams), archive_original_total: object(payloads[0]).total } as T;
  }
  const exact = entries.find(entry => canonicalArchivePath(entry.key) === canonicalArchivePath(path));
  if (exact) return await read(exact) as T;
  // Period envelopes retain their original observation/reference timestamps.
  if (["quality/grade", "water-temperature", "tides/events"].includes(endpoint)) {
    const selected = matching(url, endpoint === "water-temperature" ? ["spot_id", "mode"] : ["spot_id"]);
    if (endpoint === "tides/events") {
      const requested = url.searchParams.get("from");
      // Shared screens round the same archive instant to 10/30 minutes. A
      // different selected day must not receive this period's tide predictions.
      const entry = selected.find(item => !requested || Math.abs(Date.parse(requested) - Date.parse(item.url.searchParams.get("from") ?? manifest!.captured_at)) < 30 * 60000);
      if (entry) return await read(entry) as T;
    } else if (selected.length) return await read(selected[0]) as T;
  }
  throw new Error(MISSING);
}

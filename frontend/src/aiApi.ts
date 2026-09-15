export const activities = { swim: "수영", surf: "서핑", relax: "휴식", mudflat: "갯벌", onsen: "온천", rafting: "래프팅" } as const;
export type Activity = keyof typeof activities;
export interface AiContext {
  spot_id?: number;
  spot_ids?: number[];
  region?: string;
  activity?: Activity;
  time_text?: string;
}
export interface ChatMessage { role: "user" | "assistant"; content: string }
export interface AiStatus { enabled: boolean; status: string; reason: string | null; model: string | null; auth_mode?: "local_operator" }
export interface AiLink { label: string; href: string }
export interface AiCandidate {
  candidate_id: string; spot_id: number; name: string; region: string | null;
  type: string | null; lat: number | null; lng: number | null;
  catalog_source: string | null; catalog_verified_at: string | null; links: AiLink[];
}
export interface AiFact {
  fact_id: string; text: string; evidence_refs: string[]; feature: string;
  spot_id?: number | null; data_status: string; metadata: Record<string, unknown>;
}
export interface ChatResponse {
  request_id: string; status: string; answer: string; clarification: string | null;
  fallback: boolean; provider: "openai" | "deterministic"; model: string | null;
  scope: { timezone: string; as_of: string; queries: Record<string, unknown>[] };
  candidates: AiCandidate[]; facts: AiFact[]; sources: { id: string; name: string; url?: string | null }[];
  warnings: string[]; limitations: string[]; features: string[]; reason_codes: string[];
  context: AiContext; sections: { title: string; fact_ids: string[]; candidate_ids: string[] }[];
}

const routes = new Set(["data", "info", "ai", "water-index", "water-index-map", "water-forecast", "tide", "water-quality", "livecam", "first-swim", "water-temperature"]);
export function safeInternalLink(value: string): string | null {
  if (!value.startsWith("#") || value.length > 1500 || [...value].some((char) => char.charCodeAt(0) <= 32 || char === "\\")) return null;
  const [page, query = ""] = value.slice(1).split("?");
  if (!routes.has(page) || value.split("?").length > 2) return null;
  const params = new URLSearchParams(query);
  if (new Set(params.keys()).size !== [...params.keys()].length) return null;
  for (const [key, val] of params) {
    if (key === "spot_id" && /^[1-9]\d{0,14}$/.test(val)) continue;
    if (key === "activity" && Object.hasOwn(activities, val)) continue;
    if (["from", "until"].includes(key) && /^\d{4}-\d{2}-\d{2}T/.test(val) && Number.isFinite(Date.parse(val))) continue;
    return null;
  }
  return value;
}
export function safeSourceUrl(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port ? url.href : null;
  } catch { return null; }
}
export function aiStatusText(status: AiStatus): string {
  const prefix = status.auth_mode === "local_operator" ? "로컬 테스트 · 이 컴퓨터의 임시 운영자 세션 · " : "";
  return prefix + aiReadinessText(status);
}
function aiReadinessText(status: AiStatus): string {
  if (status.status === "ready_to_try") return "AI 설정 준비됨 · 실제 OpenAI 연결은 질문 전송 시 확인합니다.";
  if (!status.enabled) return ["disabled", "ai_disabled"].includes(status.reason ?? "") || status.status === "disabled"
    ? "AI가 운영 설정에서 비활성화되어 있습니다. 기존 자료 조회는 사용할 수 있습니다."
    : "AI 준비 전 · 서버 설정이 필요합니다. 기존 자료 조회는 사용할 수 있습니다.";
  if (["access_error", "unauthorized", "forbidden", "model_unavailable"].includes(status.status)) return "AI 접근 실패 · 키 또는 모델 접근 권한을 확인해야 합니다. 기존 자료 조회는 사용할 수 있습니다.";
  return "AI 상태 확인 필요 · 설정 여부만으로 실제 연결을 보장하지 않습니다.";
}
export const aiReasonTexts: Record<string, string> = {
  ai_disabled: "AI가 운영 설정에서 비활성화되어 있습니다.", ai_not_configured: "서버의 AI 설정이 준비되지 않았습니다.",
  ai_authentication_failed: "OpenAI 인증에 실패했습니다. 서버 키 설정을 확인해야 합니다.",
  ai_access_denied: "OpenAI 접근 권한이 없습니다. 서버의 모델 접근 권한을 확인해야 합니다.",
  ai_model_unavailable: "설정된 모델을 사용할 수 없습니다.", ai_quota_exhausted: "OpenAI 사용 한도가 소진되었습니다.",
  ai_budget_exhausted: "Pongdang의 AI 일일 예산 한도에 도달했습니다.", ai_timeout: "AI 처리 시간이 초과되었습니다.",
  ai_concurrency_limit: "다른 AI 요청을 처리 중입니다. 잠시 후 다시 시도해 주세요.",
  ai_rate_limited: "AI 요청 빈도 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.",
  ai_rate_limit: "사용자별 AI 요청 한도에 도달했습니다.", ai_request_timeout: "AI 요청 전체 처리 시간이 초과되었습니다.", ai_connection_failed: "OpenAI에 연결하지 못했습니다.", ai_service_unavailable: "OpenAI 서비스를 일시적으로 사용할 수 없습니다.",
  ai_user_rate_limited: "사용자별 AI 요청 한도에 도달했습니다.",
};
export class AiRequestError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.name = "AiRequestError"; this.code = code; }
}
export async function requestJson<T>(base: string, path: string, signal: AbortSignal, body?: unknown): Promise<T> {
  const response = await fetch(`${base}api/data/${path}`, {
    method: body === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store", signal,
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    if (response.status === 503 || response.status === 401) {
      // Only these server-defined configuration codes may select a specific
      // message. Never reflect arbitrary response details or upstream errors.
      const payload: unknown = await response.json().catch(() => null);
      const detail = payload !== null && typeof payload === "object" && !Array.isArray(payload) && "detail" in payload ? payload.detail : undefined;
      if (response.status === 401 && detail === "LOCAL_OPERATOR_SESSION_REQUIRED") {
        throw new AiRequestError("local_session_required", "로컬 테스트 세션이 없거나 만료됐습니다. 로컬 실행 명령으로 세션을 다시 열어 주세요.");
      }
      if (response.status === 503 && detail === "AUTH_NOT_CONFIGURED") {
        throw new AiRequestError("auth_not_configured", "Pongdang의 SSO 로그인 연동이 설정되지 않아 AI 대화를 사용할 수 없습니다. 운영자의 로그인 연동 설정이 필요합니다. 기존 데이터 조회 화면은 계속 이용할 수 있습니다.");
      }
      if (response.status === 503 && detail === "SSO_ORIGINS_NOT_CONFIGURED") {
        throw new AiRequestError("sso_origins_not_configured", "Pongdang의 SSO 로그인 연동에서 허용할 요청 출처가 설정되지 않아 AI 질문을 전송할 수 없습니다. 운영자의 로그인 연동 설정이 필요합니다. 기존 데이터 조회 화면은 계속 이용할 수 있습니다.");
      }
    }
    const [code, message] = response.status === 401 ? ["unauthenticated", "로그인이 필요합니다. 기존 SSO 로그인을 확인한 뒤 다시 시도해 주세요."]
      : response.status === 403 ? ["forbidden", "Pongdang 접근 권한 또는 요청 출처를 확인해 주세요."]
      : response.status === 429 ? ["rate_limited", "요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요."]
      : response.status === 422 ? ["invalid_request", "질문과 장소·시간 조건을 확인해 주세요."]
      : ["unavailable", "요청을 완료하지 못했습니다. 기존 자료 조회를 이용하거나 다시 시도해 주세요."];
    throw new AiRequestError(code, message);
  }
  try { return await response.json() as T; }
  catch { throw new AiRequestError("invalid_response", "서버 응답을 확인할 수 없습니다. 다시 시도해 주세요."); }
}

// One active request, even before React renders a disabled button. Aborted or
// replaced requests never publish a late response into a new conversation.
export class ConversationRequest {
  controller: AbortController | null = null;
  cancel() { this.controller?.abort(); this.controller = null; }
  async send(base: string, message: string, history: ChatMessage[], context: AiContext): Promise<ChatResponse | null> {
    if (this.controller || !message.trim()) return null;
    const controller = new AbortController();
    this.controller = controller;
    try {
      const body = { message: message.trim(), history: history.slice(-8).filter(({ role }) => role === "user" || role === "assistant").map(({ role, content }) => ({ role, content: content.slice(0, 2000) })), context };
      while (body.history.length && new TextEncoder().encode(JSON.stringify(body)).length > 15000) body.history.shift();
      const response = await requestJson<ChatResponse>(base, "ai/chat", controller.signal, body);
      return this.controller === controller && !controller.signal.aborted ? response : null;
    } catch (error) {
      if (controller.signal.aborted) return null;
      throw error;
    } finally { if (this.controller === controller) this.controller = null; }
  }
}

export function displayTime(value: unknown): string {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return "기록 없음";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul", hourCycle: "h23" }).format(new Date(value)) + " KST";
}

import { t } from "./i18n.ts";

export interface NotificationSubscription {
  id: string;
  spot_id: number;
  spot_name?: string | null;
  year: number;
  timezone: string;
  minimum_temperature_c: number;
  channel: "in_app" | "email";
  destination: string | null;
  active: boolean;
  revision: number;
  updated_at: string;
  condition_state: string;
  last_evaluated_at: string | null;
  delivery_configuration: string;
}

export interface NotificationEvidence {
  reason_codes?: string[];
  spot_id?: number;
  minimum_temperature_c?: number;
  temperature_normalization?: { value: number; unit?: string };
  observation?: {
    numeric_value: number | null;
    unit: string;
    observed_at: string;
    valid_until: string | null;
    provider: string;
  };
  station_relationship?: { relation: string; source_id: string; provider: string };
}

export interface NotificationEvent {
  id: string;
  subscription_id: string;
  subscription_revision: number;
  year: number;
  kind: string;
  state: string;
  created_at: string;
  evidence: NotificationEvidence;
  delivery_state: string;
  attempts: number;
  last_error: string | null;
}

export interface NotificationEvaluation {
  id: number;
  subscription_id: string;
  subscription_revision: number;
  evaluated_at: string;
  condition_state: string;
  evidence: NotificationEvidence;
}

export interface NotificationPage<T> {
  rows: T[];
  limit: number;
  offset: number;
}

export function notificationConditionLabel(subscription: NotificationSubscription): string {
  if (!subscription.active) return t("구독 해지됨");
  if (!subscription.last_evaluated_at) return t("첫 평가 대기");
  const labels: Record<string, string> = { met: "수온 기준 충족", not_met: "수온 기준 미달" };
  return t(labels[subscription.condition_state] ?? "수온 자료 확인 필요");
}

export function notificationDeliveryLabel(state: string): string {
  const labels: Record<string, string> = {
    available_in_app: "앱 내 알림 생성됨", pending: "발송 대기", sending: "발송 중",
    retry: "재시도 대기", accepted: "메일 서비스 접수됨", failed: "발송 실패",
    not_configured: "이메일 발송 설정 필요", cancelled: "발송 취소됨",
    delivery_unknown: "발송 결과 확인 필요",
  };
  return t(labels[state] ?? "발송 상태 확인 필요");
}

export function notificationReasonLabels(evidence?: NotificationEvidence): string[] {
  const labels: Record<string, string> = {
    outside_subscription_year: "설정한 연도가 아닙니다.",
    station_mapping_missing_or_ambiguous: "이 장소를 대표하는 수온 관측소 연결이 없거나 모호합니다.",
    no_temperature_observation: "사용할 수 있는 실제 수온 관측이 없습니다.",
    observation_outside_mapping_period: "관측 시각이 관측소 연결의 유효기간 밖입니다.",
    temperature_expired: "수온 관측의 유효기간이 지났습니다.",
    temperature_missing: "관측 자료에 수온 값이 없습니다.",
    temperature_unit_not_comparable: "수온 단위를 비교할 수 없습니다.",
    conflicting_temperature_evidence: "같은 시각의 수온 관측이 서로 다릅니다.",
    user_preference_met: "설정한 선호 수온 이상입니다.",
    below_user_preference: "설정한 선호 수온보다 낮습니다.",
    earlier_qualifying_observation: "올해 앞선 기준 충족 관측이 있습니다.",
    annual_history_not_certified: "연간 관측 이력이 완전하지 않아 올해 최초 여부를 확정하지 않습니다.",
    temperature_does_not_establish_swimming_safety: "수온 기준 충족은 입수 안전 판정이 아닙니다.",
  };
  return [...new Set((evidence?.reason_codes ?? []).map(code => t(labels[code] ?? "관측 근거를 추가로 확인해야 합니다.")))];
}

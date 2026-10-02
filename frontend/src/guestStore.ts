/** 로그인하지 않은 사람이 고른 것을 브라우저에 둡니다.
 *
 *  로그인 없이도 추천 7단계 → 코스 생성 → 코스 보기까지 끝까지 쓸 수 있어야
 *  합니다. 서버의 저장 경로(`travel/preferences`, `POST travel/plans`)는 계속
 *  계정 전용이므로, 그동안 고른 것은 여기 둡니다.
 *
 *  **저장하는 것은 장소 id 와 취향 라벨뿐입니다.** 사람을 가리키는 것은 넣지
 *  않습니다 -- `travelSession.ts` 가 애초에 아무것도 영속화하지 않았던 이유가
 *  그것이고, 그 원칙은 그대로입니다. 게스트가 고른 「해변 · 혼자 · 조용한」과
 *  장소 번호는 그 사람이 누구인지 말하지 않습니다.
 *
 *  로그인하면 **비웁니다**(`clearGuestStore`). 서버에 저장된 취향이 권위이고,
 *  둘이 남아 있으면 어느 쪽이 내 선택인지 화면이 말할 수 없게 됩니다.
 *
 *  저장이 막힌 환경(사생활 보호 모드, 저장소 차단)에서는 메모리로 물러섭니다.
 *  그 탭 안에서는 그대로 동작하고, 새로 고치면 잊습니다 -- 쓰지 못하는 것을
 *  쓴 것처럼 꾸미지 않습니다(`travelLanguage.ts` 와 같은 방식).
 */

/** 지금 로그인하지 않은 상태인가.
 *
 *  **보호된 조회의 401 만이 권위입니다**(`authError.ts`). 그것을 아는 곳은
 *  `useTastePreference` 이므로 거기서 알려 줍니다. 기본값은 «모름»이 아니라
 *  **false** 입니다 -- 모르는 동안 게스트로 단정해 저장하면, 로그인한 사람의
 *  작업 중 코스가 공용 기기의 저장소에 남습니다.
 *
 *  이 값이 false 인 동안 코스는 저장되지 않습니다(`travelSession.ts`). 취향은
 *  `useTastePreference` 가 자기 401 을 보고 직접 가르므로 이 값에 기대지
 *  않습니다. */
let guestMode = false;
const guestModeListeners = new Set<(guest: boolean) => void>();

/** 게스트 여부가 정해지거나 바뀌는 순간을 듣습니다. 저장해 둔 것을 되읽을
 *  자리입니다(`travelSession.ts`) -- 렌더 중에 상태를 밀어 넣지 않으려고
 *  구독으로 둡니다. */
export function onGuestModeChange(listener: (guest: boolean) => void) {
  guestModeListeners.add(listener);
  return () => guestModeListeners.delete(listener);
}

export function setGuestMode(value: boolean) {
  if (value === guestMode) return;
  guestMode = value;
  // 로그인한 것이 확인되면 둘러보던 흔적을 지웁니다. 서버가 권위입니다.
  if (!value) clearGuestStore();
  for (const listener of guestModeListeners) listener(value);
}

export function isGuest() {
  return guestMode;
}

const PREFIX = "pongdang.guest.";
export const GUEST_TASTE_KEY = `${PREFIX}taste`;
export const GUEST_COURSE_KEY = `${PREFIX}course`;

/** 저장소를 못 쓸 때의 대체. 탭이 사는 동안만 남습니다. */
const memory = new Map<string, string>();

function storage(): Storage | null {
  try {
    const probe = window.localStorage;
    // Safari 사생활 보호 모드는 getItem 은 되고 setItem 에서 던집니다.
    probe.setItem(`${PREFIX}probe`, "1");
    probe.removeItem(`${PREFIX}probe`);
    return probe;
  } catch {
    return null;
  }
}

function readRaw(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

function writeRaw(key: string, value: string | null) {
  memory.set(key, value ?? "");
  if (value === null) memory.delete(key);
  try {
    const store = storage();
    if (!store) return;
    if (value === null) store.removeItem(key);
    else store.setItem(key, value);
  } catch {
    // 메모리에는 이미 들어갔습니다. 이 탭에서는 동작합니다.
  }
}

/** 저장된 JSON 을 읽습니다. 모양이 어긋나면 **버립니다** -- 옛 판의 남은 값을
 *  억지로 읽어 화면에 반쪽짜리 코스를 띄우지 않습니다. */
function readJson<T>(key: string, valid: (value: unknown) => value is T): T | null {
  const raw = readRaw(key);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (valid(parsed)) return parsed;
  } catch {
    // 아래에서 버립니다.
  }
  writeRaw(key, null);
  return null;
}

function writeJson(key: string, value: unknown) {
  try {
    writeRaw(key, JSON.stringify(value));
  } catch {
    // 직렬화할 수 없는 값은 애초에 저장하지 않습니다.
  }
}

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

/** 게스트가 고른 취향 라벨. 서버 옵션 이름 그대로입니다. */
export function readGuestTaste(): string[] {
  return readJson(GUEST_TASTE_KEY, isStringArray) ?? [];
}

export function writeGuestTaste(labels: string[]) {
  // 라벨 수에 상한을 둡니다. 서버가 카테고리별 상한을 정하지만, 저장소에는
  // 어떤 값이든 들어올 수 있으므로 읽는 쪽에서도 막습니다.
  writeJson(GUEST_TASTE_KEY, labels.slice(0, 40));
}

/** 게스트가 만든 코스. 화면이 쓰는 모양 그대로 두되, 되읽을 때 검증합니다.
 *
 *  타입을 `unknown` 으로 두는 이유: 코스 모양(`PlanInput` · `TripPlan`)은 서버
 *  계약이고, 이 파일이 그 계약을 두 번째로 적어 두면 한쪽만 바뀝니다. 읽는
 *  쪽(`travelSession.ts`)이 자기 타입으로 받습니다. */
export function readGuestCourse(): unknown {
  return readJson(
    GUEST_COURSE_KEY,
    (value): value is unknown =>
      typeof value === "object" && value !== null && !Array.isArray(value),
  );
}

export function writeGuestCourse(value: unknown) {
  if (value === null || value === undefined) {
    writeRaw(GUEST_COURSE_KEY, null);
    return;
  }
  writeJson(GUEST_COURSE_KEY, value);
}

/** 로그인했을 때 게스트가 고른 것을 비웁니다. 서버가 권위입니다. */
export function clearGuestStore() {
  for (const key of [GUEST_TASTE_KEY, GUEST_COURSE_KEY]) writeRaw(key, null);
}

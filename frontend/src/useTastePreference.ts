import { forgetResource, useResource } from "./useResource";
import { travelJson, type Preference } from "./travelApi";
import { isLoginRequiredMessage } from "./authError";
import { readGuestTaste, setGuestMode, writeGuestTaste } from "./guestStore";

// 취향 한 벌을 읽고 쓰는 곳입니다. 예전에는 모바일 추천(RecommendPage)과
// 데스크탑 추천(RecommendDesktop)이 **각자** 서버 카탈로그를 조회하고, 각자
// id↔라벨 인덱스를 만들고, 저장은 모바일에만 있었습니다. 같은 사실을 두 군데서
// 다르게 다루면 한쪽만 고쳐지므로 여기 하나로 모읍니다.
//
// 프런트는 키워드를 만들지 않습니다. 고를 수 있는 것도, 상한도 서버가 정합니다.

export interface KeywordCatalogue {
  version?: string;
  categories: {
    id: string;
    label: string;
    max_selections: number;
    options: { id: string; label: string }[];
  }[];
}

/** 서버가 발행한 카테고리 중 추천 화면이 고르게 하는 것들. */
export const PICKABLE = ["place_type", "activity", "companion", "atmosphere", "transport"];

/** 카드로 확정하는 단계가 쓰는 카테고리. 활동은 서버가 발행한 목록입니다. */
export const CARD_CATEGORY = "activity";

export interface TastePreference {
  /** 카탈로그 조회 상태. 빈 상태 문구를 화면이 직접 쓰게 그대로 넘깁니다. */
  catalogue: { loading: boolean; error?: string };
  groups: KeywordCatalogue["categories"];
  optionIndex: Map<string, { category: string; label: string }>;
  labelOf: (id: string) => string;
  /** 저장된 취향을 서버 옵션 id 로 되읽은 것. 서버에 없는 이름은 버립니다. */
  savedIds: string[];
  /** 저장돼 있는 취향 그대로. 추천 요청에 같이 실어 보낼 때 씁니다 --
   *  learning_enabled 처럼 이 화면이 모르는 항목을 지우지 않기 위해서입니다. */
  preference?: Preference;
  /** 저장된 취향이 있는가. 히어로가 두 갈래로 갈리는 기준입니다. */
  hasTaste: boolean;
  /** 취향 조회가 아직 끝나지 않았는가. 끝나기 전에 「취향 없음」으로 단정하면
   *  이미 고른 사람에게도 처음 화면을 띄우게 됩니다. */
  profileLoading: boolean;
  /** Protected preference reads require the existing SSO login. */
  loginRequired: boolean;
  profileError?: string;
  /** 라벨 목록을 취향으로 저장합니다. 지금 revision 을 읽어 그대로 실어
   *  보냅니다(낙관적 동시성). */
  savePreference: (labels: string[], signal: AbortSignal) => Promise<void>;
}

export function useTastePreference(): TastePreference {
  const profile = useResource<{ preference: Preference; revision: number }>(
    "travel/preferences",
  );
  const catalogue = useResource<KeywordCatalogue>("travel/keywords");

  const groups = (catalogue.data?.categories ?? []).filter((category) =>
    PICKABLE.includes(category.id),
  );
  const optionIndex = new Map(
    groups.flatMap((category) =>
      category.options.map(
        (option) =>
          [option.id, { category: category.id, label: option.label }] as const,
      ),
    ),
  );
  const labelOf = (id: string) => optionIndex.get(id)?.label ?? id;
  // preferences 는 개인정보라 nginx 에서 SSO 게이트가 걸려 있습니다. 익명
  // 방문자에게는 「로그인 필요」가 실패가 아니라 그냥 「저장된 취향 없음」과
  // 같은 사실입니다 -- 홈에 들어오자마자 로그인 화면으로 튕기거나 경고를
  // 띄우면 안 됩니다(둘러보기는 로그인 없이도 됩니다). 쓰기 행동에서의
  // 로그인 요구는 useAction 의 팝오버가 따로 처리합니다.
  const profileLoginRequired = isLoginRequiredMessage(profile.error);
  // 로그인하지 않았으면 브라우저에 둔 것을 읽습니다. 저장된 취향이 없는 것과
  // 「고른 적이 없는 것」은 다릅니다 -- 추천 7단계를 끝까지 간 사람에게 다음
  // 방문에 처음 화면을 다시 띄우면 그 7단계가 없던 일이 됩니다.
  // 조회가 끝난 뒤에만 알립니다. 끝나기 전의 「모름」을 게스트로 단정하면
  // 로그인한 사람의 작업 중 코스가 브라우저 저장소에 남습니다(guestStore).
  if (!profile.loading) setGuestMode(profileLoginRequired);
  const tags = profileLoginRequired
    ? readGuestTaste()
    : (profile.data?.preference.tags ?? []);
  // 저장된 취향은 라벨로 쌓여 있습니다. 같은 이름의 서버 항목이 있으면 그 id 로
  // 되읽고, 없는 이름은 버립니다 -- 서버가 모르는 값을 다시 보내지 않습니다.
  const savedIds = tags.flatMap((tag) => {
    const match = [...optionIndex].find(([, option]) => option.label === tag);
    return match ? [match[0]] : [];
  });

  const savePreference = async (labels: string[], signal: AbortSignal) => {
    if (profileLoginRequired) {
      // 로그인하지 않은 사람의 선택은 브라우저에 둡니다. 서버에 PUT 하면 401 이
      // 나고 로그인 팝오버가 떠서, 둘러보기가 그 자리에서 끊깁니다.
      writeGuestTaste(labels);
      forgetResource("travel/preferences");
      return;
    }
    const current = await travelJson<{
      preference: Preference;
      revision: number;
    }>(import.meta.env.BASE_URL, "travel/preferences", "GET", undefined, signal);
    await travelJson(
      import.meta.env.BASE_URL,
      "travel/preferences",
      "PUT",
      {
        preference: { ...current.preference, tags: labels },
        expected_revision: current.revision,
      },
      signal,
    );
    // 저장이 끝났으면 옛 취향을 들고 있는 화면이 없어야 합니다. 예전에는 조회
    // 기억(60초)이 그대로 남아, 홈과 추천이 방금 고른 것을 모른 채 옛 취향을
    // 계속 그렸습니다 -- 두 추천 화면이 `justSaved` 그림자 상태로 그 자리만
    // 가리고 있었고, 홈은 아예 저장된 취향을 읽지도 못했습니다.
    forgetResource("travel/preferences");
  };

  return {
    catalogue,
    groups,
    optionIndex,
    labelOf,
    savedIds,
    preference: profile.data?.preference,
    hasTaste: savedIds.length > 0,
    // 카탈로그가 아직 없으면 저장된 라벨을 id 로 되읽을 수 없습니다. 그동안은
    // 「없음」이 아니라 「모름」입니다.
    profileLoading: profile.loading || catalogue.loading,
    loginRequired: profileLoginRequired,
    profileError: profileLoginRequired ? undefined : profile.error,
    savePreference,
  };
}

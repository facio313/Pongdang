import { test, expect } from "@playwright/test";
import { routePreference, serverRecommendation } from "./recommendation";

// 데스크탑 오늘 · 지도 · 내 코스는 훅이 하나도 없는 통짜 더미 화면이었습니다.
// 점수 82 · 수온 22.1°C · 「3곳 · 12.0km · 4h 30m」 같은 값이 파일 안 상수로
// 적혀 있었고, 같은 라우트의 모바일은 그동안 실제 수집값을 읽고 있었습니다.
// 여기서는 그 상수가 되돌아오지 않는지를 지킵니다.
test.use({ viewport: { width: 1440, height: 1000 } });

/** 예시 상수에만 있던 값들. 화면 어디에도 남아 있으면 안 됩니다. */
const INVENTED = [
  "22.1°C",
  "21.8°C",
  "21.2°C",
  "12.0km",
  "4h 30m",
  "3h 00m",
  "6.4km",
  "5.1km",
  "2.7km",
  "4.2km",
  "09:20",
  "14:30",
  "5월 18일",
  "작년보다 6일 늦음",
];

test("desktop today reads the same server values as mobile", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("#today");
  await expect(page.locator(".pd-desktop")).toBeVisible();

  const placeResponse = await page.request.get("api/data/datasets/spots?page_size=100&q=강릉");
  const places = await placeResponse.json();
  const place = places.rows.find((item: { name: string }) => item.name.includes("경포"));

  // 활동은 서버가 고릅니다(water-index/recommendation). 화면이 다시 고르지
  // 않는다는 것이 요지이므로 기대값을 재계산하지 않고 응답을 읽습니다.
  const recommendation = await serverRecommendation(page, place.id);
  await expect(page.locator(".td-hero-score-num")).toHaveText(
    recommendation.choice ? String(recommendation.choice.score) : "–",
  );

  // 히어로 타일은 실제 관측값입니다. 예전에는 「맑음 · 0.6m · 22.1°C · –」 였습니다.
  await expect(page.locator(".td-hero-tiles")).toContainText("수질 · 점수 미반영");
  // 주간 예보는 일곱 칸이며 값이 없는 날은 –입니다.
  await expect(page.locator(".td-day")).toHaveCount(7);
  // 추천 후보 다섯 가지입니다. 갯벌은 동해안에 없어 후보에서 빠졌습니다
  // (models.RECOMMENDED_ACTIVITIES).
  await expect(page.locator(".td-activity")).toHaveCount(5);

  const body = page.locator(".pd-desktop");
  for (const value of INVENTED) await expect(body).not.toContainText(value);
  // 고지 문구가 반대 방향으로 거짓말하지 않아야 합니다.
  await expect(body).not.toContainText("레이아웃 확인용 예시");
  expect(errors).toEqual([]);
  await page.screenshot({ path: "test-results/today-desktop.png", fullPage: true });
});

test("weekly forecast distinguishes loading, failed reads and missing evidence", async ({ page }) => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/data/water-index/conditions?**", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("mode") !== "forecast") return route.continue();
    await pending;
    const at = url.searchParams.get("at")!;
    const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    if (new Date(Date.parse(at) + 9 * 3600000).toISOString().startsWith(today)) {
      return route.fulfill({ status: 503, json: { detail: "예보 DB 조회 지연" } });
    }
    return route.continue();
  });
  await page.goto("#today");
  const week = page.getByRole("region", { name: "이번 주 예보" });
  try {
    await expect(week.locator(".td-day-grade").first()).toHaveText("조회 중");
    await expect(week.getByLabel("예보 조회 중").first()).toBeVisible();
  } finally {
    release();
  }
  await expect(week.locator(".td-day-grade").first()).toHaveText("조회 실패");
  await expect(week.getByRole("alert")).toContainText("예보 조회 실패:");
  await expect(week.getByRole("alert")).toContainText("다시 시도해 주세요.");
  await expect(week.locator(".td-day-grade").nth(1)).toHaveText("평가값 없음");
  await expect(week.locator(".td-day-score")).toHaveText(Array(7).fill("–"));
});

test("desktop map lists real places and scores only the chosen one", async ({ page }) => {
  await page.goto("#map");
  const response = await page.request.get("api/data/livecams/preview/places?q=");
  const places: { lat: number | null; lng: number | null }[] = await response.json();
  const mappable = places.filter((place) => place.lat !== null && place.lng !== null);

  await expect(page.locator(".mk-side-kick")).toContainText(`${mappable.length}곳`);
  await expect(page.locator(".mk-spot")).toHaveCount(mappable.length);
  // 눌러도 아무 일이 없던 활동 필터는 사라지고 실제로 목록을 바꾸는 검색이 있습니다.
  await expect(page.locator(".mk-hero-search input")).toBeVisible();
  await expect(page.locator(".mk-hero")).not.toContainText("주차 · 샤워장");

  const body = page.locator(".pd-desktop");
  for (const value of INVENTED) await expect(body).not.toContainText(value);
  await page.screenshot({ path: "test-results/map-desktop.png", fullPage: true });
});

test("desktop courses says there is no saved course rather than showing one", async ({ page }) => {
  await page.route("**/api/data/travel/plans**", (route) =>
    route.fulfill({ json: { rows: [] } }),
  );
  await page.goto("#my-courses");
  await expect(page.locator(".cd-hero-title")).toContainText("저장한 코스가 없습니다");
  await expect(page.locator(".pd-desktop")).toContainText("아직 저장한 코스가 없습니다");
  await expect(page.locator(".cd-item")).toHaveCount(0);
  // 이동 거리 · 소요 시간은 API 에 없습니다. «–» 이며 0 이 아닙니다.
  await expect(page.locator(".cd-hero-summary")).toContainText("–");

  const body = page.locator(".pd-desktop");
  for (const value of INVENTED) await expect(body).not.toContainText(value);
  // 눌러도 아무 일이 없던 버튼들은 사라져야 합니다.
  await expect(body).not.toContainText("순서 바꾸기");
  await page.screenshot({ path: "test-results/courses-desktop.png", fullPage: true });
});

test("데스크탑 여섯 화면 모두에서 사이드 메뉴가 열린다", async ({ page }) => {
  // 사이드 메뉴는 모바일 셸(AppShell)에만 달려 있었습니다. 데스크탑 화면은
  // DesktopShell 을 쓰므로 컨텍스트 밖이라 손잡이가 null 을 반환했고,
  // 1080px 이상에서는 저장한 코스 · 지점 즐겨찾기 · 알림 설정 · 데이터 출처 ·
  // 이용 안내에 닿을 길이 **전혀 없었습니다**. 탭바가 담는 여행 흐름 밖의
  // 항목들이라 다른 입구도 없습니다.
  for (const route of ["#home", "#today", "#spots", "#map", "#recommend", "#my-courses"]) {
    await page.goto(route);
    await expect(page.locator(".pd-desktop")).toBeVisible();
    const handle = page.getByRole("button", { name: "사이드 메뉴 열기" });
    await expect(handle, `${route} 에 메뉴 손잡이가 없습니다`).toBeVisible();
    await handle.click();
    const menu = page.locator(".pd-menu");
    await expect(menu).toBeVisible();
    // 패널이 실제로 보이는지. 토큰이 풀리면 흰 배경이 투명해져 글자만 뜹니다.
    await expect(menu).toHaveCSS("background-color", "rgb(255, 255, 255)");
    await expect(menu).toContainText("저장한 코스");
    await expect(menu).toContainText("지점 즐겨찾기");
    // 눌러도 아무 데도 가지 않는 항목은 링크가 아니라 미수집으로 둡니다.
    // (이름은 정확히 비교합니다 -- 「알림 설정」에 부분 일치하면 안 됩니다.)
    await expect(
      menu.getByRole("link", { name: "설정", exact: true }),
    ).toHaveCount(0);
    await expect(
      menu.getByRole("button", { name: /^설정/, disabled: true }),
    ).toHaveCount(1);
    await page.keyboard.press("Escape");
  }
});

test("데스크탑 사이드 메뉴 항목은 실제로 그 화면을 연다", async ({ page }) => {
  await page.goto("#home");
  await page.getByRole("button", { name: "사이드 메뉴 열기" }).click();
  await page.locator(".pd-menu").getByRole("link", { name: "저장한 코스" }).click();
  await expect(page).toHaveURL(/#my-courses$/);
  // 해시가 바뀌면 메뉴는 열린 채로 남지 않습니다.
  await expect(page.locator(".pd-menu")).toHaveCount(0);
});

test("데스크탑에서 만든 코스를 저장하고 내 코스에서 다시 연다", async ({ page }) => {
  // 데스크탑 추천에는 저장 경로가 없었습니다. 코스를 만들 수는 있어도 남길 수
  // 없었고, 그러면서 데스크탑 내 코스는 「추천에서 코스 만들기 →」로 여기
  // 보냈습니다 -- 닫힌 고리였습니다. 저장한 코스를 여는 쪽도 없어서, 내 코스가
  // 만드는 `#recommend?plan_id=…` 링크는 이 폭에서 무시됐습니다.
  // 취향이 저장돼 있으면 추천은 시작 화면부터 엽니다. 이 검사가 보려는 것은
  // 저장 경로이므로 취향 고르기를 다시 통과하지 않습니다.
  await routePreference(page, ["온천"]);
  await page.goto("#recommend");
  await page.getByRole("button", { name: "이 조건으로 후보 찾기" }).click();
  await expect(page.locator(".rd-step-name").first()).toContainText("OFFLINE TEST");

  // 실패는 실패라고 적습니다.
  await page.route("**/api/data/travel/plans", (route) =>
    route.request().method() === "POST"
      ? route.fulfill({ status: 503, json: { detail: "fixture failure" } })
      : route.continue(),
  );
  await page.getByRole("button", { name: "내 코스에 저장" }).click();
  // 이 화면에는 카카오 지도 키 안내도 alert 로 떠 있으므로, 저장 결과 줄을
  // 지목해 봅니다.
  const saveNote = page.locator(".rd-note[role]");
  await expect(saveNote).toContainText("서버에 연결하지 못했거나");
  await expect(saveNote).toHaveAttribute("role", "alert");
  await page.unroute("**/api/data/travel/plans");

  await page.getByRole("button", { name: "내 코스에 저장" }).click();
  await expect(page).toHaveURL(/#recommend\?plan_id=/);
  await expect(page.locator(".rd-note").filter({ hasText: "내 코스에 저장했습니다" })).toBeVisible();

  // 내 코스에 실제로 쌓입니다.
  await page.goto("#my-courses");
  await expect(page.locator(".cd-saved")).toHaveCount(1);
  // 고른 코스를 그대로 추천으로 넘깁니다. 예전에는 #recommend 로만 보내
  // 선택이 사라졌습니다.
  await page.locator(".cd-saved").click();
  await page.getByRole("link", { name: "이 코스 열기 →" }).click();
  await expect(page).toHaveURL(/#recommend\?plan_id=/);
  await expect(page.locator(".rd-step-name").first()).toContainText("OFFLINE TEST");
  // 새로고침해도 같은 코스가 열립니다 -- plan_id 로 다시 읽기 때문입니다.
  await page.reload();
  await expect(page.locator(".rd-step-name").first()).toContainText("OFFLINE TEST");
  await expect(
    page.locator(".rd-note").filter({ hasText: "저장된 코스를 불러왔습니다" }),
  ).toBeVisible();

  // 이 검사는 일회용 DB 에 실제로 코스를 남깁니다. 지우지 않으면 뒤따르는
  // 검사들이 「저장 0개」를 전제로 세운 단언에서 이 코스를 함께 셉니다.
  // 페이지 안에서 지웁니다 -- 비-GET 은 페이지와 같은 출처에서 보내야 합니다.
  const planId = new URL(page.url()).hash.split("plan_id=")[1];
  const status = await page.evaluate(async (id) => {
    const response = await fetch(`api/data/travel/plans/${id}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
    return response.status;
  }, planId);
  expect(status).toBe(204);
});

test("데스크탑 내 코스는 고른 코스를 다시 눌러 접을 수 있다", async ({ page }) => {
  await page.goto("#my-courses");
  const saved = page.locator(".cd-saved");
  if (!(await saved.count())) return; // 저장 코스가 없으면 볼 것이 없습니다.
  await saved.first().click();
  await expect(saved.first()).toHaveAttribute("aria-pressed", "true");
  await saved.first().click();
  await expect(saved.first()).toHaveAttribute("aria-pressed", "false");
});

test("desktop recommend chat opens the sanitized model exchange dialog", async ({
  page,
}) => {
  await page.route("**/api/data/ai/chat", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    return route.fulfill({
      json: {
        answer: "이번 여행은 이렇게 골라보시면 좋겠어요.",
        clarification: null,
        status: "available",
        fallback: false,
        reason_codes: [],
        model_trace: [
          { kind: "tool", name: "travel_recommend", arguments: { limit: 5 } },
          {
            kind: "plan",
            plan: { intent: "explain", clarification: null, sections: [] },
            error: null,
          },
        ],
      },
    });
  });
  await routePreference(page, ["온천"]);
  await page.goto("#recommend");
  // 대화는 한 단계이며, 시작 화면에서 들어갑니다.
  await page.getByRole("button", { name: /대화로 좁히기/ }).click();
  await page.getByLabel("컨시어지에게 보낼 내용").fill("차량");
  await page.getByRole("button", { name: "보내기" }).click();
  await page.getByRole("button", { name: "주고받은 기록" }).click();
  const dialog = page.getByRole("dialog", { name: "주고받은 기록" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("travel_recommend");
  await expect(dialog).toContainText("explain");
});

test("데스크탑 추천은 취향을 한 화면에 한 단계씩 묻고, 저장한 취향은 히어로가 말한다", async ({
  page,
}) => {
  // 예전에는 네 단계(취향 · 대화 · 후보 · 지도)가 한 페이지에 전부 펼쳐져
  // 있었습니다. 아직 아무것도 고르지 않은 사람에게 앞으로 할 일을 한꺼번에
  // 보여 주고, 후보·지도 자리는 「아직 후보가 없습니다」만 적힌 채였습니다.
  await routePreference(page, []);
  await page.goto("#recommend");

  // 카테고리는 서버가 발행합니다. 개수를 박아 두지 않고 그 수를 읽습니다.
  const catalogue = await (
    await page.request.get("api/data/travel/keywords")
  ).json();
  const pickable = ["place_type", "activity", "companion", "atmosphere"];
  const categories = catalogue.categories.filter((category: { id: string }) =>
    pickable.includes(category.id),
  );

  // 한 화면에 한 카테고리입니다. 나머지 단계는 아직 그려지지 않습니다.
  await expect(page.locator(".rd-taste-group")).toHaveCount(1);
  await expect(page.getByLabel("컨시어지에게 보낼 내용")).toHaveCount(0);
  await expect(page.locator(".rd-map")).toHaveCount(0);
  // 진행 점은 카테고리 수 + 요약 한 장입니다.
  await expect(page.locator(".rd-progress span")).toHaveCount(
    categories.length + 1,
  );

  for (let index = 0; index < categories.length; index++) {
    await expect(page.locator(".rd-taste-group .pd-dk-kick")).toContainText(
      `${categories[index].label} · 최대 ${categories[index].max_selections}개`,
    );
    if (index === 0)
      await page
        .getByRole("button", { name: categories[0].options[0].label, exact: true })
        .click();
    await page.getByRole("button", { name: /^다음/ }).click();
  }

  // 요약에서 저장합니다. 예전에는 데스크탑이 고른 조건을 이번 요청에만 쓰고
  // 버렸고, 저장은 모바일 추천에만 있었습니다.
  await page.getByRole("button", { name: "취향 저장하고 후보 찾기" }).click();
  await expect(page.locator(".rd-step-name").first()).toContainText(
    "OFFLINE TEST",
  );

  // 저장한 취향은 히어로가 그대로 말하고, 거기서 대화로 이어 갑니다.
  await expect(page.locator(".rd-hero-taste").first()).toHaveText(
    categories[0].options[0].label,
  );
  await page.getByRole("button", { name: /AI에게 이어서 물어보기/ }).click();
  await expect(page.getByLabel("컨시어지에게 보낼 내용")).toBeVisible();
  await expect(page).toHaveURL(/#recommend$/);
});

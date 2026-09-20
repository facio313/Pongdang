import { test, expect } from "@playwright/test";
import { ACTIVITY_LABEL, headlineOf, serverRecommendation } from "./recommendation";

// 데스크탑 홈(≥1080px)은 모바일과 같은 라우트(#home)이고 같은 데이터 훅을
// 쓰지만 마크업이 다릅니다. 폭에 따라 **다른 사실**을 말하지 않는지가 이
// 파일의 관심사입니다 -- 예전에는 이 화면이 파일 안 상수로 수온 22.1°C 와
// 시간대 점수 아홉 개를 지어내고 있었습니다.
test.use({ viewport: { width: 1440, height: 1000 } });



test("desktop home renders the same server-chosen activity and score as mobile", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("");
  await expect(page.locator(".pd-desktop")).toBeVisible();

  const placeResponse = await page.request.get("api/data/datasets/spots?page_size=100&q=강릉");
  const places = await placeResponse.json();
  const place = places.rows.find((item: { name: string }) => item.name.includes("경포"));

  // 히어로 활동은 서버가 규칙으로 고릅니다(water-index/recommendation).
  // 모바일과 같은 응답을 읽어, 폭이 달라도 같은 사실을 말하는지 봅니다.
  const recommendation = await serverRecommendation(page, place.id);
  const best = recommendation.choice!;
  const bestLabel = ACTIVITY_LABEL[best.activity];
  const swimConditions = await (
    await page.request.get(`api/data/water-index/conditions?spot_id=${place.id}&activity=swim&mode=observation`)
  ).json();
  const bestConditions = best.activity === "swim" ? swimConditions : await (
    await page.request.get(`api/data/water-index/conditions?spot_id=${place.id}&activity=${best.activity}&mode=observation`)
  ).json();

  await expect(page.locator(".hd-hero-score-num")).toHaveText(String(best.score));
  // 무엇의 점수인지를 화면이 말해야 합니다.
  await expect(page.locator(".hd-hero-title")).toContainText(headlineOf(best.activity));
  await expect(page.locator(".hd-hero-score .pd-grade-chip")).toContainText(`${bestLabel} 적합도`);
  // 척도 위 상대 위치. 색만으로 전하지 않으므로 점수와 등급이 이름에 함께 있습니다.
  await expect(page.locator(".hd-hero-lead .pd-gauge")).toHaveAttribute("aria-label", new RegExp(`^${best.score}점 .+ · 100점 만점$`));
  if (recommendation.reasons.length)
    await expect(page.locator(".hd-hero-lead .pd-why-line").first()).toBeVisible();
  await expect(page.locator(".hd-hero-note")).toContainText("근거 확보");

  // 히어로 관측 칸은 활동과 무관한 「지금 날씨와 바다」이므로 수영 응답을
  // 기준으로 씁니다. 갯벌이 뽑힌 날에도 수온이 «–» 가 되면 안 됩니다.
  const waterTemperature = swimConditions.condition_score.components
    .find((item: { metric: string }) => item.metric === "water_temperature");
  if (waterTemperature?.value !== null && waterTemperature !== undefined)
    await expect(page.locator(".hd-hero-metrics")).not.toContainText("수온 –");
  // 수질은 점수 입력이 아니므로 그 사실을 칸 이름에 밝힙니다.
  await expect(page.locator(".hd-hero-metrics")).toContainText("점수 미반영");

  // 「오늘 한눈에」는 그 점수를 이루는 항목들입니다.
  const components = bestConditions.condition_score.components;
  await expect(page.locator(".pd-cbar")).toHaveCount(components.length);
  await expect(page.locator(".pd-cbars")).toContainText(components[0].label);
  await expect(page.locator(".pd-cbars")).not.toContainText("수질");

  // 시간대 막대는 네 시각 고정이며 상수가 아니라 조회 결과입니다.
  await expect(page.locator(".hd-hour")).toHaveCount(4);
  await expect(page.locator(".hd-hour-labels")).toContainText("9시");
  await expect(page.locator(".hd-hour-labels")).toContainText("18시");

  expect(errors).toEqual([]);
  await page.screenshot({ path: "test-results/home-desktop.png", fullPage: true });
});

test("desktop home says a score is missing rather than showing zero", async ({ page }) => {
  await page.route("**/api/data/water-index/default-place", (route) => route.fulfill({ json: {
    place: null, rows: [], display_name: "강릉 경포대 해수욕장", status: "no_places",
    message: "수집된 해수욕장이 없습니다. 수집기와 해변 자료 연동을 확인해야 합니다.",
  } }));
  await page.route("**/api/data/datasets/spots?**", (route) =>
    route.fulfill({ json: { rows: [], total: 0 } }),
  );
  await page.goto("");
  // 고를 활동이 없으면 «–» 입니다. 0점이나 「안전함」으로 바뀌지 않습니다.
  await expect(page.locator(".hd-hero-score-num")).toHaveText("–");
  await expect(page.locator(".hd-hero-title")).toContainText("활동이 없습니다");
  await expect(page.locator(".pd-desktop")).toContainText("수집된 해수욕장이 없습니다");
  await expect(page.locator(".hd-hour")).toHaveCount(4);
  // 막대 없이 «–» 네 칸. 높이 0 인 막대로 그리지 않습니다.
  await expect(page.locator(".hd-hour-bar")).toHaveCount(0);
});

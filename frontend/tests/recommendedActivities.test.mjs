// 세 집합이 따로 유지되는지 지킵니다.
//
//   activities           -- 라벨 사전. 응답에 올 수 있는 여섯 활동 전부.
//   recommendedActivities -- 추천 후보. 서버 RECOMMENDED_ACTIVITIES 의 거울.
//   listedActivities      -- 활동별 점수에 줄을 가지는 활동. 후보의 부분집합.
//
// 셋이 다시 하나로 뭉치면 「지원하지 않는다」·「권하지 않는다」·「점수를 보여
// 주지 않는다」가 섞입니다. 갯벌은 API 가 계속 평가하므로 라벨 사전에 남아야
// 하고, 휴식은 추천 후보와 점수 목록 모두에 남아야 합니다.
import assert from "node:assert/strict";
import test from "node:test";

import { activities, listedActivities, recommendedActivities } from "../src/aiApi.ts";

test("추천 활동은 라벨 사전의 부분집합이다", () => {
  for (const activity of recommendedActivities) {
    assert.ok(activity in activities, `라벨 없음: ${activity}`);
  }
});

test("갯벌은 추천 후보에서 빠지되 라벨은 남는다", () => {
  assert.ok(!recommendedActivities.includes("mudflat"));
  assert.equal(activities.mudflat, "갯벌");
});

test("래프팅은 추천 후보에서 빠지되 라벨은 남는다", () => {
  // 하천 수위·유량 자료가 없어 어떤 날도 점수가 나오지 않습니다. 후보로 두면
  // 화면에 늘 「추천 제외 · 필수 근거 부족」 한 줄만 섭니다.
  assert.ok(!recommendedActivities.includes("rafting"));
  assert.ok(!listedActivities.includes("rafting"));
  assert.equal(activities.rafting, "래프팅");
});

test("추천 후보에 중복이 없다", () => {
  assert.equal(new Set(recommendedActivities).size, recommendedActivities.length);
});

test("점수 목록은 추천 후보의 부분집합이고 중복이 없다", () => {
  for (const activity of listedActivities) {
    assert.ok(recommendedActivities.includes(activity), `후보 아님: ${activity}`);
  }
  assert.equal(new Set(listedActivities).size, listedActivities.length);
});

test("휴식도 추천 후보와 점수 목록에 유지한다", () => {
  assert.ok(recommendedActivities.includes("relax"));
  assert.deepEqual(listedActivities, ["swim", "surf", "relax", "walk", "onsen"]);
});

test("온천은 자료가 없어도 목록에 남는다", () => {
  assert.ok(listedActivities.includes("onsen"));
});


test("물길 걷기는 추천 후보와 점수 목록 모두에 있다", () => {
  assert.ok(recommendedActivities.includes("walk"));
  assert.ok(listedActivities.includes("walk"));
  assert.equal(activities.walk, "물길 따라 걷기");
});

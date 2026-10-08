// 세 집합이 따로 유지되는지 지킵니다.
//
//   activities           -- 라벨 사전. 응답에 올 수 있는 여섯 활동 전부.
//   recommendedActivities -- 추천 후보. 서버 RECOMMENDED_ACTIVITIES 의 거울.
//   listedActivities      -- 활동별 점수에 줄을 가지는 활동. 후보의 부분집합.
//
// 셋이 다시 하나로 뭉치면 「지원하지 않는다」·「권하지 않는다」·「점수를 보여
// 주지 않는다」가 섞입니다. 갯벌은 API 가 계속 평가하므로 라벨 사전에 남아야
// 하고, 휴식은 후보이지만 목록에는 없어야 합니다.
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

test("휴식은 후보로 남지만 점수 목록에는 없다", () => {
  // 휴식의 점수 항목은 기온·습도·바람·강수뿐이라 날씨만 좋으면 거의 항상
  // 최고점입니다. 그 숫자를 목록에 띄워 둔 채 서버가 수영을 고르면 화면이
  // 자기 모순으로 읽힙니다. 그래도 **후보에는 남습니다** -- 물때 구간·개장
  // 기간 밖처럼 물 활동이 전부 미뤄진 날의 답이 휴식이기 때문입니다.
  assert.ok(recommendedActivities.includes("relax"));
  assert.ok(!listedActivities.includes("relax"));
});

test("온천은 자료가 없어도 목록에 남는다", () => {
  // 늘 「추천 제외 · 필수 근거 부족」이지만 그것이 정직한 표시입니다 --
  // 근거가 없는 것과 조건이 나쁜 것은 다른 사실입니다.
  assert.ok(listedActivities.includes("onsen"));
});


test("물길 걷기는 추천 후보와 점수 목록 모두에 있다", () => {
  assert.ok(recommendedActivities.includes("walk"));
  assert.ok(listedActivities.includes("walk"));
  assert.equal(activities.walk, "물길 따라 걷기");
});

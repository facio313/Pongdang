// 추천 후보 집합이 라벨 사전과 따로 유지되는지 지킵니다. 강릉을 포함한
// 동해안은 갯벌 지형이 발달하지 않아 mudflat 을 추천하지 않지만, API 는 갯벌을
// 계속 평가하므로 라벨 사전에는 남아 있어야 합니다 -- 응답을 읽을 말이 없으면
// 화면이 서버 enum 을 그대로 내보내게 됩니다.
import assert from "node:assert/strict";
import test from "node:test";

import { activities, recommendedActivities } from "../src/aiApi.ts";

test("추천 활동은 라벨 사전의 부분집합이다", () => {
  for (const activity of recommendedActivities) {
    assert.ok(activity in activities, `라벨 없음: ${activity}`);
  }
});

test("갯벌은 추천 후보에서 빠지되 라벨은 남는다", () => {
  assert.ok(!recommendedActivities.includes("mudflat"));
  assert.equal(activities.mudflat, "갯벌");
});

test("추천 후보에 중복이 없다", () => {
  assert.equal(new Set(recommendedActivities).size, recommendedActivities.length);
});

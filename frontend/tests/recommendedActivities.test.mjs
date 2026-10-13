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

test("휴식은 후보이면서 점수 목록에도 있다", () => {
  // 한동안 휴식을 목록에서 숨겼습니다. 서버가 점수와 무관하게 「물에 들어갈
  // 수 있으면 물」로 수영을 골랐기 때문에, 휴식 점수가 1위인 채 수영을 권하는
  // 모순이 그대로 읽혔습니다.
  //
  // 이제 그 우선은 조건부입니다(recommendation.WATER_PREFERENCE_MIN_SCORE).
  // 숨길 이유가 사라졌고, 오히려 휴식이 1위인데 수영을 권한 날 그 숫자를 볼
  // 수 있어야 「휴식 점수가 더 높지만」이라는 설명을 확인할 수 있습니다.
  assert.ok(recommendedActivities.includes("relax"));
  assert.ok(listedActivities.includes("relax"));
  assert.deepEqual(listedActivities, ["swim", "surf", "relax", "walk", "onsen"]);
});

test("목록은 후보 집합의 부분집합이다", () => {
  // 지금은 둘이 같습니다. 「무엇을 고를 수 있는가」와 「무엇을 보여 주는가」는
  // 다른 질문이라 상수는 둘로 남겨 두지만, 목록이 후보를 넘어설 수는 없습니다 --
  // 응답의 conditions·ranked 에 그 활동이 실려 오지 않습니다.
  for (const activity of listedActivities)
    assert.ok(recommendedActivities.includes(activity), activity);
});

test("온천은 욕조 수온이 없어도 목록에 남는다", () => {
  // 시설 욕조 수온은 수집 경로가 없어 사실상 늘 비어 있습니다. 그래도 외기
  // 만으로 점수가 서고(activity_score.ONSEN_AIR) 온천 시설에서는 추운 날의
  // 답이 됩니다. 해변에서 빠지는 이유는 자료가 아니라 장소입니다.
  assert.ok(listedActivities.includes("onsen"));
});


test("물길 걷기는 추천 후보와 점수 목록 모두에 있다", () => {
  assert.ok(recommendedActivities.includes("walk"));
  assert.ok(listedActivities.includes("walk"));
  assert.equal(activities.walk, "물길 따라 걷기");
});

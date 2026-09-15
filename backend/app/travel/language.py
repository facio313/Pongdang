"""Server-authored conversational copy; source place names are never translated."""

COPY = {
    "ko": {
        "intro": "이번 여행은 이렇게 골라보시면 좋겠어요.",
        "companion_connected": "여행 중 마지막으로 확인한 안내를 정리했어요.",
        "companion_disconnected": "현재 여행 갱신이 연결되어 있지 않아요.",
        "companion_ended": "종료한 여행의 안내 기록이에요.",
        "empty": "지금 조건으로 확인할 수 있는 후보가 없어요. "
        "조회 상태와 변경 가능한 조건을 확인해 주세요.",
        "query_failed": "지금은 등록 자료를 조회하지 못했어요. "
        "잠시 후 다시 확인해 주세요.",
        "matches": "선택하신 취향 중 {tags} 항목을 반영했어요.",
        "unmatched": "등록된 장소 정보로 찾은 후보예요. "
        "취향과 맞는지는 더 확인해 주세요.",
        "origin": "어디에서 출발하실까요?",
        "date": "어느 날짜에 다녀오실까요?",
        "plan": "선택하신 장소로 일정 초안을 만들었어요. "
        "저장하기 전에 이동시간과 미확인 조건을 확인해 주세요.",
        "stay": "머무는 시간 {minutes}분",
        "unchecked": "아직 확인이 필요한 조건: {conditions}",
        "catalog_time": "등록 자료 수집: {time}",
        "limits": "조회한 등록 장소 안에서 취향을 비교한 순서예요. "
        "이동시간·비용·현장 조건은 아직 확인이 필요해요.",
        "mood_quiet": "짧게 이동해서 조용히 쉬는 여행을 찾고 계신가요?",
        "mood_active": "활동적인 여행을 원하시나요? "
        "강도와 취향을 수정한 뒤 확인해 주세요.",
        "mood_other": "이번 여행에서 원하는 활동과 분위기를 선택해 주세요.",
    },
    "en": {
        "intro": "Here are a few places to consider for this trip.",
        "companion_connected": "Here are the latest checked updates for your trip.",
        "companion_disconnected": "Trip updates are currently disconnected.",
        "companion_ended": "These are the records of your ended trip.",
        "empty": "No verified candidates match this request. "
        "Check the data status and the suggested changes to your conditions.",
        "query_failed": "The catalogue could not be checked just now. "
        "Please try again shortly.",
        "matches": "These choices match your preferences: {tags}.",
        "unmatched": "This is a registered place to consider. "
        "Its match with your preferences still needs checking.",
        "origin": "Where will you set off from?",
        "date": "Which date would you like to travel?",
        "plan": "Here is a draft itinerary for your selected place. "
        "Check travel times and unresolved conditions before saving it.",
        "stay": "Stay: {minutes} minutes",
        "unchecked": "Still to check: {conditions}",
        "catalog_time": "Catalogue fetched: {time}",
        "limits": "This order compares preferences within the searched catalogue. "
        "Travel times, costs and on-site conditions still need checking.",
        "mood_quiet": "Would you like a quiet break with a short journey?",
        "mood_active": "Would you like an active trip? "
        "Adjust the intensity and confirm.",
        "mood_other": "Choose the activities and atmosphere you want for this trip.",
    },
    "ja": {
        "intro": "今回の旅には、こちらの候補を比べてみてください。",
        "companion_connected": "最後に確認した旅の案内です。",
        "companion_disconnected": "旅行の更新は現在接続されていません。",
        "companion_ended": "終了した旅行の案内記録です。",
        "empty": "この条件で確認できる候補はありません。"
        "資料の状態と変更できる条件をご確認ください。",
        "query_failed": "現在、登録資料を取得できません。"
        "しばらくして再度お試しください。",
        "matches": "選んだ好みのうち、{tags} を反映しています。",
        "unmatched": "登録情報から見つけた候補です。好みに合うかは確認が必要です。",
        "origin": "どこから出発しますか？",
        "date": "何日に出かけますか？",
        "plan": "選んだ場所で旅程の下書きを作りました。"
        "保存前に移動時間と未確認の条件をご確認ください。",
        "stay": "滞在時間 {minutes}分",
        "unchecked": "確認が必要な条件：{conditions}",
        "catalog_time": "登録資料の取得日時：{time}",
        "limits": "検索した登録地点の範囲で好みを比較した順番です。"
        "移動時間・費用・現地の状況は確認が必要です。",
        "mood_quiet": "移動を短くして、静かに休む旅をお探しですか？",
        "mood_active": "活動的な旅をご希望ですか？強度を調整して確認してください。",
        "mood_other": "今回の旅で希望する活動や雰囲気を選んでください。",
    },
    "zh-CN": {
        "intro": "这次旅行，可以先比较这些地点。",
        "companion_connected": "以下是最近确认的旅行提示。",
        "companion_disconnected": "旅行信息更新目前未连接。",
        "companion_ended": "这是已结束旅行的提示记录。",
        "empty": "目前没有符合条件的已核实候选地点。请查看资料状态和可调整的条件。",
        "query_failed": "目前无法查询登记资料，请稍后再试。",
        "matches": "已考虑您选择的偏好：{tags}。",
        "unmatched": "这是根据登记资料找到的候选地点，是否符合偏好仍需确认。",
        "origin": "您打算从哪里出发？",
        "date": "您打算哪天出行？",
        "plan": "已为您选择的地点生成行程草稿。保存前请确认交通时间和待核实条件。",
        "stay": "停留 {minutes} 分钟",
        "unchecked": "待确认条件：{conditions}",
        "catalog_time": "登记资料获取时间：{time}",
        "limits": "排序仅比较本次目录中的偏好匹配。交通时间、费用和现场状况仍需确认。",
        "mood_quiet": "您想找路程短、可以安静休息的旅行吗？",
        "mood_active": "您想安排活跃的旅行吗？请调整活动强度并确认。",
        "mood_other": "请选择这次旅行想要的活动和氛围。",
    },
    "zh-TW": {
        "intro": "這次旅行，可以先比較這些地點。",
        "companion_connected": "以下是最近確認的旅行提示。",
        "companion_disconnected": "旅行資訊更新目前未連線。",
        "companion_ended": "這是已結束旅行的提示記錄。",
        "empty": "目前沒有符合條件的已核實候選地點。請查看資料狀態和可調整的條件。",
        "query_failed": "目前無法查詢登記資料，請稍後再試。",
        "matches": "已考慮您選擇的偏好：{tags}。",
        "unmatched": "這是根據登記資料找到的候選地點，是否符合偏好仍需確認。",
        "origin": "您打算從哪裡出發？",
        "date": "您打算哪天出行？",
        "plan": "已為您選擇的地點產生行程草稿。儲存前請確認交通時間和待核實條件。",
        "stay": "停留 {minutes} 分鐘",
        "unchecked": "待確認條件：{conditions}",
        "catalog_time": "登記資料取得時間：{time}",
        "limits": "排序僅比較本次目錄中的偏好符合程度。"
        "交通時間、費用和現場狀況仍需確認。",
        "mood_quiet": "您想找路程短、可以安靜休息的旅行嗎？",
        "mood_active": "您想安排活躍的旅行嗎？請調整活動強度並確認。",
        "mood_other": "請選擇這次旅行想要的活動和氛圍。",
    },
}


def copy(locale, key, **values):
    return COPY[locale][key].format(**values)


LABELS = {
    "opening_hours": ("영업시간", "opening hours", "営業時間", "营业时间", "營業時間"),
    "reservation_required": (
        "예약 필요 여부",
        "reservations",
        "予約の要否",
        "预约要求",
        "預約要求",
    ),
    "price": ("비용", "cost", "費用", "费用", "費用"),
    "activity_support": (
        "활동 가능 조건",
        "activity conditions",
        "活動条件",
        "活动条件",
        "活動條件",
    ),
    "child_friendly": (
        "아이 동반 조건",
        "conditions for children",
        "子連れの条件",
        "儿童同行条件",
        "兒童同行條件",
    ),
    "travel_time": ("이동시간", "travel time", "移動時間", "交通时间", "交通時間"),
    "favorite": ("찜한 장소", "saved favourite", "お気に入り", "收藏地点", "收藏地點"),
    "positive_review": ("만족한 경험", "positive feedback", "良い感想", "好评", "好評"),
    "confirmed_visit": (
        "확인한 방문",
        "confirmed visit",
        "確認済み訪問",
        "已确认到访",
        "已確認造訪",
    ),
    "해변": ("해변", "beach", "海辺", "海滩", "海灘"),
    "온천": ("온천", "hot springs", "温泉", "温泉", "溫泉"),
    "서핑": ("서핑", "surfing", "サーフィン", "冲浪", "衝浪"),
    "물멍": ("물멍", "watching the water", "水辺で過ごす", "观水放松", "觀水放鬆"),
    "조용한 휴식": (
        "조용한 휴식",
        "a quiet break",
        "静かな休憩",
        "安静休息",
        "安靜休息",
    ),
    "짧은 이동": ("짧은 이동", "a short journey", "短い移動", "短途出行", "短途出行"),
}


def label(locale, value):
    index = ("ko", "en", "ja", "zh-CN", "zh-TW").index(locale)
    return LABELS[value][index] if value in LABELS else value

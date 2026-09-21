import type { MessageTranslations } from "../i18n.ts";

export const conditionsMessages: Record<string, MessageTranslations> = {
  "다음 간조·만조": ["Next low and high tides", "下一次低潮与高潮", "次の干潮・満潮"],
  "간조·만조 조회에 실패해 물때 기준은 적용하지 않았습니다. 표시된 점수는 안전 판정이 아닙니다.": ["Tide lookup failed, so tide-based rules were not applied. The displayed scores are not safety assessments.", "潮汐查询失败，因此未应用潮汐规则。显示的分数不是安全评估。", "干潮・満潮の取得に失敗したため、潮汐の基準は適用していません。表示スコアは安全判定ではありません。"],
  "국립해양조사원 공식 조석 예측": ["Official tide predictions from KHOA", "韩国国立海洋调查院官方潮汐预测", "韓国国立海洋調査院の公式潮汐予測"],
  "연결된 다음 간조·만조 예측이 없습니다.": ["No upcoming low or high tide predictions are available for this place.", "此地点暂无已关联的下次潮汐预测。", "この場所に紐づく次の干潮・満潮予測はありません。"],
  "일부 물때만 수집되었습니다.": ["Only some tide events are available.", "仅收集到部分潮汐时间。", "一部の潮汐時刻のみ取得されています。"],
  "점수 기준 · 미보정 참고값": ["Scoring criteria · uncalibrated reference", "评分标准 · 未校准参考值", "採点基準 · 未較正の参考値"],
  "홈": [
    "Home",
    "首页",
    "ホーム"
  ],
  "기온": [
    "Air temperature",
    "气温",
    "気温"
  ],
  "외부 기온": [
    "Outdoor air temperature",
    "室外气温",
    "外気温"
  ],
  "수온": [
    "Water temperature",
    "水温",
    "水温"
  ],
  "파고": [
    "Wave height",
    "浪高",
    "波高"
  ],
  "바람": [
    "Wind",
    "风",
    "風"
  ],
  "풍속": [
    "Wind speed",
    "风速",
    "風速"
  ],
  "최대 풍속": [
    "Maximum wind speed",
    "最大风速",
    "最大風速"
  ],
  "최대 파고": [
    "Maximum wave height",
    "最大浪高",
    "最大波高"
  ],
  "1시간 강수량": [
    "1-hour precipitation",
    "1小时降水量",
    "1時間降水量"
  ],
  "오늘의 활동 조회 중": [
    "Loading today's activities",
    "正在加载今日活动",
    "今日のアクティビティを読み込み中"
  ],
  "오늘 가장 좋은 활동": [
    "Today's best activity",
    "今日最佳活动",
    "今日に最も合うアクティビティ"
  ],
  "점수 조회 중": [
    "Loading score",
    "正在加载评分",
    "スコアを読み込み中"
  ],
  "오늘 후보 활동 {count}가지 보기 →": [
    "View today's {count} candidate activities →",
    "查看今日{count}项候选活动 →",
    "今日の候補アクティビティ{count}件を見る →"
  ],
  "오늘 한눈에": [
    "Today at a glance",
    "今日概览",
    "今日の概要"
  ],
  " · {activity} 점수를 이루는 것들": [
    " · Factors in the {activity} score",
    " · {activity}评分构成",
    " · {activity}スコアの内訳"
  ],
  "{activity} 점수를 이루는 것들": [
    "Factors in the {activity} score",
    "{activity}评分构成",
    "{activity}スコアの内訳"
  ],
  "점수를 이루는 항목을 읽지 못했습니다. 아래 상태 문장을 확인하세요.": [
    "The score components could not be loaded. Check the status below.",
    "无法加载评分项目。请查看下方状态说明。",
    "スコアの項目を読み込めませんでした。下の状態をご確認ください。"
  ],
  "수질 · 최근 검사": [
    "Water quality · Latest test",
    "水质 · 最近检测",
    "水質 · 最新の検査"
  ],
  "점수 미반영": [
    "Not included in score",
    "不计入评分",
    "スコアに含まれません"
  ],
  "{mode} 기준 날씨와 바다": [
    "Weather and sea · {mode}",
    "天气与海况 · {mode}",
    "天気と海の状況 · {mode}"
  ],
  "{mode} 기준이며 강수는 강수량입니다. 자료가 없거나 상충하면 –로 표시합니다. 항목 점수는 100점 만점이며, 총점은 이 항목들을 같은 비중으로 평균낸 값입니다.": [
    "Based on {mode}; precipitation means rainfall amount. Missing or conflicting data is shown as –. Each component is scored out of 100, and the total is their equally weighted average.",
    "基于{mode}；降水指降水量。缺失或冲突的数据显示为–。各项满分100分，总分为各项等权平均值。",
    "{mode}に基づき、降水は降水量を表します。欠測や矛盾は–で表示します。各項目は100点満点で、総合点は各項目の等しい重みによる平均です。"
  ],
  "지역 미확인": [
    "Region unknown",
    "地区未确认",
    "地域未確認"
  ],
  "바다가 좋은 오늘 · 해변 명소": [
    "A day by the sea · Beaches",
    "海边的一天 · 海滩景点",
    "海を楽しむ今日 · ビーチの名所"
  ],
  "해변 목록을 조회하고 있습니다.": [
    "Loading beaches.",
    "正在加载海滩列表。",
    "ビーチの一覧を読み込んでいます。"
  ],
  "수집된 해변이 아직 없습니다.": [
    "No beaches have been collected yet.",
    "尚未收集到海滩资料。",
    "収集済みのビーチはまだありません。"
  ],
  "서버가 카테고리와 장소명을 보고 해변으로 분류한 곳입니다.": [
    "These places are classified as beaches by their category and name.",
    "这些地点根据类别和名称被归类为海滩。",
    "カテゴリと名称に基づき、ビーチに分類された場所です。"
  ],
  "명소 전체": [
    "All places",
    "全部景点",
    "すべての名所"
  ],
  "명소를 고르면 그곳의 퐁당 점수를 조회합니다. 거리 · 운영시간은 아직 내려주는 API 가 없습니다. 대표 사진은 수집된 사진이 있는 장소에 표시합니다.": [
    "Choose a place to load its Pongdang score. Distance and opening hours are not yet available. A representative photo is shown where a collected photo exists.",
    "选择景点可查看其Pongdang评分。距离和营业时间尚不可用。有已收集照片的地点会显示代表照片。",
    "名所を選ぶとPongdangスコアを読み込みます。距離と営業時間はまだ取得できません。収集済みの写真がある場所には代表写真を表示します。"
  ],
  "고른 취향의 명소": [
    "Places matching your preferences",
    "符合偏好的景点",
    "好みに合う名所"
  ],
  "아직 고른 취향이 없습니다. 위 「취향 고르기」로 취향을 고르면 그 결과가 여기에 들어옵니다.": [
    "No preferences selected yet. Use “Choose preferences” above to see your results here.",
    "尚未选择偏好。使用上方“选择偏好”后，结果将显示在这里。",
    "好みはまだ選択されていません。上の「好みを選ぶ」で選択すると、結果がここに表示されます。"
  ],
  "고른 취향의 명소{tags}": [
    "Places matching your preferences{tags}",
    "符合偏好的景点{tags}",
    "好みに合う名所{tags}"
  ],
  "추천에서 고른 취향에 맞춰 서버가 고른 장소입니다.": [
    "These places were selected to match the preferences in your recommendations.",
    "这些地点根据您在推荐中选择的偏好筛选。",
    "おすすめで選んだ好みに合わせて選定された場所です。"
  ],
  "추천 다시 보기": [
    "View recommendations again",
    "重新查看推荐",
    "おすすめをもう一度見る"
  ],
  "퐁당 점수는 물놀이 조건이 있는 명소에만 산정됩니다. 없으면 –이며 0점이 아닙니다.": [
    "Pongdang scores are calculated only for places with water activity conditions. Missing scores are shown as –, not zero.",
    "只有具备水上活动条件资料的景点才会计算Pongdang评分。无评分时显示–，并非0分。",
    "Pongdangスコアは水遊びの条件資料がある名所だけで算出します。資料がない場合は–で、0点ではありません。"
  ],
  "취향만 알려주면 코스를 짜드려요": [
    "Tell us what you like and we'll plan a route",
    "告诉我们您的偏好，为您规划路线",
    "好みを教えて、コースを作りましょう"
  ],
  "선택한 취향과 실제 장소 카탈로그, 해당 시각의 환경 근거를 비교합니다. 추천 이유와 미확인 조건은 결과에서 함께 확인하세요.": [
    "We compare your preferences with the real place catalogue and environmental evidence for the requested time. Results include the reasons for each recommendation and unconfirmed conditions.",
    "我们将您的偏好与真实地点目录及相应时刻的环境资料进行比较。结果中可查看推荐理由和未确认条件。",
    "選択した好みを実際の場所カタログと該当時刻の環境資料に照らし合わせます。結果でおすすめの理由と未確認の条件もご確認ください。"
  ],
  "취향 고르기 →": [
    "Choose preferences →",
    "选择偏好 →",
    "好みを選ぶ →"
  ],
  "물놀이 최적경로": [
    "Water activity route",
    "水上活动路线",
    "水遊びのルート"
  ],
  "{places} · 예상 이동 {minutes}분": [
    "{places} · Estimated travel {minutes} min",
    "{places} · 预计行程{minutes}分钟",
    "{places} · 推定移動時間{minutes}分"
  ],
  "추천에서 장소를 고르고 지도에서 경로를 요청하세요": [
    "Choose places from recommendations and request a route on the map",
    "从推荐中选择地点，然后在地图上请求路线",
    "おすすめから場所を選び、地図でルートをリクエストしてください"
  ],
  "경로 탐색 →": [
    "Find a route →",
    "查找路线 →",
    "ルートを探す →"
  ],
  "추천에서 고른 실제 장소를 지도에서 확인하고, 출발지를 정해 경로를 요청할 수 있습니다.": [
    "See the real places from your recommendations on the map, set a starting point, and request a route.",
    "在地图上查看推荐中选定的真实地点，设置出发地并请求路线。",
    "おすすめで選んだ実際の場所を地図で確認し、出発地を指定してルートをリクエストできます。"
  ],
  "타임랩스": [
    "Timelapse",
    "延时影像",
    "タイムラプス"
  ],
  "원본 보기": [
    "View original",
    "查看原始页面",
    "元のページを見る"
  ],
  "라이브캠 물멍": [
    "Waterfront webcams",
    "水景摄像头",
    "水辺のライブカメラ"
  ],
  "다른 풍경 보기": [
    "Show other views",
    "查看其他风景",
    "別の風景を見る"
  ],
  "물 풍경을 고르는 중입니다.": [
    "Selecting water views.",
    "正在选择水景。",
    "水辺の風景を選んでいます。"
  ],
  "위치와 관계없이 고른 랜덤 물 풍경입니다. 카드를 누르면 해당 카메라가 열립니다. 배경은 영상 썸네일이 아닙니다.": [
    "Random water views, independent of your location. Open a card to view its camera. The background is not a video thumbnail.",
    "随机选择的水景，与您的位置无关。点击卡片可打开对应摄像头。背景并非视频缩略图。",
    "位置に関係なくランダムに選んだ水辺の風景です。カードを押すとカメラが開きます。背景は映像のサムネイルではありません。"
  ],
  "현재 목록에 열 수 있는 물 풍경 카메라가 없습니다.": [
    "No accessible water-view cameras in the current list.",
    "当前列表中没有可打开的水景摄像头。",
    "現在の一覧に開ける水辺のカメラはありません。"
  ],
  "목록 유효기간이 지나 원본 페이지로 연결합니다. 다른 풍경 보기로 새로 불러오세요. ": [
    "The list has expired, so links open the original pages. Use “Show other views” to refresh. ",
    "列表已过期，链接将打开原始页面。请选择“查看其他风景”刷新。 ",
    "一覧の有効期限が切れたため、元のページに移動します。「別の風景を見る」で更新してください。 "
  ],
  "전체 라이브캠 →": [
    "All webcams →",
    "全部摄像头 →",
    "すべてのライブカメラ →"
  ],
  "조회 실패": [
    "Failed to load",
    "加载失败",
    "読み込み失敗"
  ],
  "조건 조회 중입니다.": [
    "Loading conditions.",
    "正在加载条件资料。",
    "条件を読み込んでいます。"
  ],
  "{place} · {date} · {mode} 기준": [
    "{place} · {date} · Based on {mode}",
    "{place} · {date} · 基于{mode}",
    "{place} · {date} · {mode}に基づく"
  ],
  "강릉 물놀이": [
    "Water activities in Gangneung",
    "江陵水上活动",
    "江陵の水遊び"
  ],
  "코스 만들기": [
    "Plan a course",
    "规划行程",
    "コースを作る"
  ],
  "수질 · 점수 미반영": [
    "Water quality · Not scored",
    "水质 · 不计入评分",
    "水質 · スコア対象外"
  ],
  "{hour}시 · {score}": [
    "{hour}:00 · {score}",
    "{hour}时 · {score}",
    "{hour}時 · {score}"
  ],
  "평가값 없음": [
    "No evaluated score",
    "无评估值",
    "評価値なし"
  ],
  "{score}점 {grade}": [
    "{score} points · {grade}",
    "{score}分 · {grade}",
    "{score}点 · {grade}"
  ],
  "시간대 점수 조회 중": [
    "Loading hourly scores",
    "正在加载分时评分",
    "時間帯別スコアを読み込み中"
  ],
  "{hour}시": [
    "{hour}:00",
    "{hour}时",
    "{hour}時"
  ],
  "지금 점수를 이루는 것들": [
    "What makes up the current score",
    "当前评分构成",
    "現在のスコアの内訳"
  ],
  "해변": [
    "Beach",
    "海滩",
    "ビーチ"
  ],
  "{place} · {activity} 점수를 이루는 것들": [
    "{place} · Factors in the {activity} score",
    "{place} · {activity}评分构成",
    "{place} · {activity}スコアの内訳"
  ],
  "{place} · 시간대별": [
    "{place} · By hour",
    "{place} · 分时段",
    "{place} · 時間帯別"
  ],
  "더 자세한 비교와 예보, 수질 근거가 궁금하다면 오늘 탭을 살펴보세요!": [
    "See the Today tab for detailed comparisons, forecasts, and water-quality evidence.",
    "前往“今日”页查看详细比较、预报和水质依据。",
    "詳しい比較・予報・水質の根拠は「今日」タブでご覧ください。"
  ],
  "오늘 탭에서 근거 보기": [
    "View evidence in Today",
    "在“今日”查看依据",
    "「今日」で根拠を見る"
  ],
  "바다가 좋은 오늘": [
    "A day by the sea",
    "海边的一天",
    "海を楽しむ今日"
  ],
  "해변 명소": [
    "Beach destinations",
    "海滩景点",
    "ビーチの名所"
  ],
  "바로 이어가기": [
    "Explore next",
    "继续探索",
    "続けて探す"
  ],
  "명소 페이지로 가서 더 많은 강릉 명소를 둘러보세요.": [
    "Explore more Gangneung destinations on the Places page.",
    "前往“景点”页探索更多江陵景点。",
    "「名所」ページで江陵の名所をもっと探しましょう。"
  ],
  "명소 탭 전체 보기": [
    "View all places",
    "查看全部景点",
    "名所をすべて見る"
  ],
  "명소를 고르면 그곳의 퐁당 점수를 조회합니다. 목록에 점수를 싣지 않는 것은 장소마다 한 번씩 조회해야 하기 때문입니다. 거리 · 운영시간은 아직 내려주는 API 가 없습니다. 대표 사진은 수집된 사진이 있는 장소에 표시합니다. 리뷰 평점은 쓰지 않습니다.": [
    "Choose a place to load its Pongdang score. Scores require a separate query per place and are not included in the list. Distance and opening hours are not yet available. Representative photos appear where collected photos exist. Review ratings are not used.",
    "选择景点可加载其Pongdang评分。评分需逐个地点查询，因此不列在列表中。距离和营业时间尚不可用。有已收集照片的地点会显示代表照片，不使用评论评分。",
    "名所を選ぶとPongdangスコアを読み込みます。各場所の個別照会が必要なため一覧にはスコアを載せていません。距離と営業時間はまだ取得できません。収集済みの写真がある場所に代表写真を表示し、レビュー評価は使用しません。"
  ],
  "취향 맞추기": [
    "Find your preferences",
    "匹配偏好",
    "好みを見つける"
  ],
  "뭘 좋아하는지": [
    "Tell us",
    "告诉我们",
    "どんなことが好きか"
  ],
  "알려 주세요": [
    "what you like",
    "您喜欢什么",
    "教えてください"
  ],
  "취향을 골라 나만의 코스를 만들어보세요.": [
    "Choose your preferences and create your own course.",
    "选择偏好，规划专属行程。",
    "好みを選んで自分だけのコースを作りましょう。"
  ],
  "{tags}을 고르셨습니다": [
    "You selected {tags}",
    "您选择了{tags}",
    "{tags}を選びました"
  ],
  "아직 고른 취향이 없습니다": [
    "No preferences selected yet",
    "尚未选择偏好",
    "好みはまだ選択されていません"
  ],
  "추천 다시 보기 →": [
    "View recommendations again →",
    "重新查看推荐 →",
    "おすすめをもう一度見る →"
  ],
  "AI 제안": [
    "AI suggestion",
    "AI建议",
    "AIからの提案"
  ],
  "오늘 이 장소에서는 {activity}이(가) 가장 잘 맞습니다": [
    "{activity} is the best match for this place today",
    "今日这个地点最适合{activity}",
    "今日この場所では{activity}が最も条件に合います"
  ],
  "근거 —": [
    "Evidence —",
    "依据 —",
    "根拠 —"
  ],
  "추천 근거를 불러오지 못했어요. {error}": [
    "Could not load recommendation evidence. {error}",
    "无法加载推荐依据。{error}",
    "おすすめの根拠を読み込めませんでした。{error}"
  ],
  "취향에 맞는 명소": [
    "Places for your preferences",
    "符合偏好的景点",
    "好みに合う名所"
  ],
  "고르신 취향에": [
    "Selected to match",
    "根据您的偏好",
    "選んだ好みに"
  ],
  "맞춰 골랐습니다": [
    "your preferences",
    "为您筛选",
    "合わせて選びました"
  ],
  "{name} 상세": [
    "Details for {name}",
    "{name}详情",
    "{name}の詳細"
  ],
  "활동 미확인": [
    "Activity unconfirmed",
    "活动未确认",
    "アクティビティ未確認"
  ],
  "오늘 조건으로 {count}곳": [
    "{count} places for today's conditions",
    "符合今日条件的{count}个地点",
    "今日の条件で{count}か所"
  ],
  "코스를 만들면 여기에": [
    "Your planned course appears here",
    "规划的行程将显示在这里",
    "作成したコースをここに表示"
  ],
  "최적의 여행 코스를 만들어보세요.": [
    "Create a travel course that fits you.",
    "创建适合您的旅行行程。",
    "自分に合う旅行コースを作りましょう。"
  ],
  "예상 이동 {minutes}분 · 이동 시간은 경로 제공자가 준 추정값입니다.": [
    "Estimated travel: {minutes} min · Travel time is an estimate from the route provider.",
    "预计行程{minutes}分钟 · 行程时间为路线提供方的估计值。",
    "推定移動時間{minutes}分 · 移動時間はルート提供元による推定値です。"
  ],
  "지도에서 경로 탐색 →": [
    "Find a route on the map →",
    "在地图上查找路线 →",
    "地図でルートを探す →"
  ],
  "라이브캠": [
    "Webcams",
    "实时摄像头",
    "ライブカメラ"
  ],
  "지금 바다 보기": [
    "See the sea now",
    "查看此刻的海",
    "今の海を見る"
  ],
  "지금 이 순간의 바다, 그 풍경을 직접 느껴보세요": [
    "Experience a view of the sea right now",
    "感受此刻的海景",
    "今この瞬間の海を眺めましょう"
  ],
  "전체 화면으로": [
    "Open full view",
    "打开完整视图",
    "全体表示へ"
  ],
  "조회 중": [
    "Loading",
    "正在加载",
    "読み込み中"
  ],
  "송출 없음": [
    "No stream",
    "暂无直播",
    "配信なし"
  ],
  "물 풍경을 고르는 중입니다": [
    "Selecting water views",
    "正在选择水景",
    "水辺の風景を選んでいます"
  ],
  "열 수 있는 물 풍경 카메라가 없습니다": [
    "No accessible water-view cameras",
    "没有可打开的水景摄像头",
    "開ける水辺のカメラはありません"
  ],
  "장소와 관계없이 무작위로 선택된 물 풍경이며, 배경은 영상 썸네일이 아닙니다.": [
    "These water views are chosen at random, independent of location. The backgrounds are not video thumbnails.",
    "这些水景随机选择，与地点无关。背景并非视频缩略图。",
    "場所に関係なくランダムに選んだ水辺の風景で、背景は映像のサムネイルではありません。"
  ],
  "원본 페이지로 연결합니다. 다른 풍경 보기로 새로 불러오세요. ": [
    "Links open the original pages. Use “Show other views” to refresh. ",
    "链接将打开原始页面。请选择“查看其他风景”刷新。 ",
    "元のページに移動します。「別の風景を見る」で更新してください。 "
  ],
  "운영시간 · 장소까지의 거리 · 첫 입수 알림 트리거": [
    "Opening hours · Distance to place · First-swim alert trigger",
    "营业时间 · 到地点的距离 · 首次下水提醒触发条件",
    "営業時間 · 場所までの距離 · 初泳ぎ通知のトリガー"
  ],
  "수영": [
    "Swimming",
    "游泳",
    "水泳"
  ],
  "서핑": [
    "Surfing",
    "冲浪",
    "サーフィン"
  ],
  "휴식": [
    "Relaxing",
    "休息",
    "休憩"
  ],
  "래프팅": [
    "Rafting",
    "漂流",
    "ラフティング"
  ],
  "온천": [
    "Hot springs",
    "温泉",
    "温泉"
  ],
  "튜브 물놀이": [
    "Float-tube play",
    "泳圈戏水",
    "浮き輪で水遊び"
  ],
  "강릉": [
    "Gangneung",
    "江陵",
    "江陵"
  ],
  "선택 해수욕장": [
    "Selected beach",
    "所选海滩",
    "選択した海水浴場"
  ],
  "{date} · {place} {mode} 기준": [
    "{date} · {place} · Based on {mode}",
    "{date} · {place} · 基于{mode}",
    "{date} · {place} · {mode}に基づく"
  ],
  "장소 {mode} · 활동 점수 입력과 별도": [
    "Place {mode} · Separate from activity-score inputs",
    "地点{mode} · 与活动评分输入分开",
    "場所の{mode} · 活動スコアの入力とは別"
  ],
  "장소 {mode} · 활동 점수 입력과 별도.": [
    "Place {mode} · Separate from activity-score inputs.",
    "地点{mode} · 与活动评分输入分开。",
    "場所の{mode} · 活動スコアの入力とは別です。"
  ],
  "장소 자료 조회 실패: {error}": [
    "Could not load place data: {error}",
    "地点资料加载失败：{error}",
    "場所の資料を読み込めませんでした：{error}"
  ],
  "· 수온": [
    "· Water temperature",
    "· 水温",
    "· 水温"
  ],
  "지점 비교 · {activity} 점수": [
    "Compare places · {activity} score",
    "地点比较 · {activity}评分",
    "地点比較 · {activity}スコア"
  ],
  "전체 지도 →": [
    "Full map →",
    "完整地图 →",
    "地図全体へ →"
  ],
  "장소명": [
    "Place name",
    "地点名称",
    "場所名"
  ],
  "(수집 DB)": [
    "(Collected records)",
    "（已收集记录）",
    "（収集済み記録）"
  ],
  "지역": [
    "Region",
    "地区",
    "地域"
  ],
  "주소": [
    "Address",
    "地址",
    "住所"
  ],
  "검증 상태": [
    "Verification status",
    "验证状态",
    "検証状態"
  ],
  "점수": [
    "Score",
    "评分",
    "スコア"
  ],
  "장소를 선택하면 해당 지점의 분야별 점수와 조건 근거를 조회합니다. 자료가 없는 분야는 –이며, 부분 점수의 근거 확보율을 함께 확인하세요.": [
    "Select a place to load its component scores and condition evidence. Components without data show –. Check the evidence coverage alongside partial scores.",
    "选择地点可查看各项目评分及条件依据。无资料的项目显示–，请同时查看部分评分的依据覆盖率。",
    "場所を選ぶと項目別スコアと条件の根拠を読み込みます。資料がない項目は–です。部分スコアでは根拠の確保率もご確認ください。"
  ],
  "활동별 점수 · 선택 장소 조건": [
    "Activity scores · Selected place conditions",
    "活动评分 · 所选地点条件",
    "活動別スコア · 選択した場所の条件"
  ],
  "숫자 추천 보류": [
    "Numerical recommendation withheld",
    "暂不提供数值推荐",
    "数値によるおすすめを保留"
  ],
  "활동 지원 확인": [
    "Activity support confirmed",
    "已确认支持该活动",
    "アクティビティ対応を確認済み"
  ],
  "활동 미지원": [
    "Activity unsupported",
    "不支持该活动",
    "アクティビティ非対応"
  ],
  "지원 미확인": [
    "Support unconfirmed",
    "支持情况未确认",
    "対応状況未確認"
  ],
  "활동별 참고 점수입니다. 일부 근거로 계산한 값은 조건 전체를 대표하지 않습니다. 안전·운영 여부는 별도 확인이 필요합니다.": [
    "These are reference scores for each activity. A score based on partial evidence does not represent all conditions. Safety and operation require separate confirmation.",
    "这些是各活动的参考评分。基于部分依据计算的评分不能代表全部条件。安全及运营情况需另行确认。",
    "活動ごとの参考スコアです。一部の根拠で計算した値は条件全体を代表しません。安全性と営業状況は別途確認が必要です。"
  ],
  "분야별 근거 확인": [
    "View component evidence",
    "查看各项目依据",
    "項目別の根拠を確認"
  ],
  "활동": [
    "Activity",
    "活动",
    "アクティビティ"
  ],
  "공식 운영": [
    "Official operation",
    "官方运营",
    "公式の営業"
  ],
  "확인 필요": [
    "Confirmation required",
    "需要确认",
    "確認が必要"
  ],
  "운영정보 없음": [
    "No operating information",
    "无运营信息",
    "営業情報なし"
  ],
  "주변 {station}{distance} 참고": [
    "Nearby {station}{distance} · Reference",
    "周边{station}{distance} · 参考",
    "周辺の{station}{distance} · 参考"
  ],
  "관측소 {station}{distance}": [
    "Station {station}{distance}",
    "观测站{station}{distance}",
    "観測所 {station}{distance}"
  ],
  "공식 조석 예측의 간조·만조 시각입니다. 이 시각이 오늘의 활동 선택에 어떻게 작용했는지는 위 추천 근거에 있습니다 -- 여기 값과 그쪽 값은 서로 다른 조회라 시각이 어긋날 수 있어 합치지 않습니다.": [
    "These are low- and high-tide times from official tide predictions. The recommendation evidence above explains their role in today's activity choice. The two sections use separate queries and may have different reference times, so they are not combined.",
    "以下为官方潮汐预报的低潮与高潮时间。它们对今日活动选择的影响可在上方推荐依据中查看。两部分分别查询，参考时刻可能不同，因此不合并。",
    "公式潮汐予測の干潮・満潮時刻です。今日の活動選択への影響は上のおすすめの根拠で確認できます。別々の照会で基準時刻が異なる場合があるため、値は統合しません。"
  ],
  "이 시각의 한계": [
    "Limits of these times",
    "这些时间的局限",
    "この時刻の限界"
  ],
  "사건 시각만으로 현재 조류나 활동 적합 여부를 판단하지 않습니다.": [
    "Event times alone do not determine current currents or activity suitability.",
    "仅凭潮汐事件时间无法判断当前海流或活动适宜性。",
    "潮汐の時刻だけで現在の潮流や活動の適合性を判断しません。"
  ],
  "관측소명 없음": [
    "Station name unavailable",
    "无观测站名称",
    "観測所名なし"
  ],
  " · 해당 해변의 직접 예측이 아닙니다.": [
    " · This is not a direct prediction for this beach.",
    " · 这并非针对该海滩的直接预报。",
    " · このビーチを直接予測したものではありません。"
  ],
  "물때": [
    "Tides",
    "潮汐",
    "潮汐"
  ],
  "간조": [
    "Low tide",
    "低潮",
    "干潮"
  ],
  "만조": [
    "High tide",
    "高潮",
    "満潮"
  ],
  "다음 만조 높이": [
    "Next high-tide level",
    "下次高潮潮位",
    "次の満潮の潮位"
  ],
  "올해 첫 입수": [
    "First swim this year",
    "今年首次下水",
    "今年の初泳ぎ"
  ],
  "내 알림 조회 →": [
    "View my alerts →",
    "查看我的提醒 →",
    "自分の通知を見る →"
  ],
  "기준 관측 알림": [
    "Observed-threshold alert",
    "观测阈值提醒",
    "観測値の基準通知"
  ],
  "선택 기준 {temperature}°C · {state} · 최근 평가 {time}": [
    "Selected threshold {temperature}°C · {state} · Last evaluated {time}",
    "所选阈值{temperature}°C · {state} · 最近评估{time}",
    "選択した基準{temperature}°C · {state} · 最新の評価{time}"
  ],
  "이 장소의 올해 알림 구독이 없습니다.": [
    "No alert subscription for this place this year.",
    "今年尚未订阅该地点的提醒。",
    "この場所の今年の通知登録はありません。"
  ],
  "개인 구독의 평가 상태입니다. 첫 입수일과 전년 비교는 관측 이력이 입증하지 않아 표시하지 않습니다.": [
    "This is the evaluation status of your subscription. The first-swim date and year-over-year comparison are not shown because the observation history does not establish them.",
    "这里显示个人订阅的评估状态。观测历史不足以确认首次下水日期或同比变化，因此不予显示。",
    "個人の通知登録の評価状態です。初泳ぎ日と前年との比較は観測履歴で裏付けられないため表示しません。"
  ],
  "수질 등급 · 최근 검사": [
    "Water-quality grade · Latest test",
    "水质等级 · 最近检测",
    "水質等級 · 最新の検査"
  ],
  "공식 안전 판정 — 활동 조건 참고 점수와 별도 확인 필요": [
    "Official safety assessment — Confirm separately from activity condition scores",
    "官方安全评定 — 需与活动条件参考评分分别确认",
    "公式の安全判定 — 活動条件の参考スコアとは別に確認が必要"
  ],
  "첫 입수일·전년 비교 — 연속 관측 이력 확인 필요": [
    "First-swim date and yearly comparison — Continuous observation history required",
    "首次下水日期及同比 — 需确认连续观测历史",
    "初泳ぎ日・前年との比較 — 連続した観測履歴の確認が必要"
  ],
  "오늘의 해수욕장 위생 수질 — 최신 대장균·장구균 검사 필요": [
    "Today's beach hygiene — Latest E. coli and enterococci tests required",
    "今日海滩卫生水质 — 需最新大肠杆菌及肠球菌检测",
    "今日の海水浴場の衛生水質 — 最新の大腸菌・腸球菌検査が必要"
  ],
  "추가 근거가 필요한 항목": [
    "Items requiring more evidence",
    "需要更多依据的项目",
    "追加の根拠が必要な項目"
  ],
  "장소·조건·공식 예보·물때·수질 비교·개인 알림을 각각 조회합니다. 빈 값과 unknown은 안전함을 뜻하지 않습니다.": [
    "Places, conditions, official forecasts, tides, water-quality comparisons, and personal alerts are queried separately. Empty values and unknown do not mean safe.",
    "地点、条件、官方预报、潮汐、水质比较和个人提醒分别查询。空值和unknown并不意味着安全。",
    "場所・条件・公式予報・潮汐・水質比較・個人通知はそれぞれ照会します。空欄やunknownは安全を意味しません。"
  ],
  "물때 조회 중": [
    "Loading tides",
    "正在加载潮汐",
    "潮汐を読み込み中"
  ],
  "장소 선택 필요": [
    "Select a place",
    "请选择地点",
    "場所を選択してください"
  ],
  "오늘의 판정": [
    "Today's assessment",
    "今日评估",
    "今日の評価"
  ],
  "장소 파고 조회 중": [
    "Loading place wave height",
    "正在加载地点浪高",
    "場所の波高を読み込み中"
  ],
  "장소 수온 조회 중": [
    "Loading place water temperature",
    "正在加载地点水温",
    "場所の水温を読み込み中"
  ],
  "장소 기온 조회 중": [
    "Loading place air temperature",
    "正在加载地点气温",
    "場所の気温を読み込み中"
  ],
  "장소 자료를 조회하고 있습니다.": [
    "Loading place data.",
    "正在加载地点资料。",
    "場所の資料を読み込んでいます。"
  ],
  "–는 해당 자료가 없다는 뜻입니다.": [
    "– means that data is unavailable.",
    "–表示没有相应资料。",
    "–は該当資料がないことを示します。"
  ],
  "장소 자료 없음.": [
    "No place data.",
    "无地点资料。",
    "場所の資料なし。"
  ],
  "주소 없음": [
    "No address",
    "无地址",
    "住所なし"
  ],
  "지점마다 자기 조건을 따로 조회합니다. 막대는 100점 만점 대비 위치이며 기여도가 아닙니다. 값이 없으면 –이고 0점이 아닙니다.": [
    "Each place's conditions are queried separately. Bars show the score out of 100, not its contribution. Missing values are shown as –, not zero.",
    "各地点的条件分别查询。条形图表示满分100分中的位置，并非贡献度。缺失值显示–，并非0分。",
    "各地点の条件を個別に照会します。棒は100点満点に対する位置で、寄与度ではありません。値がない場合は–で、0点ではありません。"
  ],
  "활동별 점수 · {place}": [
    "Activity scores · {place}",
    "活动评分 · {place}",
    "活動別スコア · {place}"
  ],
  "활동마다 보는 조건이 다릅니다. 지원하지 않는 활동은 –이며 0점이 아닙니다.": [
    "Each activity uses different conditions. Unsupported activities show –, not zero.",
    "各活动参考的条件不同。不支持的活动显示–，并非0分。",
    "活動ごとに参照する条件が異なります。非対応の活動は–で、0点ではありません。"
  ],
  "이번 주 예보": [
    "This week's forecast",
    "本周预报",
    "今週の予報"
  ],
  "이번 주 {activity} 예보": [
    "This week's {activity} forecast",
    "本周{activity}预报",
    "今週の{activity}予報"
  ],
  "값이 없는 날은 «–»이며 0점이 아닙니다 · 막대는 주간 내 상대 위치": [
    "Days without values show “–”, not zero · Bars show relative scores within the week",
    "无数据的日期显示“–”，并非0分 · 条形图表示本周内的相对位置",
    "値がない日は「–」で0点ではありません · 棒は週内での相対的な位置"
  ],
  "예보 조회 중": [
    "Loading forecast",
    "正在加载预报",
    "予報を読み込み中"
  ],
  "예보 조회 실패: {error}": [
    "Could not load forecast: {error}",
    "预报加载失败：{error}",
    "予報を読み込めませんでした：{error}"
  ],
  "날짜별 12:00 KST에 유효한 수집 예보로 계산합니다. 일부 근거만 있는 날짜는 부분 점수이며, 해당 시각의 근거가 없으면 –입니다. 안전 판정은 별도입니다.": [
    "Calculated from collected forecasts valid at 12:00 KST each day. Days with incomplete evidence have partial scores; no evidence for that time is shown as –. Safety is assessed separately.",
    "根据每日12:00 KST有效的已收集预报计算。仅有部分依据的日期显示部分评分；该时刻无依据时显示–。安全需另行评定。",
    "各日の12:00 KSTに有効な収集済み予報から計算します。一部の根拠しかない日は部分スコア、該当時刻の根拠がなければ–です。安全判定は別です。"
  ],
  "점수 근거": [
    "Score evidence",
    "评分依据",
    "スコアの根拠"
  ],
  "각 조건의 점수를 같은 비중으로 평균낸 값이 총점입니다. 값이 없는 항목은 –이며 0점이 아닙니다.": [
    "The total is the equally weighted average of the condition scores. Missing components show –, not zero.",
    "总分为各条件评分的等权平均值。无数值的项目显示–，并非0分。",
    "総合点は各条件のスコアの等しい重みによる平均です。値がない項目は–で、0点ではありません。"
  ],
  "공식 조석 예측의 간조·만조 시각입니다. 사건 시각만으로 현재 조류나 활동 적합 여부를 판단하지 않습니다.": [
    "These are official low- and high-tide predictions. Event times alone do not determine current currents or activity suitability.",
    "以下为官方低潮与高潮预报时间。仅凭事件时间无法判断当前海流或活动适宜性。",
    "公式潮汐予測の干潮・満潮時刻です。時刻だけで現在の潮流や活動の適合性を判断しません。"
  ],
  "활동별 공식 운영 시간대": [
    "Official operating times by activity",
    "各活动官方运营时段",
    "活動別の公式営業時間"
  ],
  "조위 조건만 기준": [
    "Based on tidal level only",
    "仅基于潮位条件",
    "潮位条件のみが基準"
  ],
  "주변": [
    "Nearby",
    "周边",
    "周辺"
  ],
  "관측소": [
    "Station",
    "观测站",
    "観測所"
  ],
  "물때 조건만 기준이며 점수 · 안전 판정과 다른 값입니다.": [
    "These refer only to tidal conditions and are separate from scores and safety assessments.",
    "仅基于潮汐条件，与评分及安全评定不同。",
    "潮汐条件のみを基準とし、スコアや安全判定とは別の値です。"
  ],
  "수질": [
    "Water quality",
    "水质",
    "水質"
  ],
  "최근 검사": [
    "Latest test",
    "最近检测",
    "最新の検査"
  ],
  "수질은 점수에 들어가지 않습니다. 물놀이 조건 점수와 다른 값이라 하나로 요약하지 않습니다.": [
    "Water quality is not included in the score. It measures something different from water activity conditions and is not combined with them.",
    "水质不计入评分。它与水上活动条件评分含义不同，因此不合并总结。",
    "水質はスコアに含まれません。水遊びの条件スコアとは別の値なので、一つにまとめません。"
  ],
  "검사 기관이 공표한 등급입니다.": [
    "Grade published by the testing organisation.",
    "检测机构公布的等级。",
    "検査機関が公表した等級です。"
  ],
  "조위 시계열 · 첫 입수 알림 트리거": [
    "Tidal-level time series · First-swim alert trigger",
    "潮位时间序列 · 首次下水提醒触发条件",
    "潮位の時系列 · 初泳ぎ通知のトリガー"
  ],
  "점수는 물놀이 조건 참고값이며 안전 판정이 아닙니다. 값이 없으면 «–» 로 두며 0 점 · 정상 · 안전으로 치환하지 않습니다. NULL · unknown 은 안전한 상태를 뜻하지 않습니다.": [
    "Scores are references for water activity conditions, not safety assessments. Missing values remain “–” and are not replaced with zero, normal, or safe. NULL and unknown do not mean safe.",
    "评分是水上活动条件参考值，并非安全评定。缺失值保留为“–”，不替换为0分、正常或安全。NULL和unknown并不表示安全。",
    "スコアは水遊びの条件の参考値で、安全判定ではありません。値がない場合は「–」とし、0点・正常・安全に置き換えません。NULL・unknownは安全な状態を意味しません。"
  ],
  "7일 예보": [
    "7-day forecast",
    "7天预报",
    "7日間予報"
  ],
  "7일 예보 · {activity}": [
    "7-day forecast · {activity}",
    "7天预报 · {activity}",
    "7日間予報 · {activity}"
  ],
  "날짜 선택": [
    "Choose a date",
    "选择日期",
    "日付を選択"
  ],
  "예보 점수 조회 중": [
    "Loading forecast score",
    "正在加载预报评分",
    "予報スコアを読み込み中"
  ],
  "예보 점수 조회 실패": [
    "Could not load forecast score",
    "预报评分加载失败",
    "予報スコアの読み込みに失敗"
  ],
  "예보 점수 조회 실패: {error}": [
    "Could not load forecast score: {error}",
    "预报评分加载失败：{error}",
    "予報スコアを読み込めませんでした：{error}"
  ],
  "선택 날짜 예보 목록": [
    "Forecasts for the selected date",
    "所选日期预报列表",
    "選択した日付の予報一覧"
  ],
  "선택 날짜의 예보 목록을 조회하고 있습니다.": [
    "Loading forecasts for the selected date.",
    "正在加载所选日期的预报列表。",
    "選択した日付の予報一覧を読み込んでいます。"
  ],
  "예보 목록 조회 실패: {error}": [
    "Could not load forecast list: {error}",
    "预报列表加载失败：{error}",
    "予報一覧を読み込めませんでした：{error}"
  ],
  "예보를 조회할 장소가 없습니다.": [
    "No place available to query forecasts.",
    "没有可查询预报的地点。",
    "予報を照会する場所がありません。"
  ],
  "선택 날짜로 조회한 예보 목록이 비어 있습니다.": [
    "No forecasts were returned for the selected date.",
    "所选日期未返回预报。",
    "選択した日付の予報一覧は空です。"
  ],
  "선택 날짜의 예보 목록을 표시할 수 없습니다.": [
    "Unable to display forecasts for the selected date.",
    "无法显示所选日期的预报列表。",
    "選択した日付の予報一覧を表示できません。"
  ],
  " 위 점수의 산정 근거는 점수 상세에서 확인할 수 있습니다.": [
    " The evidence for the score above is available in the score details.",
    " 可在评分详情中查看上方评分的计算依据。",
    " 上のスコアの算出根拠はスコア詳細で確認できます。"
  ],
  "{date} KST 날짜에 걸친 예보 {total}건 중 {shown}건을 표시합니다.": [
    "Showing {shown} of {total} forecasts covering {date} KST.",
    "显示覆盖{date} KST日期的{total}条预报中的{shown}条。",
    "{date} KSTの日付にかかる予報{total}件中{shown}件を表示します。"
  ],
  "원자료 목록은 선택한 KST 날짜에 걸친 예보를 최대 100건까지 표시합니다. 날짜별 점수는 해당 날짜 12:00 KST에 유효한 수집 예보로 계산합니다. 목록 조회와 점수 조회는 별개이며, 해당 시각의 점수 근거가 없으면 –입니다.": [
    "The source list shows up to 100 forecasts covering the selected KST date. Daily scores use collected forecasts valid at 12:00 KST that day. List and score queries are separate; no score evidence for that time is shown as –.",
    "原始资料列表最多显示覆盖所选KST日期的100条预报。每日评分使用当日12:00 KST有效的已收集预报计算。列表和评分分别查询；该时刻无评分依据时显示–。",
    "原資料一覧は選択したKST日付にかかる予報を最大100件表示します。日別スコアはその日の12:00 KSTに有効な収集済み予報から計算します。一覧とスコアは別に照会し、該当時刻の根拠がなければ–です。"
  ],
  "오늘 시간대별 수집 예보": [
    "Today's collected hourly forecasts",
    "今日已收集的分时预报",
    "今日の収集済み時間帯別予報"
  ],
  "오늘 시간대별 예보 (09–18시)": [
    "Today's hourly forecast (09:00–18:00)",
    "今日分时预报（09–18时）",
    "今日の時間帯別予報（9〜18時）"
  ],
  "시각": [
    "Time",
    "时间",
    "時刻"
  ],
  "강수량": [
    "Precipitation",
    "降水量",
    "降水量"
  ],
  "관측소·격자 예보입니다. ‘최대’는 구간 최대값, ‘강수없음’·범위는 제공기관 표현입니다. 발표시각 미제공 예보가 포함될 수 있습니다.": [
    "These are station/grid forecasts. “Maximum” refers to the interval maximum; “no precipitation” and ranges preserve the provider's wording. Some forecasts may lack an issue time.",
    "这些是观测站及网格预报。“最大”指区间最大值，“无降水”及范围保留提供方的表述。部分预报可能未提供发布时间。",
    "観測所・格子の予報です。「最大」は区間最大値、「降水なし」や範囲は提供元の表現です。発表時刻のない予報が含まれる場合があります。"
  ],
  "근거 정보 없음": [
    "No evidence information",
    "无依据信息",
    "根拠情報なし"
  ],
  "부분 점수 · ": [
    "Partial score · ",
    "部分评分 · ",
    "部分スコア · "
  ],
  "근거 {available}/{total}{percentage}": [
    "Evidence {available}/{total}{percentage}",
    "依据{available}/{total}{percentage}",
    "根拠{available}/{total}{percentage}"
  ],
  "아직 수집된 측정값 없음": [
    "No measurements collected yet",
    "尚未收集测量值",
    "収集済みの測定値なし"
  ],
  "측정 시각·출처 근거 없음": [
    "Measurement time/source evidence missing",
    "缺少测量时间或来源依据",
    "測定時刻・出典の根拠なし"
  ],
  "관측소 간 값 충돌": [
    "Conflicting station measurements",
    "观测站之间数值冲突",
    "観測所間の値が矛盾"
  ],
  "측정값 범위 오류": [
    "Measurement outside valid range",
    "测量值超出有效范围",
    "測定値の範囲エラー"
  ],
  "장소별 운영 기준 설정 필요": [
    "Place-specific operating criteria required",
    "需要地点专属运营标准",
    "場所ごとの営業基準設定が必要"
  ],
  "주변 관측소 참고 · 장소 실측 아님": [
    "Nearby station reference · Not measured at this place",
    "周边观测站参考 · 并非该地点实测",
    "周辺観測所の参考値 · 現地の実測ではありません"
  ],
  "해당 장소를 포함한 격자 기상 예보": [
    "Weather forecast grid containing this place",
    "覆盖该地点的网格天气预报",
    "この場所を含む格子の気象予報"
  ],
  "같은 값의 제공기관 세부 분류를 묶어 계산": [
    "Provider subcategories with identical values are grouped for calculation",
    "合并数值相同的提供方细分类别进行计算",
    "同じ値の提供元の細分類をまとめて計算"
  ],
  "연결된 관측 자료 없음": [
    "No linked observation data",
    "无关联观测资料",
    "関連する観測資料なし"
  ],
  "자료 유효기간 만료": [
    "Data expired",
    "资料已过期",
    "資料の有効期限切れ"
  ],
  "관측 근거 충돌": [
    "Conflicting observation evidence",
    "观测依据冲突",
    "観測の根拠が矛盾"
  ],
  "측정 단위 미확인": [
    "Measurement unit unconfirmed",
    "测量单位未确认",
    "測定単位未確認"
  ],
  "예보 발표 시각 미확인": [
    "Forecast issue time unconfirmed",
    "预报发布时间未确认",
    "予報の発表時刻未確認"
  ],
  "수치 자료 없음": [
    "No numeric data",
    "无数值资料",
    "数値資料なし"
  ],
  "활동 지원 여부 미확인": [
    "Activity support unconfirmed",
    "活动支持情况未确认",
    "アクティビティの対応状況未確認"
  ],
  "공식 제한 또는 활동 미지원": [
    "Official restriction or unsupported activity",
    "官方限制或不支持该活动",
    "公式の制限または非対応の活動"
  ],
  "환경 참고점수 자료를 읽지 못했습니다.": [
    "Could not load environmental reference-score data.",
    "无法加载环境参考评分资料。",
    "環境参考スコアの資料を読み込めませんでした。"
  ],
  " · 근거 확보 {percent}% ({available}/{total}개)": [
    " · Evidence coverage {percent}% ({available}/{total})",
    " · 依据覆盖率{percent}%（{available}/{total}项）",
    " · 根拠確保率{percent}%（{available}/{total}件）"
  ],
  "공식 제한 또는 활동 미지원으로 계산 보류": [
    "Calculation withheld due to an official restriction or unsupported activity",
    "因官方限制或不支持该活动而暂停计算",
    "公式の制限または非対応の活動のため計算を保留"
  ],
  "계산에 필요한 근거 부족": [
    "Insufficient evidence for calculation",
    "计算依据不足",
    "計算に必要な根拠が不足"
  ],
  "일부 근거로 계산": [
    "Calculated from partial evidence",
    "根据部分依据计算",
    "一部の根拠で計算"
  ],
  "조건 근거로 계산": [
    "Calculated from condition evidence",
    "根据条件依据计算",
    "条件の根拠で計算"
  ],
  " 활동 지원 여부 미확인.": [
    " Activity support is unconfirmed.",
    " 活动支持情况尚未确认。",
    " 活動の対応状況は未確認です。"
  ],
  " 주변 관측소 참고 · 장소 실측 아님.": [
    " Nearby station reference, not a measurement at this place.",
    " 参考周边观测站，并非该地点实测。",
    " 周辺観測所の参考値で、現地の実測ではありません。"
  ],
  " 예보 발표 시각 미확인.": [
    " Forecast issue time is unconfirmed.",
    " 预报发布时间尚未确认。",
    " 予報の発表時刻は未確認です。"
  ],
  "{label} {score}{coverage} · {state}. 현장 검증 전 참고값이며 안전 판정이 아닙니다.{support}{context}{issueUnknown}": [
    "{label} {score}{coverage} · {state}. This is a reference value pending field validation, not a safety assessment.{support}{context}{issueUnknown}",
    "{label} {score}{coverage} · {state}。此为未经现场验证的参考值，并非安全评定。{support}{context}{issueUnknown}",
    "{label} {score}{coverage} · {state}。現地検証前の参考値で、安全判定ではありません。{support}{context}{issueUnknown}"
  ],
  "{score}점": [
    "{score} points",
    "{score}分",
    "{score}点"
  ],
  "근거 확보 자료를 읽지 못했습니다.": [
    "Could not load evidence coverage data.",
    "无法加载依据覆盖率资料。",
    "根拠確保率の資料を読み込めませんでした。"
  ],
  "계산 보류": [
    "Calculation withheld",
    "暂停计算",
    "計算を保留"
  ],
  " · 근거 확보 {available}/{total}": [
    " · Evidence coverage {available}/{total}",
    " · 依据覆盖{available}/{total}",
    " · 根拠確保{available}/{total}"
  ],
  "참고 점수 {value}{coverage} · {mode} {at} KST": [
    "Reference score {value}{coverage} · {mode} {at} KST",
    "参考评分{value}{coverage} · {mode} {at} KST",
    "参考スコア{value}{coverage} · {mode} {at} KST"
  ],
  "안전 상태 restricted — 공식 제한이 있습니다. 해당 안내를 먼저 따르세요.": [
    "Safety status restricted — An official restriction applies. Follow that guidance first.",
    "安全状态restricted — 存在官方限制，请优先遵守相应指引。",
    "安全状態restricted — 公式の制限があります。その案内を優先してください。"
  ],
  "안전 상태 caution — 확인된 주의 사항이 있습니다.": [
    "Safety status caution — Confirmed cautions apply.",
    "安全状态caution — 存在已确认的注意事项。",
    "安全状態caution — 確認済みの注意事項があります。"
  ],
  "안전 상태 unknown — 판정이 없다는 뜻이며 안전하다는 뜻이 아닙니다.": [
    "Safety status unknown — No assessment has been made; this does not mean safe.",
    "安全状态unknown — 表示尚无评定，并不代表安全。",
    "安全状態unknown — 判定がないという意味で、安全を意味しません。"
  ],
  "안전 상태 {status}.": [
    "Safety status {status}.",
    "安全状态{status}。",
    "安全状態{status}。"
  ],
  "자료 없음": [
    "No data",
    "无资料",
    "資料なし"
  ],
  "일부 자료": [
    "Partial data",
    "部分资料",
    "一部の資料"
  ],
  "제공 불가": [
    "Unavailable",
    "无法提供",
    "提供不可"
  ],
  "평가 완료": [
    "Evaluated",
    "已评估",
    "評価済み"
  ],
  "연결된 예보 자료 없음.": [
    "No linked forecast data.",
    "无关联预报资料。",
    "関連する予報資料がありません。"
  ],
  "예보 지원 기간 밖입니다.": [
    "Outside the supported forecast period.",
    "超出支持的预报期限。",
    "予報の対応期間外です。"
  ],
  "지원 기간 안이지만 해당 시각의 자료가 없습니다.": [
    "Within the supported period, but no data is available for that time.",
    "处于支持期限内，但没有该时刻的资料。",
    "対応期間内ですが、該当時刻の資料がありません。"
  ],
  "자료 상태 {status}.": [
    "Data status {status}.",
    "资料状态{status}。",
    "資料の状態{status}。"
  ],
  "{grade}등급{historical}": [
    "Grade {grade}{historical}",
    "{grade}级{historical}",
    "{grade}等級{historical}"
  ],
  " · 과거": [
    " · Historical",
    " · 历史资料",
    " · 過去の資料"
  ],
  "자료 상충": [
    "Conflicting data",
    "资料冲突",
    "資料が矛盾"
  ],
  "평가 기준 없음": [
    "No evaluation criteria",
    "无评估标准",
    "評価基準なし"
  ],
  "검사 자료 없음": [
    "No test data",
    "无检测资料",
    "検査資料なし"
  ],
  "수질 검사 자료를 조회하고 있습니다.": [
    "Loading water-quality tests.",
    "正在加载水质检测资料。",
    "水質検査の資料を読み込んでいます。"
  ],
  "해양 WQI는 하천·계곡에 적용하지 않습니다. 이 장소의 별도 수질 평가 기준이 필요합니다.": [
    "Marine WQI does not apply to rivers or valleys. This place needs separate water-quality criteria.",
    "海洋WQI不适用于河流或山谷。此地点需要单独的水质评估标准。",
    "海洋WQIは河川や渓谷には適用しません。この場所には別の水質評価基準が必要です。"
  ],
  "10km 안에 수집된 해양 수질 검사 자료가 없습니다.": [
    "No collected marine water-quality tests within 10 km.",
    "10公里范围内没有已收集的海洋水质检测资料。",
    "10km以内に収集済みの海洋水質検査資料がありません。"
  ],
  "주변 {station} 관측소{distance}": [
    "Nearby station {station}{distance}",
    "周边{station}观测站{distance}",
    "周辺の{station}観測所{distance}"
  ],
  "{station} 관측소": [
    "{station} station",
    "{station}观测站",
    "{station}観測所"
  ],
  "{location} · {date} 검사{historical}. {grade}{wqi}. 해역의 생태 수질 등급이며 오늘 해변의 수질·입수 안전 판정은 아닙니다.": [
    "{location} · Tested {date}{historical}. {grade}{wqi}. This is an ecological water-quality grade for the sea area, not today's beach water quality or an assessment of swimming safety.",
    "{location} · {date}检测{historical}。{grade}{wqi}。这是海域生态水质等级，并非今日海滩水质或下水安全评定。",
    "{location} · {date}検査{historical}。{grade}{wqi}。海域の生態学的な水質等級で、今日のビーチの水質や入水の安全判定ではありません。"
  ],
  " · {days}일 전 과거 자료": [
    " · Historical data from {days} days ago",
    " · {days}天前的历史资料",
    " · {days}日前の過去の資料"
  ],
  "{grade}등급 {label}": [
    "Grade {grade} {label}",
    "{grade}级 {label}",
    "{grade}等級 {label}"
  ],
  "등급을 확인할 수 없습니다": [
    "Grade could not be confirmed",
    "无法确认等级",
    "等級を確認できません"
  ],
  "최대 {value}": [
    "Maximum {value}",
    "最大{value}",
    "最大{value}"
  ],
  "관측": [
    "Observation",
    "观测",
    "観測"
  ],
  "예보": [
    "Forecast",
    "预报",
    "予報"
  ],
  "아직 조건 자료를 읽지 못했습니다.": [
    "Condition data has not loaded yet.",
    "尚未加载条件资料。",
    "条件資料をまだ読み込めていません。"
  ],
  "주변 관측소 참고{distance}": [
    "Nearby station reference{distance}",
    "周边观测站参考{distance}",
    "周辺観測所の参考値{distance}"
  ],
  "격자 기상": [
    "Grid weather",
    "网格天气",
    "格子気象"
  ],
  "대표 관측소": [
    "Representative station",
    "代表观测站",
    "代表観測所"
  ],
  "관측 지점": [
    "Observation point",
    "观测点",
    "観測地点"
  ],
  "{mode} 기준 {date} {time} KST. {sources}. 관측소·격자 자료는 현장 실측과 다릅니다.": [
    "Based on {mode} at {date} {time} KST. {sources}. Station/grid data differs from measurements taken at the site.",
    "基于{date} {time} KST的{mode}。{sources}。观测站和网格资料不同于现场实测。",
    "{date} {time} KSTの{mode}に基づきます。{sources}。観測所・格子資料は現地の実測とは異なります。"
  ],
  "관측·예보 근거 없음": [
    "No observation or forecast evidence",
    "无观测或预报依据",
    "観測・予報の根拠なし"
  ],
  "오늘": [
    "Today",
    "今天",
    "今日"
  ],
  "내일": [
    "Tomorrow",
    "明天",
    "明日"
  ],
  "탁도": [
    "Turbidity",
    "浊度",
    "濁度"
  ],
  "용존산소": [
    "Dissolved oxygen",
    "溶解氧",
    "溶存酸素"
  ],
  "추천 제외 · 필수 근거 부족": [
    "Excluded · Essential evidence missing",
    "不予推荐 · 缺少必要依据",
    "おすすめ対象外 · 必須の根拠不足"
  ],
  "추천 제외 · 수온 기준 미충족": [
    "Excluded · Water-temperature criterion not met",
    "不予推荐 · 不满足水温标准",
    "おすすめ対象外 · 水温基準を満たさない"
  ],
  "산정 보류 · 공식 제한 또는 활동 미지원": [
    "Score withheld · Official restriction or unsupported activity",
    "暂不评分 · 官方限制或不支持该活动",
    "算出保留 · 公式の制限または非対応の活動"
  ],
  "산정 불가 · 근거 부족": [
    "Unscored · Insufficient evidence",
    "无法评分 · 依据不足",
    "算出不可 · 根拠不足"
  ],
  "추천 제외": [
    "Excluded from recommendations",
    "不予推荐",
    "おすすめ対象外"
  ],
  "퐁당 자체 물때 기준이며 공식 운영시간 · 안전 판정이 아닙니다.": [
    "These are Pongdang's own tidal criteria, not official operating hours or a safety assessment.",
    "这是Pongdang自定的潮汐标准，并非官方运营时间或安全评定。",
    "Pongdang独自の潮汐基準で、公式営業時間や安全判定ではありません。"
  ],
  "계곡": [
    "Valley",
    "山谷",
    "渓谷"
  ],
  "카페 · 맛집": [
    "Cafés · Restaurants",
    "咖啡馆 · 餐厅",
    "カフェ · 飲食店"
  ],
  "가까운 명소": [
    "Nearby places",
    "附近景点",
    "近くの名所"
  ],
  "물에 들어가지 않는 하루": [
    "A day out of the water",
    "不下水的一天",
    "水に入らない一日"
  ],
  "오늘의 활동을": [
    "Today's activities",
    "今日活动",
    "今日のアクティビティを"
  ],
  "불러오지 못했습니다": [
    "could not be loaded",
    "无法加载",
    "読み込めませんでした"
  ],
  "불러오지 못했어요": [
    "could not be loaded",
    "无法加载",
    "読み込めませんでした"
  ],
  "오늘 점수를 낼 수 있는": [
    "There are no activities",
    "今天没有可以评分的",
    "今日スコアを算出できる"
  ],
  "활동이 없습니다": [
    "that can be scored today",
    "活动",
    "アクティビティがありません"
  ],
  "활동이 없어요": [
    "that can be scored today",
    "活动",
    "アクティビティがありません"
  ],
  "{waves} — 오늘은 수영보다 서핑에 맞는 파도예요": [
    "{waves} — Today's waves suit surfing better than swimming",
    "{waves} — 今天的海浪比起游泳更适合冲浪",
    "{waves} — 今日の波は水泳よりサーフィンに適しています"
  ],
  "{waves} — 파도가 잔잔해서 바다 수영에 맞아요": [
    "{waves} — Calm waves suit sea swimming",
    "{waves} — 波浪平静，适合海泳",
    "{waves} — 波が穏やかで海での水泳に適しています"
  ],
  "{rival} 점수가 더 높지만, 오늘은 물에 들어갈 수 있어서 {activity}을 먼저 권해요": [
    "Although {rival} scores higher, today's conditions support water activities, so {activity} is recommended first",
    "虽然{rival}评分更高，但今天的条件支持下水活动，因此优先推荐{activity}",
    "{rival}のスコアが高くても、今日は水に入る活動の条件があるため、{activity}を先におすすめします"
  ],
  "{measures} — 바다에 들어가기에는 낮아요(수온 {threshold} 아래)": [
    "{measures} — Too cold for entering the sea (water temperature below {threshold})",
    "{measures} — 对于下海而言温度过低（水温低于{threshold}）",
    "{measures} — 海に入るには低い温度です（水温{threshold}未満）"
  ],
  "{names}은 이곳의 {metrics} 자료가 없어 판단하지 않았어요 — 조건이 나쁜 것과 다릅니다": [
    "{names} was not assessed because this place has no {metrics} data — this does not mean conditions are poor",
    "由于此地点没有{metrics}资料，未评估{names} — 这不代表条件差",
    "この場所の{metrics}の資料がないため、{names}は判断していません — 条件が悪いという意味ではありません"
  ],
  "오늘 이곳에서 점수를 낼 수 있는 물 활동이 없어요": [
    "No water activity can be scored at this place today",
    "今天此地点没有可评分的水上活动",
    "今日この場所でスコアを算出できる水のアクティビティはありません"
  ],
  "시설 욕조 수온": [
    "Facility bath water temperature",
    "设施浴池水温",
    "施設の浴槽水温"
  ],
  "파주기": [
    "Wave period",
    "波浪周期",
    "波の周期"
  ],
  "하천 수위": [
    "River level",
    "河流水位",
    "河川の水位"
  ],
  "하천 유량": [
    "River flow",
    "河流流量",
    "河川の流量"
  ],
  "상대습도": [
    "Relative humidity",
    "相对湿度",
    "相対湿度"
  ],
  "물이 드는 중이에요. {disclaimer}": [
    "The tide is rising. {disclaimer}",
    "正在涨潮。{disclaimer}",
    "潮が満ちています。{disclaimer}"
  ],
  "물이 빠지는 중이에요. {disclaimer}": [
    "The tide is falling. {disclaimer}",
    "正在退潮。{disclaimer}",
    "潮が引いています。{disclaimer}"
  ],
  " · {activity} {score}점": [
    " · {activity} {score} points",
    " · {activity} {score}分",
    " · {activity} {score}点"
  ],
  "{activity} 적합도": [
    "{activity} suitability",
    "{activity}适宜度",
    "{activity}の適合度"
  ],
  "수영하기": [
    "swimming",
    "游泳",
    "水泳"
  ],
  "서핑하기": [
    "surfing",
    "冲浪",
    "サーフィン"
  ],
  "쉬기": [
    "relaxing",
    "休息",
    "休憩"
  ],
  "갯벌에 나가기": [
    "visiting tidal flats",
    "游览滩涂",
    "干潟に出ること"
  ],
  "온천하기": [
    "visiting hot springs",
    "泡温泉",
    "温泉"
  ],
  "래프팅하기": [
    "rafting",
    "漂流",
    "ラフティング"
  ],
  "{activity}에 아주 좋은 조건이에요": [
    "Excellent conditions for {activity}",
    "非常适合{activity}",
    "{activity}にとてもよい条件です"
  ],
  "{activity}에 좋은 조건이에요": [
    "Good conditions for {activity}",
    "适合{activity}",
    "{activity}によい条件です"
  ],
  "{activity}에 무난한 조건이에요": [
    "Fair conditions for {activity}",
    "{activity}条件一般",
    "{activity}にまずまずの条件です"
  ],
  "{activity}에는 아쉬운 조건이에요": [
    "Less suitable conditions for {activity}",
    "不太适合{activity}",
    "{activity}にはあまりよくない条件です"
  ],
  "{activity}에는 권하지 않는 조건이에요": [
    "Conditions are not recommended for {activity}",
    "当前条件不建议{activity}",
    "{activity}にはおすすめしない条件です"
  ],
  "{label} {value} — 이 조건이 점수를 가장 많이 낮췄어요": [
    "{label} {value} — This condition lowered the score the most",
    "{label} {value} — 该条件对评分的降低影响最大",
    "{label} {value} — この条件がスコアを最も下げました"
  ],
  "{label} {value} — 오늘 가장 좋은 조건이에요": [
    "{label} {value} — Today's strongest condition",
    "{label} {value} — 今日最好的条件",
    "{label} {value} — 今日最もよい条件です"
  ],
  "근거가 부족해 점수를 내지 못했어요": [
    "Insufficient evidence to calculate a score",
    "依据不足，无法评分",
    "根拠不足のためスコアを算出できませんでした"
  ],
  "분야별 점수·산정 기준·출처": [
    "Component scores, criteria, and sources",
    "各项目评分、计算标准及来源",
    "項目別スコア・算出基準・出典"
  ],
  "방법론 {model} {version}": [
    "Methodology {model} {version}",
    "方法 {model} {version}",
    "方法論 {model} {version}"
  ],
  "추천 근거 조회 중": [
    "Loading recommendation evidence",
    "正在加载推荐依据",
    "おすすめの根拠を読み込み中"
  ],
  "클로로필 a": [
    "Chlorophyll a",
    "叶绿素a",
    "クロロフィルa"
  ],
  "용존무기질소": [
    "Dissolved inorganic nitrogen",
    "溶解无机氮",
    "溶存無機窒素"
  ],
  "용존무기인": [
    "Dissolved inorganic phosphorus",
    "溶解无机磷",
    "溶存無機リン"
  ],
  "투명도": [
    "Transparency",
    "透明度",
    "透明度"
  ],
  "수질 1~5등급 기준과 검사값": [
    "Water-quality grades 1–5 and test results",
    "水质1至5级标准及检测值",
    "水質1〜5等級の基準と検査値"
  ],
  "1 매우 좋음 · 2 좋음 · 3 보통 · 4 나쁨 · 5 아주 나쁨": [
    "1 Excellent · 2 Good · 3 Fair · 4 Poor · 5 Very poor",
    "1非常好 · 2好 · 3一般 · 4差 · 5非常差",
    "1とても良い · 2良い · 3普通 · 4悪い · 5とても悪い"
  ],
  "공식 WQI 등급을 우선 사용하며, 등급 없이 WQI 지수만 제공되면 23 이하 / 24~33 / 34~46 / 47~59 / 60 이상으로 분류합니다.": [
    "Official WQI grades take priority. When only a WQI index is provided, the ranges are ≤23 / 24–33 / 34–46 / 47–59 / ≥60.",
    "优先使用官方WQI等级。仅提供WQI指数时，按23及以下／24至33／34至46／47至59／60及以上划分。",
    "公式WQI等級を優先し、指数のみ提供される場合は23以下／24〜33／34〜46／47〜59／60以上で分類します。"
  ],
  "표층 영양염·클로로필 a·투명도와 저층 산소포화도를 평가한 생태 기준입니다. 대장균·장구균 검사와 입수 통제는 별도로 확인해야 합니다.": [
    "This ecological measure evaluates surface nutrients, chlorophyll a, transparency, and bottom oxygen saturation. Check E. coli/enterococci tests and swimming restrictions separately.",
    "这是评估表层营养盐、叶绿素a、透明度及底层氧饱和度的生态标准。大肠杆菌、肠球菌检测及下水管制需另行确认。",
    "表層の栄養塩・クロロフィルa・透明度と底層の酸素飽和度を評価した生態基準です。大腸菌・腸球菌検査と入水規制は別途確認が必要です。"
  ],
  "해양환경정보포털 기준": [
    "Marine Environment Information System criteria",
    "海洋环境信息门户标准",
    "海洋環境情報ポータルの基準"
  ],
  "한국연안 수질 평가 논문": [
    "Study of Korean coastal water-quality assessment",
    "韩国沿海水质评估论文",
    "韓国沿岸の水質評価論文"
  ],
  "표층": [
    "Surface",
    "表层",
    "表層"
  ],
  "저층": [
    "Bottom",
    "底层",
    "底層"
  ],
  "측정층 미확인": [
    "Measurement layer unknown",
    "测量层未确认",
    "測定層未確認"
  ],
  "미측정": [
    "Not measured",
    "未测量",
    "未測定"
  ],
  "(단위 미제공)": [
    "(Unit not provided)",
    "（未提供单位）",
    "（単位の提供なし）"
  ],
  "근거 보기": [
    "View evidence",
    "查看依据",
    "根拠を見る"
  ],
  "공식 제한": [
    "Official restriction",
    "官方限制",
    "公式の制限"
  ],
  "주의 사항 있음": [
    "Cautions apply",
    "存在注意事项",
    "注意事項あり"
  ],
  "안전 판정 아님": [
    "Not a safety assessment",
    "并非安全评定",
    "安全判定ではありません"
  ],
  "기본 해수욕장의 수집 자료를 확인하고 있습니다.": [
    "Checking collected data for the default beach.",
    "正在确认默认海滩的已收集资料。",
    "既定の海水浴場の収集済み資料を確認しています。"
  ],
  "기본 해수욕장을 조회하지 못했습니다.": [
    "Could not load the default beach.",
    "无法加载默认海滩。",
    "既定の海水浴場を読み込めませんでした。"
  ],
  "기본 장소인 강릉 경포대 해수욕장의 수집 자료를 표시합니다.": [
    "Showing collected data for the default place, 강릉 경포대 해수욕장.",
    "显示默认地点강릉 경포대 해수욕장的已收集资料。",
    "既定の場所、강릉 경포대 해수욕장の収集済み資料を表示します。"
  ],
  "경포 자료가 부족하여 다른 해수욕장의 수집 자료를 표시합니다.": [
    "Gyeongpo data is insufficient, so collected data for another beach is shown.",
    "镜浦资料不足，因此显示其他海滩的已收集资料。",
    "鏡浦の資料が不足しているため、別の海水浴場の収集済み資料を表示します。"
  ],
  "현재 유효한 조건 자료가 없습니다. 수집기 상태와 자료 갱신을 확인해야 합니다.": [
    "No currently valid condition data. Collector status and data updates need to be checked.",
    "目前没有有效的条件资料，需要检查采集器状态及资料更新。",
    "現在有効な条件資料がありません。収集処理の状態と資料更新の確認が必要です。"
  ],
  "수집된 해수욕장이 없습니다. 수집기와 해변 자료 연동을 확인해야 합니다.": [
    "No collected beaches. The collector and beach-data connection need to be checked.",
    "没有已收集的海滩，需要检查采集器及海滩资料连接。",
    "収集済みの海水浴場がありません。収集処理とビーチ資料の連携の確認が必要です。"
  ],
  "기본 해수욕장 자료 조회가 지연되고 있습니다.": [
    "Loading the default beach data is taking longer than expected.",
    "默认海滩资料加载延迟。",
    "既定の海水浴場の資料読み込みが遅れています。"
  ],
  "활동 조건 참고 점수": [
    "Activity condition reference score",
    "活动条件参考评分",
    "活動条件の参考スコア"
  ],
  "매우 좋음": [
    "Excellent",
    "非常好",
    "とても良い"
  ],
  "좋음": [
    "Good",
    "好",
    "良い"
  ],
  "보통": [
    "Fair",
    "一般",
    "普通"
  ],
  "나쁨": [
    "Poor",
    "差",
    "悪い"
  ],
  "아주 나쁨": [
    "Very poor",
    "非常差",
    "とても悪い"
  ],
  "제품 기본값": [
    "Product default",
    "产品默认值",
    "製品の既定値"
  ],
  "논문 범위 참고 + 0/100 환산·보간 제품 가정": [
    "Published range reference + product assumptions for 0/100 scaling and interpolation",
    "参考论文范围＋0/100换算及插值的产品假设",
    "論文の範囲を参考＋0/100換算・補間は製品の仮定"
  ],
  "논문 구간 평점 참고": [
    "Reference to published interval ratings",
    "参考论文区间评分",
    "論文の区間評価を参考"
  ],
  "각 하한 이상 구간 적용": [
    "Apply the interval starting at each lower bound",
    "应用各下限以上的区间",
    "各下限以上の区間を適用"
  ],
  "절점 사이 선형 보간": [
    "Linear interpolation between knots",
    "节点间线性插值",
    "節点間の線形補間"
  ],
  "캐나다 국내 해변 방문 선호 구간을 시간별 참고값으로 전이; 입수 쾌적성 아님": [
    "Canadian domestic beach-visit preferences transferred to hourly reference values; not immersion comfort",
    "将加拿大国内海滩游览偏好范围用于分时参考值；不代表下水舒适性",
    "カナダ国内のビーチ訪問の好みを時間別参考値に転用；入水の快適性ではありません"
  ],
  "야외 방문 기온 참고; 체감온도·실내 온도 아님": [
    "Outdoor-visit air temperature reference; not apparent or indoor temperature",
    "户外游览气温参考；并非体感温度或室内温度",
    "屋外訪問の気温参考；体感温度・室温ではありません"
  ],
  "일반 수온 선호 가정; 장비·노출시간·개인차 미반영": [
    "General water-temperature preference assumption; equipment, exposure time, and individual differences excluded",
    "一般水温偏好假设；未考虑装备、暴露时间和个体差异",
    "一般的な水温の好みの仮定；装備・曝露時間・個人差は未反映"
  ],
  "HCI:Beach Table 6 풍속 평점×10, 음수 0 제한; 시간별 전이는 미검증": [
    "HCI:Beach Table 6 wind ratings ×10, negative values clamped to 0; hourly transfer unvalidated",
    "HCI:Beach Table 6风速评分×10，负值限制为0；按小时应用尚未验证",
    "HCI:Beach Table 6の風速評価×10、負値は0に制限；時間別への転用は未検証"
  ],
  "1시간 강수 불편 가정; 일강수·강수확률 변환 아님": [
    "Assumed discomfort from 1-hour precipitation; not converted daily precipitation or precipitation probability",
    "1小时降水不适程度假设；并非日降水量或降水概率换算",
    "1時間降水による不快さの仮定；日降水量・降水確率の換算ではありません"
  ],
  "상대습도 선호 가정; PET·UTCI·Humidex 계산 아님": [
    "Relative-humidity preference assumption; not a PET, UTCI, or Humidex calculation",
    "相对湿度偏好假设；并非PET、UTCI或Humidex计算",
    "相対湿度の好みの仮定；PET・UTCI・Humidexの計算ではありません"
  ],
  "작은 파도 선호 가정; 입수 허용 기준 아님": [
    "Small-wave preference assumption; not a swimming permission criterion",
    "偏好小浪的假设；并非允许下水的标准",
    "小さい波を好むという仮定；入水許可の基準ではありません"
  ],
  "일반 참고 파고 가정; 초보·숙련자 맞춤 또는 쇄파 높이 아님": [
    "General reference wave-height assumption; not tailored to skill level or a breaking-wave height",
    "一般参考浪高假设；并非针对初学者或熟练者，也非破碎波高",
    "一般的な参考波高の仮定；初心者・熟練者向けや砕波高ではありません"
  ],
  "파주기 참고 가정; 해변별 파랑 변형 미반영": [
    "Reference wave-period assumption; beach-specific wave transformation excluded",
    "参考波浪周期假设；未考虑各海滩的波浪变形",
    "波の周期の参考仮定；ビーチごとの波浪変形は未反映"
  ],
  "시설 실측 욕조 선호 가정; 의학적 안전선 아님": [
    "Preference assumption for directly measured facility bath water; not a medical safety limit",
    "设施浴池实测水温偏好假设；并非医学安全界限",
    "施設の実測浴槽水温の好みの仮定；医学的な安全限界ではありません"
  ],
  "장소·관측소별 운영 범위가 필요합니다. 전국 공통 수치는 미적용.": [
    "Place- and station-specific operating ranges are required. No nationwide common value is applied.",
    "需要地点和观测站各自的运营范围。不应用全国统一数值。",
    "場所・観測所ごとの営業範囲が必要です。全国共通の数値は適用しません。"
  ],
  "4.2절 캐나다 국내 해변 여행 응답의 선호 기온 25–30°C, 추위 21°C·더위 33°C 경계를 참고. 0/100점·선형 보간과 한국 시간별 방문 조건으로의 전이는 제품 가정이며 입수 수온 기준 아님.": [
    "Section 4.2 reports Canadian domestic beach travellers' preferred air temperature of 25–30°C and cold/hot boundaries of 21°C/33°C. The 0/100 scoring, linear interpolation, and transfer to hourly visits in Korea are product assumptions, not water-temperature criteria for immersion.",
    "参考第4.2节加拿大国内海滩游客偏好的25–30°C气温，以及寒冷21°C、炎热33°C的界限。0/100评分、线性插值和用于韩国分时游览条件均为产品假设，并非下水水温标准。",
    "4.2節のカナダ国内ビーチ旅行者の好みの気温25–30°C、寒さ21°C・暑さ33°Cの境界を参考にしています。0/100点・線形補間と韓国の時間別訪問条件への転用は製品の仮定で、入水の水温基準ではありません。"
  ],
  "Table 6 풍속 구간·평점을 10배하고 음수는 0으로 제한. 일평균 풍속을 시간별 자료에 적용하는 것은 미검증 전이입니다. 습도·강수는 변수 선택만 참고하며 HCI 총점을 재현하지 않습니다.": [
    "Table 6 wind interval ratings are multiplied by 10 and negative values clamped to 0. Applying daily mean wind to hourly data is an unvalidated transfer. Humidity and precipitation inform variable selection only; the HCI total score is not reproduced.",
    "将Table 6风速区间评分乘以10，负值限制为0。将日平均风速用于分时资料属于尚未验证的转用。湿度和降水仅用于参考变量选择，不复现HCI总分。",
    "Table 6の風速区間・評価を10倍し、負値は0に制限します。日平均風速を時間別資料へ適用するのは未検証の転用です。湿度・降水は変数選択のみを参考にし、HCI総合点は再現しません。"
  ],
  "수온·바람·입수/퇴수 상태를 구분할 근거. 실험의 28°C를 보편 최적 수온으로 채택하지 않으며, 수온 점수 곡선은 제품 가정.": [
    "Evidence for distinguishing water temperature, wind, and immersion/emersion states. The study's 28°C is not adopted as a universal optimal water temperature; the water-temperature scoring curve is a product assumption.",
    "用于区分水温、风及入水／出水状态的依据。未将实验中的28°C作为普遍最佳水温，水温评分曲线属于产品假设。",
    "水温・風・入水／退水状態を区別する根拠です。実験の28°Cを普遍的な最適水温として採用せず、水温のスコア曲線は製品の仮定です。"
  ],
  "서핑 파고·주기·바람과 숙련 차이를 구분할 근거. 현장 쇄파·풍향·숙련 검증 없는 관측소 수치이므로 아래 일반 참고 곡선은 제품 가정.": [
    "Evidence for distinguishing surfing wave height, period, wind, and skill level. These station values lack site-specific breaking-wave, wind-direction, and skill validation, so the general reference curves below are product assumptions.",
    "用于区分冲浪浪高、周期、风和熟练程度差异的依据。观测站数值缺少现场破碎波、风向和熟练程度验证，因此下方一般参考曲线属于产品假设。",
    "サーフィンの波高・周期・風と熟練度の違いを区別する根拠です。現地の砕波・風向・熟練度の検証がない観測所の数値なので、下の一般的な参考曲線は製品の仮定です。"
  ],
  "시설 욕조 수온과 외부/실내 기온의 의미를 분리할 근거. 소규모 성인 실험이며 욕조 곡선·외부 방문 기상 점수는 제품 가정입니다. 이용 허가 기준이 아닙니다.": [
    "Evidence for separating facility bath water temperature from outdoor/indoor air temperature. This was a small adult study; the bath curve and outdoor-visit weather score are product assumptions, not permission-to-use criteria.",
    "用于区分设施浴池水温与室外／室内气温含义的依据。该研究为小规模成人实验，浴池曲线及户外游览天气评分属于产品假设，并非使用许可标准。",
    "施設の浴槽水温と外気温・室温の意味を分ける根拠です。少人数の成人実験で、浴槽曲線・屋外訪問の気象スコアは製品の仮定です。利用許可の基準ではありません。"
  ],
  "해변 방문 기온은 논문의 선호 범위, 풍속은 HCI:Beach 구간 평점을 참고합니다. 나머지 곡선·동일 가중치는 Pongdang의 미보정 기본값입니다. 풍속은 구간 평점, 나머지 항목은 공개된 절점 사이를 선형 보간하고 범위 밖은 끝점 점수를 사용합니다. 총점=확보한 항목 점수의 산술평균 (소수 첫째 자리 반올림). 결측·만료·충돌·지역 기준 미설정 항목은 점수를 만들지 않고 확보율을 함께 표시합니다. 부분 점수는 같은 확보 항목끼리만 비교하세요. 안전·운영 가능성·활동 간 공통 효용 척도가 아닙니다.": [
    "Beach-visit air temperatures refer to published preference ranges, and wind speed uses HCI:Beach interval ratings. Other curves and equal weights are Pongdang's uncalibrated defaults. Wind uses interval ratings; other components use linear interpolation between published knots and endpoint scores outside the range. The total is the arithmetic mean of available component scores (rounded to one decimal place). Missing, expired, conflicting, or locally unconfigured components are left unscored, with evidence coverage shown. Compare partial scores only when they contain the same components. This is not a measure of safety, operability, or common utility across activities.",
    "海滩游览气温参考论文中的偏好范围，风速参考HCI:Beach区间评分。其余曲线和等权重均为Pongdang未经校准的默认值。风速采用区间评分，其余项目在公开节点之间线性插值，超出范围时使用端点评分。总分为已获取项目评分的算术平均值（四舍五入至一位小数）。缺失、过期、冲突或未设置当地标准的项目不评分，同时显示依据覆盖率。部分评分仅可在依据项目相同的情况下比较。该值并非安全、运营可能性或不同活动间的共同效用尺度。",
    "ビーチ訪問の気温は論文の好みの範囲、風速はHCI:Beachの区間評価を参考にします。その他の曲線と等しい重みはPongdangの未較正の既定値です。風速は区間評価、その他は公開した節点間を線形補間し、範囲外は端点のスコアを使用します。総合点は確保した項目スコアの算術平均（小数第1位に四捨五入）です。欠測・期限切れ・矛盾・地域基準未設定の項目は採点せず、確保率を併記します。部分スコアは同じ項目が確保されたもの同士で比較してください。安全・営業可能性・活動間共通の効用尺度ではありません。"
  ],
  "현재 유효": [
    "Currently valid",
    "当前有效",
    "現在有効"
  ],
  "기록됨": [
    "Recorded",
    "已记录",
    "記録済み"
  ],
  "선택 기준 충족": [
    "Selected criterion met",
    "满足所选标准",
    "選択した基準を満たす"
  ],
  "선택 기준 미충족": [
    "Selected criterion not met",
    "未满足所选标准",
    "選択した基準を満たさない"
  ],
  "판정 없음": [
    "Not assessed",
    "尚未评定",
    "判定なし"
  ],
  "양호": [
    "Good",
    "良好",
    "良好"
  ],
  "주의": [
    "Caution",
    "注意",
    "注意"
  ],
  "{kind} {minutes}분 전": [
    "{kind} is in {minutes} min",
    "距{kind}还有{minutes}分钟",
    "{kind}の{minutes}分前"
  ],
  "{kind} 지난 지 {minutes}분": [
    "{kind} was {minutes} min ago",
    "{kind}已过{minutes}分钟",
    "{kind}から{minutes}分経過"
  ],
  "지금은 {timing}이에요. 물때를 보고 시간을 고르세요. {disclaimer}": [
    "{timing}. Consider the tides when choosing a time. {disclaimer}",
    "现在{timing}。请选择合适的潮汐时段。{disclaimer}",
    "現在は{timing}です。潮汐を確認して時間を選んでください。{disclaimer}"
  ],
  "지금은 {timing} — 바다 대신 가까운 곳을 권해요. {disclaimer}": [
    "{timing} — Nearby places are recommended instead of the sea. {disclaimer}",
    "现在{timing} — 建议前往附近地点，暂不下海。{disclaimer}",
    "現在は{timing}です — 海の代わりに近くの場所をおすすめします。{disclaimer}"
  ]
};

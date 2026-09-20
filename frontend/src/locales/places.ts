import type { MessageTranslations } from "../i18n.ts";

export const placesMessages: Record<string, MessageTranslations> = {
  "분류 미확인": [
    "Category unknown",
    "分类未确认",
    "分類未確認"
  ],
  "리뷰 평점은 쓰지 않습니다": [
    "Review ratings are not used",
    "不使用评论评分",
    "口コミ評価は使用しません"
  ],
  "명소": [
    "Places",
    "景点",
    "スポット"
  ],
  "강릉 · 수집된 물놀이 장소": [
    "Gangneung · Collected water activity places",
    "江陵 · 已收集的水上活动地点",
    "江陵 · 収集済みの水遊びスポット"
  ],
  "강릉 명소": [
    "Places in Gangneung",
    "江陵景点",
    "江陵のスポット"
  ],
  "장소 조회 중": [
    "Loading places",
    "正在查询地点",
    "スポットを読み込み中"
  ],
  "목록 {count}곳": [
    "{count} places listed",
    "列表共 {count} 处",
    "一覧 {count} か所"
  ],
  "장소명 · 지역 검색": [
    "Search place or region",
    "搜索地点名称或地区",
    "スポット名・地域で検索"
  ],
  "장소명·지역 검색": [
    "Search place or region",
    "搜索地点名称或地区",
    "スポット名・地域で検索"
  ],
  "이름순": [
    "By name",
    "按名称排序",
    "名前順"
  ],
  "{name} 상세": [
    "Details for {name}",
    "{name}详情",
    "{name}の詳細"
  ],
  "지역 미확인": [
    "Region unknown",
    "地区未确认",
    "地域未確認"
  ],
  "주소 없음": [
    "Address unavailable",
    "暂无地址",
    "住所情報なし"
  ],
  "장소를 조회하고 있습니다.": [
    "Loading places.",
    "正在查询地点。",
    "スポットを読み込んでいます。"
  ],
  "검색 결과 없음": [
    "No results",
    "无搜索结果",
    "検索結果なし"
  ],
  "목록 {count}곳 전체입니다 · 서버가 한 번에 최대 100곳까지 내려줍니다": [
    "Showing all {count} places in this response · The server returns up to 100 places at a time",
    "显示本次返回的全部 {count} 处地点 · 服务器每次最多返回 100 处",
    "今回取得した全 {count} か所です · サーバーは一度に最大 100 か所を返します"
  ],
  "지도에서 보기 →": [
    "View on map →",
    "在地图上查看 →",
    "地図で見る →"
  ],
  "장소를 고르면 그곳의 퐁당 점수를 조회합니다. 목록에 점수를 함께 싣지 않는 것은 장소마다 한 번씩 조회해야 하기 때문입니다. 거리 · 운영 시간 · 소개는 아직 내려주는 API 가 없어 비워 둡니다. 대표 사진은 수집된 사진이 있는 장소에 표시합니다.": [
    "Select a place to load its Pongdang score. Scores require a separate request for each place, so they are not included in the list. Distance, opening hours and descriptions remain blank because no API provides them yet. A photo is shown when a collected photo is available.",
    "选择地点后将查询其 Pongdang 评分。每个地点都需要单独查询，因此列表不显示评分。距离、营业时间和简介尚无 API 提供，暂时留空。有已收集照片的地点会显示代表照片。",
    "スポットを選ぶと、その場所の Pongdang スコアを取得します。場所ごとに個別の取得が必要なため、一覧にはスコアを載せていません。距離・営業時間・紹介文は提供する API がまだないため空欄です。収集済みの写真がある場所には代表写真を表示します。"
  ],
  "명소 지도": [
    "Places map",
    "景点地图",
    "スポットマップ"
  ],
  "분류 필터": [
    "Category filter",
    "分类筛选",
    "分類フィルター"
  ],
  "목록": [
    "List",
    "列表",
    "一覧"
  ],
  "{name} 퐁당 {score} {grade}": [
    "{name}, Pongdang {score}, {grade}",
    "{name}，Pongdang {score}，{grade}",
    "{name}、Pongdang {score}、{grade}"
  ],
  "지도에 보이는 명소 {count}곳": [
    "{count} places on the map",
    "地图上显示 {count} 处景点",
    "地図に表示中のスポット {count} か所"
  ],
  "지도 탭과 같은 지도 컴포넌트를 쓰고 핀 소스만 명소 목록으로 바꿨습니다. 핀을 고르면 그 장소의 점수를 조회하며, 고르기 전에는 –입니다.": [
    "This map uses the same map component as the Map tab, with pins from the places list. Select a pin to load its score; an unselected place shows –.",
    "此地图与“地图”页签使用相同的地图组件，标记来自景点列表。选择标记后将查询该地点的评分；选择前显示 –。",
    "地図タブと同じ地図コンポーネントを使い、スポット一覧からピンを表示しています。ピンを選ぶとその場所のスコアを取得し、選択前は – で表示します。"
  ],
  " 좌표가 아직 확인되지 않은 {count}곳은 지도에 찍지 않았습니다 — 없는 위치를 임의로 만들지 않습니다.": [
    " {count} places with unconfirmed coordinates are omitted from the map; no location is invented.",
    " 另有 {count} 处地点的坐标尚未确认，因此未在地图上标记，不会虚构位置。",
    " 座標未確認の {count} か所は地図に表示していません。位置を推測して追加することはありません。"
  ],
  "장소": [
    "Place",
    "地点",
    "スポット"
  ],
  "장소를 찾지 못했습니다": [
    "Place not found",
    "未找到地点",
    "スポットが見つかりませんでした"
  ],
  "← 명소 목록": [
    "← Places list",
    "← 景点列表",
    "← スポット一覧"
  ],
  "점수 조회 중": [
    "Loading score",
    "正在查询评分",
    "スコアを読み込み中"
  ],
  "오늘 여기서 가장 좋은 활동 · {activity}": [
    "Best activity here today · {activity}",
    "今天这里最适合的活动 · {activity}",
    "今日この場所で最適なアクティビティ · {activity}"
  ],
  "오늘의 활동을 불러오지 못했습니다": [
    "Could not load today's activities",
    "无法加载今日活动",
    "今日のアクティビティを読み込めませんでした"
  ],
  "오늘 이 장소의 물놀이 조건": [
    "Today's water activity conditions here",
    "该地点今日的水上活动条件",
    "この場所の今日の水遊び条件"
  ],
  "운영": [
    "Opening hours",
    "营业信息",
    "営業情報"
  ],
  "개장 기간": [
    "Opening season",
    "开放期间",
    "営業期間"
  ],
  "주차": [
    "Parking",
    "停车",
    "駐車場"
  ],
  "편의시설": [
    "Facilities",
    "配套设施",
    "設備"
  ],
  "문의": [
    "Contact",
    "咨询",
    "問い合わせ"
  ],
  "운영 · 개장 기간 · 주차 · 편의시설 · 문의를 내려주는 API 가 아직 없습니다. 값이 없다는 뜻이며 「없음」이나 「이용 불가」가 아닙니다.": [
    "No API currently provides opening hours, opening season, parking, facilities or contact information. Missing data does not mean these are absent or unavailable for use.",
    "目前尚无 API 提供营业信息、开放期间、停车、配套设施或咨询信息。数据缺失并不代表没有这些设施或无法使用。",
    "営業情報・営業期間・駐車場・設備・問い合わせ先を提供する API はまだありません。データがないという意味で、施設が存在しない、または利用できないという意味ではありません。"
  ],
  "위치": [
    "Location",
    "位置",
    "所在地"
  ],
  "주소": [
    "Address",
    "地址",
    "住所"
  ],
  "좌표": [
    "Coordinates",
    "坐标",
    "座標"
  ],
  "좌표가 아직 확인되지 않았습니다 · 지도 표시 없음 — 없는 위치를 임의로 만들지 않습니다.": [
    "Coordinates are unconfirmed · Not shown on the map; no location is invented.",
    "坐标尚未确认 · 暂不在地图上显示，不会虚构位置。",
    "座標が未確認です · 地図には表示していません。位置を推測して追加することはありません。"
  ],
  "내 코스에 추가": [
    "Add to my itinerary",
    "添加到我的行程",
    "マイコースに追加"
  ],
  "저장 해제": [
    "Remove from saved",
    "取消收藏",
    "保存を解除"
  ],
  "저장": [
    "Save",
    "保存",
    "保存"
  ],
  "즐겨찾기 조회 중…": [
    "Loading favourites…",
    "正在查询收藏…",
    "お気に入りを読み込み中…"
  ],
  "즐겨찾기 조회 실패:": [
    "Could not load favourites:",
    "收藏查询失败：",
    "お気に入りを読み込めませんでした："
  ],
  "코스 초안 보기": [
    "View draft itinerary",
    "查看行程草稿",
    "コースの下書きを見る"
  ],
  "지역": [
    "Region",
    "地区",
    "地域"
  ],
  "확인됨": [
    "Confirmed",
    "已确认",
    "確認済み"
  ],
  "상세에서 조회": [
    "Load in details",
    "在详情中查询",
    "詳細で取得"
  ],
  "상세 →": [
    "Details →",
    "详情 →",
    "詳細 →"
  ],
  "강릉 · 수집된 물놀이 장소 · {date}": [
    "Gangneung · Collected water activity places · {date}",
    "江陵 · 已收集的水上活动地点 · {date}",
    "江陵 · 収集済みの水遊びスポット · {date}"
  ],
  "공공 API · 백엔드 가공 목록": [
    "Public APIs · Server-processed list",
    "公共 API · 后端处理列表",
    "公共 API · サーバー処理済み一覧"
  ],
  "{count}곳": [
    "{count} places",
    "{count} 处",
    "{count} か所"
  ],
  "수집된 물놀이 장소": [
    "Collected water activity places",
    "已收集的水上活动地点",
    "収集済みの水遊びスポット"
  ],
  "리뷰 평점은 쓰지 않습니다. 거리 · 운영시간은 아직 내려주는 API 가 없어 비워 둡니다. 대표 사진은 수집된 사진이 있는 장소에 표시합니다.": [
    "Review ratings are not used. Distance and opening hours remain blank because no API provides them yet. A photo is shown when a collected photo is available.",
    "不使用评论评分。距离和营业时间尚无 API 提供，暂时留空。有已收集照片的地点会显示代表照片。",
    "口コミ評価は使用しません。距離・営業時間を提供する API がまだないため、空欄です。収集済みの写真がある場所には代表写真を表示します。"
  ],
  "운영시간 · 편의시설 · 현재 위치 거리 계산": [
    "Opening hours · Facilities · Distance from your location",
    "营业时间 · 配套设施 · 距离当前位置的计算",
    "営業時間・設備・現在地からの距離計算"
  ],
  "퐁당 점수는 물놀이 조건 점수이며 명소의 품질 평가가 아닙니다. 목록에는 점수를 싣지 않습니다 -- 장소마다 따로 조회해야 하므로 상세에서 읽습니다. 리뷰 평점은 수집하지 않습니다.": [
    "The Pongdang score measures water activity conditions, not the quality of a place. Each place requires a separate score request, so scores appear in its details rather than this list. Review ratings are not collected.",
    "Pongdang 评分衡量水上活动条件，并非景点品质评价。每个地点都需要单独查询评分，因此请在详情中查看，列表不显示评分。我们不收集评论评分。",
    "Pongdang スコアは水遊びの条件を表すもので、スポットの品質評価ではありません。場所ごとに個別の取得が必要なため、一覧には載せず詳細で表示します。口コミ評価は収集しません。"
  ],
  "조회 중": [
    "Loading",
    "查询中",
    "読み込み中"
  ],
  "장소 없음": [
    "No place",
    "暂无地点",
    "スポットなし"
  ],
  "산정 가능한 활동 없음": [
    "No activity can be scored",
    "暂无可计算评分的活动",
    "スコアを算定できる活動がありません"
  ],
  "운영 · 개장 기간 · 주차 · 편의시설 · 문의 · 소개를 내려주는 API 가 아직 없습니다. 값이 없다는 뜻이며 「없음」이나 「이용 불가」가 아닙니다.": [
    "No API currently provides opening hours, opening season, parking, facilities, contact information or descriptions. Missing data does not mean these are absent or unavailable for use.",
    "目前尚无 API 提供营业信息、开放期间、停车、配套设施、咨询信息或简介。数据缺失并不代表没有这些设施或无法使用。",
    "営業情報・営業期間・駐車場・設備・問い合わせ先・紹介文を提供する API はまだありません。データがないという意味で、施設が存在しない、または利用できないという意味ではありません。"
  ],
  "지도 탭에서 보기 →": [
    "Open in Map →",
    "在“地图”页签中查看 →",
    "地図タブで見る →"
  ],
  "위치 · 같은 분류": [
    "Location · Same category",
    "位置 · 相同分类",
    "所在地・同じ分類"
  ],
  "지도에서 위치 보기": [
    "View location on map",
    "在地图上查看位置",
    "地図で所在地を見る"
  ],
  "카카오 지도를 그대로 쓰고 핀 소스만 이 장소로 바꿉니다. 좌표는 서버가 준 실제 값이며, 없으면 찍지 않습니다.": [
    "Kakao Map displays a pin for this place. Coordinates are actual values from the server; a place without coordinates is not plotted.",
    "使用 Kakao 地图标记此地点。坐标为服务器提供的实际值；没有坐标时不显示标记。",
    "Kakao マップにこの場所のピンを表示します。座標はサーバーが提供した実際の値で、座標がなければ表示しません。"
  ],
  "좌표가 아직 확인되지 않았습니다 · 지도 표시 없음": [
    "Coordinates unconfirmed · Not shown on map",
    "坐标尚未确认 · 暂不在地图上显示",
    "座標未確認・地図表示なし"
  ],
  "같은 분류의 장소 · 이름순": [
    "Places in the same category · By name",
    "相同分类的地点 · 按名称排序",
    "同じ分類のスポット・名前順"
  ],
  "같은 분류의 다른 장소가 목록에 없습니다.": [
    "No other places in this category are listed.",
    "列表中没有其他相同分类的地点。",
    "一覧に同じ分類のほかのスポットはありません。"
  ],
  "장소 사이 거리를 내려주는 API 가 없어 이름순으로 둡니다. 점수는 각 장소 상세에서 조회합니다.": [
    "Places are ordered by name because no API provides distances between them. Open each place's details to load its score.",
    "由于没有 API 提供地点间距离，因此按名称排序。请在各地点详情中查询评分。",
    "スポット間の距離を提供する API がないため名前順です。スコアは各スポットの詳細で取得します。"
  ],
  "운영시간 · 편의시설 · 장소 간 거리": [
    "Opening hours · Facilities · Distance between places",
    "营业时间 · 配套设施 · 地点间距离",
    "営業時間・設備・スポット間の距離"
  ],
  "지도": [
    "Map",
    "地图",
    "地図"
  ],
  "코스 지도": [
    "Itinerary map",
    "行程地图",
    "コースマップ"
  ],
  "물놀이 할 곳 찾기": [
    "Find a water activity spot",
    "寻找水上活动地点",
    "水遊びスポットを探す"
  ],
  "{minutes}분 이동": [
    "{minutes} min travel",
    "移动 {minutes} 分钟",
    "移動 {minutes} 分"
  ],
  "경로 계산 전": [
    "Route not calculated",
    "尚未计算路线",
    "経路未計算"
  ],
  "선택 코스 · {count}곳 · {minutes}": [
    "Selected itinerary · {count} places · {minutes}",
    "所选行程 · {count} 处地点 · {minutes}",
    "選択中のコース・{count} か所・{minutes}"
  ],
  "출발": [
    "Start",
    "出发",
    "出発"
  ],
  "출발지": [
    "Starting point",
    "出发地",
    "出発地"
  ],
  "수온": [
    "Water temperature",
    "水温",
    "水温"
  ],
  "기온": [
    "Air temperature",
    "气温",
    "気温"
  ],
  "풍속": [
    "Wind speed",
    "风速",
    "風速"
  ],
  "안전 상태 {status}": [
    "Safety status: {status}",
    "安全状态：{status}",
    "安全状態：{status}"
  ],
  "지도 점수는 선택한 장소를 조회한 값입니다.": [
    "Map scores are fetched for the selected place.",
    "地图评分为所选地点的查询结果。",
    "地図のスコアは選択した場所を取得した値です。"
  ],
  "길찾기": [
    "Directions",
    "路线导航",
    "ルート案内"
  ],
  "코스에 넣기": [
    "Add to itinerary",
    "加入行程",
    "コースに追加"
  ],
  "카카오 지도에 등록 좌표를 전달합니다. 코스에 넣으면 저장 전 일정에 추가합니다.": [
    "Directions send the recorded coordinates to Kakao Map. Adding a place puts it in your unsaved itinerary.",
    "路线导航会将已登记坐标发送到 Kakao 地图。加入行程后，该地点会添加到尚未保存的行程中。",
    "ルート案内では登録された座標を Kakao マップに渡します。コースに追加すると保存前の予定に加わります。"
  ],
  "즐겨찾기 저장 →": [
    "Save to favourites →",
    "添加到收藏 →",
    "お気に入りに保存 →"
  ],
  "{time} 도착": [
    "Arrival {time}",
    "{time} 到达",
    "{time} 到着"
  ],
  "{minutes}분": [
    "{minutes} min",
    "{minutes} 分钟",
    "{minutes} 分"
  ],
  "방문 시각 미계산": [
    "Visit time not calculated",
    "尚未计算到访时间",
    "訪問時刻未計算"
  ],
  "이동 순서": [
    "Visit order",
    "游览顺序",
    "移動順序"
  ],
  "· 길찾기": [
    "· Directions",
    "· 路线导航",
    "・ルート案内"
  ],
  "일부 비교 자료가 부족한 임시 결과입니다.": [
    "This is a provisional result with some comparison evidence missing.",
    "部分比较资料缺失，此为临时结果。",
    "比較資料が一部不足している暫定結果です。"
  ],
  "전체 지역의 최적 경로를 뜻하지 않습니다.": [
    "It does not mean the optimal route across the entire region.",
    "并不代表整个地区的最优路线。",
    "地域全体での最適な経路を意味しません。"
  ],
  "출발 기준 교통 자료의 예상시간입니다. 선택한 후보 안에서 비교한 경로이며, {detail}": [
    "Travel times are estimated from traffic data at departure. The route was compared only among the selected candidates. {detail}",
    "预计时间根据出发时的交通资料计算，路线仅在所选候选地点中进行比较。{detail}",
    "出発時点の交通資料に基づく予測時間です。選択した候補の中で比較した経路です。{detail}"
  ],
  "이동시간과 도로 경로는 아직 계산하지 않았습니다.": [
    "Travel times and road routes have not been calculated yet.",
    "尚未计算移动时间和道路路线。",
    "移動時間と道路経路はまだ計算していません。"
  ],
  "추천에서 장소를 고르거나 지도에서 코스에 넣어 주세요.": [
    "Choose places in Recommendations or add them to your itinerary from the map.",
    "请在“推荐”中选择地点，或从地图加入行程。",
    "おすすめで場所を選ぶか、地図からコースに追加してください。"
  ],
  "도로 선은 길찾기 응답을 받은 {count}/{total}구간만 그립니다. 받지 못한 구간은 직선으로 채우지 않습니다.": [
    "Road lines are drawn only for the {count} of {total} legs returned by the directions service. Missing legs are not replaced with straight lines.",
    "仅绘制导航服务已返回的 {count}/{total} 个路段；缺失路段不会用直线替代。",
    "ルート案内から取得できた全 {total} 区間中 {count} 区間のみ道路線を描画します。取得できない区間を直線で補うことはありません。"
  ],
  "카카오맵에서 순서대로 길찾기 →": [
    "Follow this order in Kakao Map →",
    "在 Kakao 地图中按顺序导航 →",
    "Kakao マップで順番にルート案内 →"
  ],
  "추천에서 편집": [
    "Edit in Recommendations",
    "在“推荐”中编辑",
    "おすすめで編集"
  ],
  "저장됨": [
    "Saved",
    "已保存",
    "保存済み"
  ],
  "내 코스에 저장": [
    "Save to my itineraries",
    "保存到我的行程",
    "マイコースに保存"
  ],
  "카카오맵 길찾기는 등록 좌표와 순서를 전달합니다. 저장은 방문 장소와 순서를 보존하며 정밀 ETA는 보존하지 않습니다.": [
    "Kakao Map directions receive the recorded coordinates and visit order. Saving preserves the places and their order, but not precise arrival estimates.",
    "Kakao 地图导航会接收已登记坐标及顺序。保存会保留到访地点和顺序，但不保留精确预计到达时间。",
    "Kakao マップのルート案内に登録座標と順序を渡します。保存されるのは訪問先とその順序で、詳細な到着予測時刻は保存されません。"
  ],
  "경로 후보는 최대 5곳입니다. 추천에서 코스를 다시 골라 주세요.": [
    "A route can include up to 5 places. Please select your itinerary again in Recommendations.",
    "路线最多包含 5 处地点。请在“推荐”中重新选择行程。",
    "経路候補は最大 5 か所です。おすすめでコースを選び直してください。"
  ],
  "경로를 계산할 방문 장소가 없습니다. 지도에서 「코스에 넣기」로 장소를 고르거나 추천에서 코스를 가져와 주세요.": [
    "There are no places for route calculation. Use Add to itinerary on the map or bring an itinerary from Recommendations.",
    "没有可计算路线的到访地点。请在地图中点击“加入行程”，或从“推荐”导入行程。",
    "経路を計算する訪問先がありません。地図の「コースに追加」で場所を選ぶか、おすすめからコースを読み込んでください。"
  ],
  "선택 장소 {count}곳 중 {count2}곳만 현재 조건에서 경로 후보로 확인했습니다. ": [
    "Only {count2} of {count} selected places qualify as route candidates under the current conditions. ",
    "在当前条件下，所选 {count} 处地点中仅 {count2} 处符合路线候选条件。 ",
    "選択した {count} か所のうち、現在の条件で経路候補として確認できたのは {count2} か所です。 "
  ],
  "후보를 다시 선택해 주세요.": [
    "Please select candidates again.",
    "请重新选择候选地点。",
    "候補を選び直してください。"
  ],
  "지도 보기 전환": [
    "Switch map view",
    "切换地图视图",
    "地図表示の切り替え"
  ],
  "지점 보기": [
    "Places",
    "查看地点",
    "スポット表示"
  ],
  "코스 경로": [
    "Itinerary route",
    "行程路线",
    "コース経路"
  ],
  "선택한 장소를 조회하고 있습니다.": [
    "Loading the selected place.",
    "正在查询所选地点。",
    "選択したスポットを読み込んでいます。"
  ],
  "선택한 장소를 찾을 수 없습니다.": [
    "The selected place could not be found.",
    "找不到所选地点。",
    "選択したスポットが見つかりません。"
  ],
  "서버에 요청 중입니다…": [
    "Sending request…",
    "正在向服务器请求…",
    "サーバーにリクエスト中…"
  ],
  "검색 결과 {count}곳 · 최대 100곳": [
    "{count} results · Up to 100 places",
    "搜索结果 {count} 处 · 最多 100 处",
    "検索結果 {count} か所・最大 100 か所"
  ],
  "경로 미계산: {reason}": [
    "Route not calculated: {reason}",
    "路线未计算：{reason}",
    "経路未計算：{reason}"
  ],
  "조건을 바꿔 다시 계산": [
    "Change conditions and recalculate",
    "更改条件并重新计算",
    "条件を変えて再計算"
  ],
  "선택 코스 경로 계산": [
    "Calculate selected itinerary route",
    "计算所选行程路线",
    "選択したコースの経路を計算"
  ],
  "편의시설 필터": [
    "Facility filters",
    "配套设施筛选",
    "設備フィルター"
  ],
  "샤워장 · 주차 · 카페 · 반려동물 가능": [
    "Showers · Parking · Cafés · Pets allowed",
    "淋浴间 · 停车 · 咖啡馆 · 可携带宠物",
    "シャワー・駐車場・カフェ・ペット可"
  ],
  "시설 근거별 필터 화면 미작성": [
    "Filters based on facility evidence are not implemented yet",
    "尚未实现基于设施资料的筛选页面",
    "施設の根拠資料に基づくフィルター画面は未実装です"
  ],
  "강릉 · {date} · 지점 {count}곳": [
    "Gangneung · {date} · {count} places",
    "江陵 · {date} · {count} 处地点",
    "江陵・{date}・{count} か所"
  ],
  "어디로 갈지 지도에서 고르기": [
    "Choose where to go on the map",
    "在地图上选择目的地",
    "行き先を地図で選ぶ"
  ],
  "지점 {count}곳 · {activity} 점수": [
    "{count} places · {activity} score",
    "{count} 处地点 · {activity}评分",
    "{count} か所・{activity}スコア"
  ],
  "좌표가 있는 장소만 싣습니다 · 서버가 한 번에 최대 100곳까지 내려줍니다.": [
    "Only places with coordinates are shown · The server returns up to 100 places at a time.",
    "仅显示有坐标的地点 · 服务器每次最多返回 100 处地点。",
    "座標があるスポットのみ表示します・サーバーは一度に最大 100 か所を返します。"
  ],
  "값이 없는 상태가 안전을 뜻하지 않습니다": [
    "Missing data does not mean it is safe",
    "数据缺失不代表安全",
    "データがないことは安全を意味しません"
  ],
  "카카오 지도 · 보이는 지점의 점수를 묶어서 조회합니다": [
    "Kakao Map · Scores for visible places are loaded together",
    "Kakao 地图 · 批量查询可见地点的评分",
    "Kakao マップ・表示中のスポットのスコアをまとめて取得します"
  ],
  "확대": [
    "Zoom in",
    "放大",
    "拡大"
  ],
  "축소": [
    "Zoom out",
    "缩小",
    "縮小"
  ],
  "현재 위치로 이동": [
    "Go to current location",
    "前往当前位置",
    "現在地に移動"
  ],
  "수온 {temperature}": [
    "Water {temperature}",
    "水温 {temperature}",
    "水温 {temperature}"
  ],
  "코스에 추가": [
    "Add to itinerary",
    "添加到行程",
    "コースに追加"
  ],
  "선택 지점": [
    "Selected place",
    "所选地点",
    "選択中のスポット"
  ],
  "지점": [
    "Place",
    "地点",
    "スポット"
  ],
  "{name} · {activity} 점수 근거": [
    "{name} · Evidence for the {activity} score",
    "{name} · {activity}评分依据",
    "{name}・{activity}スコアの根拠"
  ],
  "{score}를 이루는 항목입니다. 각 조건의 점수를 같은 비중으로 평균낸 값이 총점입니다.": [
    "These components make up the {score}. The total is the equally weighted average of the condition scores.",
    "这些项目构成{score}，总分为各项条件评分的等权平均值。",
    "{score}を構成する項目です。各条件のスコアを同じ比重で平均した値が総合点です。"
  ],
  "지점을 고르면 그 지점의 점수 근거를 조회합니다.": [
    "Select a place to load the evidence behind its score.",
    "选择地点后将查询其评分依据。",
    "スポットを選ぶと、その場所のスコアの根拠を取得します。"
  ],
  "{name} 상세 →": [
    "Details for {name} →",
    "{name}详情 →",
    "{name}の詳細 →"
  ],
  "편의 시설 · 안전요원 정보 · 조위 시계열": [
    "Facilities · Lifeguard information · Tide time series",
    "配套设施 · 救生员信息 · 潮位时间序列",
    "設備・監視員情報・潮位の時系列"
  ],
  "마커 좌표는 서버가 준 실제 값입니다. 목록의 점수는 지점마다 따로 묻지 않고 묶어서 한 번에 조회하며, 근거가 없는 지점은 «–» 입니다. NULL · unknown 은 안전한 상태를 뜻하지 않습니다.": [
    "Marker coordinates are actual values from the server. List scores are loaded in batches, not requested separately for each place. Places without evidence show –. NULL and unknown do not indicate safety.",
    "标记坐标是服务器提供的实际值。列表评分通过批量查询获取，而非逐个地点请求。没有依据的地点显示 –。NULL 和 unknown 并不表示安全。",
    "マーカーの座標はサーバーが提供した実際の値です。一覧のスコアは場所ごとに個別取得せず、一括で取得します。根拠がない場所は – で表示します。NULL・unknown は安全な状態を意味しません。"
  ],
  "{name} · 장소별 조건 {score}점": [
    "{name} · Place conditions: {score} points",
    "{name} · 地点条件 {score} 分",
    "{name}・スポットの条件 {score} 点"
  ],
  "{at} · 저장 일정 시각의 예보입니다.": [
    "{at} · Forecast for the saved itinerary time.",
    "{at} · 已保存行程时刻的预报。",
    "{at}・保存した予定時刻の予報です。"
  ],
  "저장 날짜가 조회 범위(현재 기준 앞뒤 31일)를 벗어났습니다.": [
    "The saved date is outside the query window of 31 days before or after today.",
    "保存日期超出查询范围（当前日期前后 31 天）。",
    "保存された日付が照会範囲（現在から前後 31 日）を超えています。"
  ],
  "{date} 물 코스": [
    "{date} water itinerary",
    "{date} 水上活动行程",
    "{date} 水遊びコース"
  ],
  "저장 코스": [
    "Saved itinerary",
    "已保存行程",
    "保存済みコース"
  ],
  "강릉": [
    "Gangneung",
    "江陵",
    "江陵"
  ],
  "저장 코스 개수 미확인": [
    "Saved itinerary count unknown",
    "已保存行程数量未确认",
    "保存済みコース数未確認"
  ],
  "저장 코스 조회 중": [
    "Loading saved itineraries",
    "正在查询已保存行程",
    "保存済みコースを読み込み中"
  ],
  "저장 {count}개": [
    "{count} saved",
    "已保存 {count} 个",
    "保存済み {count} 件"
  ],
  "내 코스": [
    "My itineraries",
    "我的行程",
    "マイコース"
  ],
  "내가 저장한 여행 일정을 확인하세요": [
    "View your saved travel itineraries",
    "查看已保存的旅行行程",
    "保存した旅行の予定を確認しましょう"
  ],
  "기존 SSO 계정에 저장된 코스입니다. 여행 알림은 시작된 동행 세션의 설정을 표시하며 백그라운드 발송과 다릅니다.": [
    "These itineraries are saved to your existing SSO account. Travel notifications show settings for active companion sessions; they do not indicate background delivery.",
    "这些行程保存于现有 SSO 账户中。旅行通知显示已开始的同行会话设置，不代表后台推送。",
    "既存の SSO アカウントに保存されたコースです。旅行通知は開始済みの同行セッションの設定を表示しており、バックグラウンド配信とは異なります。"
  ],
  "조회 실패": [
    "Loading failed",
    "查询失败",
    "読み込み失敗"
  ],
  "저장 코스를 불러오는 중입니다.": [
    "Loading saved itineraries.",
    "正在加载已保存行程。",
    "保存済みコースを読み込んでいます。"
  ],
  "저장 코스 {count}개 · 최대 100개": [
    "{count} saved itineraries · Up to 100",
    "已保存行程 {count} 个 · 最多 100 个",
    "保存済みコース {count} 件・最大 100 件"
  ],
  "아직 저장한 코스가 없습니다. 추천에서 코스를 저장해 주세요.": [
    "No saved itineraries yet. Save an itinerary from Recommendations.",
    "还没有保存的行程。请在“推荐”中保存行程。",
    "まだ保存したコースがありません。おすすめでコースを保存してください。"
  ],
  "첫 장소 참고 · {grade}": [
    "First place reference · {grade}",
    "首个地点参考 · {grade}",
    "最初のスポットの参考値・{grade}"
  ],
  "선택하면 점수 조회": [
    "Select to load score",
    "选择后查询评分",
    "選択するとスコアを取得"
  ],
  "날짜 –": [
    "Date –",
    "日期 –",
    "日付 –"
  ],
  "동행 알림 켬": [
    "Companion notifications on",
    "同行通知已开启",
    "同行通知オン"
  ],
  "동행 알림 꺼짐": [
    "Companion notifications off",
    "同行通知已关闭",
    "同行通知オフ"
  ],
  "첫 장소 참고점수": [
    "First place reference score",
    "首个地点参考评分",
    "最初のスポットの参考スコア"
  ],
  "구성": [
    "Places",
    "行程组成",
    "構成"
  ],
  "날짜": [
    "Dates",
    "日期",
    "日付"
  ],
  "알림": [
    "Notifications",
    "通知",
    "通知"
  ],
  "동행 세션에서 켜짐": [
    "Enabled in companion session",
    "已在同行会话中开启",
    "同行セッションでオン"
  ],
  "시작된 동행 알림 없음": [
    "No active companion notifications",
    "暂无已启动的同行通知",
    "開始済みの同行通知なし"
  ],
  "상태: {status} · 경로: {route}. 미확인 조건: {unresolved}. 종합 안전 점수는 제공하지 않습니다.": [
    "Status: {status} · Route: {route}. Unconfirmed conditions: {unresolved}. An overall safety score is not provided.",
    "状态：{status} · 路线：{route}。未确认条件：{unresolved}。不提供综合安全评分。",
    "状態：{status}・経路：{route}。未確認の条件：{unresolved}。総合的な安全スコアは提供していません。"
  ],
  "없음": [
    "None",
    "无",
    "なし"
  ],
  "첫 장소 없음": [
    "No first place",
    "暂无首个地点",
    "最初のスポットなし"
  ],
  "일정 시각 없음": [
    "No scheduled time",
    "暂无行程时刻",
    "予定時刻なし"
  ],
  "저장 날짜가 조회 범위(현재 기준 앞뒤 31일)를 벗어났거나 일정 시각이 없습니다.": [
    "The saved date is outside the 31-day query window before or after today, or the itinerary has no scheduled time.",
    "保存日期超出当前日期前后 31 天的查询范围，或缺少行程时刻。",
    "保存された日付が現在から前後 31 日の照会範囲を超えているか、予定時刻がありません。"
  ],
  "날짜 없음": [
    "No date",
    "暂无日期",
    "日付なし"
  ],
  "요약 복사": [
    "Copy summary",
    "复制摘要",
    "概要をコピー"
  ],
  "코스 상세 열기": [
    "Open itinerary details",
    "打开行程详情",
    "コース詳細を開く"
  ],
  "내 기록 열기 →": [
    "Open my history →",
    "打开我的记录 →",
    "マイ履歴を開く →"
  ],
  "저장 코스의 요약 복사를 이용하세요": [
    "Use Copy summary for a saved itinerary",
    "请使用已保存行程的“复制摘要”功能",
    "保存済みコースの「概要をコピー」をご利用ください"
  ],
  "개수 미확인": [
    "Count unknown",
    "数量未确认",
    "件数未確認"
  ],
  "{count}개": [
    "{count}",
    "{count} 个",
    "{count} 件"
  ],
  "저장한 코스 {count} · {date}": [
    "Saved itineraries: {count} · {date}",
    "已保存行程 {count} · {date}",
    "保存済みコース {count}・{date}"
  ],
  "저장 코스를 확인하지 못했습니다": [
    "Could not load saved itineraries",
    "无法查看已保存行程",
    "保存済みコースを確認できませんでした"
  ],
  "저장 코스를 불러오는 중입니다": [
    "Loading saved itineraries",
    "正在加载已保存行程",
    "保存済みコースを読み込んでいます"
  ],
  "저장한 코스가 없습니다": [
    "No saved itineraries",
    "暂无已保存行程",
    "保存済みコースはありません"
  ],
  "이동 · 소요": [
    "Distance · Duration",
    "移动距离 · 用时",
    "移動距離・所要時間"
  ],
  "저장된 코스 장소 · 경로선은 지도 탭에서 계산합니다": [
    "Saved itinerary places · Route lines are calculated in Map",
    "已保存行程地点 · 路线在“地图”页签中计算",
    "保存済みコースのスポット・経路線は地図タブで計算します"
  ],
  "일정": [
    "Schedule",
    "行程",
    "予定"
  ],
  "도착": [
    "Arrival",
    "到达",
    "到着"
  ],
  "시각 미정": [
    "Time not set",
    "时间待定",
    "時刻未定"
  ],
  "주소 조회 중": [
    "Loading address",
    "正在查询地址",
    "住所を読み込み中"
  ],
  "점수 {score} · {grade}": [
    "Score {score} · {grade}",
    "评分 {score} · {grade}",
    "スコア {score}・{grade}"
  ],
  "이 코스 열기 →": [
    "Open this itinerary →",
    "打开此行程 →",
    "このコースを開く →"
  ],
  "추천에서 코스 만들기 →": [
    "Create an itinerary in Recommendations →",
    "在“推荐”中创建行程 →",
    "おすすめでコースを作る →"
  ],
  "지도에서 경로 계산 →": [
    "Calculate route in Map →",
    "在地图中计算路线 →",
    "地図で経路を計算 →"
  ],
  "정차지 좌표는 저장된 장소를 조회해 찍습니다. 좌표가 없는 장소는 지도에 나타나지 않습니다.": [
    "Stop coordinates are loaded from the saved places. Places without coordinates do not appear on the map.",
    "停留地点的坐标通过查询已保存地点获取。没有坐标的地点不会显示在地图上。",
    "立ち寄り先の座標は保存済みスポットを取得して表示します。座標がない場所は地図に表示されません。"
  ],
  "점수는 첫 정차지만 조회합니다 -- 나머지 –는 조회하지 않았다는 뜻이며 자료 없음이 아닙니다.": [
    "Only the first stop's score is loaded. A – at other stops means they have not been queried, not that their data is missing.",
    "仅查询第一个停留地点的评分。其他地点的 – 表示尚未查询，并非没有资料。",
    "スコアを取得するのは最初の立ち寄り先のみです。他の – は未取得を示し、データがないという意味ではありません。"
  ],
  "저장한 코스": [
    "Saved itineraries",
    "已保存行程",
    "保存済みコース"
  ],
  "추천 탭에서 저장한 코스가 그대로 쌓입니다. 최대 100개까지 조회합니다.": [
    "Itineraries saved in Recommendations appear here. Up to 100 are loaded.",
    "在“推荐”页签中保存的行程会显示在此处，最多查询 100 个。",
    "おすすめタブで保存したコースがここに並びます。最大 100 件を取得します。"
  ],
  "날짜 미정": [
    "Date not set",
    "日期待定",
    "日付未定"
  ],
  "동행 알림 조회 실패": [
    "Could not load companion notifications",
    "同行通知查询失败",
    "同行通知を読み込めませんでした"
  ],
  "동행 알림 조회 중": [
    "Loading companion notifications",
    "正在查询同行通知",
    "同行通知を読み込み中"
  ],
  "아직 저장한 코스가 없습니다.": [
    "No saved itineraries yet.",
    "还没有保存的行程。",
    "まだ保存したコースがありません。"
  ],
  "이동 거리 · 소요 시간 · 코스 공유 · 순서 변경": [
    "Travel distance · Duration · Itinerary sharing · Reordering",
    "移动距离 · 所需时间 · 行程分享 · 更改顺序",
    "移動距離・所要時間・コース共有・順序変更"
  ],
  "날짜 · 소요 시간이 없는 코스는 «–» 로 둡니다 — 0 이 아닙니다. 점수는 첫 정차지 기준이며, 정차지마다 조회하지 않습니다.": [
    "Missing itinerary dates or durations are shown as – rather than 0. Scores refer to the first stop; other stops are not queried.",
    "行程缺少日期或所需时间时显示 –，而非 0。评分以第一个停留地点为准，不会逐个查询各停留地点。",
    "コースの日付・所要時間が不明な場合は – と表示し、0 にはしません。スコアは最初の立ち寄り先を基準とし、各立ち寄り先の取得は行いません。"
  ],
  "해변": [
    "Beach",
    "海滩",
    "ビーチ"
  ],
  "계곡": [
    "Valley",
    "溪谷",
    "渓谷"
  ],
  "코스 공유": [
    "Share itinerary",
    "分享行程",
    "コースを共有"
  ],
  "링크 · 이미지 카드 · 카카오 공유": [
    "Link · Image card · Kakao sharing",
    "链接 · 图片卡片 · Kakao 分享",
    "リンク・画像カード・Kakao 共有"
  ],
  "지난 코스 기록": [
    "Past itinerary history",
    "历史行程记录",
    "過去のコース履歴"
  ],
  "다녀온 장소와 후기 기록 조회": [
    "View visited places and review history",
    "查看去过的地点与评论记录",
    "訪問した場所や感想の記録を見る"
  ],
  "이미 코스 초안에 추가된 장소입니다.": [
    "This place is already in your draft itinerary.",
    "此地点已在行程草稿中。",
    "このスポットはすでにコースの下書きに追加されています。"
  ],
  "경로 후보는 최대 5곳입니다. 지도에서 코스를 확인해 주세요.": [
    "A route can include up to 5 places. Please check your itinerary on the map.",
    "路线最多包含 5 处地点。请在地图上查看行程。",
    "経路候補は最大 5 か所です。地図でコースを確認してください。"
  ],
  "코스 초안에 추가했습니다. 지도에서 확인하고 저장해 주세요.": [
    "Added to your draft itinerary. Review it on the map and save it.",
    "已添加到行程草稿。请在地图上确认并保存。",
    "コースの下書きに追加しました。地図で確認して保存してください。"
  ],
  "즐겨찾기를 해제했습니다.": [
    "Removed from favourites.",
    "已取消收藏。",
    "お気に入りを解除しました。"
  ],
  "즐겨찾기에 저장했습니다.": [
    "Saved to favourites.",
    "已添加到收藏。",
    "お気に入りに保存しました。"
  ],
  "일부 코스 장소를 조회하지 못했습니다.": [
    "Could not load some itinerary places.",
    "部分行程地点查询失败。",
    "一部のコースのスポットを読み込めませんでした。"
  ]
};

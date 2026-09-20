import type { MessageTranslations } from "../i18n.ts";

export const dataMessages: Record<string, MessageTranslations> = {
  "데이터 구분": [
    "Data source",
    "数据来源",
    "データ区分"
  ],
  "Pongdang 수집 데이터": [
    "Pongdang collected data",
    "Pongdang 收集数据",
    "Pongdang 収集データ"
  ],
  "Pongdang 자체 DB · 실제 자료 · 읽기 전용": [
    "Pongdang database · Real data · Read only",
    "Pongdang 独立数据库 · 真实资料 · 只读",
    "Pongdang 専用 DB・実データ・読み取り専用"
  ],
  "언어 선택": [
    "Choose language",
    "选择语言",
    "言語を選択"
  ],
  "주요 메뉴": [
    "Main menu",
    "主菜单",
    "メインメニュー"
  ],
  "데이터 조회": [
    "Browse data",
    "查询数据",
    "データ閲覧"
  ],
  "데이터 정보": [
    "Data information",
    "数据信息",
    "データ情報"
  ],
  "AI에게 물어보기": [
    "Ask AI",
    "向 AI 提问",
    "AI に質問"
  ],
  "앱 화면": [
    "Open app",
    "打开应用",
    "アプリ画面"
  ],
  "포트폴리오": [
    "Portfolio",
    "作品集",
    "ポートフォリオ"
  ],
  "Pongdang DB 연결됨": [
    "Pongdang database connected",
    "已连接 Pongdang 数据库",
    "Pongdang DB 接続済み"
  ],
  "DB 연결 확인 중": [
    "Checking database connection",
    "正在检查数据库连接",
    "DB 接続を確認中"
  ],
  "DB 조회 불가": [
    "Database unavailable",
    "数据库无法查询",
    "DB を照会できません"
  ],
  "· Pongdang 자체 DB / pongdang_data · 읽기 전용 · KST": [
    "· Pongdang database / pongdang_data · Read only · KST",
    "· Pongdang 独立数据库 / pongdang_data · 只读 · KST",
    "・Pongdang 専用 DB / pongdang_data・読み取り専用・KST"
  ],
  "현황 조회: {time}": [
    "Status queried: {time}",
    "状态查询时间：{time}",
    "状況の照会時刻：{time}"
  ],
  "전체 새로고침": [
    "Refresh all",
    "全部刷新",
    "すべて更新"
  ],
  "DB 현황을 불러오지 못했습니다. {error} 설명과 데이터 구조는 계속 확인할 수 있습니다.": [
    "Could not load database status. {error} Descriptions and data structures remain available.",
    "无法加载数据库状态。{error} 仍可查看说明和数据结构。",
    "DB の状況を読み込めませんでした。{error} 説明とデータ構造は引き続き確認できます。"
  ],
  "데이터셋 목록을 불러오지 못했습니다. 페이지를 새로고침해 주세요.": [
    "Could not load the dataset list. Please refresh the page.",
    "无法加载数据集列表。请刷新页面。",
    "データセット一覧を読み込めませんでした。ページを再読み込みしてください。"
  ],
  "Pongdang 데이터 정보": [
    "Pongdang data information",
    "Pongdang 数据信息",
    "Pongdang データ情報"
  ],
  "Pongdang은 자체 PostgreSQL을 사용하는 독립 프로젝트입니다. 수집 데이터는 pongdang_data에서 조회합니다. 과거 pongdang_demo 합성 예시는 은퇴했습니다. 제공처별 설정·자료 존재·수집 상태는 실제 조회 결과를 확인하며, 데이터 조회가 수집을 실행하지 않습니다.": [
    "Pongdang is an independent project with its own PostgreSQL database. Collected data is read from pongdang_data. The old pongdang_demo synthetic examples are retired. Provider configuration, available data and collection status are shown from actual queries. Browsing data does not start collection.",
    "Pongdang 是使用独立 PostgreSQL 数据库的项目，从 pongdang_data 查询收集数据。旧的 pongdang_demo 合成示例已停用。各提供方的配置、资料是否存在及收集状态均以实际查询结果为准。查询数据不会触发收集。",
    "Pongdang は専用 PostgreSQL を使う独立プロジェクトです。収集データは pongdang_data から照会します。過去の pongdang_demo 合成サンプルは廃止済みです。提供元の設定・データの有無・収集状態は実際の照会結果で確認します。データ閲覧で収集が実行されることはありません。"
  ],
  "수집 구조와 현재 구현 상태": [
    "Collection structure and implementation status",
    "收集结构与当前实现状态",
    "収集構造と現在の実装状況"
  ],
  "단계": [
    "Stage",
    "阶段",
    "段階"
  ],
  "역할": [
    "Role",
    "作用",
    "役割"
  ],
  "현재 상태": [
    "Current status",
    "当前状态",
    "現在の状態"
  ],
  "API 교체 시": [
    "When changing APIs",
    "更换 API 时",
    "API 変更時"
  ],
  "제공처 어댑터": [
    "Provider adapter",
    "提供方适配器",
    "提供元アダプター"
  ],
  "API 요청·응답을 공통 형식으로 변환": [
    "Convert API requests and responses to a common format",
    "将 API 请求和响应转换为通用格式",
    "API のリクエスト・レスポンスを共通形式に変換"
  ],
  "공식 제공처 어댑터 구현 · 실제 활성 상태는 수집 현황 참조": [
    "Official provider adapters implemented · See collection status for active providers",
    "已实现官方提供方适配器 · 实际启用状态见收集概况",
    "公式提供元のアダプターを実装済み・稼働状況は収集状況を参照"
  ],
  "이 모듈에 주소·인증·필드 매핑 구현": [
    "Implement endpoints, authentication and field mapping in this module",
    "在此模块中实现地址、认证和字段映射",
    "このモジュールにアドレス・認証・フィールド対応を実装"
  ],
  "공통 수집·검증": [
    "Shared collection and validation",
    "通用收集与验证",
    "共通の収集・検証"
  ],
  "제공처, 레코드 ID, 시각, 단위, 지표 검증": [
    "Validate providers, record IDs, times, units and metrics",
    "验证提供方、记录 ID、时间、单位和指标",
    "提供元・レコード ID・時刻・単位・指標を検証"
  ],
  "정규화된 근거와 원자적·멱등 저장": [
    "Normalized evidence with atomic, idempotent storage",
    "规范化依据与原子性、幂等存储",
    "正規化された根拠と原子的・冪等な保存"
  ],
  "공통 입력 계약 유지": [
    "Keep the common input contract",
    "保持通用输入约定",
    "共通入力契約を維持"
  ],
  "저장": [
    "Save",
    "保存",
    "保存"
  ],
  "장소 → 스냅샷 → 지표, 실행 이력": [
    "Place → snapshot → metrics, execution history",
    "地点 → 快照 → 指标、执行历史",
    "場所 → スナップショット → 指標、実行履歴"
  ],
  "원자적 저장·외래키·중복 방지 구현": [
    "Atomic storage, foreign keys and deduplication implemented",
    "已实现原子性存储、外键和防重复",
    "原子的保存・外部キー・重複防止を実装済み"
  ],
  "동일 스키마 재사용, 필요 시 별도 마이그레이션": [
    "Reuse the schema; migrate separately when needed",
    "复用相同结构，必要时单独迁移",
    "同じスキーマを再利用し、必要に応じて別途移行"
  ],
  "조회": [
    "Query",
    "查询",
    "照会"
  ],
  "검색·필터·정렬·코드명·페이지 이동": [
    "Search, filters, sorting, code labels and pagination",
    "搜索、筛选、排序、代码名称及翻页",
    "検索・フィルター・並べ替え・コード名・ページ移動"
  ],
  "구현 · 읽기 전용 · 페이지당 최대 100행": [
    "Implemented · Read only · Up to 100 rows per page",
    "已实现 · 只读 · 每页最多 100 行",
    "実装済み・読み取り専用・1 ページ最大 100 行"
  ],
  "공통 지표 코드·단위가 같으면 유지": [
    "Retain when common metric codes and units match",
    "通用指标代码和单位一致时保留",
    "共通指標コード・単位が同じなら維持"
  ],
  "예약 수집·평가": [
    "Scheduled collection and assessments",
    "定时收集与评估",
    "定期収集・評価"
  ],
  "독립 worker와 저장된 공개 평가 조회": [
    "Independent worker and queries of stored public assessments",
    "独立工作进程及已保存公开评估查询",
    "独立ワーカーと保存済み公開評価の照会"
  ],
  "수집 상태·지원 범위는 데이터 조회에서 확인": [
    "Check collection status and supported scope in Browse data",
    "在数据查询中查看收集状态与支持范围",
    "収集状態・対応範囲はデータ閲覧で確認"
  ],
  "수집 성공은 점수·안전 판정이 아님": [
    "Successful collection is not a score or safety assessment",
    "收集成功不代表评分或安全判断",
    "収集成功はスコアや安全判定ではありません"
  ],
  "데이터를 조합해서 보여줄 수 있는 내용": [
    "What combined data can show",
    "组合数据可展示的内容",
    "データを組み合わせて表示できる内容"
  ],
  "데이터": [
    "Data",
    "数据",
    "データ"
  ],
  "연결": [
    "Links",
    "关联",
    "接続"
  ],
  "조합 기준": [
    "Join criteria",
    "组合依据",
    "組み合わせ基準"
  ],
  "표현 예시": [
    "Display example",
    "展示示例",
    "表示例"
  ],
  "제약": [
    "Constraints",
    "限制",
    "制約"
  ],
  "자연어로 실제 자료 조회": [
    "Query real data in natural language",
    "用自然语言查询真实资料",
    "自然言語で実データを照会"
  ],
  "장소 검색, 수온·기상·예보·물때·수질·라이브캠 근거와 출처를 확인할 수 있습니다. 데이터 없는 추천·점수·안전 판정은 만들지 않으며, 알림 변경과 발송은 실행하지 않습니다.": [
    "Search places and inspect evidence and sources for water temperature, weather, forecasts, tides, water quality and live cameras. It does not invent recommendations, scores or safety assessments without data, and does not change or send notifications.",
    "可搜索地点，并查看水温、气象、预报、潮汐、水质及实时摄像头的依据与来源。不会在没有数据时生成推荐、评分或安全判断，也不会更改或发送通知。",
    "場所を検索し、水温・気象・予報・潮汐・水質・ライブカメラの根拠と出典を確認できます。データのないおすすめ・スコア・安全判定は作成せず、通知の変更や送信も行いません。"
  ],
  "질문·최근 대화와 필요한 공개 근거는 OpenAI에 전달됩니다. AI 키는 서버에서만 설정하며 대화에 개인정보를 입력하지 마세요. AI가 준비되지 않았어도 기존 데이터 조회는 사용할 수 있습니다.": [
    "Questions, recent conversation and necessary public evidence are sent to OpenAI. AI keys are configured only on the server; do not enter personal information in chat. Existing data browsing remains available even when AI is not ready.",
    "问题、近期对话和必要的公开依据会发送给 OpenAI。AI 密钥仅在服务器配置，请勿在对话中输入个人信息。即使 AI 尚未就绪，仍可使用现有数据查询。",
    "質問・最近の会話・必要な公開根拠は OpenAI に送信されます。AI キーはサーバーでのみ設定し、会話に個人情報を入力しないでください。AI が未準備でも既存のデータ閲覧は利用できます。"
  ],
  "현재 선택한 데이터의 전체 구조": [
    "Full structure of the selected data",
    "当前所选数据的完整结构",
    "現在選択しているデータの全体構造"
  ],
  "제공처 이름과 예시 코드가 있어도 현재 API 연동이 활성화됐다는 뜻은 아닙니다.": [
    "Provider names and example codes do not mean the API integration is currently active.",
    "提供方名称和示例代码的存在并不表示当前 API 集成已启用。",
    "提供元名やサンプルコードがあっても、現在 API 連携が有効とは限りません。"
  ],
  "데이터셋": [
    "Dataset",
    "数据集",
    "データセット"
  ],
  "테이블 코드": [
    "Table code",
    "表代码",
    "テーブルコード"
  ],
  "내용": [
    "Description",
    "内容",
    "内容"
  ],
  "필드명 · 코드": [
    "Field names · Codes",
    "字段名称 · 代码",
    "フィールド名・コード"
  ],
  "저장된 값 없음": [
    "No stored value",
    "无已存储值",
    "保存された値なし"
  ],
  "빈 문자열 (\"\")": [
    "Empty string (\"\")",
    "空字符串 (\"\")",
    "空文字列 (\"\")"
  ],
  "ID {id} · 전체 필드 상세": [
    "ID {id} · All field details",
    "ID {id} · 全部字段详情",
    "ID {id}・全フィールド詳細"
  ],
  "{dataset} ID {id} 상세": [
    "{dataset} ID {id} details",
    "{dataset} ID {id} 详情",
    "{dataset} ID {id} の詳細"
  ],
  "필드 · 타입": [
    "Field · Type",
    "字段 · 类型",
    "フィールド・型"
  ],
  "표시값 / 설명": [
    "Display value / Description",
    "显示值 / 说明",
    "表示値 / 説明"
  ],
  "DB 원본값": [
    "Original database value",
    "数据库原始值",
    "DB の元の値"
  ],
  "{dataset} 데이터": [
    "{dataset} data",
    "{dataset}数据",
    "{dataset} データ"
  ],
  "출처: {source} · NULL = 값 없음 · 상태와 유효 기간은 저장 당시 기준입니다.": [
    "Source: {source} · NULL = no value · Status and validity reflect the time of storage.",
    "来源：{source} · NULL = 无值 · 状态和有效期以存储时为准。",
    "出典：{source}・NULL = 値なし・状態と有効期間は保存時点のものです。"
  ],
  " 코드 필드는 코드명과 DB 원본 코드를 함께 표시합니다. 검색·필터는 원본 코드 기준이며, 미등록 코드는 뜻을 추정하지 않습니다.": [
    " Code fields show both a label and the original database code. Search and filters use original codes; unregistered codes are not interpreted.",
    " 代码字段同时显示名称和数据库原始代码。搜索和筛选以原始代码为准，不推测未登记代码的含义。",
    " コード項目はコード名と DB の元のコードを併記します。検索・フィルターは元のコードが対象です。未登録コードの意味は推測しません。"
  ],
  "데이터 검색": [
    "Search data",
    "搜索数据",
    "データ検索"
  ],
  "이름·출처·상태 검색": [
    "Search name, source or status",
    "搜索名称、来源或状态",
    "名前・出典・状態で検索"
  ],
  "열 필터를 사용하세요": [
    "Use a column filter",
    "请使用列筛选",
    "列フィルターを使用してください"
  ],
  "필터 열": [
    "Filter column",
    "筛选列",
    "フィルター列"
  ],
  "열 필터 선택": [
    "Choose column filter",
    "选择筛选列",
    "フィルター列を選択"
  ],
  "필터 값": [
    "Filter value",
    "筛选值",
    "フィルター値"
  ],
  "정확히 일치하는 원본값": [
    "Exact original value",
    "完全匹配的原始值",
    "完全一致する元の値"
  ],
  "초기화": [
    "Reset",
    "重置",
    "リセット"
  ],
  "새로고침": [
    "Refresh",
    "刷新",
    "更新"
  ],
  "조회 중…": [
    "Loading…",
    "查询中…",
    "読み込み中…"
  ],
  "조회 실패": [
    "Loading failed",
    "查询失败",
    "読み込み失敗"
  ],
  "조회 결과 {total}건 · 현재 {range}행": [
    "{total} results · Showing rows {range}",
    "查询结果 {total} 条 · 当前显示 {range} 行",
    "照会結果 {total} 件・表示中 {range} 行"
  ],
  "페이지당 행 수": [
    "Rows per page",
    "每页行数",
    "1 ページの行数"
  ],
  "긴 값 줄바꿈": [
    "Wrap long values",
    "长值自动换行",
    "長い値を折り返す"
  ],
  "상세 모두 접기": [
    "Collapse all details",
    "折叠全部详情",
    "詳細をすべて閉じる"
  ],
  "현재 페이지 상세 모두 펼치기": [
    "Expand all details on this page",
    "展开当前页全部详情",
    "現在のページの詳細をすべて開く"
  ],
  "표시할 열 ({count}/{total}) · 기본 전체 표시": [
    "Visible columns ({count}/{total}) · All shown by default",
    "显示列（{count}/{total}）· 默认全部显示",
    "表示する列（{count}/{total}）・既定ですべて表示"
  ],
  "전체 열": [
    "All columns",
    "全部列",
    "すべての列"
  ],
  "앞쪽 7개 열": [
    "First 7 columns",
    "前 7 列",
    "先頭の 7 列"
  ],
  "데이터를 불러오지 못했습니다. {error}": [
    "Could not load data. {error}",
    "无法加载数据。{error}",
    "データを読み込めませんでした。{error}"
  ],
  "다시 시도": [
    "Retry",
    "重试",
    "再試行"
  ],
  "{dataset} 표 · 가로 세로 스크롤": [
    "{dataset} table · Scroll horizontally and vertically",
    "{dataset}表 · 可横向和纵向滚动",
    "{dataset} の表・縦横スクロール"
  ],
  "상세": [
    "Details",
    "详情",
    "詳細"
  ],
  "코드명 / 원본 코드": [
    "Code label / Original code",
    "代码名称 / 原始代码",
    "コード名 / 元のコード"
  ],
  "ID {id} 행 상세": [
    "Details for row ID {id}",
    "ID {id} 行详情",
    "ID {id} 行の詳細"
  ],
  "접기": [
    "Collapse",
    "折叠",
    "閉じる"
  ],
  "펼치기": [
    "Expand",
    "展开",
    "開く"
  ],
  "조건에 맞는 데이터가 없습니다.": [
    "No data matches these conditions.",
    "没有符合条件的数据。",
    "条件に一致するデータがありません。"
  ],
  "아직 저장된 데이터가 없습니다. 테이블은 존재하지만 현재 행은 0건입니다.": [
    "No data has been stored yet. The table exists but currently has 0 rows.",
    "尚未存储数据。表已存在，但当前为 0 行。",
    "まだ保存されたデータがありません。テーブルは存在しますが、現在の行数は 0 件です。"
  ],
  "처음": [
    "First",
    "首页",
    "最初"
  ],
  "이전": [
    "Previous",
    "上一步",
    "前へ"
  ],
  "페이지": [
    "Page",
    "页",
    "ページ"
  ],
  "페이지 번호": [
    "Page number",
    "页码",
    "ページ番号"
  ],
  "다음": [
    "Next",
    "下一步",
    "次へ"
  ],
  "마지막": [
    "Last",
    "末页",
    "最後"
  ],
  "조회 시각: {time} KST": [
    "Queried at: {time} KST",
    "查询时间：{time} KST",
    "照会時刻：{time} KST"
  ],
  "최대 1,000페이지까지 조회합니다. 더 오래된 기록은 검색·필터로 범위를 좁혀 주세요.": [
    "Up to 1,000 pages can be queried. Narrow the range with search or filters to find older records.",
    "最多可查询 1,000 页。若需更早的记录，请通过搜索或筛选缩小范围。",
    "最大 1,000 ページを照会できます。古い記録は検索・フィルターで範囲を絞ってください。"
  ],
  "테이블 설명 · 전체 필드 구조 ({count}개)": [
    "Table description · All {count} fields",
    "表说明 · 全部字段结构（{count} 个）",
    "テーブル説明・全フィールド構造（{count} 個）"
  ],
  "필드명": [
    "Field name",
    "字段名",
    "フィールド名"
  ],
  "설명": [
    "Description",
    "说明",
    "説明"
  ],
  "조회 타입": [
    "Query type",
    "查询类型",
    "照会型"
  ],
  "텍스트 검색": [
    "Text search",
    "文本搜索",
    "テキスト検索"
  ],
  "가능": [
    "Supported",
    "支持",
    "対応"
  ],
  "더미 데이터 조회 (실제 관측 아님)": [
    "Browse synthetic data (not real observations)",
    "查询合成数据（非真实观测）",
    "合成データ閲覧（実際の観測ではありません）"
  ],
  "Pongdang 수집 데이터 조회": [
    "Browse Pongdang collected data",
    "查询 Pongdang 收集数据",
    "Pongdang 収集データ閲覧"
  ],
  "Collector 활동 신호가 오래되었습니다 (마지막: {time} KST). 저장 이력이며 현재 가동 여부를 뜻하지 않습니다.": [
    "The collector heartbeat is stale (last seen: {time} KST). This is stored history and does not indicate current activity.",
    "收集器活动信号已过期（最后记录：{time} KST）。这只是存储的历史记录，不表示当前正在运行。",
    "Collector の活動信号が古くなっています（最終：{time} KST）。保存された履歴であり、現在の稼働状況を示すものではありません。"
  ],
  "테이블 검색": [
    "Search tables",
    "搜索表",
    "テーブル検索"
  ],
  "테이블명·출처 검색": [
    "Search table name or source",
    "搜索表名或来源",
    "テーブル名・出典で検索"
  ],
  "데이터 분류": [
    "Data category",
    "数据分类",
    "データ分類"
  ],
  "전체 분류": [
    "All categories",
    "全部分类",
    "すべての分類"
  ],
  "데이터 있는 테이블만": [
    "Only tables with data",
    "仅显示有数据的表",
    "データがあるテーブルのみ"
  ],
  "데이터 있는 표 모두 펼치기": [
    "Expand every table with data",
    "展开所有有数据的表",
    "データがある表をすべて開く"
  ],
  "전체 테이블 현황 · {count}/{total}개 · 테이블명을 누르면 해당 데이터 조회": [
    "Table overview · {count}/{total} · Select a table name to browse its data",
    "全部表概况 · {count}/{total} 个 · 点击表名查询相应数据",
    "全テーブル状況・{count}/{total} 個・テーブル名を選ぶとデータを照会"
  ],
  "전체 테이블 현황": [
    "Table overview",
    "全部表概况",
    "全テーブル状況"
  ],
  "DB 테이블": [
    "Database table",
    "数据库表",
    "DB テーブル"
  ],
  "분류": [
    "Category",
    "分类",
    "分類"
  ],
  "저장 행": [
    "Stored rows",
    "已存储行",
    "保存行数"
  ],
  "허용 열": [
    "Allowed columns",
    "允许列",
    "許可された列"
  ],
  "최근 기록 · KST": [
    "Latest record · KST",
    "最近记录 · KST",
    "最新記録・KST"
  ],
  "출처": [
    "Source",
    "来源",
    "出典"
  ],
  "시간 필드 없음": [
    "No time field",
    "无时间字段",
    "時刻フィールドなし"
  ],
  "조건에 맞는 테이블이 없습니다.": [
    "No tables match these conditions.",
    "没有符合条件的表。",
    "条件に一致するテーブルがありません。"
  ],
  "조회 테이블": [
    "Selected table",
    "查询表",
    "照会テーブル"
  ],
  "{dataset} · {count}건": [
    "{dataset} · {count} records",
    "{dataset} · {count} 条",
    "{dataset}・{count} 件"
  ],
  "{count}개 표를 함께 표시합니다. 각 표는 최대 100행씩 조회하며 검색·페이지를 따로 조작할 수 있습니다.": [
    "Showing {count} tables together. Each loads up to 100 rows with separate search and pagination controls.",
    "同时显示 {count} 个表。每个表最多查询 100 行，可分别进行搜索和翻页。",
    "{count} 個の表を同時に表示します。各表は最大 100 行を照会し、検索・ページ移動を個別に操作できます。"
  ],
  "기본 100행·전체 열. 표 안에서 가로·세로 스크롤하고 여러 행의 상세를 함께 펼칠 수 있습니다.": [
    "Default: 100 rows and all columns. Scroll within the table horizontally or vertically and expand several rows at once.",
    "默认显示 100 行和全部列。可在表内横向或纵向滚动，并同时展开多行详情。",
    "既定は 100 行・全列です。表内を縦横にスクロールし、複数行の詳細を同時に開けます。"
  ],
  "데이터셋 목록을 불러오는 중입니다.": [
    "Loading dataset list.",
    "正在加载数据集列表。",
    "データセット一覧を読み込んでいます。"
  ],
  "선택한 범위에 데이터가 있는 테이블이 없습니다.": [
    "No tables contain data in the selected range.",
    "所选范围内没有包含数据的表。",
    "選択した範囲にデータがあるテーブルはありません。"
  ],
  "공개 카탈로그·수집 근거·평가·실행 이력의 허용 필드만 조회합니다. 회원 정보·인증 정보·원문 응답은 포함하지 않습니다. unknown은 판단 불가, unavailable은 제공 불가이며 안전함이나 실시간 관측을 뜻하지 않습니다. 현황 건수는 최대 30초 캐시됩니다.": [
    "Only allowed fields from public catalogs, collected evidence, assessments and execution history are queried. Member information, authentication data and raw responses are excluded. unknown means indeterminate and unavailable means not available; neither implies safety or live observation. Counts are cached for up to 30 seconds.",
    "仅查询公开目录、收集依据、评估及执行历史中允许的字段，不包含会员信息、认证信息或原始响应。unknown 表示无法判断，unavailable 表示无法提供，两者均不表示安全或实时观测。概况数量最多缓存 30 秒。",
    "公開カタログ・収集根拠・評価・実行履歴の許可された項目だけを照会します。会員情報・認証情報・元の応答は含みません。unknown は判断不可、unavailable は提供不可であり、安全性やリアルタイム観測を意味しません。件数は最大 30 秒キャッシュされます。"
  ],
  "기상·해양·수질": [
    "Weather · Marine · Water quality",
    "气象 · 海洋 · 水质",
    "気象・海洋・水質"
  ],
  "장소 ID, snapshot_id, 지표 코드, 단위, 관측/예보 시각": [
    "Place ID, snapshot_id, metric code, unit, observation/forecast time",
    "地点 ID、snapshot_id、指标代码、单位、观测/预报时间",
    "場所 ID、snapshot_id、指標コード、単位、観測/予報時刻"
  ],
  "같은 장소·시각의 기온·습도·강수·바람 등을 나란히 비교": [
    "Compare air temperature, humidity, rainfall and wind at the same place and time",
    "并列比较同一地点、同一时刻的气温、湿度、降水和风等",
    "同じ場所・時刻の気温・湿度・降水・風などを並べて比較"
  ],
  "시각·공간·단위가 다른 값을 같은 관측으로 합치지 않음": [
    "Do not merge values with different times, locations or units into one observation",
    "不将时间、空间或单位不同的值合并为同一次观测",
    "時刻・場所・単位が異なる値を同一観測にまとめない"
  ],
  "장소·주변 시설": [
    "Places · Nearby facilities",
    "地点 · 周边设施",
    "場所・周辺施設"
  ],
  "spot_id, 장소 유형, 시설 유형": [
    "spot_id, place type, facility type",
    "spot_id、地点类型、设施类型",
    "spot_id、場所の種類、施設の種類"
  ],
  "장소별 시설·온천·체험 정보를 표로 조회": [
    "Browse facilities, hot springs and experiences by place",
    "按地点以表格查询设施、温泉和体验信息",
    "場所別の設備・温泉・体験情報を表で照会"
  ],
  "실제 저장 필드만 제공하며 시설의 현재 운영·채취 허용 여부는 별도 근거 필요": [
    "Only stored fields are provided; current facility operation and harvesting permission require separate evidence",
    "仅提供实际存储字段；设施当前运营及采集许可须另有依据",
    "保存済み項目のみ提供し、施設の現在の営業・採取許可には別途根拠が必要"
  ],
  "관측·파생 근거": [
    "Observation · Derived evidence",
    "观测 · 派生依据",
    "観測・派生根拠"
  ],
  "snapshot_id, 원본/파생 metric ID, 방법론 버전": [
    "snapshot_id, original/derived metric ID, methodology version",
    "snapshot_id、原始/派生 metric ID、方法版本",
    "snapshot_id、元/派生 metric ID、手法バージョン"
  ],
  "어떤 원본 지표로 결과를 만들었는지 설명": [
    "Explain which original metrics produced a result",
    "说明结果基于哪些原始指标生成",
    "結果に使用した元の指標を説明"
  ],
  "공개 평가·지원 범위를 조회하되 미검증 수치 점수는 NULL 유지": [
    "Browse public assessments and supported scope; keep unvalidated numerical scores NULL",
    "查询公开评估和支持范围，未经验证的数值评分保持 NULL",
    "公開評価・対応範囲を照会し、未検証の数値スコアは NULL のまま保持"
  ],
  "날짜·활동별 예보": [
    "Forecasts by date and activity",
    "按日期和活动的预报",
    "日付・活動別の予報"
  ],
  "spot_id, 날짜, 활동, 대상 시각, 유효 기간": [
    "spot_id, date, activity, target time, validity period",
    "spot_id、日期、活动、目标时间、有效期",
    "spot_id、日付、活動、対象時刻、有効期間"
  ],
  "장소·날짜·활동별 값을 비교하는 표": [
    "Table comparing values by place, date and activity",
    "按地点、日期和活动比较数值的表格",
    "場所・日付・活動別の値を比較する表"
  ],
  "저장된 공식 예보의 대상 시각·발표 시각·유효 기간을 구분": [
    "Distinguish target time, issue time and validity of stored official forecasts",
    "区分已保存官方预报的目标时间、发布时间及有效期",
    "保存済み公式予報の対象時刻・発表時刻・有効期間を区別"
  ],
  "이동 시간·경로": [
    "Travel times · Routes",
    "移动时间 · 路线",
    "移動時間・経路"
  ],
  "snapshot_id, 출발/도착 spot_id, 이동 수단": [
    "snapshot_id, origin/destination spot_id, transport",
    "snapshot_id、出发/到达 spot_id、交通方式",
    "snapshot_id、出発/到着 spot_id、移動手段"
  ],
  "장소 간 이동 시간·거리 행렬": [
    "Travel time and distance matrix between places",
    "地点间移动时间与距离矩阵",
    "場所間の移動時間・距離行列"
  ],
  "저장된 자료가 없으면 이동 경로·시간을 새로 만들지 않음": [
    "Do not invent routes or travel times when no stored data exists",
    "没有已保存资料时不虚构移动路线或时间",
    "保存資料がなければ経路や移動時間を作らない"
  ],
  "수집 운영": [
    "Collection operations",
    "收集运行",
    "収集運用"
  ],
  "작업명, 결과, 시작/종료 시각": [
    "Task name, result, start/end time",
    "任务名、结果、开始/结束时间",
    "タスク名、結果、開始/終了時刻"
  ],
  "수집 성공·실패 이력과 활동 상태 확인": [
    "Inspect collection success/failure history and activity",
    "查看收集成功或失败历史及活动状态",
    "収集の成功・失敗履歴と活動状態を確認"
  ],
  "마지막 heartbeat가 오래되면 현재 실행 중으로 표시하지 않음": [
    "Do not show running status when the latest heartbeat is stale",
    "最后的 heartbeat 过期时不显示为正在运行",
    "最後の heartbeat が古ければ実行中と表示しない"
  ],
  "수집 데이터": [
    "Collected data",
    "收集数据",
    "収集データ"
  ],
  "계산 결과": [
    "Calculated results",
    "计算结果",
    "計算結果"
  ],
  "장소·기준 자료": [
    "Places · Reference data",
    "地点 · 基准资料",
    "場所・基準資料"
  ],
  "실행 기록": [
    "Execution records",
    "执行记录",
    "実行記録"
  ],
  "기록 없음": [
    "No record",
    "无记录",
    "記録なし"
  ],
  "합성 더미 (실제 수집 아님)": [
    "Synthetic example (not real collection)",
    "合成示例（非真实收集）",
    "合成サンプル（実際の収集ではありません）"
  ],
  "활동 신호 오래됨": [
    "Stale heartbeat",
    "活动信号过期",
    "活動信号が古い"
  ],
  "실행 중": [
    "Running",
    "运行中",
    "実行中"
  ],
  "시작 중": [
    "Starting",
    "启动中",
    "起動中"
  ],
  "중지 기록": [
    "Stopped record",
    "停止记录",
    "停止記録"
  ],
  "일부 작업 실패": [
    "Some tasks failed",
    "部分任务失败",
    "一部タスク失敗"
  ],
  "성공": [
    "Succeeded",
    "成功",
    "成功"
  ],
  "실패": [
    "Failed",
    "失败",
    "失敗"
  ],
  "건너뜀": [
    "Skipped",
    "已跳过",
    "スキップ"
  ],
  "판단 불가": [
    "Indeterminate",
    "无法判断",
    "判断不可"
  ],
  "근거 없음": [
    "No evidence",
    "无依据",
    "根拠なし"
  ],
  "제공 불가": [
    "Unavailable",
    "无法提供",
    "提供不可"
  ],
  "제공 가능": [
    "Available",
    "可提供",
    "提供可能"
  ],
  "일부 근거": [
    "Partial evidence",
    "部分依据",
    "一部の根拠"
  ],
  "수집 기록": [
    "Collection record",
    "收集记录",
    "収集記録"
  ],
  "기온": [
    "Air temperature",
    "气温",
    "気温"
  ],
  "상대 습도": [
    "Relative humidity",
    "相对湿度",
    "相対湿度"
  ],
  "1시간 강수량": [
    "1-hour precipitation",
    "1小时降水量",
    "1時間降水量"
  ],
  "풍속": [
    "Wind speed",
    "风速",
    "風速"
  ],
  "풍향": [
    "Wind direction",
    "风向",
    "風向"
  ],
  "구름 덮임 비율": [
    "Cloud cover",
    "云量比例",
    "雲量"
  ],
  "강수 확률": [
    "Precipitation probability",
    "降水概率",
    "降水確率"
  ],
  "최저 기온": [
    "Minimum air temperature",
    "最低气温",
    "最低気温"
  ],
  "최고 기온": [
    "Maximum air temperature",
    "最高气温",
    "最高気温"
  ],
  "수온": [
    "Water temperature",
    "水温",
    "水温"
  ],
  "파고": [
    "Wave height",
    "波高",
    "波高"
  ],
  "파주기": [
    "Wave period",
    "波浪周期",
    "波の周期"
  ],
  "조위": [
    "Tide level",
    "潮位",
    "潮位"
  ],
  "유속": [
    "Current speed",
    "流速",
    "流速"
  ],
  "이안류 위험 지표": [
    "Rip current risk index",
    "离岸流风险指标",
    "離岸流リスク指標"
  ],
  "해수욕 활동 지수": [
    "Beach swimming activity index",
    "海水浴活动指数",
    "海水浴活動指数"
  ],
  "서핑 활동 지수": [
    "Surfing activity index",
    "冲浪活动指数",
    "サーフィン活動指数"
  ],
  "수소 이온 농도 (pH)": [
    "Hydrogen ion concentration (pH)",
    "氢离子浓度（pH）",
    "水素イオン濃度（pH）"
  ],
  "탁도": [
    "Turbidity",
    "浊度",
    "濁度"
  ],
  "용존 산소량": [
    "Dissolved oxygen",
    "溶解氧",
    "溶存酸素量"
  ],
  "하천 유량": [
    "River flow",
    "河流流量",
    "河川の流量"
  ],
  "온천탕 수온": [
    "Hot spring bath temperature",
    "温泉池水温",
    "温泉浴槽の水温"
  ],
  "이슬점 온도": [
    "Dew point",
    "露点温度",
    "露点温度"
  ],
  "기상청": [
    "Korea Meteorological Administration",
    "韩国气象厅",
    "韓国気象庁"
  ],
  "국립해양조사원": [
    "Korea Hydrographic and Oceanographic Agency",
    "韩国国立海洋调查院",
    "韓国国立海洋調査院"
  ],
  "한국관광공사 관광 정보": [
    "Korea Tourism Organization information",
    "韩国观光公社旅游信息",
    "韓国観光公社の観光情報"
  ],
  "이동 경로 API": [
    "Routing API",
    "路线 API",
    "経路 API"
  ],
  "기상청 계열 합성 예시 (실제 수집 아님)": [
    "Synthetic weather example (not real collection)",
    "气象类合成示例（非真实收集）",
    "気象庁系の合成サンプル（実際の収集ではありません）"
  ],
  "해양 관측 합성 예시 (실제 수집 아님)": [
    "Synthetic marine observation example (not real collection)",
    "海洋观测合成示例（非真实收集）",
    "海洋観測の合成サンプル（実際の収集ではありません）"
  ],
  "수질 합성 예시 (수집기 미구현)": [
    "Synthetic water quality example (collector not implemented)",
    "水质合成示例（收集器未实现）",
    "水質の合成サンプル（収集器未実装）"
  ],
  "파생 계산 합성 예시": [
    "Synthetic derived calculation example",
    "派生计算合成示例",
    "派生計算の合成サンプル"
  ],
  "이동 경로 합성 예시 (실제 경로 아님)": [
    "Synthetic route example (not a real route)",
    "移动路线合成示例（非真实路线）",
    "経路の合成サンプル（実際の経路ではありません）"
  ],
  "내부 근거 통합": [
    "Internal evidence integration",
    "内部依据整合",
    "内部根拠の統合"
  ],
  "수영": [
    "Swimming",
    "游泳",
    "水泳"
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
  "갯벌 체험": [
    "Tidal flat experience",
    "滩涂体验",
    "干潟体験"
  ],
  "휴식": [
    "Relaxing",
    "休息",
    "休憩"
  ],
  "서핑": [
    "Surfing",
    "冲浪",
    "サーフィン"
  ],
  "현재 기상 수집": [
    "Collect current weather",
    "收集当前气象",
    "現在の気象を収集"
  ],
  "단기 기상 예보 수집": [
    "Collect short-range weather forecasts",
    "收集短期天气预报",
    "短期気象予報を収集"
  ],
  "해양 관측 수집": [
    "Collect marine observations",
    "收集海洋观测",
    "海洋観測を収集"
  ],
  "해양 활동 예보 수집": [
    "Collect marine activity forecasts",
    "收集海洋活动预报",
    "海洋活動予報を収集"
  ],
  "수질 합성 예시": [
    "Synthetic water quality example",
    "水质合成示例",
    "水質の合成サンプル"
  ],
  "관광 장소 동기화 예시": [
    "Tourism place sync example",
    "旅游地点同步示例",
    "観光スポット同期サンプル"
  ],
  "원본 근거로 파생 지표 계산": [
    "Calculate derived metrics from original evidence",
    "根据原始依据计算派生指标",
    "元の根拠から派生指標を計算"
  ],
  "일반 참여자 적합도 평가": [
    "Assess suitability for general participants",
    "评估一般参与者适合度",
    "一般参加者の適合度評価"
  ],
  "가족 참여자 적합도 평가": [
    "Assess suitability for families",
    "评估家庭参与者适合度",
    "家族参加者の適合度評価"
  ],
  "보존 정책에 따른 이력 정리": [
    "Clean up history under the retention policy",
    "按保留策略整理历史记录",
    "保存方針に従った履歴整理"
  ],
  "일별 예보 계산": [
    "Calculate daily forecasts",
    "计算每日预报",
    "日別予報を計算"
  ],
  "자동차 이동 경로 행렬": [
    "Driving route matrix",
    "驾车路线矩阵",
    "自動車経路行列"
  ],
  "도보 이동 경로 행렬": [
    "Walking route matrix",
    "步行路线矩阵",
    "徒歩経路行列"
  ],
  "자전거 이동 경로 행렬": [
    "Cycling route matrix",
    "骑行路线矩阵",
    "自転車経路行列"
  ],
  "섭씨 (°C)": [
    "Celsius (°C)",
    "摄氏度（°C）",
    "摂氏（°C）"
  ],
  "백분율 (%)": [
    "Percentage (%)",
    "百分比（%）",
    "百分率（%）"
  ],
  "밀리미터": [
    "Millimetres",
    "毫米",
    "ミリメートル"
  ],
  "초당 미터": [
    "Metres per second",
    "米/秒",
    "メートル毎秒"
  ],
  "각도 (°)": [
    "Degrees (°)",
    "角度（°）",
    "角度（°）"
  ],
  "미터": [
    "Metres",
    "米",
    "メートル"
  ],
  "초": [
    "Seconds",
    "秒",
    "秒"
  ],
  "센티미터": [
    "Centimetres",
    "厘米",
    "センチメートル"
  ],
  "합성 지수 (공식 지수 아님)": [
    "Synthetic index (not an official index)",
    "合成指数（非官方指数）",
    "合成指数（公式指数ではありません）"
  ],
  "산성·염기성 척도": [
    "Acidity/alkalinity scale",
    "酸碱度尺度",
    "酸性・アルカリ性の尺度"
  ],
  "탁도 단위": [
    "Turbidity unit",
    "浊度单位",
    "濁度の単位"
  ],
  "리터당 밀리그램": [
    "Milligrams per litre",
    "毫克/升",
    "ミリグラム毎リットル"
  ],
  "초당 세제곱미터": [
    "Cubic metres per second",
    "立方米/秒",
    "立方メートル毎秒"
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
  "파생 계산": [
    "Derived calculation",
    "派生计算",
    "派生計算"
  ],
  "합성 예시": [
    "Synthetic example",
    "合成示例",
    "合成サンプル"
  ],
  "자동차": [
    "Driving",
    "驾车",
    "自動車"
  ],
  "도보": [
    "Walking",
    "步行",
    "徒歩"
  ],
  "자전거": [
    "Cycling",
    "骑行",
    "自転車"
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
  "갯벌": [
    "Tidal flats",
    "滩涂",
    "干潟"
  ],
  "합성 예시 · 미검증": [
    "Synthetic example · Unverified",
    "合成示例 · 未验证",
    "合成サンプル・未検証"
  ],
  "주차장": [
    "Car park",
    "停车场",
    "駐車場"
  ],
  "화장실": [
    "Toilet",
    "洗手间",
    "トイレ"
  ],
  "샤워실": [
    "Shower",
    "淋浴室",
    "シャワー室"
  ],
  "편의점": [
    "Convenience store",
    "便利店",
    "コンビニ"
  ],
  "합성 예시 · 실제 시설 아님": [
    "Synthetic example · Not a real facility",
    "合成示例 · 非真实设施",
    "合成サンプル・実際の施設ではありません"
  ],
  "일반 참여자": [
    "General participant",
    "一般参与者",
    "一般参加者"
  ],
  "가족 참여자": [
    "Family participant",
    "家庭参与者",
    "家族参加者"
  ],
  "합성 예시 · 실제 예보 아님": [
    "Synthetic example · Not a real forecast",
    "合成示例 · 非真实预报",
    "合成サンプル・実際の予報ではありません"
  ],
  "합성 예시 · 실제 실행하지 않음": [
    "Synthetic example · Not actually executed",
    "合成示例 · 未实际执行",
    "合成サンプル・実際には実行していません"
  ],
  "더미 파생 계산의 입력 근거": [
    "Input evidence for synthetic derived calculations",
    "合成派生计算的输入依据",
    "ダミー派生計算の入力根拠"
  ],
  "미등록 코드": [
    "Unregistered code",
    "未登记代码",
    "未登録コード"
  ],
  "{name} · 합성 예시 (실제 실행 아님)": [
    "{name} · Synthetic example (not actually executed)",
    "{name} · 合成示例（非实际执行）",
    "{name}・合成サンプル（実際の実行ではありません）"
  ],
  "장소 카탈로그": [
    "Place catalog",
    "地点目录",
    "場所カタログ"
  ],
  "공식 장소·관측소 API": [
    "Official place and station APIs",
    "官方地点与观测站 API",
    "公式の場所・観測所 API"
  ],
  "실제 제공처 장소와 관측 지점의 공통 참조입니다. 안전 여부를 판정한 목록이 아닙니다.": [
    "Shared references for real provider places and observation sites. This list does not assess their safety.",
    "实际提供方地点与观测点的共同参考，并非经过安全判断的列表。",
    "実際の提供元スポットと観測地点の共通参照です。安全性を判定した一覧ではありません。"
  ],
  "장소명": [
    "Place name",
    "地点名称",
    "場所名"
  ],
  "지역": [
    "Region",
    "地区",
    "地域"
  ],
  "유형": [
    "Type",
    "类型",
    "種類"
  ],
  "카탈로그 출처": [
    "Catalog source",
    "目录来源",
    "カタログ出典"
  ],
  "검증 상태": [
    "Verification status",
    "验证状态",
    "検証状態"
  ],
  "KHOA 지점 코드": [
    "KHOA site code",
    "KHOA 地点代码",
    "KHOA 地点コード"
  ],
  "위도": [
    "Latitude",
    "纬度",
    "緯度"
  ],
  "경도": [
    "Longitude",
    "经度",
    "経度"
  ],
  "주소": [
    "Address",
    "地址",
    "住所"
  ],
  "검증 시각": [
    "Verified at",
    "验证时间",
    "検証時刻"
  ],
  "관측 스냅샷": [
    "Observation snapshots",
    "观测快照",
    "観測スナップショット"
  ],
  "기상청·국립해양조사원·수질 관측 API": [
    "Weather, oceanographic and water quality observation APIs",
    "气象厅、国立海洋调查院及水质观测 API",
    "気象庁・国立海洋調査院・水質観測 API"
  ],
  "원본 시각·출처·유효기간을 보존한 관측 및 예측 스냅샷입니다. 발표 시각 미제공은 NULL입니다.": [
    "Observation and forecast snapshots preserve original times, sources and validity. A missing issue time is NULL.",
    "观测和预测快照保留原始时间、来源及有效期。未提供发布时间时为 NULL。",
    "元の時刻・出典・有効期間を保持した観測・予測スナップショットです。発表時刻が未提供の場合は NULL です。"
  ],
  "장소 ID": [
    "Place ID",
    "地点 ID",
    "場所 ID"
  ],
  "제공처": [
    "Provider",
    "提供方",
    "提供元"
  ],
  "원본 상태": [
    "Original status",
    "原始状态",
    "元の状態"
  ],
  "관측 시각": [
    "Observation time",
    "观测时间",
    "観測時刻"
  ],
  "수집 시각": [
    "Collected at",
    "收集时间",
    "収集時刻"
  ],
  "유효 종료": [
    "Valid until",
    "有效结束时间",
    "有効終了"
  ],
  "유효 시작": [
    "Valid from",
    "有效开始时间",
    "有効開始"
  ],
  "공간 범위": [
    "Spatial scope",
    "空间范围",
    "空間範囲"
  ],
  "제공처 레코드 ID": [
    "Provider record ID",
    "提供方记录 ID",
    "提供元レコード ID"
  ],
  "수집 버전": [
    "Collection version",
    "收集版本",
    "収集バージョン"
  ],
  "원본 레코드 ID": [
    "Original record ID",
    "原始记录 ID",
    "元レコード ID"
  ],
  "관측소 참조 ID": [
    "Station reference ID",
    "观测站参考 ID",
    "観測所参照 ID"
  ],
  "예보 발표 시각": [
    "Forecast issue time",
    "预报发布时间",
    "予報発表時刻"
  ],
  "관측 측정값": [
    "Observation measurements",
    "观测测量值",
    "観測測定値"
  ],
  "기상청·해양·수질 API 정규화": [
    "Normalized weather, marine and water quality APIs",
    "气象、海洋及水质 API 规范化",
    "気象・海洋・水質 API の正規化"
  ],
  "원본 측정항목·수치·문자·단위와 유효기간을 보존합니다. 결측과 이전 수정본을 구분합니다.": [
    "Preserves original measurement names, numbers, text, units and validity. Missing values and superseded revisions remain distinct.",
    "保留原始测量项目、数值、文本、单位及有效期，并区分缺失值和旧修订版本。",
    "元の測定項目・数値・文字・単位・有効期間を保持します。欠測と以前の改訂版を区別します。"
  ],
  "스냅샷 ID": [
    "Snapshot ID",
    "快照 ID",
    "スナップショット ID"
  ],
  "지표명": [
    "Metric name",
    "指标名称",
    "指標名"
  ],
  "수치": [
    "Numeric value",
    "数值",
    "数値"
  ],
  "문자 값": [
    "Text value",
    "文本值",
    "文字値"
  ],
  "논리 값": [
    "Boolean value",
    "布尔值",
    "論理値"
  ],
  "단위": [
    "Unit",
    "单位",
    "単位"
  ],
  "관측 방식": [
    "Observation mode",
    "观测方式",
    "観測方式"
  ],
  "신뢰도": [
    "Confidence",
    "可信度",
    "信頼度"
  ],
  "관측소": [
    "Station",
    "观测站",
    "観測所"
  ],
  "Water Index 평가": [
    "Water Index assessments",
    "Water Index 评估",
    "Water Index 評価"
  ],
  "Pongdang 평가 구조 · 계산기 미구현": [
    "Pongdang assessment structure · Calculator not implemented",
    "Pongdang 评估结构 · 计算器未实现",
    "Pongdang 評価構造・計算器未実装"
  ],
  "원본 지표를 근거로 계산한 적합도·안전 상태·신뢰도입니다. unknown과 null은 안전 또는 0점을 의미하지 않습니다.": [
    "Suitability, safety status and confidence calculated from original metrics. unknown and null do not mean safe or zero points.",
    "根据原始指标计算的适合度、安全状态和可信度。unknown 与 null 不代表安全或 0 分。",
    "元の指標に基づいて計算した適合度・安全状態・信頼度です。unknown と null は安全や 0 点を意味しません。"
  ],
  "활동": [
    "Activities",
    "活动",
    "活動"
  ],
  "참여자 유형": [
    "Participant type",
    "参与者类型",
    "参加者の種類"
  ],
  "안전 상태": [
    "Safety status",
    "安全状态",
    "安全状態"
  ],
  "판정": [
    "Decision",
    "判定",
    "判定"
  ],
  "적합도": [
    "Suitability",
    "适合度",
    "適合度"
  ],
  "근거 충족도": [
    "Evidence coverage",
    "依据完整度",
    "根拠充足度"
  ],
  "평가 시각": [
    "Assessed at",
    "评估时间",
    "評価時刻"
  ],
  "누락 지표": [
    "Missing metrics",
    "缺失指标",
    "不足指標"
  ],
  "한계": [
    "Limitations",
    "局限",
    "限界"
  ],
  "평가 방법 버전": [
    "Assessment methodology version",
    "评估方法版本",
    "評価手法バージョン"
  ],
  "일별 예측 평가": [
    "Daily forecast assessments",
    "每日预测评估",
    "日別予測評価"
  ],
  "Pongdang 날짜별 평가 구조 · 계산기 미구현": [
    "Pongdang daily assessment structure · Calculator not implemented",
    "Pongdang 每日评估结构 · 计算器未实现",
    "Pongdang 日別評価構造・計算器未実装"
  ],
  "특정 날짜·시각의 근거에 기반한 평가 기록입니다. unavailable은 실제 예측을 제공할 근거가 부족하다는 뜻입니다.": [
    "Assessment records based on evidence for a specific date and time. unavailable means there is insufficient evidence to provide an actual forecast.",
    "基于特定日期和时间依据的评估记录。unavailable 表示缺乏足够依据，无法提供实际预测。",
    "特定の日付・時刻の根拠に基づく評価記録です。unavailable は実際の予測を提供する根拠が不足していることを示します。"
  ],
  "예측 날짜": [
    "Forecast date",
    "预测日期",
    "予測日"
  ],
  "제공 가능 상태": [
    "Availability status",
    "可提供状态",
    "提供可否の状態"
  ],
  "제공 불가 사유": [
    "Unavailability reason",
    "无法提供的原因",
    "提供不可の理由"
  ],
  "대상 시각": [
    "Target time",
    "目标时间",
    "対象時刻"
  ],
  "Collector 실행 이력": [
    "Collector execution history",
    "收集器执行历史",
    "Collector 実行履歴"
  ],
  "Pongdang API 수집 실행 이력": [
    "Pongdang API collection execution history",
    "Pongdang API 收集执行历史",
    "Pongdang API 収集実行履歴"
  ],
  "작업별 실제 실행 결과입니다. 자료 없음·부분 수집·실패를 성공과 구별합니다.": [
    "Actual execution results per task. No data, partial collection and failure are distinguished from success.",
    "各任务的实际执行结果，区分无资料、部分收集、失败与成功。",
    "タスクごとの実際の実行結果です。データなし・部分収集・失敗を成功と区別します。"
  ],
  "작업명": [
    "Task name",
    "任务名称",
    "タスク名"
  ],
  "실행 결과": [
    "Execution result",
    "执行结果",
    "実行結果"
  ],
  "시작 시각": [
    "Started at",
    "开始时间",
    "開始時刻"
  ],
  "종료 시각": [
    "Finished at",
    "结束时间",
    "終了時刻"
  ],
  "오류 코드": [
    "Error code",
    "错误代码",
    "エラーコード"
  ],
  "Collector 활동 신호": [
    "Collector heartbeat",
    "收集器活动信号",
    "Collector 活動信号"
  ],
  "Pongdang 주기 수집기": [
    "Pongdang periodic collector",
    "Pongdang 定期收集器",
    "Pongdang 定期収集器"
  ],
  "주기 수집 프로세스의 최근 활동 시각입니다. 오래된 신호는 조회 시 stale로 판정합니다.": [
    "Last activity of the periodic collection process. An old heartbeat is classified as stale when queried.",
    "定期收集进程的最近活动时间。查询时，过期信号会被判定为 stale。",
    "定期収集プロセスの最近の活動時刻です。古い信号は照会時に stale と判定します。"
  ],
  "파이프라인": [
    "Pipeline",
    "流水线",
    "パイプライン"
  ],
  "실행 작업": [
    "Running tasks",
    "运行任务",
    "実行タスク"
  ],
  "마지막 활동": [
    "Last activity",
    "最后活动",
    "最終活動"
  ],
  "갱신 시각": [
    "Updated at",
    "更新时间",
    "更新時刻"
  ],
  "파생 지표 근거 연결": [
    "Derived metric evidence links",
    "派生指标依据关联",
    "派生指標の根拠リンク"
  ],
  "Pongdang 파생 근거 구조 · 계산기 미구현": [
    "Pongdang derived evidence structure · Calculator not implemented",
    "Pongdang 派生依据结构 · 计算器未实现",
    "Pongdang 派生根拠構造・計算器未実装"
  ],
  "파생 지표가 어떤 원본 측정값을 사용했는지 연결합니다.": [
    "Links derived metrics to the original measurements they used.",
    "将派生指标关联到其所使用的原始测量值。",
    "派生指標が使用した元の測定値を関連付けます。"
  ],
  "파생 지표 ID": [
    "Derived metric ID",
    "派生指标 ID",
    "派生指標 ID"
  ],
  "원본 지표 ID": [
    "Original metric ID",
    "原始指标 ID",
    "元の指標 ID"
  ],
  "관계": [
    "Relationship",
    "关系",
    "関係"
  ],
  "우선순위": [
    "Priority",
    "优先级",
    "優先順位"
  ],
  "생성 시각": [
    "Created at",
    "创建时间",
    "作成時刻"
  ],
  "하천 유량 보정": [
    "River discharge calibration",
    "河流流量校准",
    "河川流量の補正"
  ],
  "검증된 운영자 입력": [
    "Verified operator input",
    "已验证的操作员输入",
    "検証済み運用者入力"
  ],
  "지점별 유량 적합도 계산에 필요한 검증된 기준값입니다. API 자동 수집값과 구분합니다.": [
    "Verified reference values for calculating discharge suitability at each site. These are distinct from values collected automatically by APIs.",
    "用于计算各地点流量适合度的已验证基准值，与 API 自动收集值区分。",
    "地点ごとの流量適合度の計算に必要な検証済み基準値です。API の自動収集値とは区別します。"
  ],
  "버전": [
    "Version",
    "版本",
    "バージョン"
  ],
  "검증 기관": [
    "Verifying institution",
    "验证机构",
    "検証機関"
  ],
  "검증 여부": [
    "Verification status",
    "是否验证",
    "検証の有無"
  ],
  "사용 여부": [
    "Enabled",
    "是否启用",
    "使用の有無"
  ],
  "최소 유량": [
    "Minimum discharge",
    "最小流量",
    "最小流量"
  ],
  "적정 하한": [
    "Suitable lower bound",
    "适宜下限",
    "適正下限"
  ],
  "적정 상한": [
    "Suitable upper bound",
    "适宜上限",
    "適正上限"
  ],
  "최대 유량": [
    "Maximum discharge",
    "最大流量",
    "最大流量"
  ],
  "경로 조회 스냅샷": [
    "Route query snapshots",
    "路线查询快照",
    "経路照会スナップショット"
  ],
  "Pongdang 경로 구조 · 제공처 API 미설정": [
    "Pongdang route structure · Provider API not configured",
    "Pongdang 路线结构 · 提供方 API 未配置",
    "Pongdang 経路構造・提供元 API 未設定"
  ],
  "이동 수단별 경로 행렬의 출처와 유효 기간입니다. 경로 수집과 예약 갱신은 미설정입니다.": [
    "Source and validity of route matrices by transport mode. Route collection and scheduled updates are not configured.",
    "各交通方式路线矩阵的来源与有效期。路线收集及定时更新尚未配置。",
    "移動手段ごとの経路行列の出典と有効期間です。経路収集と定期更新は未設定です。"
  ],
  "이동 수단": [
    "Transport mode",
    "交通方式",
    "移動手段"
  ],
  "구간별 이동 시간": [
    "Travel time by leg",
    "各路段移动时间",
    "区間別移動時間"
  ],
  "경로 행렬 결과": [
    "Route matrix results",
    "路线矩阵结果",
    "経路行列の結果"
  ],
  "장소 사이의 이동 시간과 거리입니다. 경로 스냅샷 ID로 출처를 연결합니다.": [
    "Travel times and distances between places. Sources are linked by route snapshot ID.",
    "地点间的移动时间和距离，通过路线快照 ID 关联来源。",
    "場所間の移動時間と距離です。経路スナップショット ID で出典を関連付けます。"
  ],
  "출발 장소 ID": [
    "Origin place ID",
    "出发地点 ID",
    "出発場所 ID"
  ],
  "도착 장소 ID": [
    "Destination place ID",
    "到达地点 ID",
    "到着場所 ID"
  ],
  "이동 시간(초)": [
    "Travel time (seconds)",
    "移动时间（秒）",
    "移動時間（秒）"
  ],
  "거리(m)": [
    "Distance (m)",
    "距离（m）",
    "距離（m）"
  ],
  "주변 시설": [
    "Nearby facilities",
    "周边设施",
    "周辺施設"
  ],
  "장소 보조 카탈로그": [
    "Supplementary place catalog",
    "地点辅助目录",
    "場所の補助カタログ"
  ],
  "장소 주변 시설의 위치와 분류입니다. 테이블 존재와 실제 데이터 수집 여부는 별개입니다.": [
    "Locations and categories of facilities near places. The table's existence does not mean data has actually been collected.",
    "地点周边设施的位置和分类。表的存在与是否实际收集了数据是两回事。",
    "場所の周辺施設の位置と分類です。テーブルの存在と実際にデータが収集されているかは別です。"
  ],
  "시설명": [
    "Facility name",
    "设施名称",
    "施設名"
  ],
  "태그": [
    "Tags",
    "标签",
    "タグ"
  ],
  "이동 시간(분)": [
    "Travel time (minutes)",
    "移动时间（分钟）",
    "移動時間（分）"
  ],
  "채집 안내": [
    "Harvesting guide",
    "采集指南",
    "採取案内"
  ],
  "채집 종과 제한 기간 등을 담는 보조 자료입니다.": [
    "Supplementary information on harvested species, restricted periods and related details.",
    "包含采集物种、限制期间等的辅助资料。",
    "採取対象の種類や制限期間などを含む補助資料です。"
  ],
  "대상 종": [
    "Target species",
    "目标物种",
    "対象種"
  ],
  "금지 종": [
    "Prohibited species",
    "禁止采集物种",
    "禁止種"
  ],
  "안내 시간": [
    "Guidance time",
    "指引时间",
    "案内時間"
  ],
  "기간 제한": [
    "Period restrictions",
    "期间限制",
    "期間制限"
  ],
  "온천 상세": [
    "Hot spring details",
    "温泉详情",
    "温泉詳細"
  ],
  "온천 성분과 기존 카탈로그 설명입니다. 효능 설명은 의학적 판단 자료가 아닙니다.": [
    "Hot spring composition and existing catalog descriptions. Claimed benefits are not a basis for medical decisions.",
    "温泉成分与现有目录说明。功效说明不可作为医学判断依据。",
    "温泉成分と既存カタログの説明です。効能の説明は医学的判断の資料ではありません。"
  ],
  "성분": [
    "Composition",
    "成分",
    "成分"
  ],
  "카탈로그 설명": [
    "Catalog description",
    "目录说明",
    "カタログ説明"
  ],
  "수집 관측소": [
    "Collected stations",
    "已收集观测站",
    "収集済み観測所"
  ],
  "공식 API 수집": [
    "Official API collection",
    "官方 API 收集",
    "公式 API 収集"
  ],
  "제공처 관측소·예보 격자. 좌표가 없는 원자료는 NULL로 보존합니다.": [
    "Provider stations and forecast grids. Original data without coordinates is preserved as NULL.",
    "提供方观测站与预报网格。没有坐标的原始资料保留为 NULL。",
    "提供元の観測所・予報格子です。座標のない元データは NULL のまま保持します。"
  ],
  "원본 관측소 ID": [
    "Original station ID",
    "原始观测站 ID",
    "元の観測所 ID"
  ],
  "관측소명": [
    "Station name",
    "观测站名称",
    "観測所名"
  ],
  "구분": [
    "Category",
    "类别",
    "区分"
  ],
  "기준면": [
    "Reference datum",
    "基准面",
    "基準面"
  ],
  "참조 장소 ID": [
    "Reference place ID",
    "参考地点 ID",
    "参照場所 ID"
  ],
  "확인 시각": [
    "Checked at",
    "确认时间",
    "確認時刻"
  ],
  "제공처 적용 시작": [
    "Provider effective from",
    "提供方生效开始时间",
    "提供元の適用開始"
  ],
  "제공처 적용 종료": [
    "Provider effective until",
    "提供方生效结束时间",
    "提供元の適用終了"
  ],
  "기상특보 발표": [
    "Weather warning bulletins",
    "气象预警发布",
    "気象特報発表"
  ],
  "공식 특보 발표 이력입니다. 발표 목록은 현재 발효 상태나 안전 판정이 아닙니다.": [
    "History of official warning bulletins. The list does not represent current validity or a safety assessment.",
    "官方预警发布历史。发布列表不代表当前生效状态或安全判断。",
    "公式特報の発表履歴です。発表一覧は現在の発効状態や安全判定ではありません。"
  ],
  "발표 ID": [
    "Bulletin ID",
    "发布 ID",
    "発表 ID"
  ],
  "발표 시각": [
    "Issued at",
    "发布时间",
    "発表時刻"
  ],
  "발표 내용": [
    "Bulletin text",
    "发布内容",
    "発表内容"
  ],
  "대상 지역": [
    "Affected region",
    "目标地区",
    "対象地域"
  ],
  "종류": [
    "Kind",
    "种类",
    "種類"
  ],
  "발효 시각": [
    "Effective at",
    "生效时间",
    "発効時刻"
  ],
  "해제 시각": [
    "Lifted at",
    "解除时间",
    "解除時刻"
  ],
  "상태": [
    "Status",
    "状态",
    "状態"
  ],
  "수집 장소·관광정보": [
    "Collected places and tourism data",
    "已收集地点及旅游信息",
    "収集済みスポット・観光情報"
  ],
  "카카오·관광공사에서 조회한 실제 장소입니다. 물놀이 적합성이나 안전성을 검증한 목록은 아닙니다.": [
    "Real places queried from Kakao and the tourism organization. This list does not verify suitability for water activities or safety.",
    "从 Kakao 和观光公社查询到的真实地点。此列表并未验证水上活动适合性或安全性。",
    "Kakao・観光公社から照会した実際の場所です。水遊びへの適合性や安全性を検証した一覧ではありません。"
  ],
  "원본 링크": [
    "Original link",
    "原始链接",
    "元のリンク"
  ],
  "제공처 등록 시각": [
    "Provider created at",
    "提供方登记时间",
    "提供元の登録時刻"
  ],
  "제공처 수정 시각": [
    "Provider updated at",
    "提供方修改时间",
    "提供元の更新時刻"
  ],
  "API 갱신 작업": [
    "API refresh jobs",
    "API 更新任务",
    "API 更新タスク"
  ],
  "작업별 실행 결과와 다음 시도 시각입니다. 실패 시 기존 관측값의 유효 기간을 연장하지 않습니다.": [
    "Execution results and the next attempt time for each task. Failed attempts do not extend the validity of existing observations.",
    "各任务的执行结果与下次尝试时间。失败时不会延长现有观测值的有效期。",
    "タスクごとの実行結果と次回試行時刻です。失敗しても既存の観測値の有効期間は延長しません。"
  ],
  "작업": [
    "Task",
    "任务",
    "タスク"
  ],
  "갱신 간격(초)": [
    "Refresh interval (seconds)",
    "更新间隔（秒）",
    "更新間隔（秒）"
  ],
  "최근 정상 응답": [
    "Latest successful response",
    "最近正常响应",
    "最新の正常応答"
  ],
  "다음 시도": [
    "Next attempt",
    "下次尝试",
    "次回試行"
  ],
  "연속 실패": [
    "Consecutive failures",
    "连续失败",
    "連続失敗"
  ],
  "수신 자료 수": [
    "Received records",
    "接收资料数",
    "受信データ数"
  ],
  "신규 저장 수": [
    "Newly stored records",
    "新增存储数",
    "新規保存数"
  ]
};

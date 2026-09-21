import type { MessageTranslations } from "../i18n.ts";

export const errorMessages: Record<string, MessageTranslations> = {
  "로컬 테스트 · 이 컴퓨터의 임시 운영자 세션 · ": [
    "Local test · Temporary operator session on this computer · ",
    "本地测试 · 此电脑上的临时管理员会话 · ",
    "ローカルテスト · このコンピュータの一時的な運用者セッション · "
  ],
  "AI 설정 준비됨 · 실제 OpenAI 연결은 질문 전송 시 확인합니다.": [
    "AI configuration is ready · The actual OpenAI connection is checked when you send a question.",
    "AI配置已就绪 · 发送问题时才会确认实际OpenAI连接。",
    "AIの設定は準備済みです · 実際のOpenAI接続は質問の送信時に確認します。"
  ],
  "AI가 운영 설정에서 비활성화되어 있습니다. 기존 자료 조회는 사용할 수 있습니다.": [
    "AI is disabled in the service settings. Existing data browsing remains available.",
    "AI已在服务设置中禁用。仍可浏览现有资料。",
    "運用設定でAIが無効になっています。既存の資料閲覧は利用できます。"
  ],
  "AI 준비 전 · 서버 설정이 필요합니다. 기존 자료 조회는 사용할 수 있습니다.": [
    "AI is not ready · Server configuration is required. Existing data browsing remains available.",
    "AI尚未就绪 · 需要配置服务器。仍可浏览现有资料。",
    "AIは未準備です · サーバー設定が必要です。既存の資料閲覧は利用できます。"
  ],
  "AI 접근 실패 · 키 또는 모델 접근 권한을 확인해야 합니다. 기존 자료 조회는 사용할 수 있습니다.": [
    "AI access failed · The key or model access permissions need checking. Existing data browsing remains available.",
    "AI访问失败 · 需要检查密钥或模型访问权限。仍可浏览现有资料。",
    "AIへのアクセスに失敗しました · キーまたはモデルへのアクセス権限の確認が必要です。既存の資料閲覧は利用できます。"
  ],
  "AI 상태 확인 필요 · 설정 여부만으로 실제 연결을 보장하지 않습니다.": [
    "AI status needs checking · Having configuration in place does not guarantee a working connection.",
    "需要确认AI状态 · 已配置并不保证实际连接正常。",
    "AIの状態確認が必要です · 設定済みであっても実際の接続は保証されません。"
  ],
  "AI가 운영 설정에서 비활성화되어 있습니다.": [
    "AI is disabled in the service settings.",
    "AI已在服务设置中禁用。",
    "運用設定でAIが無効になっています。"
  ],
  "서버의 AI 설정이 준비되지 않았습니다.": [
    "The server's AI configuration is not ready.",
    "服务器的AI配置尚未就绪。",
    "サーバーのAI設定が準備できていません。"
  ],
  "OpenAI 인증에 실패했습니다. 서버 키 설정을 확인해야 합니다.": [
    "OpenAI authentication failed. The server key configuration needs checking.",
    "OpenAI身份验证失败。需要检查服务器密钥配置。",
    "OpenAIの認証に失敗しました。サーバーのキー設定の確認が必要です。"
  ],
  "OpenAI 접근 권한이 없습니다. 서버의 모델 접근 권한을 확인해야 합니다.": [
    "OpenAI access is not permitted. The server's model access permissions need checking.",
    "没有OpenAI访问权限。需要检查服务器的模型访问权限。",
    "OpenAIへのアクセス権限がありません。サーバーのモデルアクセス権限の確認が必要です。"
  ],
  "설정된 모델을 사용할 수 없습니다.": [
    "The configured model is unavailable.",
    "无法使用已配置的模型。",
    "設定されたモデルを利用できません。"
  ],
  "OpenAI 사용 한도가 소진되었습니다.": [
    "The OpenAI usage limit has been reached.",
    "已达到OpenAI使用限额。",
    "OpenAIの利用上限に達しました。"
  ],
  "Pongdang의 AI 일일 예산 한도에 도달했습니다.": [
    "Pongdang's daily AI budget limit has been reached.",
    "已达到Pongdang的AI每日预算限额。",
    "PongdangのAIの1日あたりの予算上限に達しました。"
  ],
  "AI 처리 시간이 초과되었습니다.": [
    "AI processing timed out.",
    "AI处理超时。",
    "AI処理がタイムアウトしました。"
  ],
  "다른 AI 요청을 처리 중입니다. 잠시 후 다시 시도해 주세요.": [
    "Another AI request is being processed. Please try again shortly.",
    "正在处理其他AI请求。请稍后重试。",
    "別のAIリクエストを処理中です。しばらくしてからお試しください。"
  ],
  "AI 요청 빈도 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.": [
    "The AI request rate limit has been reached. Please try again shortly.",
    "已达到AI请求频率限制。请稍后重试。",
    "AIのリクエスト頻度の上限に達しました。しばらくしてからお試しください。"
  ],
  "사용자별 AI 요청 한도에 도달했습니다.": [
    "Your per-user AI request limit has been reached.",
    "已达到单个用户的AI请求限额。",
    "ユーザーごとのAIリクエスト上限に達しました。"
  ],
  "AI 요청 전체 처리 시간이 초과되었습니다.": [
    "The total time limit for the AI request was exceeded.",
    "AI请求的总处理时间已超限。",
    "AIリクエスト全体の処理時間を超過しました。"
  ],
  "OpenAI에 연결하지 못했습니다.": [
    "Could not connect to OpenAI.",
    "无法连接到OpenAI。",
    "OpenAIに接続できませんでした。"
  ],
  "OpenAI 서비스를 일시적으로 사용할 수 없습니다.": [
    "The OpenAI service is temporarily unavailable.",
    "OpenAI服务暂时不可用。",
    "OpenAIのサービスを一時的に利用できません。"
  ],
  "로컬 테스트 세션이 없거나 만료됐습니다. 로컬 실행 명령으로 세션을 다시 열어 주세요.": [
    "The local test session is missing or expired. Reopen it using the local launch command.",
    "本地测试会话不存在或已过期。请使用本地启动命令重新开启会话。",
    "ローカルテストのセッションがないか、有効期限が切れています。ローカル起動コマンドでセッションを開き直してください。"
  ],
  "Pongdang의 SSO 로그인 연동이 설정되지 않아 개인 요청을 처리할 수 없습니다. 운영자의 로그인 연동 설정이 필요합니다. 기존 데이터 조회 화면은 계속 이용할 수 있습니다.": [
    "Personal requests cannot be processed because Pongdang's SSO sign-in integration is not configured. An operator must configure it. Existing data browsing remains available.",
    "Pongdang尚未配置SSO登录集成，无法处理个人请求。需要管理员完成登录集成配置。仍可使用现有资料浏览页面。",
    "PongdangのSSOログイン連携が未設定のため、個人のリクエストを処理できません。運用者によるログイン連携の設定が必要です。既存のデータ閲覧画面は引き続き利用できます。"
  ],
  "Pongdang의 SSO 로그인 연동에서 허용할 요청 출처가 설정되지 않아 개인 요청을 전송할 수 없습니다. 운영자의 로그인 연동 설정이 필요합니다. 기존 데이터 조회 화면은 계속 이용할 수 있습니다.": [
    "Personal requests cannot be sent because allowed request origins are not configured for Pongdang's SSO integration. An operator must configure the sign-in integration. Existing data browsing remains available.",
    "Pongdang的SSO登录集成尚未配置允许的请求来源，无法发送个人请求。需要管理员完成登录集成配置。仍可使用现有资料浏览页面。",
    "PongdangのSSOログイン連携で許可するリクエスト元が未設定のため、個人のリクエストを送信できません。運用者によるログイン連携の設定が必要です。既存のデータ閲覧画面は引き続き利用できます。"
  ],
  "로그인이 필요합니다. 기존 SSO 로그인을 확인한 뒤 다시 시도해 주세요.": [
    "Sign-in is required. Check your existing SSO sign-in and try again.",
    "需要登录。请确认现有SSO登录状态后重试。",
    "ログインが必要です。既存のSSOログインを確認してからお試しください。"
  ],
  "질문과 장소·시간 조건을 확인해 주세요.": [
    "Check your question and the place and time conditions.",
    "请检查问题及地点、时间条件。",
    "質問と場所・時間の条件をご確認ください。"
  ],
  "요청을 완료하지 못했습니다. 기존 자료 조회를 이용하거나 다시 시도해 주세요.": [
    "The request could not be completed. Browse existing data or try again.",
    "无法完成请求。请浏览现有资料或重试。",
    "リクエストを完了できませんでした。既存の資料閲覧を利用するか、もう一度お試しください。"
  ],
  "서버 응답을 확인할 수 없습니다. 다시 시도해 주세요.": [
    "The server response could not be verified. Please try again.",
    "无法确认服务器响应。请重试。",
    "サーバーの応答を確認できません。もう一度お試しください。"
  ],
  "현재 SSO 계정에 Pongdang 접근 권한이 없습니다. 운영자에게 접근 권한을 확인해 주세요. 공개 자료가 보여도 개인 자료 접근이 확인된 것은 아닙니다.": [
    "Your current SSO account does not have access to Pongdang. Ask the operator to check your access permissions. Being able to view public data does not confirm access to personal data.",
    "当前SSO账号没有Pongdang访问权限。请联系管理员确认权限。能够查看公开资料并不代表已确认可访问个人资料。",
    "現在のSSOアカウントにはPongdangへのアクセス権限がありません。運用者にアクセス権限をご確認ください。公開資料が表示されても、個人資料へのアクセスが確認されたわけではありません。"
  ],
  "현재 접속 주소에서 보낸 요청이 허용되지 않았습니다. 기존 SSO로 접속한 서비스 주소인지 확인해 주세요. 계속되면 운영자가 허용 출처(Origin)를 확인해야 합니다. 공개 자료가 보여도 개인 자료 접근이 확인된 것은 아닙니다.": [
    "Requests from your current address were not allowed. Check that you opened the service address through the existing SSO. If the issue persists, an operator must check the allowed origins. Being able to view public data does not confirm access to personal data.",
    "来自当前访问地址的请求未获允许。请确认是否通过现有SSO访问服务地址。如问题持续，管理员需要检查允许的来源（Origin）。能够查看公开资料并不代表已确认可访问个人资料。",
    "現在の接続先アドレスからのリクエストは許可されませんでした。既存のSSOから接続したサービスのアドレスかご確認ください。続く場合は運用者が許可元（Origin）を確認する必要があります。公開資料が表示されても、個人資料へのアクセスが確認されたわけではありません。"
  ],
  "다른 사이트에서 보낸 요청으로 판단되어 처리하지 못했습니다. 기존 SSO로 서비스에 직접 접속한 뒤 다시 시도해 주세요. 공개 자료가 보여도 개인 자료 접근이 확인된 것은 아닙니다.": [
    "The request was identified as coming from another site and could not be processed. Open the service directly through the existing SSO and try again. Being able to view public data does not confirm access to personal data.",
    "该请求被判定为来自其他网站，无法处理。请通过现有SSO直接访问服务后重试。能够查看公开资料并不代表已确认可访问个人资料。",
    "別のサイトからのリクエストと判断されたため処理できませんでした。既存のSSOからサービスに直接接続し、もう一度お試しください。公開資料が表示されても、個人資料へのアクセスが確認されたわけではありません。"
  ],
  "개인 요청의 접근이 거부됐습니다. 기존 SSO 세션과 접속 주소를 확인하고, 계속되면 운영자에게 권한·허용 출처 확인을 요청해 주세요. 공개 자료가 보여도 개인 자료 접근이 확인된 것은 아닙니다.": [
    "Access for the personal request was denied. Check your existing SSO session and service address. If the issue persists, ask the operator to check permissions and allowed origins. Being able to view public data does not confirm access to personal data.",
    "个人请求被拒绝访问。请检查现有SSO会话及访问地址；如问题持续，请联系管理员确认权限和允许的来源。能够查看公开资料并不代表已确认可访问个人资料。",
    "個人リクエストのアクセスが拒否されました。既存のSSOセッションと接続先アドレスを確認し、続く場合は運用者に権限・許可元の確認を依頼してください。公開資料が表示されても、個人資料へのアクセスが確認されたわけではありません。"
  ],
  "연동 미설정 · 서버에 Windy Webcams API 키가 필요합니다.": [
    "Integration not configured · The server needs a Windy Webcams API key.",
    "尚未配置集成 · 服务器需要Windy Webcams API密钥。",
    "連携が未設定です · サーバーにWindy Webcams APIキーが必要です。"
  ],
  "Windy API 키 형식이 잘못되었습니다. 서버의 키 설정을 확인해 주세요.": [
    "The Windy API key format is invalid. Check the server's key configuration.",
    "Windy API密钥格式无效。请检查服务器密钥配置。",
    "Windy APIキーの形式が正しくありません。サーバーのキー設定をご確認ください。"
  ],
  "Windy 인증에 실패했습니다. 서버에 Webcams API 전용 키를 설정했는지 확인해 주세요.": [
    "Windy authentication failed. Check that a dedicated Webcams API key is configured on the server.",
    "Windy身份验证失败。请确认服务器已配置Webcams API专用密钥。",
    "Windyの認証に失敗しました。サーバーにWebcams API専用キーが設定されているかご確認ください。"
  ],
  "Windy가 접근을 거절했습니다. 서버의 Webcams API 키 권한을 확인해 주세요.": [
    "Windy denied access. Check the permissions of the server's Webcams API key.",
    "Windy拒绝了访问。请检查服务器Webcams API密钥的权限。",
    "Windyがアクセスを拒否しました。サーバーのWebcams APIキーの権限をご確認ください。"
  ],
  "Windy 요청 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.": [
    "The Windy request limit has been reached. Please try again shortly.",
    "已达到Windy请求限额。请稍后重试。",
    "Windyのリクエスト上限に達しました。しばらくしてからお試しください。"
  ],
  "이전 조회 실패 후 재시도를 기다리고 있습니다.": [
    "Waiting to retry after the previous request failed.",
    "上次查询失败后，正在等待重试。",
    "前回の照会失敗後、再試行を待っています。"
  ],
  "퐁당 서버에 설정된 오늘의 웹캠 조회 한도를 사용했습니다.": [
    "Today's webcam request limit configured on the Pongdang server has been used.",
    "已用完Pongdang服务器设定的今日摄像头查询限额。",
    "Pongdangサーバーで設定された本日のウェブカメラ照会上限を使い切りました。"
  ],
  "Windy 연결에 실패했거나 응답 시간이 초과됐습니다.": [
    "The Windy connection failed or timed out.",
    "Windy连接失败或响应超时。",
    "Windyへの接続に失敗したか、応答がタイムアウトしました。"
  ],
  "Windy 서버 오류로 웹캠 목록을 불러오지 못했습니다.": [
    "The webcam list could not be loaded because of a Windy server error.",
    "由于Windy服务器错误，无法加载摄像头列表。",
    "Windyサーバーのエラーでウェブカメラ一覧を読み込めませんでした。"
  ],
  "Windy 서비스를 일시적으로 사용할 수 없습니다.": [
    "The Windy service is temporarily unavailable.",
    "Windy服务暂时不可用。",
    "Windyのサービスを一時的に利用できません。"
  ],
  "Windy 서버의 응답 시간이 초과됐습니다.": [
    "The Windy server response timed out.",
    "Windy服务器响应超时。",
    "Windyサーバーの応答がタイムアウトしました。"
  ],
  "웹캠 요청 주소를 확인하지 못했습니다. 퐁당 페이지를 새로고침해 주세요.": [
    "The webcam request address could not be verified. Refresh the Pongdang page.",
    "无法确认摄像头请求地址。请刷新Pongdang页面。",
    "ウェブカメラのリクエスト先を確認できませんでした。Pongdangのページを再読み込みしてください。"
  ],
  "다른 웹캠 조회가 진행 중입니다. 잠시 후 다시 시도해 주세요.": [
    "Another webcam request is in progress. Please try again shortly.",
    "正在进行其他摄像头查询。请稍后重试。",
    "別のウェブカメラ照会が進行中です。しばらくしてからお試しください。"
  ],
  "좌표 없음 · 이 장소의 주변 카메라를 검색할 수 없습니다.": [
    "No coordinates · Cannot search for cameras near this place.",
    "无坐标 · 无法搜索此地点附近的摄像头。",
    "座標なし · この場所の周辺カメラを検索できません。"
  ],
  "선택한 해수욕장·계곡을 찾을 수 없습니다.": [
    "The selected beach or valley could not be found.",
    "找不到所选海滩或山谷。",
    "選択した海水浴場・渓谷が見つかりません。"
  ],
  "초": [
    "sec",
    "秒",
    "秒"
  ],
  "분": [
    "min",
    "分钟",
    "分"
  ],
  " 약 {count}{unit} 후 다시 조회할 수 있습니다.": [
    " You can try again in about {count} {unit}.",
    " 约{count}{unit}后可以再次查询。",
    " 約{count}{unit}後に再照会できます。"
  ],
  "로그인 또는 접근 권한을 확인해 주세요. 다시 로그인한 뒤 웹캠 목록을 열어 주세요.": [
    "Check your sign-in or access permissions. Sign in again, then open the webcam list.",
    "请检查登录状态或访问权限。重新登录后再打开摄像头列表。",
    "ログインまたはアクセス権限をご確認ください。再度ログインしてからウェブカメラ一覧を開いてください。"
  ],
  "저장된 웹캠 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.": [
    "The saved webcam list could not be loaded. Please try again shortly.",
    "无法加载已保存的摄像头列表。请稍后重试。",
    "保存されたウェブカメラ一覧を読み込めませんでした。しばらくしてから再試行してください。",
  ],
  "웹캠 조회에 실패했습니다. 잠시 후 다시 시도해 주세요.": [
    "The webcam request failed. Please try again shortly.",
    "摄像头查询失败。请稍后重试。",
    "ウェブカメラの照会に失敗しました。しばらくしてからお試しください。"
  ],
  "웹캠 조회 시간이 초과됐거나 요청이 취소됐습니다. 잠시 후 다시 불러와 주세요.": [
    "The webcam request timed out or was cancelled. Please reload shortly.",
    "摄像头查询超时或请求已取消。请稍后重新加载。",
    "ウェブカメラ照会がタイムアウトしたか、キャンセルされました。しばらくしてから再読み込みしてください。"
  ],
  "퐁당 웹캠 서버에 연결하지 못했습니다. 인터넷 연결과 로그인 상태를 확인한 뒤 다시 불러와 주세요.": [
    "Could not connect to Pongdang's webcam server. Check your internet connection and sign-in status, then reload.",
    "无法连接到Pongdang摄像头服务器。请确认网络连接及登录状态后重新加载。",
    "Pongdangのウェブカメラサーバーに接続できませんでした。インターネット接続とログイン状態を確認してから再読み込みしてください。"
  ],
  "웹캠 응답 형식을 확인할 수 없습니다.": [
    "The webcam response format could not be verified.",
    "无法确认摄像头响应格式。",
    "ウェブカメラの応答形式を確認できません。"
  ],
  "카카오 지도 JavaScript 키가 설정되지 않았습니다.": [
    "The Kakao Maps JavaScript key is not configured.",
    "尚未配置Kakao地图JavaScript密钥。",
    "KakaoマップのJavaScriptキーが設定されていません。"
  ],
  "지도는 브라우저에서 열 수 있습니다.": [
    "The map can be opened in a browser.",
    "可以在浏览器中打开地图。",
    "地図はブラウザで開けます。"
  ],
  "지도 설정이 변경되었습니다. 페이지를 새로고침해 주세요.": [
    "The map settings have changed. Refresh the page.",
    "地图设置已更改。请刷新页面。",
    "地図の設定が変更されました。ページを再読み込みしてください。"
  ],
  "카카오 지도를 불러오지 못했습니다. 연결 상태와 지도 키·허용 도메인 설정을 확인해 주세요.": [
    "Could not load Kakao Maps. Check the connection, map key, and allowed-domain settings.",
    "无法加载Kakao地图。请检查连接、地图密钥及允许的域名设置。",
    "Kakaoマップを読み込めませんでした。接続状態と地図キー・許可ドメインの設定をご確認ください。"
  ],
  "카카오 지도 응답이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.": [
    "Kakao Maps is taking longer to respond. Please try again shortly.",
    "Kakao地图响应延迟。请稍后重试。",
    "Kakaoマップの応答が遅れています。しばらくしてからお試しください。"
  ],
  "지도 열기가 취소되었습니다.": [
    "Opening the map was cancelled.",
    "已取消打开地图。",
    "地図を開く操作がキャンセルされました。"
  ]
};

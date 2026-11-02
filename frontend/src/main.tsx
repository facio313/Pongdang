import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { resumeAfterLogin } from "./loginPopoverState";
import { invalidateResources } from "./resourceRefresh";
import { LoginPopoverProvider } from "./loginPopover";
import "@fontsource-variable/noto-sans-kr";
import "./styles.css";
// 제품 화면 5개의 공용 토큰·기본형. styles.css 뒤에 와야 main 패딩을 덮습니다.
import "./pongdang.css";
import { initializeArchive } from "./archiveRuntime.ts";

// Restore the original page after the domain's OAuth2 callback.
resumeAfterLogin();
// Back from a cancelled/failed login can restore a frozen page. Recheck its
// private reads too, without treating the browser navigation as login success.
window.addEventListener("pageshow", (event) => {
  if (event.persisted) invalidateResources();
});

const root = createRoot(document.getElementById("root")!);
void initializeArchive(import.meta.env.BASE_URL).then(() => {
  root.render(<StrictMode><LoginPopoverProvider><App /></LoginPopoverProvider></StrictMode>);
}).catch(() => {
  root.render(<main><h1>자료를 불러오지 못했습니다</h1><p>운영 모드를 확인하지 못해 조회를 중지했습니다. 잠시 후 페이지를 다시 열어 주세요.</p></main>);
});

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { resumeAfterLogin } from "./loginPopoverState";
import { invalidateResources } from "./resourceRefresh";
import "@fontsource-variable/noto-sans-kr";
import "./styles.css";
// 제품 화면 5개의 공용 토큰·기본형. styles.css 뒤에 와야 main 패딩을 덮습니다.
import "./pongdang.css";

// Restore the original page after the domain's OAuth2 callback.
resumeAfterLogin();
// Back from a cancelled/failed login can restore a frozen page. Recheck its
// private reads too, without treating the browser navigation as login success.
window.addEventListener("pageshow", (event) => {
  if (event.persisted) invalidateResources();
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

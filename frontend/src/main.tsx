import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { resumeAfterLogin } from "./loginPopover";
import "@fontsource-variable/noto-sans-kr";
import "./styles.css";
// 제품 화면 5개의 공용 토큰·기본형. styles.css 뒤에 와야 main 패딩을 덮습니다.
import "./pongdang.css";

// `/auth/continue` 는 SSO 를 통과해야만 도달하는 경로입니다. 여기 있다는 것은
// 로그인이 막 끝났다는 뜻이므로, 남겨 둔 화면으로 즉시 되돌립니다.
resumeAfterLogin();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

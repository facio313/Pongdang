import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "@fontsource-variable/noto-sans-kr";
import "./styles.css";
// 제품 화면 5개의 공용 토큰·기본형. styles.css 뒤에 와야 main 패딩을 덮습니다.
import "./pongdang.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

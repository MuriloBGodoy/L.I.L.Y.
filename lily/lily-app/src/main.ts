import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  React.createElement(
    React.StrictMode,
    null,
    React.createElement(App),
  ),
);

// Instalacao como PWA so na web publicada: no `vite dev` o cache atrapalharia
// o hot reload, e no desktop o Tauri ja e o app instalado.
const noTauri = Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
if (import.meta.env.PROD && !noTauri && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Sem service worker o app funciona igual, so nao fica instalavel.
    });
  });
}

import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { registerServiceWorker } from "./app/registerServiceWorker";
import { router } from "./app/router";
import { AuthProvider } from "./context/AuthContext";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </React.StrictMode>,
);

// Handle dynamic import chunk mismatch when a new version is deployed
window.addEventListener("vite:preloadError", () => {
  const key = "kash_last_preload_reload";
  const last = sessionStorage.getItem(key);
  const now = Date.now();
  if (!last || now - Number(last) > 10_000) {
    sessionStorage.setItem(key, String(now));
    window.location.reload();
  }
});

registerServiceWorker();

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./RedesignedApp.jsx";

// Keep the PWA service worker out of development and scope it to the current
// Vite base path (GitHub Pages uses /AsiaMedicorp-IMS/; previews use /).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
      })
      .catch((error) => {
        console.error("Asia Medicorp IMS service worker registration failed:", error);
      });
  });
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);

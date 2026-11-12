import React from "react";
import { createRoot } from "react-dom/client";
import LoveRadar from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("Root element missing");
createRoot(root).render(<React.StrictMode><LoveRadar/></React.StrictMode>);

if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", {scope:"/"}).catch((error) => {
      console.warn("Love Radar: installation hors ligne indisponible", error);
    });
  });
}

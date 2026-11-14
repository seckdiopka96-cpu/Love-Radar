import React from "react";
import { createRoot } from "react-dom/client";
import LoveRadar from "./App";
import {isNativeApp} from "./api";
import {initializeNativePrivacy} from "./native-privacy";

const root = document.getElementById("root");
if (!root) throw new Error("Root element missing");
initializeNativePrivacy();
createRoot(root).render(<React.StrictMode><LoveRadar/></React.StrictMode>);

if (import.meta.env.PROD && !isNativeApp && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", {scope:"/"}).catch((error) => {
      console.warn("Love Radar: installation hors ligne indisponible", error);
    });
  });
}

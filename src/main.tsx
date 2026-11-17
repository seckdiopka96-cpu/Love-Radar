import React from "react";
import { createRoot } from "react-dom/client";
import LoveRadar from "./App";
import LaunchSplash from "./LaunchSplash";
import {isNativeApp} from "./api";
import {initializeNativePrivacy} from "./native-privacy";
import {initializeMotionMode} from "./motion-mode";

const root = document.getElementById("root");
if (!root) throw new Error("Root element missing");
initializeNativePrivacy();
initializeMotionMode();
createRoot(root).render(<React.StrictMode><LoveRadar/><LaunchSplash/></React.StrictMode>);

if (import.meta.env.PROD && !isNativeApp && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", {scope:"/"}).then(registration=>registration.update()).catch((error) => {
      console.warn("Love Radar: installation hors ligne indisponible", error);
    });
  });
}

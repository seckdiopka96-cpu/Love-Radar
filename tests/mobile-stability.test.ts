import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const css=readFileSync("src/mobile-stability.css","utf8");
const app=readFileSync("src/App.tsx","utf8");
const team=readFileSync("src/team-games.css","utf8");
const shell=readFileSync("src/love-radar.css","utf8");
const room=readFileSync("src/ludo-room.css","utf8");
const frame=readFileSync("src/ludo-senegal-shared.css","utf8");

test("mobile guards load last without changing premium colors or chat composer",()=>{
 const mobileImport=app.indexOf('import "./mobile-stability.css";');
 assert.ok(mobileImport>0,"mobile CSS must be imported");
 assert.ok(mobileImport>app.indexOf('import "./party-viewport.css";'),
  "final layout guards need to follow the existing premium viewport overrides");
 assert.ok(!css.includes(".lr-chat-compose"),"never displace the keyboard-sensitive chat composer");
 assert.ok(!css.includes(".lr-mobile-nav"),"existing premium dock offsets remain unchanged");
 assert.ok(!css.includes(".ludo-senegal-shared-iframe"),"Duo uses its existing Classic frame");
 assert.ok(team.includes(".lr-team-board-shell"),"the premium 2v2 board is retained");
 assert.ok(frame.includes(".ludo-duo-shared-iframe"),"Senegal still uses the single Classic renderer");
});
test("two-versus-two stays within immersive iPhone and Android viewport without cutting controls",()=>{
 assert.ok(shell.includes(".lr-app.lr-ludo-mode.lr-app-locked{position:fixed"),
  "immersive Ludo retains its non-scrolling outer app shell");
 assert.ok(css.includes(".lr-app.lr-app-locked.lr-team-mode .lr-team-screen{"));
 assert.ok(css.includes("height:100%;min-height:0;max-height:100%"));
 assert.ok(css.includes("overflow-x:hidden;overflow-y:auto"));
 assert.ok(css.includes("overscroll-behavior:contain;-webkit-overflow-scrolling:touch"));
 assert.ok(css.includes("scroll-behavior:auto;touch-action:pan-y"));
 assert.ok(css.includes("scroll-padding-bottom:16px"),"Ludo menu is internally scrollable");
 assert.ok(css.includes(".lr-app.lr-team-mode .lr-team-quiz{"));
 assert.ok(css.includes("flex:0 0 auto;min-height:0;justify-content:flex-start"),
  "quiz buttons must not be clipped by flex container shrink");
 assert.ok(css.includes("max-height:calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom) - 20px)"),
  "modals stay visible above system gesture areas");
});
test("status bar and notch cannot overlap Ludo back or top action buttons",()=>{
 assert.ok(css.includes("grid-template-columns:64px minmax(0,1fr) 64px"),
  "both side controls are symmetric around the title");
 assert.ok(css.includes("height:44px;min-height:44px"),"back and top controls have an accessible tap target");
 assert.ok(css.includes("padding:max(14px,calc(env(safe-area-inset-top) + 10px))"));
 assert.ok(css.includes("@supports (-webkit-touch-callout:none)"));
 assert.ok(css.includes("(display-mode:standalone)"),
  "the fallback notch inset is only for standalone iOS");
 assert.ok(css.includes("padding-top:max(52px,calc(env(safe-area-inset-top) + 10px))!important"));
 assert.ok(css.includes("max-width:360px"),"small iPhones receive a separate narrow layout");
 assert.ok(css.includes(".lr-app.lr-team-mode input:not([type=\"checkbox\"])"));
 assert.ok(css.includes("font-size:16px!important"),"iOS invitation input does not trigger page zoom");
});
test("Ludo board is touch-stable and resistant to Safari address bar height changes",()=>{
 assert.ok(css.includes("width:min(calc(100% - 10px),53svh)!important"));
 assert.ok(css.includes("width:min(calc(100% - 12px),48svh)!important"));
 assert.ok(!css.includes("53dvh")&&!css.includes("48dvh"),
  "board size must not jump when mobile browser toolbars open or close");
 assert.ok(css.includes("height:auto;aspect-ratio:1/1"));
 assert.ok(css.includes("touch-action:none"));
 assert.ok(css.includes(".lr-app.lr-team-mode .lr-team-pin{"));
 assert.ok(css.includes("touch-action:manipulation"),"pawn buttons remain directly tappable");
 assert.ok(room.includes("overflow-y:auto"),"menu can scroll on very short phones");
 assert.ok(css.includes(".lr-app.lr-ludo-mode .lr-main>.lr-ludo-room{"));
 assert.ok(css.includes("scroll-padding-bottom:16px"));
 assert.ok(css.includes("(prefers-reduced-motion:reduce)"));
});

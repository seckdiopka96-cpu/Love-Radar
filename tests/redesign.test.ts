import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const app=readFileSync("src/App.tsx","utf8");
const home=readFileSync("src/HomeDashboard.tsx","utf8");
const design=readFileSync("src/redesign.css","utf8");
const feature=readFileSync("src/redesign-features.css","utf8");
const watch=readFileSync("src/watch-together.css","utf8");
const tiktok=readFileSync("src/tiktok-together.css","utf8");
const manifest=JSON.parse(readFileSync("public/manifest.webmanifest","utf8")) as {theme_color:string;background_color:string};

test("Love Radar redesign styles are activated last without displacing feature modules",()=>{
 assert.ok(app.includes('import "./redesign.css";'));
 assert.ok(app.includes('import "./redesign-features.css";'));
 assert.ok(app.indexOf('import "./redesign.css";')>app.indexOf('import PrivatePhoto from "./PrivatePhoto";'));
 assert.ok(app.indexOf('import "./redesign-features.css";')>app.indexOf('import "./redesign.css";'));
 assert.ok(app.includes('import VoiceCall from "./VoiceCall";'));
 assert.ok(app.includes('import TikTokTogether from "./TikTokTogether";'));
 assert.ok(app.includes('import Reconcile from "./Reconcile";'));
 assert.ok(app.includes('import SharedPuzzle from "./SharedPuzzle";'));
});
test("five navigational destinations use coherent vector icons, not emoji labels",()=>{
 assert.ok(app.includes('function NavGlyph({tab}:{tab:Tab})'));
 assert.equal((app.match(/<NavGlyph tab=\{n.id\}\/>/g)||[]).length,2);
 for(const label of ['Accueil','Messages','Nous deux','Jeux','Souvenirs'])
  assert.ok(app.includes('label:"'+label+'"'));
 assert.equal((app.match(/label:"/g)||[]).length>=5,true);
 assert.ok(app.includes('className="lr-nav-symbol"'));
 assert.equal(app.includes('n.icon'),false);
});
test("redesigned home provides quick access to core couple activities",()=>{
 assert.ok(home.includes('className="lr-home-welcome"'));
 assert.ok(home.includes('className="lr-home-quick"'));
 for(const route of ["chat","watch","reconcile"])
  assert.ok(home.includes('onNavigate("'+route+'")'));
 for(const label of ["Écrire","Regarder","S’écouter"])
  assert.ok(home.includes(label));
 assert.ok(home.includes('className="lr-home-section-heading"'));
 assert.ok(home.includes('className="lr-home-daily"'));
});
test("design colors are consistent and have no self-referential CSS vars",()=>{
 assert.ok(design.includes("--lr-night:#091520;"));
 assert.ok(design.includes("--lr-rose:#ff7292;"));
 assert.ok(design.includes("--lr-sunset:#ffc6a1;"));
 assert.ok(design.includes(".lr-chat-messages"));
 assert.ok(feature.includes(".lr-call-sheet"));
 assert.ok(feature.includes(".lr-games-choice"));
 assert.ok(feature.includes(".rc-page"));
 assert.ok(feature.includes(".wt-page,.tk-page"));
 assert.equal(design.includes("--lr-rose:var(--lr-rose)"),false);
 assert.equal(manifest.theme_color,"#091520");
 assert.equal(manifest.background_color,"#091520");
});
test("iPhone redesign preserves fixed shell, no-scroll players and call keyboard usability",()=>{
 assert.ok(feature.includes(".lr-app.lr-app-locked .lr-mobile-nav"));
 assert.ok(feature.includes("env(safe-area-inset-bottom)"));
 assert.ok(feature.includes(".lr-app.lr-app-locked.lr-keyboard-open .lr-shell"));
 assert.ok(feature.includes(".lr-app.lr-watch-mode.lr-app-locked .lr-shell"));
 assert.ok(feature.includes(".lr-app.lr-puzzle-mode.lr-app-locked .lr-shell"));
 assert.ok(watch.includes(".wt-body{display:flex!important;"));
 assert.ok(tiktok.includes("overflow:hidden!important;overscroll-behavior:none!important;"));
 assert.ok(app.includes('showButton={tab==="chat"||tab==="watch"||tab==="watch-tiktok"||tab==="reconcile"}'));
});

test("minimal header removes the unnecessary heart and relocates notification controls to settings",()=>{
 const shell=readFileSync("src/polished-shell.css","utf8");
 assert.ok(app.includes('className="lr-header-context"'));
 assert.ok(!app.includes('className="lr-brand-emblem"'));
 assert.ok(app.includes('id="lr-settings-menu"'));
 assert.ok(app.includes('aria-expanded={menu}'));
 assert.ok(app.includes('className="lr-menu-notifications"'));
 assert.ok(!app.includes('className="lr-notification-area"'));
 assert.ok(app.includes('setMenu(false)'));
 assert.ok(shell.includes('.lr-menu-notification-actions'));
 assert.ok(shell.includes('.lr-header-context>strong'));
});
test("premium dock anchors to the viewport and reserves scrolling space for home content",()=>{
 const shell=readFileSync("src/polished-shell.css","utf8");
 assert.ok(app.includes('import "./polished-shell.css";'));
 assert.ok(shell.includes('position:fixed!important'));
 assert.ok(shell.includes('env(safe-area-inset-bottom)'));
 assert.ok(shell.includes('padding:0 0 calc(94px + env(safe-area-inset-bottom))'));
 assert.ok(shell.includes('lr-app.lr-app-locked.lr-chat-mode .lr-shell'));
 assert.ok(shell.includes('prefers-reduced-motion:reduce'));
 const quick=home.match(/lr-home-quick-icon" aria-hidden="true"><svg/g)||[];
 assert.equal(quick.length,3,"quick links use coherent vector icons");
});
test("unchanged snapshots do not redraw the full dashboard and home requests cannot overlap",()=>{
 assert.ok(app.includes('JSON.stringify(previous)===JSON.stringify(nextRoom)?previous:nextRoom'));
 assert.ok(app.includes('tab==="chat"?1050:5000'));
 assert.ok(app.includes('return items.filter(item=>!received.has(item.id))'));
 assert.ok(home.includes('if(!alive||pending||document.visibilityState!=="visible")return'));
 assert.ok(home.includes('if(!active||pending||document.visibilityState==="hidden")return'));
 assert.ok(home.includes('finally{pending=false}'));
});

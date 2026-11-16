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
test("Souvenirs occupies the second slot and Messages the fifth on both navigation bars",()=>{
 const block=app.match(/const NAV: \{id:Tab;label:string\}\[\] = \[([\s\S]*?)\];/)?.[1]||"";
 const items=[...block.matchAll(/\{id:"([^"]+)",label:"([^"]+)"\}/g)].map(match=>[match[1],match[2]]);
 assert.deepEqual(items,[
  ["home","Accueil"],["memories","Souvenirs"],["together","Nous deux"],
  ["games","Jeux"],["chat","Messages"]
 ]);
 assert.ok(app.includes("NAV.map(n=><button"),"both navigation surfaces reuse same mapping");
 assert.ok(app.includes("onClick={()=>navigate(n.id)}"),"each tab still opens its original destination");
 assert.ok(app.includes('n.id==="chat"&&unreadCount>0'),"unread message badge stays on Messages");
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
 const settings=readFileSync("src/SettingsPage.tsx","utf8");
 assert.ok(app.includes('tab==="settings"?<SettingsPage'));
 assert.ok(app.includes('aria-label={tab==="settings"?"Retour à l’accueil":"Ouvrir les paramètres"}'));
 assert.ok(settings.includes('className="lr-settings-section"'));
 assert.ok(settings.includes('notificationsOn'));
 assert.ok(settings.includes('onPrivacyChange'));
 assert.ok(settings.includes('onRemovePhoto'));
 assert.ok(settings.includes('onDeleteRoom'));
 assert.ok(!app.includes('id="lr-settings-menu"'));
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
 assert.ok(app.includes('tab==="chat"?15000:30000'));
 assert.ok(app.includes('data.revision!==roomRevisionRef.current'));
 assert.ok(app.includes('return items.filter(item=>!received.has(item.id))'));
 assert.ok(home.includes('if(!alive||pending||document.visibilityState!=="visible")return'));
 assert.ok(home.includes('if(!alive||pending||document.visibilityState!=="visible")return'));
 assert.ok(home.includes('finally{pending=false}'));
});

test("single-surface premium dock has no doubled outlines or active tab capsule",()=>{
 const dock=readFileSync("src/premium-dock.css","utf8");
 assert.ok(app.includes('import "./premium-dock.css";'),"Final dock stylesheet must be loaded");
 assert.ok(dock.includes('position:fixed!important'));
 assert.ok(dock.includes('bottom:calc(10px + env(safe-area-inset-bottom))'));
 assert.ok(dock.includes('border:1px solid rgba(209,222,237,.17)!important'));
 assert.ok(dock.includes('background:rgba(28,39,55,.86)!important'));
 assert.ok(dock.includes('.lr-mobile-nav::before,'));
 assert.ok(dock.includes('.lr-mobile-nav::after{'));
 assert.ok(dock.includes('content:none!important'));
 assert.ok(dock.includes('.lr-mobile-nav button::after{'));
 assert.ok(dock.includes('.lr-mobile-nav button.active{'));
 assert.ok(dock.includes('.lr-mobile-nav button.active .lr-nav-symbol{'));
 assert.ok(dock.includes('background:transparent!important;'),"Outer tab stays transparent");
 assert.ok(dock.includes('background:linear-gradient(145deg,#dc86ab,#b75a86)!important;'),"Only active icon receives pink highlight");
 assert.ok(dock.includes('padding-bottom:calc(88px + env(safe-area-inset-bottom))'),"Content reserves room for dock");
 assert.ok(dock.includes('@media (max-width:365px)'),"Fits narrow phones");
 assert.ok(dock.includes('@media (prefers-reduced-motion:reduce)'),"Respects reduced motion");
 const appImports=app.slice(app.indexOf('import "./premium-navigation.css";'),app.indexOf('type AndroidInstallEvent'));
 assert.ok(appImports.lastIndexOf('import "./premium-dock.css";')>appImports.indexOf('import "./polished-shell.css";'),"Single-surface dock is the final style override");
});

test("Nous deux page has a single heart action and four coherent activities",()=>{
 const together=readFileSync("src/Together.tsx","utf8");
 const styles=readFileSync("src/together-premium.css","utf8");
 assert.ok(app.includes('import "./together-premium.css";'));
 assert.ok(together.includes('className="tg-page tg-page-premium"'));
 assert.ok(together.includes('aria-label="Retour à l’accueil"'));
 assert.ok(!together.includes('className="tg-top-heart"'),"Large redundant heart button was removed");
 assert.ok(!together.includes('className="tg-modes"'),"Duplicate send-heart tab was removed");
 assert.equal((together.match(/className="tg-send-heart"/g)||[]).length,1,"Only one love-send action is visible");
 for(const callback of ["onOpenWatch","onOpenMoment","onOpenReunion","onOpenReconcile","onOpenPuzzle"]){
  assert.ok(together.includes("onClick={"+callback+"}"),callback+" remains available");
 }
 assert.ok(together.includes('className="tg-reconcile-entry"'),"Reconciliation is preserved");
 assert.ok(together.includes('signals.slice(-1)'),"Only the most recent note is shown by default");
 assert.ok(together.includes("setShowAll(value=>!value)"),"All notes can be expanded");
 assert.ok(together.includes('canReply(signal)'),"Incoming hearts still support replying");
 assert.ok(styles.includes('grid-template-columns:repeat(2,minmax(0,1fr))'));
 assert.ok(styles.includes('background:#0c1c29!important'),"Mobile background matches main app");
 assert.ok(styles.includes('overflow-y:auto!important'),"Page remains scrollable on iPhone");
 assert.ok(styles.includes('.lr-mobile-nav{'),"Main bottom navigation is preserved");
 assert.ok(styles.includes('display:flex!important'),"Bottom navigation is visible");
 assert.ok(styles.includes('env(safe-area-inset-bottom)'),"Dock-safe page padding");
});

test("readable spacious couple tiles after stale mobile CSS",()=>{
 const legacy=readFileSync("src/together.css","utf8");
 const together=readFileSync("src/Together.tsx","utf8");
 const sw=readFileSync("public/sw.js","utf8");
 assert.ok(together.includes('import "./together-premium.css";'),"Premium styling ships with the component");
 assert.ok(legacy.includes('overflow-y:auto!important'),"Mobile page can scroll instead of clipping");
 assert.ok(legacy.includes('background:#0c1c29!important'),"Mobile screen is midnight blue");
 assert.ok(!legacy.includes('background:linear-gradient(160deg,#302039,#24182e)'),"Old purple background removed");
 assert.ok(!legacy.includes('.lr-sidebar,.lr-app.lr-together-mode.lr-app-locked .lr-mobile-nav{display:none!important}'),"Mobile dock is never hidden by legacy rules");
 assert.ok(legacy.includes('min-height:119px!important'),"Tiles have enough height for stacked text");
 assert.ok(legacy.includes('flex-direction:column!important'),"Title and subtitle stack vertically");
 assert.ok(legacy.includes('gap:14px!important'),"Readable gap between activity tiles");
 assert.ok(legacy.includes('.tg-affection-heading h2'),"Love section retains legible typography");
 assert.ok(legacy.includes('min-width:105px!important'),"Send heart action stays compact");
 assert.ok(sw.includes('love-radar-static-v57'),"Installed iPhones refresh the updated shell cache");
});

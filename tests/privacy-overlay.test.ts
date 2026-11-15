import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const app=readFileSync("src/App.tsx","utf8");
const css=readFileSync("src/love-radar.css","utf8");

test("YouTube and the entire PWA do not display an auto-triggered full-screen privacy mask",()=>{
 for(const fragment of ["lr-private-background-cover","lr-private-curtain","privacyCurtain","setPrivacyCurtain"]){
  assert.equal(app.includes(fragment),false,"App contains old global cover: "+fragment);
  assert.equal(css.includes(fragment),false,"CSS contains old global cover: "+fragment);
 }
 assert.equal(css.includes("Love Radar  ·  Écran masqué"),false);
 assert.equal(app.includes('window.addEventListener("blur",conceal)'),false);
});
test("removing the global mask retains independent photo privacy and YouTube watch",()=>{
 assert.ok(app.includes('<PrivatePhoto'));
 assert.ok(app.includes("privacyEnabled"));
 assert.ok(app.includes('<WatchTogether'));
 assert.ok(app.includes("watch-netflix"));
 assert.ok(css.includes(".lr-home-private-photo"));
});

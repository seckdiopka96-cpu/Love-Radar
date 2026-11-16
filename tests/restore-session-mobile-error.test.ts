import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {recoverSavedSession,persistSessionToken,clearSessionToken,hadPreviousSession} from "../src/session-persistence";
import {connectionErrorMessage} from "../src/network-recovery";

const app=readFileSync("src/App.tsx","utf8");
const session=readFileSync("src/session-persistence.ts","utf8");
const css=readFileSync("src/auth-reconnect.css","utf8");

test("Token can survive reload from existing localStorage and remains opaque",async()=>{
 const values=new Map<string,string>();
 const original=Object.getOwnPropertyDescriptor(globalThis,"localStorage");
 Object.defineProperty(globalThis,"localStorage",{configurable:true,value:{
  getItem:(key:string)=>values.get(key)??null,
  setItem:(key:string,value:string)=>{values.set(key,value)},
  removeItem:(key:string)=>{values.delete(key)}
 }});
 try{
  const token="a".repeat(64);
  persistSessionToken(token);
  assert.equal(await recoverSavedSession(),token);
  assert.equal(hadPreviousSession(),true);
  clearSessionToken();
  assert.equal(values.has("love-radar-token"),false);
  assert.equal(values.has("love-radar-had-session"),true,"returning user hint is not a second credential");
 }finally{
  if(original)Object.defineProperty(globalThis,"localStorage",original);
  else Reflect.deleteProperty(globalThis,"localStorage");
 }
});
test("Invalid tokens are rejected; no recovery secrets are persisted",()=>{
 assert.ok(session.includes('const TOKEN=/^[a-f0-9]{64}$/'));
 assert.ok(session.includes('const DATABASE="love-radar-session-v1"'));
 assert.ok(session.includes('setTimeout(()=>resolve(""),2500)'),"IndexedDB startup is bounded");
 assert.ok(!session.includes("recoveryCode"),"one-time recovery code must never be persisted");
 assert.ok(!session.includes("localStorage.setItem(\"recoveryCode\""));
});
test("Cold start restores a valid old session rather than entering create form",()=>{
 assert.ok(app.includes("void recoverSavedSession().then(saved=>"));
 assert.ok(app.includes("if(saved){"));
 assert.ok(app.includes("setToken(saved)"));
 assert.ok(app.includes("void refresh(saved).finally"));
 assert.ok(app.includes("if(hadPreviousSession()&&!invite)setRecoverMode(true)"));
 assert.ok(app.includes('!room&&token&&!recoverMode?'),"network error stays on retry page, not new account form");
 assert.ok(app.includes("Réessayer la connexion →"));
 assert.ok(app.includes("Utiliser mon code personnel de secours"));
 assert.ok(app.includes("Ne recrée pas un espace"),"never invite an existing member to duplicate a room");
});
test("Only a confirmed HTTP 401 invalidates token; network errors don't delete it",()=>{
 const authIndex=app.indexOf("const refresh=useCallback");
 const start=app.slice(authIndex,authIndex+2700);
 assert.ok(start.includes("if(res.status===401)"));
 assert.ok(start.includes("clearSessionToken();"));
 assert.ok(start.includes("setRecoverMode(true)"));
 assert.ok(start.includes('}catch(e){if(!silent)setError(connectionErrorMessage('),"network errors are recoverable");
 assert.ok(!start.slice(start.indexOf('}catch(e){if(!silent')).includes("clearSessionToken()"),
  "network error doesn't discard credentials");
 assert.ok(app.includes("persistSessionToken(data.token)"),"personal recovery rotates token");
 assert.ok(app.includes("persistSessionToken(newToken)"),"new/join account persisted");
 assert.ok(app.includes("clearSessionToken();setToken(\"\")"),"explicit logout clears local credentials");
});
test("Red reconnect error is readable and positioned inside mobile panel",()=>{
 assert.ok(app.includes("className=\"lr-inline-auth-error\""));
 assert.ok(app.includes('error&&room?<div className="lr-error"'),"no floating auth error outside the welcome panel");
 assert.ok(css.includes("max-width:100%"));
 assert.ok(css.includes("transform:none!important"));
 assert.ok(css.includes("overflow-wrap:anywhere"));
 assert.ok(css.includes(".lr-welcome-mode .lr-auth-panel .lr-inline-auth-error"));
 assert.ok(css.includes(".lr-app.lr-welcome-mode>.lr-error"));
 assert.ok(css.includes("left:12px!important;right:12px!important"),"no negative translated margin on mobile");
});

test("iOS Load failed on mobile data is localized and does not destroy a saved session",()=>{
 assert.match(connectionErrorMessage(new TypeError("Load failed")),/4G\/5G/);
 assert.match(connectionErrorMessage(new TypeError("Failed to fetch")),/Nouvelle tentative automatique/);
 assert.match(connectionErrorMessage(new Error("unexpected"),true),/Connexion trop lente/);
 assert.match(connectionErrorMessage(new Error("unexpected"),false,true),/4G\/5G/);
 assert.equal(connectionErrorMessage(new Error("Erreur serveur")), "Erreur serveur");
 assert.ok(app.includes('window.addEventListener("online",retry)'));
 assert.ok(app.includes('window.addEventListener("pageshow",retry)'));
 assert.ok(app.includes('window.setInterval(retry,15000)'));
 assert.ok(app.includes('if(!token||room||initializing||recoverMode)return;'));
 assert.ok(app.includes('void refresh(undefined,false)'));
 assert.ok(app.includes('Ne recrée pas un espace. Love Radar réessaie automatiquement'));
});

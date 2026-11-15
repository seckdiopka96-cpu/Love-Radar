import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 MAX_RECONCILIATION_TEXT,readReconciliationTexts,
 hasReconciliationMessage,canRevealReconciliation
} from "../src/reconcile-rules";

test("users can describe their hurts in long free-form writing",()=>{
 const value={pain:"Tout ce que je ressens.\n".repeat(600),needs:"J'ai besoin d'être entendu.",message:"Je veux qu'on se comprenne."};
 const accepted=readReconciliationTexts(value);
 assert.deepEqual(accepted,value);
 assert.ok(value.pain.length>5000);
 assert.ok(MAX_RECONCILIATION_TEXT.pain>=16000);
 assert.equal(hasReconciliationMessage(value),true);
 assert.equal(hasReconciliationMessage({pain:"  ",needs:"\n",message:""}),false);
 assert.equal(hasReconciliationMessage({pain:"",needs:"",message:"Je souffre."}),true);
});
test("invalid or oversized reconciliation submissions are rejected",()=>{
 assert.equal(readReconciliationTexts({pain:"a".repeat(MAX_RECONCILIATION_TEXT.pain+1),needs:"",message:""}),null);
 assert.equal(readReconciliationTexts({pain:"",needs:"a".repeat(MAX_RECONCILIATION_TEXT.needs+1),message:""}),null);
 assert.equal(readReconciliationTexts({pain:"",needs:"",message:"a".repeat(MAX_RECONCILIATION_TEXT.message+1)}),null);
 assert.equal(readReconciliationTexts({pain:123,needs:"",message:""}),null);
 assert.equal(readReconciliationTexts({pain:"",needs:"",message:null}),null);
});
test("NO partner disclosures before both explicit submissions and revealed status",()=>{
 for(const status of ["writing","closed","paused","invited"]){
  for(const me of [false,true])for(const partner of [false,true]){
   assert.equal(canRevealReconciliation(status,me,partner),false);
  }
 }
 assert.equal(canRevealReconciliation("revealed",true,false),false);
 assert.equal(canRevealReconciliation("revealed",false,true),false);
 assert.equal(canRevealReconciliation("revealed",false,false),false);
 assert.equal(canRevealReconciliation("revealed",true,true),true);
});
test("reconciliation API returns only own draft until both partners submitted",()=>{
 const api=readFileSync("functions/api/reconcile.ts","utf8");
 assert.ok(api.includes("getEntry(db,session.id,user.id)"));
 assert.ok(api.includes("e.member_id<>?"));
 assert.ok(api.includes("partnerText:ready?"));
 assert.ok(api.includes(":null,"));
 assert.ok(api.includes("canRevealReconciliation"));
 assert.ok(api.includes("couple_reconciliation_entries.submitted=0"));
 assert.ok(api.includes("DELETE FROM couple_reconciliation_entries WHERE session_id=?"));
 assert.ok(api.includes('action==="start"'));
 assert.ok(api.includes('action==="save"')||api.includes('action!=="save"'));
 assert.ok(api.includes('action==="submit"'));
 assert.ok(api.includes('action==="close"'));
 assert.ok(api.includes('notifyPartner(ctx.env'));
 assert.equal(api.includes("console.log(texts)"),false);
});
test("Reconcilation in Love Radar has deep-link, partner invitation and live call",()=>{
 const app=readFileSync("src/App.tsx","utf8");
 const together=readFileSync("src/Together.tsx","utf8");
 const push=readFileSync("functions/lib/push.ts","utf8");
 const sw=readFileSync("public/sw.js","utf8");
 const ui=readFileSync("src/Reconcile.tsx","utf8");
 assert.ok(app.includes('tab==="reconcile"'));
 assert.ok(app.includes('onOpenReconcile={()=>navigate("reconcile")}'));
 assert.ok(app.includes('tab==="watch-tiktok"||tab==="reconcile"'));
 assert.ok(together.includes('className="tg-reconcile-entry"'));
 assert.ok(push.includes('"reconcile"'));
 assert.ok(sw.includes('"puzzle","reconcile"'));
 assert.ok(ui.includes('id="lr-voice-button-slot"'));
 assert.ok(ui.includes('id="rc-pain"'));
 assert.ok(ui.includes('Brouillon privé'));
 assert.ok(ui.includes('setTimeout(()=>{void saveDraft()},1500)'));
 assert.ok(ui.includes('onClick={()=>void close()}'));
});

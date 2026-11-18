import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {plusActive,PLUS_CENTS,PLUS_CURRENCY,subscriptionEnd,verifyStripeSignature,isSafeStripeCheckoutUrl} from "../functions/lib/plus-plan";

test("Discovery has a real guest tour, no room/session creation and playable solo games",()=>{
 const app=readFileSync("src/App.tsx","utf8");
 const discovery=readFileSync("src/DiscoveryMode.tsx","utf8");
 assert.ok(app.includes('!room&&!token&&demoOpen?'),"guest entry must require no authenticated token");
 assert.ok(app.includes("Découvrir Love Radar sans compte"));
 assert.ok(app.includes("<DiscoveryMode onClose="));
 assert.ok(discovery.includes('<LudoSoloEmbedded scope="guest-discovery-v1"'));
 assert.ok(discovery.includes("SIMULATION · AUCUN VRAI MESSAGE"));
 assert.ok(discovery.includes('onClick={()=>choose("quiz")}'));
 assert.ok(discovery.includes("setQuestion(q=>q+1)"));
 assert.ok(discovery.includes("onCreate"));
 assert.ok(discovery.includes("onJoin"));
 assert.ok(!discovery.includes("apiFetch("),"guest demo must not call private server APIs");
 assert.ok(!discovery.includes("setToken("),"guest demo must never create an authenticated session");
});

test("Plus costs 3.99 USD monthly per room and does not replace the free core",()=>{
 const app=readFileSync("src/App.tsx","utf8");
 const plus=readFileSync("src/LoveRadarPlus.tsx","utf8");
 const home=readFileSync("src/HomeDashboard.tsx","utf8");
 const settings=readFileSync("src/SettingsPage.tsx","utf8");
 assert.equal(PLUS_CENTS,399);
 assert.equal(PLUS_CURRENCY,"usd");
 assert.ok(home.includes('onNavigate("plus")'));
 assert.ok(settings.includes("onOpenPlus"));
 assert.ok(app.includes('tab==="plus"?<LoveRadarPlus'));
 assert.ok(plus.includes("La messagerie, les appels et vos jeux actuels restent gratuits."));
 assert.ok(plus.includes('nativeApp&&!isActive'));
 assert.ok(plus.includes("Aucun paiement n'est lancé ici."));
 assert.ok(plus.includes("Le paiement sera proposé dès la configuration de Stripe"));
 assert.ok(plus.includes("CHALLENGES[challenge]"));
 assert.ok(plus.includes("window.print()"));
 assert.ok(plus.includes('type PlusTheme="classic"|"starlight"|"rose"'));
 assert.ok(plus.includes('isActive?<div className="lr-plus-editor"'));
 assert.ok(app.includes("plusActive&&room&&plusTheme"));
 assert.ok(!app.includes("stripe.com"),"Stripe secret must stay on server");
});

test("Plus entitlement refuses canceled and expired subscriptions even when client claims otherwise",()=>{
 const base={room_id:"room1",customer_id:"cus1",subscription_id:"sub1",
  status:"active",period_end:2000,cancel_at_period_end:0,event_created:1500};
 assert.equal(plusActive(null,1000),false);
 assert.equal(plusActive(base,1000),true);
 assert.equal(plusActive({...base,status:"past_due"},1000),false);
 assert.equal(plusActive({...base,status:"canceled"},1000),false);
 assert.equal(plusActive({...base,status:"trialing"},1000),true);
 assert.equal(plusActive({...base,period_end:1000},1000),false);
 assert.equal(plusActive({...base,cancel_at_period_end:1},1500),true,
  "a canceled renewal keeps its prepaid period");
 assert.equal(subscriptionEnd({current_period_end:3000}),3000);
 assert.equal(subscriptionEnd({items:{data:[{current_period_end:4000}]}}),4000);
});

test("Stripe redirects, live price enforcement and account cleanup are safely bounded",()=>{
 const endpoint=readFileSync("functions/api/plus.ts","utf8");
 const webhook=readFileSync("functions/api/stripe-webhook.ts","utf8");
 const deletion=readFileSync("functions/api/love.ts","utf8");
 const deletionTables=readFileSync("functions/lib/delete-room.ts","utf8");
 assert.equal(isSafeStripeCheckoutUrl("https://checkout.stripe.com/c/pay/cs_test"),true);
 assert.equal(isSafeStripeCheckoutUrl("https://evil.checkout.stripe.com.attacker.com/"),false);
 assert.equal(isSafeStripeCheckoutUrl("javascript:alert(1)"),false);
 assert.ok(endpoint.includes("authorizedMember(request,env.DB)"));
 assert.ok(endpoint.includes("env.STRIPE_WEBHOOK_SECRET"));
 assert.ok(endpoint.includes('price.unit_amount!==PLUS_CENTS'));
 assert.ok(endpoint.includes('price.recurring?.interval!=="month"'));
 assert.ok(endpoint.includes("subscription_data[metadata][room_id]"));
 assert.ok(endpoint.includes("billing_portal/sessions"));
 assert.ok(webhook.includes("verifyStripeSignature(raw"));
 assert.ok(webhook.includes("customer.subscription.deleted"));
 assert.ok(webhook.includes('SELECT id FROM rooms WHERE id=?'));
 assert.ok(deletion.includes('getPlus(db,u.room_id)'));
 assert.ok(deletion.includes("paid.cancel_at_period_end!==1"));
 assert.ok(deletionTables.includes('"room_plus"'));
});

test("Stripe webhook signatures are authenticated and time bounded",async()=>{
 const payload='{"id":"evt_test","type":"customer.subscription.updated"}';
 const secret="whsec_tests_only";
 const timestamp=1700000000;
 const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),
  {name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const signature=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(timestamp+"."+payload));
 const hex=[...new Uint8Array(signature)].map(x=>x.toString(16).padStart(2,"0")).join("");
 const header="t="+timestamp+",v1="+hex;
 assert.equal(await verifyStripeSignature(payload,header,secret,timestamp),true);
 assert.equal(await verifyStripeSignature(payload+" ",header,secret,timestamp),false);
 assert.equal(await verifyStripeSignature(payload,header,secret,timestamp+301),false);
 assert.equal(await verifyStripeSignature(payload,header,"incorrect",timestamp),false);
 assert.equal(await verifyStripeSignature(payload,null,secret,timestamp),false);
});

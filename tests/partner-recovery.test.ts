import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {generateIdentity,deriveContext,deriveRoomKeyMaterial,wrapRoomKeyWithIdentity,
 unwrapRoomKeyFromPartner,encryptText,decryptText,type RoomKeyBinding,type RecoveryWrapInfo} from "../src/e2ee";

const read=(path:string)=>readFileSync(path,"utf8");
const roomId="11111111-1111-4111-8111-111111111111";
const sponsorId="22222222-2222-4222-8222-222222222222";
const targetId="33333333-3333-4333-8333-333333333333";
const messageId="44444444-4444-4444-8444-444444444444";
const grantId="55555555-5555-4555-8555-555555555555";

test("An approved partner can restore actual OLD text history without altering ciphertext",async()=>{
 const sponsor=await generateIdentity(),target=await generateIdentity();
 const binding:RoomKeyBinding={roomId,mineId:sponsorId,partnerId:targetId,
  minePublicKey:sponsor.publicKey,partnerPublicKey:target.publicKey};
 const original=await deriveContext(target,{roomId,mineId:targetId,partnerId:sponsorId,
  minePublicKey:target.publicKey,partnerPublicKey:sponsor.publicKey});
 const oldCipher=await encryptText(original,"Notre message envoyé avant la perte du téléphone",messageId);
 const claimant=await generateIdentity();
 const info:RecoveryWrapInfo={id:grantId,roomId,sponsorId,targetId,ephemeralPublic:claimant.publicKey};
 const wrapped=await wrapRoomKeyWithIdentity(sponsor,binding,info);
 assert.match(wrapped,/^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{40,1500}$/);
 assert.ok(!wrapped.includes("Notre message"));
 const unwrapped=await unwrapRoomKeyFromPartner(claimant.privateKey,sponsor.publicKey,info,wrapped);
 try{
  assert.equal(unwrapped.length,32);
  const restored=await crypto.subtle.importKey("raw",unwrapped,{name:"AES-GCM"},false,["encrypt","decrypt"]);
  assert.equal(restored.extractable,false);
  const recoveredContext={roomId,mineId:targetId,partnerId:sponsorId,partnerPublicKey:sponsor.publicKey,key:restored};
  assert.equal(await decryptText(recoveredContext,oldCipher,messageId,targetId),
   "Notre message envoyé avant la perte du téléphone");
  const newCipher=await encryptText(recoveredContext,"Un nouveau message après récupération",
   "66666666-6666-4666-8666-666666666666");
  assert.equal(await decryptText(original,newCipher,"66666666-6666-4666-8666-666666666666",targetId),
   "Un nouveau message après récupération");
  assert.equal((await deriveRoomKeyMaterial(sponsor,binding)).length,32);
 }finally{unwrapped.fill(0)}
});
test("Encrypted recovery envelope is bound to request, sender, recipient and ephemeral key",async()=>{
 const sponsor=await generateIdentity(),target=await generateIdentity(),claimant=await generateIdentity();
 const binding:RoomKeyBinding={roomId,mineId:sponsorId,partnerId:targetId,
  minePublicKey:sponsor.publicKey,partnerPublicKey:target.publicKey};
 const info:RecoveryWrapInfo={id:grantId,roomId,sponsorId,targetId,ephemeralPublic:claimant.publicKey};
 const envelope=await wrapRoomKeyWithIdentity(sponsor,binding,info);
 const changed={...info,id:"77777777-7777-4777-8777-777777777777"};
 await assert.rejects(unwrapRoomKeyFromPartner(claimant.privateKey,sponsor.publicKey,changed,envelope));
 await assert.rejects(unwrapRoomKeyFromPartner((await generateIdentity()).privateKey,sponsor.publicKey,info,envelope));
 await assert.rejects(unwrapRoomKeyFromPartner(claimant.privateKey,target.publicKey,info,envelope));
 await assert.rejects(unwrapRoomKeyFromPartner(claimant.privateKey,sponsor.publicKey,info,envelope.slice(0,-3)+"AAA"));
});
test("Backend only rotates an EXISTING member after authenticated second-seat approval and code check",()=>{
 const server=read("functions/api/partner-recovery.ts"),schema=read("schema.sql");
 assert.ok(server.includes('action==="start"')&&server.includes('action==="claim"'));
 assert.ok(server.includes('action==="pending"')&&server.includes('action==="approve"'));
 assert.ok(server.includes('action==="status"')&&server.includes('action==="cancel"'));
 assert.ok(server.includes('const user=await member(request,db)'));
 assert.ok(server.includes('grant.sponsor_id!==user.id||grant.room_id!==user.room_id'));
 assert.ok(server.includes('data.verifyCode!==grant.check_code'));
 assert.ok(server.includes('!await validateP256PublicKey(data.ephemeralPublic)'));
 assert.ok(server.includes("candidate_hash"),"server stores digest only, never fresh login token");
 assert.ok(server.includes('UPDATE members SET token_hash=? WHERE id=? AND room_id=?'));
 assert.ok(server.includes('UPDATE partner_recovery SET status=\'approved\''));
 assert.ok(server.includes('const changes=await db.batch('),"token and grant consumed atomically");
 assert.ok(server.includes('grant.expires_at<now'));
 assert.ok(server.includes('return fail("Code expiré ou déjà utilisé."'));
 assert.ok(server.includes('grant.claim_hash!==await sessionHash(claimSecret)'));
 assert.ok(server.includes('sessionHash(secret)'),"one-use grant held as digest, not plaintext");
 assert.ok(!server.includes('INSERT INTO members'),"must not create a second user in same couple");
 assert.ok(!server.includes('INSERT INTO rooms'),"must not create a second private room");
 assert.ok(schema.includes("UNIQUE(room_id,seat)"));
});
test("Client recovers only after importing private AES key and keeps ECDH ephemeral private on-device",()=>{
 const client=read("src/partner-recovery-client.ts"),src=read("src/e2ee.ts");
 assert.ok(client.includes("getPartnerClaim()"));
 assert.ok(client.includes("ephemeralPrivate:pair.privateKey"));
 assert.ok(client.includes('crypto.subtle.generateKey({name:"ECDH",namedCurve:"P-256"},false'));
 assert.ok(client.includes("await saveRecoveredRoomKey(binding,raw)"));
 assert.ok(client.includes("raw.fill(0)"));
 assert.ok(client.indexOf("await saveRecoveredRoomKey(binding,raw)")<client.indexOf("persistSessionToken(pending.candidateToken)"));
 assert.ok(client.includes('verifyPartner(response.roomId,response.sponsorId,trust)'));
 assert.ok(src.includes('db.transaction("recovered-room-keys","readwrite")'));
 assert.ok(src.includes('const recovered=await loadRecoveredRoomKey(args)'));
 assert.ok(src.includes('return {...args,key:recovered!}'));
 assert.ok(src.includes('false,["encrypt","decrypt"]'),"recovered AES key is not extractable");
});
test("Both screens require pairing verification and do not bypass a lost E2EE identity",()=>{
 const sponsor=read("src/PartnerRecoverySponsor.tsx"),lost=read("src/PartnerRecoveryClaim.tsx");
 const settings=read("src/SettingsPage.tsx"),app=read("src/App.tsx");
 assert.ok(sponsor.includes('wrapRoomKeyForPartner(binding,info)'));
 assert.ok(sponsor.includes('typedCode.trim()!==pending.verifyCode'));
 assert.ok(sponsor.includes("checked"),"real human verification checkbox");
 assert.ok(sponsor.includes("await approvePartnerGrant("));
 assert.ok(lost.includes("<output"),"lost partner can read 6-digit verification code");
 assert.ok(lost.includes("finishPartnerClaim(pending)"));
 assert.ok(settings.includes("<PartnerRecoverySponsor"));
 assert.ok(app.includes("<PartnerRecoveryClaim onRecovered={finishApprovedPartnerRecovery}/>"));
 assert.ok(app.includes("loadRecoveredRoomKey({roomId:rm.roomId"));
});
test("Older history is fetched with authenticated, member-scoped keyset pagination and decrypted",()=>{
 const server=read("functions/api/love.ts"),app=read("src/App.tsx");
 assert.ok(server.includes('searchParams.get("historyBefore")'));
 assert.ok(server.includes('LIMIT 51'));
 assert.ok(server.includes('h.member_id=?)'),"delete-for-me restrictions preserved");
 assert.ok(server.includes('m.room_id=?'),"another couple cannot fetch history");
 assert.ok(server.includes('hasMore:rows.length>50'));
 assert.ok(app.includes("async function loadEarlierHistory()"));
 assert.ok(app.includes("revealMessages(data.messages||[],context)"));
 assert.ok(app.includes("setOlderMessages(items=>"));
 assert.ok(app.includes("↑ Afficher les anciens messages"));
 assert.ok(app.includes("historyScrollAnchor.current"));
});

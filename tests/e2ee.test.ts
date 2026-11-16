import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {webcrypto} from "node:crypto";
import {File} from "node:buffer";
import {deriveContext,generateIdentity,encryptText,decryptText,encryptMedia,decryptMedia,
 fingerprint,isEncryptedText,E2EE_MEDIA_MIME,validPublicKey} from "../src/e2ee";
import {revealMessages,LOCKED_TEXT,CORRUPTED_TEXT} from "../src/e2ee-room";

Object.defineProperty(globalThis,"crypto",{configurable:true,value:webcrypto});
Object.defineProperty(globalThis,"File",{configurable:true,value:File});

const roomId="10000000-0000-4000-8000-000000000001";
const aliceId="10000000-0000-4000-8000-000000000002";
const bobId="10000000-0000-4000-8000-000000000003";
const msgId="10000000-0000-4000-8000-000000000004";

test("ECDH+HKDF gives same AES-256 key to two peers, not to server",async()=>{
 const alice=await generateIdentity(),bob=await generateIdentity();
 assert.ok(validPublicKey(alice.publicKey));assert.ok(validPublicKey(bob.publicKey));
 assert.notEqual(await fingerprint(alice.publicKey),await fingerprint(bob.publicKey));
 assert.equal(alice.privateKey.extractable,false);
 await assert.rejects(webcrypto.subtle.exportKey("pkcs8",alice.privateKey));
 const a=await deriveContext(alice,{roomId,mineId:aliceId,partnerId:bobId,
  minePublicKey:alice.publicKey,partnerPublicKey:bob.publicKey});
 const b=await deriveContext(bob,{roomId,mineId:bobId,partnerId:aliceId,
  minePublicKey:bob.publicKey,partnerPublicKey:alice.publicKey});
 const plain="Mon amour ❤️, te amo — سَلام";
 const cipher=await encryptText(a,plain,msgId);
 assert.ok(isEncryptedText(cipher));
 assert.ok(!cipher.includes("Mon amour"));
 assert.equal(await decryptText(b,cipher,msgId,aliceId),plain);
 await assert.rejects(decryptText(b,cipher,roomId,aliceId),"cannot move ciphertext to a different message id");
 await assert.rejects(decryptText(b,cipher,msgId,bobId),"sender authenticated in AAD");
 await assert.rejects(decryptText(b,cipher.slice(0,-2)+"AA",msgId,aliceId),"tag tampering rejected");
 const wrongRoom=await deriveContext(bob,{roomId:msgId,mineId:bobId,partnerId:aliceId,
  minePublicKey:bob.publicKey,partnerPublicKey:alice.publicKey});
 await assert.rejects(decryptText(wrongRoom,cipher,msgId,aliceId),"room key is isolated");
});

test("encrypted media retains content, hides mime and detects manipulation",async()=>{
 const alice=await generateIdentity(),bob=await generateIdentity();
 const a=await deriveContext(alice,{roomId,mineId:aliceId,partnerId:bobId,
  minePublicKey:alice.publicKey,partnerPublicKey:bob.publicKey});
 const b=await deriveContext(bob,{roomId,mineId:bobId,partnerId:aliceId,
  minePublicKey:bob.publicKey,partnerPublicKey:alice.publicKey});
 const photo=new File([new Uint8Array([255,216,255,217])],"photo.jpg",{type:"image/jpeg"});
 const encrypted=await encryptMedia(a,photo,"image",msgId);
 assert.equal(encrypted.type,E2EE_MEDIA_MIME);
 const raw=new Uint8Array(await encrypted.arrayBuffer());
 assert.notDeepEqual(Array.from(raw.slice(-4)),[255,216,255,217]);
 const recovered=await decryptMedia(b,encrypted,"image",msgId,aliceId);
 assert.equal(recovered.type,"image/jpeg");
 assert.deepEqual(Array.from(new Uint8Array(await recovered.arrayBuffer())),[255,216,255,217]);
 await assert.rejects(decryptMedia(b,encrypted,"audio",msgId,aliceId),"encrypted kind is bound");
 raw[raw.length-1]^=1;
 await assert.rejects(decryptMedia(b,new Blob([raw]),"image",msgId,aliceId),"ciphertext integrity");
});

test("ciphertext is never rendered to an unverified or failed device",async()=>{
 const alice=await generateIdentity(),bob=await generateIdentity();
 const a=await deriveContext(alice,{roomId,mineId:aliceId,partnerId:bobId,
  minePublicKey:alice.publicKey,partnerPublicKey:bob.publicKey});
 const b=await deriveContext(bob,{roomId,mineId:bobId,partnerId:aliceId,
  minePublicKey:bob.publicKey,partnerPublicKey:alice.publicKey});
 const cipher=await encryptText(a,"Hello",msgId);
 const source=[{id:msgId,sender_id:aliceId,kind:"text" as const,content:cipher}];
 assert.equal((await revealMessages(source,null))[0].content,LOCKED_TEXT);
 assert.equal((await revealMessages(source,b))[0].content,"Hello");
 const changed=[{...source[0],content:cipher.slice(0,-4)+"AAAA"}];
 assert.equal((await revealMessages(changed,b))[0].content,CORRUPTED_TEXT);
 assert.equal((await revealMessages([{...source[0],content:"Ancien message"}],null))[0].content,"Ancien message");
});

test("server only accepts encrypted transport after two published keys and deletes them with the room",()=>{
 const api=readFileSync("functions/api/love.ts","utf8");
 const media=readFileSync("functions/api/media.ts","utf8");
 const deletion=readFileSync("functions/lib/delete-room.ts","utf8");
 const app=readFileSync("src/App.tsx","utf8");
 const settings=readFileSync("src/SettingsPage.tsx","utf8");
 assert.match(api,/if\(keys.length===2&&!encryptedText\(message\)\)/);
 assert.match(api,/if\(keys.length===2&&!encryptedText\(updated\)\)/);
 assert.match(media,/if\(secure&&mime!==ENCRYPTED_MEDIA_MIME\)/);
 assert.match(media,/if\(!secure&&mime===ENCRYPTED_MEDIA_MIME\)/);
 assert.match(deletion,/"e2ee_keys"/);
 assert.match(app,/encryptMedia\(await cryptoFor\(room\)/);
 assert.match(app,/encryptText\(await cryptoFor\(rm\)/);
 assert.match(settings,/compare les 64 caractères/i);
});

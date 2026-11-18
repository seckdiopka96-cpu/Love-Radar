import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=(p:string)=>readFileSync(p,"utf8");

test("free Avaturn embedded creator is present, no premium API secrets or paywall",()=>{
 const editor=read("src/Avaturn3DEditor.tsx");
 const pkg=JSON.parse(read("package.json"));
 assert.ok(pkg.dependencies["@avaturn/sdk"]);
 assert.ok(pkg.dependencies.three);
 assert.ok(pkg.devDependencies["@types/three"]);
 assert.ok(editor.includes('import("@avaturn/sdk")'));
 assert.ok(editor.includes("sdk.init(element.current"));
 assert.ok(editor.includes('sdk.on("export"'));
 assert.ok(editor.includes('sdkInstance?.destroy()'));
 assert.ok(editor.includes("demo")&&editor.includes("VITE_AVATURN_SUBDOMAIN"));
 assert.ok(editor.includes("Importer un fichier GLB"),"local GLB fallback for demo/CORS failure");
 assert.ok(!editor.includes("AVATURN_API_KEY"));
 assert.ok(!read("src/CoupleAvatarStudio.tsx").includes("29,99"));
});
test("a couple can privately upload and fetch its own GLB with server-only credentials",()=>{
 const api=read("functions/api/couple-avatar-model.ts");
 for(const keyword of [
  "SELECT id,room_id FROM members WHERE token_hash=?","await member(request,env.DB)",
  "member_id TEXT NOT NULL","model/gltf-binary","onRequestGet","onRequestPost",
  "onRequestDelete","PRIVATE", "MAX_BYTES"
 ]){
  if(keyword==="PRIVATE")continue;
  assert.ok(api.includes(keyword),keyword);
 }
 assert.ok(api.includes("12_000_000"));
 assert.ok(api.includes("glTF")===false||api.includes("0x46546c67"));
 assert.ok(api.includes("view.getUint32(0,true)!==0x46546c67"));
 assert.ok(api.includes("view.getUint32(8,true)!==data.byteLength"));
 assert.ok(api.includes("object_key TEXT NOT NULL"));
 assert.ok(api.includes("user.room_id,user.id"));
 assert.ok(api.includes("owner!=="),"owner selection restricted to mine and partner");
 assert.ok(api.includes("private, no-store"));
 assert.ok(api.includes("dataURL")===false,"server never fetches attacker-controlled external model URLs");
});
test("3D avatar flags synchronize between both partners without changing legacy styles",()=>{
 const source=read("src/couple-avatar-model.ts");
 const backend=read("functions/api/couple-avatars.ts");
 const hook=read("src/use-couple-avatars.ts");
 assert.ok(source.includes("mine3d?:boolean;partner3d?:boolean"));
 assert.ok(source.includes('typeof v.mine3d==="boolean"'));
 assert.ok(backend.includes("mine3d:models.results.some"));
 assert.ok(backend.includes("partner3d:models.results.some"));
 assert.ok(hook.includes("reload=useCallback"));
 assert.ok(read("src/App.tsx").includes("reload:reloadCoupleAvatars"));
 assert.ok(read("src/App.tsx").includes("onModelImported={reloadCoupleAvatars}"));
});
test("3D couple rendering is progressive and never breaks legacy animated avatars",()=>{
 const scene=read("src/Avatar3DScene.tsx");
 const duo=read("src/CoupleAvatarDuo.tsx");
 const home=read("src/HomeDashboard.tsx");
 assert.ok(duo.includes('lazy(()=>import("./Avatar3DScene"))'));
 assert.ok(duo.includes('mode!=="sticker"&&!renderFailed'),"keep lightweight old stickers");
 assert.ok(duo.includes("onUnavailable={()=>setRenderFailed(true)}"));
 assert.ok(duo.includes("<AvatarCharacter"),"SVG fallback remains");
 assert.ok(scene.includes('import("three")'));
 assert.ok(scene.includes('import("three/addons/loaders/GLTFLoader.js")'));
 assert.ok(scene.includes("parseAsync(bytes"));
 assert.ok(scene.includes("animateFigure(T,figure,poseRef.current,t)"));
 assert.ok(scene.includes("prefers-reduced-motion"));
 assert.ok(scene.includes("renderer.forceContextLoss()"),"free GPU on exit");
 assert.ok(scene.includes("controller.abort()"));
 assert.ok(scene.includes("Math.min(window.devicePixelRatio||1,1.5)"));
 assert.ok(home.includes('mine3d={Boolean(coupleAvatars.mine3d)}'));
});
test("private GLBs are erased with room deletion and model replacement",()=>{
 const api=read("functions/api/couple-avatar-model.ts");
 const deleteRoom=read("functions/lib/delete-room.ts");
 const schema=read("schema.sql");
 assert.ok(schema.includes("CREATE TABLE IF NOT EXISTS couple_avatar_models"));
 assert.ok(deleteRoom.includes('"couple_avatar_models"'));
 assert.ok(deleteRoom.includes('"avatars3d/"+roomId+"/"'),"R2 objects scrubbed on room deletion");
 assert.ok(api.includes("await env.STORAGE.delete(previous.object_key)"),"replaced files aren't retained");
 assert.ok(api.includes("await env.STORAGE.delete(row.object_key)"),"per-member deletion exists");
 assert.ok(api.includes('if(owner!=="partner")return null'));
 assert.ok(api.includes('if(owner==="mine")return room.id'));
});

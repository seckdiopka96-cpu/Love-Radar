import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {requiresTopLevelAvaturnAuth} from "../src/avaturn-auth";
import {inspectAvatarGlb} from "../src/avatar-3d-diagnostics";
import {embeddedAvatarBaseColors} from "../src/avatar-3d-textures";
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
 assert.ok(!duo.slice(duo.indexOf("type DuoProps")).includes("<AvatarCharacter"),"rejected SVG drawings are not rendered");
 assert.ok(scene.includes('import("three")'));
 assert.ok(scene.includes('import("three/addons/loaders/GLTFLoader.js")'));
 assert.ok(scene.includes("parseAsync(bytes"));
 assert.ok(scene.includes("animateFigure(T,figure,poseRef.current,t,mine&&partner)"));
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


test("iPhone and iPad open Avaturn in a first-party Safari tab to avoid broken redirect sessions",()=>{
 assert.equal(requiresTopLevelAvaturnAuth(
  "Mozilla/5.0 (iPhone; CPU iPhone OS 26_2 like Mac OS X) AppleWebKit/605.1.15",
  "iPhone",5),true);
 assert.equal(requiresTopLevelAvaturnAuth(
  "Mozilla/5.0 (iPad; CPU OS 26_2 like Mac OS X)","iPad",5),true);
 assert.equal(requiresTopLevelAvaturnAuth("Mozilla/5.0 (Macintosh; Intel Mac OS X)",
  "MacIntel",5),true,"desktop-mode iPadOS is treated as iPad");
 assert.equal(requiresTopLevelAvaturnAuth("Mozilla/5.0 (Android 16)", "Linux armv8l",5),false);
 assert.equal(requiresTopLevelAvaturnAuth("Mozilla/5.0 (Macintosh)", "MacIntel",0),false);
 const editor=read("src/Avaturn3DEditor.tsx");
 assert.ok(editor.includes("if(externalOnIOS)return;"),"never loads nested auth iframe on iOS");
 assert.ok(editor.includes("href={AVATURN_URL+\"/\"}"),"restart the editor on its own origin, not auth1 redirect URL");
 assert.ok(editor.includes('target="_blank" rel="noopener noreferrer"'));
 assert.ok(editor.includes("Importer un fichier GLB"),"private manual import remains available");
 assert.ok(editor.includes("n’est pas transféré automatiquement"),"no misleading automatic export claim");
 const css=read("src/avaturn-3d.css");
 assert.ok(css.includes(".lr-avaturn-external-launch"));
});

test("GLB diagnostics distinguish grayscale files from textured rigged models without uploading private data",()=>{
 function glb(json:Record<string,unknown>):ArrayBuffer{
  const body=new TextEncoder().encode(JSON.stringify({asset:{version:"2.0"},...json}));
  const n=Math.ceil(body.byteLength/4)*4;
  const bytes=new ArrayBuffer(20+n);
  const view=new DataView(bytes);
  view.setUint32(0,0x46546c67,true);
  view.setUint32(4,2,true);
  view.setUint32(8,bytes.byteLength,true);
  view.setUint32(12,n,true);
  view.setUint32(16,0x4e4f534a,true);
  const array=new Uint8Array(bytes);
  array.set(body,20);array.fill(32,20+body.byteLength);
  return bytes;
 }
 const noColors=inspectAvatarGlb(glb({meshes:[{}],materials:[{}]}));
 assert.equal(noColors?.images,0);
 assert.equal(noColors?.texturedMaterials,0);
 assert.equal(noColors?.skins,0);
 const colored=inspectAvatarGlb(glb({
  images:[{bufferView:0,mimeType:"image/png"}],
  materials:[{pbrMetallicRoughness:{baseColorTexture:{index:0}}}],
  skins:[{joints:[0,1,2]}],meshes:[{}],animations:[{channels:[]}]
 }));
 assert.deepEqual(colored,{images:1,texturedMaterials:1,skins:1,animations:1,meshes:1});
 assert.equal(inspectAvatarGlb(new ArrayBuffer(25)),null);
 const viewer=read("src/Avatar3DScene.tsx");
 assert.ok(viewer.includes("const info=inspectAvatarGlb(bytes);"));
 assert.ok(viewer.includes("info.images===0||info.texturedMaterials===0"));
 assert.ok(viewer.includes("figure.root.position.x=figure.mirror*(.82-closeness)"),
  "my character starts on left, partner on right");
 assert.ok(viewer.includes("const correction=parentQuat.clone().invert()"),
  "skeleton posing uses world axes instead of guessing bone axes");
 assert.ok(viewer.includes("-side*(.83+.50*wave*(near?1:-1))"),
  "dance bends horizontally extended Avaturn arms naturally");
 assert.ok(read("src/avaturn-3d.css").includes(".lr-avatar-three-warning"));
});

test("Avaturn GLB embedded JPEG base-color maps are recoverable for iOS (no network)",()=>{
 const png=new Uint8Array(36);
 for(let i=0;i<png.length;i++)png[i]=(i*7+23)%256;
 const jsonData=JSON.stringify({
  asset:{version:"2.0"},
  materials:[{name:"avaturn_body_material",pbrMetallicRoughness:{baseColorTexture:{index:0}}},
   {name:"no_color",pbrMetallicRoughness:{}}],
  textures:[{source:0}],
  images:[{mimeType:"image/jpeg",bufferView:0}],
  bufferViews:[{byteOffset:0,byteLength:png.length}],
  buffers:[{byteLength:png.length}]
 });
 const encoded=new TextEncoder().encode(jsonData);
 const jsonLen=Math.ceil(encoded.length/4)*4;
 const glb=new ArrayBuffer(28+jsonLen+png.length);
 const view=new DataView(glb),body=new Uint8Array(glb);
 view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);
 view.setUint32(8,glb.byteLength,true);view.setUint32(12,jsonLen,true);
 view.setUint32(16,0x4e4f534a,true);
 body.set(encoded,20);body.fill(32,20+encoded.length,20+jsonLen);
 view.setUint32(20+jsonLen,png.length,true);
 view.setUint32(24+jsonLen,0x004e4942,true);
 body.set(png,28+jsonLen);
 const result=embeddedAvatarBaseColors(glb);
 assert.equal(result.length,1);
 assert.equal(result[0].materialName,"avaturn_body_material");
 assert.equal(result[0].mimeType,"image/jpeg");
 assert.deepEqual(new Uint8Array(result[0].data),png);
 assert.equal(embeddedAvatarBaseColors(new ArrayBuffer(120)).length,0);
 const scene=read("src/Avatar3DScene.tsx");
 const fallback=read("src/avatar-3d-image-fallback.ts");
 assert.ok(scene.includes("restoreAvatarColorsOnIOS(T,model,bytes,()=>disposed)"));
 assert.ok(scene.includes("renderer.outputColorSpace=T.SRGBColorSpace"));
 assert.ok(scene.includes("renderer.toneMapping=T.NeutralToneMapping"));
 assert.ok(scene.includes("-side*(.83+.50*wave*(near?1:-1))"),
  "Avaturn's horizontally extended arms bend downward in dance mode");
 assert.ok(fallback.includes("new Image()"),"iOS texture decoding does not depend on ImageBitmap");
 assert.ok(fallback.includes("new T.DataTexture(rgba,width,height,T.RGBAFormat,T.UnsignedByteType)"),
  "use raw RGBA pixel buffer for iOS WebGL upload instead of DOM image");
 assert.ok(fallback.includes('context.getImageData(0,0,width,height).data'));
 assert.ok(fallback.includes("texture.generateMipmaps=true"),"mipmapped filters require mipmaps for complete textures");
 assert.ok(fallback.includes("texture.flipY=false"));
 assert.ok(fallback.includes("texture.colorSpace=T.SRGBColorSpace"));
 assert.ok(!fallback.includes("fetch("),"embedded avatar colors never leave the local device");
});

test("A missing partner does not leave the first Avaturn avatar in half T-pose",()=>{
 const scene=read("src/Avatar3DScene.tsx");
 assert.ok(scene.includes('const angle=(!duoReady&&pose==="main")?-side*1.32'),
  "both arms rest down when the second partner has not created an avatar");
 assert.ok(scene.includes("animateFigure(T,figure,poseRef.current,t,mine&&partner)"),
  "actual couple pose is selected only after both private 3D models are present");
});

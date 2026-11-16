import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const server=readFileSync("functions/api/profile.ts","utf8");
const room=readFileSync("functions/api/love.ts","utf8");
const app=readFileSync("src/App.tsx","utf8");
const home=readFileSync("src/HomeDashboard.tsx","utf8");
const editor=readFileSync("src/ProfilePhotoEditor.tsx","utf8");
const hook=readFileSync("src/use-profile-avatars.ts","utf8");
const css=readFileSync("src/profile-photo.css","utf8");
const call=readFileSync("src/VoiceCall.tsx","utf8");

test("private photos belong only to signed-in couple members",()=>{
 assert.ok(server.includes('SELECT id,room_id FROM members WHERE token_hash=?'));
 assert.ok(server.includes('if(!/^Bearer [a-f0-9]{64}$/i.test(authorization))return null'));
 assert.ok(server.includes('SELECT id FROM members WHERE room_id=? AND id=?'));
 assert.ok(server.includes('WHERE room_id=? AND member_id=?'));
 assert.ok(server.includes('profile_photos('));
 assert.ok(server.includes('if(!partner)return no("Profil introuvable.",404)'));
 assert.ok(server.includes('"Cache-Control":"private, no-store"'));
 assert.ok(server.includes('"X-Content-Type-Options":"nosniff"'));
 assert.ok(!server.includes('Access-Control-Allow-Origin'));
});

test("profile upload validates generated photo bytes and replaces previous photo",()=>{
 assert.ok(server.includes('photo.type!=="image/jpeg"'));
 assert.ok(server.includes('photo.size>1_500_000'));
 assert.ok(server.includes('bytes[0]!==255||bytes[1]!==216||bytes[2]!==255'));
 assert.ok(server.includes('await bucket.put(key,bytes'));
 assert.ok(server.includes('ON CONFLICT(room_id,member_id) DO UPDATE SET'));
 assert.ok(server.includes('await bucket.delete(key)'));
 assert.ok(server.includes('await bucket.delete(prior.object_key)'));
 assert.ok(server.includes('await db.prepare("DELETE FROM profile_photos'));
 assert.ok(room.includes('avatarVersion:avatarMap.get(u.id)||0'));
 assert.ok(room.includes('partnerAvatarVersion:partnerMember?avatarMap.get(partnerMember.id)||0:0'));
 assert.ok(room.includes('DELETE FROM profile_photos WHERE room_id=?'));
});

test("iPhone photo editor offers circular cropping, drag, zoom and rotate",()=>{
 assert.ok(editor.includes('width={SIZE} height={SIZE}'));
 assert.ok(editor.includes('canvas.current!.toBlob'));
 assert.ok(editor.includes('new File([blob],"photo-de-profil.jpg",{type:"image/jpeg"})'));
 assert.ok(editor.includes('onPointerDown={onDown} onPointerMove={onMove}'));
 assert.ok(editor.includes('onPointerCancel={onUp}'));
 assert.ok(editor.includes('setPointerCapture(e.pointerId)'));
 assert.ok(editor.includes('type="range" min="1" max="3"'));
 assert.ok(editor.includes('setAngle(newAngle)'));
 assert.ok(editor.includes('ctx.rotate(angle*Math.PI/180)'));
 assert.ok(css.includes('max-height:'));
 assert.ok(css.includes('border-radius:50%'));
 assert.ok(css.includes('touch-action:none'));
 assert.ok(css.includes('env(safe-area-inset-top)'));
});

test("avatars synchronize on each photo version and display in room, calls and settings",()=>{
 assert.ok(hook.includes('useEffect'));
 assert.ok(hook.includes('/api/profile?member='));
 assert.ok(hook.includes('Authorization:"Bearer "+token'));
 assert.ok(hook.includes('URL.createObjectURL(blob)'));
 assert.ok(hook.includes('URL.revokeObjectURL(url)'));
 assert.ok(app.includes('useProfileAvatars(token,room?.user.id,room?.user.avatarVersion,room?.partnerId,room?.partnerAvatarVersion)'));
 assert.ok(app.includes('ref={profilePicker} type="file" hidden accept="image/*"'));
 assert.ok(app.includes('onSave={saveProfilePhoto}'));
 const settings=readFileSync("src/SettingsPage.tsx","utf8");
 assert.ok(settings.includes('>Ajuster</button>'));
 assert.ok(settings.includes('>Supprimer</button>'));
 assert.ok(app.includes('onAdjustPhoto={()=>void adjustProfilePhoto()}'));
 assert.ok(app.includes('onRemovePhoto={()=>void removeProfilePhoto()}'));
 assert.ok(app.includes('src={avatars.partner}'));
 assert.ok(app.includes('avatarSrc={avatars.partner}'));
 assert.ok(home.includes('onClick={onEditProfile}'));
 assert.ok(home.includes('src={mineAvatar}'));
 assert.ok(home.includes('src={partnerAvatar}'));
 assert.ok(call.includes('avatarSrc?<img'));
});

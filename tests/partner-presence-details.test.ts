import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {formatPartnerLastSeen} from "../src/last-seen";

const app=readFileSync("src/App.tsx","utf8");
const sheet=readFileSync("src/PartnerPresenceDetails.tsx","utf8");
const css=readFileSync("src/partner-presence-details.css","utf8");

test("last-seen status in chat is a real accessible clickable button",()=>{
 assert.ok(app.includes('className="lr-chat-status-trigger"'));
 assert.ok(app.includes('onClick={()=>setPartnerPresenceOpen(true)}'));
 assert.ok(app.includes('aria-haspopup="dialog" aria-expanded={partnerPresenceOpen}'));
 assert.ok(app.includes('disabled={!room.partner}'));
 assert.ok(app.includes('>{partnerStatusText}</span>'));
 assert.ok(css.includes('.lr-chat .lr-chat-status-trigger'));
 assert.ok(css.includes('background:transparent'));
});
test("status details show the real stored partner activity in the viewer local time zone",()=>{
 assert.ok(sheet.includes('lastSeenAt:number'));
 assert.ok(sheet.includes('new Date(lastSeenAt)'));
 assert.ok(sheet.includes('date.toLocaleDateString("fr-FR"'));
 assert.ok(sheet.includes('date.toLocaleTimeString("fr-FR"'));
 assert.ok(sheet.includes('datetime')===false,"use valid React dateTime attribute");
 assert.ok(sheet.includes('dateTime={date.toISOString()}'));
 assert.ok(sheet.includes('Dernière activité connue'));
 assert.ok(sheet.includes('Non disponible pour le moment'));
 assert.ok(sheet.includes('ne signifie pas que tes messages ont été lus'));
 assert.ok(app.includes('lastSeenAt={lastSeen}'));
 assert.ok(app.includes('online={partnerOnline} now={presenceNow}'));
 const now=new Date(2026,10,17,12,43).getTime();
 const seen=new Date(2026,10,17,12,12).getTime();
 const localTime=new Date(seen).toLocaleTimeString("fr-FR",{hour:"2-digit",minute:"2-digit"});
 assert.equal(formatPartnerLastSeen(seen,now),"Dernière vue aujourd’hui à "+localTime);
 assert.equal(formatPartnerLastSeen(0,now),"Hors ligne");
});
test("modal is dismissible with close, outside tap and Escape, without changing chat calls",()=>{
 assert.ok(sheet.includes('role="dialog" aria-modal="true"'));
 assert.ok(sheet.includes('onClick={onClose} role="presentation"'));
 assert.ok(sheet.includes('event.stopPropagation()'));
 assert.ok(sheet.includes('event.key==="Escape"'));
 assert.ok(sheet.includes('closeRef.current?.focus()'));
 assert.ok(sheet.includes('returnFocusTo?.current?.focus()'));
 assert.ok(app.includes('createPortal(<PartnerPresenceDetails'));
 assert.ok(app.includes('setPartnerPresenceOpen(false)},[tab,room?.roomId]'));
 assert.ok(app.includes('<VoiceCall key={room.roomId+room.user.id}'));
 assert.ok(css.includes('env(safe-area-inset-bottom)'));
});

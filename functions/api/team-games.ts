import type {D1Database} from "@cloudflare/workers-types";
import {RAPID_QUESTIONS} from "../../src/couple-party-engine";
import {newTeamMatch,repairTeamClassic,teamIdleTurn,teamRoll,teamMove,teamQuizAnswer,teamQuizTick,teamForfeit,teamOf,
 type TeamSeat,type TeamId,type TeamKind,type TeamGame,type TeamMove
} from "../../src/team-games-engine";

/** Four-player matches join TWO existing private couple rooms via a one-use
 * invite code. Only members and rooms are looked up: never messages, photos,
 * calls, private invites, or partner recovery data. */
type Env={DB:D1Database};
type Context={request:Request;env:Env};
type Member={id:string;room_id:string;seat:number;name:string};
type Row={id:string;code:string;host_room:string;guest_room:string|null;kind:TeamKind;state_json:string;version:number;updated_at:number};
const reply=(body:object,status=200)=>Response.json(body,{status,headers:{"Cache-Control":"private, no-store"}});
const bad=(error:string,status=400)=>reply({ok:false,error},status);
let ready:Promise<void>|null=null;
async function ensure(db:D1Database){
 if(!ready)ready=db.exec(
  "CREATE TABLE IF NOT EXISTS team_games ("+
  "id TEXT PRIMARY KEY,code TEXT NOT NULL UNIQUE,host_room TEXT NOT NULL,"+
  "guest_room TEXT,kind TEXT NOT NULL,state_json TEXT NOT NULL,"+
  "version INTEGER NOT NULL DEFAULT 1,updated_at INTEGER NOT NULL);"+
  "CREATE INDEX IF NOT EXISTS idx_team_games_host ON team_games(host_room,updated_at DESC);"+
  "CREATE INDEX IF NOT EXISTS idx_team_games_guest ON team_games(guest_room,updated_at DESC);"+
  "CREATE TABLE IF NOT EXISTS team_game_presence ("+
  "game_id TEXT NOT NULL,member_id TEXT NOT NULL,last_seen INTEGER NOT NULL,"+
  "PRIMARY KEY(game_id,member_id));"+
  "CREATE INDEX IF NOT EXISTS idx_team_presence_game ON team_game_presence(game_id,last_seen);"+
  // Durable, idempotent competition ledger. One result per full match,
  // independent of quiz questions, network retries and rematches.
  "CREATE TABLE IF NOT EXISTS team_game_results ("+
  "game_id TEXT NOT NULL,match_no INTEGER NOT NULL,host_room TEXT NOT NULL,"+
  "guest_room TEXT NOT NULL,kind TEXT NOT NULL,winner_team INTEGER NOT NULL,"+
  "win_reason TEXT NOT NULL,score_host INTEGER NOT NULL DEFAULT 0,"+
  "score_guest INTEGER NOT NULL DEFAULT 0,finished_at INTEGER NOT NULL,"+
  "PRIMARY KEY(game_id,match_no));"+
  "CREATE INDEX IF NOT EXISTS idx_team_results_host ON team_game_results(host_room,finished_at DESC);"+
  "CREATE INDEX IF NOT EXISTS idx_team_results_guest ON team_game_results(guest_room,finished_at DESC)"
 ).then(()=>{}).catch(e=>{ready=null;throw e});
 await ready;
}
async function auth(request:Request,db:D1Database):Promise<Member|null>{
 const h=request.headers.get("Authorization")||"";
 if(!/^Bearer [a-f0-9]{64}$/i.test(h))return null;
 const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(h.slice(7)));
 const digest=Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,"0")).join("");
 return db.prepare("SELECT id,room_id,seat,name FROM members WHERE token_hash=?")
  .bind(digest).first<Member>();
}
const validKind=(kind:unknown):kind is TeamKind=>kind==="classic"||kind==="senegal"||kind==="quiz";
const randomCode=()=>{
 const chars="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
 const bytes=new Uint8Array(10);crypto.getRandomValues(bytes);
 return Array.from(bytes,b=>chars[b%chars.length]).join("");
};
async function roomMembers(db:D1Database,room:string){
 const result=await db.prepare("SELECT id,name,seat FROM members WHERE room_id=? ORDER BY seat")
  .bind(room).all<{id:string;name:string;seat:number}>();
 const m=result.results||[];
 return m.length===2&&m[0].seat===0&&m[1].seat===1?m:[];
}
async function get(db:D1Database,id:string):Promise<Row|null>{
 return db.prepare("SELECT * FROM team_games WHERE id=?").bind(id).first<Row>();
}
async function current(db:D1Database,member:Member):Promise<Row|null>{
 // Last touched does not mean still playable: a more recently ended match
 // must never hide an older interrupted live tournament.
 return db.prepare(
  "SELECT * FROM team_games WHERE host_room=? OR guest_room=?"+
  " ORDER BY CASE WHEN json_extract(state_json,'$.status') IN ('waiting','playing') THEN 0 ELSE 1 END,"+
  " updated_at DESC LIMIT 1"
 ).bind(member.room_id,member.room_id).first<Row>();
}
async function activeMatch(db:D1Database,member:Member):Promise<Row|null>{
 return db.prepare(
  "SELECT * FROM team_games WHERE (host_room=? OR guest_room=?)"+
  " AND json_extract(state_json,'$.status') IN ('waiting','playing')"+
  " ORDER BY updated_at DESC LIMIT 1"
 ).bind(member.room_id,member.room_id).first<Row>();
}
const allowed=(m:Member,r:Row)=>r.host_room===m.room_id||r.guest_room===m.room_id;
const seatFor=(member:Member,row:Row):TeamSeat=>
 ((member.room_id===row.host_room?0:1)+member.seat*2) as TeamSeat;
async function markHere(db:D1Database,id:string,member:Member){
 await db.prepare("INSERT INTO team_game_presence(game_id,member_id,last_seen) VALUES(?,?,?)"+
  " ON CONFLICT(game_id,member_id) DO UPDATE SET last_seen=excluded.last_seen")
  .bind(id,member.id,Date.now()).run();
}
async function attendance(db:D1Database,row:Row){
 if(!row.guest_room)return [false,false,false,false];
 const host=await roomMembers(db,row.host_room),guest=await roomMembers(db,row.guest_room);
 if(host.length!==2||guest.length!==2)return [false,false,false,false];
 const members=[host[0],guest[0],host[1],guest[1]];
 const p=await db.prepare("SELECT member_id,last_seen FROM team_game_presence WHERE game_id=?")
  .bind(row.id).all<{member_id:string;last_seen:number}>();
 const seen=new Map((p.results||[]).map(x=>[x.member_id,x.last_seen]));
 return members.map(x=>(seen.get(x.id)||0)>Date.now()-30000);
}
async function publicView(db:D1Database,row:Row,member:Member){
 const state=JSON.parse(row.state_json) as TeamGame;
 const h=await roomMembers(db,row.host_room);
 const g=row.guest_room?await roomMembers(db,row.guest_room):[];
 const players=[h[0],g[0],h[1],g[1]].map((x,i)=>x?{seat:i,name:x.name,team:i%2}:null);
 const presence=await attendance(db,row);
 const q=state.kind==="quiz"?RAPID_QUESTIONS[state.questionIndex]:null;
 return {id:row.id,code:row.code,kind:row.kind,version:row.version,
  seat:seatFor(member,row),team:teamOf(seatFor(member,row)),
  host:row.host_room===member.room_id,guestJoined:!!row.guest_room,
  players,presence,state:{...state,
   question:q&&state.status==="playing"&&state.phase==="question"||q&&state.phase==="result"||q&&state.status==="finished"?q?.question:null,
   options:q&&(state.status!=="waiting")?q.options:null,
   correct:q&&(state.phase==="result"||state.status==="finished")?q.answer:null
  }};
}
async function conflict(db:D1Database,row:Row,member:Member,message:string){
 // Send the authoritative server snapshot with a 409 so the phone can
 // reconcile immediately instead of waiting for a later background poll.
 const latest=await get(db,row.id)||row;
 return reply({ok:false,error:message,game:await publicView(db,latest,member)},409);
}
async function save(db:D1Database,row:Row,state:TeamGame):Promise<Row|null>{
 const result=await db.prepare(
  "UPDATE team_games SET state_json=?,version=version+1,updated_at=? WHERE id=? AND version=?"
 ).bind(JSON.stringify(state),Date.now(),row.id,row.version).run();
 return result.meta.changes===1?await get(db,row.id):null;
}
/** Record only completed competitions, never an unplayed invitation.
 * The primary key prevents double counting when both phones poll, a POST is
 * retried or an old result is reconciled just before the next rematch. */
async function recordResult(db:D1Database,row:Row):Promise<void>{
 if(!row.guest_room)return;
 const game=JSON.parse(row.state_json) as TeamGame;
 if(game.status!=="finished"||(game.winner!==0&&game.winner!==1)||
   !["pieces","points","abandon"].includes(game.winReason||""))return;
 const matchNo=Number.isInteger(game.matchNo)&&game.matchNo>0?game.matchNo:1;
 await db.prepare(
  "INSERT OR IGNORE INTO team_game_results"+
  "(game_id,match_no,host_room,guest_room,kind,winner_team,win_reason,score_host,score_guest,finished_at)"+
  " VALUES(?,?,?,?,?,?,?,?,?,?)"
 ).bind(row.id,matchNo,row.host_room,row.guest_room,row.kind,game.winner,
   game.winReason,game.scores[0],game.scores[1],game.updatedAt||row.updated_at).run();
}
type Totals={matches:number;wins:number};
async function teamStats(db:D1Database,room:string|null){
 if(!room)return {matches:0,wins:0,losses:0,winRate:0,byKind:[]};
 const totals=await db.prepare(
  "SELECT COUNT(*) AS matches,"+
  " COALESCE(SUM(CASE WHEN (host_room=? AND winner_team=0)"+
  " OR (guest_room=? AND winner_team=1) THEN 1 ELSE 0 END),0) AS wins"+
  " FROM team_game_results WHERE host_room=? OR guest_room=?"
 ).bind(room,room,room,room).first<Totals>();
 const matches=Number(totals?.matches||0),wins=Number(totals?.wins||0);
 const grouped=await db.prepare(
  "SELECT kind,COUNT(*) AS matches,"+
  " COALESCE(SUM(CASE WHEN (host_room=? AND winner_team=0)"+
  " OR (guest_room=? AND winner_team=1) THEN 1 ELSE 0 END),0) AS wins"+
  " FROM team_game_results WHERE host_room=? OR guest_room=?"+
  " GROUP BY kind ORDER BY kind"
 ).bind(room,room,room,room).all<{kind:TeamKind;matches:number;wins:number}>();
 return {matches,wins,losses:matches-wins,winRate:matches?Math.round(wins/matches*100):0,
  byKind:(grouped.results||[]).map(x=>({kind:x.kind,matches:Number(x.matches),wins:Number(x.wins)}))};
}
async function privateStats(db:D1Database,row:Row){
 const [host,guest]=await Promise.all([teamStats(db,row.host_room),teamStats(db,row.guest_room)]);
 const games=row.guest_room?await db.prepare(
  "SELECT kind,winner_team,win_reason,score_host,score_guest,finished_at,match_no"+
  " FROM team_game_results"+
  " WHERE (host_room=? AND guest_room=?) OR (host_room=? AND guest_room=?)"+
  " ORDER BY finished_at DESC LIMIT 6"
 ).bind(row.host_room,row.guest_room,row.guest_room,row.host_room)
  .all<{kind:TeamKind;winner_team:number;win_reason:string;score_host:number;score_guest:number;
    finished_at:number;match_no:number}>():null;
 // Match history is always shown from the current host couple's perspective.
 // Never include former opponents' room IDs or private member records.
 return {teams:[host,guest],history:(games?.results||[]).map(x=>x)};
}
async function sync(db:D1Database,row:Row):Promise<Row>{
 let game=JSON.parse(row.state_json) as TeamGame;
 if(game.status==="finished"){
  await recordResult(db,row);
  return row;
 }
 const repaired=repairTeamClassic(game);
 if(repaired!==game){
  // Heal already-running Classic matches without a reset. Use the same
  // optimistic revision guard as rolls/moves so the latest action wins.
  row=await save(db,row,repaired)||await get(db,row.id)||row;
  game=JSON.parse(row.state_json) as TeamGame;
 }
 // A lost Wi-Fi / 4G connection is NOT an intentional quit.
 // Presence expires for UI after 30 seconds, while the board and scores stay
 // persisted for any duration. Only explicit "quit" can award a forfeit.
 // Ludo idle turns and the real-time quiz clock still follow their own rules.
 if(game.status==="waiting"&&row.guest_room){
  const arrived=await attendance(db,row);
  if(arrived.every(Boolean)){
   const started={...newTeamMatch(row.kind,"playing"),matchNo:game.matchNo||1};
   return await save(db,row,started)||await get(db,row.id)||row;
  }
 }
 if(game.kind==="quiz"&&game.status==="playing"){
  const updated=teamQuizTick(game);
  if(updated!==game)return await save(db,row,updated)||await get(db,row.id)||row;
 }
 if(game.kind!=="quiz"&&game.status==="playing"){
  const updated=teamIdleTurn(game);
  if(updated!==game)return await save(db,row,updated)||await get(db,row.id)||row;
 }
 return row;
}
export async function onRequestGet({request,env}:Context):Promise<Response>{
 const db=env.DB;try{
  await ensure(db);
  const member=await auth(request,db);if(!member)return bad("Connexion nécessaire.",401);
  const params=new URL(request.url).searchParams;
  if(params.get("resume")==="1"){
   // Boot-time probe must not mark an absent phone as "online". The actual
   // TeamGames screen will mark presence after the app navigates there.
   const active=await activeMatch(db,member);
   return reply({ok:true,resume:!!active,status:active?
    (JSON.parse(active.state_json) as TeamGame).status:null});
  }
  const id=params.get("id");
  if(id&&!/^[0-9a-f-]{36}$/i.test(id))return bad("Identifiant invalide.");
  let row=id?await get(db,id):await current(db,member);
  if(!row)return reply({ok:true,game:null});
  if(!allowed(member,row))return bad("Accès refusé à cette salle.",403);
  if(params.get("stats")==="1"){
   // Stats lookup is read-only: it never changes online presence or turns.
   if((JSON.parse(row.state_json) as TeamGame).status==="finished")await recordResult(db,row);
   return reply({ok:true,stats:await privateStats(db,row)});
  }
  await markHere(db,row.id,member);
  row=await sync(db,row);
  return reply({ok:true,game:await publicView(db,row,member)});
 }catch{return bad("Impossible de charger cette salle pour le moment.",503)}
}
export async function onRequestPost({request,env}:Context):Promise<Response>{
 const db=env.DB;try{
  await ensure(db);
  const member=await auth(request,db);if(!member)return bad("Connexion nécessaire.",401);
  const data=await request.json().catch(()=>null) as Record<string,unknown>|null;
  if(!data||typeof data.action!=="string")return bad("Action invalide.");
  const action=data.action;
  if(action==="create"){
   if(!validKind(data.kind))return bad("Choisis Classique, Sénégal ou Questions rapides.");
   if((await roomMembers(db,member.room_id)).length!==2)return bad("Ton partenaire doit d'abord rejoindre votre couple.");
   const existing=await current(db,member);
   if(existing){
    const game=JSON.parse(existing.state_json) as TeamGame;
    if(game.status!=="finished")return bad("Une salle 2 contre 2 est déjà en cours. Rejoins-la.",409);
   }
   const id=crypto.randomUUID(),code=randomCode(),state=newTeamMatch(data.kind);
   await db.prepare(
    "INSERT INTO team_games(id,code,host_room,kind,state_json,updated_at) VALUES(?,?,?,?,?,?)"
   ).bind(id,code,member.room_id,data.kind,JSON.stringify(state),Date.now()).run();
   await markHere(db,id,member);
   const row=await get(db,id);
   return reply({ok:true,game:await publicView(db,row!,member)});
  }
  if(action==="join"){
   const code=typeof data.code==="string"?data.code.trim().toUpperCase():"";
   if(!/^[A-HJ-NP-Z2-9]{10}$/.test(code))return bad("Code d'invitation invalide.");
   if((await roomMembers(db,member.room_id)).length!==2)return bad("Ton partenaire doit d'abord rejoindre votre couple.");
   const row=await db.prepare("SELECT * FROM team_games WHERE code=?").bind(code).first<Row>();
   if(!row)return bad("Code introuvable.");
   if(row.host_room===member.room_id||row.guest_room===member.room_id){
    await markHere(db,row.id,member);
    return reply({ok:true,game:await publicView(db,row,member)});
   }
   if(row.guest_room)return bad("Cette salle contient déjà deux couples.",409);
   const state=JSON.parse(row.state_json) as TeamGame;
   if(state.status!=="waiting")return bad("Cette partie a déjà commencé.",409);
   const updated=await db.prepare(
    "UPDATE team_games SET guest_room=?,version=version+1,updated_at=?"+
    " WHERE id=? AND guest_room IS NULL"
   ).bind(member.room_id,Date.now(),row.id).run();
   if(updated.meta.changes!==1)return bad("Cette salle vient d'être rejointe.",409);
   await markHere(db,row.id,member);
   const game=await get(db,row.id);
   return reply({ok:true,game:await publicView(db,game!,member)});
  }
  const id=typeof data.id==="string"?data.id:"";
  const row=/^[0-9a-f-]{36}$/i.test(id)?await get(db,id):null;
  if(!row||!allowed(member,row))return bad("Salle introuvable ou accès interdit.",403);
  let state=JSON.parse(row.state_json) as TeamGame;
  const seat=seatFor(member,row);
  if(action==="leave-lobby"){
   // Visiting another screen while waiting does not destroy the invite for
   // everyone. Only a started match can be forfeited by explicit Quitter.
   if(state.status!=="waiting")return conflict(db,row,member,"La partie a commencé. Quitte le match pour abandonner.");
   await db.prepare("DELETE FROM team_game_presence WHERE game_id=? AND member_id=?")
    .bind(row.id,member.id).run();
   return reply({ok:true,game:await publicView(db,row,member)});
  }
  if(action==="quit"){
   if(state.status==="playing")state=teamForfeit(state,teamOf(seat));
   else if(state.status==="waiting"){
    // Closing the lobby ends this invitation without awarding a victory.
    state={...state,status:"finished",lastAction:"Salle fermée."};
   }
   const saved=await save(db,row,state);
   if(!saved)return bad("La salle a changé, réessaie.",409);
   await recordResult(db,saved);
   await db.prepare("DELETE FROM team_game_presence WHERE game_id=? AND member_id=?")
    .bind(row.id,member.id).run();
   return reply({ok:true,game:await publicView(db,saved,member)});
  }
  await markHere(db,row.id,member);
  if(action==="restart"){
   if(state.status!=="finished"||!row.guest_room)return bad("Le match doit être terminé.",409);
   await recordResult(db,row);
   const started={...newTeamMatch(row.kind,"waiting"),matchNo:(state.matchNo||1)+1};
   await db.prepare("DELETE FROM team_game_presence WHERE game_id=?").bind(row.id).run();
   await markHere(db,row.id,member);
   const saved=await save(db,row,started);
   if(!saved)return bad("La revanche vient de commencer.",409);
   return reply({ok:true,game:await publicView(db,saved,member)});
  }
  const fresh=await sync(db,row);
  if(fresh.version!==row.version)return conflict(db,fresh,member,"La partie a changé, actualise-la.");
  if(!Number.isInteger(data.version)||data.version!==row.version)return conflict(db,row,member,"Le jeu a été mis à jour, réessaie.");
  if(state.status!=="playing")return bad("Attends les quatre joueurs ou relance une partie.",409);
  const now=Date.now();
  if(action==="roll"){
   if(state.kind==="quiz"||state.turn!==seat)return bad("Ce n'est pas ton tour.",403);
   const random=new Uint32Array(1);crypto.getRandomValues(random);
   state=teamRoll(state,seat,(random[0]%6)+1,now);
  }else if(action==="move"){
   if(state.kind==="quiz"||state.turn!==seat)return bad("Ce n'est pas ton tour.",403);
   if(!Number.isInteger(data.pawn)||typeof data.move!=="string")return bad("Pion invalide.");
   const next=teamMove(state,seat,Number(data.pawn),data.move as TeamMove["action"],now);
   if(!next)return bad("Déplacement interdit.",409);
   state=next;
  }else if(action==="answer"){
   if(state.kind!=="quiz"||!Number.isInteger(data.choice)||!Number.isInteger(data.round)||
      data.round!==state.round)return bad("Question invalide ou déjà terminée.",409);
   const next=teamQuizAnswer(state,seat,Number(data.choice),now);
   if(!next)return bad("Réponse déjà envoyée ou chrono terminé.",409);
   state=next;
  }else return bad("Action inconnue.");
  const saved=await save(db,row,state);
  if(!saved)return conflict(db,row,member,"Un autre joueur a déjà agi. Plateau synchronisé.");
  await recordResult(db,saved);
  return reply({ok:true,game:await publicView(db,saved,member)});
 }catch{return bad("Impossible de synchroniser ce jeu actuellement.",503)}
}

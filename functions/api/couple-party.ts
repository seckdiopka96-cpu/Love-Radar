import type {D1Database} from "@cloudflare/workers-types";
import {notifyPartner,type PushEnv} from "../lib/push";
import {
 RAPID_QUESTIONS,TRUTH_PROMPTS,ACTION_PROMPTS,RAPID_SECONDS,RAPID_COUNTDOWN_MS,
 nextPartyIndex,nextUnseenPartyIndex,partyQuestion,partyChallenge,validChoice,validPartyMode,
 validChallengeKind,type PartyMode,type ChallengeKind
} from "../../src/couple-party-engine";

/** Server-authoritative games for two members of one private room.
 * Correct answers are never returned before a round ends. SQL conditional
 * updates ensure that only the first accepted correct answer scores.
 */
type Ctx={request:Request;env:PushEnv;waitUntil?:(task:Promise<unknown>)=>void};
type Member={id:string;room_id:string;seat:number;name:string};
type Phase="ready"|"question"|"result"|"finished"|"choose"|"challenge";
const WIN_SCORE=10;
// An explicit Quitter is immediate; a lost connection must stay absent
// for a full minute before it can count as an abandonment.
const FORFEIT_GRACE_MS=60000;
type Row={
 room_id:string;mode:PartyMode;game_id:string;version:number;round:number;
 phase:Phase;question_index:number;prompt_kind:ChallengeKind|null;
 turn:number;picked_0:number|null;picked_1:number|null;
 score_0:number;score_1:number;winner:number|null;
 started_at:number;deadline_at:number;updated_at:number;last_invite_at:number
};
const send=(body:Record<string,unknown>)=>Response.json({ok:true,...body},{headers:{"Cache-Control":"private, no-store"}});
const fail=(error:string,status=400)=>Response.json({ok:false,error},{status,headers:{"Cache-Control":"private, no-store"}});
let ready:Promise<void>|null=null;
async function ensure(db:D1Database){
 if(!ready)ready=db.exec(
  "CREATE TABLE IF NOT EXISTS couple_party_games("+
  "room_id TEXT NOT NULL,mode TEXT NOT NULL,game_id TEXT NOT NULL,"+
  "version INTEGER NOT NULL,round INTEGER NOT NULL,phase TEXT NOT NULL,"+
  "question_index INTEGER NOT NULL,prompt_kind TEXT,turn INTEGER NOT NULL,"+
  "picked_0 INTEGER,picked_1 INTEGER,score_0 INTEGER NOT NULL DEFAULT 0,"+
  "score_1 INTEGER NOT NULL DEFAULT 0,winner INTEGER,started_at INTEGER NOT NULL,"+
  "deadline_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,"+
  "last_invite_at INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(room_id,mode));"+
  "CREATE TABLE IF NOT EXISTS couple_party_prompt_history("+
  "room_id TEXT NOT NULL,game_id TEXT NOT NULL,kind TEXT NOT NULL,"+
  "prompt_index INTEGER NOT NULL,PRIMARY KEY(room_id,game_id,kind,prompt_index));"+
  "CREATE TABLE IF NOT EXISTS couple_party_presence("+
  "room_id TEXT NOT NULL,mode TEXT NOT NULL,member_id TEXT NOT NULL,"+
  "last_seen_at INTEGER NOT NULL,PRIMARY KEY(room_id,mode,member_id))"
 ).then(()=>{}).catch(e=>{ready=null;throw e});
 await ready;
}
async function authenticate(request:Request,db:D1Database):Promise<Member|null>{
 const bearer=request.headers.get("Authorization")||"";
 if(!/^Bearer [a-f0-9]{64}$/i.test(bearer))return null;
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(bearer.slice(7)));
 const hash=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("");
 return db.prepare("SELECT id,room_id,seat,name FROM members WHERE token_hash=?")
  .bind(hash).first<Member>();
}
function randomNumber():number{
 const values=new Uint32Array(1);crypto.getRandomValues(values);return values[0]/4294967296;
}
const newIndex=(count:number,previous:number)=>nextPartyIndex(count,previous,randomNumber());
async function nextChallenge(db:D1Database,row:Row,kind:ChallengeKind){
 const count=kind==="truth"?TRUTH_PROMPTS.length:ACTION_PROMPTS.length;
 const seen=await db.prepare(
  "SELECT prompt_index FROM couple_party_prompt_history WHERE room_id=? AND game_id=? AND kind=?"
 ).bind(row.room_id,row.game_id,kind).all<{prompt_index:number}>();
 const indices=(seen.results||[]).map(x=>x.prompt_index);
 return {
  index:nextUnseenPartyIndex(count,indices,row.question_index,randomNumber()),
  reshuffle:indices.length>=count
 };
}
async function init(db:D1Database,room:string,mode:PartyMode){
 const now=Date.now(),rapid=mode==="rapid";
 await db.prepare(
  "INSERT OR IGNORE INTO couple_party_games(room_id,mode,game_id,version,round,phase,"+
  "question_index,prompt_kind,turn,started_at,deadline_at,updated_at)"+
  " VALUES(?,?,?,1,1,?, ?,NULL,0,?,?,?)"
 ).bind(room,mode,crypto.randomUUID(),rapid?"ready":"choose",
  rapid?newIndex(RAPID_QUESTIONS.length,-1):-1,
  0,0,now).run();
}
async function get(db:D1Database,room:string,mode:PartyMode){
 return db.prepare("SELECT * FROM couple_party_games WHERE room_id=? AND mode=?")
  .bind(room,mode).first<Row>();
}
async function expire(db:D1Database,row:Row):Promise<Row>{
 if(row.mode==="rapid"&&row.phase!=="finished"&&(row.score_0>=WIN_SCORE||row.score_1>=WIN_SCORE)){
  await db.prepare("UPDATE couple_party_games SET phase='finished',winner=?,version=version+1,updated_at=?"+
   " WHERE room_id=? AND mode='rapid' AND game_id=? AND version=? AND phase<>'finished'")
   .bind(row.score_0>=WIN_SCORE?0:1,Date.now(),row.room_id,row.game_id,row.version).run();
  return await get(db,row.room_id,row.mode)||row;
 }

 // Resume pre-update rooms stuck in ready after round one, only once.
 if(row.mode==="rapid"&&row.phase==="ready"&&row.round>1){
  const now=Date.now(),start=now+RAPID_COUNTDOWN_MS;
  await db.prepare(
   "UPDATE couple_party_games SET phase='question',picked_0=NULL,picked_1=NULL,"+
   "started_at=?,deadline_at=?,version=version+1,updated_at=?"+
   " WHERE room_id=? AND mode='rapid' AND game_id=? AND round=? AND phase='ready'"
  ).bind(start,start+RAPID_SECONDS*1000,now,row.room_id,row.game_id,row.round).run();
  return await get(db,row.room_id,row.mode)||row;
 }
 if(row.mode!=="rapid"||row.phase!=="question"||Date.now()<row.deadline_at)return row;
 await db.prepare("UPDATE couple_party_games SET phase='result',version=version+1,updated_at=?"+
  " WHERE room_id=? AND mode='rapid' AND game_id=? AND round=? AND phase='question' AND deadline_at<=?")
  .bind(Date.now(),row.room_id,row.game_id,row.round,Date.now()).run();
 return await get(db,row.room_id,row.mode)||row;
}
function visible(row:Row,seat:number){
 const common={
  id:row.game_id,mode:row.mode,version:row.version,round:row.round,
  phase:row.phase,turn:row.turn,scores:[row.score_0,row.score_1],
  updatedAt:row.updated_at
 };
 if(row.mode==="rapid"){
  const q=partyQuestion(row.question_index),revealed=row.phase==="result"||row.phase==="finished";
  const waiting=row.phase==="ready";
  return {...common,question:waiting?null:q.question,options:waiting?null:q.options,
   // Neither the question nor correct choice is visible until both players are ready.
   correct:revealed?q.answer:null,
   myReady:waiting?(seat===0?row.picked_0:row.picked_1)===1:false,
   partnerReady:waiting?(seat===0?row.picked_1:row.picked_0)===1:false,
   myChoice:waiting?null:seat===0?row.picked_0:row.picked_1,
   partnerPicked:!waiting&&(seat===0?row.picked_1:row.picked_0)!==null,
   partnerChoice:revealed?(seat===0?row.picked_1:row.picked_0):null,
   winner:revealed?row.winner:null,
   matchWinner:row.phase==="finished"?row.winner:null,winScore:WIN_SCORE,
   winByForfeit:row.phase==="finished"&&Math.max(row.score_0,row.score_1)<WIN_SCORE,
   startAt:row.started_at,deadlineAt:row.deadline_at};
 }
 return {...common,myReady:(seat===0?row.picked_0:row.picked_1)===1,
  partnerReady:(seat===0?row.picked_1:row.picked_0)===1,
  kind:row.phase==="challenge"?row.prompt_kind:null,
  prompt:row.phase==="challenge"&&validChallengeKind(row.prompt_kind)?
   partyChallenge(row.prompt_kind,row.question_index):null};
}
// Only an actively opened game screen counts as participating in the match.
const GAME_PRESENCE_MS=30000; // Grace for brief iOS call/poll suspension.
async function partnerInGame(db:D1Database,member:Member,mode:PartyMode):Promise<boolean>{
 const current=await db.prepare(
  "SELECT last_seen_at FROM couple_party_presence WHERE room_id=? AND mode=? AND member_id<>? LIMIT 1"
 ).bind(member.room_id,mode,member.id).first<{last_seen_at:number}>();
 const seen=Number(current?.last_seen_at||0);
 return seen>0&&seen>Date.now()-GAME_PRESENCE_MS;
}
async function enterGame(db:D1Database,member:Member,mode:PartyMode){
 await db.prepare(
  "INSERT INTO couple_party_presence(room_id,mode,member_id,last_seen_at) VALUES(?,?,?,?)"+
  " ON CONFLICT(room_id,mode,member_id) DO UPDATE SET last_seen_at=excluded.last_seen_at"
 ).bind(member.room_id,mode,member.id,Date.now()).run();
}
/** A started quiz cannot remain indefinitely paused when one partner has
 * actually abandoned it. Do not penalize somebody who has not yet joined
 * the very first ready screen. Other modes are untouched. */
async function finishAbsentRapid(db:D1Database,row:Row,member:Member):Promise<Row>{
 if(row.mode!=="rapid"||(row.phase!=="question"&&row.phase!=="result"))return row;
 const opponent=await db.prepare(
  "SELECT last_seen_at FROM couple_party_presence WHERE room_id=? AND mode='rapid' AND member_id<>? LIMIT 1"
 ).bind(member.room_id,member.id).first<{last_seen_at:number}>();
 const last=Number(opponent?.last_seen_at||0),now=Date.now();
 if(!last||now-last<FORFEIT_GRACE_MS)return row;
 const saved=await db.prepare(
  "UPDATE couple_party_games SET phase='finished',winner=?,version=version+1,updated_at=?"+
  " WHERE room_id=? AND mode='rapid' AND game_id=? AND version=? AND phase IN('question','result')"
 ).bind(member.seat,now,member.room_id,row.game_id,row.version).run();
 if(saved.meta.changes!==1)return await get(db,member.room_id,"rapid")||row;
 return {...row,phase:"finished",winner:member.seat,version:row.version+1,updated_at:now};
}
async function publicState(db:D1Database,member:Member,mode:PartyMode,members:number){
 let game=members===2?await get(db,member.room_id,mode):null;
 if(game)game=await expire(db,game);
 if(game&&members===2)game=await finishAbsentRapid(db,game,member);
 return {members,seat:member.seat,partnerHere:members===2?await partnerInGame(db,member,mode):false,
  game:game?visible(game,member.seat):null,serverNow:Date.now()};
}
async function handle(ctx:Ctx,method:"GET"|"POST"){
 try{
  const db=ctx.env.DB;
  if(!db)return fail("Jeux momentanément indisponibles.",503);
  const member=await authenticate(ctx.request,db);
  if(!member)return fail("Session expirée. Reconnecte-toi.",401);
  if(member.seat!==0&&member.seat!==1)return fail("Place de joueur invalide.",403);
  const mode=new URL(ctx.request.url).searchParams.get("mode");
  if(!validPartyMode(mode))return fail("Jeu inconnu.",400);
  await ensure(db);
  const count=await db.prepare("SELECT COUNT(*) AS n FROM members WHERE room_id=?")
   .bind(member.room_id).first<{n:number}>();
  const members=Number(count?.n||0);
  if(members===2)await init(db,member.room_id,mode);
  if(method==="GET"){
    if(members===2)await enterGame(db,member,mode);
    return send(await publicState(db,member,mode,members));
   }
  if(members!==2)return fail("Invitez votre partenaire pour jouer à deux.",409);
  const raw=await ctx.request.text();
  if(raw.length>600)return fail("Requête trop longue.",413);
  let data:Record<string,unknown>;
  try{data=JSON.parse(raw) as Record<string,unknown>}catch{return fail("Requête invalide.")}
  let row=await get(db,member.room_id,mode);
  if(!row)return fail("Partie indisponible.",503);
  row=await expire(db,row);
  if(data.gameId!==row.game_id)return fail("La partie a changé. Actualise le jeu.",409);
  const now=Date.now();
  if(data.action==="invite"){
   const updated=await db.prepare("UPDATE couple_party_games SET last_invite_at=?"+
    " WHERE room_id=? AND mode=? AND last_invite_at<?")
    .bind(now,member.room_id,mode,now-30000).run();
   if(updated.meta.changes!==1)return fail("Attends un instant avant de renvoyer une invitation.",429);
   const title=mode==="rapid"?"⚡ Défi Questions rapides":"💗 Action ou vérité";
   const message=member.name.slice(0,38)+(mode==="rapid"?
    " t'invite à un quiz rapide à deux !":" t'invite à jouer à Action ou vérité !");
   const job=notifyPartner(ctx.env,member.room_id,member.id,title,message,mode);
   if(ctx.waitUntil)ctx.waitUntil(job);else void job;
   return send({invited:true,...await publicState(db,member,mode,members)});
  }
  if(mode==="rapid"&&data.action==="quit"){
   // Leaving a started quiz awards the match to the partner, at any score.
   // A quit before both started only removes presence, not an unearned win.
   if(row.phase==="question"||row.phase==="result"){
    const result=await db.prepare(
     "UPDATE couple_party_games SET phase='finished',winner=?,version=version+1,updated_at=?"+
     " WHERE room_id=? AND mode='rapid' AND game_id=? AND version=? AND phase IN('question','result')"
    ).bind(1-member.seat,now,member.room_id,row.game_id,row.version).run();
    if(result.meta.changes!==1)return fail("La partie a changé. Actualise le jeu.",409);
   }
   await db.prepare("DELETE FROM couple_party_presence WHERE room_id=? AND mode='rapid' AND member_id=?")
    .bind(member.room_id,member.id).run();
   // Do not call enterGame here: a quitter cannot remain present.
   return send(await publicState(db,member,mode,members));
  }
  await enterGame(db,member,mode);
  if(mode==="rapid"&&data.action==="restart"){
   if(row.phase!=="finished")return fail("Terminez d'abord cette partie.",409);
   const updated=await db.prepare(
    "UPDATE couple_party_games SET game_id=?,round=1,phase='ready',version=version+1,"+
    "score_0=0,score_1=0,winner=NULL,picked_0=NULL,picked_1=NULL,"+
    "question_index=?,started_at=0,deadline_at=0,updated_at=?"+
    " WHERE room_id=? AND mode='rapid' AND game_id=? AND phase='finished'"
   ).bind(crypto.randomUUID(),newIndex(RAPID_QUESTIONS.length,-1),now,member.room_id,row.game_id).run();
   if(updated.meta.changes!==1)return fail("Une nouvelle partie a déjà commencé.",409);
   return send(await publicState(db,member,mode,members));
  }
   if(!(await partnerInGame(db,member,mode)))return fail("Ton partenaire doit ouvrir cette salle pour continuer.",409);
   if(!Number.isInteger(data.round)||data.round!==row.round)
   return fail("Ton partenaire a déjà changé de manche.",409);
  if(mode==="rapid"){
   if(data.action==="ready"){
    if(row.phase!=="ready"||row.round!==1)return fail("La salle est déjà prête. Les manches suivantes démarrent automatiquement.",409);
    const col=member.seat===0?"picked_0":"picked_1";
    const marked=await db.prepare(
     "UPDATE couple_party_games SET "+col+"=1,version=version+1,updated_at=?"+
     " WHERE room_id=? AND mode='rapid' AND game_id=? AND round=?"+
     " AND phase='ready' AND "+col+" IS NULL"
    ).bind(now,member.room_id,row.game_id,row.round).run();
    if(marked.meta.changes!==1)return fail("Tu es déjà prêt(e) pour cette manche.",409);
    const both=await get(db,member.room_id,"rapid");
    if(both?.phase==="ready"&&both.picked_0===1&&both.picked_1===1){
     const start=Date.now()+RAPID_COUNTDOWN_MS;
     await db.prepare(
      "UPDATE couple_party_games SET phase='question',picked_0=NULL,picked_1=NULL,"+
      "started_at=?,deadline_at=?,version=version+1,updated_at=?"+
      " WHERE room_id=? AND mode='rapid' AND game_id=? AND round=?"+
      " AND phase='ready' AND picked_0=1 AND picked_1=1"
     ).bind(start,start+RAPID_SECONDS*1000,Date.now(),
      member.room_id,row.game_id,row.round).run();
    }
    return send(await publicState(db,member,mode,members));
   }
   if(data.action==="answer"){
    if(!validChoice(data.choice))return fail("Choisis une réponse.",400);
    if(row.phase!=="question"||now<row.started_at||now>=row.deadline_at)
     return fail("Cette question est terminée.",409);
    const col=member.seat===0?"picked_0":"picked_1";
    const scoreCol=member.seat===0?"score_0":"score_1";
    const correct=data.choice===partyQuestion(row.question_index).answer?1:0;
    const changed=await db.prepare(
     "UPDATE couple_party_games SET "+col+"=?,phase=CASE WHEN ?=1 AND "+scoreCol+">=? THEN 'finished' WHEN ?=1 THEN 'result' ELSE phase END,"+
     "winner=CASE WHEN ?=1 THEN ? ELSE winner END,"+scoreCol+"="+scoreCol+"+?,"+
     "version=version+1,updated_at=? WHERE room_id=? AND mode='rapid'"+
     " AND game_id=? AND round=? AND phase='question' AND started_at<=?"+
     " AND deadline_at>? AND "+col+" IS NULL"
    ).bind(data.choice,correct,WIN_SCORE-1,correct,correct,member.seat,correct,now,
     member.room_id,row.game_id,row.round,now,now).run();
    if(changed.meta.changes!==1)return fail("La réponse ou la manche a déjà été validée.",409);
    return send(await publicState(db,member,mode,members));
   }
   if(data.action==="next"){
    if(row.phase==="finished")return fail("La partie est terminée à 10 points.",409);
    if(row.phase!=="result")return fail("Attends la fin de cette question.",409);
    const next=newIndex(RAPID_QUESTIONS.length,row.question_index);
    const start=now+RAPID_COUNTDOWN_MS;
    const changed=await db.prepare(
     "UPDATE couple_party_games SET round=round+1,version=version+1,phase='question',"+
     "question_index=?,picked_0=NULL,picked_1=NULL,winner=NULL,started_at=?,deadline_at=?,updated_at=?"+
     " WHERE room_id=? AND mode='rapid' AND game_id=? AND round=? AND phase='result'"
    ).bind(next,start,start+RAPID_SECONDS*1000,now,member.room_id,row.game_id,row.round).run();
    if(changed.meta.changes!==1)return fail("La prochaine question a déjà commencé.",409);
    return send(await publicState(db,member,mode,members));
   }
   return fail("Action de quiz inconnue.");
  }
  if(data.action==="ready"){
    const col=member.seat===0?"picked_0":"picked_1";
    const marked=await db.prepare(
     "UPDATE couple_party_games SET "+col+"=1,version=version+1,updated_at=?"+
     " WHERE room_id=? AND mode='truth' AND game_id=? AND "+col+" IS NULL"
    ).bind(now,member.room_id,row.game_id).run();
    if(marked.meta.changes!==1)return fail("Tu es déjà prêt(e).",409);
    return send(await publicState(db,member,mode,members));
   }
   if(row.picked_0!==1||row.picked_1!==1)return fail("Attendez que vous soyez prêts tous les deux.",409);
   if(data.action==="pick"){
   if(row.phase!=="choose"||row.turn!==member.seat)return fail("C'est au tour de ton partenaire.",409);
   if(data.kind!=="surprise"&&!validChallengeKind(data.kind))return fail("Choisis Action ou Vérité.");
   // Surprise alternates categories while explicit picks remain the player's choice.
   const kind:ChallengeKind=data.kind==="surprise"?
    (row.prompt_kind==="truth"?"action":row.prompt_kind==="action"?"truth":randomNumber()<.5?"truth":"action"):
    data.kind as ChallengeKind;
   const {index,reshuffle}=await nextChallenge(db,row,kind);
   const changed=await db.prepare(
    "UPDATE couple_party_games SET phase='challenge',prompt_kind=?,question_index=?,turn=?,"+
    "version=version+1,updated_at=? WHERE room_id=? AND mode='truth' AND game_id=?"+
    " AND round=? AND phase='choose' AND turn=?"
   ).bind(kind,index,member.seat,now,member.room_id,row.game_id,row.round,member.seat).run();
   if(changed.meta.changes!==1)return fail("Une carte vient d'être tirée.",409);
   if(reshuffle){
    await db.prepare(
     "DELETE FROM couple_party_prompt_history WHERE room_id=? AND game_id=? AND kind=?"
    ).bind(member.room_id,row.game_id,kind).run();
   }
   await db.prepare(
    "INSERT OR IGNORE INTO couple_party_prompt_history(room_id,game_id,kind,prompt_index) VALUES(?,?,?,?)"
   ).bind(member.room_id,row.game_id,kind,index).run();
   return send(await publicState(db,member,mode,members));
  }
  if(data.action==="finish"||data.action==="pass"){
   if(row.phase!=="challenge"||row.turn!==member.seat)return fail("Ce défi n'est plus à toi.",409);
   const scoreCol=member.seat===0?"score_0":"score_1";
   const credit=data.action==="finish"?1:0;
   const changed=await db.prepare(
    "UPDATE couple_party_games SET phase='choose',round=round+1,"+
    "turn=?,version=version+1,updated_at=?,"+scoreCol+"="+scoreCol+"+?"+
    " WHERE room_id=? AND mode='truth' AND game_id=? AND round=?"+
    " AND phase='challenge' AND turn=?"
   ).bind(1-member.seat,now,credit,member.room_id,row.game_id,row.round,member.seat).run();
   if(changed.meta.changes!==1)return fail("Le tour vient de changer.",409);
   return send(await publicState(db,member,mode,members));
  }
  return fail("Action de jeu inconnue.");
 }catch(error){
  console.error("Couple party game",error);
  return fail("Le jeu est momentanément indisponible.",500);
 }
}
export const onRequestGet=(ctx:Ctx)=>handle(ctx,"GET");
export const onRequestPost=(ctx:Ctx)=>handle(ctx,"POST");

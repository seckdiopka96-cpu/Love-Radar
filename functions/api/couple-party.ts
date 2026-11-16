import type {D1Database} from "@cloudflare/workers-types";
import {notifyPartner,type PushEnv} from "../lib/push";
import {
 RAPID_QUESTIONS,TRUTH_PROMPTS,ACTION_PROMPTS,RAPID_SECONDS,RAPID_COUNTDOWN_MS,
 nextPartyIndex,partyQuestion,partyChallenge,validChoice,validPartyMode,
 validChallengeKind,type PartyMode,type ChallengeKind
} from "../../src/couple-party-engine";

/** Server-authoritative games for two members of one private room.
 * Correct answers are never returned before a round ends. SQL conditional
 * updates ensure that only the first accepted correct answer scores.
 */
type Ctx={request:Request;env:PushEnv;waitUntil?:(task:Promise<unknown>)=>void};
type Member={id:string;room_id:string;seat:number;name:string};
type Phase="question"|"result"|"choose"|"challenge";
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
  "last_invite_at INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(room_id,mode))"
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
async function init(db:D1Database,room:string,mode:PartyMode){
 const now=Date.now(),rapid=mode==="rapid";
 await db.prepare(
  "INSERT OR IGNORE INTO couple_party_games(room_id,mode,game_id,version,round,phase,"+
  "question_index,prompt_kind,turn,started_at,deadline_at,updated_at)"+
  " VALUES(?,?,?,1,1,?, ?,NULL,0,?,?,?)"
 ).bind(room,mode,crypto.randomUUID(),rapid?"question":"choose",
  rapid?newIndex(RAPID_QUESTIONS.length,-1):-1,
  rapid?now+RAPID_COUNTDOWN_MS:0,
  rapid?now+RAPID_COUNTDOWN_MS+RAPID_SECONDS*1000:0,now).run();
}
async function get(db:D1Database,room:string,mode:PartyMode){
 return db.prepare("SELECT * FROM couple_party_games WHERE room_id=? AND mode=?")
  .bind(room,mode).first<Row>();
}
async function expire(db:D1Database,row:Row):Promise<Row>{
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
  const q=partyQuestion(row.question_index),revealed=row.phase==="result";
  return {...common,question:q.question,options:q.options,
   // Correct choice and the other player's choice stay hidden until reveal.
   correct:revealed?q.answer:null,
   myChoice:seat===0?row.picked_0:row.picked_1,
   partnerPicked:(seat===0?row.picked_1:row.picked_0)!==null,
   partnerChoice:revealed?(seat===0?row.picked_1:row.picked_0):null,
   winner:revealed?row.winner:null,
   startAt:row.started_at,deadlineAt:row.deadline_at};
 }
 return {...common,kind:row.phase==="challenge"?row.prompt_kind:null,
  prompt:row.phase==="challenge"&&validChallengeKind(row.prompt_kind)?
   partyChallenge(row.prompt_kind,row.question_index):null};
}
async function publicState(db:D1Database,member:Member,mode:PartyMode,members:number){
 let game=members===2?await get(db,member.room_id,mode):null;
 if(game)game=await expire(db,game);
 return {members,seat:member.seat,game:game?visible(game,member.seat):null,serverNow:Date.now()};
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
  if(method==="GET")return send(await publicState(db,member,mode,members));
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
  if(!Number.isInteger(data.round)||data.round!==row.round)
   return fail("Ton partenaire a déjà changé de manche.",409);
  if(mode==="rapid"){
   if(data.action==="answer"){
    if(!validChoice(data.choice))return fail("Choisis une réponse.",400);
    if(row.phase!=="question"||now<row.started_at||now>=row.deadline_at)
     return fail("Cette question est terminée.",409);
    const col=member.seat===0?"picked_0":"picked_1";
    const scoreCol=member.seat===0?"score_0":"score_1";
    const correct=data.choice===partyQuestion(row.question_index).answer?1:0;
    const changed=await db.prepare(
     "UPDATE couple_party_games SET "+col+"=?,phase=CASE WHEN ?=1 THEN 'result' ELSE phase END,"+
     "winner=CASE WHEN ?=1 THEN ? ELSE winner END,"+scoreCol+"="+scoreCol+"+?,"+
     "version=version+1,updated_at=? WHERE room_id=? AND mode='rapid'"+
     " AND game_id=? AND round=? AND phase='question' AND started_at<=?"+
     " AND deadline_at>? AND "+col+" IS NULL"
    ).bind(data.choice,correct,correct,member.seat,correct,now,
     member.room_id,row.game_id,row.round,now,now).run();
    if(changed.meta.changes!==1)return fail("La réponse ou la manche a déjà été validée.",409);
    return send(await publicState(db,member,mode,members));
   }
   if(data.action==="next"){
    if(row.phase!=="result")return fail("Attends la fin de cette question.",409);
    const next=newIndex(RAPID_QUESTIONS.length,row.question_index);
    const changed=await db.prepare(
     "UPDATE couple_party_games SET round=round+1,version=version+1,phase='question',"+
     "question_index=?,picked_0=NULL,picked_1=NULL,winner=NULL,started_at=?,deadline_at=?,updated_at=?"+
     " WHERE room_id=? AND mode='rapid' AND game_id=? AND round=? AND phase='result'"
    ).bind(next,now+RAPID_COUNTDOWN_MS,now+RAPID_COUNTDOWN_MS+RAPID_SECONDS*1000,
     now,member.room_id,row.game_id,row.round).run();
    if(changed.meta.changes!==1)return fail("La prochaine question a déjà commencé.",409);
    return send(await publicState(db,member,mode,members));
   }
   return fail("Action de quiz inconnue.");
  }
  if(data.action==="pick"){
   if(row.phase!=="choose"||row.turn!==member.seat)return fail("C'est au tour de ton partenaire.",409);
   if(!validChallengeKind(data.kind))return fail("Choisis Action ou Vérité.");
   const n=data.kind==="truth"?TRUTH_PROMPTS.length:ACTION_PROMPTS.length;
   const index=newIndex(n,row.question_index);
   const changed=await db.prepare(
    "UPDATE couple_party_games SET phase='challenge',prompt_kind=?,question_index=?,"+
    "version=version+1,updated_at=? WHERE room_id=? AND mode='truth' AND game_id=?"+
    " AND round=? AND phase='choose' AND turn=?"
   ).bind(data.kind,index,now,member.room_id,row.game_id,row.round,member.seat).run();
   if(changed.meta.changes!==1)return fail("Une carte vient d'être tirée.",409);
   return send(await publicState(db,member,mode,members));
  }
  if(data.action==="finish"||data.action==="pass"){
   if(row.phase!=="challenge"||row.turn!==member.seat)return fail("Ce défi n'est plus à toi.",409);
   const scoreCol=member.seat===0?"score_0":"score_1";
   const credit=data.action==="finish"?1:0;
   const changed=await db.prepare(
    "UPDATE couple_party_games SET phase='choose',prompt_kind=NULL,round=round+1,"+
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

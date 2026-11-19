import type {D1Database} from "@cloudflare/workers-types";
import {notifyPartner,type PushEnv} from "../lib/push";
import {DRAW_WORDS,ESCAPE_SCENES,normalizeGuess,randomIndex,validStroke,type Stroke} from "../lib/duo-arcade-rules";

type Ctx={request:Request;env:PushEnv;waitUntil?:(p:Promise<unknown>)=>void};
type Member={id:string;name:string;room_id:string;seat:number};
type DrawRow={
 room_id:string;game_id:string;round:number;drawer:number;word_index:number;strokes_json:string;
 scores_0:number;scores_1:number;status:"playing"|"revealed"|"finished";expires_at:number;version:number;updated_at:number;last_invite_at:number
};
const DRAW_WIN_SCORE=10;
type EscapeRow={
 room_id:string;game_id:string;scenario:number;stage:number;status:"playing"|"escaped";
 started_at:number;expires_at:number;version:number;attempts:number;updated_at:number;last_invite_at:number
};
const ok=(payload:Record<string,unknown>)=>Response.json({ok:true,...payload},{headers:{"Cache-Control":"private,no-store"}});
const fail=(error:string,status=400)=>Response.json({ok:false,error},{status,headers:{"Cache-Control":"private,no-store"}});
let migration:Promise<void>|null=null;
async function ensure(db:D1Database){
 if(!migration)migration=db.exec(
  "CREATE TABLE IF NOT EXISTS duo_draw_games("+
  "room_id TEXT PRIMARY KEY,game_id TEXT NOT NULL,round INTEGER NOT NULL,drawer INTEGER NOT NULL,"+
  "word_index INTEGER NOT NULL,strokes_json TEXT NOT NULL,scores_0 INTEGER NOT NULL DEFAULT 0,"+
  "scores_1 INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL,expires_at INTEGER NOT NULL,"+
  "version INTEGER NOT NULL DEFAULT 1,updated_at INTEGER NOT NULL,last_invite_at INTEGER NOT NULL DEFAULT 0);"+
  "CREATE TABLE IF NOT EXISTS duo_escape_games("+
  "room_id TEXT PRIMARY KEY,game_id TEXT NOT NULL,scenario INTEGER NOT NULL,stage INTEGER NOT NULL,"+
  "status TEXT NOT NULL,started_at INTEGER NOT NULL,expires_at INTEGER NOT NULL,"+
  "version INTEGER NOT NULL DEFAULT 1,attempts INTEGER NOT NULL DEFAULT 0,"+
  "updated_at INTEGER NOT NULL,last_invite_at INTEGER NOT NULL DEFAULT 0);"
 ).then(()=>{}).catch(e=>{migration=null;throw e});
 await migration;
}
async function authenticate(request:Request,db:D1Database):Promise<Member|null>{
 const bearer=request.headers.get("Authorization")||"";
 if(!/^Bearer [a-f0-9]{64}$/i.test(bearer))return null;
 const hash=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(bearer.slice(7)));
 const digest=Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,"0")).join("");
 const user=await db.prepare("SELECT id,name,room_id,seat FROM members WHERE token_hash=?").bind(digest).first<Member>();
 return user&&(user.seat===0||user.seat===1)?user:null;
}
async function init(db:D1Database,roomId:string){
 const now=Date.now();
 await Promise.all([
  db.prepare("INSERT OR IGNORE INTO duo_draw_games(room_id,game_id,round,drawer,word_index,strokes_json,status,expires_at,updated_at) VALUES(?,?,1,0,?,'[]','playing',?,?)")
   .bind(roomId,crypto.randomUUID(),randomIndex(DRAW_WORDS.length),now+75000,now).run(),
  db.prepare("INSERT OR IGNORE INTO duo_escape_games(room_id,game_id,scenario,stage,status,started_at,expires_at,updated_at) VALUES(?,?,0,0,'playing',?,?,?)")
   .bind(roomId,crypto.randomUUID(),now,now+480000,now).run()
 ]);
}
async function drawRow(db:D1Database,roomId:string){
 return db.prepare("SELECT * FROM duo_draw_games WHERE room_id=?").bind(roomId).first<DrawRow>();
}
async function escapeRow(db:D1Database,roomId:string){
 return db.prepare("SELECT * FROM duo_escape_games WHERE room_id=?").bind(roomId).first<EscapeRow>();
}
function drawPublic(row:DrawRow,member:Member){
 const timedOut=Date.now()>=row.expires_at&&row.status==="playing";
 const isDrawer=row.drawer===member.seat;
 const word=DRAW_WORDS[row.word_index]||DRAW_WORDS[0];
 let strokes:Stroke[]=[];
 try{const stored:unknown=JSON.parse(row.strokes_json);if(Array.isArray(stored))strokes=stored.filter(validStroke)}catch{/* Ignore corrupted historical strokes. */}
 return {
  mode:"draw",id:row.game_id,round:row.round,version:row.version,drawer:row.drawer,
  word:isDrawer||row.status==="revealed"||row.status==="finished"||timedOut?word.word:null,category:word.category,
  strokes,status:timedOut?"timeout":row.status,expiresAt:row.expires_at,
  scores:[row.scores_0,row.scores_1],winScore:DRAW_WIN_SCORE,
  matchWinner:row.status==="finished"?(row.scores_0>=DRAW_WIN_SCORE?0:1):null,
  updatedAt:row.updated_at
 };
}
function escapePublic(row:EscapeRow,member:Member){
 const scene=ESCAPE_SCENES[row.scenario]||ESCAPE_SCENES[0];
 const stage=scene.stages[Math.min(row.stage,2)];
 const timedOut=Date.now()>=row.expires_at&&row.status==="playing";
 return {
  mode:"escape",id:row.game_id,version:row.version,scenario:row.scenario,sceneTitle:scene.title,
  sceneEmoji:scene.emoji,stage:row.stage,totalStages:scene.stages.length,stageTitle:stage.title,
  intro:stage.intro,clue:stage.clues[member.seat],placeholder:stage.placeholder,
  status:timedOut?"timeout":row.status,startedAt:row.started_at,expiresAt:row.expires_at,
  attempts:row.attempts,updatedAt:row.updated_at
 };
}
async function view(db:D1Database,member:Member,mode:"draw"|"escape",members:number,extra:Record<string,unknown>={}){
 if(members!==2)return {mode,members,seat:member.seat,serverNow:Date.now(),game:null,...extra};
 let row=mode==="draw"?await drawRow(db,member.room_id):await escapeRow(db,member.room_id);
 if(mode==="draw"&&row){
  const old=row as DrawRow;
  // Saved drawing games from before the 10-point championship should also
  // finish rather than continue scoring indefinitely after a winner exists.
  if(old.status!=="finished"&&(old.scores_0>=DRAW_WIN_SCORE||old.scores_1>=DRAW_WIN_SCORE)){
   await db.prepare(
    "UPDATE duo_draw_games SET status='finished',version=version+1,updated_at=?"+
    " WHERE room_id=? AND game_id=? AND version=? AND status<>'finished'"
   ).bind(Date.now(),member.room_id,old.game_id,old.version).run();
   row=await drawRow(db,member.room_id);
  }
 }
 const game=row?(mode==="draw"?drawPublic(row as DrawRow,member):escapePublic(row as EscapeRow,member)):null;
 return {mode,members,seat:member.seat,serverNow:Date.now(),game,...extra};
}
async function handle(ctx:Ctx,method:"GET"|"POST"){
 try{
  const db=ctx.env.DB;if(!db)return fail("Jeux momentanément indisponibles.",503);
  const member=await authenticate(ctx.request,db);if(!member)return fail("Session expirée. Reconnecte-toi.",401);
  const mode=new URL(ctx.request.url).searchParams.get("game");
  if(mode!=="draw"&&mode!=="escape")return fail("Jeu inconnu.");
  await ensure(db);
  const count=await db.prepare("SELECT COUNT(*) AS n FROM members WHERE room_id=?").bind(member.room_id).first<{n:number}>();
  const members=Number(count?.n||0);
  if(members===2)await init(db,member.room_id);
  if(method==="GET")return ok(await view(db,member,mode,members));
  if(members!==2)return fail("Invite ton partenaire dans votre espace privé.",409);
  const raw=await ctx.request.text();if(raw.length>5200)return fail("Action trop volumineuse.",413);
  let data:Record<string,unknown>;
  try{data=JSON.parse(raw) as Record<string,unknown>}catch{return fail("Requête invalide.")}
  if(!data||typeof data!=="object")return fail("Requête invalide.");
  const table=mode==="draw"?"duo_draw_games":"duo_escape_games";
  const row=mode==="draw"?await drawRow(db,member.room_id):await escapeRow(db,member.room_id);
  if(!row||data.gameId!==row.game_id)return fail("La partie a changé. Actualise le jeu.",409);
  if(data.action==="invite"){
   const now=Date.now();
   const updated=await db.prepare("UPDATE "+table+" SET last_invite_at=? WHERE room_id=? AND last_invite_at<?")
    .bind(now,member.room_id,now-20000).run();
   if(updated.meta.changes!==1)return fail("Attends un instant avant une autre invitation.",429);
   const title=mode==="draw"?"✏️ Devine mon dessin":"🔐 Escape Room Duo";
   const task=notifyPartner(ctx.env,member.room_id,member.id,title,member.name+" t'invite à jouer ensemble !",mode);
   if(ctx.waitUntil)ctx.waitUntil(task);else void task;
   return ok(await view(db,member,mode,members,{invited:true}));
  }
  const now=Date.now();
  if(mode==="draw"){
   const game=row as DrawRow;
   if(data.action==="restart"){
    if(game.status!=="finished")return fail("Le match n'est pas encore gagné.",409);
    const changed=await db.prepare(
     "UPDATE duo_draw_games SET game_id=?,round=1,drawer=?,word_index=?,"+
     "strokes_json='[]',scores_0=0,scores_1=0,status='playing',expires_at=?,"+
     "version=version+1,updated_at=?"+
     " WHERE room_id=? AND game_id=? AND version=? AND status='finished'"
    ).bind(crypto.randomUUID(),game.drawer===0?1:0,randomIndex(DRAW_WORDS.length),
      now+75000,now,member.room_id,game.game_id,game.version).run();
    if(changed.meta.changes!==1)return fail("Nouvelle partie déjà créée.",409);
    return ok(await view(db,member,mode,members));
   }
   if(data.action==="next"){
    if(game.status==="finished")return fail("Le match est gagné. Lance une nouvelle partie.",409);
    if(game.status!=="revealed"&&now<game.expires_at)return fail("Terminez cette manche avant de continuer.",409);
    const updated=await db.prepare("UPDATE duo_draw_games SET round=round+1,drawer=?,word_index=?,strokes_json='[]',status='playing',expires_at=?,updated_at=?,version=version+1 WHERE room_id=? AND game_id=? AND round=?")
     .bind(game.drawer===0?1:0,randomIndex(DRAW_WORDS.length),now+75000,now,member.room_id,game.game_id,game.round).run();
    if(updated.meta.changes!==1)return fail("Nouvelle manche déjà lancée.",409);
    return ok(await view(db,member,mode,members));
   }
   if(game.status!=="playing"||now>=game.expires_at)return fail("Cette manche est terminée.",409);
   if(data.round!==game.round)return fail("Manche modifiée. Réessaie.",409);
   if(data.action==="stroke"||data.action==="clear"||data.action==="skip"){
    if(member.seat!==game.drawer)return fail("C'est ton partenaire qui dessine.",403);
    if(!Number.isInteger(data.version)||data.version!==game.version)return fail("Le dessin a changé. Réessaie.",409);
    if(data.action==="stroke"){
     if(!validStroke(data.stroke))return fail("Trait de dessin invalide.");
     let strokes:Stroke[];
     try{strokes=JSON.parse(game.strokes_json) as Stroke[]}catch{return fail("Dessin invalide.",500)}
     if(strokes.length>=90)return fail("Le tableau est plein. Termine la manche.");
     strokes.push(data.stroke);
     const updated=await db.prepare("UPDATE duo_draw_games SET strokes_json=?,version=version+1,updated_at=? WHERE room_id=? AND game_id=? AND round=? AND version=? AND status='playing'")
      .bind(JSON.stringify(strokes),now,member.room_id,game.game_id,game.round,game.version).run();
     if(updated.meta.changes!==1)return fail("Le dessin vient de changer. Réessaie.",409);
    }else{
     const updated=await db.prepare("UPDATE duo_draw_games SET "+(data.action==="skip"?"status='revealed'":"strokes_json='[]'")+",version=version+1,updated_at=? WHERE room_id=? AND game_id=? AND round=? AND version=? AND status='playing'")
      .bind(now,member.room_id,game.game_id,game.round,game.version).run();
     if(updated.meta.changes!==1)return fail("Manche modifiée. Réessaie.",409);
    }
    return ok(await view(db,member,mode,members));
   }
   if(data.action==="guess"){
    if(member.seat===game.drawer)return fail("Le dessinateur ne peut pas deviner.",403);
    const guess=normalizeGuess(data.guess);
    if(guess.length<2)return fail("Entre ta réponse.");
    const answer=normalizeGuess(DRAW_WORDS[game.word_index]?.word||"");
    if(guess!==answer)return ok(await view(db,member,mode,members,{correct:false}));
    const column=member.seat===0?"scores_0":"scores_1";
    const updated=await db.prepare(
     "UPDATE duo_draw_games SET "+column+"="+column+"+1,"+
     "status=CASE WHEN "+column+">=? THEN 'finished' ELSE 'revealed' END,"+
     "version=version+1,updated_at=?"+
     " WHERE room_id=? AND game_id=? AND round=? AND status='playing' AND expires_at>?"
    ).bind(DRAW_WIN_SCORE-1,now,member.room_id,game.game_id,game.round,now).run();
    if(updated.meta.changes!==1)return fail("La manche vient de se terminer.",409);
    return ok(await view(db,member,mode,members,{correct:true}));
   }
   return fail("Action inconnue.");
  }
  const game=row as EscapeRow;
  if(data.action==="restart"){
   if(game.status!=="escaped"&&now<game.expires_at)return fail("La mission est encore en cours.",409);
   const updated=await db.prepare("UPDATE duo_escape_games SET scenario=?,stage=0,status='playing',started_at=?,expires_at=?,attempts=0,version=version+1,updated_at=? WHERE room_id=? AND game_id=? AND version=?")
    .bind((game.scenario+1)%ESCAPE_SCENES.length,now,now+480000,now,member.room_id,game.game_id,game.version).run();
   if(updated.meta.changes!==1)return fail("Nouvelle mission déjà commencée.",409);
   return ok(await view(db,member,mode,members));
  }
  if(data.action!=="solve")return fail("Action inconnue.");
  if(game.status!=="playing"||now>=game.expires_at)return fail("La mission est terminée.",409);
  if(data.stage!==game.stage)return fail("Votre partenaire a déjà résolu cette énigme.",409);
  const stage=ESCAPE_SCENES[game.scenario]?.stages[game.stage];
  if(!stage)return fail("Énigme inconnue.",409);
  const answer=normalizeGuess(data.answer);
  if(answer.length<2)return fail("Entre une réponse.");
  if(answer!==normalizeGuess(stage.answer)){
   await db.prepare("UPDATE duo_escape_games SET attempts=attempts+1 WHERE room_id=? AND game_id=? AND stage=? AND status='playing'")
    .bind(member.room_id,game.game_id,game.stage).run();
   return ok(await view(db,member,mode,members,{correct:false}));
  }
  const escaped=game.stage===ESCAPE_SCENES[game.scenario].stages.length-1;
  const updated=await db.prepare("UPDATE duo_escape_games SET stage=stage+1,status=?,version=version+1,updated_at=? WHERE room_id=? AND game_id=? AND stage=? AND status='playing' AND expires_at>?")
   .bind(escaped?"escaped":"playing",now,member.room_id,game.game_id,game.stage,now).run();
  if(updated.meta.changes!==1)return fail("Énigme déjà résolue.",409);
  return ok(await view(db,member,mode,members,{correct:true}));
 }catch(e){
  console.error("Duo arcade API",e);
  return fail("Impossible de synchroniser les jeux.",500);
 }
}
export const onRequestGet=(ctx:Ctx)=>handle(ctx,"GET");
export const onRequestPost=(ctx:Ctx)=>handle(ctx,"POST");

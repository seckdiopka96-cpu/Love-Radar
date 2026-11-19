import type {D1Database} from "@cloudflare/workers-types";
import type {PushEnv} from "../lib/push";
import {
 newSenegalGame,isSenegalGame,rollSenegal,applySenegalMove,movesForPawn,
 autoplayTurn,TURN_MS,type SenegalGame,type SenegalMove,type Action
} from "../../src/ludo-senegal-engine";

type Env=PushEnv;
type Ctx={request:Request;env:Env};
type Member={id:string;room_id:string;seat:number;name:string};
type Row={room_id:string;game_id:string;version:number;state_text:string;updated_at:number};
type Match={id:string;version:number;state:SenegalGame};
type ReactionEvent={id:string;seat:number;emoji:string;at:number};
const REACTION_EMOJIS=new Set(["😝","🤪","🤣","😂","😭","😱","😎","👏","🎁"]);
const send=(payload:object,status=200)=>Response.json(payload,{status,headers:{"Cache-Control":"no-store"}});
const fail=(error:string,status=400)=>send({ok:false,error},status);
let tables:Promise<void>|null=null;
async function ensure(db:D1Database){
 if(!tables){
  tables=db.exec(
   "CREATE TABLE IF NOT EXISTS ludo_senegal_games (room_id TEXT PRIMARY KEY,game_id TEXT NOT NULL,version INTEGER NOT NULL,state_text TEXT NOT NULL,updated_at INTEGER NOT NULL);"+
   "CREATE TABLE IF NOT EXISTS ludo_senegal_moves (room_id TEXT PRIMARY KEY,game_id TEXT NOT NULL,version INTEGER NOT NULL,move_json TEXT NOT NULL,updated_at INTEGER NOT NULL);"+
   "CREATE TABLE IF NOT EXISTS ludo_senegal_reactions (id TEXT PRIMARY KEY,room_id TEXT NOT NULL,game_id TEXT NOT NULL,seat INTEGER NOT NULL,emoji TEXT NOT NULL,updated_at INTEGER NOT NULL);"+
   "CREATE INDEX IF NOT EXISTS idx_senegal_reactions ON ludo_senegal_reactions(room_id,game_id,updated_at);"
  ).then(()=>{}).catch(error=>{tables=null;throw error});
 }
 await tables;
}
async function member(request:Request,db:D1Database):Promise<Member|null>{
 const header=request.headers.get("Authorization")||"";
 if(!/^Bearer [a-f0-9]{64}$/.test(header))return null;
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(header.slice(7)));
 const hash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,"0")).join("");
 return await db.prepare("SELECT id,room_id,seat,name FROM members WHERE token_hash=?").bind(hash).first<Member>();
}
async function get(db:D1Database,room:string):Promise<Match|null>{
 const row=await db.prepare("SELECT * FROM ludo_senegal_games WHERE room_id=?").bind(room).first<Row>();
 if(!row)return null;
 const state:unknown=JSON.parse(row.state_text);
 if(!isSenegalGame(state))throw Error("Invalid Senegal game persisted state");
 return {id:row.game_id,version:row.version,state};
}
async function init(db:D1Database,room:string){
 await db.prepare("INSERT OR IGNORE INTO ludo_senegal_games(room_id,game_id,version,state_text,updated_at) VALUES(?,?,1,?,?)")
  .bind(room,crypto.randomUUID(),JSON.stringify(newSenegalGame()),Date.now()).run();
}
async function save(db:D1Database,room:string,current:Match,next:SenegalGame,newId=current.id):Promise<Match|null>{
 const outcome=await db.prepare("UPDATE ludo_senegal_games SET game_id=?,version=version+1,state_text=?,updated_at=? WHERE room_id=? AND version=?")
  .bind(newId,JSON.stringify(next),Date.now(),room,current.version).run();
 if(outcome.meta.changes!==1)return null;
 return {id:newId,version:current.version+1,state:next};
}
async function recordMove(db:D1Database,room:string,game:Match,move:SenegalMove|null){
 if(!move)return;
 try{
  await db.prepare("INSERT INTO ludo_senegal_moves(room_id,game_id,version,move_json,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(room_id) DO UPDATE SET game_id=excluded.game_id,version=excluded.version,move_json=excluded.move_json,updated_at=excluded.updated_at")
   .bind(room,game.id,game.version,JSON.stringify(move),Date.now()).run();
 }catch(error){console.error("Senegal optional move animation",error)}
}
async function lastMove(db:D1Database,room:string,game:Match){
 // Keep the last legal pawn route visible even when an opponent rolls again
 // before the other phone receives its next 1.4 s polling response.
 const row=await db.prepare("SELECT move_json,version FROM ludo_senegal_moves WHERE room_id=? AND game_id=? AND updated_at>?")
  .bind(room,game.id,Date.now()-20000).first<{move_json:string;version:number}>();
 if(!row)return null;
 try{return {move:JSON.parse(row.move_json) as SenegalMove,version:row.version}}catch{return null}
}
async function recentReactions(db:D1Database,room:string,gameId:string):Promise<ReactionEvent[]>{
 const rows=await db.prepare("SELECT id,seat,emoji,updated_at AS at FROM ludo_senegal_reactions WHERE room_id=? AND game_id=? AND updated_at>? ORDER BY updated_at DESC LIMIT 8")
  .bind(room,gameId,Date.now()-9000).all<ReactionEvent>();
 return rows.results||[];
}
async function autoIfLate(db:D1Database,room:string,game:Match):Promise<Match>{
 if(game.state.status!=="playing"||Date.now()-game.state.updatedAt<TURN_MS)return game;
 const result=autoplayTurn(game.state);
 const updated=await save(db,room,game,result.game);
 if(!updated)return await get(db,room)||game;
 await recordMove(db,room,updated,result.move);
 return updated;
}
const expose=(game:Match|null)=>game?{
 ...game.state,id:game.id,version:game.version,
 deadlineAt:game.state.status==="playing"?game.state.updatedAt+TURN_MS:null
}:null;
async function handle(ctx:Ctx,method:"GET"|"POST"){
 try{
  const db=ctx.env.DB;
  if(!db)return fail("Base de données manquante.",503);
  const player=await member(ctx.request,db);
  if(!player)return fail("Session expirée. Reconnecte-toi.",401);
  await ensure(db);
  const count=await db.prepare("SELECT COUNT(*) AS total FROM members WHERE room_id=?").bind(player.room_id).first<{total:number}>();
  const members=Number(count?.total||0);
  let game:Match|null=members===2?await get(db,player.room_id):null;
  if(members===2&&!game){await init(db,player.room_id);game=await get(db,player.room_id)}
  if(game)game=await autoIfLate(db,player.room_id,game);
  if(method==="GET"){
   const recent=game?await lastMove(db,player.room_id,game):null;
   return send({ok:true,members,seat:player.seat,game:expose(game),
    move:recent?.move??null,moveVersion:recent?.version??null,
    reactions:game?await recentReactions(db,player.room_id,game.id):[],serverNow:Date.now()});
  }
  if(members!==2||!game)return fail("Invitez votre partenaire pour jouer au Ludo Sénégal à deux.",409);
  const body=await ctx.request.text();
  if(body.length>1024)return fail("Requête trop grande.",413);
  let data:Record<string,unknown>;
  try{data=JSON.parse(body) as Record<string,unknown>}catch{return fail("Requête invalide.")}
  const action=data.action;
  // Reaction events are independent of pawn turns/versions; a partner may
  // react while a captured pawn is still animating on the other phone.
  if(action==="react"){
   if(typeof data.emoji!=="string"||!REACTION_EMOJIS.has(data.emoji))return fail("Réaction inconnue.",400);
   const now=Date.now();
   await db.prepare("INSERT INTO ludo_senegal_reactions(id,room_id,game_id,seat,emoji,updated_at) SELECT ?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM ludo_senegal_reactions WHERE room_id=? AND game_id=? AND seat=? AND updated_at>?)")
    .bind(crypto.randomUUID(),player.room_id,game.id,player.seat,data.emoji,now,
      player.room_id,game.id,player.seat,now-700).run();
   return send({ok:true,reactions:await recentReactions(db,player.room_id,game.id),serverNow:now});
  }
  if(!Number.isInteger(data.version)||data.version!==game.version)return fail("Le plateau a changé, actualisation nécessaire.",409);
  const current=game.state;
  let next:SenegalGame=current;
  let move:SenegalMove|null=null;
  let gameId=game.id;
  if(action==="restart"){
   // Explicit restart makes a fresh Senegal match, without disturbing Ludo Duo.
   next=newSenegalGame();gameId=crypto.randomUUID();
  }else{
   if(current.status!=="playing")return fail("La manche est terminée.",409);
   if(current.turn!==player.seat)return fail("C'est au tour de ton partenaire.",403);
   if(action==="roll"){
    if(current.dice!==null)return fail("Déplace d'abord ton pion.",409);
    const bytes=new Uint8Array(1);
    do{crypto.getRandomValues(bytes)}while(bytes[0]>=252);
    const rolled=bytes[0]%6+1;
    next=rollSenegal(current,rolled);
    next={...next,lastAction:player.name.slice(0,25)+" : "+next.lastAction};
   }else if(action==="move"){
    if(!Number.isInteger(data.pawn)||Number(data.pawn)<0||Number(data.pawn)>3||
       typeof data.moveKind!=="string")return fail("Pion ou déplacement invalide.",400);
    const allowedKinds=["track","home","enemy","exit","turn"];
    if(!allowedKinds.includes(data.moveKind))return fail("Déplacement inconnu.",400);
    const options=movesForPawn(current,player.seat as 0|1,Number(data.pawn));
    const picked=options.find(o=>o.action===data.moveKind&&
      (data.gate===undefined||o.to.gate===data.gate)&&
      (data.dest===undefined||o.to.step===data.dest));
    if(!picked)return fail("Cette direction n'est pas autorisée.",409);
    const result=applySenegalMove(current,picked);
    if(!result)return fail("Le pion ne peut pas avancer.",409);
    next=result.game;move=result.move;
   }else return fail("Action inconnue.",404);
  }
  const saved=await save(db,player.room_id,game,next,gameId);
  if(!saved)return fail("Un autre coup vient d'être joué. Actualise le plateau.",409);
  if(action==="restart"){
   await db.prepare("DELETE FROM ludo_senegal_moves WHERE room_id=?").bind(player.room_id).run();
  }else await recordMove(db,player.room_id,saved,move);
  return send({ok:true,members,seat:player.seat,game:expose(saved),move,
   moveVersion:move?saved.version:null,reactions:await recentReactions(db,player.room_id,saved.id),serverNow:Date.now()});
 }catch(error){console.error("Ludo Sénégal request",error);return fail("Le jeu n'est pas disponible pour le moment.",500)}
}
export const onRequestGet=(ctx:Ctx)=>handle(ctx,"GET");
export const onRequestPost=(ctx:Ctx)=>handle(ctx,"POST");

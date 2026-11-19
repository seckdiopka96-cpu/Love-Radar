import type {D1Database} from "@cloudflare/workers-types";
import {notifyPartner,type PushEnv} from "../lib/push";
import {isRpsMove,rpsWinner,type RpsMove} from "../../src/rps-engine";

/** Private, server-authoritative two-player Pierre–Papier–Ciseaux.
 * D1 stores both moves, but neither is sent to the other player before
 * the two selections are committed. SQL compare-and-set prevents double scores.
 */
type Ctx={request:Request;env:PushEnv;waitUntil?:(task:Promise<unknown>)=>void};
type Member={id:string;room_id:string;seat:number;name:string};
type Row={
 room_id:string;game_id:string;round:number;version:number;status:"choosing"|"revealed";
 move_0:RpsMove|null;move_1:RpsMove|null;score_0:number;score_1:number;ties:number;
 winner:number|null;ready_0:number;ready_1:number;updated_at:number;revealed_at:number|null;last_invite_at:number;
};
const yes=(body:Record<string,unknown>)=>Response.json({ok:true,...body},{headers:{"Cache-Control":"private, no-store"}});
const no=(error:string,status=400)=>Response.json({ok:false,error},{status,headers:{"Cache-Control":"private, no-store"}});
// Show the revealed hands before automatically starting the next round.
const RESULT_DISPLAY_MS=4500;
let ready:Promise<void>|null=null;
async function ensure(db:D1Database){
 if(!ready)ready=db.exec(
  "CREATE TABLE IF NOT EXISTS rps_games("+
  "room_id TEXT PRIMARY KEY,game_id TEXT NOT NULL,round INTEGER NOT NULL DEFAULT 1,"+
  "version INTEGER NOT NULL DEFAULT 1,status TEXT NOT NULL DEFAULT 'choosing',"+
  "move_0 TEXT,move_1 TEXT,score_0 INTEGER NOT NULL DEFAULT 0,score_1 INTEGER NOT NULL DEFAULT 0,"+
  "ties INTEGER NOT NULL DEFAULT 0,winner INTEGER,ready_0 INTEGER NOT NULL DEFAULT 0,"+
  "ready_1 INTEGER NOT NULL DEFAULT 0,updated_at INTEGER NOT NULL,"+
  "revealed_at INTEGER,last_invite_at INTEGER NOT NULL DEFAULT 0)"
 ).then(()=>{}).catch(error=>{ready=null;throw error});
 await ready;
}
async function authenticate(request:Request,db:D1Database){
 const header=request.headers.get("Authorization")||"";
 if(!/^Bearer [a-f0-9]{64}$/i.test(header))return null;
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(header.slice(7)));
 const hash=Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,"0")).join("");
 return db.prepare("SELECT id,room_id,seat,name FROM members WHERE token_hash=?")
  .bind(hash).first<Member>();
}
async function getRow(db:D1Database,roomId:string){
 return db.prepare("SELECT * FROM rps_games WHERE room_id=?").bind(roomId).first<Row>();
}
async function publicState(db:D1Database,player:Member,members:number){
 let row=members===2?await getRow(db,player.room_id):null;
 if(row?.status==="revealed"&&row.revealed_at!==null&&
    Date.now()-row.revealed_at>=RESULT_DISPLAY_MS){
  // Compare-and-set: only one client can advance the round.
  await db.prepare("UPDATE rps_games SET round=round+1,version=version+1,status='choosing',"+
   "move_0=NULL,move_1=NULL,winner=NULL,ready_0=0,ready_1=0,revealed_at=NULL,updated_at=?"+
   " WHERE room_id=? AND game_id=? AND round=? AND status='revealed' AND revealed_at<=?")
   .bind(Date.now(),player.room_id,row.game_id,row.round,Date.now()-RESULT_DISPLAY_MS).run();
  row=await getRow(db,player.room_id);
 }
 if(!row)return {members,seat:player.seat,game:null,serverNow:Date.now()};
 const mine=player.seat===0?row.move_0:row.move_1;
 const partner=player.seat===0?row.move_1:row.move_0;
 // Privacy invariant: no opponent move before the server reveals the round.
 return {members,seat:player.seat,game:{
  id:row.game_id,round:row.round,version:row.version,status:row.status,
  mine,partnerPicked:partner!==null,
  partnerMove:row.status==="revealed"?partner:null,
  scores:[row.score_0,row.score_1],ties:row.ties,winner:row.status==="revealed"?row.winner:null,
  ready:[!!row.ready_0,!!row.ready_1],
  updatedAt:row.updated_at,revealedAt:row.revealed_at
 },serverNow:Date.now()};
}
async function handle(ctx:Ctx,method:"GET"|"POST"){
 try{
  const db=ctx.env.DB;
  if(!db)return no("Base de données indisponible.",503);
  const member=await authenticate(ctx.request,db);
  if(!member)return no("Session expirée.",401);
  if(member.seat!==0&&member.seat!==1)return no("Position de joueur invalide.",403);
  await ensure(db);
  const count=await db.prepare("SELECT COUNT(*) AS n FROM members WHERE room_id=?")
   .bind(member.room_id).first<{n:number}>();
  const members=Number(count?.n||0);
  if(members===2){
   await db.prepare("INSERT OR IGNORE INTO rps_games(room_id,game_id,updated_at) VALUES(?,?,?)")
    .bind(member.room_id,crypto.randomUUID(),Date.now()).run();
  }
  if(method==="GET")return yes(await publicState(db,member,members));
  if(members!==2)return no("Invite ton partenaire pour jouer à deux.",409);
  const raw=await ctx.request.text();
  if(raw.length>700)return no("Requête trop grande.",413);
  let data:Record<string,unknown>;
  try{data=JSON.parse(raw) as Record<string,unknown>}catch{return no("Requête invalide.")}
  const game=await getRow(db,member.room_id);
  if(!game)return no("Partie momentanément indisponible.",503);
  if(typeof data.gameId!=="string"||data.gameId!==game.game_id)return no("La partie a changé. Actualise le jeu.",409);
  if(data.action==="invite"){
   const now=Date.now();
   const ok=await db.prepare("UPDATE rps_games SET last_invite_at=? WHERE room_id=? AND last_invite_at<?")
    .bind(now,member.room_id,now-20000).run();
   if(ok.meta.changes!==1)return no("Patiente un instant avant une autre invitation.",429);
   const task=notifyPartner(ctx.env,member.room_id,member.id,"✊✋✌️ Défi Pierre–Papier–Ciseaux",member.name+" t’invite à jouer en direct !","rps",{kind:"rps-challenge",id:game.game_id});
   if(ctx.waitUntil)ctx.waitUntil(task);else void task;
   return yes({invited:true,...await publicState(db,member,members)});
  }
  if(!Number.isInteger(data.round)||data.round!==game.round)return no("Cette manche est terminée. Actualise le jeu.",409);
  if(data.action==="choose"){
   if(!isRpsMove(data.move))return no("Choisis Pierre, Papier ou Ciseaux.",400);
   if(game.status!=="choosing")return no("La manche est déjà révélée.",409);
   const column=member.seat===0?"move_0":"move_1";
   // An already submitted move can be retried, never changed mid-round.
   const chosen=await db.prepare("UPDATE rps_games SET "+column+"=?,version=version+1,updated_at=? WHERE room_id=? AND game_id=? AND round=? AND status='choosing' AND "+column+" IS NULL")
    .bind(data.move,Date.now(),member.room_id,game.game_id,game.round).run();
   if(chosen.meta.changes!==1){
    const current=await getRow(db,member.room_id);
    if(current?.round!==game.round||current?.status!=="choosing"||
      (member.seat===0?current?.move_0:current?.move_1)!==data.move)
     return no("Tu as déjà choisi pour cette manche.",409);
   }
   const completed=await getRow(db,member.room_id);
   if(completed?.status==="choosing"&&isRpsMove(completed.move_0)&&isRpsMove(completed.move_1)){
    const winner=rpsWinner(completed.move_0,completed.move_1);
    // Only one concurrent request can score a revealed round.
    await db.prepare("UPDATE rps_games SET status='revealed',winner=?,"+
     "score_0=score_0+?,score_1=score_1+?,ties=ties+?,revealed_at=?,updated_at=?,version=version+1"+
     " WHERE room_id=? AND game_id=? AND round=? AND status='choosing' AND move_0=? AND move_1=?")
     .bind(winner,winner===0?1:0,winner===1?1:0,winner===null?1:0,
      Date.now(),Date.now(),member.room_id,game.game_id,game.round,completed.move_0,completed.move_1).run();
   }
   return yes(await publicState(db,member,members));
  }
  if(data.action==="next"){
   if(game.status!=="revealed")return no("La manche actuelle n’est pas terminée.",409);
   const readyCol=member.seat===0?"ready_0":"ready_1";
   await db.prepare("UPDATE rps_games SET "+readyCol+"=1,version=version+1,updated_at=? WHERE room_id=? AND game_id=? AND round=? AND status='revealed' AND "+readyCol+"=0")
    .bind(Date.now(),member.room_id,game.game_id,game.round).run();
   const current=await getRow(db,member.room_id);
   if(current?.round===game.round&&current.ready_0&&current.ready_1){
    await db.prepare("UPDATE rps_games SET round=round+1,version=version+1,status='choosing',"+
     "move_0=NULL,move_1=NULL,winner=NULL,ready_0=0,ready_1=0,revealed_at=NULL,updated_at=?"+
     " WHERE room_id=? AND game_id=? AND round=? AND status='revealed' AND ready_0=1 AND ready_1=1")
     .bind(Date.now(),member.room_id,game.game_id,game.round).run();
   }
   return yes(await publicState(db,member,members));
  }
  return no("Action inconnue.",400);
 }catch(error){
  console.error("Pierre Papier Ciseaux API",error);
  return no("Le jeu est momentanément indisponible.",500);
 }
}
export const onRequestGet=(ctx:Ctx)=>handle(ctx,"GET");
export const onRequestPost=(ctx:Ctx)=>handle(ctx,"POST");

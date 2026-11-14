import type {D1Database} from "@cloudflare/workers-types";
import {notifyPartner,type PushEnv} from "../lib/push";

/* Private two-player matching game: the server owns the secret deck and all turns. */
type Env=PushEnv;
type Ctx={request:Request;env:Env;waitUntil:(task:Promise<unknown>)=>void};
type Member={id:string;room_id:string;seat:number;name:string};
type GameRow={room_id:string;game_id:string;version:number;turn:number;deck:string;matched:string;revealed:string;scores:string;seen:string;status:string;winner:number|null;pending_until:number|null;last_action:string;updated_at:number};
type Game={room_id:string;game_id:string;version:number;turn:number;deck:number[];matched:number[];revealed:number[];scores:[number,number];seen:number[];status:"playing"|"won";winner:number|null;pending_until:number|null;last_action:string;updated_at:number};
type AgreementRow={signed_0_name:string|null;signed_1_name:string|null;signed_0_at:number|null;signed_1_at:number|null;gift_0:number|null;gift_1:number|null;started_at:number|null};
type Agreement={signed:[boolean,boolean];names:[string|null,string|null];signedAt:[number|null,number|null];giftChoices:[boolean|null,boolean|null];startedAt:number|null};
type GiftRow={choice:string|null;chosen_by:number|null;given:number};
type Challenge={gameId:string;fromId:string;fromName:string;fromSeat:number;sentAt:number};
const TURN_MS=30000,MISMATCH_MS=1450;
const SYMBOLS=["❤️","💌","🌹","💍","🦋","🌙","💖","🎁"];
const GIFTS=new Set(["credit","internet","wave2000"]);
const no=(error:string,status=400)=>Response.json({ok:false,error},{status,headers:{"Cache-Control":"no-store"}});
const yes=(data:Record<string,unknown>)=>Response.json({ok:true,...data},{headers:{"Cache-Control":"no-store"}});
const tidy=(name:string)=>name.normalize("NFC").trim().replace(/\s+/g," ").toLocaleLowerCase("fr");
let ready:Promise<void>|null=null;
async function ensure(db:D1Database){
 if(!ready)ready=db.exec(
  "CREATE TABLE IF NOT EXISTS memory_games (room_id TEXT PRIMARY KEY,game_id TEXT NOT NULL,version INTEGER NOT NULL,turn INTEGER NOT NULL,deck TEXT NOT NULL,matched TEXT NOT NULL,revealed TEXT NOT NULL,scores TEXT NOT NULL,seen TEXT NOT NULL,status TEXT NOT NULL,winner INTEGER,pending_until INTEGER,last_action TEXT NOT NULL,updated_at INTEGER NOT NULL);"+
  "CREATE TABLE IF NOT EXISTS memory_agreements (room_id TEXT PRIMARY KEY,game_id TEXT NOT NULL,signed_0_name TEXT,signed_1_name TEXT,signed_0_at INTEGER,signed_1_at INTEGER,gift_0 INTEGER,gift_1 INTEGER,started_at INTEGER);"+
  "CREATE TABLE IF NOT EXISTS memory_gifts (room_id TEXT PRIMARY KEY,game_id TEXT NOT NULL,choice TEXT,chosen_by INTEGER,given INTEGER NOT NULL DEFAULT 0);"+
  "CREATE TABLE IF NOT EXISTS memory_challenges (room_id TEXT PRIMARY KEY,game_id TEXT NOT NULL,from_id TEXT NOT NULL,from_name TEXT NOT NULL,sent_at INTEGER NOT NULL)"
 ).then(()=>{}).catch(e=>{ready=null;throw e});
 await ready;
}
async function member(request:Request,db:D1Database){
 const h=request.headers.get("Authorization")||"";
 if(!/^Bearer [a-f0-9]{64}$/.test(h))return null;
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(h.slice(7)));
 const hash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,"0")).join("");
 return db.prepare("SELECT id,room_id,seat,name FROM members WHERE token_hash=?").bind(hash).first<Member>();
}
function shuffled(){
 const values=[0,1,2,3,4,5,6,7,0,1,2,3,4,5,6,7];
 for(let i=values.length-1;i>0;i--){
  const bytes=new Uint32Array(1);crypto.getRandomValues(bytes);
  const j=bytes[0]%(i+1);
  [values[i],values[j]]=[values[j],values[i]];
 }
 return values;
}
function parse(row:GameRow):Game{
 const deck=JSON.parse(row.deck) as number[],matched=JSON.parse(row.matched) as number[];
 const revealed=JSON.parse(row.revealed) as number[],scores=JSON.parse(row.scores) as [number,number],seen=JSON.parse(row.seen) as number[];
 if(deck.length!==16||matched.some(n=>n<0||n>15)||revealed.length>2)throw Error("Invalid Memory Love state");
 return {...row,deck,matched,revealed,scores,seen,status:row.status==="won"?"won":"playing"};
}
async function read(db:D1Database,room:string):Promise<Game|null>{
 const row=await db.prepare("SELECT * FROM memory_games WHERE room_id=?").bind(room).first<GameRow>();
 return row?parse(row):null;
}
async function create(db:D1Database,room:string){
 await db.prepare("INSERT OR IGNORE INTO memory_games(room_id,game_id,version,turn,deck,matched,revealed,scores,seen,status,winner,pending_until,last_action,updated_at) VALUES(?,?,1,0,?,'[]','[]','[0,0]','[]','playing',NULL,NULL,?,?)")
 .bind(room,crypto.randomUUID(),JSON.stringify(shuffled()),"Une partie Memory Love vous attend ❤️",Date.now()).run();
}
async function save(db:D1Database,g:Game){
 const change=await db.prepare("UPDATE memory_games SET game_id=?,version=version+1,turn=?,deck=?,matched=?,revealed=?,scores=?,seen=?,status=?,winner=?,pending_until=?,last_action=?,updated_at=? WHERE room_id=? AND version=?")
 .bind(g.game_id,g.turn,JSON.stringify(g.deck),JSON.stringify(g.matched),JSON.stringify(g.revealed),JSON.stringify(g.scores),JSON.stringify(g.seen),g.status,g.winner,g.pending_until,g.last_action,Date.now(),g.room_id,g.version).run();
 return change.meta.changes===1;
}
async function initAgreements(db:D1Database,g:Game){
 await db.prepare("INSERT INTO memory_agreements(room_id,game_id) VALUES(?,?) ON CONFLICT(room_id) DO UPDATE SET game_id=excluded.game_id,signed_0_name=NULL,signed_1_name=NULL,signed_0_at=NULL,signed_1_at=NULL,gift_0=NULL,gift_1=NULL,started_at=NULL WHERE memory_agreements.game_id<>excluded.game_id")
 .bind(g.room_id,g.game_id).run();
 await db.prepare("INSERT INTO memory_gifts(room_id,game_id) VALUES(?,?) ON CONFLICT(room_id) DO UPDATE SET game_id=excluded.game_id,choice=NULL,chosen_by=NULL,given=0 WHERE memory_gifts.game_id<>excluded.game_id")
 .bind(g.room_id,g.game_id).run();
}
async function agreement(db:D1Database,g:Game):Promise<Agreement>{
 const row=await db.prepare("SELECT signed_0_name,signed_1_name,signed_0_at,signed_1_at,gift_0,gift_1,started_at FROM memory_agreements WHERE room_id=? AND game_id=?")
 .bind(g.room_id,g.game_id).first<AgreementRow>();
 return {signed:[Boolean(row?.signed_0_at),Boolean(row?.signed_1_at)],
  names:[row?.signed_0_name||null,row?.signed_1_name||null],
  signedAt:[row?.signed_0_at||null,row?.signed_1_at||null],
  giftChoices:[row?.gift_0==null?null:Boolean(row.gift_0),row?.gift_1==null?null:Boolean(row.gift_1)],
  startedAt:row?.started_at||null};
}
async function gift(db:D1Database,g:Game){
 const row=await db.prepare("SELECT choice,chosen_by,given FROM memory_gifts WHERE room_id=? AND game_id=?")
 .bind(g.room_id,g.game_id).first<GiftRow>();
 return {choice:row?.choice&&GIFTS.has(row.choice)?row.choice:null,chosenBy:row?.chosen_by??null,given:Boolean(row?.given)};
}
async function challenge(db:D1Database,g:Game){
 return db.prepare("SELECT c.game_id AS gameId,c.from_id AS fromId,c.from_name AS fromName,m.seat AS fromSeat,c.sent_at AS sentAt FROM memory_challenges c JOIN members m ON m.id=c.from_id WHERE c.room_id=? AND c.game_id=?")
  .bind(g.room_id,g.game_id).first<Challenge>();
}
function publicGame(g:Game,a:Agreement){
 const shown=new Set([...g.matched,...g.revealed]);
 return {id:g.game_id,version:g.version,turn:g.turn,cards:g.deck.map((s,i)=>shown.has(i)?SYMBOLS[s]:null),
  matched:g.matched,revealed:g.revealed,scores:g.scores,status:g.status,winner:g.winner,
  pendingUntil:g.pending_until,deadlineAt:g.status==="playing"&&a.startedAt&&!g.pending_until?Math.max(g.updated_at,a.startedAt)+TURN_MS:null,
  lastAction:g.last_action,updatedAt:g.updated_at};
}
function flip(g:Game,seat:number,index:number,name:string){
 if(g.status!=="playing"||g.turn!==seat||g.pending_until)return false;
 if(!Number.isInteger(index)||index<0||index>=16||g.matched.includes(index)||g.revealed.includes(index)||g.revealed.length>=2)return false;
 g.revealed.push(index);
 if(!g.seen.includes(index))g.seen.push(index);
 if(g.revealed.length===1){g.last_action=name+" a retourné une carte.";return true}
 const [first,second]=g.revealed;
 if(g.deck[first]===g.deck[second]){
  g.matched.push(first,second);
  g.scores[seat]++;
  g.revealed=[];
  g.last_action=name+" a trouvé une paire ! 💕 Il ou elle rejoue.";
  if(g.matched.length===16){
   g.status="won";g.winner=g.scores[0]===g.scores[1]?null:(g.scores[0]>g.scores[1]?0:1);
   g.last_action=g.winner===null?"Égalité ! 💕":name+" a trouvé la dernière paire ! 🏆";
  }
 }else{
  g.pending_until=Date.now()+MISMATCH_MS;
  g.last_action=name+" n’a pas trouvé de paire. Au tour de son partenaire…";
 }
 return true;
}
function randomFrom(list:number[]){
 if(!list.length)return -1;
 const n=new Uint32Array(1);crypto.getRandomValues(n);
 return list[n[0]%list.length];
}
/* Bot knows cards exposed during previous human/bot turns, not the hidden deck. */
function chooseBot(g:Game){
 const available=Array.from({length:16},(_,i)=>i).filter(i=>!g.matched.includes(i)&&!g.revealed.includes(i));
 if(!available.length)return -1;
 const known=available.filter(i=>g.seen.includes(i));
 if(g.revealed.length===1){
  const first=g.revealed[0];
  const pair=known.find(i=>g.deck[i]===g.deck[first]);
  if(pair!==undefined)return pair;
 }else{
  const pair=known.find(i=>known.some(j=>i!==j&&g.deck[i]===g.deck[j]));
  if(pair!==undefined)return pair;
 }
 return randomFrom(available.filter(i=>!g.seen.includes(i)).length?available.filter(i=>!g.seen.includes(i)):available);
}
function botTurn(g:Game,name:string){
 const seat=g.turn;
 // A matched pair retains the same turn; bot resolves the full timed-out turn.
 for(let steps=0;steps<16&&g.status==="playing"&&!g.pending_until&&g.turn===seat;steps++){
  const index=chooseBot(g);if(index<0)break;
  if(!flip(g,seat,index,name))break;
  if(g.revealed.length===2)break; // mismatch display remains visible for 1.45s
 }
 g.last_action="🤖 30 secondes écoulées : l’ordinateur a joué pour "+name+". "+g.last_action;
}
async function settle(db:D1Database,g:Game,a:Agreement){
 if(g.status!=="playing"||!a.startedAt)return g;
 const time=Date.now();
 if(g.pending_until&&time>=g.pending_until){
  g.pending_until=null;g.revealed=[];g.turn=1-g.turn;
  g.last_action="Les cartes se retournent. À l’autre joueur !";
  if(!await save(db,g))return await read(db,g.room_id)||g;
  return await read(db,g.room_id)||g;
 }
 if(!g.pending_until&&time>=Math.max(g.updated_at,a.startedAt)+TURN_MS){
  const other=await db.prepare("SELECT name FROM members WHERE room_id=? AND seat=?").bind(g.room_id,g.turn).first<{name:string}>();
  botTurn(g,(other?.name||"le joueur").slice(0,30));
  if(!await save(db,g))return await read(db,g.room_id)||g;
  return await read(db,g.room_id)||g;
 }
 return g;
}
async function handle(ctx:Ctx,method:"GET"|"POST"){
 try{
  const db=ctx.env.DB;if(!db)return no("Memory Love est momentanément indisponible.",503);
  const u=await member(ctx.request,db);if(!u)return no("Session expirée, reconnecte-toi.",401);
  await ensure(db);
  const total=await db.prepare("SELECT COUNT(*) AS n FROM members WHERE room_id=?").bind(u.room_id).first<{n:number}>();
  const members=Number(total?.n||0);
  let g=members===2?await read(db,u.room_id):null;
  if(members===2&&!g){await create(db,u.room_id);g=await read(db,u.room_id)}
  let a:Agreement|null=null;
  if(g){await initAgreements(db,g);a=await agreement(db,g);g=await settle(db,g,a)}
  const payload=async()=>({
   members,seat:u.seat,game:g&&a?publicGame(g,a):null,
   agreement:a,gift:g?await gift(db,g):null,challenge:g?await challenge(db,g):null,serverNow:Date.now()
  });
  if(method==="GET")return yes(await payload());
  if(members!==2||!g||!a)return no("Il faut vos deux comptes pour jouer.",409);
  const raw=await ctx.request.text();if(raw.length>1400)return no("Requête trop grande.",413);
  let data:Record<string,unknown>;
  try{data=JSON.parse(raw) as Record<string,unknown>}catch{return no("Requête invalide.",400)}
  const action=data.action;
  if(action==="challenge"){
   if(g.status!=="playing"||a.startedAt)return no("Le défi est déjà en cours. Une nouvelle invitation sera possible à la prochaine manche.",409);
   const now=Date.now();
   const result=await db.prepare("INSERT INTO memory_challenges(room_id,game_id,from_id,from_name,sent_at) VALUES(?,?,?,?,?) "+
    "ON CONFLICT(room_id) DO UPDATE SET game_id=excluded.game_id,from_id=excluded.from_id,from_name=excluded.from_name,sent_at=excluded.sent_at "+
    "WHERE memory_challenges.game_id<>excluded.game_id OR memory_challenges.sent_at<?")
    .bind(u.room_id,g.game_id,u.id,u.name.slice(0,30),now,now-60000).run();
   if(result.meta.changes!==1)return no("Défi déjà envoyé. Réessaie dans une minute.",429);
   ctx.waitUntil(notifyPartner(ctx.env,u.room_id,u.id,"💞 Défi Memory Love",u.name+" t’invite à retrouver les paires ! Appuie pour lire et signer.","memory",{kind:"memory-challenge",id:g.game_id}));
   return yes({challenge:await challenge(db,g),sent:true});
  }
  if(action==="sign"){
   if(g.status!=="playing"||a.startedAt)return no("Cette partie a déjà commencé.",409);
   if(data.readRules!==true||typeof data.signature!=="string"||data.signature.length>80||
     tidy(data.signature)!==tidy(u.name)||typeof data.giftConsent!=="boolean")
    return no("Lis les règles, choisis avec ou sans cadeau et signe avec ton nom de profil.",400);
   const prefix=u.seat===0?"0":"1",now=Date.now();
   const updated=await db.prepare("UPDATE memory_agreements SET signed_"+prefix+"_name=?,signed_"+prefix+"_at=?,gift_"+prefix+"=? WHERE room_id=? AND game_id=? AND started_at IS NULL")
    .bind(u.name,now,data.giftConsent?1:0,u.room_id,g.game_id).run();
   if(updated.meta.changes!==1)return no("La partie vient de commencer.",409);
   await db.prepare("UPDATE memory_agreements SET started_at=? WHERE room_id=? AND game_id=? AND signed_0_at IS NOT NULL AND signed_1_at IS NOT NULL AND started_at IS NULL")
    .bind(now,u.room_id,g.game_id).run();
   a=await agreement(db,g);
   return yes(await payload());
  }
  if(action==="gift_choose"){
   if(g.status!=="won"||g.winner!==u.seat)return no("Seul le gagnant peut choisir son cadeau.",403);
   if(!a.giftChoices.every(x=>x===true))return no("Vous devez avoir tous les deux accepté le défi cadeau.",409);
   if(typeof data.choice!=="string"||!GIFTS.has(data.choice))return no("Cadeau inconnu.",400);
   await db.prepare("UPDATE memory_gifts SET choice=?,chosen_by=?,given=0 WHERE room_id=? AND game_id=?")
    .bind(data.choice,u.seat,u.room_id,g.game_id).run();
   return yes(await payload());
  }
  if(action==="gift_given"){
   const selected=await gift(db,g);
   if(g.status!=="won"||g.winner===u.seat||!selected.choice)return no("Aucun cadeau à confirmer.",403);
   if(data.given!==true)return no("Confirmation invalide.",400);
   await db.prepare("UPDATE memory_gifts SET given=1 WHERE room_id=? AND game_id=?").bind(u.room_id,g.game_id).run();
   return yes(await payload());
  }
  if(!Number.isInteger(data.version)||data.version!==g.version)return no("La partie a changé. Actualise.",409);
  if(action==="restart"){
   if(g.status!=="won")return no("Terminez la manche avant de recommencer.",409);
   const lastWinner=g.winner;
   g.game_id=crypto.randomUUID();g.turn=lastWinner===0?1:0;g.deck=shuffled();g.matched=[];g.revealed=[];
   g.scores=[0,0];g.seen=[];g.status="playing";g.winner=null;g.pending_until=null;g.last_action="Nouvelle partie : signez les règles !";
  }else{
   if(!a.startedAt)return no("Les deux partenaires doivent signer avant de commencer.",409);
   if(g.status!=="playing")return no("Cette partie est terminée.",409);
   if(action==="forfeit"){
    g.status="won";g.winner=1-u.seat;g.revealed=[];g.pending_until=null;
    g.last_action=u.name+" a abandonné la manche. Victoire de son partenaire !";
   }else if(action==="flip"){
    if(u.seat!==g.turn)return no("Ce n’est pas ton tour.",403);
    if(typeof data.index!=="number"||!Number.isInteger(data.index)||!flip(g,u.seat,data.index,u.name))
     return no(g.pending_until?"Les cartes se retournent…":"Cette carte ne peut pas être retournée.",409);
   }else return no("Action inconnue.",404);
  }
  if(!await save(db,g))return no("Ton partenaire a joué en même temps. Actualise.",409);
  g=await read(db,u.room_id);
  if(!g)return no("La partie n’est plus disponible.",409);
  await initAgreements(db,g);
  a=await agreement(db,g);
  if(action==="restart")await db.prepare("DELETE FROM memory_challenges WHERE room_id=?").bind(u.room_id).run();
  return yes(await payload());
 }catch(err){console.error("Memory Love",err);return no("Le jeu est momentanément indisponible.",500)}
}
export const onRequestGet=(ctx:Ctx)=>handle(ctx,"GET");
export const onRequestPost=(ctx:Ctx)=>handle(ctx,"POST");

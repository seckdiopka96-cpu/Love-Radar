import type {D1Database} from "@cloudflare/workers-types";
import {purgeRetiredLocation} from "../lib/retired-location";
import {notifyPartner,type PushEnv} from "../lib/push";
import {
 newShuffledTiles,swapTiles,puzzleSolved,isPuzzleTheme,isPuzzleTiles,
 type PuzzleBoard,type PuzzleTheme
} from "../../src/puzzle-utils";

type Ctx={request:Request;env:PushEnv;waitUntil:(task:Promise<unknown>)=>void};
type Member={id:string;room_id:string;name:string};
type Row={room_id:string;tiles_text:string;theme:string;version:number;moves:number;solved:number;last_by:string|null;updated_at:number};
const send=(data:Record<string,unknown>)=>Response.json({ok:true,...data},{headers:{"Cache-Control":"private,no-store"}});
const fail=(error:string,status=400)=>Response.json({ok:false,error},{status,headers:{"Cache-Control":"private,no-store"}});
let tables:Promise<void>|null=null;
function ensure(db:D1Database){
 if(!tables)tables=db.exec(
  "CREATE TABLE IF NOT EXISTS couple_puzzles(room_id TEXT PRIMARY KEY,tiles_text TEXT NOT NULL,theme TEXT NOT NULL,version INTEGER NOT NULL,moves INTEGER NOT NULL,solved INTEGER NOT NULL,last_by TEXT,updated_at INTEGER NOT NULL);"+
  "CREATE TABLE IF NOT EXISTS couple_puzzle_presence(room_id TEXT NOT NULL,member_id TEXT NOT NULL,seen_at INTEGER NOT NULL,PRIMARY KEY(room_id,member_id));"
 ).then(()=>{}).catch(e=>{tables=null;throw e});
 return tables;
}
async function authorize(request:Request,db:D1Database):Promise<Member|null>{
 const bearer=request.headers.get("Authorization")||"";
 if(!/^Bearer [a-f0-9]{64}$/.test(bearer))return null;
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(bearer.slice(7)));
 const hash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,"0")).join("");
 return db.prepare("SELECT id,room_id,name FROM members WHERE token_hash=?").bind(hash).first<Member>();
}
async function init(db:D1Database,room:string){
 const now=Date.now(),tiles=newShuffledTiles();
 await db.prepare("INSERT OR IGNORE INTO couple_puzzles(room_id,tiles_text,theme,version,moves,solved,last_by,updated_at) VALUES(?,?,?,1,0,0,NULL,?)")
  .bind(room,JSON.stringify(tiles),"love",now).run();
}
async function read(db:D1Database,room:string):Promise<Row>{
 const row=await db.prepare("SELECT * FROM couple_puzzles WHERE room_id=?").bind(room).first<Row>();
 if(!row)throw Error("Puzzle introuvable");
 return row;
}
const visible=(row:Row):PuzzleBoard=>{
 const tiles:unknown=JSON.parse(row.tiles_text);
 if(!isPuzzleTiles(tiles)||!isPuzzleTheme(row.theme))throw Error("Puzzle invalide");
 return {tiles,theme:row.theme,version:row.version,moves:row.moves,
  solved:row.solved===1,updatedAt:row.updated_at,lastBy:row.last_by};
};
async function view(db:D1Database,user:Member,row:Row){
 const now=Date.now();
 const [members,presence]=await Promise.all([
  db.prepare("SELECT COUNT(*) AS total FROM members WHERE room_id=?").bind(user.room_id).first<{total:number}>(),
  db.prepare("SELECT seen_at FROM couple_puzzle_presence WHERE room_id=? AND member_id<>? AND seen_at>? ORDER BY seen_at DESC LIMIT 1")
   .bind(user.room_id,user.id,now-18000).first<{seen_at:number}>()
 ]);
 return {board:visible(row),partnerOnBoard:Boolean(presence),members:Number(members?.total||0),serverNow:now};
}
async function handle(ctx:Ctx,method:"GET"|"POST"){
 try{
  const db=ctx.env.DB;if(!db)return fail("Puzzle temporairement indisponible.",503);
  const user=await authorize(ctx.request,db);if(!user)return fail("Session expirée. Reconnecte-toi.",401);
  await purgeRetiredLocation(db,user.room_id);
  await ensure(db);await init(db,user.room_id);
  let current=await read(db,user.room_id);
  if(method==="GET")return send(await view(db,user,current));
  const body=await ctx.request.text();if(body.length>950)return fail("Action trop volumineuse.",413);
  let data:Record<string,unknown>;
  try{data=JSON.parse(body) as Record<string,unknown>}catch{return fail("Requête invalide.")}
  if(data.action==="presence"){
   await db.prepare("INSERT INTO couple_puzzle_presence(room_id,member_id,seen_at) VALUES(?,?,?) ON CONFLICT(room_id,member_id) DO UPDATE SET seen_at=excluded.seen_at")
    .bind(user.room_id,user.id,Date.now()).run();
   return send(await view(db,user,current));
  }
  if(data.action!=="swap"&&data.action!=="restart")return fail("Action de puzzle inconnue.");
  if(!Number.isInteger(data.version)||data.version!==current.version)return fail("Le plateau a changé, réessaie.",409);
  const now=Date.now();
  if(data.action==="restart"){
   const theme: PuzzleTheme=isPuzzleTheme(data.theme)?data.theme:visible(current).theme;
   const tiles=newShuffledTiles();
   const res=await db.prepare("UPDATE couple_puzzles SET tiles_text=?,theme=?,moves=0,solved=0,version=version+1,updated_at=?,last_by=? WHERE room_id=? AND version=?")
    .bind(JSON.stringify(tiles),theme,now,user.name.slice(0,60),user.room_id,current.version).run();
   if(res.meta.changes!==1)return fail("Ton partenaire vient de commencer une autre partie.",409);
   // Notify only on a new round; never for every tile move. Debounce restarts.
   if(now-current.updated_at>25000){
    ctx.waitUntil(notifyPartner(ctx.env,user.room_id,user.id,
     "🧩 "+user.name.slice(0,28)+" t’invite au puzzle",
     user.name.slice(0,28)+" a commencé un puzzle à deux ! Appuie pour assembler les pièces ensemble ❤️","puzzle"));
   }
  }else{
   if(current.solved===1)return fail("Bravo ! Commence une nouvelle image.",409);
   const from=data.from,to=data.to;
   if(!Number.isInteger(from)||!Number.isInteger(to)||Number(from)===Number(to)||
     Number(from)<0||Number(from)>8||Number(to)<0||Number(to)>8)return fail("Choisis deux cases différentes.");
   const tiles=swapTiles(visible(current).tiles,Number(from),Number(to));
   const result=await db.prepare("UPDATE couple_puzzles SET tiles_text=?,moves=moves+1,solved=?,version=version+1,updated_at=?,last_by=? WHERE room_id=? AND version=?")
    .bind(JSON.stringify(tiles),puzzleSolved(tiles)?1:0,now,user.name.slice(0,60),user.room_id,current.version).run();
   if(result.meta.changes!==1)return fail("Une pièce a été déplacée en même temps. Réessaie.",409);
  }
  current=await read(db,user.room_id);
  return send(await view(db,user,current));
 }catch(e){console.error("Couple Puzzle",e);return fail("Impossible de synchroniser le puzzle.",500)}
}
export const onRequestGet=(ctx:Ctx)=>handle(ctx,"GET");
export const onRequestPost=(ctx:Ctx)=>handle(ctx,"POST");

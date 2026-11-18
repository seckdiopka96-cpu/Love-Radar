import type {D1Database} from "@cloudflare/workers-types";
import {DEFAULT_CHAT_THEME,validChatTheme,type ChatTheme} from "../../src/chat-themes";

type Ctx={request:Request;env:{DB?:D1Database}};
type Member={id:string;room_id:string};
type Saved={wallpaper:string;color:string;bubble:string;animated:number;version:number};
const send=(body:Record<string,unknown>,status=200)=>Response.json({ok:status<400,...body},
 {status,headers:{"Cache-Control":"private, no-store"}});
const fail=(message:string,status=400)=>send({error:message},status);
let prepared:Promise<void>|null=null;
async function ensure(db:D1Database){
 if(!prepared)prepared=db.exec("CREATE TABLE IF NOT EXISTS chat_themes ("+
  "room_id TEXT PRIMARY KEY,wallpaper TEXT NOT NULL DEFAULT 'minuit',"+
  "color TEXT NOT NULL DEFAULT 'rose',bubble TEXT NOT NULL DEFAULT 'classique',"+
  "animated INTEGER NOT NULL DEFAULT 1,version INTEGER NOT NULL DEFAULT 1)"
 ).then(()=>{}).catch(error=>{prepared=null;throw error});
 await prepared;
}
async function auth(request:Request,db:D1Database):Promise<Member|null>{
 const bearer=request.headers.get("Authorization")||"";
 if(!/^Bearer [a-f0-9]{64}$/i.test(bearer))return null;
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(bearer.slice(7)));
 const hash=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,"0")).join("");
 return db.prepare("SELECT id,room_id FROM members WHERE token_hash=?").bind(hash).first<Member>();
}
async function state(db:D1Database,roomId:string):Promise<ChatTheme>{
 const row=await db.prepare(
  "SELECT wallpaper,color,bubble,animated,version FROM chat_themes WHERE room_id=?"
 ).bind(roomId).first<Saved>();
 if(!row)return DEFAULT_CHAT_THEME;
 const candidate={wallpaper:row.wallpaper,color:row.color,bubble:row.bubble,animated:row.animated===1};
 if(!validChatTheme(candidate))return DEFAULT_CHAT_THEME;
 return {...candidate,version:row.version};
}
export async function onRequestGet({request,env}:Ctx):Promise<Response>{
 try{
  if(!env.DB)return fail("Service temporairement indisponible.",503);
  const member=await auth(request,env.DB);
  if(!member)return fail("Reconnecte-toi.",401);
  await ensure(env.DB);
  return send({theme:await state(env.DB,member.room_id)});
 }catch(error){console.error("Chat theme GET",error);return fail("Thème indisponible.",503)}
}
export async function onRequestPost({request,env}:Ctx):Promise<Response>{
 try{
  if(!env.DB)return fail("Service temporairement indisponible.",503);
  const member=await auth(request,env.DB);
  if(!member)return fail("Reconnecte-toi.",401);
  if(request.headers.get("Content-Type")?.split(";")[0].trim()!=="application/json")
   return fail("Format invalide.",415);
  const text=await request.text();
  if(text.length>350)return fail("Configuration trop volumineuse.",413);
  let raw:unknown;
  try{raw=JSON.parse(text)}catch{return fail("Configuration invalide.")}
  if(!validChatTheme(raw))return fail("Ce thème n’est pas reconnu.",400);
  await ensure(env.DB);
  // The room is authenticated from the token, never from a client-controlled ID.
  await env.DB.prepare(
   "INSERT INTO chat_themes(room_id,wallpaper,color,bubble,animated,version)"+
   " VALUES(?,?,?,?,?,1) ON CONFLICT(room_id) DO UPDATE SET"+
   " wallpaper=excluded.wallpaper,color=excluded.color,bubble=excluded.bubble,"+
   " animated=excluded.animated,version=chat_themes.version+1"
  ).bind(member.room_id,raw.wallpaper,raw.color,raw.bubble,raw.animated?1:0).run();
  return send({theme:await state(env.DB,member.room_id)});
 }catch(error){console.error("Chat theme POST",error);return fail("Impossible d’enregistrer le thème.",503)}
}

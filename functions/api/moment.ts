import type {D1Database} from "@cloudflare/workers-types";
import {notifyPartner,type PushEnv} from "../lib/push";

/* Daily couple ritual. Questions are shared by UTC date and answers stay room-private. */
type Context={request:Request;env:PushEnv;waitUntil:(task:Promise<unknown>)=>void};
type Member={id:string;room_id:string;seat:number;name:string};
type AnswerRow={seat:number;answer:string;reaction:string|null;created_at:number};
type HistoryRow={day:string;n:number};
const MAX_ANSWER=1200;
const REACTIONS=new Set(["❤️","🥹","😍","😘","👏","💖"]);
const QUESTIONS=[
 "Quel est le plus beau souvenir que tu gardes de nous deux ?",
 "Qu'est-ce qui te fait sourire lorsque tu penses à nous ?",
 "Quel petit geste de ma part te touche le plus ?",
 "Si nous pouvions passer une journée ensemble demain, que ferions-nous ?",
 "Quel endroit aimerais-tu découvrir avec moi ?",
 "Quel mot décrirait le mieux notre histoire aujourd'hui ?",
 "Quel moment passé ensemble aimerais-tu revivre ?",
 "Quelle chanson te rappelle notre relation ?",
 "Quel rêve aimerais-tu réaliser à deux ?",
 "Quel compliment aimerais-tu entendre plus souvent ?",
 "Quelle qualité admires-tu chez moi ?",
 "Quel message aimerais-tu recevoir au réveil ?",
 "Comment aimerais-tu célébrer notre prochaine retrouvaille ?",
 "Quelle petite habitude aimerais-tu construire avec moi ?",
 "Quel souvenir aimerais-tu garder dans une capsule du futur ?",
 "Qu'est-ce qui te donne confiance dans notre relation ?",
 "Quelle surprise simple te ferait plaisir ?",
 "Quel plat aimerais-tu préparer ou partager ensemble ?",
 "Si nous avions un week-end libre, où irions-nous ?",
 "Quelle photo de nous raconte le mieux notre histoire ?",
 "Quelle question aimerais-tu me poser pendant une soirée à deux ?",
 "Quel est ton langage de tendresse préféré ?",
 "Qu'est-ce qui rend une conversation entre nous spéciale ?",
 "Quel petit projet pourrions-nous lancer ensemble ?",
 "Quel endroit ordinaire deviendrait extraordinaire si nous y étions ensemble ?",
 "Qu'aimerais-tu que nous apprenions l'un de l'autre ?",
 "Quel surnom tendre inventerais-tu pour notre duo ?",
 "À quel moment de la journée penses-tu le plus à moi ?",
 "Comment pouvons-nous nous sentir proches malgré la distance ?",
 "Quelle aventure aimerais-tu vivre à mes côtés ?",
 "Quelle chose drôle avons-nous déjà vécue ensemble ?",
 "Comment aimerais-tu que nous passions notre prochaine soirée ?",
 "Quel message aimerais-tu laisser à notre nous du futur ?",
 "Qu'est-ce qui t'a surpris agréablement chez moi ?",
 "Quelle tradition personnelle aimerais-tu inventer pour nous ?",
 "Si notre histoire avait une couleur, laquelle serait-ce ?",
 "Quel souvenir de nos échanges te fait encore rire ?",
 "Quel détail remarques-tu chez moi que les autres ne voient pas ?",
 "Quelle réussite aimerais-tu fêter à deux ?",
 "Quelle destination symboliserait nos prochaines vacances ?",
 "Si nous écrivions un livre ensemble, quel serait son titre ?",
 "Quel conseil donnerais-tu à notre couple du premier jour ?",
 "Comment aimerais-tu que l'on se dise bonne nuit ?",
 "Quel objet simple te rappelle le plus notre histoire ?",
 "Quel moment du quotidien voudrais-tu partager plus souvent avec moi ?",
 "Si nous pouvions envoyer une carte postale du futur, que dirait-elle ?",
 "Quelle activité aimerais-tu essayer avec moi pour la première fois ?",
 "Quelle attention te fait te sentir vraiment écouté(e) ?",
 "Quel beau souvenir aimerais-tu créer cette année ?",
 "Comment décrirais-tu notre complicité en trois mots ?",
 "Quel petit défi amusant pourrions-nous relever ensemble ?",
 "Qu'est-ce qui t'encourage à croire à nos projets communs ?",
 "Quel paysage aimerais-tu contempler à deux ?",
 "Quel moment de notre relation t'a rendu(e) particulièrement heureux(se) ?",
 "Si nous avions une heure rien que pour nous, comment l'utiliserions-nous ?",
 "Quelle promesse simple aimerais-tu que nous nous fassions ?"
];
const reply=(payload:object,status=200)=>Response.json(payload,{status,headers:{"Cache-Control":"no-store"}});
const err=(error:string,status=400)=>reply({ok:false,error},status);
const today=()=>new Date().toISOString().slice(0,10);
function dayInfo(request:Request){
 const query=new URL(request.url).searchParams.get("date")||today();
 if(!/^\d{4}-\d{2}-\d{2}$/.test(query))return null;
 const parsed=Date.parse(query+"T00:00:00Z");
 if(!Number.isFinite(parsed)||new Date(parsed).toISOString().slice(0,10)!==query)return null;
 const delta=Math.floor((Date.parse(today()+"T00:00:00Z")-parsed)/86400000);
 if(delta<0||delta>60)return null;
 return {day:query,isToday:delta===0,daysAgo:delta,index:Math.floor(parsed/86400000)%QUESTIONS.length};
}
let ready:Promise<void>|null=null;
async function ensure(db:D1Database){
 if(!ready)ready=db.exec(
  "CREATE TABLE IF NOT EXISTS daily_moments (room_id TEXT NOT NULL, day TEXT NOT NULL, seat INTEGER NOT NULL CHECK(seat IN (0,1)), answer TEXT NOT NULL, reaction TEXT, created_at INTEGER NOT NULL, PRIMARY KEY(room_id,day,seat));"+
  "CREATE INDEX IF NOT EXISTS idx_daily_moments_room_day ON daily_moments(room_id,day)"
 ).then(()=>{}).catch(e=>{ready=null;throw e});
 await ready;
}
async function auth(request:Request,db:D1Database):Promise<Member|null>{
 const bearer=request.headers.get("Authorization")||"";
 if(!/^Bearer [a-f0-9]{64}$/.test(bearer))return null;
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(bearer.slice(7)));
 const hash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,"0")).join("");
 return db.prepare("SELECT id,room_id,seat,name FROM members WHERE token_hash=?").bind(hash).first<Member>();
}
async function snapshot(db:D1Database,u:Member,day:string){
 const result=await db.prepare("SELECT seat,answer,reaction,created_at FROM daily_moments WHERE room_id=? AND day=? ORDER BY seat")
  .bind(u.room_id,day).all<AnswerRow>();
 const answers=result.results||[];
 const mine=answers.find(a=>a.seat===u.seat)||null;
 const partner=answers.find(a=>a.seat!==u.seat)||null;
 const revealed=Boolean(mine&&partner);
 const history=await db.prepare("SELECT day,COUNT(*) AS n FROM daily_moments WHERE room_id=? AND day<=? AND day>=? GROUP BY day ORDER BY day DESC LIMIT 12")
 .bind(u.room_id,today(),new Date(Date.parse(today()+"T00:00:00Z")-60*86400000).toISOString().slice(0,10))
 .all<HistoryRow>();
 return {
  ok:true,date:day,today:today(),question:QUESTIONS[Math.floor(Date.parse(day+"T00:00:00Z")/86400000)%QUESTIONS.length],
  mine:mine?{text:mine.answer,createdAt:mine.created_at,reaction:mine.reaction}:null,
  partnerAnswered:Boolean(partner),
  revealed,partner:revealed?{text:partner!.answer,createdAt:partner!.created_at,reaction:partner!.reaction}:null,
  history:(history.results||[]).map(r=>({day:r.day,both:Number(r.n)===2})),
  serverNow:Date.now()
 };
}
async function handler(ctx:Context,method:"GET"|"POST"){
 try{
  const db=ctx.env.DB;if(!db)return err("Le service du moment quotidien est indisponible.",503);
  const u=await auth(ctx.request,db);if(!u)return err("Session expirée. Reconnecte-toi à Love Radar.",401);
  await ensure(db);
  const info=dayInfo(ctx.request);if(!info)return err("Cette journée n'est pas disponible.",400);
  if(method==="GET")return reply(await snapshot(db,u,info.day));
  const raw=await ctx.request.text();if(raw.length>1600)return err("Ton message est trop long.",413);
  let input:Record<string,unknown>;
  try{input=JSON.parse(raw) as Record<string,unknown>}catch{return err("Requête invalide.",400)}
  if(input.action==="answer"){
   if(!info.isToday)return err("On ne peut répondre qu'à la question d'aujourd'hui.",409);
   const count=await db.prepare("SELECT COUNT(*) AS n FROM members WHERE room_id=?").bind(u.room_id).first<{n:number}>();
   if(Number(count?.n)!==2)return err("Invite ton partenaire pour partager votre moment quotidien.",409);
   if(typeof input.answer!=="string")return err("Écris ta réponse.",400);
   const answer=input.answer.trim();
   if(answer.length<2||answer.length>MAX_ANSWER||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(answer))return err("Ta réponse doit contenir entre 2 et 1 200 caractères.",400);
   const inserted=await db.prepare("INSERT OR IGNORE INTO daily_moments(room_id,day,seat,answer,created_at) VALUES(?,?,?,?,?)")
    .bind(u.room_id,info.day,u.seat,answer,Date.now()).run();
   if(inserted.meta.changes!==1)return err("Tu as déjà répondu à la question du jour.",409);
   const state=await snapshot(db,u,info.day);
   const title=state.revealed?"💕 Vos réponses sont révélées !":"💌 Notre moment du jour";
   const body=state.revealed?u.name+" a répondu. Découvre vos deux réponses ❤️":u.name+" a répondu à votre question. À ton tour 💗";
   ctx.waitUntil(notifyPartner(ctx.env,u.room_id,u.id,title,body,"moment",{kind:"daily-question",id:info.day}));
   return reply(state);
  }
  if(input.action==="react"){
   if(typeof input.emoji!=="string"||!REACTIONS.has(input.emoji))return err("Réaction inconnue.",400);
   const existing=await db.prepare("SELECT COUNT(*) AS n FROM daily_moments WHERE room_id=? AND day=?")
    .bind(u.room_id,info.day).first<{n:number}>();
   if(Number(existing?.n)!==2)return err("Les deux réponses doivent être révélées avant de réagir.",409);
   const result=await db.prepare("UPDATE daily_moments SET reaction=? WHERE room_id=? AND day=? AND seat=?")
    .bind(input.emoji,u.room_id,info.day,u.seat).run();
   if(result.meta.changes!==1)return err("Réponds d'abord à la question.",409);
   return reply(await snapshot(db,u,info.day));
  }
  return err("Action inconnue.",404);
 }catch(e){console.error("Love Radar daily moment",e);return err("Notre moment est temporairement indisponible.",500)}
}
export const onRequestGet=(ctx:Context)=>handler(ctx,"GET");
export const onRequestPost=(ctx:Context)=>handler(ctx,"POST");

import type { D1Database, R2Bucket } from "@cloudflare/workers-types";

type Env = {DB?: D1Database; STORAGE?: R2Bucket};
type Context = { request: Request; env: Env };

function createHandlers(env: Env) {
  const bindings = () => env;


type Member = {id:string,room_id:string,name:string,seat:number,invite:string,round:number,owner_id:string};
const questions = {
 daily:[
 "Si ton ex t’écrit « Tu me manques », tu fais quoi ? 👀",
 "Quelle petite attention te fait le plus craquer ? 💌",
 "Quand on se dispute, tu préfères qu’on fasse quoi ?",
 "Quel souvenir de nous te donne le sourire ?",
 "Quel rêve voudrais-tu réaliser ensemble ?",
 "Qu’est-ce qui te fait te sentir aimé(e) ?",
 "Qui ferait le premier pas après une dispute ? 😂",
 "Quel cadeau surprise te rendrait heureux(se) ?",
 "Qu’est-ce qui compte le plus : les mots ou les gestes ?",
 "Si tu pouvais organiser notre prochain rendez-vous, où irions-nous ?",
 "Quel message aimerais-tu recevoir le matin ?",
 "Qu’est-ce qui te rend jaloux(se), même un peu ? 👀",
 ],
 radar:[
 "Un inconnu te complimente en privé. Tu réagis comment ? 😂",
 "Ton ex souhaite être ami(e) avec toi. Tu en penses quoi ?",
 "Ton partenaire regarde ton téléphone par curiosité. Tu réagis comment ?",
 "Un ami te propose un tête-à-tête ambigu. Que fais-tu ?",
 "Tu croises ton premier amour : tu racontes la rencontre ?",
 "Ton partenaire oublie votre anniversaire : réaction ?",
 "Quel sujet serait le plus difficile à avouer ?",
 "Quel est ton signe d’amour préféré ?",
 "Quelle règle de couple serait la plus importante pour toi ?",
 "Tu peux lire dans les pensées de l’autre pendant 1 min : tu acceptes ? 😂"
 ]
};
const options = {
 daily:["Je réponds franchement ❤️","Je prends le temps d’y réfléchir 🤔","Je préfère en parler ensemble 💬"],
 radar:["Je suis transparent(e) ❤️","Je fixe une limite claire 🛑","Je suis un peu gêné(e) 👀","On en discute ensemble 🤝"]
};
const alphabet="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function inviteCode(){let s="";const random=new Uint8Array(10);crypto.getRandomValues(random);for(const x of random)s+=alphabet[x%alphabet.length];return s}
function token(){const b=new Uint8Array(32);crypto.getRandomValues(b);return Array.from(b).map(x=>x.toString(16).padStart(2,"0")).join("")}
async function hash(str:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(str));return Array.from(new Uint8Array(bytes)).map(n=>n.toString(16).padStart(2,"0")).join("")}
const fail=(message:string,status=400)=>Response.json({ok:false,error:message},{status,headers:{"Cache-Control":"no-store"}});
const ok=(data:unknown)=>Response.json({ok:true,...(data as object)},{headers:{"Cache-Control":"no-store"}});
async function auth(request:Request):Promise<{db:D1Database,user:Member}|null>{
 const db=bindings().DB as D1Database|undefined;
 if(!db)return null;
 const raw=request.headers.get("Authorization")||"";
 if(!/^Bearer [0-9a-f]{64}$/.test(raw))return null;
 const identity=await hash(raw.slice(7));
 const user=await db.prepare("SELECT m.id,m.room_id,m.name,m.seat,r.invite,r.round,r.owner_id FROM members m JOIN rooms r ON r.id=m.room_id WHERE m.token_hash=?").bind(identity).first<Member>();
 return user?{db,user}:null;
}
function challengeFor(u:Member,kind:"daily"|"radar"){
 const day=new Date().toISOString().slice(0,10);
 const index=kind==="daily"?Math.floor(Date.parse(day+"T00:00:00Z")/86400000)%questions.daily.length:u.round%questions.radar.length;
 const key=kind==="daily"?"daily:"+day:"radar:"+u.round;
 return {key,prompt:questions[kind][index],options:options[kind]};
}
async function snapshot(db:D1Database,u:Member){
 const partners=await db.prepare("SELECT id,name,seat FROM members WHERE room_id=? ORDER BY seat").bind(u.room_id).all<{id:string,name:string,seat:number}>();
 const messages=await db.prepare("SELECT id,sender_id,kind,content,object_key,mime,created_at FROM messages WHERE room_id=? ORDER BY created_at DESC,id DESC LIMIT 90").bind(u.room_id).all();
 const all:any[]=[];
 for(const kind of ["daily","radar"] as const){
  const q=challengeFor(u,kind);
  const answers=await db.prepare("SELECT member_id,choice FROM answers WHERE room_id=? AND challenge=?").bind(u.room_id,q.key).all<{member_id:string,choice:number}>();
  const mine=answers.results.find(v=>v.member_id===u.id);
  const complete=partners.results.length===2&&answers.results.length===2;
  const theirs=complete?answers.results.find(v=>v.member_id!==u.id):undefined;
  all.push({kind,...q,myChoice:mine?.choice??null,partnerChoice:theirs?.choice??null,complete});
 }
 return {user:{id:u.id,name:u.name,seat:u.seat,owner:u.owner_id===u.id},code:u.invite,roomId:u.room_id,
  partner:partners.results.find(a=>a.id!==u.id)?.name||null,members:partners.results.length,
  challenges:all,messages:messages.results.reverse(),round:u.round};
}

  const handlers: Record<"GET"|"POST",(args:{request:Request})=>Promise<Response>> = {
  GET:async({request})=>{
   try{const session=await auth(request);if(!session)return fail("Session expirée ou invalide.",401);return ok(await snapshot(session.db,session.user))}
   catch(err){console.error("Love Radar snapshot",err);return fail("Erreur temporaire du service.",500)}
  },
  POST:async({request})=>{
   try{
    const len=Number(request.headers.get("content-length")||0);
    if(len>8192)return fail("Demande trop volumineuse.",413);
    const txt=await request.text();if(txt.length>8192)return fail("Demande trop volumineuse.",413);
    const body=JSON.parse(txt) as Record<string,unknown>;
    const op=body?.action;
    const db=bindings().DB as D1Database|undefined;
    if(!db)return fail("Stockage non disponible.",503);
    if(op==="create"||op==="join"){
     const name=String(body.name||"").trim().slice(0,30);
     if(name.length<2||/[<>\u0000-\u001f]/.test(name))return fail("Choisis un prénom entre 2 et 30 caractères.");
     const secret=token(),id=crypto.randomUUID(),now=Date.now(),digest=await hash(secret);
     if(op==="create"){
      const room=crypto.randomUUID();const code=inviteCode();
      try{
       await db.batch([
        db.prepare("INSERT INTO rooms(id,invite,owner_id,created_at) VALUES(?,?,?,?)").bind(room,code,id,now),
        db.prepare("INSERT INTO members(id,room_id,name,seat,token_hash,joined_at) VALUES(?,?,?,?,?,?)").bind(id,room,name,0,digest,now)
       ]);
      }catch{return fail("Impossible de créer l’espace. Réessaie.",503)}
      return ok({token:secret,code});
     }
     const code=String(body.code||"").trim().toUpperCase().replace(/[\s-]+/g,"");
     if(!/^[A-HJ-NP-Z2-9]{10}$/.test(code))return fail("Code d’invitation invalide.");
     const room=await db.prepare("SELECT id FROM rooms WHERE invite=?").bind(code).first<{id:string}>();
     if(!room)return fail("Code inconnu. Vérifie avec ton partenaire.",404);
     try{
      const inserted=await db.prepare("INSERT INTO members(id,room_id,name,seat,token_hash,joined_at) SELECT ?,?, ?,1,?,? WHERE (SELECT COUNT(*) FROM members WHERE room_id=?)=1").bind(id,room.id,name,digest,now,room.id).run();
      if(!inserted.meta.changes)return fail("Cet espace est déjà complet.",409);
     }catch{return fail("Cet espace est déjà complet.",409)}
     return ok({token:secret,code});
    }
    const session=await auth(request);if(!session)return fail("Session expirée. Rejoins ton espace.",401);
    const {user:u}=session;
    if(op==="message"){
     const message=String(body.text||"").trim();
     if(!message||message.length>1600)return fail("Écris un message de 1 à 1 600 caractères.");
     await db.prepare("INSERT INTO messages(id,room_id,sender_id,kind,content,created_at) VALUES(?,?,?,'text',?,?)").bind(crypto.randomUUID(),u.room_id,u.id,message,Date.now()).run();
     return ok({sent:true});
    }
    if(op==="answer"){
     const kind=body.kind==="daily"?"daily":body.kind==="radar"?"radar":null;
     if(!kind)return fail("Jeu inconnu.");
     const q=challengeFor(u,kind),choice=Number(body.choice);
     if(!Number.isInteger(choice)||choice<0||choice>=q.options.length)return fail("Réponse invalide.");
     await db.prepare("INSERT INTO answers(room_id,member_id,challenge,choice,created_at) VALUES(?,?,?,?,?) ON CONFLICT(room_id,member_id,challenge) DO NOTHING").bind(u.room_id,u.id,q.key,choice,Date.now()).run();
     return ok({saved:true});
    }
    if(op==="next"){
     const partners=await db.prepare("SELECT COUNT(*) AS n FROM members WHERE room_id=?").bind(u.room_id).first<{n:number}>();
     const current=challengeFor(u,"radar");
     const answered=await db.prepare("SELECT COUNT(*) AS n FROM answers WHERE room_id=? AND challenge=?").bind(u.room_id,current.key).first<{n:number}>();
     if(partners?.n!==2||answered?.n!==2)return fail("Attendez que les deux partenaires répondent.",409);
     const updated=await db.prepare("UPDATE rooms SET round=round+1 WHERE id=? AND round=?").bind(u.room_id,u.round).run();
     if(!updated.meta.changes)return fail("Nouvelle question déjà disponible. Actualise.",409);
     return ok({next:true});
    }
    if(op==="delete"){
     if(u.owner_id!==u.id)return fail("Seul le créateur de l’espace peut le supprimer.",403);
     const objects=await db.prepare("SELECT object_key FROM messages WHERE room_id=? AND object_key IS NOT NULL").bind(u.room_id).all<{object_key:string}>();
     const bucket=bindings().STORAGE;
     if(bucket)for(const row of objects.results)try{await bucket.delete(row.object_key)}catch(e){console.error("delete media",e);return fail("Suppression des médias impossible. Réessaie.",503)}
     await db.batch([
      db.prepare("DELETE FROM answers WHERE room_id=?").bind(u.room_id),
      db.prepare("DELETE FROM messages WHERE room_id=?").bind(u.room_id),
      db.prepare("DELETE FROM members WHERE room_id=?").bind(u.room_id),
      db.prepare("DELETE FROM rooms WHERE id=?").bind(u.room_id)
     ]);
     return ok({deleted:true});
    }
    return fail("Action inconnue.",404);
   }catch(err){console.error("Love Radar API",err);return fail("Impossible de traiter la demande.",500)}
  }

  };
  return handlers;
}

export const onRequestGet = (ctx: Context) => createHandlers(ctx.env).GET({request:ctx.request});
export const onRequestPost = (ctx: Context) => createHandlers(ctx.env).POST({request:ctx.request});

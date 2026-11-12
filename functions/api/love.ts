import type { D1Database, R2Bucket } from "@cloudflare/workers-types";
import { notifyPartner, type PushEnv } from "../lib/push";

// Automatic, idempotent D1 initialization; existing couple messages remain intact.
let presenceReady: Promise<void> | null = null;
async function ensureChatPresence(db:D1Database){
 if(!presenceReady){
  presenceReady=db.exec("CREATE TABLE IF NOT EXISTS chat_presence (room_id TEXT NOT NULL, member_id TEXT NOT NULL, last_read_at INTEGER NOT NULL DEFAULT 0, typing_until INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(room_id,member_id))")
   .then(()=>{}).catch(err=>{presenceReady=null;throw err});
 }
 await presenceReady;
}


type Env = PushEnv & {STORAGE?: R2Bucket};
type Context = { request: Request; env: Env; waitUntil:(task:Promise<unknown>)=>void };

function createHandlers(env: Env, waitUntil:(task:Promise<unknown>)=>void) {
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
 "Si tu devais décrire notre relation en trois mots, lesquels choisirais-tu ?",
 "Qu’est-ce qui te rassure le plus quand nous sommes loin l’un de l’autre ?",
 "Quelle habitude aimerais-tu créer avec moi ?",
 "Quel endroit aimerais-tu découvrir à deux ?",
 "Quel compliment te touche vraiment ?",
 "Quel genre de soirée préfères-tu en amoureux ?",
 "Si nous gagnions un voyage surprise, quelle destination choisirais-tu ?",
 "Qu’est-ce qui te ferait te sentir mieux compris(e) ?",
 "Quel petit rituel quotidien te rendrait heureux(se) ?",
 "Comment préfères-tu résoudre un malentendu ?",
 "Qu’aimerais-tu apprendre à faire ensemble cette année ?",
 "Quelle est ta plus belle définition de la confiance ?",
 "Que faut-il préserver même quand on est fâchés ?",
 "Quel détail romantique remarques-tu immédiatement ?",
 "Comment imagines-tu nos prochaines vacances ?",
 "Quelle chanson te rappelle un moment heureux ?",
 "Quel souvenir aimerais-tu créer cette semaine ?",
 "Quelle valeur familiale est la plus importante pour toi ?",
 "Que souhaites-tu accomplir personnellement cette année ?",
 "Comment aimerais-tu célébrer une petite victoire à deux ?",
 "Quelle activité simple transforme une journée ordinaire ?",
 "Qu’est-ce qui te donne envie de parler longtemps avec moi ?",
 "Quel conseil aurais-tu donné à ton toi d’il y a cinq ans ?",
 "Qu’est-ce qui te fait rire même dans une journée difficile ?",
 "Quelle tradition aimerais-tu transmettre plus tard ?",
 "Quel livre ou film voudrais-tu découvrir avec moi ?",
 "Quel geste montre le mieux que quelqu’un t’écoute ?",
 "Qu’est-ce qui te rend fier ou fière de notre complicité ?",
 "Dans une relation, quel équilibre entre liberté et proximité te convient ?",
 "À quel moment préfères-tu recevoir un message affectueux ?",
 "Quel rêve d’enfance aimerais-tu encore réaliser ?",
 "Comment peut-on mieux se soutenir pendant une période stressante ?",
 "Quelles qualités admires-tu le plus chez les autres ?",
 "Que voudrais-tu que l’on fasse lors de notre prochain week-end ?",
 "Quel sujet aimerais-tu qu’on aborde plus souvent ?",
 "Que ferais-tu avec une journée entière sans téléphone ?",
 "Quel est ton plus beau souvenir de fête ?",
 "Quelle forme de surprise te mettrait le plus à l’aise ?",
 "À quoi ressemble une relation saine pour toi ?",
 "Quel défi personnel aimerais-tu relever avec mon soutien ?",
 "Quel souvenir de famille t’a le plus marqué(e) ?",
 "Qu’aimerais-tu que l’on se dise avant de dormir ?",
 "Quelle différence entre nous te fait sourire ?",
 "Comment préfères-tu montrer ta gratitude ?",
 "Quel petit changement rendrait notre quotidien plus agréable ?",
 "Quelle règle simple nous aiderait à mieux communiquer ?",
 "Qu’est-ce qui te redonne confiance après une mauvaise journée ?",
 "Que voudrais-tu apprendre de ma culture ou de mon histoire ?"
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
 "Tu peux lire dans les pensées de l’autre pendant 1 min : tu acceptes ? 😂",
 "Ton ex t'envoie une demande d'abonnement sur les réseaux. Quelle est ta réaction ?",
 "Quelqu'un te drague dans les commentaires. Que fais-tu ?",
 "Un ami te cache qu'il est amoureux de toi. Comment réagis-tu ?",
 "Tu reçois un cadeau anonyme. Tu en parles à ton partenaire ?",
 "Un inconnu te demande ton numéro dans la rue. Tu fais quoi ?",
 "Ton téléphone reçoit un message ambigu devant ton partenaire. Ta réaction ?",
 "Ton partenaire partage une photo de vous sans prévenir. Tu en penses quoi ?",
 "Une ancienne histoire revient te parler après des années. Tu réponds ?",
 "Un collègue te propose un verre après le travail. Ta réaction ?",
 "Ton partenaire a besoin de solitude ce soir. Comment le prends-tu ?",
 "Une rumeur circule sur votre couple. Tu fais quoi en premier ?",
 "Ton partenaire oublie de répondre pendant plusieurs heures. Tu réagis comment ?",
 "Une personne que tu connais critique ton partenaire. Tu réponds quoi ?",
 "Ton amour veut rencontrer tes meilleurs amis. Tu es à l'aise ?",
 "Vous n'êtes pas d'accord sur les vacances. Comment décidez-vous ?",
 "Ton partenaire n'aime pas une de tes amitiés. Que proposes-tu ?",
 "Tu tombes sur une ancienne photo de couple. Que fais-tu ?",
 "Un(e) ami(e) te confie avoir un faible pour ton partenaire. Ta réaction ?",
 "Ton partenaire te prépare une surprise mais tu détestes les surprises. Que fais-tu ?",
 "Un désaccord éclate en public. Comment agis-tu ?",
 "Quelqu'un te fait une déclaration alors que tu es en couple. Tu réponds ?",
 "Ton partenaire t'avoue une peur qu'il cachait. Comment l'accueilles-tu ?",
 "Tu remarques une différence de valeurs importante. Comment l'abordes-tu ?",
 "Tu découvres que ton amour a besoin de plus d'espace. Comment réagis-tu ?",
 "Tu reçois un message à minuit d'une connaissance. Tu en parles ?",
 "Ton partenaire garde des souvenirs d'une ancienne relation. Ton avis ?",
 "Tu voudrais passer une soirée avec tes amis sans ton partenaire. Comment le dis-tu ?",
 "Tu constates un malentendu sur les réseaux. Que fais-tu ?",
 "Ton amour te pose une question difficile devant vos amis. Comment réagis-tu ?",
 "Votre couple traverse une période très occupée. Quelle priorité choisis-tu ?",
 "Tu trouves que ton partenaire s'éloigne un peu. Quelle est ta première réaction ?",
 "Un ami te demande de cacher quelque chose à ton amour. Tu réponds quoi ?",
 "Ton partenaire te dit qu'il a besoin de plus d'attention. Que fais-tu ?",
 "Tu apprends une information importante sur ton partenaire par quelqu'un d'autre. Que fais-tu ?",
 "Un message de ton ex arrive pendant un rendez-vous. Ta réaction ?",
 "Ton partenaire trouve ta blague blessante. Comment réagis-tu ?",
 "Quelqu'un insiste pour te séduire malgré ton refus. Que fais-tu ?",
 "Votre vision de l'argent est différente. Comment en parlez-vous ?",
 "Ton amour n'aime pas publier sa vie privée. Qu'en penses-tu ?",
 "Ton partenaire veut rencontrer ta famille plus tôt que prévu. Tu réagis comment ?",
 "Un(e) proche te demande d'annuler un rendez-vous amoureux au dernier moment. Que fais-tu ?",
 "Ton amour lit un message de travers et se fâche. Comment désamorces-tu ?",
 "Tu dois choisir entre un événement entre amis et une soirée prévue à deux. Que fais-tu ?",
 "Ton partenaire pense que tu passes trop de temps sur ton téléphone. Réaction ?",
 "Une connaissance fait un commentaire déplacé sur votre couple. Tu réponds quoi ?",
 "Vous découvrez une différence d'habitudes surprenante. Comment réagis-tu ?",
 "Ton amour te demande de lui raconter une erreur passée. Que fais-tu ?",
 "Ton partenaire te dit qu'il doute de lui-même. Comment le rassures-tu ?",
 "Tu arrives en retard à un rendez-vous important. Comment réagis-tu ?",
 "Ton partenaire veut parler d'un sujet sensible avant de dormir. Tu fais quoi ?",
 "Tu découvres un intérêt nouveau chez ton amour. Comment l'encourages-tu ?",
 "Tu n'es pas d'accord avec l'avis de ton partenaire devant des proches. Que fais-tu ?",
 "Ton amour est contrarié mais ne veut pas parler immédiatement. Comment réagis-tu ?",
 "Quelqu'un vous compare à un autre couple. Ta réaction ?",
 "Ton partenaire oublie un petit engagement. Tu lui dis comment ?",
 "Vous hésitez à prendre une grande décision ensemble. Quel est ton réflexe ?",
 "Une personne insiste pour vous inviter séparément. Qu'en penses-tu ?",
 "Ton amour souhaite ralentir le rythme de votre relation. Que fais-tu ?",
 "Tu reçois une mauvaise nouvelle juste avant votre rendez-vous. Comment lui dis-tu ?",
 "Ton partenaire te demande une critique honnête sur un projet. Que fais-tu ?",
 "Un message envoyé sur le ton de l'humour est mal compris. Comment répares-tu ?",
 "Ton amour veut changer une habitude commune. Quelle est ta réaction ?",
 "Vous êtes séparés par un décalage horaire. Comment gardez-vous le lien ?",
 "Ton partenaire te raconte une ancienne déception. Comment l'écoutes-tu ?",
 "Une personne lance une fausse accusation sur ton amour. Que fais-tu ?",
 "Ton amour te dit qu'il a besoin de confiance plutôt que de vérifications. Réaction ?",
 "Vous avez deux projets de voyage incompatibles. Comment négocies-tu ?",
 "Ton partenaire n'aime pas ton idée de rendez-vous. Comment réagis-tu ?",
 "Tu sens qu'un sujet crée de la tension. Tu l'abordes quand ?",
 "Ton amour ne répond pas immédiatement à « Je t'aime ». Que penses-tu ?",
 "Un proche te demande des détails intimes sur votre relation. Tu réponds quoi ?",
 "Ton partenaire veut discuter de vos projets dans cinq ans. Réaction ?"
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
 const messages=await db.prepare("SELECT id,sender_id,kind,content,object_key,mime,created_at FROM messages WHERE room_id=? AND kind IN ('text','image','audio') ORDER BY created_at DESC,id DESC LIMIT 90").bind(u.room_id).all();
 const otherStatus=await db.prepare("SELECT last_read_at,typing_until FROM chat_presence WHERE room_id=? AND member_id<>? ORDER BY typing_until DESC LIMIT 1").bind(u.room_id,u.id).first<{last_read_at:number,typing_until:number}>();


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
  challenges:all,messages:messages.results.reverse(),partnerReadAt:otherStatus?.last_read_at??0,partnerTypingUntil:otherStatus?.typing_until??0,round:u.round};
}

  const handlers: Record<"GET"|"POST",(args:{request:Request})=>Promise<Response>> = {
  GET:async({request})=>{
   try{const session=await auth(request);if(!session)return fail("Session expirée ou invalide.",401);await ensureChatPresence(session.db);return ok(await snapshot(session.db,session.user))}
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
     waitUntil(notifyPartner(env,room.id,id,"Love Radar ❤️","Ton partenaire vient de rejoindre votre espace !","home"));
     return ok({token:secret,code});
    }
    const session=await auth(request);if(!session)return fail("Session expirée. Rejoins ton espace.",401);
    const {user:u}=session;
    if(op==="typing"){
     await ensureChatPresence(db);
     const until=body.active===true?Date.now()+6500:0;
     await db.prepare("INSERT INTO chat_presence(room_id,member_id,typing_until) VALUES(?,?,?) ON CONFLICT(room_id,member_id) DO UPDATE SET typing_until=excluded.typing_until").bind(u.room_id,u.id,until).run();
     return ok({typing:true});
    }
    if(op==="read"){
     await ensureChatPresence(db);
     const last=await db.prepare("SELECT MAX(created_at) AS stamp FROM messages WHERE room_id=? AND sender_id<>? AND kind IN ('text','image','audio')").bind(u.room_id,u.id).first<{stamp:number|null}>();
     if(last?.stamp){
      await db.prepare("INSERT INTO chat_presence(room_id,member_id,last_read_at) VALUES(?,?,?) ON CONFLICT(room_id,member_id) DO UPDATE SET last_read_at=MAX(last_read_at,excluded.last_read_at)").bind(u.room_id,u.id,last.stamp).run();
     }
     return ok({read:true});
    }
    if(op==="message"){
     const message=String(body.text||"").trim();
     if(!message||message.length>1600)return fail("Écris un message de 1 à 1 600 caractères.");
     await db.prepare("INSERT INTO messages(id,room_id,sender_id,kind,content,created_at) VALUES(?,?,?,'text',?,?)").bind(crypto.randomUUID(),u.room_id,u.id,message,Date.now()).run();
     await ensureChatPresence(db);
     await db.prepare("UPDATE chat_presence SET typing_until=0 WHERE room_id=? AND member_id=?").bind(u.room_id,u.id).run();
     waitUntil(notifyPartner(env,u.room_id,u.id,"Love Radar 💌",u.name+" t’a envoyé un message.","chat"));
     return ok({sent:true});
    }
    if(op==="answer"){
     const kind=body.kind==="daily"?"daily":body.kind==="radar"?"radar":null;
     if(!kind)return fail("Jeu inconnu.");
     const q=challengeFor(u,kind),choice=Number(body.choice);
     if(!Number.isInteger(choice)||choice<0||choice>=q.options.length)return fail("Réponse invalide.");
     const inserted=await db.prepare("INSERT INTO answers(room_id,member_id,challenge,choice,created_at) VALUES(?,?,?,?,?) ON CONFLICT(room_id,member_id,challenge) DO NOTHING").bind(u.room_id,u.id,q.key,choice,Date.now()).run();
     if(inserted.meta.changes)waitUntil(notifyPartner(env,u.room_id,u.id,"Love Radar 💞",u.name+" a répondu à "+(kind==="daily"?"la question du jour.":"une question du Radar."),kind==="radar"?"radar":"home"));
     return ok({saved:true});
    }
    if(op==="next"){
     const partners=await db.prepare("SELECT COUNT(*) AS n FROM members WHERE room_id=?").bind(u.room_id).first<{n:number}>();
     const current=challengeFor(u,"radar");
     const answered=await db.prepare("SELECT COUNT(*) AS n FROM answers WHERE room_id=? AND challenge=?").bind(u.room_id,current.key).first<{n:number}>();
     if(partners?.n!==2||answered?.n!==2)return fail("Attendez que les deux partenaires répondent.",409);
     const updated=await db.prepare("UPDATE rooms SET round=round+1 WHERE id=? AND round=?").bind(u.room_id,u.round).run();
     if(!updated.meta.changes)return fail("Nouvelle question déjà disponible. Actualise.",409);
     waitUntil(notifyPartner(env,u.room_id,u.id,"Love Radar 👀","Une nouvelle question Radar vous attend.","radar"));
     return ok({next:true});
    }
    if(op==="delete"){
     if(u.owner_id!==u.id)return fail("Seul le créateur de l’espace peut le supprimer.",403);
     const objects=await db.prepare("SELECT object_key FROM messages WHERE room_id=? AND object_key IS NOT NULL").bind(u.room_id).all<{object_key:string}>();
     const bucket=bindings().STORAGE;
     if(bucket)for(const row of objects.results)try{await bucket.delete(row.object_key)}catch(e){console.error("delete media",e);return fail("Suppression des médias impossible. Réessaie.",503)}
     try{await db.prepare("DELETE FROM push_subscriptions WHERE room_id=?").bind(u.room_id).run()}catch(e){console.error("push cleanup",e)}
     await ensureChatPresence(db);
     await db.prepare("DELETE FROM chat_presence WHERE room_id=?").bind(u.room_id).run();
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

export const onRequestGet = (ctx: Context) => createHandlers(ctx.env,ctx.waitUntil.bind(ctx)).GET({request:ctx.request});
export const onRequestPost = (ctx: Context) => createHandlers(ctx.env,ctx.waitUntil.bind(ctx)).POST({request:ctx.request});

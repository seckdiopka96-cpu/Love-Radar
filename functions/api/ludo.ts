import type { D1Database } from "@cloudflare/workers-types";

// Server-authoritative, private two-player Ludo. Each couple has one live game.
// Progress -1 = base, 0..50 = outer track, 51..56 = home lane, 57 = finished.
type Env={DB?:D1Database};
type Ctx={request:Request;env:Env};
type Member={id:string;room_id:string;seat:number;name:string};
type GameRow={room_id:string;game_id:string;version:number;turn:number;dice:number|null;positions:string;status:string;winner:number|null;streak:number;last_action:string;updated_at:number};
type Board=number[][];
type Game={room_id:string;game_id:string;version:number;turn:number;dice:number|null;positions:Board;status:"playing"|"won";winner:number|null;streak:number;last_action:string;updated_at:number};
type GiftRow={game_id:string;consent_0:number;consent_1:number;choice:string|null;chosen_by:number|null;given:number};
type Gift={consents:[boolean,boolean];choice:"credit"|"internet"|"wave2000"|null;chosenBy:number|null;given:boolean};
type AgreementRow={room_id:string;game_id:string;signed_0_name:string|null;signed_1_name:string|null;signed_0_at:number|null;signed_1_at:number|null;gift_0:number|null;gift_1:number|null;started_at:number|null;updated_at:number};
type Agreement={signed:[boolean,boolean];names:[string|null,string|null];giftChoices:[boolean|null,boolean|null];signedAt:[number|null,number|null];startedAt:number|null};
const TURN_MS=30000;
const GIFTS=new Set(["credit","internet","wave2000"]);
const initial=():Board=>[[-1,-1,-1,-1],[-1,-1,-1,-1]];
const SAFE=new Set([0,8,13,21,26,34,39,47]);
const reply=(payload:object,status=200)=>Response.json(payload,{status,headers:{"Cache-Control":"no-store"}});
const fail=(error:string,status=400)=>reply({ok:false,error},status);
let ready:Promise<void>|null=null;
async function ensureTable(db:D1Database){
 if(!ready){
  ready=db.exec("CREATE TABLE IF NOT EXISTS ludo_games (room_id TEXT PRIMARY KEY, game_id TEXT NOT NULL, version INTEGER NOT NULL, turn INTEGER NOT NULL, dice INTEGER, positions TEXT NOT NULL, status TEXT NOT NULL, winner INTEGER, streak INTEGER NOT NULL DEFAULT 0, last_action TEXT NOT NULL, updated_at INTEGER NOT NULL);"+
   "CREATE TABLE IF NOT EXISTS ludo_reactions (room_id TEXT PRIMARY KEY, seat INTEGER NOT NULL, emoji TEXT NOT NULL, updated_at INTEGER NOT NULL);"+
   "CREATE TABLE IF NOT EXISTS ludo_gifts (room_id TEXT PRIMARY KEY, game_id TEXT NOT NULL, consent_0 INTEGER NOT NULL DEFAULT 0, consent_1 INTEGER NOT NULL DEFAULT 0, choice TEXT, chosen_by INTEGER, given INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL);"+
   "CREATE TABLE IF NOT EXISTS ludo_agreements (room_id TEXT PRIMARY KEY, game_id TEXT NOT NULL, signed_0_name TEXT, signed_1_name TEXT, signed_0_at INTEGER, signed_1_at INTEGER, gift_0 INTEGER, gift_1 INTEGER, started_at INTEGER, updated_at INTEGER NOT NULL)" ).then(()=>{}).catch(e=>{ready=null;throw e});
 }
 await ready;
}
async function session(request:Request,db:D1Database):Promise<Member|null>{
 const header=request.headers.get("Authorization")||"";
 if(!/^Bearer [a-f0-9]{64}$/.test(header))return null;
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(header.slice(7)));
 const sha=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,"0")).join("");
 return await db.prepare("SELECT id,room_id,seat,name FROM members WHERE token_hash=?").bind(sha).first<Member>();
}
function parse(row:GameRow):Game{
 const positions=JSON.parse(row.positions) as Board;
 if(!Array.isArray(positions)||positions.length!==2||!positions.every(a=>Array.isArray(a)&&a.length===4&&a.every(x=>Number.isInteger(x)&&x>=-1&&x<=57)))throw Error("invalid ludo game data");
 return {...row,positions,status:row.status==="won"?"won":"playing"};
}
async function countMembers(db:D1Database,room:string){
 const row=await db.prepare("SELECT COUNT(*) AS total FROM members WHERE room_id=?").bind(room).first<{total:number}>();
 return Number(row?.total||0);
}
async function getGame(db:D1Database,room:string):Promise<Game|null>{
 const row=await db.prepare("SELECT * FROM ludo_games WHERE room_id=?").bind(room).first<GameRow>();
 return row?parse(row):null;
}
async function createIfMissing(db:D1Database,room:string){
 await db.prepare("INSERT OR IGNORE INTO ludo_games(room_id,game_id,version,turn,dice,positions,status,winner,streak,last_action,updated_at) VALUES(?,?,1,0,NULL,?,'playing',NULL,0,?,?)")
  .bind(room,crypto.randomUUID(),JSON.stringify(initial()),"La partie est prête !",Date.now()).run();
}
const movable=(progress:number,dice:number)=>progress===-1?dice===6:progress>=0&&progress<57&&progress+dice<=57;
function die(){
 const byte=new Uint8Array(1);
 do{crypto.getRandomValues(byte)}while(byte[0]>=252);
 return (byte[0]%6)+1;
}
async function save(db:D1Database,g:Game){
 const result=await db.prepare("UPDATE ludo_games SET game_id=?,version=version+1,turn=?,dice=?,positions=?,status=?,winner=?,streak=?,last_action=?,updated_at=? WHERE room_id=? AND version=?")
 .bind(g.game_id,g.turn,g.dice,JSON.stringify(g.positions),g.status,g.winner,g.streak,g.last_action,Date.now(),g.room_id,g.version).run();
 return result.meta.changes===1;
}
const publicGame=(g:Game,a:Agreement|null)=>({id:g.game_id,version:g.version,turn:g.turn,dice:g.dice,positions:g.positions,status:g.status,winner:g.winner,lastAction:g.last_action,updatedAt:g.updated_at,deadlineAt:g.status==="playing"&&a?.startedAt?Math.max(g.updated_at,a.startedAt)+TURN_MS:null});
async function reaction(db:D1Database,room:string){
 const result=await db.prepare("SELECT seat,emoji,updated_at AS at FROM ludo_reactions WHERE room_id=? AND updated_at>?").bind(room,Date.now()-7000).first<{seat:number;emoji:string;at:number}>();
 return result||null;
}
const EMOJIS=new Set(["❤️","😂","🔥","👏","😍","💋"]);

/* Timeouts are checked on each authenticated poll/request. No cron or unattended background job. */
async function syncGift(db:D1Database,g:Game){
 await db.prepare(
  "INSERT INTO ludo_gifts(room_id,game_id,consent_0,consent_1,choice,chosen_by,given,updated_at) VALUES(?,?,0,0,NULL,NULL,0,?) "+
  "ON CONFLICT(room_id) DO UPDATE SET game_id=excluded.game_id,consent_0=0,consent_1=0,choice=NULL,chosen_by=NULL,given=0,updated_at=excluded.updated_at "+
  "WHERE ludo_gifts.game_id<>excluded.game_id"
 ).bind(g.room_id,g.game_id,Date.now()).run();
}
/* Each member signs with their own authenticated room identity before each match.
   This records agreement in the app; it is not a legally verified e-signature. */
async function syncAgreement(db:D1Database,g:Game){
 await db.prepare(
  "INSERT INTO ludo_agreements(room_id,game_id,updated_at) VALUES(?,?,?) "+
  "ON CONFLICT(room_id) DO UPDATE SET game_id=excluded.game_id,signed_0_name=NULL,signed_1_name=NULL,"+
  "signed_0_at=NULL,signed_1_at=NULL,gift_0=NULL,gift_1=NULL,started_at=NULL,updated_at=excluded.updated_at "+
  "WHERE ludo_agreements.game_id<>excluded.game_id"
 ).bind(g.room_id,g.game_id,Date.now()).run();
}
async function agreement(db:D1Database,g:Game):Promise<Agreement>{
 const r=await db.prepare("SELECT * FROM ludo_agreements WHERE room_id=? AND game_id=?")
 .bind(g.room_id,g.game_id).first<AgreementRow>();
 return {signed:[Boolean(r?.signed_0_at),Boolean(r?.signed_1_at)],
  names:[r?.signed_0_name??null,r?.signed_1_name??null],
  signedAt:[r?.signed_0_at??null,r?.signed_1_at??null],
  giftChoices:[r?.gift_0==null?null:Boolean(r.gift_0),r?.gift_1==null?null:Boolean(r.gift_1)],
  startedAt:r?.started_at??null};
}
const normName=(name:string)=>name.normalize("NFC").trim().replace(/\s+/g," ").toLocaleLowerCase("fr");

async function gift(db:D1Database,g:Game):Promise<Gift>{
 const row=await db.prepare("SELECT game_id,consent_0,consent_1,choice,chosen_by,given FROM ludo_gifts WHERE room_id=? AND game_id=?")
 .bind(g.room_id,g.game_id).first<GiftRow>();
 return {consents:[Boolean(row?.consent_0),Boolean(row?.consent_1)],
  choice:row?.choice&&GIFTS.has(row.choice)?row.choice as Gift["choice"]:null,
  chosenBy:row?.chosen_by??null,given:Boolean(row?.given)};
}
function botChoose(g:Game,seat:number,rolled:number){
 const available=g.positions[seat].map((progress,pawn)=>({progress,pawn})).filter(x=>movable(x.progress,rolled));
 if(!available.length)return null;
 const score=({progress}:typeof available[number])=>{
  const next=progress===-1?0:progress+rolled;
  let points=next===57?250:next>=51?90+next:progress===-1?85:next;
  if(next<=50){
   const land=(seat*26+next)%52;
   if(!SAFE.has(land)&&g.positions[1-seat].some(other=>other>=0&&other<=50&&((1-seat)*26+other)%52===land))points+=200;
   if(SAFE.has(land))points+=35;
  }
  return points;
 };
 available.sort((a,b)=>score(b)-score(a)||a.pawn-b.pawn);
 return available[0].pawn;
}
function botTurn(g:Game,name:string){
 const seat=g.turn;
 let last="L'ordinateur a passé le tour.";
 for(let tries=0;tries<12&&g.status==="playing"&&g.turn===seat;tries++){
  if(g.dice===null){
   const rolled=die();
   if(rolled===6&&g.streak>=2){
    g.dice=null;g.turn=1-seat;g.streak=0;last="Troisième 6 : tour passé.";break;
   }
   g.streak=rolled===6?g.streak+1:0;
   last="Dé : "+rolled+".";
   if(g.positions[seat].some(p=>movable(p,rolled)))g.dice=rolled;
   else{g.dice=null;if(rolled!==6)g.turn=1-seat;continue}
  }
  if(g.dice===null)continue;
  const rolled=g.dice;
  const pawn=botChoose(g,seat,rolled);
  if(pawn===null){g.dice=null;g.turn=1-seat;g.streak=0;break}
  const old=g.positions[seat][pawn];
  const next=old===-1?0:old+rolled;
  g.positions[seat][pawn]=next;
  let captured=0;
  if(next<=50){
   const land=(seat*26+next)%52;
   if(!SAFE.has(land)){
    for(let i=0;i<4;i++){
     const enemy=g.positions[1-seat][i];
     if(enemy>=0&&enemy<=50&&((1-seat)*26+enemy)%52===land){g.positions[1-seat][i]=-1;captured++}
    }
   }
  }
  last="Pion "+(pawn+1)+" avancé"+(captured?", capture !":"")+".";
  g.dice=null;
  if(g.positions[seat].every(p=>p===57)){
   g.status="won";g.winner=seat;last="Le joueur gagne la partie !";break;
  }
  if(rolled!==6)g.streak=0;
  if(!(rolled===6||captured>0||next===57))g.turn=1-seat;
 }
 if(g.status==="playing"&&g.turn===seat){g.turn=1-seat;g.dice=null;g.streak=0}
 g.last_action="🤖 Après 30 s, l'ordinateur a joué pour "+name+". "+last;
}
async function autoIfLate(db:D1Database,g:Game,a:Agreement):Promise<Game>{
 if(g.status!=="playing"||!a.startedAt||Date.now()<Math.max(g.updated_at,a.startedAt)+TURN_MS)return g;
 const acting=g.turn;
 const row=await db.prepare("SELECT name FROM members WHERE room_id=? AND seat=?").bind(g.room_id,acting).first<{name:string}>();
 botTurn(g,(row?.name||"le joueur").slice(0,30));
 if(!await save(db,g))return await getGame(db,g.room_id)||g;
 return await getGame(db,g.room_id)||g;
}

async function handle(ctx:Ctx,method:"GET"|"POST"):Promise<Response>{
 try{
  const db=ctx.env.DB;
  if(!db)return fail("Base de données non configurée.",503);
  const player=await session(ctx.request,db);
  if(!player)return fail("Session expirée, reconnecte-toi à Love Radar.",401);
  await ensureTable(db);
  const members=await countMembers(db,player.room_id);
  let g=members===2?await getGame(db,player.room_id):null;
  if(members===2&&!g){
   await createIfMissing(db,player.room_id);
   g=await getGame(db,player.room_id);
  }
  let signed:Agreement|null=null;
  if(g){
   await syncGift(db,g);
   await syncAgreement(db,g);
   signed=await agreement(db,g);
   g=await autoIfLate(db,g,signed);
  }
  if(method==="GET")return reply({ok:true,members,seat:player.seat,game:g?publicGame(g,signed):null,reaction:members===2?await reaction(db,player.room_id):null,gift:g?await gift(db,g):null,agreement:signed,serverNow:Date.now()});
  const text=await ctx.request.text();
  if(text.length>1024)return fail("Requête trop grande.",413);
  let data:Record<string,unknown>;
  try{data=JSON.parse(text) as Record<string,unknown>}catch{return fail("Requête invalide.")}
  if(members!==2)return fail("Il faut exactement deux partenaires pour jouer.",409);
  if(!g)return fail("La partie n'est pas disponible.",503);
  const action=data.action;
  if(action==="react"){
   if(typeof data.emoji!=="string"||!EMOJIS.has(data.emoji))return fail("Réaction inconnue.",400);
   await db.prepare("INSERT INTO ludo_reactions(room_id,seat,emoji,updated_at) VALUES(?,?,?,?) ON CONFLICT(room_id) DO UPDATE SET seat=excluded.seat,emoji=excluded.emoji,updated_at=excluded.updated_at")
    .bind(player.room_id,player.seat,data.emoji,Date.now()).run();
   return reply({ok:true,reaction:await reaction(db,player.room_id)});
  }
  if(action==="sign_rules"){
   if(g.status!=="playing")return fail("Cette manche est déjà terminée.",409);
   if(signed?.startedAt)return fail("La partie a déjà commencé. Un nouvel accord sera proposé à la prochaine manche.",409);
   if(data.acceptRules!==true)return fail("Lis et accepte les règles avant de signer.",400);
   if(typeof data.signature!=="string"||data.signature.length>80||!data.signature.trim())return fail("Écris ton nom pour signer.",400);
   if(normName(data.signature)!==normName(player.name))return fail("La signature doit correspondre au nom de ton profil Love Radar.",400);
   if(typeof data.giftConsent!=="boolean")return fail("Indique si tu acceptes ou refuses le défi cadeau.",400);
   const seat=player.seat;
   const now=Date.now();
   const nameCol=seat===0?"signed_0_name":"signed_1_name";
   const dateCol=seat===0?"signed_0_at":"signed_1_at";
   const giftCol=seat===0?"gift_0":"gift_1";
   const result=await db.prepare("UPDATE ludo_agreements SET "+nameCol+"=?,"+dateCol+"=?,"+giftCol+"=?,updated_at=? WHERE room_id=? AND game_id=? AND started_at IS NULL")
   .bind(player.name.trim(),now,data.giftConsent?1:0,now,player.room_id,g.game_id).run();
   if(result.meta.changes!==1)return fail("Cette partie a déjà commencé.",409);
   await db.prepare("UPDATE ludo_agreements SET started_at=? WHERE room_id=? AND game_id=? AND signed_0_at IS NOT NULL AND signed_1_at IS NOT NULL AND started_at IS NULL")
    .bind(now,player.room_id,g.game_id).run();
   const fresh=await agreement(db,g);
   if(fresh.startedAt){
    await db.prepare("UPDATE ludo_gifts SET consent_0=?,consent_1=?,updated_at=? WHERE room_id=? AND game_id=?")
     .bind(fresh.giftChoices[0]?1:0,fresh.giftChoices[1]?1:0,now,player.room_id,g.game_id).run();
   }
   return reply({ok:true,agreement:fresh,gift:await gift(db,g),game:publicGame(g,fresh),serverNow:Date.now()});
  }
  if(action==="gift_consent")return fail("Les cadeaux sont décidés et signés avant le début de chaque manche.",409);
  if(action==="gift_choose"){
   const current=await gift(db,g);
   if(g.status!=="won"||g.winner!==player.seat)return fail("Seul le gagnant peut choisir le cadeau.",403);
   if(!current.consents.every(Boolean))return fail("Le défi cadeau doit être accepté par les deux partenaires.",409);
   if(typeof data.choice!=="string"||!GIFTS.has(data.choice))return fail("Cadeau inconnu.",400);
   await db.prepare("UPDATE ludo_gifts SET choice=?,chosen_by=?,given=0,updated_at=? WHERE room_id=? AND game_id=?")
   .bind(data.choice,player.seat,Date.now(),player.room_id,g.game_id).run();
   return reply({ok:true,gift:await gift(db,g)});
  }
  if(action==="gift_given"){
   const current=await gift(db,g);
   if(g.status!=="won"||g.winner===player.seat||!current.choice)return fail("Aucun cadeau à confirmer.",403);
   if(typeof data.given!=="boolean")return fail("Choix invalide.",400);
   await db.prepare("UPDATE ludo_gifts SET given=?,updated_at=? WHERE room_id=? AND game_id=?")
   .bind(data.given?1:0,Date.now(),player.room_id,g.game_id).run();
   return reply({ok:true,gift:await gift(db,g)});
  }
  if(action!=="restart"&&!signed?.startedAt)return fail("Les deux partenaires doivent lire et signer avant de jouer.",409);
  if(!Number.isInteger(data.version)||data.version!==g.version)return fail("La partie a changé. Actualise le plateau.",409);
  const name=player.name.slice(0,30);
  if(action==="forfeit"){
   if(g.status!=="playing")return fail("La partie est déjà terminée.",409);
   g.status="won";g.winner=1-player.seat;g.turn=1-player.seat;g.dice=null;g.streak=0;
   g.last_action=name+" a abandonné la partie. Victoire de son partenaire ! 🏆";
  }else if(action==="restart"){
   if(g.status!=="won")return fail("Terminez la partie avant de recommencer.",409);
   g.game_id=crypto.randomUUID();
   g.turn=g.winner===0?1:0;
   g.dice=null;g.positions=initial();g.status="playing";g.winner=null;g.streak=0;
   g.last_action="Nouvelle partie à deux !";
   await db.prepare("DELETE FROM ludo_reactions WHERE room_id=?").bind(player.room_id).run();
  }else{
   if(g.status!=="playing")return fail("La partie est terminée.",409);
   if(g.turn!==player.seat)return fail("Ce n'est pas ton tour.",403);
   if(action==="roll"){
    if(g.dice!==null)return fail("Déplace d'abord ton pion.",409);
    const roll=die();
    if(roll===6&&g.streak>=2){
     g.dice=null;g.turn=1-player.seat;g.streak=0;
     g.last_action=name+" : troisième 6 consécutif, tour passé.";
    }else{
     g.streak=roll===6?g.streak+1:0;
     if(g.positions[player.seat].some(p=>movable(p,roll))){
      g.dice=roll;
      g.last_action=name+" a lancé un "+roll+".";
     }else{
      g.dice=null;
      if(roll!==6)g.turn=1-player.seat;
      g.last_action=name+" a lancé un "+roll+" : aucun déplacement possible.";
     }
    }
   }else if(action==="move"){
    if(g.dice===null)return fail("Lance d'abord le dé.",409);
    const pawn=data.pawn;
    if(!Number.isInteger(pawn)||typeof pawn!=="number"||pawn<0||pawn>3)return fail("Pion invalide.");
    const current=g.positions[player.seat][pawn];
    const roll=g.dice;
    if(!movable(current,roll))return fail("Ce pion ne peut pas avancer de ce nombre de cases.",409);
    const next=current===-1?0:current+roll;
    g.positions[player.seat][pawn]=next;
    let captures=0;
    if(next>=0&&next<=50){
     const landed=(player.seat*26+next)%52;
     if(!SAFE.has(landed)){
      const other=1-player.seat;
      for(let i=0;i<4;i++){
       const enemy=g.positions[other][i];
       if(enemy>=0&&enemy<=50&&(other*26+enemy)%52===landed){
        g.positions[other][i]=-1;captures++;
       }
      }
     }
    }
    const won=g.positions[player.seat].every(p=>p===57);
    g.dice=null;
    if(won){
     g.status="won";g.winner=player.seat;
     g.last_action=name+" a gagné la partie ! 🏆";
    }else{
     const bonus=roll===6||captures>0||next===57;
     g.turn=bonus?player.seat:1-player.seat;
     if(roll!==6)g.streak=0;
     g.last_action=name+" a avancé un pion"+(captures?" et capturé "+captures+" pion"+(captures>1?"s":"")+" !":"")+(next===57?" 🏠":"")+".";
    }
   }else return fail("Action inconnue.",404);
  }
  if(!await save(db,g))return fail("Ton partenaire a joué entre-temps. Plateau actualisé.",409);
  const updated=await getGame(db,player.room_id);
  let nextAgreement:Agreement|null=null;
  if(updated){
   await syncGift(db,updated);
   await syncAgreement(db,updated);
   nextAgreement=await agreement(db,updated);
   if(action==="restart")await db.prepare("DELETE FROM ludo_reactions WHERE room_id=?").bind(player.room_id).run();
  }
  return reply({ok:true,members,seat:player.seat,game:updated?publicGame(updated,nextAgreement):null,gift:updated?await gift(db,updated):null,agreement:nextAgreement,serverNow:Date.now()});
 }catch(e){console.error("Love Radar Ludo",e);return fail("Le jeu est temporairement indisponible.",500)}
}
export const onRequestGet=(ctx:Ctx)=>handle(ctx,"GET");
export const onRequestPost=(ctx:Ctx)=>handle(ctx,"POST");

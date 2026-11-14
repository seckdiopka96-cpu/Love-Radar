import type { D1Database } from "@cloudflare/workers-types";

// Server-authoritative, private two-player Ludo. Each couple has one live game.
// Progress -1 = base, 0..50 = outer track, 51..56 = home lane, 57 = finished.
type Env={DB?:D1Database};
type Ctx={request:Request;env:Env};
type Member={id:string;room_id:string;seat:number;name:string};
type GameRow={room_id:string;game_id:string;version:number;turn:number;dice:number|null;positions:string;status:string;winner:number|null;streak:number;last_action:string;updated_at:number};
type Board=number[][];
type Game={room_id:string;game_id:string;version:number;turn:number;dice:number|null;positions:Board;status:"playing"|"won";winner:number|null;streak:number;last_action:string;updated_at:number};
const initial=():Board=>[[-1,-1,-1,-1],[-1,-1,-1,-1]];
const SAFE=new Set([0,8,13,21,26,34,39,47]);
const reply=(payload:object,status=200)=>Response.json(payload,{status,headers:{"Cache-Control":"no-store"}});
const fail=(error:string,status=400)=>reply({ok:false,error},status);
let ready:Promise<void>|null=null;
async function ensureTable(db:D1Database){
 if(!ready){
  ready=db.exec("CREATE TABLE IF NOT EXISTS ludo_games (room_id TEXT PRIMARY KEY, game_id TEXT NOT NULL, version INTEGER NOT NULL, turn INTEGER NOT NULL, dice INTEGER, positions TEXT NOT NULL, status TEXT NOT NULL, winner INTEGER, streak INTEGER NOT NULL DEFAULT 0, last_action TEXT NOT NULL, updated_at INTEGER NOT NULL)").then(()=>{}).catch(e=>{ready=null;throw e});
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
const publicGame=(g:Game)=>({id:g.game_id,version:g.version,turn:g.turn,dice:g.dice,positions:g.positions,status:g.status,winner:g.winner,lastAction:g.last_action});
async function handle(ctx:Ctx,method:"GET"|"POST"):Promise<Response>{
 try{
  const db=ctx.env.DB;
  if(!db)return fail("Base de données non configurée.",503);
  const player=await session(ctx.request,db);
  if(!player)return fail("Session expirée, reconnecte-toi à Love Radar.",401);
  await ensureTable(db);
  const members=await countMembers(db,player.room_id);
  if(members===2)await createIfMissing(db,player.room_id);
  if(method==="GET"){
   const g=members===2?await getGame(db,player.room_id):null;
   return reply({ok:true,members,seat:player.seat,game:g?publicGame(g):null});
  }
  const text=await ctx.request.text();
  if(text.length>1024)return fail("Requête trop grande.",413);
  let data:Record<string,unknown>;
  try{data=JSON.parse(text) as Record<string,unknown>}catch{return fail("Requête invalide.")}
  if(members!==2)return fail("Il faut exactement deux partenaires pour jouer.",409);
  const g=await getGame(db,player.room_id);
  if(!g)return fail("La partie n'est pas disponible.",503);
  if(!Number.isInteger(data.version)||data.version!==g.version)return fail("La partie a changé. Actualise le plateau.",409);
  const action=data.action;
  const name=player.name.slice(0,30);
  if(action==="restart"){
   if(g.status!=="won")return fail("Terminez la partie avant de recommencer.",409);
   g.game_id=crypto.randomUUID();
   g.turn=g.winner===0?1:0;
   g.dice=null;g.positions=initial();g.status="playing";g.winner=null;g.streak=0;
   g.last_action="Nouvelle partie à deux !";
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
     const bonus=roll===6||captures>0;
     g.turn=bonus?player.seat:1-player.seat;
     if(roll!==6)g.streak=0;
     g.last_action=name+" a avancé un pion"+(captures?" et capturé "+captures+" pion"+(captures>1?"s":"")+" !":"")+(next===57?" 🏠":"")+".";
    }
   }else return fail("Action inconnue.",404);
  }
  if(!await save(db,g))return fail("Ton partenaire a joué entre-temps. Plateau actualisé.",409);
  const updated=await getGame(db,player.room_id);
  return reply({ok:true,members,seat:player.seat,game:updated?publicGame(updated):null});
 }catch(e){console.error("Love Radar Ludo",e);return fail("Le jeu est temporairement indisponible.",500)}
}
export const onRequestGet=(ctx:Ctx)=>handle(ctx,"GET");
export const onRequestPost=(ctx:Ctx)=>handle(ctx,"POST");

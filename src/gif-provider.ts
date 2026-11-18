/**
 * GIPHY is optional. Their standard API prohibits caching, proxying or storing
 * copies of their media. Only GIF IDs may be persisted in Love Radar or localStorage.
 * All API requests and media loads happen directly on each client.
 */
export type GifResult={id:string;title:string;preview:string;original:string};
export type GiphyKind="gif"|"sticker"|"emoji";
export type GifPage={items:GifResult[];nextOffset:number;hasMore:boolean};
export const GIPHY_PAGE_SIZE=50;
export const GIPHY_KEY=(import.meta.env?.VITE_GIPHY_API_KEY||"").trim();
export const GIF_PREFIX="[gif:v1:";
export function readGifId(content:string|null|undefined):string|null{
 if(!content||!content.startsWith(GIF_PREFIX)||!content.endsWith("]"))return null;
 const id=content.slice(GIF_PREFIX.length,-1);
 return /^[A-Za-z0-9]{3,60}$/.test(id)?id:null;
}
export function encodeGif(id:string):string{
 if(!/^[A-Za-z0-9]{3,60}$/.test(id))throw Error("GIF non reconnu.");
 return GIF_PREFIX+id+"]";
}
export function validGifUrl(value:string):boolean{
 try{
  const url=new URL(value);
  return url.protocol==="https:"&&
   (url.hostname==="media.giphy.com"||url.hostname==="i.giphy.com"||
    /^media\d+\.giphy\.com$/.test(url.hostname));
 }catch{return false}
}
type GiphyItem={id?:string;title?:string;images?:{
 fixed_width?:{url?:string};fixed_height?:{url?:string};downsized?:{url?:string};original?:{url?:string};
}};
function readGifItem(item:GiphyItem):GifResult|null{
 if(!item||typeof item.id!=="string"||!/^[A-Za-z0-9]{3,60}$/.test(item.id))return null;
 const preview=item.images?.fixed_width?.url||item.images?.fixed_height?.url||item.images?.downsized?.url||item.images?.original?.url||"";
 const original=item.images?.downsized?.url||item.images?.original?.url||"";
 if(!validGifUrl(preview)||!validGifUrl(original))return null;
 return {id:item.id,title:String(item.title||"GIF animé").slice(0,100),preview,original};
}
export function readGifResults(data:unknown):GifResult[]{
 if(!data||typeof data!=="object"||!("data" in data))return [];
 const raw=(data as {data?:unknown}).data;
 if(!Array.isArray(raw))return [];
 return raw.slice(0,GIPHY_PAGE_SIZE).flatMap((g:unknown)=>{
  const item=readGifItem(g as GiphyItem);
  return item?[item]:[];
 });
}
async function giphyRequest(url:URL,params:Record<string,string>,signal:AbortSignal):Promise<unknown>{
 if(!GIPHY_KEY)throw Error("La recherche de GIF externes n'est pas encore configurée.");
 url.searchParams.set("api_key",GIPHY_KEY);
 for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
 let response:Response;
 try{
  response=await fetch(url.toString(),{signal,credentials:"omit",cache:"no-store"});
 }catch(error){
  if(signal.aborted)throw error;
  throw Error("Connexion à GIPHY impossible. Réessaie ou vérifie ta connexion.");
 }
 if(response.status===429)throw Error("Limite gratuite de recherches GIPHY atteinte. Réessaie plus tard.");
 if(response.status===401||response.status===403)throw Error("Accès GIPHY refusé. Vérifie la clé API.");
 if(!response.ok)throw Error("Catalogue GIF temporairement indisponible.");
 return response.json();
}
async function gifApi(path:string,params:Record<string,string>,signal:AbortSignal):Promise<unknown>{
 const url=new URL("https://api.giphy.com/v1/gifs"+path);
 return giphyRequest(url,{rating:"g",...params},signal);
}

/** The API pagination offset counts raw entries, not just valid rendered entries.
 *  Respect GIPHY beta's max 50 results per request and advertised total_count. */
export function readGiphyPage(data:unknown,offset=0,maximum=4999):GifPage{
 const source=data&&typeof data==="object"?data as {
  data?:unknown; pagination?:{count?:unknown;total_count?:unknown}
 }:null;
 const raw=Array.isArray(source?.data)?source.data:[];
 const count=typeof source?.pagination?.count==="number"?
  Math.max(0,Math.min(GIPHY_PAGE_SIZE,source.pagination.count)):Math.min(raw.length,GIPHY_PAGE_SIZE);
 const nextOffset=offset+count;
 const total=typeof source?.pagination?.total_count==="number"?source.pagination.total_count:null;
 return {
  items:readGifResults(data),nextOffset,
  hasMore:count===GIPHY_PAGE_SIZE&&nextOffset<=maximum&&(total===null||nextOffset<total)
 };
}

/** Direct device-side browse. Emoji has a catalog endpoint, not a text search. */
export async function browseGiphy(kind:GiphyKind,query:string,offset:number,signal:AbortSignal):Promise<GifPage>{
 const safeOffset=Math.max(0,Math.min(4999,Math.trunc(offset)||0));
 const value=query.trim().slice(0,50);
 const params:Record<string,string>={limit:String(GIPHY_PAGE_SIZE),offset:String(safeOffset)};
 let data:unknown;
 if(kind==="emoji"){
  data=await giphyRequest(new URL("https://api.giphy.com/v2/emoji"),params,signal);
 }else{
  const path=value?"/search":"/trending";
  const extra:Record<string,string>=value?{q:value,lang:"fr"}:{};
  if(kind==="gif")data=await gifApi(path,{...params,...extra},signal);
  else data=await giphyRequest(
   new URL("https://api.giphy.com/v1/stickers"+path),
   {rating:"g",...params,...extra},signal);
 }
 return readGiphyPage(data,safeOffset,kind==="emoji"||value?4999:499);
}
export async function searchGifs(query:string,signal:AbortSignal):Promise<GifResult[]>{
 return (await browseGiphy("gif",query,0,signal)).items;
}
export async function gifsByIds(ids:readonly string[],signal:AbortSignal):Promise<GifResult[]>{
 const valid=ids.filter(id=>/^[A-Za-z0-9]{3,60}$/.test(id)).slice(0,24);
 if(!valid.length)return [];
 const result=readGifResults(await gifApi("",{ids:valid.join(",")},signal));
 // Preserve the requested order for recents/favorites, not for search/trending.
 return valid.flatMap(id=>result.filter(item=>item.id===id));
}
export async function gifById(id:string,signal:AbortSignal):Promise<GifResult|null>{
 if(!/^[A-Za-z0-9]{3,60}$/.test(id))return null;
 const result=await gifApi("/"+id,{},signal) as {data?:GiphyItem};
 return result?.data?readGifItem(result.data):null;
}

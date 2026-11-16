/**
 * GIPHY is optional. Their standard API prohibits caching, proxying or storing
 * copies of their media. Only GIF IDs may be persisted in Love Radar or localStorage.
 * All API requests and media loads happen directly on each client.
 */
export type GifResult={id:string;title:string;preview:string;original:string};
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
 fixed_width?:{url?:string};downsized?:{url?:string};original?:{url?:string};
}};
function readGifItem(item:GiphyItem):GifResult|null{
 if(!item||typeof item.id!=="string"||!/^[A-Za-z0-9]{3,60}$/.test(item.id))return null;
 const preview=item.images?.fixed_width?.url||item.images?.downsized?.url||"";
 const original=item.images?.downsized?.url||item.images?.original?.url||"";
 if(!validGifUrl(preview)||!validGifUrl(original))return null;
 return {id:item.id,title:String(item.title||"GIF animé").slice(0,100),preview,original};
}
export function readGifResults(data:unknown):GifResult[]{
 if(!data||typeof data!=="object"||!("data" in data))return [];
 const raw=(data as {data?:unknown}).data;
 if(!Array.isArray(raw))return [];
 return raw.slice(0,32).flatMap((g:unknown)=>{
  const item=readGifItem(g as GiphyItem);
  return item?[item]:[];
 });
}
async function gifApi(path:string,params:Record<string,string>,signal:AbortSignal):Promise<unknown>{
 if(!GIPHY_KEY)throw Error("La recherche de GIF externes n'est pas encore configurée.");
 const url=new URL("https://api.giphy.com/v1/gifs"+path);
 url.searchParams.set("api_key",GIPHY_KEY);
 url.searchParams.set("rating","g");
 for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
 const response=await fetch(url.toString(),{signal,credentials:"omit",cache:"no-store"});
 if(!response.ok)throw Error("Catalogue GIF temporairement indisponible.");
 return response.json();
}
export async function searchGifs(query:string,signal:AbortSignal):Promise<GifResult[]>{
 const value=query.trim().slice(0,50);
 const path=value?"/search":"/trending";
 return readGifResults(await gifApi(path,{
  limit:"24",...(value?{q:value,lang:"fr"}:{})
 },signal));
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

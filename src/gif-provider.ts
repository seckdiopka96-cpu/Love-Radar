/**
 * Optional real GIF search, powered by GIPHY.
 * GIPHY requires a separate public, client-side API key and visible attribution.
 * Never send GIF media through our server as an unvalidated remote URL.
 */
export type GifResult={id:string;title:string;preview:string;original:string};
export const GIPHY_KEY=(import.meta.env?.VITE_GIPHY_API_KEY||"").trim();
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
export function readGifResults(data:unknown):GifResult[]{
 if(!data||typeof data!=="object"||!("data" in data))return [];
 const raw=(data as {data?:unknown}).data;
 if(!Array.isArray(raw))return [];
 return raw.slice(0,32).flatMap((g:unknown)=>{
  const item=g as GiphyItem;
  if(!item||typeof item.id!=="string"||!/^[a-zA-Z0-9]{3,60}$/.test(item.id))return [];
  const preview=item.images?.fixed_width?.url||item.images?.downsized?.url||"";
  const original=item.images?.downsized?.url||item.images?.original?.url||"";
  if(!validGifUrl(preview)||!validGifUrl(original))return [];
  return [{id:item.id,title:String(item.title||"GIF animé").slice(0,100),preview,original}];
 });
}
export async function searchGifs(query:string,signal:AbortSignal):Promise<GifResult[]>{
 if(!GIPHY_KEY)return [];
 const value=query.trim().slice(0,50);
 const path=value?"search":"trending";
 const url=new URL("https://api.giphy.com/v1/gifs/"+path);
 url.searchParams.set("api_key",GIPHY_KEY);
 url.searchParams.set("rating","g");
 url.searchParams.set("limit","24");
 if(value){url.searchParams.set("q",value);url.searchParams.set("lang","fr")}
 const response=await fetch(url.toString(),{signal,credentials:"omit"});
 if(!response.ok)throw Error("Recherche GIF temporairement indisponible.");
 return readGifResults(await response.json());
}
export async function fetchGifFile(item:GifResult):Promise<File>{
 if(!validGifUrl(item.original))throw Error("Adresse GIF non reconnue.");
 const controller=new AbortController();
 const timeout=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch(item.original,{signal:controller.signal,credentials:"omit",redirect:"follow"});
  if(!response.ok||!validGifUrl(response.url))throw Error("GIF inaccessible.");
  const size=Number(response.headers.get("content-length")||"0");
  if(size>5_500_000)throw Error("Ce GIF est trop volumineux (5,5 Mo maximum).");
  const mime=(response.headers.get("content-type")||"").split(";")[0].trim().toLowerCase();
  if(mime!=="image/gif")throw Error("Le média sélectionné n'est pas un GIF.");
  const blob=await response.blob();
  if(blob.size===0||blob.size>5_500_000)throw Error("GIF vide ou trop volumineux.");
  const signature=new TextDecoder().decode(new Uint8Array(await blob.slice(0,6).arrayBuffer()));
  if(signature!=="GIF87a"&&signature!=="GIF89a")throw Error("Format GIF non valide.");
  return new File([blob],"love-radar-"+item.id+".gif",{type:"image/gif"});
 }finally{clearTimeout(timeout)}
}

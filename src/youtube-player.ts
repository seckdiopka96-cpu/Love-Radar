/** Small typed adapter for YouTube's official IFrame Player API (no extra SDK). */
export type YouTubePlayer={
 playVideo():void;
 pauseVideo():void;
 seekTo(seconds:number,allowSeekAhead:boolean):void;
 cueVideoById(videoId:string,startSeconds?:number):void;
 loadVideoById(videoId:string,startSeconds?:number):void;
 getCurrentTime():number;
 getDuration():number;
 getPlayerState():number;
 destroy():void;
};
type YTNamespace={
 Player:new(element:HTMLElement,options:{
  videoId:string;width?:string;height?:string;host?:string;
  playerVars?:Record<string,string|number>;
  events:{
   onReady:(event:{target:YouTubePlayer})=>void;
   onStateChange:(event:{target:YouTubePlayer;data:number})=>void;
   onError?:(event:{target:YouTubePlayer;data:number})=>void;
   onAutoplayBlocked?:()=>void
  }
 })=>YouTubePlayer;
};
type YTWindow=Window&{YT?:YTNamespace;onYouTubeIframeAPIReady?:(()=>void)|undefined};
let loader:Promise<YTNamespace>|null=null;
export function getYouTubeAPI():Promise<YTNamespace>{
 if((window as YTWindow).YT?.Player)return Promise.resolve((window as YTWindow).YT!);
 if(loader)return loader;
 loader=new Promise<YTNamespace>((resolve,reject)=>{
  const host=window as YTWindow;
  let finished=false;
  const prior=host.onYouTubeIframeAPIReady;
  const script=document.createElement("script");
  script.src="https://www.youtube.com/iframe_api";
  script.async=true;
  const timeout=window.setTimeout(()=>finish(new Error("YouTube ne répond pas. Vérifie ta connexion.")),18000);
  function finish(error?:Error){
   if(finished)return;
   finished=true;window.clearTimeout(timeout);
   host.onYouTubeIframeAPIReady=prior;
   if(error){script.remove();loader=null;reject(error)}
   else if(host.YT?.Player)resolve(host.YT);
   else{loader=null;reject(new Error("Lecteur YouTube indisponible."))}
  }
  host.onYouTubeIframeAPIReady=()=>{
   try{prior?.()}catch{/* Preserve external listener without stopping this loader. */}
   finish();
  };
  script.onerror=()=>finish(new Error("Impossible de charger le lecteur YouTube."));
  document.head.appendChild(script);
 });
 return loader;
}
export async function mountYouTubePlayer(element:HTMLElement,videoId:string,handlers:{
 onReady:(player:YouTubePlayer)=>void;
 onChange:(state:number)=>void;
 onBlocked:()=>void;
 onError:(message:string)=>void
}):Promise<YouTubePlayer>{
 const YT=await getYouTubeAPI();
 const isWeb=/^https?:$/.test(window.location.protocol);
 const origin=isWeb?window.location.origin:undefined;
 return new YT.Player(element,{
  videoId,width:"100%",height:"100%",host:"https://www.youtube-nocookie.com",
  playerVars:{playsinline:1,controls:1,rel:0,fs:1,autoplay:0,enablejsapi:1,...(origin?{origin}:{})},
  events:{
   onReady:event=>handlers.onReady(event.target),
   onStateChange:event=>handlers.onChange(event.data),
   onAutoplayBlocked:handlers.onBlocked,
   onError:event=>{
    const message=event.data===101||event.data===150?"Cette vidéo interdit la lecture intégrée.":
     event.data===100?"Vidéo introuvable ou privée.":
     event.data===153?"YouTube nécessite une identification du site pour ce lecteur.":
     "Cette vidéo ne peut pas être lue ici (erreur "+event.data+").";
    handlers.onError(message);
   }
  }
 });
}

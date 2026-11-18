/** Safe, shared room styling: no private message or photo content is stored here. */
export const CHAT_WALLPAPERS=["minuit","constellation","aurore","coeurs"] as const;
export const CHAT_COLORS=["rose","ocean","lavande","ambre"] as const;
export const CHAT_BUBBLES=["classique","douce","compacte"] as const;
export type ChatWallpaper=typeof CHAT_WALLPAPERS[number];
export type ChatColor=typeof CHAT_COLORS[number];
export type ChatBubble=typeof CHAT_BUBBLES[number];
export type ChatTheme={
 wallpaper:ChatWallpaper;color:ChatColor;bubble:ChatBubble;animated:boolean;version:number;
};
export const DEFAULT_CHAT_THEME:ChatTheme={
 wallpaper:"minuit",color:"rose",bubble:"classique",animated:true,version:0
};
export function validChatTheme(value:unknown):value is Omit<ChatTheme,"version">{
 if(!value||typeof value!=="object")return false;
 const entry=value as Record<string,unknown>;
 return CHAT_WALLPAPERS.includes(entry.wallpaper as ChatWallpaper)&&
  CHAT_COLORS.includes(entry.color as ChatColor)&&
  CHAT_BUBBLES.includes(entry.bubble as ChatBubble)&&
  typeof entry.animated==="boolean";
}
export function parseChatTheme(value:unknown):ChatTheme{
 if(!validChatTheme(value))return DEFAULT_CHAT_THEME;
 const entry=value as Omit<ChatTheme,"version">&{version?:unknown};
 return {...DEFAULT_CHAT_THEME,...entry,version:Number.isSafeInteger(entry.version)&&Number(entry.version)>=0?Number(entry.version):0};
}

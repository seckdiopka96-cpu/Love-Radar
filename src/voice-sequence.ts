/** Playback belongs to one continuous sender run of voice notes.
 * A text/photo/sticker/other sender ends the run; no non-adjacent skipping. */
export type VoiceSequenceMessage={id:string;kind:string;sender_id:string};
export type VoiceSpeed=1|1.5|2;
export const VOICE_SPEEDS:readonly VoiceSpeed[]=[1,1.5,2];
export function nextVoiceSpeed(current:VoiceSpeed):VoiceSpeed{
 return current===1?1.5:current===1.5?2:1;
}
export function nextConsecutiveVoiceId(
 messages:readonly VoiceSequenceMessage[],index:number
):string|null{
 if(!Number.isInteger(index)||index<0||index>=messages.length)return null;
 const current=messages[index],next=messages[index+1];
 if(current.kind!=="audio"||!next||next.kind!=="audio"||next.sender_id!==current.sender_id)return null;
 return next.id;
}

/**
 * Multiplayer state is server-authoritative. Polling and POST responses can
 * finish in any order on mobile networks; never let a delayed older response
 * roll a board, turn, dice, winner or score backward.
 */
export type VersionedGame={id:string;version:number};
export type SnapshotPolicy="replace"|"presence-only"|"ignore";
export function teamSnapshotPolicy(
 current:VersionedGame|null,incoming:VersionedGame,
 allowRoomSwitch=false
):SnapshotPolicy{
 if(!current)return "replace";
 if(incoming.id!==current.id)return allowRoomSwitch?"replace":"ignore";
 if(incoming.version<current.version)return "ignore";
 if(incoming.version===current.version)return "presence-only";
 return "replace";
}

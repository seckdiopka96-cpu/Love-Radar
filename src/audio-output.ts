/** Prefer a real built-in speaker output over headset or receiver routes. */
export function isSpeakerLabel(label:string):boolean{
 return /speaker|haut[ -]?parleur|altoparlante|altavoz|loudspeaker|built[ -]?in output/i.test(label)&&
  !/headphone|headset|earpiece|receiver|écouteur|casque|airpods|bluetooth/i.test(label);
}
export function findBuiltInSpeaker(devices:readonly {kind:string;label:string;deviceId:string}[]):string|null{
 return devices.find(d=>d.kind==="audiooutput"&&d.deviceId&&isSpeakerLabel(d.label))?.deviceId||null;
}
export function audioRouteHelp(isIOS:boolean):string{
 return isIOS
  ?"Ce navigateur iPhone ne donne pas accès à un changement fiable de sortie audio. Choisis la sortie via le Centre de contrôle iOS (AirPlay), ou utilise la version native avec gestion audio."
  :"La sortie audio n'est pas sélectionnable dans ce navigateur. Vérifie les paramètres audio du téléphone.";
}

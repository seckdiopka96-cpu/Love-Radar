/** iOS Safari can surface a temporary mobile-data failure as the unhelpful "Load failed". */
export function connectionErrorMessage(error:unknown,aborted=false,offline=false):string{
 if(aborted)return "Connexion trop lente. Vérifie ton réseau mobile ou le Wi-Fi, puis réessaie.";
 if(offline)return "Connexion Internet indisponible. Vérifie la 4G/5G ou le Wi-Fi.";
 const detail=error instanceof Error?error.message:String(error||"");
 if(/(?:load failed|failed to fetch|networkerror|network request failed|network connection was lost|internet connection appears to be offline|connection reset)/i.test(detail))
  return "Connexion au serveur impossible pour le moment. Love Radar fonctionne en 4G/5G et en Wi-Fi. Nouvelle tentative automatique…";
 return detail||"Connexion impossible. Réessaie dans un instant.";
}

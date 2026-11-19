/** Original couple-party questions. The authoritative correct answer stays on the server.
 * Prompts are safe, consensual and don't require photos, personal data or public posting.
 */
export type PartyMode="rapid"|"truth";
export type RapidQuestion={question:string;options:readonly [string,string,string,string];answer:0|1|2|3};
export type ChallengeKind="truth"|"action";
export const RAPID_SECONDS=18;
export const RAPID_COUNTDOWN_MS=3000;
export const RAPID_QUESTIONS:readonly RapidQuestion[]=[
 {question:"Quel est le langage des fleurs traditionnellement associé à l'amour ?",options:["La tulipe noire","La rose rouge","Le tournesol","Le muguet"],answer:1},
 {question:"Combien de couleurs ont les cartes à jouer classiques ?",options:["1","2","3","4"],answer:1},
 {question:"Quelle planète est surnommée la planète rouge ?",options:["Mars","Vénus","Jupiter","Mercure"],answer:0},
 {question:"Quel animal est célèbre pour former des couples très durables ?",options:["Le papillon","Le flamant rose","L'albatros","La libellule"],answer:2},
 {question:"Combien de minutes y a-t-il dans une heure ?",options:["50","60","70","100"],answer:1},
 {question:"Lequel de ces pays a Dakar pour capitale ?",options:["Mali","Guinée","Sénégal","Gambie"],answer:2},
 {question:"Quelle est la capitale de la France ?",options:["Lyon","Paris","Nice","Marseille"],answer:1},
 {question:"Combien de couleurs compte traditionnellement un arc-en-ciel ?",options:["5","6","7","8"],answer:2},
 {question:"Lequel de ces instruments possède des touches noires et blanches ?",options:["Guitare","Piano","Flûte","Violoncelle"],answer:1},
 {question:"Dans quelle direction le soleil se lève-t-il ?",options:["Nord","Sud","Ouest","Est"],answer:3},
 {question:"Quel fruit est généralement jaune lorsqu'il est mûr ?",options:["Banane","Fraise","Raisin noir","Cerise"],answer:0},
 {question:"Combien de jours y a-t-il habituellement en février ?",options:["26","27","28","30"],answer:2},
 {question:"Quel sport se joue avec un volant ?",options:["Tennis","Badminton","Basketball","Handball"],answer:1},
 {question:"Quel océan borde l'ouest du Sénégal ?",options:["Indien","Pacifique","Atlantique","Arctique"],answer:2},
 {question:"Quel est le plus petit nombre pair positif ?",options:["1","2","3","4"],answer:1},
 {question:"Combien de lettres contient le mot « amour » ?",options:["4","5","6","7"],answer:1},
 {question:"Quelle couleur obtient-on en mélangeant du bleu et du jaune en peinture ?",options:["Violet","Vert","Orange","Rose"],answer:1},
 {question:"Quel appareil permet de voir les étoiles de plus près ?",options:["Microscope","Boussole","Télescope","Thermomètre"],answer:2},
 {question:"Quelle boisson est traditionnellement préparée avec des feuilles de thé ?",options:["Café","Thé","Limonade","Chocolat"],answer:1},
 {question:"Combien font 7 + 8 ?",options:["13","14","15","16"],answer:2},
 {question:"Quelle est la première lettre de l'alphabet français ?",options:["B","A","C","D"],answer:1},
 {question:"Quel organe fait circuler le sang ?",options:["Poumon","Foie","Cœur","Estomac"],answer:2},
 {question:"Lequel est un jour de la semaine ?",options:["Janvier","Automne","Lundi","Minuit"],answer:2},
 {question:"Dans quel continent se trouve le Maroc ?",options:["Afrique","Europe","Asie","Océanie"],answer:0},
 {question:"Quel animal miaule ?",options:["Chien","Chat","Cheval","Canard"],answer:1},
 {question:"Que mesure un thermomètre ?",options:["Distance","Vitesse","Température","Volume"],answer:2},
 {question:"Quel objet donne l'heure ?",options:["Montre","Parapluie","Cadenas","Brosse"],answer:0},
 {question:"Quel est le résultat de 9 × 3 ?",options:["18","24","27","30"],answer:2},
 {question:"Combien de côtés a un triangle ?",options:["2","3","4","5"],answer:1},
 {question:"Quel est le contraire de « rapide » ?",options:["Lent","Léger","Fort","Grand"],answer:0},
 {question:"Quel fruit porte aussi le nom d'une couleur ?",options:["Poire","Orange","Banane","Mangue"],answer:1},
 {question:"Dans le mot « couple », quelle est la dernière lettre ?",options:["L","U","P","E"],answer:3},
 {question:"Combien y a-t-il de saisons dans une année ?",options:["3","4","5","6"],answer:1},
 {question:"Quelle ville est connue pour la tour Eiffel ?",options:["Londres","Rome","Paris","Madrid"],answer:2},
 {question:"Lequel de ces nombres est un multiple de 5 ?",options:["12","17","25","29"],answer:2},
 {question:"Comment appelle-t-on une personne qui écrit des poèmes ?",options:["Peintre","Poète","Pilote","Marin"],answer:1}
];
export const TRUTH_PROMPTS:readonly string[]=[
 "Quel souvenir de nous deux te donne encore le sourire sans prévenir ?",
 "Quelle petite attention de ton partenaire te touche le plus ?",
 "Quelle habitude adorable de ton partenaire te fait rire ?",
 "À quel moment t'es-tu senti(e) particulièrement proche de moi ?",
 "Quel compliment aimerais-tu recevoir plus souvent ?",
 "Qu'est-ce que tu as remarqué en premier chez ton partenaire ?",
 "Quelle est la chose la plus drôle que tu aies faite par amour ?",
 "Quel détail de notre première conversation as-tu retenu ?",
 "Quel rêve aimerais-tu réaliser à deux cette année ?",
 "Quelle chanson te fait penser à notre histoire ?",
 "Quel est ton rendez-vous idéal, même avec un tout petit budget ?",
 "Quelle qualité de ton partenaire t'impressionne le plus ?",
 "Quelle petite manie chez toi ton partenaire connaît mieux que personne ?",
 "Quelle surprise romantique aimerais-tu vivre un jour ?",
 "Quel surnom secret te ferait sourire ?",
 "Quel endroit aimerais-tu découvrir main dans la main ?",
 "Qu'aimerais-tu qu'on fasse plus souvent ensemble ?",
 "Quel message de ton partenaire t'a le plus marqué(e) ?",
 "Quelle est ta façon préférée de recevoir de l'affection ?",
 "De quoi es-tu le plus fier ou la plus fière dans notre relation ?",
 "Quel fou rire partagé aimerais-tu revivre ?",
 "Quelle chose toute simple te fait te sentir aimé(e) ?",
 "Quel est le geste le plus spontané que tu aies fait par amour ?",
 "Quelle première impression de moi s'est révélée complètement fausse ?",
 "Quel souvenir embarrassant de toi te fait rire aujourd'hui ?",
 "Quelle tradition aimerais-tu inventer juste pour nous ?",
 "Quelle peur ridicule avais-tu lors d'un premier rendez-vous ?",
 "Quel talent caché de ton partenaire admires-tu ?",
 "Quel moment ordinaire avec moi te semble extraordinaire ?",
 "Si on pouvait revivre une journée ensemble, laquelle choisirais-tu ?",
 "Quelle promesse simple aimerais-tu qu'on se fasse ?",
 "Quelle est la dernière chose que ton partenaire a faite et qui t'a attendri(e) ?",
 "Quel détail de ma personnalité voudrais-tu mieux comprendre ?",
 "Qu'est-ce qui te manque le plus quand nous sommes loin ?",
 "Quel jeu ou défi rêverais-tu qu'on essaie ensemble ?",
 "Quelle chose nouvelle aimerais-tu apprendre avec ton partenaire ?",
 "Quel a été ton plus grand moment de trac amoureux ?",
 "Quelle drôle d'habitude voudrais-tu qu'on garde dans dix ans ?",
 "Quand t'es-tu senti(e) le plus soutenu(e) par ton partenaire ?",
 "Quel compliment que tu n'oses pas dire aimerais-tu enfin partager ?",
 "Quelle petite folie inoffensive tenterais-tu à deux ?",
 "Quelle question amusante voudrais-tu que je te pose ?"
];
export const ACTION_PROMPTS:readonly string[]=[
 "Fais ta plus belle grimace pendant cinq secondes.",
 "Danse pendant dix secondes, même assis(e), sans musique.",
 "Mime un cœur géant avec tes bras pendant cinq secondes.",
 "Imite un robot amoureux en disant « Tu me manques ».",
 "Fais rire ton partenaire sans prononcer un mot pendant dix secondes.",
 "Chante une mélodie inventée de cinq secondes pour ton partenaire.",
 "Envoie trois emojis qui racontent une mini-histoire d'amour.",
 "Fais un clin d'œil exagéré, puis un salut royal.",
 "Mime une scène de retrouvailles à la gare ou à l'aéroport.",
 "Fais trois expressions à la suite : surpris(e), jaloux(se) pour rire et amoureux(se).",
 "Fais un petit défilé de mode improvisé, même depuis ta chaise.",
 "Prononce « Bonjour mon amour » avec une voix de dessin animé.",
 "Imite un présentateur météo annonçant une pluie de bisous.",
 "Fais une révérence puis cinq applaudissements pour ton partenaire.",
 "Fais une déclaration d'amour dans une voix de robot.",
 "Mime l'ouverture d'un cadeau imaginaire et une réaction très théâtrale.",
 "Fais trois bruits d'animaux pour faire deviner celui qui représente votre duo.",
 "Envoie un compliment en exactement cinq mots dans le chat.",
 "Fais une mini-chorégraphie de trois gestes et répète-la.",
 "Fais semblant de recevoir un Oscar pour le meilleur couple.",
 "Dis « Je pense à toi » de trois façons différentes : chuchoté, chanté et théâtral.",
 "Prends un objet près de toi et présente-le comme un cadeau de luxe imaginaire.",
 "Mime une demande de câlin avec les bras, sans parler.",
 "Fais une voix de super-héros pour inviter ton partenaire à un rendez-vous.",
 "Envoie un message composé uniquement de quatre emojis.",
 "Imite une sonnerie de téléphone rigolote trois fois de suite.",
 "Fais un compte à rebours de cinq à un, puis envoie un cœur.",
 "Joue une publicité de dix secondes pour un rendez-vous avec toi.",
 "Trace une étoile dans l'air avec ton doigt puis souffle dessus.",
 "Fais une imitation du rire de trois personnages imaginaires.",
 "Fais semblant de prendre un selfie de couple avec un téléphone invisible.",
 "Envoie dans le chat une phrase tendre écrite à l'envers, mot par mot.",
 "Fais une danse de la victoire de cinq secondes.",
 "Invente et joue un salut secret que vous pourrez refaire à deux.",
 "Joue le rôle d'un serveur qui présente un dîner romantique imaginaire.",
 "Écris dans le chat un mini-poème de deux lignes pour ton partenaire.",
 "Réalise un mime de ton premier rendez-vous idéal, sans parler.",
 "Fais une scène de cinéma muet où tu reçois un message d'amour.",
 "Imite un commentateur sportif qui annonce votre prochain rendez-vous.",
 "Fais une expression très sérieuse, puis éclate de rire volontairement.",
 "Transforme ton prénom et celui de ton partenaire en un nom de duo amusant et annonce-le.",
 "Fais le bruit de trois bisous imaginaires avec un air très sérieux.",
 "Fais une petite sérénade improvisée de dix secondes.",
 "Fais semblant d'ouvrir une boîte contenant un soleil miniature.",
 "Mime un cadeau emballé que tu offres à ton partenaire.",
 "Écris une invitation surprise à un rendez-vous imaginaire en une phrase dans le chat.",
 "Fais une imitation exagérée de quelqu'un qui vient de gagner au loto.",
 "Fais une mini-scène où tu retrouves ton partenaire après dix ans, avec une seule réplique."
];
export function validPartyMode(value:unknown):value is PartyMode{return value==="rapid"||value==="truth"}
export function validChallengeKind(value:unknown):value is ChallengeKind{return value==="truth"||value==="action"}
export function validChoice(value:unknown):value is 0|1|2|3{
 return Number.isInteger(value)&&typeof value==="number"&&value>=0&&value<4;
}
export function nextPartyIndex(length:number,previous:number,random:number):number{
 if(!Number.isInteger(length)||length<=0)throw Error("Collection vide");
 if(length===1)return 0;
 const n=Math.min(length-2,Math.max(0,Math.floor(Math.max(0,Math.min(.9999999,random))*(length-1))));
 return n>=previous&&previous>=0&&previous<length?n+1:n;
}
/** Draw every card from a category before reshuffling that category. */
export function nextUnseenPartyIndex(length:number,seen:readonly number[],previous:number,random:number):number{
 if(!Number.isInteger(length)||length<=0)throw Error("Collection vide");
 const used=new Set(seen.filter(n=>Number.isInteger(n)&&n>=0&&n<length));
 let candidates=Array.from({length},(_,i)=>i).filter(i=>!used.has(i));
 if(!candidates.length){
  candidates=Array.from({length},(_,i)=>i).filter(i=>length===1||i!==previous);
 }
 const r=Number.isFinite(random)?Math.min(.999999999,Math.max(0,random)):0;
 return candidates[Math.floor(r*candidates.length)];
}
export function partyQuestion(index:number):RapidQuestion{
 return RAPID_QUESTIONS[((index%RAPID_QUESTIONS.length)+RAPID_QUESTIONS.length)%RAPID_QUESTIONS.length];
}
export function partyChallenge(kind:ChallengeKind,index:number):string{
 const items=kind==="truth"?TRUTH_PROMPTS:ACTION_PROMPTS;
 return items[((index%items.length)+items.length)%items.length];
}

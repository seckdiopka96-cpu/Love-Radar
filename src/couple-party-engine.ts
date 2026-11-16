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
 {question:"Combien de côtés a un cœur dans le jeu de cartes classique ?",options:["2","3","4","5"],answer:2},
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
 "Quel petit geste de ton amour te touche le plus ?",
 "Quel est ton plus beau souvenir de nous deux ?",
 "Quel compliment aimerais-tu entendre plus souvent ?",
 "Quand as-tu réalisé que notre relation comptait vraiment pour toi ?",
 "Quel endroit aimerais-tu découvrir ensemble ?",
 "Quelle chanson te rappelle notre histoire ?",
 "Quelle habitude mignonne de ton partenaire te fait sourire ?",
 "Quel rêve aimerais-tu réaliser à deux ?",
 "Quelle surprise toute simple te ferait plaisir ?",
 "Quel mot décrit le mieux notre couple aujourd'hui ?",
 "Qu'aimerais-tu que nous fassions plus souvent ?",
 "De quoi es-tu le plus fier ou la plus fière dans notre relation ?",
 "Quel moment drôle ne pourras-tu jamais oublier ?",
 "Qu'est-ce qui te rassure quand tu es loin de ton amour ?",
 "Quelle question n'as-tu jamais osé poser à ton partenaire ?",
 "Quel repas rêverais-tu de partager avec ton amour ?",
 "Quel surnom secret inventerais-tu pour ton partenaire ?",
 "Quelle qualité de ton partenaire admires-tu le plus ?",
 "Quelle tradition aimerais-tu créer pour vous deux ?",
 "Comment imagines-tu votre prochaine journée parfaite ?",
 "Qu'est-ce qui te fait rire instantanément ?",
 "Quelle première impression avais-tu de ton amour ?",
 "Quel message aimerais-tu recevoir au réveil ?",
 "Quelle chose as-tu apprise grâce à votre relation ?"
];
export const ACTION_PROMPTS:readonly string[]=[
 "Envoie un compliment sincère à ton partenaire.",
 "Fais une imitation drôle de ton personnage préféré pendant dix secondes.",
 "Invente un surnom tendre et raconte pourquoi tu l'as choisi.",
 "Décris ton amour avec trois mots sans utiliser « beau » ni « belle ».",
 "Raconte votre plus beau souvenir comme une bande-annonce de film.",
 "Fredonne une petite mélodie inventée spécialement pour vous deux.",
 "Dessine un cœur dans l'air avec ton doigt.",
 "Fais rire ton partenaire avec une blague improvisée.",
 "Choisis une chanson et explique pourquoi elle représente votre couple.",
 "Raconte un souvenir heureux en vingt secondes.",
 "Invente un titre de film pour raconter votre histoire.",
 "Adresse un petit discours de remerciement à ton partenaire.",
 "Propose une idée originale de rendez-vous gratuit à deux.",
 "Fais une déclaration d'amour en cinq mots maximum.",
 "Imite la météo de votre couple aujourd'hui.",
 "Invente une devise amusante pour votre duo.",
 "Raconte un conte de dix secondes où vous êtes les héros.",
 "Choisis un emoji et explique pourquoi il représente ton amour.",
 "Fais un petit dessin sur papier puis décris-le.",
 "Donne trois raisons de sourire aujourd'hui.",
 "Raconte comment vous vous retrouveriez dans une comédie romantique.",
 "Invente une poignée de main secrète que vous pourrez essayer plus tard.",
 "Écris une phrase tendre qui commence par « Avec toi… ».",
 "Fais une prédiction rigolote sur votre prochain moment à deux."
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
export function partyQuestion(index:number):RapidQuestion{
 return RAPID_QUESTIONS[((index%RAPID_QUESTIONS.length)+RAPID_QUESTIONS.length)%RAPID_QUESTIONS.length];
}
export function partyChallenge(kind:ChallengeKind,index:number):string{
 const items=kind==="truth"?TRUTH_PROMPTS:ACTION_PROMPTS;
 return items[((index%items.length)+items.length)%items.length];
}

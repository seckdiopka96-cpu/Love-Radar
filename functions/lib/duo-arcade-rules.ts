/** Server-side rules. Do not import the answer bank into the browser bundle. */
export type Stroke={points:[number,number][];color:string;width:number};
export const DRAW_COLORS=["#ffb6d0","#fff2e9","#9ce5ec","#ffd58e","#baadff"] as const;
export const DRAW_WORDS=[
 {word:"CHAT",category:"Animaux"},{word:"SOLEIL",category:"Nature"},{word:"MAISON",category:"Objets"},
 {word:"COEUR",category:"Amour"},{word:"FLEUR",category:"Nature"},{word:"GATEAU",category:"Cuisine"},
 {word:"AVION",category:"Voyage"},{word:"PARAPLUIE",category:"Objets"},{word:"PAPILLON",category:"Animaux"},
 {word:"TELEPHONE",category:"Objets"},{word:"BAISER",category:"Amour"},{word:"VELO",category:"Voyage"},
 {word:"ETOILE",category:"Nature"},{word:"POISSON",category:"Animaux"},{word:"LUNE",category:"Nature"},
 {word:"CADEAU",category:"Amour"},{word:"ARBRE",category:"Nature"},{word:"COURONNE",category:"Objets"},
 {word:"CHOCOLAT",category:"Cuisine"},{word:"BATEAU",category:"Voyage"}
] as const;
export const ESCAPE_SCENES=[
 {title:"Le manoir des secrets",emoji:"🏰",stages:[
  {title:"Le coffre verrouillé",intro:"Un ancien coffre bloque le passage. Reconstituez son code à quatre chiffres.",clues:["Le code commence par 47.","Les deux derniers chiffres sont 29."],answer:"4729",placeholder:"Code à 4 chiffres"},
  {title:"Le miroir enchanté",intro:"Un mot doit être prononcé pour révéler la porte cachée.",clues:["Le mot commence par LU.","Il se termine par NE."],answer:"LUNE",placeholder:"Mot secret"},
  {title:"La porte des roses",intro:"La dernière serrure attend le nom d'une fleur.",clues:["La fleur commence par RO.","Elle a quatre lettres et finit par SE."],answer:"ROSE",placeholder:"Mot de passe"}
 ]},
 {title:"La station orbitale",emoji:"🚀",stages:[
  {title:"Le sas",intro:"Le sas d'oxygène demande un code chiffré.",clues:["Les deux premiers chiffres sont 83.","Les deux derniers chiffres sont 16."],answer:"8316",placeholder:"Code à 4 chiffres"},
  {title:"L'ordinateur de bord",intro:"Le système central demande le mot d'accès.",clues:["Il commence par AS.","Les deux dernières lettres sont TRE."],answer:"ASTRE",placeholder:"Mot secret"},
  {title:"Retour sur Terre",intro:"Activez la capsule grâce au dernier mot de passe.",clues:["Le mot commence par TER.","Il finit par RE."],answer:"TERRE",placeholder:"Mot de passe"}
 ]},
 {title:"La chambre mystérieuse",emoji:"🔮",stages:[
  {title:"Le tiroir secret",intro:"Un cadenas à quatre chiffres garde la première clé.",clues:["Le code commence par 25.","Le code se termine par 74."],answer:"2574",placeholder:"Code à 4 chiffres"},
  {title:"La bibliothèque",intro:"Une inscription indique qu'un mot ouvrira le livre.",clues:["Le mot commence par LIV.","Il se termine par RE."],answer:"LIVRE",placeholder:"Mot secret"},
  {title:"Le jardin intérieur",intro:"Prononcez le mot qui libère la dernière porte.",clues:["Le mot commence par JAR.","Il se termine par DIN."],answer:"JARDIN",placeholder:"Mot de passe"}
 ]}
] as const;
export function normalizeGuess(value:unknown):string{
 if(typeof value!=="string")return "";
 return value.trim().replace(/[œŒ]/g,"oe").replace(/[æÆ]/g,"ae").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleUpperCase("fr").replace(/[^A-Z0-9]/g,"").slice(0,48);
}
export function validStroke(value:unknown):value is Stroke{
 if(!value||typeof value!=="object")return false;
 const s=value as Partial<Stroke>;
 return Array.isArray(s.points)&&s.points.length>=2&&s.points.length<=120&&
  DRAW_COLORS.some(color=>color===s.color)&&[2,4,7].includes(Number(s.width))&&
  s.points.every(p=>Array.isArray(p)&&p.length===2&&p.every(n=>Number.isInteger(n)&&n>=0&&n<=1000));
}
export function randomIndex(length:number):number{
 const b=new Uint32Array(1);crypto.getRandomValues(b);return b[0]%length;
}

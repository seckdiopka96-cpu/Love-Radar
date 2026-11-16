/** Local emoji catalog. Platform renders its own Unicode emoji, no permissions required. */
export type EmojiCategory={id:string;label:string;symbol:string;search:string;items:readonly string[]};
function split(value:string):string[]{return value.trim().split(/\s+/u).filter(Boolean)}
export const EMOJI_CATEGORIES:readonly EmojiCategory[]=[
 {id:"faces",label:"Visages",symbol:"😀",search:"rire rire sourire happy sourire coeur pleurer triste colère choqué mimi amour",items:split("😀 😃 😄 😁 😆 😅 😂 🤣 🥲 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😗 😙 😚 😋 😛 😝 😜 🤪 🤨 🧐 🤓 😎 🥸 🤩 🥳 🙂‍↕️ 😏 😒 🙄 😞 😔 😟 😕 🙁 ☹️ 😣 😖 😫 😩 🥺 😢 😭 😤 😠 😡 🤬 🤯 😳 🥵 🥶 😱 😨 😰 😥 😓 🤗 🤔 🫣 🤭 🫢 🤫 🤥 😶 🫥 😐 😑 😬 🫠 🙃 😮 😯 😲 😴 🥱 😪 🤤 😵 🤢 🤮 🤧 😷 🤒 🤕 🤑 🤠 👻 💀 🤖 👽 🤡 🥹")},
 {id:"love",label:"Amour",symbol:"💗",search:"coeur cœur amour love bisous romantique fleur couple mariage rose",items:split("❤️ 🩷 🧡 💛 💚 💙 🩵 💜 🤎 🖤 🩶 🤍 💖 💗 💓 💞 💕 💘 💝 💟 ❣️ ❤️‍🔥 ❤️‍🩹 💔 💋 💌 💍 💎 🌹 🌷 💐 🥀 🧸 🫶 🥰 😻 😽 💑 👩‍❤️‍👨 🧑‍❤️‍🧑 💏 💒 🥂 🫂 💕")},
 {id:"gestures",label:"Gestes",symbol:"👋",search:"main saluer bravo applaudissement bravo force pouce doigt bonjour ok merci",items:split("👋 🤚 🖐️ ✋ 🖖 🫱 🫲 🫳 🫴 🫰 🫶 🤲 🙌 👐 👏 🤝 👍 👎 👊 ✊ 🤛 🤜 🤞 ✌️ 🫰 🤟 🤘 🤙 👌 🤌 🤏 ☝️ 👆 👇 👈 👉 🖕 ✍️ 🙏 💪 🫵 🤳 💅")},
 {id:"animals",label:"Animaux",symbol:"🐻",search:"chat chien bébé mignon animal ours lapin panda canard",items:split("🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐻‍❄️ 🐼 🐨 🐯 🦁 🐮 🐷 🐽 🐸 🐵 🙈 🙉 🙊 🐒 🦍 🦧 🐔 🐧 🐦 🐤 🐣 🐥 🦆 🦉 🦇 🐺 🐗 🐴 🦄 🐝 🪲 🐞 🦋 🐌 🐢 🐍 🐙 🦀 🐠 🐬 🐳 🐘 🦒 🦓 🦔 🐈 🐕 🦮 🐩 🦕 🦖")},
 {id:"food",label:"Cuisine",symbol:"🍓",search:"manger nourriture repas anniversaire café chocolat gâteau riz",items:split("🍏 🍎 🍐 🍊 🍋 🍌 🍉 🍇 🍓 🫐 🍈 🍒 🍑 🥭 🍍 🥥 🥝 🍅 🥑 🥦 🥬 🥒 🌶️ 🌽 🥕 🫒 🧄 🥔 🍠 🥐 🥖 🍞 🥨 🥯 🥞 🧇 🧀 🍗 🍖 🍔 🍟 🍕 🌭 🥪 🌮 🌯 🥙 🧆 🍝 🍜 🍲 🍛 🍣 🍤 🍚 🍙 🍘 🍢 🍡 🍧 🍨 🍦 🧁 🍰 🎂 🍮 🍭 🍬 🍫 🍿 🍩 🍪 ☕ 🍵 🧋 🧃 🥤")},
 {id:"celebrate",label:"Fête",symbol:"🎉",search:"joyeux anniversaire cadeau musique fête bravo célébration musique danse",items:split("🎉 🎊 🎈 🎁 🎂 🥳 🪅 🎀 🎗️ 🥇 🏅 🏆 🎖️ 🎵 🎶 🎤 🎧 🎼 🎷 🥁 🎹 🎺 🎸 🎻 🪗 💃 🕺 🪩 🎭 🎨 🎬 🎮 🧩 🎲 🎯 🎱 ⚽ 🏀 🏈 ⚾ 🎾 🏐 🥅 🌟 ⭐ ✨ 💫 🌠 🔥 💥 💯 🎆 🎇 🧨")},
 {id:"nature",label:"Nature",symbol:"🌸",search:"soleil beau temps bonjour lune nuit fleurs pluie voyage vacances plage",items:split("🌸 🌺 🌷 🌹 🥀 💐 🌻 🌼 🪻 🌱 🌿 🍀 ☘️ 🍃 🍂 🍁 🌴 🌳 🌲 🌵 🌾 🍄 🪸 🌈 ☀️ 🌤️ ⛅ 🌥️ ☁️ 🌦️ 🌧️ ⛈️ 🌩️ ❄️ ☃️ ⛄ 💧 💦 ☔ 🌊 🌍 🌎 🌏 🌙 🌛 🌜 🌚 🌝 🌞 ⭐ 🌟 ✨ ⚡ 🪐")},
 {id:"travel",label:"Voyage",symbol:"🚀",search:"voiture avion voyage route bureau ville drapeau train paris dakar",items:split("🚗 🚕 🚙 🚌 🚎 🏎️ 🚓 🚑 🚒 🚚 🚛 🛵 🏍️ 🚲 🛴 🚂 🚆 🚇 🚄 🚅 🚊 ✈️ 🛫 🛬 🛩️ 🚀 🛸 🚁 ⛵ 🚢 🛥️ 🚤 🚦 🚥 🗺️ 🧭 🏝️ 🏖️ 🏜️ 🏕️ 🏞️ 🏠 🏡 🏢 🏩 🏰 🗽 🗼 🕋 🕌 🛕 🏟️ 🇸🇳 🇺🇸 🇫🇷 🇨🇦 🇪🇸 🇮🇹 🇵🇹")},
 {id:"objects",label:"Objets",symbol:"💡",search:"téléphone appareil ordinateur coeur conversation lettre idée photo cadeau",items:split("📱 📲 ☎️ 📞 📟 📠 💻 🖥️ ⌨️ 🖱️ 🖨️ 🎥 📷 📸 📹 🎞️ 📺 📻 🎙️ 🎚️ ⏰ ⌚ 🔋 🪫 🔌 💡 🔦 🕯️ 🧯 🛍️ 💰 💵 💳 💎 🔑 🗝️ 🔒 🔓 🔔 🔕 ✉️ 📩 📨 💌 📦 📝 📚 📖 🧠 🩺 💊 🪥 🪞 🛏️ 🧴 🧸 🎀")}
];
export const EMOJIS=[...new Set(EMOJI_CATEGORIES.flatMap(c=>c.items))];
export function filterEmojis(query:string,category:string,recents:readonly string[]=[]):string[]{
 const key=query.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase();
 const groups=category==="recent"?[{items:recents,search:"",label:"",id:"recent"}]:
  category==="all"?EMOJI_CATEGORIES:EMOJI_CATEGORIES.filter(c=>c.id===category);
 return [...new Set(groups.filter(c=>!key||
  (c.search+" "+c.label).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().includes(key)||
  c.items.some(emoji=>emoji===key)).flatMap(c=>c.items))].slice(0,360);
}

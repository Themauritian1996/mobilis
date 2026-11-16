const base=new URL('../www/js/', import.meta.url).href;
globalThis.localStorage={getItem(){return null},setItem(){}}; Object.defineProperty(globalThis,"navigator",{value:{language:"fr"}}); globalThis.document={documentElement:{}};
const fs0=await import('fs');
// Tous les modules de données + modules à contenu bilingue {fr,en}
const mods=[...fs0.readdirSync(new URL('../www/js/data/', import.meta.url)).filter((f)=>f.endsWith('.js')).map((f)=>'data/'+f),'i18n.js','coach.js','program.js','rom.js','questionnaires.js','protocols-ui.js','equipui.js','badges.js','report.js'];
const set=new Map();
function walk(o){ if(!o||typeof o!=='object') return; if(Array.isArray(o)){o.forEach(walk);return;}
  if(typeof o.en==='string' && typeof o.fr==='string'){ set.set(o.en,o.fr); }
  if(Array.isArray(o.en) && Array.isArray(o.fr)){ o.en.forEach((s,i)=>set.set(s,o.fr[i])); }
  for(const k in o) if(k!=='fr'&&k!=='en') walk(o[k]); }
for(const m of mods){ try{const M=await import(base+m); for(const k in M){ if(typeof M[k]==='object') walk(M[k]);}}catch(e){console.error(m,e.message)} }
const I=await import(base+'i18n.js');
const fs=await import('fs');
// On garde aussi les textes déjà présents (jamais de perte de traductions)
const out=new URL('../i18n-src/content.en.json', import.meta.url);
let prev=[]; try{prev=JSON.parse(fs.readFileSync(out,'utf8'))}catch(_){}
const all=[...prev, ...[...set.keys()].filter((k)=>!prev.includes(k))];
fs.writeFileSync(out, JSON.stringify(all));

console.log('content',all.length,'uikeys',Object.keys(I.UI_EN).length);

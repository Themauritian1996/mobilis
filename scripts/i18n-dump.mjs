const base=new URL('../www/js/', import.meta.url).href;
globalThis.localStorage={getItem(){return null},setItem(){}}; Object.defineProperty(globalThis,"navigator",{value:{language:"fr"}}); globalThis.document={documentElement:{}};
const mods=['data/exercises.js','data/pathologies.js','data/triage.js','data/anatomy.js','i18n.js','coach.js','program.js'];
const set=new Map();
function walk(o){ if(!o||typeof o!=='object') return; if(Array.isArray(o)){o.forEach(walk);return;}
  if(typeof o.en==='string' && typeof o.fr==='string'){ set.set(o.en,o.fr); }
  if(Array.isArray(o.en) && Array.isArray(o.fr)){ o.en.forEach((s,i)=>set.set(s,o.fr[i])); }
  for(const k in o) if(k!=='fr'&&k!=='en') walk(o[k]); }
for(const m of mods){ try{const M=await import(base+m); for(const k in M){ if(typeof M[k]==='object') walk(M[k]);}}catch(e){console.error(m,e.message)} }
const I=await import(base+'i18n.js');
const fs=await import('fs');
fs.writeFileSync(new URL('../i18n-src/content.en.json', import.meta.url), JSON.stringify([...set.keys()]));

console.log('content',set.size,'uikeys',Object.keys(I.UI_EN).length);

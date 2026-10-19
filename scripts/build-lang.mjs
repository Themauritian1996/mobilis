// Construit www/js/lang/<code>.js à partir de i18n-src/<code>.ui.json (interface) et <code>.text.tsv (contenu : index → traduction).
// Le contenu anglais de référence est i18n-src/content.en.json (régénéré par scripts/i18n-dump.mjs).
import fs from 'fs';
const src = new URL('../i18n-src/', import.meta.url);
const keys = JSON.parse(fs.readFileSync(new URL('content.en.json', src)));
const langs = process.argv.slice(2).length ? process.argv.slice(2) : ['es', 'pt', 'ar', 'zh'];
let bad = 0;
fs.mkdirSync(new URL('../www/js/lang/', import.meta.url), { recursive: true });
for (const l of langs) {
  const ui = JSON.parse(fs.readFileSync(new URL(`${l}.ui.json`, src)));
  const text = {};
  const lines = fs.readFileSync(new URL(`${l}.text.tsv`, src), 'utf8').split('\n').filter(Boolean);
  for (const line of lines) {
    const i = line.indexOf('\t'); const n = +line.slice(0, i); const v = line.slice(i + 1).trim();
    if (!(n in keys) || !v) { console.error(l, 'ligne invalide', line.slice(0, 60)); bad++; continue; }
    text[keys[n]] = v;
  }
  const miss = keys.filter((k) => !(k in text));
  if (miss.length) { console.error(l, 'manquant', miss.length, miss.slice(0, 5)); bad++; }
  fs.writeFileSync(new URL(`../www/js/lang/${l}.js`, import.meta.url), `// Généré par scripts/build-lang.mjs — ne pas modifier à la main.\nexport default ${JSON.stringify({ ui, text })};\n`);
  console.log(l, 'ui', Object.keys(ui).length, 'texte', Object.keys(text).length);
}
process.exit(bad ? 1 : 0);

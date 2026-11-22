// Vérifie que dist/ (webDir Capacitor) est une copie fonctionnelle de l'app v1.15 + le nouveau code compilé :
//  1. chaque fichier de www/ existe dans dist/ au MÊME chemin ;
//  2. chaque entrée du pré-cache du service worker (CORE de www/sw.js) existe ;
//  3. HTML, CSS, sw.js, vendor/ et modèles sont copiés à l'identique (octet pour octet) ;
//  4. aucun fichier haché (assets/) n'a été produit ; le point d'entrée v2 est présent.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WWW = path.join(ROOT, 'www');
const DIST = path.join(ROOT, 'dist');
const errors = [];

if (!fs.existsSync(DIST)) {
  console.error('dist/ absent : lancer `npm run build`');
  process.exit(1);
}
const walk = (dir, base = dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p, base) : [path.relative(base, p).split(path.sep).join('/')];
  });

const wwwFiles = walk(WWW);
for (const f of wwwFiles) {
  const d = path.join(DIST, f);
  if (!fs.existsSync(d)) errors.push(`manquant dans dist : ${f}`);
  else if (f === 'sw.js') {
    // Seule différence permise : modules js/v2 ajoutés au pré-cache (entre marqueurs) + empreinte du nom de cache.
    const restored = fs
      .readFileSync(d, 'utf8')
      .replace(/, \/\* v2:begin \*\/[^]*?\/\* v2:end \*\//, '')
      .replace(/(const CACHE = '[^']+?)-[0-9a-f]{8}(';)/, '$1$2');
    if (restored !== fs.readFileSync(path.join(WWW, f), 'utf8')) errors.push('sw.js modifié au-delà du pré-cache v2');
  } else if (!/^js\/.*\.js$/.test(f) && !fs.readFileSync(path.join(WWW, f)).equals(fs.readFileSync(d))) {
    errors.push(`copie modifiée : ${f}`);
  }
}

const sw = fs.readFileSync(path.join(DIST, 'sw.js'), 'utf8');
const core = sw.match(/const CORE = \[([\s\S]*?)\];/);
if (!core) errors.push('liste CORE introuvable dans sw.js');
else {
  const entries = [...core[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((e) => e !== './');
  for (const e of entries) if (!fs.existsSync(path.join(DIST, e))) errors.push(`pré-cache SW absent de dist : ${e}`);
  console.log(`pré-cache du service worker : ${entries.length} fichiers vérifiés`);
}

// Tout module js/v2 importé (statiquement) par le code legacy doit être pré-caché pour le hors-ligne.
const v2Imported = new Set();
for (const f of walk(path.join(DIST, 'js')).filter((x) => !x.startsWith('v2/'))) {
  const code = fs.readFileSync(path.join(DIST, 'js', f), 'utf8');
  for (const m of code.matchAll(/from "(\.{1,2}\/[^"]*v2\/[^"]+)"/g)) {
    v2Imported.add(path.posix.normalize(path.posix.join('js', path.posix.dirname(f), m[1])));
  }
}
for (const f of v2Imported) if (!sw.includes(`'${f}'`)) errors.push(`module v2 importé mais non pré-caché : ${f}`);

if (fs.existsSync(path.join(DIST, 'assets'))) errors.push('dist/assets/ ne devrait pas exister (fichiers hachés)');
if (!fs.existsSync(path.join(DIST, 'js/v2/main.js'))) errors.push('dist/js/v2/main.js absent (build du nouveau code)');

if (errors.length) {
  console.error(errors.map((e) => `  ✗ ${e}`).join('\n'));
  process.exit(1);
}
console.log(
  `dist/ conforme : ${wwwFiles.length} fichiers de www/ présents, copies statiques identiques, entrée v2 compilée.`,
);

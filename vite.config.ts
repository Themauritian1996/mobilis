/**
 * Vite — build web de Mobilis v2 (stratégie « strangler », voir docs/adr/0005-strangler.md).
 *
 * Principe :
 *  - www/ reste la source de l'application existante (v1.15) : HTML, CSS, polices, icônes, sw.js, vendor/, models/, js/lang/.
 *  - Le graphe ES modules de www/js/app.js est passé par Rolldown avec `preserveModules` : chaque fichier garde
 *    EXACTEMENT son chemin (js/app.js → dist/js/app.js, js/data/exercises.js → dist/js/data/exercises.js…), donc
 *    la liste de pré-cache du service worker (www/sw.js), les `new URL('../x', import.meta.url)` et les imports
 *    dynamiques continuent de fonctionner tels quels. Pas de minification, pas de hachage : comportement inchangé.
 *  - Le code legacy peut désormais importer progressivement du code TypeScript de src/ via l'alias `@src/…` ;
 *    ces modules sont émis sous dist/js/v2/… (chemins stables).
 *  - Tout le reste de www/ est copié à l'identique dans dist/ (qui est le webDir de Capacitor).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const WWW = path.join(ROOT, 'www');
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, 'dist');

const posix = (p: string): string => p.split(path.sep).join('/');

/**
 * Empêche Vite de réécrire les `new URL('…', import.meta.url)` du code legacy (sinon il émettrait des copies hachées
 * sous assets/ et le service worker ne trouverait plus vendor/jspdf…). On insère un commentaire entre la virgule et
 * `import.meta.url` : le motif reconnu par Vite ne correspond plus, et le code produit reste identique à l'exécution.
 */
function keepLegacyImportMetaUrl(): Plugin {
  return {
    name: 'mobilis:keep-legacy-import-meta-url',
    enforce: 'pre',
    transform(code, id) {
      if (!id.startsWith(WWW) || !code.includes('import.meta.url')) return null;
      return { code: code.replace(/,(\s*)import\.meta\.url/g, ',$1/* legacy */ import.meta.url'), map: null };
    },
  };
}

/**
 * Les librairies déjà compilées de www/vendor (Firebase, Capacitor, QR, MediaPipe) et les modules Node (`node:fs`,
 * branche de test de reportpdf.js) restent externes : elles sont copiées à l'identique, jamais ré-imprimées.
 */
function externalLegacyVendor(): Plugin {
  return {
    name: 'mobilis:external-legacy-vendor',
    enforce: 'pre',
    resolveId(source, importer) {
      if (source.startsWith('node:')) return { id: source, external: true };
      if (!importer || !importer.startsWith(WWW)) return null;
      const abs = path.resolve(path.dirname(importer), source);
      if (abs.startsWith(path.join(WWW, 'vendor') + path.sep)) return { id: source, external: true };
      return null;
    },
  };
}

/** Copie www/ dans dist/ sans écraser les modules produits par le build (mêmes chemins). */
function copyLegacyWww(): Plugin {
  const copyDir = (from: string, to: string): void => {
    fs.mkdirSync(to, { recursive: true });
    for (const e of fs.readdirSync(from, { withFileTypes: true })) {
      const a = path.join(from, e.name);
      const b = path.join(to, e.name);
      if (e.isDirectory()) copyDir(a, b);
      else if (!fs.existsSync(b)) fs.copyFileSync(a, b);
    }
  };
  return {
    name: 'mobilis:copy-legacy-www',
    apply: 'build',
    writeBundle() {
      copyDir(WWW, OUT);
    },
  };
}

/** Nom de sortie : chemin d'origine pour www/, js/v2/<chemin> pour src/. */
function outputName(chunk: { facadeModuleId: string | null; name: string }): string {
  const id = chunk.facadeModuleId ? chunk.facadeModuleId.split('?')[0]! : '';
  if (id.startsWith(SRC + path.sep)) {
    return `js/v2/${posix(path.relative(SRC, id)).replace(/\.(ts|js|mjs)$/, '')}.js`;
  }
  if (id.startsWith(WWW + path.sep)) {
    return posix(path.relative(WWW, id)).replace(/\.(js|mjs)$/, '') + '.js';
  }
  return `js/v2/_shared/${chunk.name.replace(/^.*[\\/]/, '')}.js`;
}

export default defineConfig({
  root: WWW,
  publicDir: false,
  resolve: {
    alias: { '@src': SRC },
  },
  server: {
    // `npm run dev` sert www/ tel quel et autorise les imports de ../src (TypeScript transpilé à la volée).
    fs: { allow: [ROOT] },
  },
  plugins: [externalLegacyVendor(), keepLegacyImportMetaUrl(), copyLegacyWww()],
  build: {
    outDir: OUT,
    emptyOutDir: true,
    target: 'esnext',
    minify: false,
    sourcemap: false,
    modulePreload: false,
    copyPublicDir: false,
    reportCompressedSize: false,
    chunkSizeWarningLimit: 4096,
    rolldownOptions: {
      input: {
        app: path.join(WWW, 'js/app.js'),
        // Point d'entrée du nouveau code : compilé et vérifié à chaque build, pas encore chargé par index.html.
        v2: path.join(SRC, 'main.ts'),
      },
      preserveEntrySignatures: 'strict',
      output: {
        format: 'es',
        preserveModules: true,
        entryFileNames: outputName,
        chunkFileNames: outputName,
      },
      onwarn(warning, warn) {
        // Imports dynamiques volontairement non analysables du legacy (MediaPipe via CONFIG.mediapipeBase, fs/vm sous Node).
        if (warning.code === 'UNRESOLVED_IMPORT' || /dynamic import cannot be analyzed/i.test(warning.message)) return;
        warn(warning);
      },
    },
  },
});

/**
 * Contrat de la migration « strangler » : chaque module de www/js garde EXACTEMENT ses noms exportés (v1.15), qu'il
 * contienne encore le code d'origine ou qu'il soit devenu une simple réexportation de src/ (`export * from '@src/…'`).
 * Instantané : tests/fixtures/legacy-exports.json (régénérer seulement si un export est volontairement retiré, avec
 * l'accord de l'orchestrateur : UPDATE_LEGACY_EXPORTS=1 npx vitest run tests/legacy-exports.spec.ts).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { expect, it } from 'vitest';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT = path.join(ROOT, 'tests/fixtures/legacy-exports.json');

function legacyExports(): Record<string, string[]> {
  const cfg = ts.getParsedCommandLineOfConfigFile(
    path.join(ROOT, 'tsconfig.json'),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (d) => {
        throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
      },
    },
  )!;
  const program = ts.createProgram({ rootNames: cfg.fileNames, options: { ...cfg.options, noEmit: true } });
  const checker = program.getTypeChecker();
  const out: Record<string, string[]> = {};
  for (const sf of program.getSourceFiles()) {
    const rel = path.relative(ROOT, sf.fileName).split(path.sep).join('/');
    if (!/^www\/js\/.*\.js$/.test(rel) || rel.startsWith('www/js/lang/')) continue;
    const sym = checker.getSymbolAtLocation(sf);
    out[rel] = sym
      ? checker
          .getExportsOfModule(sym)
          .map((s) => s.getName())
          .sort()
      : [];
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}

it('les modules www/js exposent les mêmes exports qu’en v1.15', () => {
  const now = legacyExports();
  if (process.env['UPDATE_LEGACY_EXPORTS'] === '1' || !fs.existsSync(SNAPSHOT)) {
    fs.writeFileSync(SNAPSHOT, JSON.stringify(now, null, 1) + '\n');
  }
  const ref = JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')) as Record<string, string[]>;
  for (const [file, names] of Object.entries(ref)) {
    expect(now[file], `${file} a disparu (garder un module de réexportation)`).toBeDefined();
    const missing = names.filter((n) => !now[file]!.includes(n));
    expect(missing, `${file} : exports manquants`).toEqual([]);
  }
}, 120_000);

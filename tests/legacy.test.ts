/**
 * Adaptateur Vitest des tests v1.15 : chaque script tests/*.test.mjs est exécuté tel quel dans un processus Node
 * séparé (ils appellent process.exit et partagent des globaux simulés) ; le test Vitest échoue si le code de sortie ≠ 0.
 * Les scripts seront convertis un par un en vrais tests Vitest pendant la migration (docs/MIGRATION.md).
 */
import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LEGACY_TESTS } from './legacy-suite.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const run = (file: string): Promise<{ code: number; out: string }> =>
  new Promise((resolve) => {
    execFile(
      process.execPath,
      ['--import', './scripts/register-src-alias.mjs', file],
      { cwd: ROOT, timeout: 120_000, maxBuffer: 32 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const code = err ? (typeof err.code === 'number' ? err.code : 1) : 0;
        resolve({ code, out: `${stdout}\n${stderr}` });
      },
    );
  });

describe('pont strangler', () => {
  it('un module legacy (JS) peut importer src/ via @src sous Node', async () => {
    const { code, out } = await run('tests/fixtures/strangler/run.mjs');
    expect(code, out).toBe(0);
  });
});

describe('tests v1.15 (scripts Node)', () => {
  it.concurrent.each(LEGACY_TESTS)('%s', async (file) => {
    const { code, out } = await run(file);
    if (code !== 0) console.error(out.slice(-4000));
    expect(code, `${file} a échoué`).toBe(0);
  });
});

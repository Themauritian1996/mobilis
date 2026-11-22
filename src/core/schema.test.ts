import { describe, expect, it } from 'vitest';
import { AppError } from './errors.ts';
import { assertCompleteChain, migrate, versionOf, type SchemaDefinition } from './schema.ts';

interface DocV2 {
  schemaVersion: 2;
  name: string;
  tags: string[];
}

const SCHEMA: SchemaDefinition<DocV2> = {
  name: 'demo',
  current: 2,
  migrations: [
    { from: 0, to: 1, description: 'nom', up: (d) => ({ ...d, name: String(d['label'] ?? '') }) },
    { from: 1, to: 2, description: 'tags', up: (d) => ({ ...d, tags: [] }) },
  ],
};

describe('migrations de schéma', () => {
  it('version 0 pour un document v1.15 sans schemaVersion', () => {
    expect(versionOf({})).toBe(0);
    expect(versionOf({ schemaVersion: 3 })).toBe(3);
  });

  it('applique chaque étape dans l’ordre sans muter l’entrée', () => {
    const raw = { label: 'x' };
    const out = migrate(SCHEMA, raw);
    expect(out).toMatchObject({ schemaVersion: 2, name: 'x', tags: [] });
    expect(raw).toEqual({ label: 'x' });
  });

  it('refuse un document plus récent et une chaîne incomplète', () => {
    expect(() => migrate(SCHEMA, { schemaVersion: 9 })).toThrow(AppError);
    const broken: SchemaDefinition<DocV2> = { ...SCHEMA, migrations: [SCHEMA.migrations[1]!] };
    expect(() => migrate(broken, {})).toThrow(/0 → 1/);
    expect(() => assertCompleteChain(broken)).toThrow(AppError);
    expect(() => assertCompleteChain(SCHEMA)).not.toThrow();
  });
});

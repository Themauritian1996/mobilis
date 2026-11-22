import { describe, expect, it } from 'vitest';
import { EX_ANATOMY, STRUCTURES } from './anatomy.ts';

interface Loose {
  readonly name: { readonly fr: string; readonly en: string };
  readonly seg?: unknown;
  readonly at?: string;
}

describe('données anatomiques', () => {
  it('chaque exercice référence des structures existantes', () => {
    for (const [ex, ids] of Object.entries(EX_ANATOMY)) {
      for (const id of ids) expect(STRUCTURES, `${ex} → ${id}`).toHaveProperty(id);
    }
  });
  it('chaque structure a un nom bilingue et un support (segment ou articulation)', () => {
    for (const [id, s] of Object.entries(STRUCTURES) as [string, Loose][]) {
      expect(s.name.fr, id).not.toBe('');
      expect(s.name.en, id).not.toBe('');
      expect(Boolean(s.seg) !== Boolean(s.at), id).toBe(true);
    }
  });
});

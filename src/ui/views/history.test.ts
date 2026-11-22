import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type * as HistoryView from './history.ts';
import { state } from '../app-state.ts';

// Les modules legacy lisent `window` / `localStorage` à l'import : navigateur minimal simulé avant le chargement.
let H: typeof HistoryView;
beforeAll(async () => {
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal('document', { documentElement: {}, addEventListener: () => undefined });
  H = await import('./history.ts');
});
afterEach(() => {
  delete state.range;
});

describe('history (vue)', () => {
  it('getRange : 3 mois par défaut, la plage choisie si elle est valide', () => {
    expect(H.getRange()).toBe('3m');
    state.range = '4w';
    expect(H.getRange()).toBe('4w');
    state.range = 'n-importe-quoi';
    expect(H.getRange()).toBe('3m');
  });

  it('rangeSeg : un bouton par plage, la plage courante est pressée', () => {
    const html = H.rangeSeg('3m');
    expect(html.match(/data-range="/g)).toHaveLength(3);
    expect(html).toContain('data-range="3m" aria-pressed="true" class="on"');
    expect(html).toContain('data-range="4w" aria-pressed="false" class=""');
  });
});

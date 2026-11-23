import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Audit v2 : à 390 px, les libellés .sr-only (position absolue) des cellules du tableau articulations × phases
// échappaient à la zone défilante .gc-scroll (sans ancêtre positionné) et élargissaient la page à ~740 px.
describe('gait.css', () => {
  const css = readFileSync(new URL('../../../../www/css/gait.css', import.meta.url), 'utf8');
  it('.gc-scroll est un bloc conteneur positionné (pas de débordement horizontal de la page)', () => {
    const rule = /\.gc-scroll\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule).toMatch(/position:\s*relative/);
    expect(rule).toMatch(/overflow-x:\s*auto/);
  });
});

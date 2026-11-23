import { beforeAll, describe, expect, it, vi } from 'vitest';
import type * as RomView from './rom.ts';

// Les modules legacy lisent `window` / `localStorage` à l'import : navigateur minimal simulé avant le chargement.
let V: typeof RomView;
beforeAll(async () => {
  vi.stubGlobal('window', globalThis);
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => undefined });
  vi.stubGlobal('document', { documentElement: {}, addEventListener: () => undefined });
  V = await import('./rom.ts');
});

const DAY = 86400000;
const log = [
  { test: 'sh_flex', side: 'L', deg: 100, ts: 1 * DAY },
  { test: 'sh_flex', side: 'L', deg: 130, ts: 3 * DAY },
  { test: 'sh_flex', side: 'R', deg: 150, ts: 2 * DAY, method: 'manual' },
];

describe('rom (vue)', () => {
  it('romChartSvg : une courbe par côté, vide pour un test inconnu ou sans mesure', () => {
    const svg = V.romChartSvg('sh_flex', log);
    expect(svg).toContain('<svg class="rom-chart"');
    expect(svg.match(/<polyline/g)).toHaveLength(2);
    expect(svg).toContain('rom-pt man');
    expect(V.romChartSvg('inconnu', log)).toBe('');
    expect(V.romChartSvg('sh_flex', [])).toBe('');
  });

  it('homeCardRom : carte seulement s’il y a une mesure due', () => {
    expect(
      V.homeCardRom({ romPlan: { tests: [{ test: 'sh_flex', side: 'L' }], every: 0 }, romLog: [] }, 5 * DAY),
    ).toContain('data-rom-go="#/rom/sh_flex/L"');
    expect(V.homeCardRom({}, 5 * DAY)).toBe('');
  });

  it('clinicPanelRom : message vide sans mesure, sinon une ligne par test et côté', () => {
    expect(V.clinicPanelRom({})).toContain('card muted small');
    const html = V.clinicPanelRom({
      rom: [
        {
          t: 'sh_flex',
          s: 'L',
          b: 100,
          l: 130,
          g: 30,
          n: 2,
          ts: 3,
          p: [
            [1, 100],
            [3, 130],
          ],
          m: 'camera',
        },
        { t: 'sh_flex', s: 'R', b: 140, l: 150, g: 10, n: 1, ts: 2, p: [], m: 'manual' },
      ],
    });
    expect(html.match(/<tr>/g)).toHaveLength(3);
    expect(html).toContain('rom-up');
    expect(html).toContain('rom-spark');
  });

  it('rxSectionRom : un bouton par test et côté, le plan existant est coché', () => {
    const sec = V.rxSectionRom({ rom: { tests: [{ test: 'sh_flex', side: 'L' }], every: 6 } });
    expect(sec.html).toContain('data-rom-sec');
    expect(sec.html).toMatch(/class="pill on" data-rom-t="sh_flex" data-rom-s="L"/);
    expect(sec.html).toMatch(/<option value="6" selected>/);
    expect(V.rxSectionRom(null).html).toMatch(/<option value="4" selected>/);
  });
});

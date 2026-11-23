import { describe, expect, it } from 'vitest';
import { barChart, lineChart } from './charts.ts';

describe('charts (SVG du Progrès)', () => {
  it('lineChart : axes, étiquettes et courbe ; les valeurs absentes sont ignorées', () => {
    const rows = [
      { week: 1, pain: 4 },
      { week: 2, pain: null },
      { week: 3, pain: 2 },
    ];
    const svg = lineChart(rows, [{ get: (r) => r.pain, color: 'red' }]);
    expect(svg.startsWith('<svg viewBox="0 0 320 150"')).toBe(true);
    expect(svg).toContain('>S1</text>');
    expect(svg).toContain('<polyline');
    expect(svg.match(/<circle/g)).toHaveLength(2);
    expect(svg.endsWith('</svg>')).toBe(true);
  });

  it('lineChart : un seul point = pas de ligne, étiquette personnalisée, hauteur', () => {
    const svg = lineChart([{ day: '2025-01-09', pain: 3 }], [{ get: (r) => r.pain, color: 'blue' }], {
      h: 100,
      label: (r) => r.day.slice(8),
    });
    expect(svg).not.toContain('<polyline');
    expect(svg).toContain('viewBox="0 0 320 100"');
    expect(svg).toContain('>09</text>');
  });

  it("barChart : barre prévue + barre réalisée (verte si l'objectif est atteint)", () => {
    const svg = barChart([
      { week: 1, sessions: 3, planned: 3 },
      { week: 2, sessions: 1, planned: 3 },
      { week: 3, sessions: 0, planned: 3 },
    ]);
    expect(svg.match(/var\(--surface-2\)/g)).toHaveLength(3);
    expect(svg).toContain('var(--pos)');
    expect(svg).toContain('var(--brand)');
    expect(svg).toContain('>S3</text>');
    expect(barChart([])).toContain('<line class="ax base"');
  });
});

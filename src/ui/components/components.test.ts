import { describe, expect, it } from 'vitest';
import { ds, lvlBar, ring } from './design.ts';
import { esc, sleep } from './html.ts';
import { IC, icon } from './icons.ts';

describe('composants purs', () => {
  it('esc échappe le HTML et tolère null / undefined', () => {
    expect(esc('<a href="x">&\'</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
    expect(esc(null)).toBe('');
    expect(esc(undefined)).toBe('');
    expect(esc(12)).toBe('12');
  });

  it('sleep se résout après le délai', async () => {
    const t0 = Date.now();
    await sleep(15);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(10);
  });

  it('icon ajoute la taille au SVG', () => {
    expect(icon('home', 22)).toContain('<svg width="22" height="22" ');
    expect(icon('back', 20)).toContain('class="i-back"');
    expect(Object.keys(IC).length).toBeGreaterThan(30);
  });

  it('ring borne le pourcentage et dessine le décalage de l’arc', () => {
    const full = ring(150);
    expect(full).toContain('<b>100<small>%</small></b>');
    expect(full).toContain('stroke-dashoffset="0.0"');
    expect(ring(-5)).toContain('<b>0<small>%</small></b>');
    expect(ring(50, 'moitié')).toContain('aria-label="moitié"');
  });

  it('lvlBar allume n pastilles sur 5', () => {
    const html = lvlBar(3);
    expect(html.match(/<i class="on">/g)).toHaveLength(3);
    expect(html.match(/<i class="">/g)).toHaveLength(2);
  });

  it('ds remplace les variables du texte de repli', () => {
    expect(ds('clé-inconnue-xyz')).toBe('clé-inconnue-xyz');
    expect(ds('dsDone', { a: 2, b: 5 })).toMatch(/2.*5/);
  });
});

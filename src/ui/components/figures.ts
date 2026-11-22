// Schémas animés des exercices : bloc figure, montage, lecture / ralenti / anatomie (reprise de www/js/ui.js).
// Ce module enregistre des écouteurs `click` globaux à l'import (comme ui.js en v1.15).
import { EXERCISES as EXERCISE_DATA } from '../../../www/js/data/exercises.js';
import { EX_ANATOMY as ANATOMY_DATA, STRUCTURES as STRUCTURE_DATA } from '../../../www/js/data/anatomy.js';
import { renderFigure } from '../../../www/js/figure.js';
import { t, tr } from '../../../www/js/i18n.js';
import * as store from '../../../www/js/store.js';
import { esc } from './html.ts';
import { icon } from './icons.ts';

/** Contrôleur renvoyé par renderFigure (figure.js). */
interface FigController {
  stop(): void;
  setPaused(on: boolean): void;
  setSpeed(k: number): void;
  setAnatomy(on: boolean): void;
}
/** Champs d'un exercice utilisés par les schémas (le catalogue en porte d'autres). */
interface FigExercise {
  name: unknown;
  steps: unknown;
  caption?: unknown;
  keys?: unknown[];
  fig: { frames: unknown[] };
}
const EXERCISES = EXERCISE_DATA as unknown as Record<string, FigExercise | undefined>;
const EX_ANATOMY = ANATOMY_DATA as unknown as Record<string, string[] | undefined>;
const STRUCTURES = STRUCTURE_DATA as unknown as Record<string, { kind: string } | undefined>;

// Contrôleur de chaque <svg data-fig> monté (propriété `_fig` en v1.15)
const ctlOf = new WeakMap<Element, FigController>();

let figs: FigController[] = [];
export function stopFigs(): void {
  figs.forEach((f) => f.stop());
  figs = [];
}
export const figSvg = (
  id: string,
  { stat = false, keys = false, anat = null }: { stat?: boolean; keys?: boolean; anat?: boolean | null } = {},
): string =>
  `<svg data-fig="${id}" data-static="${stat ? 1 : 0}" data-keys="${keys ? 1 : 0}" data-anat="${anat === null || anat === undefined ? '' : anat ? 1 : 0}" role="img" aria-label="${esc(tr(EXERCISES[id]!.name))}"></svg>`;
export function mountFigs(root: ParentNode = document): void {
  root.querySelectorAll<SVGSVGElement>('svg[data-fig]').forEach((svg) => {
    const ex = EXERCISES[svg.dataset['fig'] ?? ''];
    if (!ex || svg.dataset['mounted']) return;
    svg.dataset['mounted'] = '1';
    const showAnatomy = svg.dataset['anat'] === '' ? false : svg.dataset['anat'] === '1';
    const ctl: FigController = renderFigure(svg, ex.fig, {
      static: svg.dataset['static'] === '1',
      keys: svg.dataset['keys'] === '1' ? ex.keys : [],
      anatomy: EX_ANATOMY[svg.dataset['fig'] ?? ''] || [],
      showAnatomy,
    });
    ctlOf.set(svg, ctl);
    figs.push(ctl);
  });
}
// Bloc schéma + bouton « Anatomie » + légende
export function figureBlock(id: string, { keys = true }: { keys?: boolean } = {}): string {
  const has = (EX_ANATOMY[id] || []).length > 0;
  const on = has && store.settings().anatomy;
  const ex = EXERCISES[id]!;
  const kinds = [...new Set((EX_ANATOMY[id] || []).map((k) => STRUCTURES[k]?.kind))];
  const legend: Record<string, [string, string]> = {
    muscle: ['--an-muscle', t('anMuscle')],
    tendon: ['--an-tendon', t('anTendon')],
    fascia: ['--an-tendon', t('anFascia')],
    nerve: ['--an-nerve', t('anNerve')],
    joint: ['--an-joint', t('anJoint')],
  };
  return `<div class="fig-wrap" data-figblock="${id}">${ex.caption ? `<span class="chip fig-cap">${esc(tr(ex.caption))}</span>` : ''}
    <div class="fig-tools">${ex.fig.frames.length > 1 ? `<button class="chip" data-fig-play aria-pressed="false" aria-label="${t('demoPause')}" title="${t('demoPause')}">${icon('pause', 14)}</button><button class="chip" data-fig-slow aria-pressed="false" title="${t('demoSlow')}">0,5×</button>` : ''}<button class="chip" data-fig-say title="${t('demoListen')}" aria-label="${t('demoListen')}">${icon('volume', 14)}</button>${has ? `<button class="chip ${on ? 'ink' : ''}" data-anat-toggle aria-pressed="${on}">${icon('layers', 14)} ${t('anatomy')}</button>` : ''}</div>
    ${figSvg(id, { keys, anat: on })}</div>
    ${has ? `<div class="legend" data-anat-legend ${on ? '' : 'hidden'}>${kinds.map((k) => `<span><i style="background:var(${legend[k ?? '']![0]})"></i>${legend[k ?? '']![1]}</span>`).join('')}</div>` : ''}`;
}
// Écouteurs globaux (absents sous Node : le module reste importable par les tests)
const onClick = (fn: (e: MouseEvent) => void): void => {
  if (typeof document !== 'undefined') document.addEventListener('click', fn);
};
// Lecture de la démonstration : pause, ralenti, consignes lues à voix haute
onClick((e) => {
  const c = (e.target as Element).closest('[data-fig-play],[data-fig-slow],[data-fig-say]');
  if (!c) return;
  const wrap = c.closest<HTMLElement>('[data-figblock]');
  const svg = wrap?.querySelector('svg[data-fig]');
  const ctl = svg ? ctlOf.get(svg) : undefined;
  const id = wrap?.dataset['figblock'];
  if (c.hasAttribute('data-fig-play') && ctl) {
    const on = c.getAttribute('aria-pressed') !== 'true';
    ctl.setPaused(on);
    c.setAttribute('aria-pressed', String(on));
    c.classList.toggle('ink', on);
    c.innerHTML = icon(on ? 'play' : 'pause', 14);
    c.setAttribute('aria-label', t(on ? 'demoPlay' : 'demoPause'));
    (c as HTMLElement).title = c.getAttribute('aria-label') ?? '';
  }
  if (c.hasAttribute('data-fig-slow') && ctl) {
    const on = c.getAttribute('aria-pressed') !== 'true';
    ctl.setSpeed(on ? 0.5 : 1);
    c.setAttribute('aria-pressed', String(on));
    c.classList.toggle('ink', on);
  }
  if (c.hasAttribute('data-fig-say') && id && EXERCISES[id]) {
    const ex = EXERCISES[id];
    void import('../../../www/js/coach.js').then(({ speak }) =>
      speak(`${tr(ex.name)}. ${tr(ex.steps).join(' ')} ${(ex.keys || []).map((k) => tr(k)).join('. ')}.`, {
        interrupt: true,
      }),
    );
  }
});
onClick((e) => {
  const b = (e.target as Element).closest('[data-anat-toggle]');
  if (!b) return;
  const on = !store.settings().anatomy;
  store.saveSettings({ anatomy: on });
  document.querySelectorAll('[data-anat-toggle]').forEach((x) => {
    x.classList.toggle('ink', on);
    x.setAttribute('aria-pressed', String(on));
  });
  document.querySelectorAll<HTMLElement>('[data-anat-legend]').forEach((x) => (x.hidden = !on));
  document.querySelectorAll('[data-figblock] svg[data-fig]').forEach((s) => ctlOf.get(s)?.setAnatomy(on));
});

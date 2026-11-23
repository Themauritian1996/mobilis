/**
 * Volet « marche » — schéma de placement (vue de dessus) pour chaque vue : caméra, corridor, patient, sens de marche.
 * SVG en ligne, couleurs par classes CSS (`.gg-*` dans gait.css). Fonction pure.
 */
import type { GaitView } from '../../../domains/gait/index.ts';
import { esc } from '../../components/html.ts';

export interface GuideLabels {
  readonly camera: string;
  readonly distance: string;
  readonly corridor: string;
  readonly patient: string;
  readonly alt: string;
}

const CAM = (x: number, y: number, rot: number): string =>
  `<g transform="translate(${x} ${y}) rotate(${rot})" class="gg-cam"><rect x="-9" y="-6" width="18" height="12" rx="3"/><path d="M-5 -6 L-5 -10 L5 -10 L5 -6"/><circle cx="0" cy="0" r="3.2" class="gg-lens"/></g>`;

/** Schéma de placement : lateral = caméra de côté ; frontal/postérieur = caméra dans l'axe du corridor. */
export function guideSvg(view: GaitView, l: GuideLabels): string {
  const lateral = view === 'sagittal-left' || view === 'sagittal-right';
  const body: string[] = [];
  if (lateral) {
    body.push(
      `<rect class="gg-path" x="20" y="38" width="200" height="30" rx="6"/>`,
      `<text class="gg-t" x="120" y="57" text-anchor="middle">${esc(l.corridor)}</text>`,
      `<path class="gg-fov" d="M120 118 L55 38 L185 38 Z"/>`,
      CAM(120, 124, 0),
      `<text class="gg-t" x="132" y="130">${esc(l.camera)}</text>`,
      `<line class="gg-dim" x1="206" y1="53" x2="206" y2="118"/><path class="gg-dim" d="M202 57 L206 53 L210 57 M202 114 L206 118 L210 114"/>`,
      `<text class="gg-t" x="212" y="90">${esc(l.distance)}</text>`,
      `<circle class="gg-me" cx="${view === 'sagittal-left' ? 36 : 204}" cy="53" r="6"/>`,
      `<path class="gg-arrow" d="M${view === 'sagittal-left' ? '48 53 L96 53 M88 47 L96 53 L88 59' : '192 53 L144 53 M152 47 L144 53 L152 59'}"/>`,
    );
  } else {
    const towards = view === 'frontal';
    body.push(
      `<rect class="gg-path" x="95" y="8" width="50" height="104" rx="6"/>`,
      `<text class="gg-t" x="150" y="24">${esc(l.corridor)}</text>`,
      `<path class="gg-fov" d="M120 128 L72 8 L168 8 Z"/>`,
      CAM(120, 132, 0),
      `<text class="gg-t" x="134" y="146">${esc(l.camera)}</text>`,
      `<line class="gg-dim" x1="80" y1="30" x2="80" y2="124"/><path class="gg-dim" d="M76 34 L80 30 L84 34 M76 120 L80 124 L84 120"/>`,
      `<text class="gg-t" x="8" y="80">${esc(l.distance)}</text>`,
      `<circle class="gg-me" cx="120" cy="${towards ? 24 : 96}" r="6"/>`,
      `<path class="gg-arrow" d="${towards ? 'M120 36 L120 84 M114 76 L120 84 L126 76' : 'M120 84 L120 36 M114 44 L120 36 L126 44'}"/>`,
    );
  }
  return `<svg class="gg-svg" viewBox="0 0 240 150" role="img" aria-label="${esc(l.alt)}">${body.join('')}</svg>`;
}

/** Clés des conseils de placement (communes aux vues) : trépied, distance, corridor, plein corps, lumière, vêtements. */
export const GUIDE_ITEMS: readonly string[] = ['tripod', 'distance', 'corridor', 'fullBody', 'light', 'clothes'];

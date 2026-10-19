// Éléments d'interface partagés : icônes, schémas, feuilles, notifications, navigation.
import { EXERCISES } from './data/exercises.js';
import { EX_ANATOMY, STRUCTURES } from './data/anatomy.js';
import { renderFigure } from './figure.js';
import { t, tr } from './i18n.js';
import * as store from './store.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const I = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
export const IC = {
  home: I('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
  book: I('<path d="M4 4h6a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z"/><path d="M20 4h-4a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h5z"/>'),
  chart: I('<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>'),
  user: I('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  cal: I('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>',
  back: I('<path d="M15 18l-6-6 6-6"/>'),
  close: I('<path d="M18 6 6 18M6 6l12 12"/>'),
  check: I('<path d="M20 6 9 17l-5-5"/>'),
  search: I('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>'),
  flip: I('<path d="M3 7h13l-3-3M21 17H8l3 3"/>'),
  spark: I('<path d="M12 3l1.8 4.8L18.6 9.6l-4.8 1.8L12 16.2l-1.8-4.8L5.4 9.6l4.8-1.8z"/>'),
  side: I('<circle cx="12" cy="5" r="2.2"/><path d="M12 8v6l-2 7M12 14l3 7M12 10l4 2"/>'),
  front: I('<circle cx="12" cy="5" r="2.2"/><path d="M12 8v6M7 11l5-2 5 2M12 14l-3 7M12 14l3 7"/>'),
  shield: I('<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M12 8v5M12 16h.01"/>'),
  cam: I('<path d="M3 8h3l2-3h8l2 3h3v12H3z"/><circle cx="12" cy="13" r="4"/>'),
  timer: I('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>'),
  stetho: I('<path d="M6 3v6a4 4 0 0 0 8 0V3"/><path d="M10 13v3a5 5 0 0 0 10 0v-2"/><circle cx="20" cy="12" r="2"/>'),
  share: I('<path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v14"/>'),
  copy: I('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/>'),
  plus: I('<path d="M12 5v14M5 12h14"/>'),
  flame: I('<path d="M12 22c4 0 7-3 7-7 0-4-3-6-4-9-2 2-2 4-3 5-1-2-2-3-2-5-3 3-5 6-5 9 0 4 3 7 7 7z"/>'),
  bell: I('<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21a2 2 0 0 0 4 0"/>'),
  doc: I('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h6"/>'),
  layers: I('<path d="M12 3 2 8l10 5 10-5-10-5zM2 13l10 5 10-5M2 18l10 5 10-5"/>'),
  logo: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="currentColor"/><circle cx="17.5" cy="8.5" r="2.8" fill="var(--on-ink)"/><path d="M17.5 12.5l-3 7 4.8 2-1.8 5.5M14.5 19.5l-4.8 2M17.5 13.5l4.8 3" stroke="var(--on-ink)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>',
};
export const icon = (name, size = 18, extra = '') => IC[name].replace('<svg', `<svg width="${size}" height="${size}" ${extra}`);

export function toast(msg, ms = 2600) {
  document.querySelectorAll('.toast').forEach((x) => x.remove());
  const d = document.createElement('div'); d.className = 'toast'; d.setAttribute('role', 'status'); d.textContent = msg;
  document.body.appendChild(d); setTimeout(() => d.remove(), ms);
}

// ---------- Schémas ----------
let figs = [];
export function stopFigs() { figs.forEach((f) => f.stop()); figs = []; }
export const figSvg = (id, { stat = false, keys = false, anat = null } = {}) =>
  `<svg data-fig="${id}" data-static="${stat ? 1 : 0}" data-keys="${keys ? 1 : 0}" data-anat="${anat == null ? '' : anat ? 1 : 0}" role="img" aria-label="${esc(tr(EXERCISES[id].name))}"></svg>`;
export function mountFigs(root = document) {
  root.querySelectorAll('svg[data-fig]').forEach((svg) => {
    const ex = EXERCISES[svg.dataset.fig];
    if (!ex || svg.dataset.mounted) return;
    svg.dataset.mounted = '1';
    const showAnatomy = svg.dataset.anat === '' ? false : svg.dataset.anat === '1';
    const ctl = renderFigure(svg, ex.fig, { static: svg.dataset.static === '1', keys: svg.dataset.keys === '1' ? ex.keys : [], anatomy: EX_ANATOMY[svg.dataset.fig] || [], showAnatomy });
    svg._fig = ctl; figs.push(ctl);
  });
}
// Bloc schéma + bouton « Anatomie » + légende
export function figureBlock(id, { keys = true } = {}) {
  const has = (EX_ANATOMY[id] || []).length > 0;
  const on = has && store.settings().anatomy;
  const ex = EXERCISES[id];
  const kinds = [...new Set((EX_ANATOMY[id] || []).map((k) => STRUCTURES[k]?.kind))];
  const legend = { muscle: ['--an-muscle', t('anMuscle')], tendon: ['--an-tendon', t('anTendon')], fascia: ['--an-tendon', t('anFascia')], nerve: ['--an-nerve', t('anNerve')], joint: ['--an-joint', t('anJoint')] };
  return `<div class="fig-wrap" data-figblock="${id}">${ex.caption ? `<span class="chip fig-cap">${esc(tr(ex.caption))}</span>` : ''}
    ${has ? `<div class="fig-tools"><button class="chip ${on ? 'ink' : ''}" data-anat-toggle aria-pressed="${on}">${icon('layers', 14)} ${t('anatomy')}</button></div>` : ''}
    ${figSvg(id, { keys, anat: on })}</div>
    ${has ? `<div class="legend" data-anat-legend ${on ? '' : 'hidden'}>${kinds.map((k) => `<span><i style="background:var(${legend[k][0]})"></i>${legend[k][1]}</span>`).join('')}</div>` : ''}`;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-anat-toggle]');
  if (!b) return;
  const on = !store.settings().anatomy;
  store.saveSettings({ anatomy: on });
  document.querySelectorAll('[data-anat-toggle]').forEach((x) => { x.classList.toggle('ink', on); x.setAttribute('aria-pressed', on); });
  document.querySelectorAll('[data-anat-legend]').forEach((x) => (x.hidden = !on));
  document.querySelectorAll('[data-figblock] svg[data-fig]').forEach((s) => s._fig && s._fig.setAnatomy(on));
});

// ---------- Feuille modale ----------
export function sheet(html, { parent = document.body, onClose } = {}) {
  const bg = document.createElement('div'); bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  bg.addEventListener('click', (e) => { if (e.target === bg && onClose !== false) { bg.remove(); onClose && onClose(); } });
  parent.appendChild(bg);
  mountFigs(bg);
  return bg;
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast(t('copied')); return true; }
  catch (_) { toast(text, 6000); return false; }
}
export async function shareText(title, text, url) {
  if (navigator.share) { try { await navigator.share({ title, text, url }); return; } catch (_) { return; } }
  copyText(url ? `${text}\n${url}` : text);
}

// ---------- Navigation ----------
export function nav(active, role) {
  const b = (id, ic, label) => `<button data-go="#/${id}" class="${active === id ? 'on' : ''}" aria-current="${active === id ? 'page' : 'false'}">${icon(ic, 22)}<span>${label}</span></button>`;
  const brand = `<div class="brand">${icon('logo', 28, 'style="color:var(--ink)"')} Mobilis</div>`;
  if (role === 'clinician') {
    return `<nav class="nav" aria-label="Navigation"><div class="inner">${brand}${b('clinic', 'stetho', t('patients'))}${b('library', 'book', t('library'))}
      <button class="fab" data-go="#/clinic/new" aria-label="${t('newRx')}">${icon('plus', 22)}<span hidden>${t('newRx')}</span></button>${b('home', 'home', t('myProgram'))}${b('profile', 'user', t('profile'))}</div></nav>`;
  }
  return `<nav class="nav" aria-label="Navigation"><div class="inner">${brand}${b('home', 'home', t('home'))}${b('calendar', 'cal', t('calendar'))}
    <button class="fab" data-act="quickstart" aria-label="${t('startSession')}">${IC.play}<span hidden>${t('startSession')}</span></button>${b('progress', 'chart', t('progress'))}${b('profile', 'user', t('profile'))}</div></nav>`;
}

export function applyTheme() {
  const th = store.settings().theme;
  if (th === 'light' || th === 'dark') document.documentElement.setAttribute('data-theme', th);
  else document.documentElement.removeAttribute('data-theme');
  const dark = th === 'dark' || (th !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0a0a0b' : '#f3f3f2');
}

export const lvlBar = (n) => `<span class="lvl" aria-label="${t('level')} ${n}/5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

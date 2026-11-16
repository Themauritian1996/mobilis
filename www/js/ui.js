// Éléments d'interface partagés : icônes, schémas, feuilles, notifications, navigation.
import { EXERCISES } from './data/exercises.js';
import { EX_ANATOMY, STRUCTURES } from './data/anatomy.js';
import { renderFigure } from './figure.js';
import { t, tr, LANGS, getLang, locale } from './i18n.js';
import { weekStartFor, weekOrder as wOrder } from './longterm.js';
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
  back: I('<path d="M15 18l-6-6 6-6"/>').replace('<svg', '<svg class="i-back"'),
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
  eye: I('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff: I('<path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.1 3.9M6.6 6.6C3.9 8.3 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  demo: I('<circle cx="12" cy="4.5" r="2"/><path d="M12 7v6l-3 7M12 13l3 7M7 10l5-1 5 1"/>'),
  mic: I('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  pause: I('<path d="M8 5v14M16 5v14"/>'),
  hand: I('<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5M14 10.5V5.5a1.5 1.5 0 0 1 3 0V13c0 4.4-2.6 8-7 8-2.5 0-4.2-1.3-5.4-3.3L2.8 14.6a1.5 1.5 0 0 1 2.5-1.6L8 16"/>'),
  volume: I('<path d="M4 9v6h4l5 4V5L8 9zM16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/>'),
  layers: I('<path d="M12 3 2 8l10 5 10-5-10-5zM2 13l10 5 10-5M2 18l10 5 10-5"/>'),
  // Logo « goniomètre » : un membre articulé qui balaie un arc d'amplitude
  logo: '<svg viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#2747d4"/><path d="M19.6 21.5a8.6 8.6 0 0 0-3.9-7.2" stroke="#8cf0b8" stroke-width="2.2" stroke-linecap="round" fill="none"/><path d="M25 21.5H11l8.2-12.6" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" fill="none"/><circle cx="11" cy="21.5" r="2.9" fill="#fff"/><circle cx="19.2" cy="8.9" r="2.5" fill="#8cf0b8"/></svg>',
  chev: I('<path d="m9 6 6 6-6 6"/>'),
  target: I('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>'),
  trend: I('<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>'),
  medal: I('<circle cx="12" cy="9" r="6"/><path d="M8.5 14 7 22l5-3 5 3-1.5-8"/>'),
  ruler: I('<path d="M3 17 17 3l4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>'),
  clip: I('<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4h6v3H9zM9 12h6M9 16h4"/>'),
};
export const icon = (name, size = 18, extra = '') => IC[name].replace('<svg', `<svg width="${size}" height="${size}" ${extra}`);

export function toast(msg, ms = 2600) {
  document.querySelectorAll('.toast').forEach((x) => x.remove());
  const d = document.createElement('div'); d.className = 'toast' + (document.querySelector('.sheet-bg') ? ' top' : ''); d.setAttribute('role', 'status'); d.textContent = msg;
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
    <div class="fig-tools">${ex.fig.frames.length > 1 ? `<button class="chip" data-fig-play aria-pressed="false" aria-label="${t('demoPause')}" title="${t('demoPause')}">${icon('pause', 14)}</button><button class="chip" data-fig-slow aria-pressed="false" title="${t('demoSlow')}">0,5×</button>` : ''}<button class="chip" data-fig-say title="${t('demoListen')}" aria-label="${t('demoListen')}">${icon('volume', 14)}</button>${has ? `<button class="chip ${on ? 'ink' : ''}" data-anat-toggle aria-pressed="${on}">${icon('layers', 14)} ${t('anatomy')}</button>` : ''}</div>
    ${figSvg(id, { keys, anat: on })}</div>
    ${has ? `<div class="legend" data-anat-legend ${on ? '' : 'hidden'}>${kinds.map((k) => `<span><i style="background:var(${legend[k][0]})"></i>${legend[k][1]}</span>`).join('')}</div>` : ''}`;
}
// Lecture de la démonstration : pause, ralenti, consignes lues à voix haute
document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-fig-play],[data-fig-slow],[data-fig-say]');
  if (!c) return;
  const wrap = c.closest('[data-figblock]'); const ctl = wrap?.querySelector('svg[data-fig]')?._fig; const id = wrap?.dataset.figblock;
  if (c.hasAttribute('data-fig-play') && ctl) {
    const on = c.getAttribute('aria-pressed') !== 'true'; ctl.setPaused(on);
    c.setAttribute('aria-pressed', String(on)); c.classList.toggle('ink', on); c.innerHTML = icon(on ? 'play' : 'pause', 14);
    c.setAttribute('aria-label', t(on ? 'demoPlay' : 'demoPause')); c.title = c.getAttribute('aria-label');
  }
  if (c.hasAttribute('data-fig-slow') && ctl) {
    const on = c.getAttribute('aria-pressed') !== 'true'; ctl.setSpeed(on ? 0.5 : 1);
    c.setAttribute('aria-pressed', String(on)); c.classList.toggle('ink', on);
  }
  if (c.hasAttribute('data-fig-say') && id && EXERCISES[id]) {
    const ex = EXERCISES[id];
    import('./coach.js').then(({ speak }) => speak(`${tr(ex.name)}. ${tr(ex.steps).join(' ')} ${(ex.keys || []).map((k) => tr(k)).join('. ')}.`, { interrupt: true }));
  }
});
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
// Accessibilité : nom du dialogue (aria-labelledby sur le premier titre), focus placé dans la feuille et rendu à la fermeture,
// Tab piégé dans la feuille, Échap ferme (sauf onClose === false, feuille à décision obligatoire).
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
let sheetSeq = 0;
export function sheet(html, { parent = document.body, onClose, label } = {}) {
  const bg = document.createElement('div'); bg.className = 'sheet-bg';
  bg.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><div class="grab"></div>${html}</div>`;
  const box = bg.firstElementChild;
  const h = box.querySelector('h3,h2,h1');
  if (label) box.setAttribute('aria-label', label);
  else if (h) { h.id = h.id || `sheet-t${++sheetSeq}`; box.setAttribute('aria-labelledby', h.id); }
  const opener = document.activeElement;
  const dismiss = () => { if (onClose === false) return; bg.remove(); onClose && onClose(); };
  const onKey = (e) => {
    if (!bg.isConnected) { document.removeEventListener('keydown', onKey, true); return; }
    // seule la feuille la plus récente réagit
    const all = document.querySelectorAll('.sheet-bg'); if (all[all.length - 1] !== bg) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); dismiss(); return; }
    if (e.key !== 'Tab') return;
    const f = [...box.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null || x === document.activeElement);
    if (!f.length) { e.preventDefault(); box.focus(); return; }
    const first = f[0], last = f[f.length - 1];
    if (!box.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  box.tabIndex = -1;
  const rm = bg.remove.bind(bg);
  bg.remove = () => { document.removeEventListener('keydown', onKey, true); rm(); try { if (opener && opener.isConnected && opener.focus) opener.focus({ preventScroll: true }); } catch (_) {} };
  document.addEventListener('keydown', onKey, true);
  bg.addEventListener('click', (e) => { if (e.target === bg) dismiss(); });
  parent.appendChild(bg);
  mountFigs(bg);
  // focus sur le premier champ / bouton de la feuille (pas sur « fermer » si un autre contrôle existe)
  try { (box.querySelector('input:not([type=hidden]),select,textarea') || box.querySelector('button') || box).focus({ preventScroll: true }); } catch (_) {}
  return bg;
}
// Confirmation modale : true si l'utilisateur confirme. Échap / clic à côté = annuler.
export function confirmSheet({ title, text = '', ok, cancel, danger = false }) {
  return new Promise((resolve) => {
    let done = false; const fin = (v) => { if (!done) { done = true; resolve(v); } };
    const bg = sheet(`<h3>${esc(title)}</h3>${text ? `<p class="muted small" style="margin:6px 0 14px;white-space:pre-line">${esc(text)}</p>` : ''}
      <div class="row" style="margin-top:14px"><button class="btn ghost" data-cf="no">${esc(cancel || t('cancel'))}</button><button class="btn ${danger ? 'danger' : ''}" data-cf="yes">${esc(ok || t('ok'))}</button></div>`, { onClose: () => fin(false) });
    bg.querySelector('[data-cf="no"]').onclick = () => { bg.remove(); fin(false); };
    bg.querySelector('[data-cf="yes"]').onclick = () => { bg.remove(); fin(true); };
    if (danger) bg.querySelector('[data-cf="no"]').focus();
  });
}

// ---------- Fichiers : enregistrer / partager ----------
const blobB64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
/** APK : Filesystem (cache) + feuille de partage Android (un blob: ne se télécharge pas dans la WebView). Web : téléchargement.
 *  → 'native' | 'download' | 'cancelled' ; lève une erreur si l'écriture native échoue. */
export async function saveFile(data, fileName, mime = 'application/octet-stream', { title = 'Mobilis' } = {}) {
  const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
  if (store.isNative()) {
    const { Filesystem, Directory, Share } = await store.cap();
    const saved = await Filesystem.writeFile({ path: fileName, data: await blobB64(blob), directory: Directory.Cache });
    try { await Share.share({ title, files: [saved.uri], dialogTitle: title }); return 'native'; }
    catch (e) { return /cancel/i.test(String(e?.message || e)) ? 'cancelled' : 'native'; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = fileName; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return 'download';
}

// ---------- Semaine ----------
/** 0 = la semaine commence le dimanche, 1 = lundi (réglage « auto » : selon la langue). */
export const weekStartDay = () => weekStartFor(store.settings().weekStart, locale());
export const weekOrder = () => wOrder(weekStartDay());

// ---------- Interrupteurs accessibles ----------
// Chaque .switch reçoit role="switch" et un nom (aria-labelledby → le libellé voisin de la ligne .toggle), quel que soit le module qui l'a dessiné.
let swSeq = 0;
export function labelSwitches(root = document) {
  root.querySelectorAll('.switch').forEach((b) => {
    if (!b.hasAttribute('role')) b.setAttribute('role', 'switch');
    if (!b.hasAttribute('aria-checked')) b.setAttribute('aria-checked', String(b.classList.contains('on')));
    if (b.hasAttribute('aria-label') || b.hasAttribute('aria-labelledby')) return;
    const row = b.closest('.toggle,.row,.field,label') || b.parentElement;
    const lab = row && [...row.children].find((c) => c !== b && c.textContent.trim() && !c.querySelector('.switch'));
    if (!lab) return;
    const tgt = lab.querySelector('b') || lab;
    tgt.id = tgt.id || `sw-l${++swSeq}`; b.setAttribute('aria-labelledby', tgt.id);
  });
}
let swObs = null;
export function watchSwitches(host) {
  if (swObs || typeof MutationObserver === 'undefined' || !host) return;
  let q = 0;
  swObs = new MutationObserver(() => { if (q) return; q = requestAnimationFrame(() => { q = 0; labelSwitches(host); }); });
  swObs.observe(host, { childList: true, subtree: true });
  labelSwitches(host);
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
  const brand = `<div class="brand">${icon('logo', 30)} Mobilis</div>`;
  if (role === 'clinician') {
    return `<nav class="nav" aria-label="Navigation"><div class="inner">${brand}${b('clinic', 'stetho', t('patients'))}${b('library', 'book', t('library'))}
      <button class="fab" data-go="#/clinic/new" aria-label="${t('newRx')}">${icon('plus', 22)}<span hidden>${t('newRx')}</span></button>${b('home', 'play', t('testNav'))}${b('profile', 'user', t('profile'))}</div></nav>`;
  }
  return `<nav class="nav" aria-label="Navigation"><div class="inner">${brand}${b('home', 'home', t('home'))}${b('calendar', 'cal', t('calendar'))}
    <button class="fab" data-act="quickstart" aria-label="${t('startSession')}">${IC.play}<span hidden>${t('startSession')}</span></button>${b('progress', 'chart', t('progress'))}${b('profile', 'user', t('profile'))}</div></nav>`;
}

export function applyTheme() {
  const th = store.settings().theme;
  if (th === 'light' || th === 'dark') document.documentElement.setAttribute('data-theme', th);
  else document.documentElement.removeAttribute('data-theme');
  const dark = th === 'dark' || (th !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0b111b' : '#f3f5f8');
  // Taille du texte (100 / 115 / 130 %) et contraste élevé
  const st = store.settings(), de = document.documentElement;
  if ([115, 130].includes(+st.textSize)) de.setAttribute('data-text-size', String(st.textSize)); else de.removeAttribute('data-text-size');
  if (st.contrast) de.setAttribute('data-contrast', 'high'); else de.removeAttribute('data-contrast');
}

// Textes du design 1.14 : repli local tant que les clés ne sont pas fusionnées dans i18n.js (voir i18n-new/design.json)
const DS = {
  vpCam: { fr: 'La caméra compte tes répétitions et corrige ta posture', en: 'The camera counts your reps and corrects your form', es: 'La cámara cuenta tus repeticiones y corrige tu postura', pt: 'A câmara conta as tuas repetições e corrige a tua postura', ar: 'الكاميرا تعدّ تكراراتك وتصحّح وضعيتك', zh: '摄像头为你计数并纠正动作' },
  vpPlan: { fr: 'Un programme qui s’ajuste à ta douleur, semaine après semaine', en: 'A program that adapts to your pain, week after week', es: 'Un programa que se ajusta a tu dolor, semana tras semana', pt: 'Um programa que se ajusta à tua dor, semana após semana', ar: 'برنامج يتكيّف مع ألمك أسبوعًا بعد أسبوع', zh: '计划会根据你的疼痛逐周调整' },
  vpClin: { fr: 'Ton clinicien peut suivre tes progrès, si tu le veux', en: 'Your clinician can follow your progress, if you choose', es: 'Tu clínico puede seguir tu progreso, si tú quieres', pt: 'O teu clínico pode acompanhar o teu progresso, se quiseres', ar: 'يمكن لمعالجك متابعة تقدّمك إن أردت', zh: '如果你愿意，治疗师可以跟进你的进展' },
  dsRx: { fr: 'Programmes', en: 'Programs', es: 'Programas', pt: 'Programas', ar: 'البرامج', zh: '计划' },
  dsFollow: { fr: 'Patients suivis', en: 'Patients followed', es: 'Pacientes en seguimiento', pt: 'Pacientes seguidos', ar: 'مرضى متابَعون', zh: '跟进中的患者' },
  dsWatch: { fr: 'À surveiller', en: 'Need attention', es: 'A vigilar', pt: 'A vigiar', ar: 'بحاجة إلى متابعة', zh: '需要关注' },
  dsDone: { fr: '{a} sur {b} exercices faits', en: '{a} of {b} exercises done', es: '{a} de {b} ejercicios hechos', pt: '{a} de {b} exercícios feitos', ar: '{a} من {b} تمارين منجزة', zh: '已完成 {a}/{b} 个练习' },
};
export const ds = (k, vars) => { let s = t(k); if (s === k) s = tr(DS[k]) || k; if (vars) for (const v in vars) s = s.replaceAll(`{${v}}`, vars[v]); return s; };
// Anneau de progression (motif « goniomètre ») : pct 0–100
export const ring = (pct, label = '') => { const C = 2 * Math.PI * 40, p = Math.max(0, Math.min(100, pct)); return `<div class="ring" role="img" aria-label="${esc(label || p + ' %')}"><svg viewBox="0 0 96 96" aria-hidden="true"><circle class="ring-track" cx="48" cy="48" r="40"/><circle class="ring-val" cx="48" cy="48" r="40" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - p / 100)).toFixed(1)}"/></svg><b>${p}<small>%</small></b></div>`; };

export const lvlBar = (n) => `<span class="lvl" aria-label="${t('level')} ${n}/5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Sélecteur de langue (changement géré globalement dans app.js)
export const langPicker = (cls = '') => `<select class="input lang-select ${cls}" data-lang-select aria-label="${t('language')}">${LANGS.map((l) => `<option value="${l.id}" ${getLang() === l.id ? 'selected' : ''}>${l.name}</option>`).join('')}</select>`;

// Bibliothèque d'exercices et détail d'un exercice (reprise de www/js/app.js).
import { equipHelpHtml, bindEquipHelp } from '../../../www/js/equipui.js';
import { t, tr } from '../../../www/js/i18n.js';
import { EQUIP as EQUIP_DATA } from '../../../www/js/data/exercises.js';
import { REGIONS, PATHOLOGIES } from '../../../www/js/data/pathologies.js';
import * as P from '../../../www/js/program.js';
import { state, go, profile, type Profile } from '../app-state.ts';
import { esc } from '../components/html.ts';
import { icon, IC } from '../components/icons.ts';
import { mountFigs, figureBlock } from '../components/figures.ts';
import { nav } from '../components/nav.ts';
import { doseText } from '../../domains/rehab/training.ts';
import { $app, EXERCISES, exItem, prof as profOf } from './shared.ts';

const EQUIP = EQUIP_DATA as unknown as Record<string, unknown>;
const REGION_LIST = REGIONS as unknown as { id: string; name: unknown }[];
const PATHOLOGY_LIST = PATHOLOGIES as unknown as { region: string; phases: Record<string, string[]> }[];

/** Minuteur du champ de recherche (anti-rebond), porté par l'élément comme dans la v1.15. */
interface SearchInput extends HTMLInputElement {
  _t?: ReturnType<typeof setTimeout>;
}

// ---------- Bibliothèque ----------
export function viewLibrary(): void {
  const L = state.lib;
  const prof = profOf();
  const regionIds = (r: string) =>
    new Set(PATHOLOGY_LIST.filter((p) => p.region === r).flatMap((p) => Object.values(p.phases).flat()));
  const set = L.region === 'all' ? null : regionIds(L.region);
  const items = Object.entries(EXERCISES).filter(
    ([id, e]) =>
      (!set || set.has(id) || e?.region === L.region) &&
      (!L.q || tr(e?.name).toLowerCase().includes(L.q.toLowerCase())),
  );
  $app.innerHTML = `<section class="screen">
    <div class="topbar"><h1>${t('library')}</h1><span class="chip">${items.length}</span></div>
    <div class="search">${icon('search', 18)}<input class="input" id="q" placeholder="${t('searchPh')}" value="${esc(L.q)}" aria-label="${t('searchPh')}"></div>
    <div class="pills"><button class="pill ${L.region === 'all' ? 'on' : ''}" data-r="all">${t('allRegions')}</button>${REGION_LIST.map((r) => `<button class="pill ${L.region === r.id ? 'on' : ''}" data-r="${r.id}">${esc(tr(r.name))}</button>`).join('')}</div>
    <div class="list" id="list">${items.map(([id]) => exItem({ id, dose: P.doseFor(id, P.levelOf(prof, id)) })).join('')}</div>
  </section>${nav('library', prof.role)}`;
  mountFigs($app);
  $app.querySelectorAll<HTMLElement>('[data-r]').forEach(
    (b) =>
      (b.onclick = () => {
        L.region = b.dataset['r'] ?? 'all';
        viewLibrary();
      }),
  );
  const q = $app.querySelector<SearchInput>('#q') as SearchInput;
  q.oninput = () => {
    L.q = q.value;
    clearTimeout(q._t);
    q._t = setTimeout(() => {
      viewLibrary();
      const n = $app.querySelector<HTMLInputElement>('#q') as HTMLInputElement;
      n.focus();
      n.setSelectionRange(n.value.length, n.value.length);
    }, 250);
  };
}

// ---------- Détail d'un exercice ----------
export function viewExercise(id: string): void {
  const found = EXERCISES[id];
  if (!found) return go('#/library');
  const ex = found;
  const prof = profOf();
  const level = P.levelOf(prof, id);
  const today: { id: string; dose?: Parameters<typeof doseText>[0] }[] = prof.pathology ? P.todaysProgram(prof) : [];
  const d: Parameters<typeof doseText>[0] & { tempo?: string } =
    today.find((x) => x.id === id)?.dose || P.doseFor(id, level);
  const planes = ex.track ? Object.keys(ex.track.planes) : [];
  const plane = (k: string) =>
    `<div class="plane ${planes.includes(k) ? '' : 'off'}">${icon(k === 'side' ? 'side' : 'front', 30)}<div><b>${t(k === 'side' ? 'planeSide' : 'planeFront')}</b><small>${t(k === 'side' ? 'planeSideD' : 'planeFrontD')}</small></div></div>`;
  const canTrain = true;
  $app.innerHTML = `<section class="screen">
    <div class="topbar"><button class="icon-btn" data-back aria-label="${t('back')}">${icon('back', 20)}</button><h1>${esc(tr(ex.name))}</h1></div>
    ${figureBlock(id)}
    <div class="row wrap" style="margin:12px 0 4px;gap:6px"><span class="chip ink">${t('level')} ${level}/5</span><span class="chip">${doseText(d)}</span>${d.tempo ? `<span class="chip">${t('tempo')} ${d.tempo}</span>` : ''}
      ${ex.equip.map((e) => `<span class="chip">${esc(tr(EQUIP[e]))}</span>`).join('')}</div>
    ${ex.equip.length ? equipHelpHtml(id, level, profile() as Profile) : ''}
    <h2>${t('keyPoints')}</h2><div class="list"><ul class="keylist">${ex.keys.map((k, i) => `<li><span class="n">${i + 1}</span><span>${esc(tr(k))}</span></li>`).join('')}</ul></div>
    <h2>${t('howTo')}</h2><div class="list"><ol class="steplist">${(tr(ex.steps) as string[]).map((s) => `<li><span>${esc(s)}</span></li>`).join('')}</ol></div>
    <h2>${t('planes')}</h2>${ex.track?.kind === 'hand' ? `<div class="card small row">${icon('hand', 26)}<div><b>${t('planeHand')} · ${t('planeHandD')}</b><br><span class="muted">${esc(tr(ex.track.cam))}</span></div></div>` : ex.track ? `<div class="planes">${plane('side')}${plane('front')}</div>` : `<div class="card small row">${icon('timer', 22)}<div><b>${t('guided')}</b><br><span class="muted">${t('guidedD')}</span></div></div>`}
    <div style="height:96px"></div>
    ${canTrain ? `<div class="sticky-cta"><div><button class="btn" data-go="#/train/${id}">${ex.track ? icon('cam', 20) + ' ' + t('try') : IC['play']?.replace('<svg', '<svg width="16" height="16"') + ' ' + t('start')}</button></div></div>` : ''}
  </section>`;
  mountFigs($app);
  bindEquipHelp($app, id, level);
  const back = $app.querySelector<HTMLElement>('[data-back]') as HTMLElement;
  back.onclick = () => (history.length > 1 ? history.back() : go('#/home'));
}

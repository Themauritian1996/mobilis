// Protocoles post-opératoires : sélection par le clinicien, carte d'accueil, écran « Protocole », résumé.
// Sans dépendance au DOM global au chargement (testable en Node) : les helpers d'interface sont locaux.
import { t, tp, tr } from './i18n.js';
import { PROTOCOLS, protocolById, protocolPhases, variantOf, exerciseEntry, DISCLAIMER } from './data/protocols.js';
import { EXERCISES } from './data/exercises.js';
import * as P from './program.js';
import { profile, updateProfile, go } from './state.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICON_SHIELD = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M12 8v5M12 16h.01"/></svg>';
const ICON_BACK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>';
const el = ($app) => (typeof $app === 'function' ? $app() : $app);
const todayStr = (now = Date.now()) => P.todayKey(now);
const weeksLabel = (w) => (w[1] == null ? t('pr_weeksFrom', { a: w[0] }) : t('pr_weeksRange', { a: w[0], b: w[1] }));
const variantName = (proto, vid) => { const v = proto?.variants?.find((x) => x.id === vid); return v ? tr(v.name) : ''; };

// Phases déjà terminées (selon le temps) à la date donnée : leurs critères sont considérés validés par le clinicien qui prescrit
export function confirmedBefore(protocolId, variant, surgeryDate, now = Date.now()) {
  const proto = protocolById(protocolId); if (!proto) return {};
  const days = P.protocolDaysSince(surgeryDate, now);
  const out = {};
  protocolPhases(proto, variant).forEach((ph) => { if (ph.weeks[1] != null && days / 7 >= ph.weeks[1]) out[ph.id] = now; });
  return out;
}

// ───────── Éditeur du clinicien ─────────
export function rxSectionProtocol(rx) {
  const cur = rx?.protocol || null;
  const html = `<div class="proto-rx" id="pr-root"><h2 style="margin-top:0">${esc(t('pr_choose'))}</h2>
    <label class="field"><select class="input" id="pr-id" aria-label="${esc(t('pr_choose'))}"><option value="">${esc(t('pr_none'))}</option>
      ${PROTOCOLS.map((p) => `<option value="${p.id}" ${cur?.id === p.id ? 'selected' : ''}>${esc(tr(p.name))}</option>`).join('')}</select></label>
    <div id="pr-var-wrap" ${cur ? '' : 'hidden'}></div>
    <div id="pr-detail" ${cur ? '' : 'hidden'}>
      <label class="field"><span>${esc(t('pr_date'))}</span><input class="input" type="date" id="pr-date" value="${esc(cur?.surgeryDate || '')}" max="${esc(todayStr(Date.now() + 365 * 86400000))}"></label>
      <label class="toggle"><span>${esc(t('pr_pastOk'))}<br><small class="muted">${esc(t('pr_pastOkD'))}</small></span><input type="checkbox" id="pr-past" ${cur?.pastOk === false ? '' : 'checked'}></label>
      <p class="small muted" style="margin:6px 0 0">${esc(tr(DISCLAIMER))}</p>
    </div></div>`;
  const drawVariant = (root) => {
    const id = root.querySelector('#pr-id').value, proto = protocolById(id), w = root.querySelector('#pr-var-wrap');
    root.querySelector('#pr-detail').hidden = !proto; w.hidden = !proto?.variants?.length;
    w.innerHTML = proto?.variants?.length ? `<label class="field"><span>${esc(t('pr_variant'))}</span><select class="input" id="pr-variant">${proto.variants.map((v) => `<option value="${v.id}" ${variantOf(proto, cur?.id === id ? cur.variant : null) === v.id ? 'selected' : ''}>${esc(tr(v.name))}</option>`).join('')}</select></label>` : '';
  };
  return {
    html,
    bind(root) { const r = root.querySelector('#pr-root') || root; drawVariant(r); r.querySelector('#pr-id').onchange = () => drawVariant(r); },
    read(root) {
      const r = root.querySelector('#pr-root') || root;
      const id = r.querySelector('#pr-id')?.value; const proto = protocolById(id);
      if (!proto) return { protocol: null };
      const date = r.querySelector('#pr-date')?.value || '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { protocol: null, error: 'surgeryDate' };
      const variant = proto.variants?.length ? variantOf(proto, r.querySelector('#pr-variant')?.value) : null;
      const pastOk = r.querySelector('#pr-past')?.checked !== false;
      return { protocol: { id, ...(variant ? { variant } : {}), surgeryDate: date, pastOk, confirmed: pastOk ? confirmedBefore(id, variant, date) : {} } };
    },
  };
}
// Réglages du programme du clinicien recopiés dans le profil patient ; garde les confirmations déjà faites par le patient pour le même protocole
export function rxExtrasProtocol(rx, prev = null) {
  const p = rx?.protocol;
  if (!p || !protocolById(p.id)) return { protocol: null };
  const old = prev?.protocol && prev.protocol.id === p.id && prev.protocol.surgeryDate === p.surgeryDate && (prev.protocol.variant || null) === (p.variant || null) ? prev.protocol.confirmed : null;
  return { protocol: { ...p, confirmed: { ...(p.confirmed || {}), ...(old || {}) } } };
}

// ───────── Résumé pour le clinicien ─────────
export function summaryPart(profile, now = Date.now()) {
  const st = P.protocolStatus(profile, now);
  if (!st) return {};
  return { protocol: { id: st.id, variant: st.variant, week: st.week, phase: st.phaseIndex + 1, phases: st.phaseCount, phaseId: st.phase.id, blocked: st.blocked, criteriaConfirmed: st.criteriaConfirmed, nextPhaseInWeeks: st.nextPhaseInWeeks, preop: st.preop } };
}

// ───────── Carte d'accueil ─────────
export function homeCardProtocol(prof, now = Date.now()) {
  const st = P.protocolStatus(prof, now);
  if (!st) return '';
  const proto = st.protocol;
  const v = variantName(proto, st.variant);
  const prec = st.precautions.slice(0, 2);
  const mile = st.preop ? tp('pr_preop', st.daysToSurgery) : st.last ? t('pr_lastPhase') : st.blocked ? t('pr_nextBlocked') : t('pr_nextIn', { n: st.nextPhaseInWeeks });
  return `<div class="card proto-card"><span class="eyebrow">${esc(t('pr_homeTitle'))}</span>
    <h3 style="margin:6px 0 2px">${esc(tr(proto.name))}${v ? ` · <span class="muted">${esc(v)}</span>` : ''}</h3>
    <div class="row"><b>${esc(t('pr_week', { n: st.week }))}</b><span class="chip ${st.blocked ? 'neg' : 'ink'}">${esc(t('pr_phase', { n: st.phaseIndex + 1, m: st.phaseCount }))}</span></div>
    ${prec.length ? `<ul class="list-plain small" style="margin:8px 0 0">${prec.map((x) => `<li>${esc(tr(x))}</li>`).join('')}</ul>` : ''}
    <p class="small ${st.blocked ? 'neg' : 'muted'}" style="margin:8px 0 10px">${esc(mile)}</p>
    <button class="btn soft sm" data-go="#/protocole">${esc(t('pr_open'))}</button></div>`;
}

// ───────── Écran « Protocole » (#/protocole) ─────────
export function protocolViewHtml(prof, now = Date.now()) {
  const st = P.protocolStatus(prof, now);
  const top = `<div class="topbar"><button class="icon-btn" data-go="#/" aria-label="${esc(t('back'))}">${ICON_BACK}</button><h1>${esc(t('pr_title'))}</h1></div>`;
  if (!st) return `<section class="screen">${top}<div class="card muted">${esc(t('pr_noProtocol'))}</div></section>`;
  const proto = st.protocol, v = variantName(proto, st.variant);
  const meter = st.phases.map((_, i) => `<i class="${i < st.phaseIndex ? 'done' : i === st.phaseIndex ? (st.blocked ? 'blocked' : 'cur') : ''}"></i>`).join('');
  const list = (arr) => `<ul>${arr.map((x) => `<li>${esc(tr(x))}</li>`).join('')}</ul>`;
  const roms = (ph) => (ph.romTargets || []).length ? `<h3>${esc(t('pr_rom'))}</h3><ul>${ph.romTargets.map((r) => `<li>${esc(t('pr_rom_' + r.test))} ${r.dir === 'max' ? '≤' : '≥'} ${r.deg}°</li>`).join('')}</ul>` : '';
  const exs = (ph) => `<h3>${esc(t('pr_exercises'))}</h3><ul>${ph.exercises.map((e) => exerciseEntry(e)).filter((e) => EXERCISES[e.id]).map((e) => `<li>${esc(tr(EXERCISES[e.id].name))}</li>`).join('')}</ul>`;
  const phase = (ph, i) => {
    const cls = i < st.phaseIndex ? 'done' : i === st.phaseIndex ? 'cur' : '';
    const stateLbl = i < st.phaseIndex ? t('pr_done') : i === st.phaseIndex ? t('pr_current') : t('pr_upcoming');
    return `<li><details class="proto-phase ${cls}" ${i === st.phaseIndex ? 'open' : ''} data-phase="${ph.id}"><summary><span class="chip ${i === st.phaseIndex ? 'ink' : ''}">${esc(stateLbl)}</span><span>${esc(t('pr_phase', { n: i + 1, m: st.phaseCount }))} · ${esc(weeksLabel(ph.weeks))}</span></summary>
      ${ph.goals.length ? `<h3>${esc(t('pr_goals'))}</h3>${list(ph.goals)}` : ''}
      ${ph.precautions.length ? `<h3>${esc(t('pr_precautions'))}</h3><div class="proto-warn">${list(ph.precautions)}</div>` : ''}
      ${exs(ph)}
      ${ph.progressionCriteria.length ? `<h3>${esc(t('pr_criteria'))}</h3>${list(ph.progressionCriteria)}` : ''}
      ${roms(ph)}
      ${i === st.phaseIndex && !st.last ? `<div style="margin-top:10px">${st.criteriaConfirmed ? `<p class="small pos">${esc(t('pr_confirmed'))} <button class="link" data-pr="unconfirm" data-id="${ph.id}">${esc(t('pr_undo'))}</button></p>` : `<button class="btn sm ghost" data-pr="confirm" data-id="${ph.id}">${esc(t('pr_confirm'))}</button><p class="small muted" style="margin:6px 0 0">${esc(t('pr_confirmD'))}</p>`}</div>` : ''}
    </details></li>`;
  };
  return `<section class="screen">${top}
    <div class="card proto-hero"><span class="eyebrow">${esc(t('pr_week', { n: st.week }))} · ${esc(t('pr_phase', { n: st.phaseIndex + 1, m: st.phaseCount }))}</span>
      <h2>${esc(tr(proto.name))}</h2><div class="small muted">${esc(tr(proto.surgery))}${v ? ' · ' + esc(v) : ''}</div>
      <div class="proto-meter" role="img" aria-label="${esc(t('pr_phase', { n: st.phaseIndex + 1, m: st.phaseCount }))}">${meter}</div>
      <div class="small ${st.blocked ? 'neg' : 'muted'}">${esc(st.preop ? tp('pr_preop', st.daysToSurgery) : st.last ? t('pr_lastPhase') : st.blocked ? t('pr_blocked') : t('pr_nextIn', { n: st.nextPhaseInWeeks }))}</div></div>
    <ol class="proto-tl">${st.phases.map(phase).join('')}</ol>
    <div class="proto-flags"><b>${esc(t('pr_redflags'))}</b><p class="small" style="margin:4px 0 0">${esc(t('pr_flagsIntro'))}</p>${list(proto.redFlags)}</div>
    <p class="small muted">${esc(tr(DISCLAIMER))}</p></section>`;
}
export function viewProtocol($app) {
  const root = el($app); const prof = profile();
  root.innerHTML = protocolViewHtml(prof);
  root.querySelectorAll('[data-pr]').forEach((b) => (b.onclick = async () => {
    const pr = profile().protocol; if (!pr) return;
    const conf = { ...(pr.confirmed || {}) };
    if (b.dataset.pr === 'confirm') conf[b.dataset.id] = Date.now(); else delete conf[b.dataset.id];
    await updateProfile({ protocol: { ...pr, confirmed: conf } });
    go('#/protocole');
  }));
}

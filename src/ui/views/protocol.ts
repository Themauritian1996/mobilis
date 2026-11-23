// Protocoles post-opératoires : sélection par le clinicien, carte d'accueil, écran « Protocole », résumé
// (reprise de www/js/protocols-ui.js). Sans dépendance au DOM global au chargement (testable en Node) : les helpers
// d'interface sont locaux.
import { t, tp } from '../../../www/js/i18n.js';
import { tr } from '../components/l10n.ts';
import {
  PROTOCOLS,
  protocolById,
  protocolPhases,
  variantOf,
  exerciseEntry,
  DISCLAIMER,
} from '../../../www/js/data/protocols.js';
import { EXERCISES as EXERCISE_DATA } from '../../../www/js/data/exercises.js';
import * as P from '../../../www/js/program.js';
import { profile, updateProfile, go, type Profile } from '../app-state.ts';
import { esc } from '../components/html.ts';

const EXERCISES = EXERCISE_DATA as unknown as Record<string, { name: unknown } | undefined>;

/** Protocole du profil : { id, variant?, surgeryDate, pastOk?, confirmed }. */
export interface ProfileProtocol {
  id: string;
  variant?: string | null;
  surgeryDate: string;
  pastOk?: boolean;
  confirmed?: Record<string, number>;
}
interface ProtocolProfile extends Profile {
  protocol?: ProfileProtocol | null;
}
/** Programme du clinicien (rx) : seul le champ protocole est lu ici. */
interface RxLike {
  protocol?: ProfileProtocol | null;
}
/** Protocole du catalogue (data/protocols). */
type Protocol = NonNullable<ReturnType<typeof protocolById>>;
type ProtoLike = Protocol;
type ProtoFull = Protocol;
interface Phase {
  id: string;
  weeks: [number, number | null];
  goals: unknown[];
  precautions: unknown[];
  exercises: unknown[];
  progressionCriteria: unknown[];
  romTargets?: { test: string; dir: string; deg: number }[];
}

const ICON_BACK =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>';
const el = ($app: HTMLElement | (() => HTMLElement)): HTMLElement => (typeof $app === 'function' ? $app() : $app);
const todayStr = (now = Date.now()): string => P.todayKey(now);
const weeksLabel = (w: [number, number | null]): string =>
  w[1] === null || w[1] === undefined ? t('pr_weeksFrom', { a: w[0] }) : t('pr_weeksRange', { a: w[0], b: w[1] });
const variantName = (proto: ProtoLike | null | undefined, vid: string | null | undefined): string => {
  const v = proto?.variants?.find((x) => x.id === vid);
  return v ? tr(v.name) : '';
};

// Phases déjà terminées (selon le temps) à la date donnée : leurs critères sont considérés validés par le clinicien qui prescrit
export function confirmedBefore(
  protocolId: string,
  variant: string | null | undefined,
  surgeryDate: string,
  now = Date.now(),
): Record<string, number> {
  const proto = protocolById(protocolId);
  if (!proto) return {};
  const days: number = P.protocolDaysSince(surgeryDate, now);
  const out: Record<string, number> = {};
  (protocolPhases(proto, variant) as Phase[]).forEach((ph) => {
    if (ph.weeks[1] !== null && ph.weeks[1] !== undefined && days / 7 >= ph.weeks[1]) out[ph.id] = now;
  });
  return out;
}

// ───────── Éditeur du clinicien ─────────
export interface RxSection<R> {
  html: string;
  bind(root: ParentNode): void;
  read(root: ParentNode): R;
}
export interface ProtocolRead {
  protocol: ProfileProtocol | null;
  error?: string;
}

export function rxSectionProtocol(rx?: RxLike | null): RxSection<ProtocolRead> {
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
  const drawVariant = (root: ParentNode): void => {
    const id = root.querySelector<HTMLSelectElement>('#pr-id')!.value;
    const proto: ProtoLike | null | undefined = protocolById(id);
    const w = root.querySelector<HTMLElement>('#pr-var-wrap')!;
    root.querySelector<HTMLElement>('#pr-detail')!.hidden = !proto;
    w.hidden = !proto?.variants?.length;
    w.innerHTML = proto?.variants?.length
      ? `<label class="field"><span>${esc(t('pr_variant'))}</span><select class="input" id="pr-variant">${proto.variants.map((v) => `<option value="${v.id}" ${variantOf(proto, cur?.id === id ? cur.variant : null) === v.id ? 'selected' : ''}>${esc(tr(v.name))}</option>`).join('')}</select></label>`
      : '';
  };
  return {
    html,
    bind(root) {
      const r = root.querySelector<HTMLElement>('#pr-root') || root;
      drawVariant(r);
      r.querySelector<HTMLSelectElement>('#pr-id')!.onchange = () => drawVariant(r);
    },
    read(root) {
      const r = root.querySelector<HTMLElement>('#pr-root') || root;
      const id = r.querySelector<HTMLSelectElement>('#pr-id')?.value;
      const proto: ProtoLike | null | undefined = protocolById(id as string);
      if (!proto || id === undefined) return { protocol: null };
      const date = r.querySelector<HTMLInputElement>('#pr-date')?.value || '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { protocol: null, error: 'surgeryDate' };
      const variant: string | null = proto.variants?.length
        ? variantOf(proto, r.querySelector<HTMLSelectElement>('#pr-variant')?.value)
        : null;
      const pastOk = r.querySelector<HTMLInputElement>('#pr-past')?.checked !== false;
      return {
        protocol: {
          id,
          ...(variant ? { variant } : {}),
          surgeryDate: date,
          pastOk,
          confirmed: pastOk ? confirmedBefore(id, variant, date) : {},
        },
      };
    },
  };
}
// Réglages du programme du clinicien recopiés dans le profil patient ; garde les confirmations déjà faites par le patient pour le même protocole
export function rxExtrasProtocol(
  rx?: RxLike | null,
  prev: { protocol?: ProfileProtocol | null } | null = null,
): { protocol: ProfileProtocol | null } {
  const p = rx?.protocol;
  if (!p || !protocolById(p.id)) return { protocol: null };
  const old =
    prev?.protocol &&
    prev.protocol.id === p.id &&
    prev.protocol.surgeryDate === p.surgeryDate &&
    (prev.protocol.variant || null) === (p.variant || null)
      ? prev.protocol.confirmed
      : null;
  return { protocol: { ...p, confirmed: { ...(p.confirmed || {}), ...(old || {}) } } };
}

// ───────── Résumé pour le clinicien ─────────
export function summaryPart(profile: unknown, now = Date.now()): { protocol?: Record<string, unknown> } {
  const st = P.protocolStatus(profile as Profile, now);
  if (!st) return {};
  return {
    protocol: {
      id: st.id,
      variant: st.variant,
      week: st.week,
      phase: st.phaseIndex + 1,
      phases: st.phaseCount,
      phaseId: st.phase.id,
      blocked: st.blocked,
      criteriaConfirmed: st.criteriaConfirmed,
      nextPhaseInWeeks: st.nextPhaseInWeeks,
      preop: st.preop,
    },
  };
}

// ───────── Carte d'accueil ─────────
export function homeCardProtocol(prof: unknown, now = Date.now()): string {
  const st = P.protocolStatus(prof as Profile, now);
  if (!st) return '';
  const proto = st.protocol as ProtoFull;
  const v = variantName(proto, st.variant);
  const prec: unknown[] = st.precautions.slice(0, 2);
  const mile = st.preop
    ? tp('pr_preop', st.daysToSurgery)
    : st.last
      ? t('pr_lastPhase')
      : st.blocked
        ? t('pr_nextBlocked')
        : t('pr_nextIn', { n: st.nextPhaseInWeeks });
  return `<div class="card proto-card"><span class="eyebrow">${esc(t('pr_homeTitle'))}</span>
    <h3 style="margin:6px 0 2px">${esc(tr(proto.name))}${v ? ` · <span class="muted">${esc(v)}</span>` : ''}</h3>
    <div class="row"><b>${esc(t('pr_week', { n: st.week }))}</b><span class="chip ${st.blocked ? 'neg' : 'ink'}">${esc(t('pr_phase', { n: st.phaseIndex + 1, m: st.phaseCount }))}</span></div>
    ${prec.length ? `<ul class="list-plain small" style="margin:8px 0 0">${prec.map((x) => `<li>${esc(tr(x))}</li>`).join('')}</ul>` : ''}
    <p class="small ${st.blocked ? 'neg' : 'muted'}" style="margin:8px 0 10px">${esc(mile)}</p>
    <button class="btn soft sm" data-go="#/protocole">${esc(t('pr_open'))}</button></div>`;
}

// ───────── Écran « Protocole » (#/protocole) ─────────
export function protocolViewHtml(prof: unknown, now = Date.now()): string {
  const st = P.protocolStatus(prof as Profile, now);
  const top = `<div class="topbar"><button class="icon-btn" data-go="#/" aria-label="${esc(t('back'))}">${ICON_BACK}</button><h1>${esc(t('pr_title'))}</h1></div>`;
  if (!st) return `<section class="screen">${top}<div class="card muted">${esc(t('pr_noProtocol'))}</div></section>`;
  const proto = st.protocol as ProtoFull;
  const v = variantName(proto, st.variant);
  const meter = st.phases
    .map(
      (_: unknown, i: number) =>
        `<i class="${i < st.phaseIndex ? 'done' : i === st.phaseIndex ? (st.blocked ? 'blocked' : 'cur') : ''}"></i>`,
    )
    .join('');
  const list = (arr: readonly unknown[]): string => `<ul>${arr.map((x) => `<li>${esc(tr(x))}</li>`).join('')}</ul>`;
  const roms = (ph: Phase): string =>
    (ph.romTargets || []).length
      ? `<h3>${esc(t('pr_rom'))}</h3><ul>${(ph.romTargets ?? []).map((r) => `<li>${esc(t('pr_rom_' + r.test))} ${r.dir === 'max' ? '≤' : '≥'} ${r.deg}°</li>`).join('')}</ul>`
      : '';
  const exs = (ph: Phase): string =>
    `<h3>${esc(t('pr_exercises'))}</h3><ul>${ph.exercises
      .map((e) => exerciseEntry(e as Parameters<typeof exerciseEntry>[0]) as { id: string })
      .filter((e) => EXERCISES[e.id])
      .map((e) => `<li>${esc(tr(EXERCISES[e.id]!.name))}</li>`)
      .join('')}</ul>`;
  const phase = (ph: Phase, i: number): string => {
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
    <ol class="proto-tl">${(st.phases as Phase[]).map(phase).join('')}</ol>
    <div class="proto-flags"><b>${esc(t('pr_redflags'))}</b><p class="small" style="margin:4px 0 0">${esc(t('pr_flagsIntro'))}</p>${list(proto.redFlags)}</div>
    <p class="small muted">${esc(tr(DISCLAIMER))}</p></section>`;
}
export function viewProtocol($app: HTMLElement | (() => HTMLElement)): void {
  const root = el($app);
  const prof = profile();
  root.innerHTML = protocolViewHtml(prof);
  root.querySelectorAll<HTMLElement>('[data-pr]').forEach(
    (b) =>
      (b.onclick = async () => {
        const pr = (profile() as ProtocolProfile).protocol;
        if (!pr) return;
        const phaseId = b.dataset['id'] ?? '';
        const conf: Record<string, number> = { ...(pr.confirmed || {}) };
        if (b.dataset['pr'] === 'confirm') conf[phaseId] = Date.now();
        else Reflect.deleteProperty(conf, phaseId);
        await updateProfile({ protocol: { ...pr, confirmed: conf } });
        go('#/protocole');
      }),
  );
}

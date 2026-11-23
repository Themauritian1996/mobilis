// Rapport texte du patient (copier / partager / PDF) et écran « Ajuster mon programme » (reprise de www/js/app.js).
import { t, locale } from '../../../www/js/i18n.js';
import { tr } from '../components/l10n.ts';
import * as store from '../../../www/js/store.js';
import * as P from '../../../www/js/program.js';
import { state, go, sessions, syncProgress, navRole } from '../app-state.ts';
import { esc } from '../components/html.ts';
import { isNil } from '../util.ts';
import { icon } from '../components/icons.ts';
import { toast } from '../components/toast.ts';
import { nav } from '../components/nav.ts';
import { copyText, shareText } from '../components/files.ts';
import { doseText } from '../../domains/rehab/training.ts';
import { adjustDose, levelCap, type AdjustDose, type AdjustKey } from '../../domains/rehab/adjust.ts';
import { layName, medName } from './onboarding.ts';
import { $app, EXERCISES, getReport, patchProfile, prof as profOf, type ProfileView } from './shared.ts';

type Dose = Parameters<typeof doseText>[0];

/** Résumé de progression (sortie de `program.progressSummary`). */
interface ProgressSummary {
  week: number;
  phase: number;
  flare?: boolean;
  sessions7: number;
  planned: number;
  pain7?: number | null;
  quality7?: number | null;
  notes: { date: number; ex: string; pain?: number | null; text: string }[];
}

export function reportText(prof: ProfileView): string {
  const s: ProgressSummary = P.progressSummary(prof, sessions());
  const c = t('colon');
  const items: { id: string; level: number; dose: Dose; kept?: boolean }[] = P.todaysProgram(prof);
  return [
    `Mobilis — ${t('rptTitle')} (${new Date().toLocaleDateString(locale())})`,
    `${t('rptPatient')}${c} ${prof.name}`,
    `${t('rptCondition')}${c} ${medName(prof.pathology as string)} (${layName(prof.pathology as string)})`,
    `${t('rptWeek')} ${s.week} · ${t('phase')} ${s.phase}${s.flare ? ' · ' + t('rptFlare') : ''}`,
    `${t('rptSessions')}${c} ${s.sessions7}/${s.planned}`,
    `${t('rptPain')}${c} ${s.pain7 ?? '–'}/10`,
    `${t('rptQuality')}${c} ${!isNil(s.quality7) ? s.quality7 + ' %' : '–'}`,
    '',
    t('rptExercises'),
    ...items.map(
      (x) =>
        `- ${tr(EXERCISES[x.id]?.name)}${c} ${x.level}/5 (${doseText(x.dose)})${x.kept ? ' · ' + t('sessCustomKept').toLowerCase() : ''}`,
    ),
    ...(s.notes.length
      ? [
          '',
          t('rptComments'),
          ...s.notes.map(
            (n) =>
              `- ${new Date(n.date).toLocaleDateString(locale(), { day: 'numeric', month: 'short' })} · ${tr(EXERCISES[n.ex]?.name)}${!isNil(n.pain) ? ' · ' + n.pain + '/10' : ''}${c} « ${n.text} »`,
          ),
        ]
      : []),
  ].join('\n');
}

export function viewReport(): void {
  const prof = profOf();
  const RPT = getReport();
  const txt = reportText(prof);
  $app.innerHTML = `<section class="screen"><div class="topbar"><button class="icon-btn" data-go="#/progress" aria-label="${t('back')}">${icon('back', 20)}</button><h1>${t('reportTitle')}</h1></div>
    <p class="muted small">${t('reportD')}</p>
    <div class="card"><pre style="white-space:pre-wrap;font:inherit;margin:0;font-size:14px">${esc(txt)}</pre></div>
    <div class="row" style="margin-top:12px"><button class="btn ghost" id="cp">${icon('copy', 18)} ${t('copy')}</button><button class="btn" id="sh">${icon('share', 18)} ${t('share')}</button></div>
    ${RPT?.viewPatientReport ? `<button class="btn soft" id="pdf" style="margin-top:10px">${icon('doc', 18)} ${t('ig_pdf')}</button>` : ''}
    ${prof.rxCode ? `<div class="list" style="margin-top:14px"><div class="toggle"><span><b>${t('shareWithClin')}</b><br><small class="muted">${store.isCloud() ? t('shareWithClinD') : t('shareNeedsAccount')}</small></span>${store.isCloud() ? `<button class="switch ${prof.shareProgress ? 'on' : ''}" id="auto" role="switch" aria-checked="${!!prof.shareProgress}"></button>` : ''}</div></div>` : ''}
  </section>${nav('progress', navRole())}`;
  const q = (s: string) => $app.querySelector<HTMLElement>(s) as HTMLElement;
  q('#cp').onclick = () => void copyText(txt);
  q('#sh').onclick = () => void shareText(t('reportTitle'), txt);
  const pdf = $app.querySelector<HTMLElement>('#pdf');
  if (pdf) pdf.onclick = () => go('#/rapport');
  const au = $app.querySelector<HTMLElement>('#auto');
  if (au)
    au.onclick = async () => {
      await patchProfile({ shareProgress: !prof.shareProgress });
      void syncProgress();
      viewReport();
    };
}

// ---------- Ajuster mon programme ----------
/** Exercice du jour dans l'éditeur de dose. */
type AdjustItem = ReturnType<typeof P.todaysProgram>[number];
/** Plan du jour du profil : réglages d'aujourd'hui (séance sans / avec adaptation). */
interface TodayOver {
  date: string;
  items: Record<string, unknown>;
  skip: string[];
}

export function viewAdjust(): void {
  const prof = profOf();
  const prog = P.todaysProgram(prof, { withSkipped: true });
  const open: string | null = state.adjOpen || null;
  const capOf = (id: string) => levelCap(prof.lockPhase, prof.maxLevel, id);
  // Pourquoi le niveau a changé : dernière séance de l'exercice
  const why = (id: string) => {
    const li = P.lastItem(sessions(), id) as { reason?: string; change?: number } | null;
    if (!li || !li.reason) return '';
    const dir = (li.change ?? 0) > 0 ? t('adjLvUp') : (li.change ?? 0) < 0 ? t('adjLvDown') : t('adjLvSame');
    return `<span class="why-chip">${icon('spark', 12)} ${t('adjWhy')} : ${dir} · ${t('rsn_' + li.reason)}</span>`;
  };
  const editor = (x: AdjustItem) => {
    const d = x.dose,
      hold = d.type === 'hold';
    const st = (k: string, label: string, v: unknown, unit?: string) =>
      `<div class="toggle"><span>${label}</span><div class="stepper"><button data-dk="${k}" data-id="${x.id}" data-dir="-1" aria-label="−">−</button><b class="tnum">${v}${unit || ''}</b><button data-dk="${k}" data-id="${x.id}" data-dir="1" aria-label="+">+</button></div></div>`;
    return `<div class="sess-edit">${st('sets', t('setsLbl'), d.sets)}${hold ? st('hold', t('holdLbl'), d.hold, ' ' + t('sec')) : st('reps', t('repsLbl'), d.reps)}${st('rest', t('restLbl'), d.rest, ' ' + t('sec'))}
      <div class="row" style="padding:10px 12px 12px;gap:8px"><button class="btn sm ghost grow" data-dreset="${x.id}">${t('sessReset')}</button></div></div>`;
  };
  $app.innerHTML = `<section class="screen"><div class="topbar"><button class="icon-btn" data-go="#/profile" aria-label="${t('back')}">${icon('back', 20)}</button><h1>${t('adjustTitle')}</h1></div>
    <p class="muted small">${prof.lockPhase ? t('adjustLocked') : t('adjustD')}</p>
    <h2>${t('phase')}</h2><div class="seg">${[1, 2, 3].map((n) => `<button data-ph="${n}" class="${(prof.phase || 1) === n ? 'on' : ''}" ${prof.lockPhase ? 'disabled' : ''}>${n} · ${t('phaseName' + n)}</button>`).join('')}</div>
    <h2>${t('adjExercises')}</h2><p class="small muted" style="margin:-4px 0 8px">${t('adjExercisesD')}</p>
    <div class="list">${prog
      .map(
        (
          x,
        ) => `<div class="ex-block"><div class="toggle"><span class="small"><b>${esc(tr(EXERCISES[x.id]?.name))}</b><br><span class="muted">${x.skipped ? t('sessSkipped') : doseText(x.dose) + ' · ' + t('restShort') + ' ' + x.dose.rest + t('sec')}</span>${why(x.id)}
        ${prof.autoEx?.[x.id] === false ? `<span class="why-chip">${icon('shield', 12)} ${t('adjFixedByClin')}</span>` : ''}</span>
        <span class="stepper"><button data-lv="${x.id}" data-d="-1" aria-label="-">−</button><b>${P.levelOf(prof, x.id)}</b><button data-lv="${x.id}" data-d="1" aria-label="+" ${P.levelOf(prof, x.id) >= capOf(x.id) ? 'disabled' : ''}>+</button></span></div>
      <div class="ex-dose row wrap" style="gap:8px"><button class="btn sm ghost" data-dopen="${x.id}" aria-expanded="${open === x.id}">${t(open === x.id ? 'close' : 'sessEdit')}</button><button class="btn sm ghost" data-skip="${x.id}">${t(x.skipped ? 'sessUnskip' : 'sessSkip')}</button>${x.kept ? `<span class="chip sm ink">${t('sessCustomKept')}</span>` : x.rx ? `<span class="chip sm">${t('adjFromClin')}</span>` : ''}</div>
      ${open === x.id ? editor(x) : ''}</div>`,
      )
      .join('')}</div>
    ${prof.lockPhase && prog.some((x) => capOf(x.id) < 5) ? `<p class="note">${t('adjMaxNote')}</p>` : ''}
    <div class="list" style="margin-top:14px"><div class="toggle"><span><b>${t('changeProblem')}</b><br><small class="muted">${esc(layName(prof.pathology as string))}</small></span><button class="btn sm ghost" data-a="redo">${t('change')}</button></div>
      <div class="toggle"><span><b>${t('haveCode')}</b><br><small class="muted">${prof.rxCode ? t('linkedTo') + ' ' + store.fmtCode(prof.rxCode) : t('haveCodeD')}</small></span><button class="btn sm ghost" data-go="#/code">${t('enterCode')}</button></div></div>
  </section>${nav('profile', navRole())}`;
  const again = () => {
    const y = scrollY;
    viewAdjust();
    scrollTo(0, y);
  };
  $app.querySelectorAll<HTMLElement>('[data-ph]').forEach(
    (b) =>
      (b.onclick = async () => {
        await patchProfile({ phase: +(b.dataset['ph'] ?? 1) });
        toast(t('saved'));
        void syncProgress();
        viewAdjust();
      }),
  );
  $app.querySelectorAll<HTMLElement>('[data-lv]').forEach(
    (b) =>
      (b.onclick = async () => {
        const id = b.dataset['lv'] ?? '';
        const v = Math.max(1, Math.min(capOf(id), P.levelOf(profOf(), id) + +(b.dataset['d'] ?? 0)));
        await patchProfile({ levels: { ...(profOf().levels || {}), [id]: v } });
        void syncProgress();
        again();
      }),
  );
  $app.querySelectorAll<HTMLElement>('[data-dopen]').forEach(
    (b) =>
      (b.onclick = () => {
        state.adjOpen = open === b.dataset['dopen'] ? null : (b.dataset['dopen'] ?? null);
        again();
      }),
  );
  // Réglages permanents (même modèle que l'aperçu de séance : profil.doseOver)
  const saveOver = async (id: string, values: AdjustDose | null, reset?: boolean) => {
    const p = profOf(),
      to: TodayOver = P.todayOver(p),
      doseOver: Record<string, unknown> = { ...((p['doseOver'] as Record<string, unknown> | undefined) || {}) },
      items = { ...to.items };
    if (reset) Reflect.deleteProperty(doseOver, id);
    else doseOver[id] = values;
    Reflect.deleteProperty(items, id);
    await patchProfile({ doseOver, todayOver: { date: to.date, items, skip: to.skip } });
    again();
  };
  $app.querySelectorAll<HTMLElement>('[data-dk]').forEach(
    (b) =>
      (b.onclick = () => {
        const x = prog.find((i) => i.id === b.dataset['id']);
        if (!x) return;
        const next = adjustDose(x.dose, (b.dataset['dk'] ?? 'sets') as AdjustKey, +(b.dataset['dir'] ?? 0));
        if (next) void saveOver(x.id, next);
      }),
  );
  $app.querySelectorAll<HTMLElement>('[data-dreset]').forEach(
    (b) =>
      (b.onclick = () => {
        void saveOver(b.dataset['dreset'] ?? '', null, true);
        toast(t('sessResetDone'));
      }),
  );
  $app.querySelectorAll<HTMLElement>('[data-skip]').forEach(
    (b) =>
      (b.onclick = async () => {
        const id = b.dataset['skip'] ?? '',
          p = profOf(),
          to: TodayOver = P.todayOver(p),
          has = to.skip.includes(id);
        await patchProfile({
          todayOver: { date: to.date, items: to.items, skip: has ? to.skip.filter((z) => z !== id) : [...to.skip, id] },
        });
        again();
      }),
  );
  const redo = $app.querySelector<HTMLElement>('[data-a="redo"]') as HTMLElement;
  redo.onclick = () => {
    state.ob = null;
    state.obTest = false;
    state.obChange = true;
    go('#/onboard');
  }; // « Changer de problème » : directement au diagnostic, sans repasser par le nom
}

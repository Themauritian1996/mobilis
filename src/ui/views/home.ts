// Écran d'accueil (reprise de www/js/app.js) : séance du jour, indicateurs, « À faire », phase suivante, éducation.
import { firebaseEnabled } from '../../../www/js/config.js';
import { t, tp, locale } from '../../../www/js/i18n.js';
import { trList } from '../components/l10n.ts';
import * as store from '../../../www/js/store.js';
import * as P from '../../../www/js/program.js';
import { programEnded } from '../../../www/js/longterm.js';
import {
  state,
  journal,
  render,
  go,
  profile,
  type Profile,
  sessions,
  todaySession,
  nextExercise,
  syncProgress,
  navRole,
} from '../app-state.ts';
import { esc } from '../components/html.ts';
import { isNil } from '../util.ts';
import { icon, IC } from '../components/icons.ts';
import { toast } from '../components/toast.ts';
import { mountFigs } from '../components/figures.ts';
import { nav } from '../components/nav.ts';
import { sheet } from '../components/sheet.ts';
import { ring } from '../components/design.ts';
import { homeChipBadges } from './badges.ts';
import { checkRxUpdate, layName } from './onboarding.ts';
import { homeCardProm, bindHomeCardProm } from './proms.ts';
import { homeCardRom, bindHomeCardRom } from './rom.ts';
import { homeCardProtocol } from './protocol.ts';
import { refreshReminders } from './calendar.ts';
import { appointments } from '../../domains/rehab/calendar.ts';
import {
  $app,
  prof as profOf,
  patchProfile,
  getReport,
  exItem,
  trialBar,
  bindTrialBar,
  askImageConsent,
} from './shared.ts';

/** Textes d'éducation d'une pathologie (catalogue legacy). */
interface PathologyTexts {
  edu?: unknown;
  avoid?: unknown;
}
/** Phase suivante (sortie de `program.nextPhaseInfo`). */
interface NextPhaseInfo {
  done?: boolean;
  locked?: boolean;
  phase: number;
  weeksLeft: number;
  sessionsNeeded: number;
  painOk: boolean;
  painMax: number;
}

async function weeklyMaybe(): Promise<void> {
  const prof = profOf();
  const rv = P.weeklyReview(prof, sessions());
  if (rv.phase !== (prof.phase || 1)) {
    const up = rv.phase > (prof.phase || 1);
    await patchProfile({ phase: rv.phase });
    toast(`${t('phase')} ${rv.phase} · ${t('phaseName' + rv.phase)}${up ? ' ↑' : ' ↓'}`, 3500);
    void syncProgress();
    render();
  }
}

// Réglages d'avant la 1.15 : si l'envoi d'images à l'IA était activé sans consentement enregistré, on le demande (une fois par session)
function consentMaybe(): void {
  const st = store.settings();
  if (!isNil(st.imageConsent) || !(st.sendFrame || st.liveAI) || !(store.aiKey() || firebaseEnabled())) return;
  try {
    if (sessionStorage.getItem('mobilis.consentAsked')) return;
    sessionStorage.setItem('mobilis.consentAsked', '1');
  } catch {
    /* stockage de session indisponible : on demande quand même */
  }
  void askImageConsent().then(() => {
    if (/^#?\/?(home)?$/.test(location.hash)) render();
  });
}

export function viewHome(): void {
  const prof = profOf();
  const raw = profile() as Profile;
  void weeklyMaybe();
  checkRxUpdate();
  refreshReminders(raw);
  const RPT = getReport();
  const week = P.weekNumber(prof);
  const phase = prof.phase || 1;
  const prog: { id: string; dose: Parameters<typeof exItem>[0]['dose'] }[] = P.todaysProgram(prof);
  const s = todaySession();
  const done = new Set((s?.items || []).filter((i) => !i.partial).map((i) => i.id));
  const nDone = prog.filter((x) => done.has(x.id)).length;
  const pct = prog.length ? Math.round((nDone / prog.length) * 100) : 0;
  const ws: { sessions?: number; pain?: number | null; quality?: number | null } =
    P.weeklyStats(prof, sessions()).slice(-1)[0] || {};
  const next = nextExercise();
  const today = P.todayKey();
  const todayJournal = journal().find((j) => j.day === today);
  const flare = P.inFlare(prof);
  const appt = appointments(raw).find((a) => a.date >= today);
  const isTrainDay = P.isPlannedDay(prof, today);
  const npi = P.nextPhaseInfo(prof, sessions()) as unknown as NextPhaseInfo;
  const path = P.pathologyById(prof.pathology) as unknown as PathologyTexts | undefined;
  // « À faire » : questionnaire, mesure d'amplitude, rapport, semaine du protocole
  const todo = [
    homeCardProm(raw as Parameters<typeof homeCardProm>[0]),
    homeCardRom(raw as unknown as Parameters<typeof homeCardRom>[0]),
    RPT?.homeCardReport ? RPT.homeCardReport(prof) : '',
    homeCardProtocol(prof),
  ].filter(Boolean);
  const isPatientView = prof.role !== 'clinician';
  const badgeProf = prof as unknown as Parameters<typeof homeChipBadges>[0];

  $app.innerHTML = `<section class="screen">${trialBar()}
    <div class="hello"><div class="avatar">${esc((prof.name || '?')[0]?.toUpperCase())}</div><div class="grow"><span class="eyebrow">${new Date().toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' })}</span><h1 class="hello-name">${t('hello')} ${esc(prof.name)}</h1></div>
      <span class="chip streak" title="${t('streak')}" aria-label="${t('streak')} ${P.streak(prof, sessions())}">${icon('flame', 16)} ${P.streak(prof, sessions())}</span></div>

    <div class="card today hero">
      <div class="hero-top"><div class="grow">${P.protocolActive?.(prof) ? '' : `<span class="hero-kicker">${t('week')} ${week} · ${t('phase')} ${phase} · ${t('phaseName' + phase)}</span>`}<h3>${esc(layName(prof.pathology as string))}</h3><span class="hero-sub">${tp('dsDone', prog.length, { a: nDone, b: prog.length })}</span></div>${ring(pct, `${t('today')} ${pct} %`)}</div>
      ${flare ? `<div class="banner neg">${icon('flame', 20)}<div><b>${t('flareOn')}</b><br>${t('flareOnD')} <button class="link" data-a="flareOff">${t('flareEnd')}</button></div></div>` : ''}
      ${programEnded(prof) ? `<div class="banner pos">${icon('check', 20)}<div><b>${t('progEndTitle')}</b><br>${t('progEndD')} <button class="link" data-go="#/code">${t('progEndBtn')}</button></div></div>` : ''}
      ${next ? `<button class="btn" data-go="#/session">${IC['play']?.replace('<svg', '<svg width="16" height="16"')} ${nDone ? t('continueSession') : isTrainDay ? t('startSession') : t('startExtra')}</button>` : `<button class="btn soft" data-go="#/session">${icon('check', 16)} ${t('sessionDone')} · ${t('redoSession')}</button>`}
    </div>

    <div class="list" style="margin-top:12px"><div class="kpis">
      <div><b>${ws.sessions ?? 0}<small>/${P.plannedPerWeek(prof)}</small></b><span>${t('sessions')}</span></div>
      <div><b>${!isNil(ws.pain) ? ws.pain.toFixed(1) : '–'}</b><span>${t('avgPain')}</span></div>
      <div><b>${!isNil(ws.quality) ? Math.round(ws.quality * 100) + '%' : '–'}</b><span>${t('quality')}</span></div></div></div>
    ${isPatientView && homeChipBadges(badgeProf) ? `<div class="row wrap" style="margin-top:12px;gap:8px">${homeChipBadges(badgeProf)}</div>` : ''}

    ${
      todayJournal
        ? ''
        : `<div class="card" style="margin-top:12px"><div class="row between"><b>${t('dailyQ')}</b><span class="small muted tnum">0–10</span></div>
      <div class="seg" style="margin-top:10px">${[0, 2, 4, 6, 8, 10].map((n) => `<button data-jp="${n}">${n}</button>`).join('')}</div></div>`
    }

    ${todo.length ? `<h2>${t('ig_todo')}</h2><div class="stack todo">${todo.join('')}</div>` : ''}

    ${prof.rxNotes ? `<h2>${t('fromClinician')}</h2><div class="card"><span class="eyebrow">${esc(prof.clinician || t('yourClinician'))}</span><p style="margin:6px 0 0;white-space:pre-line">${esc(prof.rxNotes)}</p></div>` : ''}
    ${appt ? `<div class="card row" style="margin-top:12px">${icon('cal', 22)}<div class="grow"><b>${t('calAppt')}</b><div class="small muted">${new Date(appt.date + 'T12:00').toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long' })}${appt.time ? ' · ' + esc(appt.time) : ''}${appt.note ? ' · ' + esc(appt.note) : ''}</div></div></div>` : ''}

    <div class="sec-head"><h2>${t('today')}</h2><span class="small muted">${nDone}/${prog.length}</span></div>
    <div class="list">${prog.map((x) => exItem(x, done.has(x.id))).join('')}</div>
    ${!flare ? `<button class="btn ghost" data-a="flare" style="margin-top:10px">${icon('flame', 18)} ${t('flareBtn')}</button>` : ''}

    <h2>${t('nextStep')}</h2><div class="card">${
      npi.done
        ? `<span class="small">${t('lastPhase')}</span>`
        : npi.locked
          ? `<span class="small">${t('phaseLocked')}</span>`
          : `
      <div class="small"><b>${t('toReachPhase')} ${npi.phase + 1} · ${t('phaseName' + (npi.phase + 1))}</b></div>
      <ul class="list-plain small">
        <li class="${npi.weeksLeft ? '' : 'pos'}">${npi.weeksLeft ? tp('weeksLeft', npi.weeksLeft) : t('weeksOk')}</li>
        <li class="${npi.sessionsNeeded ? '' : 'pos'}">${npi.sessionsNeeded ? tp('sessionsNeeded', npi.sessionsNeeded) : t('sessionsOk')}</li>
        <li class="${npi.painOk ? 'pos' : 'neg'}">${(npi.painOk ? t('painOk') : t('painHigh')).replace('{m}', String(npi.painMax))}</li></ul>`
    }</div>

    ${
      path?.edu
        ? `<h2>${t('education')}</h2><div class="card"><ul class="list-plain">${trList(path.edu)
            .map((e) => `<li>${esc(e)}</li>`)
            .join('')}</ul>
      ${path.avoid ? `<div class="banner" style="margin-top:10px">${icon('shield', 20)}<div><b>${t('avoid')}${t('colon')}</b> ${trList(path.avoid).map(esc).join(' ')}</div></div>` : ''}</div>`
        : ''
    }
  </section>${nav('home', navRole())}`;
  mountFigs($app);
  bindTrialBar();
  consentMaybe();
  bindHomeCardProm($app, go);
  bindHomeCardRom($app, go);
  RPT?.bindHomeCardReport?.($app, go);
  $app.querySelectorAll<HTMLElement>('[data-jp]').forEach(
    (b) =>
      (b.onclick = async () => {
        await store.saveJournal({ day: today, pain: +(b.dataset['jp'] ?? 0), ts: Date.now() });
        state.data = await store.loadData();
        toast(t('saved'));
        render();
      }),
  );
  const fl = $app.querySelector<HTMLElement>('[data-a="flare"]');
  if (fl)
    fl.onclick = () => {
      const bg = sheet(`<h3>${t('flareTitle')}</h3><p class="muted small" style="margin:6px 0 14px">${t('flareD')}</p>
      <div class="banner" style="margin-bottom:14px">${icon('shield', 20)}<div>${t('flareWarn')}</div></div>
      <button class="btn" id="f2">${t('flare2days')}</button>`);
      const f2 = bg.querySelector<HTMLElement>('#f2');
      if (f2)
        f2.onclick = async () => {
          await patchProfile({ flareUntil: Date.now() + 2 * 86400000 });
          bg.remove();
          void syncProgress();
          toast(t('flareSet'));
          render();
        };
    };
  const fo = $app.querySelector<HTMLElement>('[data-a="flareOff"]');
  if (fo)
    fo.onclick = async () => {
      await patchProfile({ flareUntil: 0 });
      render();
    };
}

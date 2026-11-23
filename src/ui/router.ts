// Démarrage de l'application et routes (reprise de www/js/app.js). Importé par www/js/app.js (chargé par index.html) :
// les effets de bord à l'import (écouteurs, enregistrement du rendu, boot) sont conservés tels quels.
import { t, getLang, setLang, langInfo } from '../../www/js/i18n.js';
import { EXERCISES as EXERCISE_DATA } from '../../www/js/data/exercises.js';
import * as store from '../../www/js/store.js';
import { setPartialPolicy } from '../../www/js/pose.js';
import { state, setRender, render, go, profile, updateProfile } from './app-state.ts';
import { toast } from './components/toast.ts';
import { stopFigs } from './components/figures.ts';
import { applyTheme } from './components/nav.ts';
import { watchSwitches } from './components/switches.ts';
import { viewHistory } from './views/history.ts';
import { viewOnboard, viewCodeEntry, viewRxImport } from './views/onboarding.ts';
import { viewTrain } from './views/train.ts';
import { viewSession } from './views/session.ts';
import { viewCalendar } from './views/calendar.ts';
import { viewClinic, viewRxEditor, viewTestStart } from './views/clinic.ts';
import { viewProm, viewPromHistory } from './views/proms.ts';
import { viewRom, viewRomHistory } from './views/rom.ts';
import { viewProtocol } from './views/protocol.ts';
import { viewBadges, syncBadges } from './views/badges.ts';
import { viewAuth } from './views/auth.ts';
import { viewHome } from './views/home.ts';
import { viewLibrary, viewExercise } from './views/library.ts';
import { viewProgress } from './views/progress.ts';
import { viewReport, viewAdjust } from './views/progress-report.ts';
import { viewProfile } from './views/profile.ts';
import { $app, getReport, setReport, type ReportModule } from './views/shared.ts';

let cleanup: (() => void)[] = [];

// Badges : évalue après une sauvegarde ; rafraîchit l'accueil si un badge vient d'être gagné (jamais pour le clinicien)
async function badgesAfter(): Promise<void> {
  try {
    const p = profile();
    if (!p || p.role === 'clinician') return;
    const { newOnes } = await syncBadges();
    if (newOnes?.length && /^#?\/?(home)?$/.test(location.hash)) render();
  } catch (e) {
    console.warn('badges', e);
  }
}

// ---------- Démarrage et routes ----------
async function boot(): Promise<void> {
  try {
    setReport((await import('../../www/js/report.js')) as ReportModule);
  } catch {
    setReport(null);
  }
  await setLang(getLang());
  applyTheme();
  watchSwitches($app); // chaque interrupteur reçoit un nom accessible, quel que soit l'écran
  try {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  } catch {
    /* matchMedia indisponible : le thème automatique ne suit pas le système */
  }
  await store.initAuth(async (u) => {
    state.user = u;
    state.data = u ? await store.loadData() : null;
    const lang = state.data?.profile?.['lang'];
    if (typeof lang === 'string' && lang && lang !== getLang()) await setLang(lang);
    render();
  });
}
window.addEventListener('hashchange', render);
setRender(route);

// Changement de langue (tous les sélecteurs)
document.addEventListener('change', async (e) => {
  const sel = (e.target as HTMLElement).closest<HTMLSelectElement>('[data-lang-select]');
  if (!sel) return;
  try {
    sessionStorage.setItem('mobilis.langChosen', '1');
  } catch {
    /* stockage de session indisponible */
  }
  await setLang(sel.value);
  if (profile()) await updateProfile({ lang: sel.value });
  render();
});

function route(): unknown {
  stopFigs();
  cleanup.forEach((f) => {
    try {
      f();
    } catch (e) {
      console.error('cleanup', e);
    }
  });
  cleanup = [];
  document.querySelectorAll('body > .train').forEach((x) => x.remove()); // jamais d'écran de séance resté par-dessus
  document.querySelectorAll('.sheet-bg').forEach((x) => x.remove());
  window.scrollTo(0, 0);
  const r = location.hash.replace(/^#\/?/, '');
  const [name, arg, arg2] = r.split('/');
  if (name !== 'train' && name !== 'rx') void badgesAfter(); // après une séance, un questionnaire, une mesure ou un rapport : nouveaux badges
  if (name === 'rx' && arg) {
    store.setPendingRx(arg);
    // Le lien porte la langue choisie par le clinicien (#/rx/CODE/es)
    let chosen = false;
    try {
      chosen = !!sessionStorage.getItem('mobilis.langChosen');
    } catch {
      /* stockage de session indisponible : la langue du lien s'applique */
    }
    if (arg2 && arg2 !== getLang() && langInfo(arg2)?.id === arg2 && !chosen) {
      void setLang(arg2).then(render);
      return;
    }
    if (state.user) return viewRxImport(arg);
  }
  if (!state.user) return viewAuth();
  const pending = store.getPendingRx();
  if (pending && name !== 'rx') return go('#/rx/' + pending.split('/')[0]);
  if (name === 'code') return viewCodeEntry();
  if (name === 'history' && profile()?.role) return viewHistory();
  const prof = profile();
  if (!prof?.role || name === 'onboard' || (prof.role === 'patient' && !prof.pathology)) return viewOnboard();
  if (name === 'clinic' && arg === 'new') return viewRxEditor(null);
  if (name === 'clinic' && arg === 'rx' && arg2) return viewRxEditor(arg2);
  if (name === 'clinic') return viewClinic();
  if (name === 'library') return viewLibrary();
  if (name === 'ex' && arg) return viewExercise(arg);
  if (name === 'profile') return viewProfile();
  if (name === 'train' && arg) return viewTrain(arg, cleanup);
  if (prof.role === 'clinician' && !prof.pathology) return viewTestStart();
  if (name === 'prom' && arg) return viewProm($app, arg);
  if (name === 'proms') return viewPromHistory($app);
  if (name === 'rom' && arg) return viewRom($app, arg, arg2 || '-', cleanup);
  if (name === 'amplitude') return viewRomHistory($app);
  if (name === 'protocole') return viewProtocol($app);
  if (name === 'badges') return viewBadges($app);
  const RPT = getReport();
  if (name === 'rapport' && RPT?.viewPatientReport) return RPT.viewPatientReport($app);
  if (name === 'calendar') return viewCalendar();
  if (name === 'session') return viewSession();
  if (name === 'progress') return viewProgress();
  if (name === 'report') return viewReport();
  if (name === 'adjust') return viewAdjust();
  return viewHome();
}

document.addEventListener('click', (e) => {
  const g = (e.target as HTMLElement).closest<HTMLElement>('[data-go]');
  if (g) {
    e.preventDefault();
    go(g.dataset['go'] ?? '');
    return;
  }
  const a = (e.target as HTMLElement).closest('[data-act="quickstart"]');
  if (a) go(profile()?.pathology ? '#/session' : '#/home');
});

// Répétitions partielles : réglage du patient + exception par exercice du clinicien (profile.partialEx)
const EXERCISES = EXERCISE_DATA as unknown as Record<string, { id?: string } | undefined>;
const exId = (ex: { id?: string } | undefined): string | undefined =>
  ex?.id || Object.keys(EXERCISES).find((k) => EXERCISES[k] === ex);
type PolicyEx = Parameters<NonNullable<Parameters<typeof setPartialPolicy>[0]>>[0];
setPartialPolicy((ex: PolicyEx) => {
  const id = exId(ex as unknown as { id?: string });
  const partialEx = profile()?.['partialEx'] as Record<string, boolean> | undefined;
  return !(store.settings().countPartial === false || (id !== undefined && partialEx?.[id] === false));
});

window.addEventListener('mobilis:aicap', () => toast(t('aiCapNote'), 5000));
void boot();

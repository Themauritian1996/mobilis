// Éléments communs aux écrans de l'application (reprise de www/js/app.js) : racine #app, module de rapports PDF,
// profil typé, bandeau « mode test patient », consentement d'envoi d'image, ligne d'exercice.
import { t, tr } from '../../../www/js/i18n.js';
import { EXERCISES as EXERCISE_DATA } from '../../../www/js/data/exercises.js';
import * as store from '../../../www/js/store.js';
import { profile, updateProfile, go, inTrial, type Profile } from '../app-state.ts';
import { esc } from '../components/html.ts';
import { icon } from '../components/icons.ts';
import { figSvg } from '../components/figures.ts';
import { confirmSheet } from '../components/sheet.ts';
import { doseText } from '../../domains/rehab/training.ts';

/** Exercice du catalogue, champs lus par les écrans d'accueil, de bibliothèque et de détail. */
export interface ExerciseInfo {
  name: unknown;
  region?: string;
  equip: string[];
  keys: unknown[];
  steps: unknown;
  track?: { kind?: string; cam?: unknown; planes: Record<string, unknown> };
}
export const EXERCISES = EXERCISE_DATA as unknown as Record<string, ExerciseInfo | undefined>;

/** Profil tel que lu par les écrans (le stockage en porte d'autres, cf. `Profile`). */
export interface ProfileView {
  name?: string;
  role?: string;
  pathology?: string;
  phase?: number;
  rxCode?: string;
  rxNotes?: string;
  clinician?: string;
  shareProgress?: boolean;
  lockPhase?: boolean;
  maxLevel?: Record<string, number>;
  autoEx?: Record<string, boolean>;
  partialEx?: Record<string, boolean>;
  levels?: Record<string, number>;
  [key: string]: unknown;
}
/** Le profil courant (toujours défini une fois connecté et passé l'accueil). */
export const prof = (): ProfileView => profile() as unknown as ProfileView;
/** `updateProfile` avec un correctif libre (le stockage accepte null pour effacer un champ). */
export const patchProfile = (patch: Record<string, unknown>): Promise<Profile> =>
  updateProfile(patch as Partial<Profile>);

/** Racine de l'application. */
export const $app = document.getElementById('app') as HTMLElement;

/** Module de rapports PDF (report.js) : chargé au démarrage, l'app fonctionne sans lui. */
export interface ReportModule {
  viewPatientReport?: ($app: HTMLElement) => unknown;
  homeCardReport?: (prof: ProfileView) => string;
  bindHomeCardReport?: (root: HTMLElement, go: (h: string) => void) => void;
}
let report: ReportModule | null = null;
export const getReport = (): ReportModule | null => report;
export const setReport = (m: ReportModule | null): void => {
  report = m;
};

/** Ligne d'exercice (accueil, bibliothèque). */
export function exItem(x: { id: string; dose: Parameters<typeof doseText>[0] }, done = false): string {
  const ex = EXERCISES[x.id];
  return `<button class="ex-item" data-go="#/ex/${x.id}"><span class="ex-thumb">${figSvg(x.id, { stat: true })}</span>
    <span class="meta"><b>${esc(tr(ex?.name))}</b><small>${doseText(x.dose)} · ${ex?.track ? t('tracked') : t('guidedShort')}</small></span>
    <span class="check ${done ? 'on' : ''}">${done ? icon('check', 15) : ''}</span></button>`;
}

// Feuille de consentement avant tout envoi d'image à l'IA (Gemini). → true si accepté
export function askImageConsent(): Promise<boolean> {
  return confirmSheet({
    title: t('consentTitle'),
    text: t('consentText'),
    ok: t('consentYes'),
    cancel: t('consentNo'),
  }).then((ok) => {
    store.setImageConsent(ok);
    return ok;
  });
}

// Bandeau « mode test patient » (clinicien)
export function trialBar(): string {
  if (!inTrial()) return '';
  return `<div class="trialbar"><div class="tb-top">${icon('stetho', 20)}<div class="grow"><b>${t('trialOn')}</b>${t('trialOnD')}</div></div><div class="tb-btns"><button data-a="trialBack">${icon('back', 14)} ${t('backToPatients')}</button><button data-a="trialExit">${icon('close', 14)} ${t('trialExit')}</button></div></div>`;
}
export function bindTrialBar(): void {
  const b = $app.querySelector<HTMLElement>('[data-a="trialBack"]');
  if (b) b.onclick = () => go('#/clinic');
  const x = $app.querySelector<HTMLElement>('[data-a="trialExit"]');
  if (x)
    x.onclick = async () => {
      await patchProfile({
        pathology: null,
        plan: null,
        trial: false,
        rxNotes: '',
        clinician: '',
        nextVisit: null,
        flareUntil: 0,
      });
      go('#/clinic');
    };
}

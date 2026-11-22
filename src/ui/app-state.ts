// État partagé de l'application (reprise de www/js/state.js). Le cycle state → rom est cassé : le résumé des amplitudes
// vient de la logique pure `domains/outcomes/rom.ts`, plus de rom.js (qui touche le DOM).
import * as P from '../../www/js/program.js';
import * as store from '../../www/js/store.js';
import { summaryPart as romSummaryPart, type RomLogRow } from '../domains/outcomes/rom.ts';

/** Profil patient / clinicien tel que stocké (v1.15) : champs lus par l'interface ; le stockage en porte d'autres. */
export interface Profile {
  role?: string;
  pathology?: string;
  rxCode?: string;
  shareProgress?: boolean;
  romLog?: RomLogRow[];
  [key: string]: unknown;
}

/** Exercice d'une séance enregistrée. */
export interface SessionItem {
  id: string;
  partial?: boolean;
  pain?: number | null;
  note?: string;
  [key: string]: unknown;
}

/** Séance enregistrée (v1.15). */
export interface SessionRecord {
  id?: string;
  date?: number;
  manual?: boolean;
  items?: SessionItem[];
  checkin?: unknown;
  [key: string]: unknown;
}

/** Entrée du journal de douleur : un jour, une valeur. */
export interface JournalEntry {
  day: string;
  pain: number;
  ts?: number;
  [key: string]: unknown;
}

export interface AppData {
  profile?: Profile;
  sessions?: SessionRecord[];
  journal?: JournalEntry[];
  [key: string]: unknown;
}

/** État de l'écran « Historique » (onglet courant, nombre de lignes supplémentaires). */
export interface HistState {
  tab: string;
  more: number;
}

/** Candidat de diagnostic / de pathologie (triage). */
export interface PathCandidate {
  id: string;
  score?: number;
}

/** État de l'assistant d'accueil (onboarding), conservé dans `state.ob`. */
export interface OnboardState {
  step: string;
  hist: string[];
  name: string;
  role: string;
  text: string;
  matches: PathCandidate[] | null;
  region: string | null | undefined;
  answers: Record<number, number>;
  pathology: string | null | undefined;
  start: Record<string, string>;
  painBase: number;
  irritability: string;
  days: number[];
  flags: Set<number>;
  noFlag: boolean;
  candidates?: PathCandidate[];
  showAll?: boolean;
  share?: boolean;
  code?: string;
}

export interface AppState {
  user: { name?: string; [key: string]: unknown } | null;
  data: AppData | null;
  ob: OnboardState | null;
  obTest?: boolean;
  obChange?: boolean;
  /** Import d'un programme du clinicien en cours (`#/rx/<code>`). */
  rxo?: OnboardState | null;
  lib: { region: string; q: string };
  cal: { month: Date | null; sel: string | null };
  clinic: unknown;
  /** Plage de dates choisie (écran Progrès / Historique) ; absente tant que l'utilisateur n'a rien choisi. */
  range?: string | undefined;
  hist?: HistState;
  /** Aperçu de séance : exercice dont l'éditeur est ouvert, panneau matériel ouvert. */
  sessOpen?: string | null;
  equipOpen?: boolean;
  /** Séance refaite le même jour (exercice ou file d'exercices). */
  redo?: boolean;
  redoQueue?: string[];
}

export const state: AppState = {
  user: null,
  data: null,
  ob: null,
  lib: { region: 'all', q: '' },
  cal: { month: null, sel: null },
  clinic: null,
};
let renderFn: () => unknown = () => undefined;
export const setRender = (fn: () => unknown): void => {
  renderFn = fn;
};
export const render = (): unknown => renderFn();
export const go = (h: string): void => {
  if (location.hash === h) renderFn();
  else location.hash = h;
};
export const profile = (): Profile | undefined => state.data?.profile;
export const sessions = (): SessionRecord[] => state.data?.sessions || [];

export function todaySession(create = false): SessionRecord | undefined {
  const s = sessions().find((x) => P.todayKey(x.date) === P.todayKey());
  if (s || !create) return s;
  return { id: 's' + Date.now(), date: Date.now(), items: [], checkin: null };
}
export function nextExercise(): { id: string; [key: string]: unknown } | null {
  const prof = profile();
  if (!prof) return null;
  const prog: { id: string }[] = P.todaysProgram(prof);
  const done = new Set((todaySession()?.items || []).filter((i) => !i.partial).map((i) => i.id));
  return prog.find((x) => !done.has(x.id)) || null;
}
export async function updateProfile(patch: Partial<Profile>): Promise<Profile> {
  const p = { ...profile(), ...patch };
  await store.saveProfile(p);
  state.data = await store.loadData();
  return p;
}
// Partage automatique du suivi avec le clinicien (si le patient l'a accepté)
export async function syncProgress(): Promise<void> {
  const p = profile();
  if (!p?.rxCode || !p.shareProgress || !store.isCloud()) return;
  await store.pushProgress(p.rxCode, await fullSummary(p, sessions()));
}
// Résumé complet : progressSummary + amplitudes (logique pure de domains/outcomes/rom.ts)
export async function fullSummary(p: Profile, sess: SessionRecord[]): Promise<Record<string, unknown>> {
  const base = P.progressSummary(p, sess);
  try {
    Object.assign(base, romSummaryPart(p));
  } catch (e) {
    console.warn(e);
  }
  return base;
}
// Clinicien en « mode test patient » : il voit l'app exactement comme son patient
export const inTrial = (): boolean => profile()?.role === 'clinician' && !!profile()?.pathology;
export const navRole = (): string | undefined => (inTrial() ? 'patient' : profile()?.role);

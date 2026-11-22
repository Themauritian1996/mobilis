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

/** Séance enregistrée (v1.15). */
export interface SessionRecord {
  id?: string;
  date?: number;
  items?: { id: string; partial?: boolean; [key: string]: unknown }[];
  checkin?: unknown;
  [key: string]: unknown;
}

export interface AppData {
  profile?: Profile;
  sessions?: SessionRecord[];
  [key: string]: unknown;
}

export interface AppState {
  user: unknown;
  data: AppData | null;
  ob: Record<string, unknown> | null;
  lib: { region: string; q: string };
  cal: { month: number | null; sel: number | string | null };
  clinic: unknown;
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

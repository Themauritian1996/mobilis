// État partagé de l'application
import * as P from './program.js';
import * as store from './store.js';

export const state = { user: null, data: null, ob: null, lib: { region: 'all', q: '' }, cal: { month: null, sel: null }, clinic: null };
let renderFn = () => {};
export const setRender = (fn) => { renderFn = fn; };
export const render = () => renderFn();
export const go = (h) => { if (location.hash === h) renderFn(); else location.hash = h; };
export const profile = () => state.data?.profile;
export const sessions = () => state.data?.sessions || [];

export function todaySession(create = false) {
  const s = sessions().find((x) => P.todayKey(x.date) === P.todayKey());
  if (s || !create) return s;
  return { id: 's' + Date.now(), date: Date.now(), items: [], checkin: null };
}
export function nextExercise() {
  if (!profile()) return null;
  const prog = P.todaysProgram(profile());
  const done = new Set((todaySession()?.items || []).map((i) => i.id));
  return prog.find((x) => !done.has(x.id)) || null;
}
export async function updateProfile(patch) {
  const p = { ...profile(), ...patch };
  await store.saveProfile(p);
  state.data = await store.loadData();
  return p;
}
// Partage automatique du suivi avec le clinicien (si le patient l'a accepté)
export async function syncProgress() {
  const p = profile();
  if (!p?.rxCode || !p.shareProgress || !store.isCloud()) return;
  await store.pushProgress(p.rxCode, P.progressSummary(p, sessions()));
}
// Clinicien en « mode test patient » : il voit l'app exactement comme son patient
export const inTrial = () => profile()?.role === 'clinician' && !!profile()?.pathology;
export const navRole = () => (inTrial() ? 'patient' : profile()?.role);

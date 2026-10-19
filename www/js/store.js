// Comptes (Firebase : Google + courriel), données (Firestore ou appareil) et prescriptions clinicien.
import { CONFIG, firebaseEnabled } from './config.js';

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
  del(k) { try { localStorage.removeItem(k); } catch (_) {} },
};

// ---------- Réglages (locaux à l'appareil) ----------
const DEFAULT_SETTINGS = { voice: 'local', countAloud: true, geminiKey: '', sendFrame: false, camera: 'user', theme: 'auto', anatomy: false };
export const settings = () => ({ ...DEFAULT_SETTINGS, ...LS.get('mobilis.settings', {}) });
export const saveSettings = (patch) => LS.set('mobilis.settings', { ...settings(), ...patch });

// ---------- Plateforme ----------
export const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
let capMod = null;
export async function cap() {
  if (!capMod) capMod = await import('../vendor/capacitor.js');
  return capMod;
}

// ---------- Authentification ----------
let fb = null;
let user = null;
export const currentUser = () => user;
export const isCloud = () => !!(user && !user.local);

async function loadFirebase() {
  if (fb) return fb;
  const mod = await import('../vendor/firebase.js');
  const app = mod.initializeApp(CONFIG.firebase);
  fb = { app, auth: mod.getAuth(app), db: mod.getFirestore(app), m: mod };
  return fb;
}

export async function initAuth(onChange) {
  const local = LS.get('mobilis.localUser', null);
  if (firebaseEnabled()) {
    try {
      const { auth, m } = await loadFirebase();
      try { await m.getRedirectResult(auth); } catch (_) {}
      if (isNative()) listenNativeAuthReturn();
      m.onAuthStateChanged(auth, (u) => {
        user = u ? { uid: u.uid, email: u.email, name: u.displayName || '' } : local;
        cache = null;
        onChange(user);
      });
      return;
    } catch (e) { console.warn('Firebase indisponible, mode local', e); }
  }
  user = local; onChange(user);
}

// APK : Google refuse la connexion dans une WebView. On ouvre donc la page de connexion dans le
// navigateur du téléphone (auth.html), qui renvoie un jeton Google à l'app via ca.mobilis.app://auth
async function listenNativeAuthReturn() {
  try {
    const { App, Browser } = await cap();
    App.addListener('appUrlOpen', async ({ url }) => {
      if (!url || !url.startsWith('ca.mobilis.app://auth')) return;
      const params = new URLSearchParams(url.split('#')[1] || url.split('?')[1] || '');
      const idToken = params.get('id_token');
      try { await Browser.close(); } catch (_) {}
      if (!idToken) return;
      const { auth, m } = await loadFirebase();
      await m.signInWithCredential(auth, m.GoogleAuthProvider.credential(idToken));
    });
  } catch (e) { console.warn('Retour de connexion indisponible', e); }
}

export async function signInGoogle() {
  const { auth, m } = await loadFirebase();
  if (isNative()) {
    const { Browser } = await cap();
    await Browser.open({ url: `${CONFIG.siteUrl}/auth.html?app=1&lang=${document.documentElement.lang || 'fr'}` });
    return;
  }
  const provider = new m.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try { return await m.signInWithPopup(auth, provider); }
  catch (e) {
    if (String(e.code).includes('popup')) return m.signInWithRedirect(auth, provider);
    throw e;
  }
}

export async function signInEmail(email, password, create) {
  const { auth, m } = await loadFirebase();
  return create ? m.createUserWithEmailAndPassword(auth, email, password) : m.signInWithEmailAndPassword(auth, email, password);
}
export async function resetPassword(email) {
  const { auth, m } = await loadFirebase();
  return m.sendPasswordResetEmail(auth, email);
}

export function signInLocal(onChange) {
  user = { uid: 'local', local: true, name: '' };
  LS.set('mobilis.localUser', user);
  onChange(user);
}

export async function signOut(onChange) {
  if (user && !user.local && fb) await fb.m.signOut(fb.auth);
  LS.del('mobilis.localUser');
  user = null; cache = null;
  onChange(null);
}

// ---------- Données du patient ----------
let cache = null;
const key = () => `mobilis.data.${user?.uid || 'anon'}`;

export async function loadData() {
  if (cache) return cache;
  cache = LS.get(key(), { profile: null, sessions: [], journal: [] });
  cache.journal = cache.journal || [];
  if (isCloud()) {
    try {
      const { db, m } = await loadFirebase();
      const snap = await m.getDoc(m.doc(db, 'users', user.uid));
      if (snap.exists()) {
        const d = snap.data();
        cache.profile = d.profile || cache.profile;
        cache.journal = d.journal || cache.journal;
      }
      const qs = await m.getDocs(m.query(m.collection(db, 'users', user.uid, 'sessions'), m.orderBy('date')));
      const remote = qs.docs.map((d) => d.data());
      if (remote.length) cache.sessions = remote;
      LS.set(key(), cache);
    } catch (e) { console.warn('Lecture Firestore impossible, cache local utilisé', e); }
  }
  return cache;
}

async function saveUserDoc(patch) {
  if (!isCloud()) return;
  try { const { db, m } = await loadFirebase(); await m.setDoc(m.doc(db, 'users', user.uid), { ...patch, updated: Date.now() }, { merge: true }); }
  catch (e) { console.warn(e); }
}

export async function saveProfile(profile) {
  cache = cache || { profile: null, sessions: [], journal: [] };
  cache.profile = profile;
  LS.set(key(), cache);
  await saveUserDoc({ profile });
}

export async function saveJournal(entry) {
  cache.journal = (cache.journal || []).filter((j) => j.day !== entry.day).concat(entry).slice(-400);
  LS.set(key(), cache);
  await saveUserDoc({ journal: cache.journal });
}

export async function saveSession(session) {
  cache = cache || { profile: null, sessions: [], journal: [] };
  const i = cache.sessions.findIndex((s) => s.id === session.id);
  if (i >= 0) cache.sessions[i] = session; else cache.sessions.push(session);
  LS.set(key(), cache);
  if (isCloud()) {
    try { const { db, m } = await loadFirebase(); await m.setDoc(m.doc(db, 'users', user.uid, 'sessions', session.id), session); }
    catch (e) { console.warn(e); }
  }
}

export function exportData() {
  return JSON.stringify({ exported: new Date().toISOString(), user: user?.email || 'local', ...cache }, null, 2);
}
export function eraseLocal() {
  LS.del(key()); cache = { profile: null, sessions: [], journal: [] };
}

// ---------- Prescriptions du clinicien ----------
// rx/{code} : programme préparé par un clinicien (aucune donnée nominative du patient)
// rx/{code}/progress/{uidPatient} : résumé que le patient choisit de partager
const ALPHA = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => ALPHA[b % ALPHA.length]).join('');
export const fmtCode = (c) => (c && c.length === 6 ? c.slice(0, 3) + '-' + c.slice(3) : c);
export const cleanCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

const b64e = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64d = (s) => JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));

export async function saveRx(rx) {
  // Avec un compte : code court stocké dans Firestore. Sans compte : tout le programme voyage dans le lien.
  if (!isCloud()) return { code: null, link: `${CONFIG.siteUrl}/#/rx/~${b64e(rx)}` };
  const { db, m } = await loadFirebase();
  const code = rx.code || newCode();
  const data = { ...rx, code, by: user.uid, version: (rx.version || 0) + 1, updated: Date.now() };
  if (!rx.created) data.created = Date.now();
  await m.setDoc(m.doc(db, 'rx', code), data);
  return { code, link: `${CONFIG.siteUrl}/#/rx/${code}`, data };
}

export async function getRx(codeOrPacked) {
  if (String(codeOrPacked).startsWith('~')) return b64d(String(codeOrPacked).slice(1));
  const { db, m } = await loadFirebase();
  const snap = await m.getDoc(m.doc(db, 'rx', cleanCode(codeOrPacked)));
  return snap.exists() ? snap.data() : null;
}

export async function listMyRx() {
  if (!isCloud()) return [];
  const { db, m } = await loadFirebase();
  const qs = await m.getDocs(m.query(m.collection(db, 'rx'), m.where('by', '==', user.uid)));
  const list = qs.docs.map((d) => d.data()).sort((a, b) => (b.updated || 0) - (a.updated || 0));
  for (const rx of list) {
    try {
      const ps = await m.getDocs(m.collection(db, 'rx', rx.code, 'progress'));
      rx.patients = ps.docs.map((d) => d.data());
    } catch (_) { rx.patients = []; }
  }
  return list;
}

export async function pushProgress(code, summary) {
  if (!isCloud() || !code) return;
  try { const { db, m } = await loadFirebase(); await m.setDoc(m.doc(db, 'rx', code, 'progress', user.uid), { ...summary, uid: user.uid, updated: Date.now() }); }
  catch (e) { console.warn('Partage du suivi impossible', e); }
}

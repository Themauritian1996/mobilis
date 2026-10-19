// Comptes (Firebase : Google + courriel) et données (Firestore ou appareil).
import { CONFIG, firebaseEnabled } from './config.js';

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
  del(k) { try { localStorage.removeItem(k); } catch (_) {} },
};

// ---------- Réglages (toujours locaux à l'appareil) ----------
const DEFAULT_SETTINGS = { voice: 'local', countAloud: true, geminiKey: '', sendFrame: false, camera: 'user' };
export const settings = () => ({ ...DEFAULT_SETTINGS, ...LS.get('mobilis.settings', {}) });
export const saveSettings = (patch) => LS.set('mobilis.settings', { ...settings(), ...patch });

// ---------- Authentification ----------
let fb = null; // { app, auth, db, mod }
let user = null;
export const currentUser = () => user;
export const isCloud = () => !!(user && !user.local);

async function loadFirebase() {
  if (fb) return fb;
  const mod = await import('../vendor/firebase.js');
  const authMod = mod, fsMod = mod;
  const app = mod.initializeApp(CONFIG.firebase);
  const auth = authMod.getAuth(app);
  const db = fsMod.getFirestore(app);
  fb = { app, auth, db, authMod, fsMod };
  return fb;
}

export async function initAuth(onChange) {
  const local = LS.get('mobilis.localUser', null);
  if (firebaseEnabled()) {
    try {
      const { auth, authMod } = await loadFirebase();
      try { await authMod.getRedirectResult(auth); } catch (_) {}
      authMod.onAuthStateChanged(auth, (u) => {
        user = u ? { uid: u.uid, email: u.email, name: u.displayName || '' } : local;
        onChange(user);
      });
      return;
    } catch (e) { console.warn('Firebase indisponible, mode local', e); }
  }
  user = local; onChange(user);
}

const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

export async function signInGoogle() {
  const { auth, authMod } = await loadFirebase();
  // APK : connexion Google native (plugin @capacitor-firebase/authentication), puis transfert du jeton au SDK web
  const native = window.Capacitor?.Plugins?.FirebaseAuthentication;
  if (isNative() && native) {
    const res = await native.signInWithGoogle({ skipNativeAuth: true });
    const cred = authMod.GoogleAuthProvider.credential(res.credential?.idToken);
    return authMod.signInWithCredential(auth, cred);
  }
  const provider = new authMod.GoogleAuthProvider();
  try { return await authMod.signInWithPopup(auth, provider); }
  catch (e) {
    if (String(e.code).includes('popup')) return authMod.signInWithRedirect(auth, provider);
    throw e;
  }
}

export async function signInEmail(email, password, create) {
  const { auth, authMod } = await loadFirebase();
  return create ? authMod.createUserWithEmailAndPassword(auth, email, password) : authMod.signInWithEmailAndPassword(auth, email, password);
}

export function signInLocal(onChange) {
  user = { uid: 'local', local: true, name: '' };
  LS.set('mobilis.localUser', user);
  onChange(user);
}

export async function signOut(onChange) {
  if (user && !user.local && fb) await fb.authMod.signOut(fb.auth);
  LS.del('mobilis.localUser');
  user = null; cache = null;
  onChange(null);
}

// ---------- Données ----------
// profil : { name, region, pathology, painBase, irritability, perWeek, startDate, levels:{exId:n}, phase }
// séance : { id, date, checkin, items:[{ id, level, sets:[{plane, reps, full, partial, holdSec, quality, faults}], pain, difficulty, change }] }
let cache = null;
const key = () => `mobilis.data.${user?.uid || 'anon'}`;

export async function loadData() {
  if (cache) return cache;
  cache = LS.get(key(), { profile: null, sessions: [] });
  if (isCloud()) {
    try {
      const { db, fsMod } = await loadFirebase();
      const ref = fsMod.doc(db, 'users', user.uid);
      const snap = await fsMod.getDoc(ref);
      if (snap.exists()) cache.profile = snap.data().profile || cache.profile;
      const qs = await fsMod.getDocs(fsMod.query(fsMod.collection(db, 'users', user.uid, 'sessions'), fsMod.orderBy('date')));
      const remote = qs.docs.map((d) => d.data());
      if (remote.length) cache.sessions = remote;
      LS.set(key(), cache);
    } catch (e) { console.warn('Lecture Firestore impossible, cache local utilisé', e); }
  }
  return cache;
}

export async function saveProfile(profile) {
  cache = cache || { profile: null, sessions: [] };
  cache.profile = profile;
  LS.set(key(), cache);
  if (isCloud()) {
    try { const { db, fsMod } = await loadFirebase(); await fsMod.setDoc(fsMod.doc(db, 'users', user.uid), { profile, updated: Date.now() }, { merge: true }); }
    catch (e) { console.warn(e); }
  }
}

export async function saveSession(session) {
  cache = cache || { profile: null, sessions: [] };
  const i = cache.sessions.findIndex((s) => s.id === session.id);
  if (i >= 0) cache.sessions[i] = session; else cache.sessions.push(session);
  LS.set(key(), cache);
  if (isCloud()) {
    try { const { db, fsMod } = await loadFirebase(); await fsMod.setDoc(fsMod.doc(db, 'users', user.uid, 'sessions', session.id), session); }
    catch (e) { console.warn(e); }
  }
}

export function exportData() {
  return JSON.stringify({ exported: new Date().toISOString(), user: user?.email || 'local', ...cache }, null, 2);
}
export function eraseLocal() {
  LS.del(key()); cache = { profile: null, sessions: [] };
}

// Comptes (Firebase : Google + courriel), données (Firestore ou appareil) et prescriptions clinicien.
import { CONFIG, firebaseEnabled } from './config.js';
import { migrateProfile, migrateSessions, migrateJournal, makeBackup, parseBackup, mergeBackup } from './longterm.js';

const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
  del(k) { try { localStorage.removeItem(k); } catch (_) {} },
};

// ---------- Réglages (locaux à l'appareil) ----------
// Clé Gemini utilisée par l'app : la clé personnelle, sinon l'accès IA partagé par le clinicien (settings().sharedAI).
// sharedAI = { key? | proxy?+token?, from, until?: 'AAAA-MM-JJ', cap?: appels/jour, rxCode? }. Mode relais : aiKey() renvoie PROXY_KEY
// (valeur factice « vraie clé absente ») ; coach.js route alors les appels par le relais au lieu de Google.
export const PROXY_KEY = '@proxy';
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// Accès partagé actif : présent, valide et non expiré (la clé personnelle reste prioritaire ailleurs)
export const sharedAIActive = (s = settings(), today = dayKey()) => {
  const a = s.sharedAI;
  if (!a || (!a.key && !a.proxy)) return null;
  if (a.until && today > a.until) return null;
  return a;
};
const AIUSE = 'mobilis.aiUse';
export const aiUsed = (today = dayKey()) => { const u = LS.get(AIUSE, null); return u && u.day === today ? u.n || 0 : 0; };
export const aiCapReached = (s = settings(), today = dayKey()) => {
  const a = sharedAIActive(s, today);
  return !!(a && a.cap > 0 && !s.geminiKey && aiUsed(today) >= a.cap);
};
// Compte les appels IA du jour (seulement si on consomme l'accès du clinicien)
export function aiCount(n = 1, s = settings(), today = dayKey()) {
  const a = sharedAIActive(s, today);
  if (!a || s.geminiKey) return;
  const used = aiUsed(today) + n;
  LS.set(AIUSE, { day: today, n: used });
  if (a.cap > 0 && used >= a.cap && used - n < a.cap) { try { window.dispatchEvent(new CustomEvent('mobilis:aicap')); } catch (_) {} }
}
export const aiKey = () => {
  const s = settings();
  if (s.geminiKey) return s.geminiKey;
  const a = sharedAIActive(s);
  if (!a || aiCapReached(s)) return ''; // plafond atteint → coach local
  return a.proxy ? PROXY_KEY : a.key || '';
};
// Relais utilisé (si l'accès effectif est un relais)
export const aiProxy = () => { const s = settings(); if (s.geminiKey) return null; const a = sharedAIActive(s); return a && a.proxy && !aiCapReached(s) ? { url: a.proxy, token: a.token || '' } : null; };
// Infos pour l'affichage du profil
export const sharedAIInfo = () => {
  const s = settings(), a = sharedAIActive(s);
  return a ? { from: a.from || '', until: a.until || '', cap: a.cap || 0, used: aiUsed(), mode: a.proxy ? 'proxy' : 'key', personal: !!s.geminiKey, capped: aiCapReached(s) } : null;
};
const okUrl = (u) => { try { return new URL(u).protocol === 'https:'; } catch (_) { return false; } };
// Applique (ou retire) l'accès IA d'un programme du clinicien. Retourne l'accès appliqué ou null.
export function applySharedAI(rx) {
  const a = rx?.ai;
  const valid = a && ((a.mode === 'proxy' && okUrl(a.proxy)) || (a.mode !== 'proxy' && a.key));
  if (!valid) { if (settings().sharedAI) saveSettings({ sharedAI: null }); return null; }
  const cap = Math.max(0, Math.min(1000, Math.round(+a.cap) || 0));
  const sh = { from: String(rx.clinician || '').slice(0, 60), until: /^\d{4}-\d{2}-\d{2}$/.test(a.until || '') ? a.until : '', cap, rxCode: rx.code || null };
  if (a.mode === 'proxy') { sh.proxy = a.proxy; sh.token = String(a.token || '').slice(0, 300); } else sh.key = String(a.key).trim();
  saveSettings({ sharedAI: sh });
  return sh;
}
// imageConsent : null = jamais demandé, true / false = choix du patient (aucune image n'est envoyée à Gemini sans true)
// voiceRate 0,8–1,3 · cueLevel 'all' | 'essential' · textSize 100 | 115 | 130 · weekStart 'auto' | 0 | 1 · webRemind : rappel du navigateur
const DEFAULT_SETTINGS = { voice: 'local', countAloud: true, geminiKey: '', sendFrame: false, camera: 'user', theme: 'auto', anatomy: false, selfView: true, guides: true, vibrate: true, liveAI: false,
  imageConsent: null, voiceRate: 1, cueLevel: 'all', textSize: 100, contrast: false, weekStart: 'auto', webRemind: false };
export const settings = () => ({ ...DEFAULT_SETTINGS, ...LS.get('mobilis.settings', {}) });
export const saveSettings = (patch) => LS.set('mobilis.settings', { ...settings(), ...patch });
// Consentement explicite pour envoyer une image de la caméra à Gemini (Loi 25 / RGPD) : sans « true », aucune image ne quitte l'appareil
export const imageConsent = (s = settings()) => s.imageConsent === true;
export const setImageConsent = (v) => saveSettings({ imageConsent: !!v, ...(v ? {} : { sendFrame: false, liveAI: false }) });
export const clampRate = (v) => { const n = +v; return Number.isFinite(n) ? Math.max(0.8, Math.min(1.3, Math.round(n * 20) / 20)) : 1; };
// Efface la clé Gemini personnelle de cet appareil
export const purgeApiKey = () => saveSettings({ geminiKey: '' });

// ---------- Code clinicien en attente ----------
// #/rx/CODE mémorise le code pour finir l'import après la connexion. Un code introuvable ou injoignable doit toujours être effacé :
// sinon toutes les routes y redirigent (l'app serait bloquée).
const PENDING = 'mobilis.pendingRx';
export const getPendingRx = () => { try { return localStorage.getItem(PENDING); } catch (_) { return null; } };
export const setPendingRx = (c) => { try { localStorage.setItem(PENDING, c); } catch (_) {} };
export const clearPendingRx = () => { try { localStorage.removeItem(PENDING); } catch (_) {} };
const NET_CODES = new Set(['unavailable', 'deadline-exceeded', 'failed-precondition', 'network-request-failed', 'resource-exhausted', 'cancelled']);
export function isNetworkError(e) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const c = String(e?.code || '').replace(/^firestore\//, '');
  if (NET_CODES.has(c)) return true;
  return e instanceof TypeError || /network|offline|fetch|timeout|failed to load|importing a module/i.test(String(e?.message || ''));
}
/** → { rx } | { error: 'notfound' | 'network' } ; en cas d'échec, le code en attente est effacé. */
export async function lookupRx(code, getter = getRx, timeoutMs = 12000) {
  let tm;
  try {
    const rx = await Promise.race([getter(code), new Promise((_, rej) => { tm = setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'deadline-exceeded' })), timeoutMs); })]);
    clearTimeout(tm);
    if (rx) return { rx };
    clearPendingRx(); return { error: 'notfound' };
  } catch (e) {
    clearTimeout(tm);
    clearPendingRx(); return { error: isNetworkError(e) ? 'network' : 'notfound', cause: e };
  }
}

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
  // Anciens profils / séances : champs manquants complétés (rien n'est supprimé)
  cache.profile = migrateProfile(cache.profile);
  cache.sessions = migrateSessions(cache.sessions);
  cache.journal = migrateJournal(cache.journal);
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

// Sauvegarde (fichier JSON) : profil + séances + journal, sans clé ni jeton
export function exportData() {
  return makeBackup({ ...cache, user: user?.email || 'local' });
}
// Restauration : fusionne dans les données actuelles (séances par id, journal par jour). Retourne { sessions, journal, profile }.
export async function importData(text, { replaceProfile = false } = {}) {
  const bk = parseBackup(text);
  await loadData();
  const merged = mergeBackup(cache, bk, { replaceProfile });
  const before = cache.sessions.length;
  cache.profile = merged.profile; cache.sessions = merged.sessions; cache.journal = merged.journal;
  LS.set(key(), cache);
  if (isCloud()) {
    await saveUserDoc({ profile: cache.profile, journal: cache.journal });
    for (const s of cache.sessions) { try { const { db, m } = await loadFirebase(); await m.setDoc(m.doc(db, 'users', user.uid, 'sessions', s.id), s); } catch (e) { console.warn(e); break; } }
  }
  return { sessions: cache.sessions.length - before, journal: bk.journal.length, profile: !!cache.profile };
}
// Efface TOUT ce que l'app garde sur cet appareil : données, réglages (clé Gemini personnelle, accès IA partagé du clinicien),
// programmes préparés par le clinicien (myRx), langue du coach IA, compteur d'appels IA, code en attente, rappels.
export const LOCAL_KEYS = ['mobilis.settings', 'mobilis.myRx', 'mobilis.aiLang', 'mobilis.aiUse', 'mobilis.pendingRx', 'mobilis.remindDay'];
export function eraseLocal() {
  LS.del(key()); cache = { profile: null, sessions: [], journal: [] };
  for (const k of LOCAL_KEYS) LS.del(k);
  try { sessionStorage.removeItem('mobilis.rxCheck'); } catch (_) {}
}
// Compte en ligne : supprime profil, séances, journal, suivi partagé avec le clinicien (et les programmes que ce compte a créés), puis efface l'appareil.
// Retourne le nombre de documents supprimés. Lève une erreur si le réseau échoue (rien n'est alors effacé localement).
export async function deleteCloudData() {
  if (!isCloud()) { eraseLocal(); return 0; }
  const { db, m } = await loadFirebase();
  let n = 0;
  const code = cache?.profile?.rxCode;
  if (code) { try { await m.deleteDoc(m.doc(db, 'rx', code, 'progress', user.uid)); n++; } catch (e) { if (isNetworkError(e)) throw e; } }
  const qs = await m.getDocs(m.collection(db, 'users', user.uid, 'sessions'));
  for (const d of qs.docs) { await m.deleteDoc(d.ref); n++; }
  try {
    const mine = await m.getDocs(m.query(m.collection(db, 'rx'), m.where('by', '==', user.uid)));
    for (const d of mine.docs) {
      try { const ps = await m.getDocs(m.collection(db, 'rx', d.id, 'progress')); for (const p of ps.docs) { await m.deleteDoc(p.ref); n++; } } catch (_) {}
      await m.deleteDoc(d.ref); n++;
    }
  } catch (e) { if (isNetworkError(e)) throw e; }
  await m.deleteDoc(m.doc(db, 'users', user.uid)); n++;
  eraseLocal();
  return n;
}
// Supprime une séance / une entrée du journal (appareil + compte)
export async function deleteSession(id) {
  cache = cache || { profile: null, sessions: [], journal: [] };
  cache.sessions = cache.sessions.filter((s) => s.id !== id);
  LS.set(key(), cache);
  if (isCloud()) { try { const { db, m } = await loadFirebase(); await m.deleteDoc(m.doc(db, 'users', user.uid, 'sessions', id)); } catch (e) { console.warn(e); } }
}
export async function deleteJournal(day) {
  cache.journal = (cache.journal || []).filter((j) => j.day !== day);
  LS.set(key(), cache);
  await saveUserDoc({ journal: cache.journal });
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

// Lien patient : la langue choisie par le clinicien suit le lien (affichée dès la page de connexion)
export const rxLink = (ref, lang) => `${CONFIG.siteUrl}/#/rx/${ref}${lang ? '/' + lang : ''}`;
const LOCAL_RX = 'mobilis.myRx';
const localRxList = () => { try { return JSON.parse(localStorage.getItem(LOCAL_RX) || '[]'); } catch (_) { return []; } };

// Accès IA partagé d'un programme : on ne garde que les champs connus. Mode « key » : la clé voyage dans le programme.
export function cleanAI(a) {
  if (!a || !a.mode) return null;
  const cap = Math.max(0, Math.min(1000, Math.round(+a.cap) || 0));
  const o = { mode: a.mode === 'proxy' ? 'proxy' : 'key', cap, until: /^\d{4}-\d{2}-\d{2}$/.test(a.until || '') ? a.until : '' };
  if (o.mode === 'proxy') { o.proxy = String(a.proxy || '').trim(); o.token = String(a.token || '').trim(); if (!o.proxy) return null; }
  else { o.key = String(a.key || '').trim(); if (!o.key) return null; }
  return o;
}
// Canal de partage : avec un compte, le programme est stocké (Firestore) et le lien ne porte que le code → la clé ne figure jamais dans l'URL.
// Sans compte, tout le programme est dans le lien : une clé partagée y serait lisible (avertissement au clinicien).
export const rxShareInfo = (rx, cloud) => ({ channel: cloud ? 'code' : 'link', keyInLink: !cloud && !!(rx?.ai && rx.ai.mode !== 'proxy' && rx.ai.key) });

export async function saveRx(rx) {
  rx = { ...rx, ai: cleanAI(rx.ai) };
  // Avec un compte : code court stocké dans Firestore. Sans compte : tout le programme voyage dans le lien
  // (et une copie reste sur l'appareil du clinicien pour le renvoyer ou le tester).
  if (!isCloud()) {
    const id = rx.localId || 'L' + Date.now().toString(36);
    const data = { ...rx, code: null, localId: id, version: (rx.version || 0) + 1, updated: Date.now(), created: rx.created || Date.now() };
    const packed = '~' + b64e({ ...data, localId: undefined });
    data.packed = packed;
    try { localStorage.setItem(LOCAL_RX, JSON.stringify([data, ...localRxList().filter((x) => x.localId !== id)].slice(0, 50))); } catch (_) {}
    return { code: null, link: rxLink(packed, rx.lang), data, ...rxShareInfo(data, false) };
  }
  const { db, m } = await loadFirebase();
  const code = rx.code || newCode();
  const data = { ...rx, code, by: user.uid, version: (rx.version || 0) + 1, updated: Date.now() };
  if (!rx.created) data.created = Date.now();
  await m.setDoc(m.doc(db, 'rx', code), data);
  return { code, link: rxLink(code, rx.lang), data, ...rxShareInfo(data, true) };
}

export async function getRx(codeOrPacked) {
  if (String(codeOrPacked).startsWith('~')) return b64d(String(codeOrPacked).slice(1));
  const { db, m } = await loadFirebase();
  const snap = await m.getDoc(m.doc(db, 'rx', cleanCode(codeOrPacked)));
  return snap.exists() ? snap.data() : null;
}

// Gestion des programmes : archiver (sans changer la version, donc sans notifier les patients), supprimer, dupliquer
const writeLocalRx = (list) => { try { localStorage.setItem(LOCAL_RX, JSON.stringify(list)); } catch (_) {} };
export async function setRxArchived(rx, archived) {
  if (rx.code && isCloud()) { const { db, m } = await loadFirebase(); await m.setDoc(m.doc(db, 'rx', rx.code), { archived: !!archived }, { merge: true }); return; }
  writeLocalRx(localRxList().map((x) => (x.localId === rx.localId ? { ...x, archived: !!archived } : x)));
}
export async function deleteRx(rx) {
  if (rx.code && isCloud()) { const { db, m } = await loadFirebase(); await m.deleteDoc(m.doc(db, 'rx', rx.code)); return; }
  writeLocalRx(localRxList().filter((x) => x.localId !== rx.localId));
}
// Copie d'un programme (nouveau code ou nouveau lien) : jamais envoyée avant que le clinicien la partage
export async function duplicateRx(rx, suffix = '') {
  const { code, localId, packed, version, created, updated, by, archived, patients, ...rest } = rx;
  return saveRx({ ...rest, label: ((rx.label || '') + suffix).trim(), version: 0, created: null });
}
export const getLocalRx = (id) => localRxList().find((x) => x.localId === id) || null;
export async function listMyRx() {
  if (!isCloud()) return localRxList().map((x) => ({ ...x, patients: [] }));
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

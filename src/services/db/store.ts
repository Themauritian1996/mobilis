// Comptes (Firebase : Google + courriel), données (Firestore ou appareil) et prescriptions clinicien.
// Façade de v1.15 (www/js/store.js) : mêmes fonctions publiques, qui délèguent aux adaptateurs
// (services/auth/firebase, services/db/firebase, services/db/local, platform/files).
import { CONFIG, firebaseEnabled } from '../../platform/assets.ts';
import { cap, isNative, listenNativeAuthReturn, openExternal } from '../../platform/files.ts';
// Racine de composition de la façade v1.15 : seul fichier hors des dossiers firebase/ qui assemble les adaptateurs
// (disparaît à l'intégration, quand src/main.ts fait l'assemblage).
// eslint-disable-next-line no-restricted-imports
import { createFirebaseAuth, createFirebaseLoader } from '../auth/firebase/index.ts';
// eslint-disable-next-line no-restricted-imports
import { createLegacyCloudRepo, type CloudDoc } from './firebase/index.ts';
import { isNetworkError } from './errors.ts';
import { LS } from './local/local-store.ts';
import {
  makeBackup,
  mergeBackup,
  migrateJournal,
  migrateProfile,
  migrateSessions,
  parseBackup,
} from './local/migrations.ts';
import { clearPendingRx, type RxAi } from './local/settings.ts';
import type { StoredData, StoredJournalEntry, StoredProfile, StoredSession } from './local/stored.ts';

export * from './local/settings.ts';
export { cap, isNative, isNetworkError };

/** Utilisateur courant : compte en ligne ou compte local (`local: true`). */
export interface AppUser {
  uid: string;
  email?: string | null | undefined;
  name: string;
  local?: boolean | undefined;
}

const fbLoad = createFirebaseLoader(CONFIG.firebase);
const fbAuth = createFirebaseAuth(fbLoad);
const cloud = createLegacyCloudRepo(fbLoad);

// ---------- Authentification ----------
let user: AppUser | null = null;
export const currentUser = (): AppUser | null => user;
export const isCloud = (): boolean => !!(user && !user.local);

export async function initAuth(onChange: (u: AppUser | null) => void): Promise<void> {
  const local = LS.get<AppUser | null>('mobilis.localUser', null);
  if (firebaseEnabled()) {
    try {
      fbAuth.onChange((u) => {
        user = u ? { uid: u.uid, email: u.email, name: u.displayName || '' } : local;
        cache = null;
        onChange(user);
      });
      await fbAuth.start(() => {
        if (isNative())
          void listenNativeAuthReturn((idToken) => fbAuth.signInWithIdToken(idToken).then(() => undefined));
      });
      return;
    } catch (e) {
      console.warn('Firebase indisponible, mode local', e);
    }
  }
  user = local;
  onChange(user);
}

export async function signInGoogle(): Promise<unknown> {
  await fbLoad();
  if (isNative()) {
    await openExternal(`${CONFIG.siteUrl}/auth.html?app=1&lang=${document.documentElement.lang || 'fr'}`);
    return;
  }
  return fbAuth.signInGoogleWeb();
}

export const signInEmail = (email: string, password: string, create?: boolean): Promise<unknown> =>
  fbAuth.signInEmail(email, password, !!create);
export const resetPassword = (email: string): Promise<unknown> => fbAuth.resetPassword(email);

export function signInLocal(onChange: (u: AppUser | null) => void): void {
  user = { uid: 'local', local: true, name: '' };
  LS.set('mobilis.localUser', user);
  onChange(user);
}

export async function signOut(onChange: (u: AppUser | null) => void): Promise<void> {
  if (user && !user.local && fbLoad.loaded()) await fbAuth.signOut();
  LS.del('mobilis.localUser');
  user = null;
  cache = null;
  onChange(null);
}

// ---------- Données du patient ----------
type Cache = StoredData & Record<string, unknown>;
let cache: Cache | null = null;
const key = (): string => `mobilis.data.${user?.uid || 'anon'}`;
const emptyCache = (): Cache => ({ profile: null, sessions: [], journal: [] });

export async function loadData(): Promise<Cache> {
  if (cache) return cache;
  const c: Cache = (cache = LS.get<Cache>(key(), emptyCache()));
  c.journal = c.journal || [];
  if (isCloud()) {
    try {
      const { user: d, sessions: remote } = await cloud.readUser((user as AppUser).uid);
      if (d) {
        c.profile = (d['profile'] as StoredProfile) || c.profile;
        c.journal = (d['journal'] as StoredJournalEntry[]) || c.journal;
      }
      if (remote.length) c.sessions = remote as unknown as StoredSession[];
      LS.set(key(), c);
    } catch (e) {
      console.warn('Lecture Firestore impossible, cache local utilisé', e);
    }
  }
  // Anciens profils / séances : champs manquants complétés (rien n'est supprimé)
  c.profile = migrateProfile(c.profile);
  c.sessions = migrateSessions(c.sessions);
  c.journal = migrateJournal(c.journal);
  return c;
}

async function saveUserDoc(patch: CloudDoc): Promise<void> {
  if (!isCloud()) return;
  try {
    await cloud.mergeUser((user as AppUser).uid, patch);
  } catch (e) {
    console.warn(e);
  }
}

export async function saveProfile(profile: StoredProfile): Promise<void> {
  cache = cache || emptyCache();
  cache.profile = profile;
  LS.set(key(), cache);
  await saveUserDoc({ profile });
}

export async function saveJournal(entry: StoredJournalEntry): Promise<void> {
  const c = cache as Cache;
  c.journal = (c.journal || [])
    .filter((j) => j.day !== entry.day)
    .concat(entry)
    .slice(-400);
  LS.set(key(), c);
  await saveUserDoc({ journal: c.journal });
}

export async function saveSession(session: StoredSession): Promise<void> {
  cache = cache || emptyCache();
  const i = cache.sessions.findIndex((s) => s.id === session.id);
  if (i >= 0) cache.sessions[i] = session;
  else cache.sessions.push(session);
  LS.set(key(), cache);
  if (isCloud()) {
    try {
      await cloud.putSession((user as AppUser).uid, session as CloudDoc & { id: string });
    } catch (e) {
      console.warn(e);
    }
  }
}

// Sauvegarde (fichier JSON) : profil + séances + journal, sans clé ni jeton
export function exportData(): string {
  return makeBackup({ ...cache, user: user?.email || 'local' });
}
// Restauration : fusionne dans les données actuelles (séances par id, journal par jour). Retourne { sessions, journal, profile }.
export async function importData(
  text: string,
  { replaceProfile = false }: { replaceProfile?: boolean } = {},
): Promise<{ sessions: number; journal: number; profile: boolean }> {
  const bk = parseBackup(text);
  await loadData();
  const c = cache as Cache;
  const merged = mergeBackup(c, bk, { replaceProfile });
  const before = c.sessions.length;
  c.profile = merged.profile;
  c.sessions = merged.sessions;
  c.journal = merged.journal;
  LS.set(key(), c);
  if (isCloud()) {
    await saveUserDoc({ profile: c.profile, journal: c.journal });
    for (const s of c.sessions) {
      try {
        await cloud.putSession((user as AppUser).uid, s as CloudDoc & { id: string });
      } catch (e) {
        console.warn(e);
        break;
      }
    }
  }
  return { sessions: c.sessions.length - before, journal: bk.journal.length, profile: !!c.profile };
}
// Efface TOUT ce que l'app garde sur cet appareil : données, réglages (clé Gemini personnelle, accès IA partagé du clinicien),
// programmes préparés par le clinicien (myRx), langue du coach IA, compteur d'appels IA, code en attente, rappels.
export const LOCAL_KEYS = [
  'mobilis.settings',
  'mobilis.myRx',
  'mobilis.aiLang',
  'mobilis.aiUse',
  'mobilis.pendingRx',
  'mobilis.remindDay',
];
export function eraseLocal(): void {
  LS.del(key());
  cache = emptyCache();
  for (const k of LOCAL_KEYS) LS.del(k);
  try {
    sessionStorage.removeItem('mobilis.rxCheck');
  } catch {
    /* stockage de session indisponible */
  }
}
// Compte en ligne : supprime profil, séances, journal, suivi partagé avec le clinicien (et les programmes que ce compte a créés), puis efface l'appareil.
// Retourne le nombre de documents supprimés. Lève une erreur si le réseau échoue (rien n'est alors effacé localement).
export async function deleteCloudData(): Promise<number> {
  if (!isCloud()) {
    eraseLocal();
    return 0;
  }
  const code = (cache?.profile as StoredProfile | null | undefined)?.rxCode;
  const n = await cloud.deleteAccount((user as AppUser).uid, code);
  eraseLocal();
  return n;
}
// Supprime une séance / une entrée du journal (appareil + compte)
export async function deleteSession(id: string | number): Promise<void> {
  cache = cache || emptyCache();
  cache.sessions = cache.sessions.filter((s) => s.id !== id);
  LS.set(key(), cache);
  if (isCloud()) {
    try {
      await cloud.removeSession((user as AppUser).uid, String(id));
    } catch (e) {
      console.warn(e);
    }
  }
}
export async function deleteJournal(day: string): Promise<void> {
  const c = cache as Cache;
  c.journal = (c.journal || []).filter((j) => j.day !== day);
  LS.set(key(), c);
  await saveUserDoc({ journal: c.journal });
}

// ---------- Code clinicien : recherche avec délai ----------
/** → { rx } | { error: 'notfound' | 'network' } ; en cas d'échec, le code en attente est effacé. */
export async function lookupRx(
  code: string,
  getter: (code: string) => Promise<CloudDoc | null> = getRx,
  timeoutMs = 12000,
): Promise<{ rx: CloudDoc } | { error: 'notfound' | 'network'; cause?: unknown }> {
  let tm: ReturnType<typeof setTimeout> | undefined;
  try {
    const rx = await Promise.race([
      getter(code),
      new Promise<never>((_, rej) => {
        tm = setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'deadline-exceeded' })), timeoutMs);
      }),
    ]);
    clearTimeout(tm);
    if (rx) return { rx };
    clearPendingRx();
    return { error: 'notfound' };
  } catch (e) {
    clearTimeout(tm);
    clearPendingRx();
    return { error: isNetworkError(e) ? 'network' : 'notfound', cause: e };
  }
}

// ---------- Prescriptions du clinicien ----------
// rx/{code} : programme préparé par un clinicien (aucune donnée nominative du patient)
// rx/{code}/progress/{uidPatient} : résumé que le patient choisit de partager
const ALPHA = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const newCode = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => ALPHA[b % ALPHA.length]).join('');
export const fmtCode = (c: string | null | undefined): string | null | undefined =>
  c && c.length === 6 ? c.slice(0, 3) + '-' + c.slice(3) : c;
export const cleanCode = (c: unknown): string =>
  String(c || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

const b64e = (o: unknown): string =>
  btoa(unescape(encodeURIComponent(JSON.stringify(o))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
const b64d = (s: string): CloudDoc =>
  JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))));

// Lien patient : la langue choisie par le clinicien suit le lien (affichée dès la page de connexion)
export const rxLink = (ref: string, lang?: string | null): string =>
  `${CONFIG.siteUrl}/#/rx/${ref}${lang ? '/' + lang : ''}`;
const LOCAL_RX = 'mobilis.myRx';
type LocalRx = CloudDoc & { localId?: string };
const localRxList = (): LocalRx[] => {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_RX) || '[]') as LocalRx[];
  } catch {
    return [];
  }
};

/** Programme du clinicien tel que manipulé par l'éditeur (champs connus ; les autres sont conservés). */
export interface Rx {
  ai?: RxAi | null | undefined;
  localId?: string | undefined;
  code?: string | null | undefined;
  version?: number | undefined;
  created?: number | null | undefined;
  updated?: number | undefined;
  lang?: string | undefined;
  label?: string | undefined;
  archived?: boolean | undefined;
  [key: string]: unknown;
}

// Accès IA partagé d'un programme : on ne garde que les champs connus. Mode « key » : la clé voyage dans le programme.
export function cleanAI(a: RxAi | null | undefined): RxAi | null {
  if (!a || !a.mode) return null;
  const cap = Math.max(0, Math.min(1000, Math.round(+(a.cap as number)) || 0));
  const o: RxAi = {
    mode: a.mode === 'proxy' ? 'proxy' : 'key',
    cap,
    until: /^\d{4}-\d{2}-\d{2}$/.test(a.until || '') ? a.until : '',
  };
  if (o.mode === 'proxy') {
    o.proxy = String(a.proxy || '').trim();
    o.token = String(a.token || '').trim();
    if (!o.proxy) return null;
  } else {
    o.key = String(a.key || '').trim();
    if (!o.key) return null;
  }
  return o;
}
// Canal de partage : avec un compte, le programme est stocké (Firestore) et le lien ne porte que le code → la clé ne figure jamais dans l'URL.
// Sans compte, tout le programme est dans le lien : une clé partagée y serait lisible (avertissement au clinicien).
export const rxShareInfo = (
  rx: { ai?: RxAi | null | undefined } | null | undefined,
  cloudMode: boolean,
): { channel: 'code' | 'link'; keyInLink: boolean } => ({
  channel: cloudMode ? 'code' : 'link',
  keyInLink: !cloudMode && !!(rx?.ai && rx.ai.mode !== 'proxy' && rx.ai.key),
});

export async function saveRx(rx: Rx) {
  rx = { ...rx, ai: cleanAI(rx.ai) };
  // Avec un compte : code court stocké dans Firestore. Sans compte : tout le programme voyage dans le lien
  // (et une copie reste sur l'appareil du clinicien pour le renvoyer ou le tester).
  if (!isCloud()) {
    const id = rx.localId || 'L' + Date.now().toString(36);
    const data: Rx = {
      ...rx,
      code: null,
      localId: id,
      version: (rx.version || 0) + 1,
      updated: Date.now(),
      created: rx.created || Date.now(),
    };
    const packed = '~' + b64e({ ...data, localId: undefined });
    data['packed'] = packed;
    try {
      localStorage.setItem(
        LOCAL_RX,
        JSON.stringify([data, ...localRxList().filter((x) => x.localId !== id)].slice(0, 50)),
      );
    } catch {
      /* stockage indisponible */
    }
    return { code: null, link: rxLink(packed, rx.lang), data, ...rxShareInfo(data, false) };
  }
  const code = rx.code || newCode();
  const data: Rx = { ...rx, code, by: (user as AppUser).uid, version: (rx.version || 0) + 1, updated: Date.now() };
  if (!rx.created) data.created = Date.now();
  await cloud.putRx(code, data);
  return { code, link: rxLink(code, rx.lang), data, ...rxShareInfo(data, true) };
}

export async function getRx(codeOrPacked: string): Promise<CloudDoc | null> {
  if (String(codeOrPacked).startsWith('~')) return b64d(String(codeOrPacked).slice(1));
  return cloud.getRx(cleanCode(codeOrPacked));
}

// Gestion des programmes : archiver (sans changer la version, donc sans notifier les patients), supprimer, dupliquer
const writeLocalRx = (list: unknown[]): void => {
  try {
    localStorage.setItem(LOCAL_RX, JSON.stringify(list));
  } catch {
    /* stockage indisponible */
  }
};
export async function setRxArchived(rx: Rx, archived: boolean): Promise<void> {
  if (rx.code && isCloud()) {
    await cloud.patchRx(rx.code, { archived: !!archived });
    return;
  }
  writeLocalRx(localRxList().map((x) => (x.localId === rx.localId ? { ...x, archived: !!archived } : x)));
}
export async function deleteRx(rx: Rx): Promise<void> {
  if (rx.code && isCloud()) {
    await cloud.removeRx(rx.code);
    return;
  }
  writeLocalRx(localRxList().filter((x) => x.localId !== rx.localId));
}
// Copie d'un programme (nouveau code ou nouveau lien) : jamais envoyée avant que le clinicien la partage
export async function duplicateRx(rx: Rx, suffix = '') {
  const { code, localId, packed, version, created, updated, by, archived, patients, ...rest } = rx;
  void [code, localId, packed, version, created, updated, by, archived, patients];
  return saveRx({ ...rest, label: ((rx.label || '') + suffix).trim(), version: 0, created: null });
}
export const getLocalRx = (id: string): LocalRx | null => localRxList().find((x) => x.localId === id) || null;
export async function listMyRx(): Promise<CloudDoc[]> {
  if (!isCloud()) return localRxList().map((x) => ({ ...x, patients: [] }));
  return cloud.listRx((user as AppUser).uid);
}

export async function pushProgress(code: string | null | undefined, summary: CloudDoc): Promise<void> {
  if (!isCloud() || !code) return;
  try {
    await cloud.putProgress(code, (user as AppUser).uid, summary);
  } catch (e) {
    console.warn('Partage du suivi impossible', e);
  }
}

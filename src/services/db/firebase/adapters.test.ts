import { describe, expect, it, vi } from 'vitest';
import { createFirebaseAuth, createFirebaseLoader, type FirebaseSdk } from '../../auth/firebase/index.ts';
import { createFirestoreDatabase, createLegacyCloudRepo } from './index.ts';
import type { FsDocSnap } from '../../auth/firebase/sdk.ts';

/** Faux SDK Firebase : Firestore en mémoire (chemin → document), aucun appel réseau. */
function fakeSdk() {
  const store = new Map<string, Record<string, unknown>>();
  const calls: string[] = [];
  let authCb: ((u: { uid: string; email: string | null; displayName: string | null } | null) => void) | null = null;
  const path = (p: string[]): string => p.join('/');
  const snap = (p: string): FsDocSnap => ({
    exists: () => store.has(p),
    data: () => ({ ...store.get(p) }),
    ref: p,
    id: p.split('/').pop() as string,
  });
  const colDocs = (base: string): FsDocSnap[] =>
    [...store.keys()].filter((k) => k.startsWith(base + '/') && !k.slice(base.length + 1).includes('/')).map(snap);
  const sdk = {
    initializeApp: vi.fn(() => ({ app: true })),
    getAuth: () => ({ auth: true }),
    getFirestore: () => ({ db: true }),
    onAuthStateChanged: (_a: unknown, cb: typeof authCb) => {
      authCb = cb;
      return () => undefined;
    },
    getRedirectResult: async () => null,
    GoogleAuthProvider: Object.assign(
      class {
        setCustomParameters(): void {
          /* simulé */
        }
      },
      { credential: (t: string) => ({ token: t }) },
    ),
    signInWithCredential: async (_a: unknown, c: unknown) => (calls.push('credential'), c),
    signInWithPopup: async () => ({ user: { uid: 'u1', email: 'a@b.c', displayName: 'A' } }),
    signInWithRedirect: async () => (calls.push('redirect'), undefined),
    createUserWithEmailAndPassword: async () => (calls.push('create'), {}),
    signInWithEmailAndPassword: async () => (calls.push('email'), {}),
    sendPasswordResetEmail: async () => (calls.push('reset'), {}),
    signOut: async () => void calls.push('signout'),
    doc: (_db: unknown, ...p: string[]) => path(p),
    collection: (_db: unknown, ...p: string[]) => ({ col: path(p) }),
    getDoc: async (ref: unknown) => snap(ref as string),
    setDoc: async (ref: unknown, data: unknown, opt?: { merge: boolean }) => {
      const p = ref as string;
      store.set(p, opt?.merge ? { ...store.get(p), ...(data as object) } : { ...(data as object) });
    },
    getDocs: async (q: unknown) => {
      const base = (q as { col?: string; base?: string }).col ?? (q as { base: string }).base;
      return { docs: colDocs(base) };
    },
    deleteDoc: async (ref: unknown) => void store.delete(ref as string),
    query: (base: { col: string }, ...c: { where?: [string, string, unknown] }[]) => ({ base: base.col, c }),
    orderBy: (f: string) => ({ orderBy: f }),
    where: (f: string, op: string, v: unknown) => ({ where: [f, op, v] }),
  };
  return {
    sdk: sdk as unknown as FirebaseSdk,
    store,
    calls,
    fire: (u: Parameters<NonNullable<typeof authCb>>[0]) => authCb?.(u),
  };
}

const config = { apiKey: 'k', authDomain: 'd', projectId: 'p', appId: 'a' };

describe('adaptateur Firebase Auth (SDK simulé)', () => {
  it('charge Firebase une seule fois et suit les changements', async () => {
    const f = fakeSdk();
    const load = createFirebaseLoader(config, async () => f.sdk);
    const auth = createFirebaseAuth(load);
    const seen = vi.fn();
    auth.onChange(seen);
    expect(load.loaded()).toBe(false);
    const before = vi.fn();
    await auth.start(before);
    await auth.start(before);
    expect(f.sdk.initializeApp).toHaveBeenCalledTimes(1);
    expect(before).toHaveBeenCalledTimes(1);
    f.fire({ uid: 'u1', email: 'a@b.c', displayName: 'A' });
    expect(seen).toHaveBeenLastCalledWith({ uid: 'u1', email: 'a@b.c', displayName: 'A' });
    expect(auth.currentUser()?.uid).toBe('u1');
    f.fire(null);
    expect(auth.currentUser()).toBeNull();
  });

  it('connexion Google, courriel, jeton d’APK, réinitialisation, déconnexion', async () => {
    const f = fakeSdk();
    const auth = createFirebaseAuth(createFirebaseLoader(config, async () => f.sdk));
    await expect(auth.signIn('anonymous')).rejects.toThrow(/non prise en charge/);
    expect((await auth.signIn('google')).uid).toBe('u1');
    await auth.signInEmail('a@b.c', 'pw', true);
    await auth.signInEmail('a@b.c', 'pw', false);
    await auth.signInWithIdToken('tok');
    await auth.resetPassword('a@b.c');
    await auth.signOut();
    expect(f.calls).toEqual(['create', 'email', 'credential', 'reset', 'signout']);
  });

  it('déconnexion sans Firebase chargé : rien à faire', async () => {
    const f = fakeSdk();
    const auth = createFirebaseAuth(createFirebaseLoader(config, async () => f.sdk));
    await auth.signOut();
    expect(f.calls).toEqual([]);
  });
});

describe('adaptateur Firestore (SDK simulé)', () => {
  it('DatabasePort : set / get / query / remove', async () => {
    const f = fakeSdk();
    const db = createFirestoreDatabase(createFirebaseLoader(config, async () => f.sdk));
    const doc = { schemaVersion: 1, id: 'p1' } as never;
    await db.set('patients', 'p1', doc);
    expect(await db.get('patients', 'p1')).toEqual(doc);
    expect(await db.get('patients', 'nope')).toBeNull();
    expect(await db.query('patients')).toHaveLength(1);
    await db.remove('patients', 'p1');
    expect(await db.get('patients', 'p1')).toBeNull();
  });

  it('documents v1.15 : formes users/rx inchangées', async () => {
    const f = fakeSdk();
    const repo = createLegacyCloudRepo(createFirebaseLoader(config, async () => f.sdk));
    await repo.mergeUser('u1', { profile: { phase: 2 } });
    expect(f.store.get('users/u1')).toMatchObject({ profile: { phase: 2 } });
    expect(typeof f.store.get('users/u1')!['updated']).toBe('number');
    await repo.putSession('u1', { id: 's1', date: 1 });
    expect(f.store.get('users/u1/sessions/s1')).toEqual({ id: 's1', date: 1 });
    const read = await repo.readUser('u1');
    expect(read.user).toMatchObject({ profile: { phase: 2 } });
    expect(read.sessions).toEqual([{ id: 's1', date: 1 }]);
    await repo.putRx('ABC234', { code: 'ABC234', by: 'u1' });
    await repo.putProgress('ABC234', 'u1', { pain7: 2 });
    expect(f.store.get('rx/ABC234/progress/u1')).toMatchObject({ pain7: 2, uid: 'u1' });
    expect(await repo.getRx('ABC234')).toEqual({ code: 'ABC234', by: 'u1' });
    await repo.patchRx('ABC234', { archived: true });
    expect(f.store.get('rx/ABC234')).toMatchObject({ archived: true, by: 'u1' });
  });

  it('suppression du compte : séances, suivi, programmes et profil', async () => {
    const f = fakeSdk();
    const repo = createLegacyCloudRepo(createFirebaseLoader(config, async () => f.sdk));
    await repo.mergeUser('u1', { profile: {} });
    await repo.putSession('u1', { id: 's1' });
    await repo.putSession('u1', { id: 's2' });
    await repo.putRx('ABC234', { code: 'ABC234', by: 'u1' });
    await repo.putProgress('ABC234', 'u9', { x: 1 });
    await repo.putProgress('ABC234', 'u1', { x: 1 });
    const n = await repo.deleteAccount('u1', 'ABC234');
    expect(n).toBe(1 + 2 + 1 + 1 + 1); // suivi du patient, 2 séances, suivi reçu, programme, profil
    expect([...f.store.keys()]).toEqual([]);
  });
});

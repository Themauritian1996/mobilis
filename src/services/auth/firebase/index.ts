/**
 * Adaptateur Firebase Auth — SEUL endroit (avec les autres services/*\/firebase) autorisé à importer Firebase
 * (règle dependency-cruiser `firebase-only-in-adapters`). Reprend le code d'authentification de www/js/store.js (v1.15) :
 * Google (fenêtre, sinon redirection), courriel + mot de passe, jeton Google renvoyé par le navigateur de l'APK.
 */
import { AppError } from '../../../core/errors.ts';
import type { Unsubscribe } from '../../../core/events.ts';
import type { AuthPort, AuthProvider, AuthUser } from '../port.ts';
import type { FbError, FbUser, FirebaseLoader } from './sdk.ts';

export { createFirebaseLoader, importVendorFirebase } from './sdk.ts';
export type { FirebaseHandle, FirebaseLoader, FirebaseSdk, FirebaseWebConfig } from './sdk.ts';

const toAuthUser = (u: FbUser): AuthUser => ({ uid: u.uid, displayName: u.displayName, email: u.email });

/** Port d'authentification + les opérations propres à Firebase dont l'app a besoin (courriel, jeton d'APK). */
export interface FirebaseAuth extends AuthPort {
  /** Charge Firebase, termine une redirection éventuelle et s'abonne aux changements. Lève si Firebase est indisponible. */
  start(beforeSubscribe?: () => void): Promise<void>;
  /** Connexion Google sur le web (fenêtre ; redirection si la fenêtre est bloquée). */
  signInGoogleWeb(): Promise<unknown>;
  /** Connexion avec le jeton Google renvoyé par la page de connexion ouverte dans le navigateur de l'APK. */
  signInWithIdToken(idToken: string): Promise<unknown>;
  signInEmail(email: string, password: string, create: boolean): Promise<unknown>;
  resetPassword(email: string): Promise<unknown>;
}

export function createFirebaseAuth(load: FirebaseLoader): FirebaseAuth {
  const subs = new Set<(u: AuthUser | null) => void>();
  let current: AuthUser | null = null;
  let started: Promise<void> | null = null;

  const emit = (u: FbUser | null): void => {
    current = u ? toAuthUser(u) : null;
    for (const cb of subs) cb(current);
  };
  const start = (beforeSubscribe?: () => void): Promise<void> => {
    started ??= (async () => {
      const { auth, m } = await load();
      try {
        await m.getRedirectResult(auth);
      } catch {
        /* pas de redirection en cours */
      }
      beforeSubscribe?.();
      m.onAuthStateChanged(auth, emit);
    })().catch((e: unknown) => {
      started = null;
      throw e;
    });
    return started;
  };
  const googleWeb = async (): Promise<unknown> => {
    const { auth, m } = await load();
    const provider = new m.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      return await m.signInWithPopup(auth, provider);
    } catch (e) {
      if (String((e as FbError).code).includes('popup')) return m.signInWithRedirect(auth, provider);
      throw e;
    }
  };

  return {
    start,
    currentUser: () => current,
    onChange(cb): Unsubscribe {
      subs.add(cb);
      return () => void subs.delete(cb);
    },
    async signIn(provider: AuthProvider): Promise<AuthUser> {
      if (provider !== 'google') throw new AppError('auth_unsupported', `Connexion ${provider} non prise en charge`);
      await start();
      const cred = (await googleWeb()) as { user?: FbUser } | undefined;
      if (cred?.user) return toAuthUser(cred.user);
      if (current) return current;
      throw new AppError('auth_pending', 'Connexion en cours (redirection)');
    },
    async signOut() {
      // Rien à fermer si Firebase n'a jamais été chargé (compte local).
      if (!load.loaded()) return;
      const { auth, m } = await load();
      await m.signOut(auth);
    },
    signInGoogleWeb: googleWeb,
    async signInWithIdToken(idToken) {
      const { auth, m } = await load();
      return m.signInWithCredential(auth, m.GoogleAuthProvider.credential(idToken));
    },
    async signInEmail(email, password, create) {
      const { auth, m } = await load();
      return create
        ? m.createUserWithEmailAndPassword(auth, email, password)
        : m.signInWithEmailAndPassword(auth, email, password);
    },
    async resetPassword(email) {
      const { auth, m } = await load();
      return m.sendPasswordResetEmail(auth, email);
    },
  };
}

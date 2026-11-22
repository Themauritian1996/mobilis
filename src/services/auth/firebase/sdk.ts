/**
 * Accès au SDK Firebase, chargé à la demande depuis www/vendor/firebase.js (aucune dépendance npm nouvelle : le bundle
 * local est celui de v1.15). SEUL fichier (avec les adaptateurs de services/<x>/firebase/) qui touche à Firebase.
 * Les types ci-dessous décrivent uniquement ce que l'app appelle ; les tests injectent un faux SDK (aucun réseau).
 */
import { assetUrl } from '../../../platform/asset-url.ts';

export interface FbUser {
  readonly uid: string;
  readonly email: string | null;
  readonly displayName: string | null;
}
export interface FsDocSnap {
  exists(): boolean;
  data(): Record<string, unknown>;
  readonly ref: unknown;
  readonly id: string;
}
export interface FsQuerySnap {
  readonly docs: readonly FsDocSnap[];
}
export interface FbAuthProvider {
  setCustomParameters(p: Record<string, string>): void;
}
export interface FbError {
  readonly code?: string;
}

export interface FirebaseSdk {
  initializeApp(config: object): unknown;
  getAuth(app: unknown): unknown;
  getFirestore(app: unknown): unknown;
  onAuthStateChanged(auth: unknown, cb: (u: FbUser | null) => void): () => void;
  getRedirectResult(auth: unknown): Promise<unknown>;
  GoogleAuthProvider: { new (): FbAuthProvider; credential(idToken: string): unknown };
  signInWithCredential(auth: unknown, credential: unknown): Promise<unknown>;
  signInWithPopup(auth: unknown, provider: FbAuthProvider): Promise<unknown>;
  signInWithRedirect(auth: unknown, provider: FbAuthProvider): Promise<unknown>;
  createUserWithEmailAndPassword(auth: unknown, email: string, password: string): Promise<unknown>;
  signInWithEmailAndPassword(auth: unknown, email: string, password: string): Promise<unknown>;
  sendPasswordResetEmail(auth: unknown, email: string): Promise<unknown>;
  signOut(auth: unknown): Promise<void>;
  doc(db: unknown, ...path: string[]): unknown;
  collection(db: unknown, ...path: string[]): unknown;
  getDoc(ref: unknown): Promise<FsDocSnap>;
  setDoc(ref: unknown, data: unknown, options?: { merge: boolean }): Promise<void>;
  getDocs(q: unknown): Promise<FsQuerySnap>;
  deleteDoc(ref: unknown): Promise<void>;
  query(base: unknown, ...constraints: unknown[]): unknown;
  orderBy(field: string): unknown;
  where(field: string, op: string, value: unknown): unknown;
}

/** Configuration Web de Firebase (clés publiques par conception : la sécurité vient des règles Firestore). */
export interface FirebaseWebConfig {
  readonly apiKey: string;
  readonly authDomain: string;
  readonly projectId: string;
  readonly appId: string;
}

export interface FirebaseHandle {
  readonly app: unknown;
  readonly auth: unknown;
  readonly db: unknown;
  /** Le SDK : `m` comme dans store.js de v1.15. */
  readonly m: FirebaseSdk;
}

export interface FirebaseLoader {
  (): Promise<FirebaseHandle>;
  /** Vrai dès que le SDK a été chargé (par n'importe quel adaptateur). */
  loaded(): boolean;
}

/** Import du bundle local. Chemin calculé + `@vite-ignore` : le bundler ne doit ni le suivre ni le copier. */
export const importVendorFirebase = (): Promise<FirebaseSdk> =>
  import(/* @vite-ignore */ assetUrl('vendor/firebase.js')) as Promise<FirebaseSdk>;

/** Chargeur mémorisé : initialise l'application Firebase une seule fois. */
export function createFirebaseLoader(
  config: FirebaseWebConfig,
  importSdk: () => Promise<FirebaseSdk> = importVendorFirebase,
): FirebaseLoader {
  let handle: FirebaseHandle | null = null;
  const load = async (): Promise<FirebaseHandle> => {
    if (handle) return handle;
    const m = await importSdk();
    const app = m.initializeApp(config);
    handle = { app, auth: m.getAuth(app), db: m.getFirestore(app), m };
    return handle;
  };
  return Object.assign(load, { loaded: () => handle !== null });
}

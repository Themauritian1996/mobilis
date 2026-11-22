import type { Unsubscribe } from '../../core/events.ts';

export interface AuthUser {
  readonly uid: string;
  readonly displayName: string | null;
  readonly email: string | null;
}

export type AuthProvider = 'google' | 'anonymous';

/** Port d'authentification. Adaptateurs : memory (tests), firebase (production). */
export interface AuthPort {
  currentUser(): AuthUser | null;
  onChange(cb: (user: AuthUser | null) => void): Unsubscribe;
  signIn(provider: AuthProvider): Promise<AuthUser>;
  signOut(): Promise<void>;
}

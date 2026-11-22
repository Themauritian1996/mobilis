import type { AuthPort, AuthUser } from '../port.ts';

/** Authentification simulée (tests, mode hors compte). */
export function createMemoryAuth(user: AuthUser = { uid: 'local-user', displayName: null, email: null }): AuthPort {
  let current: AuthUser | null = null;
  const subs = new Set<(u: AuthUser | null) => void>();
  const set = (u: AuthUser | null): void => {
    current = u;
    for (const cb of subs) cb(u);
  };
  return {
    currentUser: () => current,
    onChange(cb) {
      subs.add(cb);
      return () => void subs.delete(cb);
    },
    async signIn() {
      set(user);
      return user;
    },
    async signOut() {
      set(null);
    },
  };
}

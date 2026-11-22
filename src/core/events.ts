/**
 * Bus d'événements typé, synchrone, sans dépendance. Sert à découpler les domaines de l'interface :
 * un domaine émet (« assessment:saved »), l'interface s'abonne. Une erreur d'un abonné n'empêche pas les autres.
 */
export type Unsubscribe = () => void;
export type Handler<P> = (payload: P) => void;

export interface EventBus<E extends object> {
  on<K extends keyof E>(type: K, handler: Handler<E[K]>): Unsubscribe;
  once<K extends keyof E>(type: K, handler: Handler<E[K]>): Unsubscribe;
  off<K extends keyof E>(type: K, handler: Handler<E[K]>): void;
  emit<K extends keyof E>(type: K, payload: E[K]): void;
  clear(): void;
}

export function createEventBus<E extends object>(
  onError: (err: unknown, type: keyof E) => void = () => undefined,
): EventBus<E> {
  const handlers = new Map<keyof E, Set<Handler<never>>>();

  const off = <K extends keyof E>(type: K, handler: Handler<E[K]>): void => {
    handlers.get(type)?.delete(handler as Handler<never>);
  };
  const on = <K extends keyof E>(type: K, handler: Handler<E[K]>): Unsubscribe => {
    let set = handlers.get(type);
    if (!set) handlers.set(type, (set = new Set()));
    set.add(handler as Handler<never>);
    return () => off(type, handler);
  };

  return {
    on,
    off,
    once(type, handler) {
      const wrapped: typeof handler = (p) => {
        off(type, wrapped);
        handler(p);
      };
      return on(type, wrapped);
    },
    emit(type, payload) {
      for (const h of [...(handlers.get(type) ?? [])]) {
        try {
          (h as Handler<typeof payload>)(payload);
        } catch (err) {
          onError(err, type);
        }
      }
    },
    clear() {
      handlers.clear();
    },
  };
}

/** Événements applicatifs connus (à compléter domaine par domaine pendant la migration). */
export interface AppEvents {
  'flags:changed': { readonly flag: string; readonly enabled: boolean };
  'lang:changed': { readonly lang: string };
  'auth:changed': { readonly uid: string | null };
  'assessment:saved': { readonly id: string; readonly patientId: string };
  'plan:saved': { readonly id: string; readonly patientId: string };
}

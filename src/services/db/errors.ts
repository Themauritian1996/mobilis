/** Erreurs réseau (Firestore, fetch) : codes connus + messages typiques. Même règle qu'en v1.15 (www/js/store.js). */
const NET_CODES = new Set([
  'unavailable',
  'deadline-exceeded',
  'failed-precondition',
  'network-request-failed',
  'resource-exhausted',
  'cancelled',
]);

export function isNetworkError(e: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const err = e as { code?: unknown; message?: unknown } | null | undefined;
  const c = String(err?.code || '').replace(/^firestore\//, '');
  if (NET_CODES.has(c)) return true;
  return (
    e instanceof TypeError ||
    /network|offline|fetch|timeout|failed to load|importing a module/i.test(String(err?.message || ''))
  );
}

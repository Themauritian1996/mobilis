import type { CollectionMap, CollectionName } from '../../../core/types/clinical.ts';
import type { DatabasePort, WhereClause } from '../port.ts';

const match = (doc: Record<string, unknown>, w: WhereClause<never>): boolean => {
  const v = doc[w.field];
  switch (w.op) {
    case '==':
      return v === w.value;
    case '<':
      return (v as number) < (w.value as number);
    case '<=':
      return (v as number) <= (w.value as number);
    case '>':
      return (v as number) > (w.value as number);
    case '>=':
      return (v as number) >= (w.value as number);
    case 'in':
      return Array.isArray(w.value) && w.value.includes(v);
    case 'array-contains':
      return Array.isArray(v) && v.includes(w.value);
  }
};

/** Base en mémoire : tests et démonstrations. Copie profonde (structuredClone) à l'écriture et à la lecture. */
export function createMemoryDatabase(): DatabasePort {
  const cols = new Map<CollectionName, Map<string, unknown>>();
  const watchers = new Map<string, Set<(d: unknown) => void>>();
  const col = (c: CollectionName): Map<string, unknown> => {
    let m = cols.get(c);
    if (!m) cols.set(c, (m = new Map()));
    return m;
  };
  const notify = (c: CollectionName, id: string): void => {
    const d = col(c).get(id);
    for (const cb of watchers.get(`${c}/${id}`) ?? []) cb(d === undefined ? null : structuredClone(d));
  };
  return {
    async get(c, id) {
      const d = col(c).get(id);
      return d === undefined ? null : (structuredClone(d) as CollectionMap[typeof c]);
    },
    async set(c, id, doc) {
      col(c).set(id, structuredClone(doc));
      notify(c, id);
    },
    async remove(c, id) {
      col(c).delete(id);
      notify(c, id);
    },
    async query(c, where = []) {
      return [...col(c).values()]
        .filter((d) => where.every((w) => match(d as Record<string, unknown>, w as WhereClause<never>)))
        .map((d) => structuredClone(d) as CollectionMap[typeof c]);
    },
    watch(c, id, cb) {
      const key = `${c}/${id}`;
      let set = watchers.get(key);
      if (!set) watchers.set(key, (set = new Set()));
      const h = cb as (d: unknown) => void;
      set.add(h);
      return () => void set.delete(h);
    },
  };
}

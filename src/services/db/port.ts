import type { Unsubscribe } from '../../core/events.ts';
import type { CollectionMap, CollectionName } from '../../core/types/clinical.ts';

export interface WhereClause<T> {
  readonly field: keyof T & string;
  readonly op: '==' | '<' | '<=' | '>' | '>=' | 'in' | 'array-contains';
  readonly value: unknown;
}

/**
 * Port base de données documentaire (Firestore en production, mémoire en test, local hors ligne).
 * Les documents lus sont migrés au schéma courant par l'appelant (src/core/schema.ts).
 */
export interface DatabasePort {
  get<C extends CollectionName>(col: C, id: string): Promise<CollectionMap[C] | null>;
  set<C extends CollectionName>(col: C, id: string, doc: CollectionMap[C]): Promise<void>;
  remove(col: CollectionName, id: string): Promise<void>;
  query<C extends CollectionName>(
    col: C,
    where?: readonly WhereClause<CollectionMap[C]>[],
  ): Promise<CollectionMap[C][]>;
  watch<C extends CollectionName>(col: C, id: string, cb: (doc: CollectionMap[C] | null) => void): Unsubscribe;
}

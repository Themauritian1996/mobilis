/**
 * Forme MINIMALE des données du patient telles que stockées (localStorage `mobilis.data.<uid>`, Firestore `users/<uid>`).
 * La couche services ne connaît pas les types des domaines : elle ne lit que les champs listés ici et conserve tous les
 * autres sans les toucher (signature d'index). Les types complets sont dans src/domains/rehab/types.ts (structurellement
 * compatibles).
 */
export interface StoredProfile {
  role?: string | undefined;
  days?: number[] | undefined;
  perWeek?: number | undefined;
  phase?: number | undefined;
  levels?: unknown;
  plan?: { ids?: unknown } | null | undefined;
  joinedAt?: number | undefined;
  startDate?: number | undefined;
  irritability?: string | undefined;
  painBase?: number | undefined;
  rxCode?: string | null | undefined;
  rxVersion?: number | undefined;
  rxAt?: number | undefined;
  geminiKey?: unknown;
  sharedAI?: unknown;
  [key: string]: unknown;
}

export interface StoredSessionItem {
  sets?: unknown;
  [key: string]: unknown;
}

export interface StoredSession {
  id: string | number;
  date: number;
  items: StoredSessionItem[];
  [key: string]: unknown;
}

export interface StoredJournalEntry {
  day: string;
  [key: string]: unknown;
}

export interface StoredData {
  profile: StoredProfile | null;
  sessions: StoredSession[];
  journal: StoredJournalEntry[];
}

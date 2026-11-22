/**
 * Formes de données de v1.15 utilisées par la logique de programme (profil du patient, séances, doses). Elles décrivent
 * ce qui est DÉJÀ stocké (localStorage `mobilis.data.<uid>`, Firestore `users/<uid>`) : toute modification de forme est
 * interdite pendant la migration (docs/MIGRATION.md règle 8). Les champs inconnus sont conservés (signature d'index).
 */

/** Dose d'un exercice : séries × répétitions (type 'reps') ou séries × secondes de maintien (type 'hold'). */
export interface Dose {
  type: 'reps' | 'hold';
  sets: number;
  reps: number;
  hold?: number | undefined;
  tempo?: string | undefined;
  holdTop?: number | undefined;
  romFactor?: number | undefined;
  loadNote?: string | null | undefined;
  rest?: number | null | undefined;
  custom?: boolean | undefined;
}

/** Réglage de dose du patient (permanent : doseOver, ou du jour : todayOver.items). */
export interface DoseOverride {
  sets?: number | undefined;
  reps?: number | undefined;
  hold?: number | undefined;
  rest?: number | null | undefined;
}

/** Dose fixée par le clinicien (rxDose) : niveau auquel elle a été fixée + valeurs. */
export interface RxDose extends DoseOverride {
  lv?: number | undefined;
}

export interface TodayOverride {
  date: string;
  items: Record<string, DoseOverride | undefined>;
  skip: string[];
}

export interface ProtocolState {
  id: string;
  variant?: string | null | undefined;
  surgeryDate?: string | undefined;
  confirmed?: Record<string, number | boolean | undefined> | undefined;
}

export interface Profile {
  name?: string | undefined;
  role?: string | undefined;
  startDate?: number | undefined;
  joinedAt?: number | undefined;
  flareUntil?: number | undefined;
  protocol?: ProtocolState | null | undefined;
  swaps?: Record<string, string> | undefined;
  rxDose?: Record<string, RxDose | undefined> | undefined;
  doseOver?: Record<string, DoseOverride | undefined> | undefined;
  todayOver?: TodayOverride | undefined;
  levels?: Record<string, number | undefined> | undefined;
  baseLevel?: number | undefined;
  irritability?: string | undefined;
  maxLevel?: Record<string, number | undefined> | undefined;
  autoEx?: Record<string, boolean | undefined> | undefined;
  plan?: { phase?: number | undefined; ids?: string[] | undefined } | null | undefined;
  pathology?: string | undefined;
  phase?: number | undefined;
  lockPhase?: boolean | undefined;
  days?: number[] | undefined;
  perWeek?: number | undefined;
  calSkip?: string[] | undefined;
  calExtra?: string[] | undefined;
  calMoves?: Record<string, string> | undefined;
  badges?: Record<string, number> | undefined;
  rxCode?: string | null | undefined;
  rxVersion?: number | undefined;
  rxAt?: number | undefined;
  clinician?: string | undefined;
  equipment?: string[] | undefined;
  painBase?: number | undefined;
  reportStart?: number | undefined;
  reportPlan?: { every: number } | null | undefined;
  reportLog?: ReportLogEntry[] | undefined;
  romLog?: LogEntry[] | undefined;
  promLog?: LogEntry[] | undefined;
  promCustom?: unknown[] | undefined;
  [key: string]: unknown;
}

/** Entrée d'un journal de mesures (amplitude, questionnaire, rapport), clé = `ts`. */
export interface LogEntry {
  ts: number;
  test?: string | undefined;
  id?: string | undefined;
  side?: string | null | undefined;
  [key: string]: unknown;
}

export interface ReportLogEntry extends LogEntry {
  fields?: Record<string, unknown> | undefined;
  pdfName?: string | undefined;
}

export interface SessionSet {
  reps?: number | undefined;
  full?: number | undefined;
  partial?: number | undefined;
  holdSec?: number | undefined;
  quality?: number | null | undefined;
  manual?: boolean | undefined;
  [key: string]: unknown;
}

export interface SessionItem {
  id: string;
  level?: number | null | undefined;
  ts?: number | undefined;
  pain?: number | null | undefined;
  difficulty?: number | null | undefined;
  note?: string | undefined;
  change?: number | undefined;
  manual?: boolean | undefined;
  sets: SessionSet[];
  [key: string]: unknown;
}

export interface Session {
  id: string | number;
  date: number;
  items: SessionItem[];
  manual?: boolean | undefined;
  checkin?: string | null | undefined;
  [key: string]: unknown;
}

export interface JournalEntry {
  day: string;
  pain?: number | null | undefined;
  ts?: number | undefined;
  [key: string]: unknown;
}

/** Données du patient telles que stockées : profil, séances, journal. */
export interface PatientData {
  profile: Profile | null;
  sessions: Session[];
  journal: JournalEntry[];
}

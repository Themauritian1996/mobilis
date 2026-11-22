// Types du rapport de suivi (domaine outcomes) : structure produite par report.ts (buildReportData / dataFromSummary)
// et lue par report-pdf.ts. Les noms cliniques sont des objets { fr, en } : le PDF choisit la langue.
import type { Localized } from '../../core/i18n/engine.ts';

/** Nom clinique : chaîne, objet par langue, ou absent. */
export type ReportName = string | Localized<string> | null | undefined;

export interface PainPoint {
  ts: number;
  v: number;
  /** 's' : moyenne d'une séance ; 'j' : journal quotidien. */
  src: 's' | 'j';
}

export interface ReportPain {
  series: PainPoint[];
  avg: number | null | undefined;
  first: number | null;
  last: number | null;
  delta: number | null;
  min: number | null;
  max: number | null;
}

export interface ReportProtocol {
  id: string;
  name: ReportName;
  week?: number | string | null | undefined;
  phase?: number | string | null | undefined;
  phases?: number | null | undefined;
  preop?: boolean | undefined;
  surgeryDate?: string | null | undefined;
}

export interface ReportFields {
  global?: number;
  pain?: number;
  goalsProgress?: number;
  goals?: string;
  difficulties?: string;
  comment?: string;
  hardExIds?: string[];
  hardEx?: ReportName[];
}

export interface ReportExercise {
  id: string;
  name: ReportName;
  level?: number | null | undefined;
  levelStart?: number | null | undefined;
  sessions?: number | null | undefined;
  difficulty?: number | null | undefined;
  pain?: number | null | undefined;
  trend?: string | undefined;
}

export interface ReportRom {
  test: string;
  name: ReportName;
  side: string | null;
  unit: string;
  baseline?: number | null | undefined;
  last?: number | null | undefined;
  gain?: number | null | undefined;
  pctNormal?: number | null | undefined;
  normal: { lo: number | null; hi: number | null; ref: number | null };
  n?: number | undefined;
  lastTs?: number | null | undefined;
  series: [number, number | null][];
}

export interface ReportProm {
  id: string;
  name: ReportName;
  n?: number | undefined;
  baseline?: number | null | undefined;
  last?: number | null | undefined;
  delta?: number | null | undefined;
  improvement?: unknown;
  mcid?: unknown;
  mcidReached?: boolean | undefined;
  higherIsBetter?: boolean | undefined;
  range?: unknown;
  lastTs?: number | null | undefined;
}

export interface ReportLogItem {
  id: string;
  name: ReportName;
  sets: number;
  reps: number;
  full: number;
  partial: number;
  holdSec: number;
  pain: number | null;
  difficulty: number | null;
}

export interface ReportLogEntry {
  ts: number;
  /** Détail des séries (rapport complet) ; absent du résumé partagé. */
  items?: ReportLogItem[];
  /** Nombre d'exercices (résumé partagé). */
  n?: number | null | undefined;
  pain: number | null | undefined;
  difficulty?: number | null | undefined;
}

export interface ReportNote {
  ts: number;
  ex: string;
  exName: ReportName;
  pain: number | null;
  text: string;
}

export interface ReportData {
  version: 1;
  generatedAt: number;
  source: 'full' | 'summary';
  period: { from: number; to: number; days: number };
  patient: { name: string };
  condition: {
    pathology: ReportName;
    region: string | null;
    phase: string | null | undefined;
    week: number | string | null | undefined;
    protocol: ReportProtocol | null;
    clinician: string;
  };
  adherence: { planned: number | null; done: number; pct: number | null };
  sessionsCount: number;
  pain: ReportPain;
  exercises: ReportExercise[];
  rom: ReportRom[];
  prom: ReportProm[];
  badges: { total: number; inPeriod: number };
  fields: ReportFields | null;
  log: ReportLogEntry[];
  logTruncated: boolean;
  notes: ReportNote[];
}

/**
 * Exports d'une étude (spec v2 §7) — fonctions pures : CSV en format long, JSON complet.
 * Anonymisation (`anonymize: true`) : ni nom, ni identifiant interne du dossier, ni champs libres des interventions ;
 * le patient est désigné par son identifiant de recherche ; dates ramenées au jour (sans heure) et jour relatif à T0.
 * Aucune image ni vidéo n'existe dans les données (seules des mesures dérivées sont enregistrées).
 */
import type { Intervention, Patient, Study } from '../../core/types/clinical.ts';
import { deltasFromBaseline, meanCurves, summarizeStudy, type Observation, type StudyData } from './aggregate.ts';
import { daysBetween } from './schedule.ts';

export const EXPORT_DISCLAIMER =
  'Outil d’évaluation clinique — non homologué Santé Canada. Mesures 2D par caméra (estimations signalées) ; à interpréter par le clinicien.';

export interface ExportOptions {
  readonly anonymize: boolean;
  /** Ajoute l'indicateur d'ordre des octets UTF-8 (ouverture correcte des accents dans Excel). Défaut : vrai. */
  readonly bom?: boolean;
}

/** Échappe une cellule CSV (RFC 4180) ; neutralise les formules de tableur (=, +, -, @ en tête de texte). */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(Math.round(v * 1e4) / 1e4) : '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const dayOnly = (iso: string): string => iso.slice(0, 10);

/** Jour relatif à la première observation T0 du patient (ou à sa première observation). */
function relativeDays(obs: readonly Observation[]): Map<Observation, number | null> {
  const first = new Map<string, string>();
  for (const o of [...obs].sort((a, b) => a.offsetDays - b.offsetDays || (a.date < b.date ? -1 : 1)))
    if (!first.has(o.patientId)) first.set(o.patientId, dayOnly(o.date));
  const out = new Map<Observation, number | null>();
  for (const o of obs) {
    const f = first.get(o.patientId);
    try {
      out.set(o, f ? daysBetween(f, dayOnly(o.date)) : null);
    } catch {
      out.set(o, null);
    }
  }
  return out;
}

/** CSV en format long : une ligne par patient × point dans le temps × mesure × condition. */
export function toCsvLong(obs: readonly Observation[], opts: ExportOptions): string {
  const head = opts.anonymize ? ['research_id'] : ['research_id', 'patient_id', 'patient_name'];
  head.push(
    'timepoint',
    'timepoint_label',
    'offset_days',
    'condition',
    'measure',
    'measure_label',
    'value',
    'unit',
    'confidence',
    'estimate',
    'date',
    'day_from_first',
  );
  const rel = relativeDays(obs);
  const rows = [...obs]
    .sort(
      (a, b) =>
        a.researchId.localeCompare(b.researchId) ||
        a.offsetDays - b.offsetDays ||
        a.measureId.localeCompare(b.measureId) ||
        a.condition.localeCompare(b.condition),
    )
    .map((o) => {
      const id = opts.anonymize ? [o.researchId] : [o.researchId, o.patientId, o.displayName];
      return [
        ...id,
        o.timepointId,
        o.timepointLabel,
        o.offsetDays,
        o.condition,
        o.measureId,
        o.measureLabel,
        o.value,
        o.unit,
        o.confidence,
        o.estimate,
        opts.anonymize ? dayOnly(o.date) : o.date,
        rel.get(o) ?? null,
      ]
        .map(csvCell)
        .join(',');
    });
  return (opts.bom === false ? '' : '﻿') + [head.join(','), ...rows].join('\r\n') + '\r\n';
}

export interface StudyExport {
  readonly format: 'mobilis-study-export';
  readonly schemaVersion: 1;
  readonly exportedAt: string;
  readonly anonymized: boolean;
  readonly disclaimer: string;
  readonly study: Pick<Study, 'name' | 'measures' | 'timepoints' | 'conditions'> & {
    readonly id?: string;
    readonly templateId?: string;
  };
  readonly patients: readonly Record<string, unknown>[];
  readonly interventions: readonly Record<string, unknown>[];
  readonly observations: readonly Record<string, unknown>[];
  readonly curves: StudyData['curves'];
  readonly summary: ReturnType<typeof summarizeStudy>;
  readonly deltas: ReturnType<typeof deltasFromBaseline>;
  readonly meanCurves: ReturnType<typeof meanCurves>;
  readonly notes?: string;
}

/** Export JSON complet (objet sérialisable) ; `anonymize` retire noms, identifiants internes et champs libres. */
export function buildJsonExport(
  study: Study,
  patients: readonly Patient[],
  data: StudyData,
  interventions: readonly Intervention[],
  opts: ExportOptions & { readonly exportedAt: string; readonly notes?: string },
): StudyExport {
  const anon = opts.anonymize;
  const rid = new Map<string, string>();
  for (const o of data.observations) rid.set(o.patientId, o.researchId);
  for (const c of data.curves) rid.set(c.patientId, c.researchId);
  const pById = new Map(patients.map((p) => [p.id as string, p]));
  const ridOf = (pid: string): string => rid.get(pid) ?? pById.get(pid)?.researchId ?? `P-${pid.slice(0, 6)}`;
  const strip = <T extends { patientId: string }>(x: T): Record<string, unknown> => {
    if (!anon) return { ...x };
    const { patientId: _p, ...rest } = x;
    void _p;
    const r: Record<string, unknown> = { ...rest };
    delete r['displayName'];
    delete r['assessmentId'];
    if (typeof r['date'] === 'string') r['date'] = dayOnly(r['date']);
    return r;
  };
  return {
    format: 'mobilis-study-export',
    schemaVersion: 1,
    exportedAt: opts.exportedAt,
    anonymized: anon,
    disclaimer: EXPORT_DISCLAIMER,
    study: {
      ...(anon ? {} : { id: study.id }),
      name: study.name,
      ...(study.templateId ? { templateId: study.templateId } : {}),
      measures: study.measures,
      timepoints: study.timepoints,
      conditions: study.conditions,
    },
    patients: study.patientIds.map((pid) => {
      const p = pById.get(pid);
      return anon
        ? { researchId: ridOf(pid), sex: p?.sex ?? null, affectedSide: p?.affectedSide ?? null }
        : {
            researchId: ridOf(pid),
            patientId: pid,
            displayName: p?.displayName ?? null,
            birthYear: p?.birthYear ?? null,
            sex: p?.sex ?? null,
            heightCm: p?.heightCm ?? null,
            affectedSide: p?.affectedSide ?? null,
          };
    }),
    interventions: interventions
      .filter((i) => study.patientIds.includes(i.patientId))
      .map((i) =>
        anon
          ? { researchId: ridOf(i.patientId), type: i.type, date: i.date }
          : {
              researchId: ridOf(i.patientId),
              patientId: i.patientId,
              type: i.type,
              date: i.date,
              details: i.details ?? {},
            },
      ),
    observations: data.observations.map(strip),
    curves: anon ? data.curves.map((c) => strip(c) as unknown as StudyData['curves'][number]) : data.curves,
    summary: summarizeStudy(study, data),
    deltas: anon
      ? deltasFromBaseline(study, data.observations).map(
          (d) => strip(d) as unknown as ReturnType<typeof deltasFromBaseline>[number],
        )
      : deltasFromBaseline(study, data.observations),
    meanCurves: meanCurves(study, data.curves),
    ...(opts.notes ? { notes: opts.notes } : {}),
  };
}

/** Nom de fichier sûr (ASCII) pour un export. */
export function exportFileName(studyName: string, ext: 'csv' | 'json' | 'pdf', date: string): string {
  const base =
    studyName
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 40) || 'etude';
  return `mobilis-${base}-${date.slice(0, 10)}.${ext}`;
}

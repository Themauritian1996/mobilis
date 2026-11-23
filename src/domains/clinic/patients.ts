/**
 * Dossier patient v2 — logique pure (création, modification, recherche, chronologie, suppression en cascade).
 * Aucune valeur clinique ici : uniquement des formes de données et des contrôles de saisie.
 * Les accès passent par le port `DatabasePort` reçu en paramètre (jamais Firestore).
 */
import { AppError } from '../../core/errors.ts';
import type {
  Annotation,
  Assessment,
  FollowUp,
  Intervention,
  Patient,
  PatientId,
  Plan,
  ProstheticProfile,
  Side,
} from '../../core/types/clinical.ts';
import type { IsoDateTime } from '../../core/types/common.ts';
import type { DatabasePort } from '../../services/db/port.ts';

export const SEXES = ['female', 'male', 'other', 'unspecified'] as const;
export const SIDES = ['left', 'right', 'bilateral', 'none'] as const satisfies readonly Side[];
export const AMPUTATION_LEVELS = [
  'transtibial',
  'transfemoral',
  'knee_disarticulation',
  'hip_disarticulation',
  'syme',
  'chopart',
  'other',
] as const satisfies readonly ProstheticProfile['level'][];

/** Bornes de saisie (contrôle de vraisemblance, pas des normes cliniques). */
export const HEIGHT_MIN_CM = 50;
export const HEIGHT_MAX_CM = 250;
export const BIRTH_YEAR_MIN = 1900;
export const NAME_MAX = 120;

export interface PatientInput {
  readonly displayName: string;
  readonly birthYear?: number | null;
  readonly sex?: Patient['sex'] | null;
  readonly heightCm?: number | null;
  readonly affectedSide?: Side | null;
  /** Profil prothétique facultatif : niveau + côté (les autres champs sont gérés par le volet prothèses). */
  readonly prosthesis?: Pick<ProstheticProfile, 'level' | 'side'> | null;
}

export type PatientInputError = 'nameRequired' | 'nameTooLong' | 'birthYearRange' | 'heightRange' | 'invalidChoice';

export function validatePatientInput(i: PatientInput, currentYear: number): PatientInputError[] {
  const errs: PatientInputError[] = [];
  const name = i.displayName.trim();
  if (!name) errs.push('nameRequired');
  if (name.length > NAME_MAX) errs.push('nameTooLong');
  if (i.birthYear !== undefined && i.birthYear !== null) {
    if (!Number.isInteger(i.birthYear) || i.birthYear < BIRTH_YEAR_MIN || i.birthYear > currentYear)
      errs.push('birthYearRange');
  }
  if (i.heightCm !== undefined && i.heightCm !== null) {
    if (!Number.isFinite(i.heightCm) || i.heightCm < HEIGHT_MIN_CM || i.heightCm > HEIGHT_MAX_CM)
      errs.push('heightRange');
  }
  if (
    (i.sex && !(SEXES as readonly string[]).includes(i.sex)) ||
    (i.affectedSide && !(SIDES as readonly string[]).includes(i.affectedSide)) ||
    (i.prosthesis &&
      (!(AMPUTATION_LEVELS as readonly string[]).includes(i.prosthesis.level) ||
        !(SIDES as readonly string[]).includes(i.prosthesis.side)))
  )
    errs.push('invalidChoice');
  return errs;
}

/** Identifiant aléatoire (UUID v4 si disponible). */
export function newRecordId(prefix = ''): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return prefix + c.randomUUID();
  const b = new Uint8Array(16);
  c?.getRandomValues?.(b);
  return prefix + Array.from(b, (x) => (x || Math.floor(Math.random() * 256)).toString(16).padStart(2, '0')).join('');
}

const identity = (i: PatientInput, prev?: Patient): Record<string, unknown> => {
  const o: Record<string, unknown> = { displayName: i.displayName.trim() };
  if (i.birthYear) o['birthYear'] = i.birthYear;
  if (i.sex) o['sex'] = i.sex;
  if (i.heightCm) o['heightCm'] = Math.round(i.heightCm * 10) / 10;
  if (i.affectedSide) o['affectedSide'] = i.affectedSide;
  if (i.prosthesis) o['prosthesis'] = { ...(prev?.prosthesis ?? {}), ...i.prosthesis };
  return o;
};

export function newPatient(i: PatientInput, ctx: { id: string; ownerUid: string; now: string }): Patient {
  return {
    ...identity(i),
    schemaVersion: 1,
    id: ctx.id as PatientId,
    ownerUid: ctx.ownerUid,
    createdAt: ctx.now as IsoDateTime,
    updatedAt: ctx.now as IsoDateTime,
  } as Patient;
}

/** Remplace l'identité (champs vidés = retirés) ; conserve les autres champs (researchId, poids…). */
export function updatePatient(prev: Patient, i: PatientInput, now: string): Patient {
  const { displayName, birthYear, sex, heightCm, affectedSide, prosthesis, ...rest } = prev;
  void [displayName, birthYear, sex, heightCm, affectedSide, prosthesis];
  return { ...rest, ...identity(i, prev), updatedAt: now as IsoDateTime } as Patient;
}

const fold = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Recherche insensible aux accents (nom, identifiant de recherche, année de naissance) ; tri par nom. */
export function searchPatients(list: readonly Patient[], q: string): Patient[] {
  const words = fold(q).split(/\s+/).filter(Boolean);
  return list
    .filter((p) => {
      const hay = fold(`${p.displayName ?? ''} ${p.researchId ?? ''} ${p.birthYear ?? ''}`);
      return words.every((w) => hay.includes(w));
    })
    .sort(
      (a, b) =>
        (a.displayName ?? '').localeCompare(b.displayName ?? '', 'fr') || b.updatedAt.localeCompare(a.updatedAt),
    );
}

/**
 * Fiche du patient connecté (id = uid), créée si absente (contrat entre volets, brief v2). Les champs fournis
 * complètent une fiche existante sans écraser ce qui est déjà saisi.
 */
export async function ensureSelfPatient(
  db: DatabasePort,
  uid: string,
  info: Partial<Pick<Patient, 'displayName' | 'birthYear' | 'heightCm' | 'sex' | 'affectedSide'>> = {},
  now: string = new Date().toISOString(),
): Promise<Patient> {
  const prev = await db.get('patients', uid);
  const filled = Object.fromEntries(Object.entries(info).filter(([, v]) => v !== undefined && v !== null && v !== ''));
  if (prev) {
    const missing = Object.fromEntries(
      Object.entries(filled).filter(([k]) => (prev as unknown as Record<string, unknown>)[k] === undefined),
    );
    if (!Object.keys(missing).length) return prev;
    const next = { ...prev, ...missing, updatedAt: now as IsoDateTime } as Patient;
    await db.set('patients', uid, next);
    return next;
  }
  const p = {
    ...filled,
    schemaVersion: 1,
    id: uid as PatientId,
    ownerUid: uid,
    createdAt: now as IsoDateTime,
    updatedAt: now as IsoDateTime,
  } as Patient;
  await db.set('patients', uid, p);
  return p;
}

// ---------------------------------------------------------------- Chronologie
export type TimelineItem =
  | {
      readonly kind: 'assessment';
      readonly at: string;
      readonly doc: Assessment;
      readonly notes: readonly Annotation[];
    }
  | {
      readonly kind: 'comparison';
      readonly at: string;
      readonly assessmentIds: readonly string[];
      readonly notes: readonly Annotation[];
    }
  | { readonly kind: 'intervention'; readonly at: string; readonly doc: Intervention }
  | { readonly kind: 'plan'; readonly at: string; readonly doc: Plan }
  | { readonly kind: 'followup'; readonly at: string; readonly doc: FollowUp };

export interface PatientRecords {
  readonly assessments: readonly Assessment[];
  readonly annotations: readonly Annotation[];
  readonly interventions: readonly Intervention[];
  readonly plans: readonly Plan[];
  readonly followups: readonly FollowUp[];
}

/** Chronologie du plus récent au plus ancien. Les notes d'une évaluation lui sont rattachées ; une note sur deux
 * évaluations (comparaison A/B) forme une entrée « comparaison ». */
export function buildTimeline(r: PatientRecords): TimelineItem[] {
  const byAssessment = new Map<string, Annotation[]>();
  const comparisons = new Map<string, Annotation[]>();
  for (const n of r.annotations) {
    if (n.assessmentIds.length >= 2) {
      const k = [...new Set(n.assessmentIds)].sort().join('|');
      comparisons.set(k, [...(comparisons.get(k) ?? []), n]);
    } else if (n.assessmentIds[0]) {
      byAssessment.set(n.assessmentIds[0], [...(byAssessment.get(n.assessmentIds[0]) ?? []), n]);
    }
  }
  const sortNotes = (ns: readonly Annotation[]): Annotation[] =>
    [...ns].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const items: TimelineItem[] = [
    ...r.assessments.map((doc): TimelineItem => ({
      kind: 'assessment',
      at: doc.performedAt || doc.createdAt,
      doc,
      notes: sortNotes(byAssessment.get(doc.id) ?? []),
    })),
    ...[...comparisons.entries()].map(([k, notes]): TimelineItem => {
      const ns = sortNotes(notes);
      return { kind: 'comparison', at: ns[ns.length - 1]!.updatedAt, assessmentIds: k.split('|'), notes: ns };
    }),
    ...r.interventions.map((doc): TimelineItem => ({ kind: 'intervention', at: doc.date, doc })),
    ...r.plans.map((doc): TimelineItem => ({ kind: 'plan', at: doc.updatedAt, doc })),
    ...r.followups.map((doc): TimelineItem => ({ kind: 'followup', at: doc.anchorDate || doc.createdAt, doc })),
  ];
  return items.sort((a, b) => b.at.localeCompare(a.at));
}

/** Lit tout ce qui concerne un patient (documents du compte + documents partagés avec lui). */
export async function loadPatientRecords(db: DatabasePort, patientId: string): Promise<PatientRecords> {
  const w = [{ field: 'patientId' as const, op: '==' as const, value: patientId }];
  const [assessments, annotations, interventions, plans, followups] = await Promise.all([
    db.query('assessments', w),
    db.query('annotations', w),
    db.query('interventions', w),
    db.query('plans', w),
    db.query('followups', w),
  ]);
  return { assessments, annotations, interventions, plans, followups };
}

/**
 * Supprime un dossier POSSÉDÉ par `ownerUid` et tout ce que ce compte a enregistré pour ce patient ; retire le
 * patient des études. Les documents partagés par le patient lui appartiennent : ils ne sont pas touchés.
 */
export async function deletePatientRecord(
  db: DatabasePort,
  patientId: string,
  ownerUid: string,
  now: string = new Date().toISOString(),
): Promise<number> {
  const p = await db.get('patients', patientId);
  if (!p) return 0;
  if (p.ownerUid !== ownerUid) throw new AppError('records_not_owner', 'Ce dossier appartient à un autre compte');
  const recs = await loadPatientRecords(db, patientId);
  let n = 0;
  const all = [
    ...recs.assessments.map((d) => ['assessments', d] as const),
    ...recs.annotations.map((d) => ['annotations', d] as const),
    ...recs.interventions.map((d) => ['interventions', d] as const),
    ...recs.plans.map((d) => ['plans', d] as const),
    ...recs.followups.map((d) => ['followups', d] as const),
  ];
  for (const [col, d] of all) {
    if (d.ownerUid !== ownerUid) continue;
    await db.remove(col, d.id);
    n++;
  }
  for (const s of await db.query('studies', [{ field: 'patientIds', op: 'array-contains', value: patientId }])) {
    if (s.ownerUid !== ownerUid) continue;
    await db.set('studies', s.id, {
      ...s,
      patientIds: s.patientIds.filter((x) => x !== patientId),
      updatedAt: now as IsoDateTime,
    });
  }
  await db.remove('patients', patientId);
  return n + 1;
}

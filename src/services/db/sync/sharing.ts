/**
 * Règles PURES du partage patient → clinicien (docs/adr/0009-dossier-patient.md).
 *  - Un patient avec compte, lié à un clinicien par son programme (`rx/{code}.by` = uid du clinicien auteur) ET qui a
 *    accepté le partage du suivi (`profile.shareProgress`), partage ses évaluations, annotations et suivis qui le
 *    concernent (`patientId` = son uid) ainsi que sa fiche `patients/{uid}` : champ `sharedWith: [uidClinicien]` +
 *    `sharedVia: code` (vérifié par les règles Firestore).
 *  - Le clinicien lit ces documents (lecture seule) et, s'il n'a pas encore de dossier pour ce patient, en crée un
 *    dans SON espace avec le même id (= uid du patient) : la chronologie se relie sans champ supplémentaire.
 */
import type { CollectionName, Patient, PatientId } from '../../../core/types/clinical.ts';
import type { IsoDateTime } from '../../../core/types/common.ts';

/** Destinataire du partage : uid du clinicien et code du programme qui prouve le lien. */
export interface ShareTarget {
  readonly uid: string;
  readonly via: string;
}

/** Collections transmises au clinicien (spec §10.11 : évaluations, annotations, suivis + fiche). */
export const SHARED_COLLECTIONS = [
  'patients',
  'assessments',
  'annotations',
  'followups',
] as const satisfies readonly CollectionName[];

export const isSharedCollection = (col: CollectionName): boolean =>
  (SHARED_COLLECTIONS as readonly CollectionName[]).includes(col);

/**
 * Destinataires voulus pour un document du compte `uid`.
 * `target === undefined` : lien inconnu (hors ligne) → on garde le partage actuel `current`.
 */
export function desiredSharedWith(
  col: CollectionName,
  doc: Readonly<Record<string, unknown>>,
  uid: string,
  target: ShareTarget | null | undefined,
  current: readonly string[] = [],
): string[] {
  if (target === undefined) return [...current];
  if (!target || target.uid === uid || !isSharedCollection(col)) return [];
  const about = col === 'patients' ? doc['id'] : doc['patientId'];
  return about === uid ? [target.uid] : [];
}

export const sameList = (a: readonly string[] = [], b: readonly string[] = []): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** Champs d'identité recopiés de la fiche du patient (« si fournis »). */
const COPIED = ['displayName', 'birthYear', 'heightCm', 'sex', 'affectedSide', 'weightKg'] as const;

export interface AutoCreateInput {
  /** uid du clinicien (compte courant). */
  readonly uid: string;
  readonly now: string;
  /** Fiches partagées par les patients (id = uid du patient). */
  readonly sharedPatients: readonly Patient[];
  /** Autres documents partagés (évaluations, annotations, suivis) : propriétaire, patient, mise à jour. */
  readonly sharedDocs: readonly { ownerUid: string; patientId?: unknown; updatedAt?: unknown }[];
  /** Ids des dossiers que le clinicien possède déjà. */
  readonly ownPatientIds: ReadonlySet<string>;
  /** Dossiers supprimés par le clinicien : uid → date ; recréés seulement si le patient transmet du nouveau. */
  readonly dismissed: Readonly<Record<string, string>>;
}

/** Dossiers à créer chez le clinicien pour les patients qui lui transmettent des données. */
export function planAutoCreate(i: AutoCreateInput): Patient[] {
  const latest = new Map<string, string>();
  const bump = (uid: string, at: unknown): void => {
    const s = typeof at === 'string' ? at : '';
    if (!latest.has(uid) || s > (latest.get(uid) ?? '')) latest.set(uid, s);
  };
  for (const p of i.sharedPatients) if (p.id === p.ownerUid) bump(p.ownerUid, p.updatedAt);
  // Un document ne compte que s'il concerne son auteur (patientId = uid du patient).
  for (const d of i.sharedDocs) if (d.patientId === d.ownerUid) bump(d.ownerUid, d.updatedAt);
  const out: Patient[] = [];
  for (const [puid, at] of latest) {
    if (puid === i.uid || i.ownPatientIds.has(puid)) continue;
    const gone = i.dismissed[puid];
    if (gone && !(at > gone)) continue;
    const src = i.sharedPatients.find((p) => p.id === puid);
    const copy: Record<string, unknown> = {};
    for (const k of COPIED) if (src?.[k] !== undefined) copy[k] = src[k];
    out.push({
      ...copy,
      schemaVersion: 1,
      id: puid as PatientId,
      ownerUid: i.uid,
      createdAt: i.now as IsoDateTime,
      updatedAt: i.now as IsoDateTime,
    } as Patient);
  }
  return out;
}

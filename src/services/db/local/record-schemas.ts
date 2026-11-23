/**
 * Schémas versionnés des collections cliniques v2 (docs/adr/0004-schema-versionne.md). Version courante : 1 pour
 * toutes. La migration 0 → 1 accepte un document SANS `schemaVersion` (brouillons de développement, imports) et
 * complète les champs obligatoires sans rien supprimer. Une version future (> courante) n'est jamais écrasée : le
 * document est conservé tel quel et masqué des lectures jusqu'à la mise à jour de l'app.
 */
import { migrate, type Migration, type SchemaDefinition } from '../../../core/schema.ts';
import type { CollectionMap, CollectionName } from '../../../core/types/clinical.ts';
import type { Versioned } from '../../../core/types/common.ts';

export const RECORD_COLLECTIONS = [
  'patients',
  'assessments',
  'plans',
  'studies',
  'interventions',
  'annotations',
  'followups',
] as const satisfies readonly CollectionName[];

export interface MigrationContext {
  /** Propriétaire par défaut (utilisateur courant) si le document n'en a pas. */
  readonly ownerUid: string;
  /** Date ISO utilisée pour createdAt / updatedAt manquants. */
  readonly now: string;
}

const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Champs propres à chaque collection, complétés à la migration 0 → 1. */
const DEFAULTS: Readonly<Record<CollectionName, (d: Record<string, unknown>) => Record<string, unknown>>> = {
  patients: (d) => d,
  assessments: (d) => ({
    ...d,
    metrics: arr(d['metrics']),
    findings: arr(d['findings']),
    videoRetained: false,
    performedAt: str(d['performedAt']) ? d['performedAt'] : d['createdAt'],
  }),
  plans: (d) => ({
    ...d,
    revision: typeof d['revision'] === 'number' ? d['revision'] : 1,
    status: str(d['status']) ? d['status'] : 'draft',
    sourceAssessmentIds: arr(d['sourceAssessmentIds']),
    actions: arr(d['actions']),
    goals: arr(d['goals']),
  }),
  studies: (d) => ({
    ...d,
    name: str(d['name']) ? d['name'] : '',
    measures: arr(d['measures']),
    timepoints: arr(d['timepoints']),
    conditions: arr(d['conditions']),
    patientIds: arr(d['patientIds']),
    anonymizeExports: d['anonymizeExports'] === true,
  }),
  interventions: (d) => ({ ...d, type: str(d['type']) ? d['type'] : 'other' }),
  annotations: (d) => ({
    ...d,
    assessmentIds: arr(d['assessmentIds']),
    text: typeof d['text'] === 'string' ? d['text'] : '',
    authorRole: d['authorRole'] === 'patient' ? 'patient' : 'clinician',
  }),
  followups: (d) => ({
    ...d,
    setBy: d['setBy'] === 'patient' ? 'patient' : 'clinician',
    measures: arr(d['measures']),
    timepoints: arr(d['timepoints']),
    done: d['done'] && typeof d['done'] === 'object' && !Array.isArray(d['done']) ? d['done'] : {},
  }),
};

function schemaFor(col: CollectionName, ctx: MigrationContext): SchemaDefinition<Versioned> {
  const m0: Migration = {
    from: 0,
    to: 1,
    description: `${col} : document sans version → v1 (champs obligatoires complétés)`,
    up(raw) {
      const d: Record<string, unknown> = { ...raw };
      const created = str(d['createdAt']) ? d['createdAt'] : ctx.now;
      d['createdAt'] = created;
      d['updatedAt'] = str(d['updatedAt']) ? d['updatedAt'] : created;
      d['ownerUid'] = str(d['ownerUid']) ? d['ownerUid'] : ctx.ownerUid;
      return DEFAULTS[col](d);
    },
  };
  return { name: col, current: 1, migrations: [m0] };
}

export const CURRENT_RECORD_VERSION = 1;

/** Version d'un document brut stocké (0 si absente). */
export const recordVersion = (raw: Readonly<Record<string, unknown>>): number =>
  typeof raw['schemaVersion'] === 'number' ? raw['schemaVersion'] : 0;

/**
 * Amène un document brut au schéma courant. Retourne `null` pour un document illisible ou d'une version plus récente
 * que l'app (il reste stocké, intact).
 */
export function migrateRecord<C extends CollectionName>(
  col: C,
  raw: unknown,
  ctx: MigrationContext,
): CollectionMap[C] | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!str(r['id'])) return null;
  if (recordVersion(r) > CURRENT_RECORD_VERSION) return null;
  try {
    return migrate(schemaFor(col, ctx), r) as unknown as CollectionMap[C];
  } catch {
    return null;
  }
}

/** Pour les tests : la chaîne de migrations de chaque collection. */
export const _schemaFor = schemaFor;

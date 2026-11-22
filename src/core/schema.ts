/**
 * Migrations de schéma (docs/adr/0004-schema-versionne.md). Chaque collection déclare sa version courante et une
 * migration par saut de version (n → n+1). Les migrations sont pures, testées, et ne suppriment jamais de données
 * cliniques sans les déplacer.
 */
import { AppError } from './errors.ts';
import type { Versioned } from './types/common.ts';

export interface Migration {
  readonly from: number;
  readonly to: number;
  readonly description: string;
  up(doc: Readonly<Record<string, unknown>>): Record<string, unknown>;
}

export interface SchemaDefinition<T extends Versioned> {
  readonly name: string;
  readonly current: T['schemaVersion'];
  readonly migrations: readonly Migration[];
}

/** Version d'un document brut ; les documents v1.15 sans champ `schemaVersion` sont considérés en version 0. */
export const versionOf = (doc: Readonly<Record<string, unknown>>): number =>
  typeof doc['schemaVersion'] === 'number' ? doc['schemaVersion'] : 0;

/** Amène un document brut à la version courante ; erreur si une étape manque ou si le document est plus récent. */
export function migrate<T extends Versioned>(schema: SchemaDefinition<T>, raw: Readonly<Record<string, unknown>>): T {
  let doc: Record<string, unknown> = { ...raw };
  let v = versionOf(doc);
  if (v > schema.current) {
    throw new AppError('schema_too_new', `${schema.name} : version ${v} > ${schema.current} (mettre l'app à jour)`);
  }
  while (v < schema.current) {
    const step = schema.migrations.find((m) => m.from === v);
    if (!step || step.to !== v + 1)
      throw new AppError('schema_gap', `${schema.name} : aucune migration ${v} → ${v + 1}`);
    doc = { ...step.up(doc), schemaVersion: step.to };
    v = step.to;
  }
  return doc as unknown as T;
}

/** Vérifie qu'une définition couvre chaque saut 0…current (utilisé par les tests). */
export function assertCompleteChain(schema: SchemaDefinition<Versioned>, from = 0): void {
  for (let v = from; v < schema.current; v++) {
    if (!schema.migrations.some((m) => m.from === v && m.to === v + 1)) {
      throw new AppError('schema_gap', `${schema.name} : migration ${v} → ${v + 1} manquante`);
    }
  }
}

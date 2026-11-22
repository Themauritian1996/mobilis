/**
 * Prescription du clinicien : logique pure (aucun accès au DOM). Reprise de www/js/clinic.js (v1.15) : formulaire,
 * dose affichée et réglée, jours d'entraînement, charge utile enregistrée, partage (code, lien, message) et QR.
 * Le stockage (`store.js`) et le programme (`program.js`) restent des modules legacy (tranche T1) : chemin legacy en attendant.
 */
import { t, getLang } from '../../../www/js/i18n.js';
import * as P from '../../../www/js/program.js';
import * as store from '../../../www/js/store.js';
import { EQUIP_IDS } from '../../../www/js/equip.js';
import { PATHOLOGIES } from '../../../www/js/data/pathologies.js';

/** Dose fixée par le clinicien pour un exercice (remplace celle du niveau). */
export interface DoseOverride {
  sets?: number | undefined;
  reps?: number | undefined;
  hold?: number | undefined;
  rest?: number | undefined;
}

/** Dose affichée dans l'éditeur. */
export interface ShownDose {
  type: string;
  sets: number;
  reps: number;
  hold: number;
  rest: number;
}

/** Accès IA partagé avec le patient (désactivé par défaut). */
export interface RxAi {
  mode: string;
  proxy?: string;
  token?: string;
  key?: string;
  until?: string;
  cap?: number;
}

/** Pathologie du catalogue (champs lus ici). */
export interface PathologyDef {
  readonly id: string;
  readonly region: string;
  readonly painMax?: number;
  readonly name: unknown;
  readonly phases: Record<string, readonly string[]>;
}
export const PATHOLOGY_LIST = PATHOLOGIES as unknown as readonly PathologyDef[];
export const pathologyOf = (id: string | null | undefined): PathologyDef | undefined =>
  PATHOLOGY_LIST.find((p) => p.id === id);

/** Programme tel que stocké (champs lus ; le stockage en porte d'autres). */
export interface StoredRx {
  code?: string | null;
  localId?: string | null;
  packed?: string;
  lang?: string;
  clinician?: string;
  region?: string;
  pathology?: string | null;
  phase?: number;
  ids?: string[];
  levels?: Record<string, number>;
  auto?: boolean;
  notes?: string;
  nextVisit?: string;
  label?: string;
  version?: number;
  created?: number | null;
  days?: number[];
  equip?: string[] | null;
  side?: string | null;
  dose?: Record<string, DoseOverride>;
  autoEx?: Record<string, boolean>;
  maxLevel?: Record<string, number>;
  partial?: Record<string, boolean>;
  prom?: unknown[];
  promCustom?: unknown[];
  promTexts?: Record<string, unknown>;
  rom?: unknown;
  protocol?: unknown;
  report?: unknown;
  ai?: RxAi | null;
  archived?: boolean;
  [key: string]: unknown;
}

/** Formulaire d'édition d'un programme (état `state.clinic`). */
export interface RxForm {
  code: string | null;
  clinician: string;
  region: string;
  pathology: string | null;
  phase: number;
  ids: string[];
  levels: Record<string, number>;
  auto: boolean;
  notes: string;
  nextVisit: string;
  label: string;
  version: number;
  created: number | null;
  days: number[];
  lang: string;
  localId: string | null;
  equip: string[] | null;
  side: string | null;
  dose: Record<string, DoseOverride>;
  autoEx: Record<string, boolean>;
  maxLevel: Record<string, number>;
  partial: Record<string, boolean>;
  open: string | null;
  prom: unknown[];
  promCustom: unknown[];
  promTexts: Record<string, unknown>;
  rom: unknown;
  protocol: unknown;
  report: unknown;
  ai: RxAi | null;
}

const clone = <X>(x: X): X => JSON.parse(JSON.stringify(x)) as X;

/** Formulaire initial : celui du programme chargé, sinon un programme vide (épaule, phase 1, 3 jours). */
export function newRxForm(
  code: string | null | undefined,
  rx: StoredRx | null | undefined,
  prof: { clinicianName?: string; name?: string },
): RxForm {
  return {
    code: code || null,
    clinician: rx?.clinician || prof.clinicianName || prof.name || '',
    region: rx?.region || 'shoulder',
    pathology: rx?.pathology || null,
    phase: rx?.phase || 1,
    ids: rx?.ids || [],
    levels: { ...(rx?.levels || {}) },
    auto: rx ? !!rx.auto : true,
    notes: rx?.notes || '',
    nextVisit: rx?.nextVisit || '',
    label: rx?.label || '',
    version: rx?.version || 0,
    created: rx?.created || null,
    days: rx?.days || [1, 3, 5],
    lang: rx?.lang || getLang(),
    localId: rx?.localId || null,
    equip: rx?.equip || null,
    side: rx?.side || null,
    dose: clone(rx?.dose || {}),
    autoEx: { ...(rx?.autoEx || {}) },
    maxLevel: { ...(rx?.maxLevel || {}) },
    partial: { ...(rx?.partial || {}) },
    open: null,
    prom: clone(rx?.prom || []),
    promCustom: clone(rx?.promCustom || []),
    promTexts: { ...(rx?.promTexts || {}) },
    rom: rx?.rom || null,
    protocol: rx?.protocol || null,
    report: rx?.report || null,
    ai: rx?.ai ? { ...rx.ai } : null,
  };
}

/** Référence d'un programme : son code, sinon son identifiant local. */
export const rxRef = (rx: Pick<StoredRx, 'code' | 'localId'>): string => rx.code || rx.localId || '';
/** Lien d'import d'un programme. */
export const linkOf = (rx: Pick<StoredRx, 'code' | 'packed' | 'lang'>): string =>
  store.rxLink(rx.code || rx.packed, rx.lang);
/** Message de partage : le code (formaté) ou, sans code, le lien. */
export const shareMessage = (code: string | null | undefined): string =>
  code ? t('shareMsgCode').replace('{code}', store.fmtCode(code)) : t('shareMsgLink');

/** QR du lien d'import (SVG en ligne) ; chaîne vide si le générateur est indisponible. */
export async function qrSvg(link: string): Promise<string> {
  try {
    const { default: qrcode } = await import('../../../www/vendor/qrcode.js');
    const qr = qrcode(0, 'M');
    qr.addData(link);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  } catch (e) {
    console.warn(e);
    return '';
  }
}

/** Exercices d'une région, hors ceux déjà au programme (liste des ajouts possibles). */
export function regionExercises(region: string): string[] {
  return [...new Set(PATHOLOGY_LIST.filter((p) => p.region === region).flatMap((p) => Object.values(p.phases).flat()))];
}

/** Niveau d'un exercice dans le formulaire (2 par défaut). */
export const levelIn = (f: Pick<RxForm, 'levels'>, id: string): number => f.levels[id] || 2;

/** Dose affichée : celle du niveau, remplacée par la dose fixée par le clinicien s'il y en a une. */
export function shownDose(id: string, level: number, o: DoseOverride | undefined): ShownDose {
  const d = P.doseFor(id, level) as unknown as ShownDose;
  d.rest = P.DEFAULT_REST;
  if (o) {
    if (o.sets) d.sets = o.sets;
    if (o.reps && d.type === 'reps') d.reps = o.reps;
    if (o.hold && d.type === 'hold') d.hold = o.hold;
    if (o.rest !== null && o.rest !== undefined) d.rest = o.rest;
  }
  return d;
}

export type DoseKey = 'sets' | 'reps' | 'hold' | 'rest';
/** Bornes et pas de chaque réglage de dose : [min, max, pas]. */
export const DOSE_LIMITS: Record<DoseKey, readonly [number, number, number]> = {
  sets: [1, 6, 1],
  reps: [3, 30, 1],
  hold: [5, 120, 5],
  rest: [0, 180, 15],
};
/** Dose fixée après un pas sur un réglage (`dir` = ±1), à partir de la dose affichée. */
export function steppedDose(d: ShownDose, k: DoseKey, dir: number): DoseOverride {
  const [lo, hi, step] = DOSE_LIMITS[k];
  const v = Math.max(lo, Math.min(hi, (d[k] ?? 0) + step * dir));
  return { sets: d.sets, rest: d.rest, ...(d.type === 'hold' ? { hold: d.hold } : { reps: d.reps }), [k]: v };
}

/** Changement de niveau d'un exercice : la dose fixée suit le niveau et le plafond ne passe pas sous le niveau. */
export function setLevel(f: RxForm, id: string, dir: number): void {
  const old = levelIn(f, id);
  const nv = Math.max(1, Math.min(5, old + dir));
  f.levels[id] = nv;
  const o = f.dose[id];
  if (o) f.dose[id] = P.scaleDose(id, o, old, nv); // la dose fixée suit le niveau
  const mx = f.maxLevel[id];
  if (mx && mx < nv) f.maxLevel[id] = nv;
}

/** Plafond de niveau après un pas ; 5 (aucun plafond) supprime l'entrée. */
export function stepMaxLevel(f: RxForm, id: string, dir: number): void {
  const v = Math.max(levelIn(f, id), Math.min(5, (f.maxLevel[id] || 5) + dir));
  if (v >= 5) Reflect.deleteProperty(f.maxLevel, id);
  else f.maxLevel[id] = v;
}

/** Bascule d'un réglage « vrai par défaut » (auto-progression, répétitions partielles) : seul `false` est stocké. */
export function toggleDefaultOn(map: Record<string, boolean>, id: string): void {
  if (map[id] === false) Reflect.deleteProperty(map, id);
  else map[id] = false;
}

/** Déplace un exercice d'un cran (le tableau est modifié sur place). */
export function moveId(ids: string[], id: string, dir: number): void {
  const i = ids.indexOf(id);
  const j = i + dir;
  const a = ids[i];
  const b = ids[j];
  if (j >= 0 && j < ids.length && a !== undefined && b !== undefined) {
    ids[i] = b;
    ids[j] = a;
  }
}

/** Remplace un exercice par un équivalent (niveau repris, dose fixée supprimée). */
export function replaceExercise(f: RxForm, from: string, to: string): void {
  const i = f.ids.indexOf(from);
  if (i >= 0) {
    f.ids[i] = to;
    f.levels[to] = f.levels[from] || 2;
    Reflect.deleteProperty(f.dose, from);
  }
}

/** Matériel du patient après bascule d'un élément (tout le matériel par défaut). */
export function toggleEquip(equip: readonly string[] | null, e: string): string[] {
  const cur = equip || [...(EQUIP_IDS as readonly string[])];
  return cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e];
}

/** Jours d'entraînement proposés selon le nombre de séances par semaine. */
export const DAYS_BY_FREQ: Record<number, number[]> = {
  1: [3],
  2: [1, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 4, 5],
  6: [1, 2, 3, 4, 5, 6],
  7: [0, 1, 2, 3, 4, 5, 6],
};

/** Ne garde que les entrées des exercices du programme. */
export function onlyIds<X>(f: Pick<RxForm, 'ids'>, o: Record<string, X> | null | undefined): Record<string, X> {
  return Object.fromEntries(Object.entries(o || {}).filter(([id]) => f.ids.includes(id)));
}
/** Niveau de chaque exercice du programme. */
export const levelsOf = (f: Pick<RxForm, 'ids' | 'levels'>): Record<string, number> =>
  Object.fromEntries(f.ids.map((id) => [id, f.levels[id] || 2]));

/** Programme d'essai (« tester comme un patient ») : jamais enregistré, sans code. */
export function trialRx(f: RxForm): StoredRx {
  return {
    ...f,
    levels: levelsOf(f),
    code: null,
    dose: onlyIds(f, f.dose),
    autoEx: onlyIds(f, f.autoEx),
    maxLevel: onlyIds(f, f.maxLevel),
    partial: onlyIds(f, f.partial),
  };
}

/** Charge utile enregistrée (sans accès IA : voir `withAi`). */
export function rxPayload(f: RxForm): StoredRx {
  return {
    code: f.code,
    clinician: f.clinician.trim(),
    label: f.label.trim(),
    region: f.region,
    pathology: f.pathology,
    phase: f.phase,
    ids: f.ids,
    levels: levelsOf(f),
    auto: f.auto,
    notes: f.notes.trim(),
    nextVisit: f.nextVisit || null,
    days: f.days,
    version: f.version,
    created: f.created,
    lang: f.lang || getLang(),
    equip: f.equip || null,
    side: f.side || null,
    dose: onlyIds(f, f.dose),
    autoEx: onlyIds(f, f.autoEx),
    maxLevel: onlyIds(f, f.maxLevel),
    partial: onlyIds(f, f.partial),
    prom: f.prom || [],
    promCustom: f.promCustom || [],
    promTexts: f.promTexts || {},
    rom: f.rom || null,
    protocol: f.protocol || null,
    report: f.report || null,
    ai: null,
  } as StoredRx;
}

/** Accès IA nettoyé, ou null s'il est invalide (proxy sans https). */
export function cleanSharedAi(ai: RxAi): RxAi | null {
  const c = store.cleanAI(ai) as RxAi | null;
  if (!c || (c.mode === 'proxy' && !/^https:\/\//i.test(c.proxy || ''))) return null;
  return c;
}

/** Patients à surveiller : poussée, douleur au-dessus du seuil de la pathologie, assiduité < 50 %. */
export interface WatchedPatient {
  flare?: boolean;
  pain7?: number | null;
  planned?: number;
  sessions7: number;
}
export function watchCount(
  list: readonly { pathology?: string | null; patients?: readonly WatchedPatient[] }[],
): number {
  return list
    .flatMap((rx) => (rx.patients || []).map((p) => ({ p, max: pathologyOf(rx.pathology)?.painMax ?? 4 })))
    .filter(
      ({ p, max }) =>
        p.flare ||
        (p.pain7 !== null && p.pain7 !== undefined && p.pain7 > max) ||
        (p.planned && p.sessions7 / p.planned < 0.5),
    ).length;
}

/** Base du nom du fichier CSV d'un patient (sans accents ni ponctuation). */
export function patientFileBase(name: string | null | undefined): string {
  return (
    String(name || 'patient')
      .normalize('NFD')
      .replace(/[^\w]+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase() || 'patient'
  );
}

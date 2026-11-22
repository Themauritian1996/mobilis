// Matériel du patient : remplacements maison et exercices équivalents sans le matériel manquant.
import { locale, t } from '../../core/i18n/engine.ts';
import {
  EQUIP,
  EXERCISES,
  EX_ANATOMY,
  PATHOLOGIES,
  moveOf,
  subsOf,
  targetKg,
  type SubstituteDef,
} from './internal/legacy-data.ts';
import type { Profile } from './types.ts';

export const EQUIP_IDS: string[] = Object.keys(EQUIP);
// Matériel « de maison » qu'on suppose disponible tant que le patient n'a rien indiqué
export const HOUSE = ['chair', 'wall', 'table', 'towel', 'mat'];

// Matériel disponible : liste du patient (ou du clinicien), sinon tout est supposé disponible
export const haveList = (profile: Pick<Profile, 'equipment'> | null | undefined): string[] | null =>
  Array.isArray(profile?.equipment) ? profile.equipment : null;
export function missing(id: string, have: readonly string[] | null | undefined): string[] {
  if (!have) return [];
  return (EXERCISES[id]?.equip || []).filter((e) => !have.includes(e));
}

// Exercices de remplacement : même région, mêmes structures anatomiques, matériel disponible, même type d'analyse
export function alternatives(
  id: string,
  have: readonly string[] | null | undefined,
  { exclude = [] }: { exclude?: readonly string[] } = {},
): string[] {
  const ex = EXERCISES[id];
  if (!ex) return [];
  const anat = new Set(EX_ANATOMY[id] || []);
  const inPath = new Set(
    PATHOLOGIES.filter((p) => Object.values(p.phases).flat().includes(id)).flatMap((p) =>
      Object.values(p.phases).flat(),
    ),
  );
  return Object.entries(EXERCISES)
    .filter(
      ([k, e]) =>
        k !== id && !exclude.includes(k) && e.region === ex.region && missing(k, have || EQUIP_IDS).length === 0,
    )
    .map(([k, e]) => {
      const a = (EX_ANATOMY[k] || []).filter((x) => anat.has(x)).length;
      return {
        id: k,
        score: a * 3 + (inPath.has(k) ? 2 : 0) + (!!e.track === !!ex.track ? 1 : 0) - (e.equip || []).length * 0.2,
        anat: a,
      };
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.id);
}

// ---------- Objets de remplacement : classement selon la charge visée ----------
export { targetKg, moveOf };

type Kg = number | [number, number];
type Match = 'na' | 'ok' | 'light' | 'heavy';
interface LoadMatch {
  ratio: number | null;
  match: Match;
  useKg: number | null;
  adjustable?: boolean;
}
// Rapport charge de l'objet / charge visée ; un objet réglable (sac à dos…) atteint la cible s'elle est dans sa plage
function loadMatch(kg: Kg | null | undefined, target: number | null): LoadMatch {
  if (target === undefined || target === null || !kg) return { ratio: null, match: 'na', useKg: null };
  if (Array.isArray(kg)) {
    if (target >= kg[0] && target <= kg[1]) return { ratio: 1, match: 'ok', useKg: target, adjustable: true };
    const near = target < kg[0] ? kg[0] : kg[1];
    const r = near / target;
    return { ratio: r, match: r < 0.6 ? 'light' : r > 1.6 ? 'heavy' : 'ok', useKg: near, adjustable: true };
  }
  const r = kg / target;
  return { ratio: r, match: r < 0.6 ? 'light' : r > 1.6 ? 'heavy' : 'ok', useKg: kg };
}
export interface SubstituteMatch {
  sub: SubstituteDef;
  equip: string;
  kg: Kg;
  useKg: number | null;
  target: number | null;
  match: Match;
  score: number;
}
// Remplacements classés pour un exercice : { sub, equip, kg, useKg, target, match, score } (meilleur d'abord).
// Matériel visé : celui qui manque (selon `have`) ; sans liste du patient, tout le matériel de l'exercice.
export function substitutesFor(exId: string, level = 3, have: readonly string[] | null = null): SubstituteMatch[] {
  const ex = EXERCISES[exId];
  if (!ex) return [];
  const equips = (have ? missing(exId, have) : ex.equip || []).filter((e) => subsOf(e).length);
  const target = targetKg(exId, level);
  const out: SubstituteMatch[] = [];
  equips.forEach((e, ei) => {
    const mv = moveOf(exId, e);
    subsOf(e)
      .filter((s) => s.fits.includes(mv) || s.fits.includes('any'))
      .forEach((s, i) => {
        const m = loadMatch(s.kg, target);
        const score =
          m.ratio === undefined || m.ratio === null
            ? 50 - i * 0.1 - ei
            : 100 - Math.abs(Math.log(m.ratio)) * 40 + (m.adjustable ? 5 : 0) - i * 0.01 - ei;
        out.push({ sub: s, equip: e, kg: s.kg, useKg: m.useKg, target, match: m.match, score });
      });
  });
  return out.sort((a, b) => b.score - a.score);
}

// ---------- Règle locale : mots-clés + poids estimé -> avis (sans IA) ----------
const norm = (s: unknown): string =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
const LD = ['wrist', 'curl', 'raise', 'ankle', 'lever'];
interface Keyword {
  k: string;
  re: RegExp;
  kg?: number;
  fits?: string[];
  haz?: string;
  vol?: boolean;
  adj?: boolean;
}
const KW: Keyword[] = [
  {
    k: 'unsafe',
    re: /couteau|knife|\bverre\b|glass|vitre|ciseaux|scissors|cutter|\btasse|\bmug\b|assiette|\bplate\b|porcelaine|ceramic|\bvase|lampe|\blamp|bouilloire|kettle|bouillant|boiling|\bchaud|\bhot\b|fer a repasser|laptop|ordinateur|animal|\bchat\b|\bcat\b|\bchien|\bdog\b|\bbebe|\bbaby|\benfant|\bchild/,
  },
  { k: 'cast', re: /fonte|cast iron|enclume|anvil/, kg: 3, fits: ['lever', 'curl', 'raise'], haz: 'heavy' },
  { k: 'dumbbell', re: /haltere|dumbbell|kettlebell|poids libre/, kg: 1, fits: LD },
  { k: 'hammer', re: /marteau|hammer/, kg: 0.5, fits: ['lever'] },
  { k: 'ladle', re: /louche|ladle|cuillere|spoon|spatule|spatula|fouet|whisk/, kg: 0.15, fits: ['lever'] },
  { k: 'pan', re: /poele|frying|skillet|casserole|\bpan\b/, kg: 0.8, fits: ['lever'] },
  {
    k: 'phone',
    re: /cellulaire|telephone|smartphone|iphone|\bphone|portable/,
    kg: 0.2,
    fits: ['wrist', 'curl', 'raise'],
  },
  { k: 'bottle', re: /bouteille|bottle|gourde|flasque|bidon|jug|canette|soda/, kg: 1, fits: LD, vol: true },
  { k: 'can', re: /conserve|boite de|tin can|\bcan\b/, kg: 0.4, fits: ['wrist', 'curl', 'raise'] },
  {
    k: 'sock',
    re: /chaussette.*(riz|rice|sable|sand)|sock.*(rice|sand)/,
    kg: 0.6,
    fits: ['wrist', 'curl', 'raise'],
  },
  {
    k: 'bag',
    re: /\briz\b|farine|sucre|\bsel\b|rice|flour|sugar|lentille|haricot|beans|\bsac de|bag of/,
    kg: 1,
    fits: ['curl', 'raise', 'ankle'],
    haz: 'unstable',
  },
  {
    k: 'backpack',
    re: /sac a dos|backpack|sac de sport|rucksack/,
    kg: 2,
    fits: ['curl', 'raise', 'ankle'],
    adj: true,
  },
  {
    k: 'brick',
    re: /brique|pierre|roche|brick|\brock\b|stone|beton|concrete/,
    kg: 2,
    fits: ['curl', 'raise'],
    haz: 'rough',
  },
  { k: 'book', re: /livre|\bbook|dictionnaire|dictionary/, kg: 0.7, fits: ['wrist', 'curl'] },
  {
    k: 'step',
    re: /marche\b|escalier|stair|tabouret|stool|annuaire|phone book|bottin|\bblock\b|bloc/,
    kg: 0,
    fits: ['step'],
  },
  {
    k: 'stick',
    re: /balai|broom|parapluie|umbrella|canne|\bcane\b|baton|stick|rouleau|rolling pin|manche|vadrouille|\bmop\b|\btube\b/,
    kg: 0.4,
    fits: ['stick', 'twist'],
  },
  {
    k: 'cloth',
    re: /serviette|towel|collant|tights|ceinture|\bbelt\b|foulard|scarf|corde|\brope\b|elastique|\bband\b|chambre a air|t-?shirt|taie|pillowcase|chandail/,
    kg: 0,
    fits: ['band', 'towel', 'twist', 'stick'],
  },
  {
    k: 'squeeze',
    re: /\bballe|\bball\b|eponge|sponge|chaussette|\bsock|pate a|putty|slime|play-?doh/,
    kg: 0.1,
    fits: ['squeeze'],
  },
  {
    k: 'surface',
    re: /comptoir|counter|commode|dresser|\btable|chaise|chair|banc\b|bench|\blit\b|\bbed\b|\bmur\b|\bwall|porte|door|armoire|cupboard|couverture|blanket|tapis|\brug\b|\bmat\b|oreiller|pillow/,
    kg: 0,
    fits: ['mat', 'chair', 'wall', 'table', 'towel'],
  },
];
// Poids écrit par le patient : « 2 kg », « 500 g », « 1 l », « 750 ml », « 5 lb »
export function parseKg(text: unknown): number | null {
  const s = norm(text).replace(',', '.');
  const m = s.match(
    /(\d+(?:\.\d+)?)\s*(kilos?|kgs?|kg|livres?|lbs?|lb|grammes?|gr|g|litres?|liters?|l|ml|cl|dl|oz|onces?)\b/,
  );
  if (!m) return null;
  const n = parseFloat(m[1] as string),
    u = m[2] as string;
  if (/^(kilo|kg)/.test(u)) return n;
  if (/^(livre|lb)/.test(u)) return n * 0.454;
  if (/^(gramme|gr$|g$)/.test(u)) return n / 1000;
  if (/^(litre|liter|l$)/.test(u)) return n;
  if (u === 'ml') return n / 1000;
  if (u === 'cl') return n / 100;
  if (u === 'dl') return n / 10;
  return n * 0.028;
}
const rnd = (x: number): number => Math.round(x * 100) / 100;
export interface LocalVerdict {
  verdict: 'ok' | 'caution' | 'no';
  kgEstimate: number | null;
  reason: string;
  source: 'local';
}
// -> { verdict: 'ok'|'caution'|'no', kgEstimate, reason, source:'local' } ; reason est un texte dans la langue courante
export function localVerdict(exId: string, level: number, text: unknown): LocalVerdict | null {
  const ex = EXERCISES[exId];
  if (!ex || !String(text || '').trim()) return null;
  const s = norm(text),
    target = targetKg(exId, level);
  const mvs = new Set((ex.equip || []).map((e) => moveOf(exId, e)));
  const explicit = parseKg(text);
  const bad = (KW[0] as Keyword).re.test(s);
  const ent = bad ? null : KW.slice(1).find((e) => e.re.test(s));
  const obj = String(text).trim();
  const numL = (n: number): string => {
    try {
      return Number(n).toLocaleString(locale());
    } catch {
      return String(n);
    }
  };
  const V = (
    verdict: LocalVerdict['verdict'],
    kgEstimate: number | null,
    key: string,
    vars: Readonly<Record<string, unknown>> = {},
  ): LocalVerdict => ({
    verdict,
    kgEstimate: kgEstimate === undefined || kgEstimate === null ? null : rnd(kgEstimate),
    reason: t(key, {
      obj,
      kg: kgEstimate === undefined || kgEstimate === null ? '?' : numL(rnd(kgEstimate)),
      target: target === undefined || target === null ? '' : numL(target),
      ...vars,
    }),
    source: 'local',
  });
  if (bad) return V('no', explicit, 'eqR_unsafe');
  if (!ent && (explicit === undefined || explicit === null)) return V('caution', null, 'eqR_unknown');
  const kg = explicit ?? (ent ? (ent.kg as number) : null);
  const kindOk =
    !ent ||
    [...mvs].some((m) => (ent.fits as string[]).includes(m)) ||
    (explicit !== undefined && explicit !== null && !ent);
  if (target === undefined || target === null) {
    // exercice sans charge : l'objet doit jouer le même rôle (élastique, bâton, marche, appui…)
    if (!ent) return V('caution', kg, 'eqR_unknown');
    return kindOk ? V('ok', kg, 'eqR_kindOk') : V('caution', kg, 'eqR_kind');
  }
  if (!kg) return V(ent && (ent.fits as string[]).includes('lever') ? 'caution' : 'no', 0, 'eqR_light');
  const r = kg / target;
  const worst = (v: LocalVerdict['verdict']): LocalVerdict['verdict'] => v;
  let verdict: LocalVerdict['verdict'] =
    r < 0.25 ? 'no' : r < 0.5 ? 'caution' : r <= 1.75 ? 'ok' : r <= 2.5 ? 'caution' : 'no';
  let key = r < 0.5 ? 'eqR_light' : r > 1.75 ? 'eqR_heavy' : 'eqR_load';
  if (ent && !kindOk && verdict === 'ok') {
    verdict = 'caution';
    key = 'eqR_kind';
  }
  if (ent?.haz === 'unstable' && mvs.has('wrist') && verdict === 'ok') {
    verdict = 'caution';
    key = 'eqR_unstable';
  }
  if (ent?.haz === 'unstable' && mvs.has('wrist') && verdict === 'caution' && r <= 1.75) key = 'eqR_unstable';
  if (ent?.haz === 'rough' && verdict === 'ok') {
    verdict = 'caution';
    key = 'eqR_rough';
  }
  if (ent?.haz === 'heavy' && verdict === 'ok') {
    verdict = 'caution';
    key = 'eqR_heavy';
  }
  return V(worst(verdict), kg, key);
}

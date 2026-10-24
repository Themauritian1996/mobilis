// Matériel du patient : remplacements maison et exercices équivalents sans le matériel manquant.
import { EXERCISES, EQUIP } from './data/exercises.js';
import { EX_ANATOMY } from './data/anatomy.js';
import { PATHOLOGIES } from './data/pathologies.js';

export const EQUIP_IDS = Object.keys(EQUIP);
// Matériel « de maison » qu'on suppose disponible tant que le patient n'a rien indiqué
export const HOUSE = ['chair', 'wall', 'table', 'towel', 'mat'];

// Matériel disponible : liste du patient (ou du clinicien), sinon tout est supposé disponible
export const haveList = (profile) => (Array.isArray(profile?.equipment) ? profile.equipment : null);
export function missing(id, have) {
  if (!have) return [];
  return (EXERCISES[id]?.equip || []).filter((e) => !have.includes(e));
}

// Exercices de remplacement : même région, mêmes structures anatomiques, matériel disponible, même type d'analyse
export function alternatives(id, have, { exclude = [] } = {}) {
  const ex = EXERCISES[id]; if (!ex) return [];
  const anat = new Set(EX_ANATOMY[id] || []);
  const inPath = new Set(PATHOLOGIES.filter((p) => Object.values(p.phases).flat().includes(id)).flatMap((p) => Object.values(p.phases).flat()));
  return Object.entries(EXERCISES)
    .filter(([k, e]) => k !== id && !exclude.includes(k) && e.region === ex.region && missing(k, have || EQUIP_IDS).length === 0)
    .map(([k, e]) => {
      const a = (EX_ANATOMY[k] || []).filter((x) => anat.has(x)).length;
      return { id: k, score: a * 3 + (inPath.has(k) ? 2 : 0) + (!!e.track === !!ex.track ? 1 : 0) - (e.equip || []).length * 0.2, anat: a };
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((x) => x.id);
}

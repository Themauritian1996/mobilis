// Objets de maison qui remplacent le matériel manquant (FR/EN) + charge visée par exercice et niveau.
// kg    : poids approximatif (nombre) ou [min, max] quand il se règle (sac à dos, sac de riz…).
// fits  : types de mouvement pour lesquels l'objet convient (voir MOVE). 'any' = tous les exercices de ce matériel.
// Les charges visées sont volontairement prudentes (réadaptation) : niveau 1 à 5.
import type { Bilingual, KgValue, Substitute } from './types.ts';

const S = (fr: string, en: string): Bilingual => ({ fr, en });

// Type de mouvement par exercice chargé (sinon : type du matériel, voir moveOf)
export const MOVE: Readonly<Record<string, string>> = {
  scaption: 'raise',
  elbow_curl: 'curl',
  ecc_wrist_ext: 'wrist',
  ecc_wrist_flex: 'wrist',
  pron_sup: 'lever',
  radial_dev: 'lever',
  knee_ext_sit: 'ankle',
};
const EQUIP_MOVE: Readonly<Record<string, string>> = {
  dumbbell: 'raise',
  weight: 'ankle',
  hammer: 'lever',
  band: 'band',
  stick: 'stick',
  step: 'step',
  flexbar: 'twist',
  putty: 'squeeze',
  towel: 'towel',
  mat: 'mat',
  chair: 'chair',
  wall: 'wall',
  table: 'table',
};
const LOAD_EQUIP = new Set(['dumbbell', 'weight', 'hammer']);
export const moveOf = (exId: string, equipId: string): string =>
  (LOAD_EQUIP.has(equipId) && MOVE[exId]) || EQUIP_MOVE[equipId] || 'any';

// Charge visée (kg) aux niveaux 1 à 5, par exercice (zone et mouvement). Pas de kg dans les doses : dérivé de façon conservative.
export const TARGET_KG = {
  ecc_wrist_ext: [0.3, 0.5, 0.5, 1, 1.5],
  ecc_wrist_flex: [0.3, 0.5, 0.5, 1, 1.5],
  elbow_curl: [0.5, 1, 1.5, 2, 3],
  scaption: [0.3, 0.5, 1, 1.5, 2],
  knee_ext_sit: [0.5, 1, 1.5, 2, 3],
  pron_sup: [0.2, 0.3, 0.4, 0.5, 0.6],
  radial_dev: [0.2, 0.3, 0.4, 0.5, 0.6],
};
export const targetKg = (exId: string, level = 3): number | null => {
  const a = (TARGET_KG as Readonly<Record<string, readonly number[]>>)[exId];
  if (!a) return null;
  return a[Math.max(1, Math.min(5, Math.round(level) || 3)) - 1] ?? null;
};

const L = ['wrist', 'curl', 'raise', 'ankle'];
export const SUBSTITUTES = [
  // Haltère
  {
    id: 'phone',
    equip: 'dumbbell',
    name: S('Cellulaire', 'Phone'),
    kg: 0.2,
    fits: ['wrist', 'curl', 'raise'],
    grip: S('Tiens-le fermement dans la paume, avec son étui.', 'Hold it firmly in your palm, with its case.'),
    safety: S(
      'Garde la main au-dessus d’un lit ou d’un coussin : il glisse.',
      'Keep your hand over a bed or cushion: it can slip.',
    ),
  },
  {
    id: 'can',
    equip: 'dumbbell',
    name: S('Boîte de conserve', 'Tin can'),
    kg: 0.4,
    fits: L.slice(0, 3),
    grip: S('Prise en cylindre, pouce autour de la boîte.', 'Cylinder grip, thumb around the can.'),
    safety: S('Évite les bords tranchants et les boîtes mouillées.', 'Avoid sharp rims and wet cans.'),
  },
  {
    id: 'bottle500',
    equip: 'dumbbell',
    name: S('Bouteille d’eau 500 ml', 'Water bottle 500 ml'),
    kg: 0.5,
    fits: ['wrist', 'curl', 'raise'],
    grip: S('Bouchon bien fermé, tiens-la par le milieu.', 'Cap closed tight, hold it by the middle.'),
    safety: S('Bouteille bien fermée ; ne la serre pas trop fort.', 'Cap tightly closed; don’t squeeze too hard.'),
  },
  {
    id: 'bottle1',
    equip: 'dumbbell',
    name: S('Bouteille d’eau 1 L', 'Water bottle 1 L'),
    kg: 1,
    fits: ['curl', 'raise', 'wrist', 'ankle'],
    grip: S('Prise à pleine main ; essuie-la si elle est mouillée.', 'Full-hand grip; dry it if wet.'),
    safety: S(
      'Bouchon fermé ; pour le poignet, descends à 500 ml si ça tire.',
      'Cap closed; for the wrist, drop to 500 ml if it pulls.',
    ),
  },
  {
    id: 'bottle2',
    equip: 'dumbbell',
    name: S('Bouteille 2 L', '2 L bottle'),
    kg: 2,
    fits: ['curl', 'raise', 'ankle'],
    grip: S(
      'Prise par la poignée ou le goulot, coude près du corps.',
      'Grip by the handle or neck, elbow close to the body.',
    ),
    safety: S(
      'Trop lourd pour le poignet : ne l’utilise pas pour les flexions du poignet.',
      'Too heavy for the wrist: don’t use it for wrist curls.',
    ),
  },
  {
    id: 'detergent',
    equip: 'dumbbell',
    name: S('Bidon de savon à lessive', 'Laundry detergent jug'),
    kg: [1.5, 2.5],
    fits: ['curl', 'raise'],
    grip: S('Prise par la poignée, bouchon bien fermé.', 'Hold by the handle, cap closed.'),
    safety: S('Vérifie qu’il ne coule pas ; poignée solide.', 'Check it doesn’t leak; sturdy handle.'),
  },
  {
    id: 'rice',
    equip: 'dumbbell',
    name: S('Sac de riz ou de farine', 'Bag of rice or flour'),
    kg: [1, 2],
    fits: ['curl', 'raise'],
    grip: S(
      'Prise à deux mains pour les élévations ; sac bien scellé, ça se déforme dans la main.',
      'Two-hand hold for raises; sealed bag, it shifts in the hand.',
    ),
    safety: S('Pas pour les flexions du poignet : prise instable.', 'Not for wrist curls: unstable grip.'),
  },
  {
    id: 'sock',
    equip: 'dumbbell',
    name: S('Chaussette remplie de riz', 'Sock filled with rice'),
    kg: [0.3, 1],
    fits: ['wrist', 'curl', 'raise'],
    grip: S('Noue le bout ; tiens le nœud ou le milieu.', 'Knot the end; hold the knot or the middle.'),
    safety: S('Noeud solide pour qu’elle ne s’ouvre pas.', 'Tie it securely so it doesn’t open.'),
  },
  {
    id: 'book',
    equip: 'dumbbell',
    name: S('Livre', 'Book'),
    kg: [0.5, 1.2],
    fits: ['wrist', 'curl'],
    grip: S('Tenu à plat dans la paume, dos du livre dans la main.', 'Held flat in the palm, spine in the hand.'),
    safety: S('Il peut glisser : garde-le près de ton corps.', 'It can slip: keep it close to your body.'),
  },
  {
    id: 'backpack',
    equip: 'dumbbell',
    name: S('Sac à dos avec livres', 'Backpack with books'),
    kg: [1, 5],
    fits: ['curl', 'raise', 'ankle'],
    grip: S(
      'Tiens la bretelle ou la poignée ; règle le poids avec les livres.',
      'Hold the strap or handle; set the weight with books.',
    ),
    safety: S(
      'Ferme les fermetures ; ajoute les livres un à un, sans dépasser la charge visée.',
      'Zip it up; add books one by one, never above the target load.',
    ),
  },
  // Poids de cheville
  {
    id: 'ank_bag',
    equip: 'weight',
    name: S('Sac à dos léger accroché à la cheville', 'Light backpack hooked on the ankle'),
    kg: [1, 3],
    fits: ['ankle', 'any'],
    grip: S(
      'Passe une bretelle au-dessus du cou-de-pied, juste au-dessus de la cheville.',
      'Loop a strap over the instep, just above the ankle.',
    ),
    safety: S(
      'Assis, mouvement lent ; si la bretelle serre ou glisse, enlève-la.',
      'Seated, slow movement; if the strap pinches or slips, take it off.',
    ),
  },
  {
    id: 'ank_sock',
    equip: 'weight',
    name: S('Bouteille 1 L dans une chaussette longue', '1 L bottle in a long sock'),
    kg: 1,
    fits: ['ankle', 'any'],
    grip: S(
      'Noue la chaussette autour de la cheville, bouteille sur le dessus du pied.',
      'Tie the sock around the ankle, bottle over the foot.',
    ),
    safety: S('Pas trop serré : arrête si les orteils s’engourdissent.', 'Not too tight: stop if your toes go numb.'),
  },
  {
    id: 'ank_tote',
    equip: 'weight',
    name: S('Sac de tissu avec 2 bouteilles', 'Tote bag with 2 bottles'),
    kg: 2,
    fits: ['ankle', 'any'],
    grip: S('Anses passées sur la cheville ; bouteilles bien calées.', 'Handles over the ankle; bottles wedged in.'),
    safety: S('Charge minimale d’abord, puis monte.', 'Start with the minimum, then build up.'),
  },
  // Marteau (levier : l'effort vient de la distance au poids)
  {
    id: 'ham_bottle',
    equip: 'hammer',
    name: S('Bouteille 500 ml tenue par le goulot', '500 ml bottle held by the neck'),
    kg: 0.5,
    fits: ['lever'],
    grip: S(
      'Tiens le goulot, le corps de la bouteille dépasse comme la tête du marteau.',
      'Hold the neck, the bottle body sticks out like the hammer head.',
    ),
    safety: S('Bouchon fermé ; avant-bras posé sur une table.', 'Cap closed; forearm resting on a table.'),
  },
  {
    id: 'ham_ladle',
    equip: 'hammer',
    name: S('Louche', 'Ladle'),
    kg: 0.25,
    fits: ['lever'],
    grip: S('Tiens le bout du manche, le creux vers le haut.', 'Hold the end of the handle, bowl up.'),
    safety: S(
      'Bon pour le niveau 1 : très léger, long bras de levier.',
      'Good for level 1: very light, long lever arm.',
    ),
  },
  {
    id: 'ham_pan',
    equip: 'hammer',
    name: S('Poêle légère', 'Light frying pan'),
    kg: [0.5, 0.9],
    fits: ['lever'],
    grip: S(
      'Tiens le manche près du bout ; plus tu t’approches de la poêle, plus c’est facile.',
      'Hold the handle near the end; the closer to the pan, the easier.',
    ),
    safety: S(
      'Pas de poêle en fonte (trop lourde) ; garde le coude immobile.',
      'No cast-iron pan (too heavy); keep the elbow still.',
    ),
  },
  {
    id: 'ham_spoon',
    equip: 'hammer',
    name: S('Grosse cuillère de bois', 'Big wooden spoon'),
    kg: 0.1,
    fits: ['lever'],
    grip: S('Tiens-la par le milieu du manche.', 'Hold it by the middle of the handle.'),
    safety: S(
      'Très léger : pour le niveau 1 ou pour apprendre le mouvement.',
      'Very light: for level 1 or to learn the movement.',
    ),
  },
  // Élastique
  {
    id: 'band_towel',
    equip: 'band',
    name: S('Serviette (isométrique)', 'Towel (isometric)'),
    kg: 0,
    fits: ['band'],
    grip: S(
      'Tends la serviette entre tes mains ou tire contre un point fixe, sans bouger.',
      'Pull the towel taut between your hands or against a fixed point, without moving.',
    ),
    safety: S(
      'Résistance sans allongement : fais l’exercice en maintien, sans à-coup.',
      'Resistance without stretch: do it as a hold, no jerking.',
    ),
  },
  {
    id: 'band_tights',
    equip: 'band',
    name: S('Collant', 'Tights'),
    kg: 0,
    fits: ['band'],
    grip: S('Fais une boucle ; plus tu la raccourcis, plus c’est dur.', 'Tie a loop; the shorter, the harder.'),
    safety: S(
      'Résistance plus faible qu’un élastique ; vérifie qu’il n’est pas troué.',
      'Lighter than a band; check it has no holes.',
    ),
  },
  {
    id: 'band_bag',
    equip: 'band',
    name: S('Sac attaché à une poignée de porte', 'Bag tied to a door handle'),
    kg: 0,
    fits: ['band'],
    grip: S('Attache une anse solide, tire depuis l’autre bout.', 'Tie a strong handle, pull from the other end.'),
    safety: S(
      'Porte fermée, poignée solide ; reste face au point d’attache.',
      'Closed door, sturdy handle; face the anchor point.',
    ),
  },
  {
    id: 'band_belt',
    equip: 'band',
    name: S('Ceinture ou foulard', 'Belt or scarf'),
    kg: 0,
    fits: ['band'],
    grip: S(
      'Boucle autour du pied ou de la main, tire sans élan.',
      'Loop around the foot or hand, pull without momentum.',
    ),
    safety: S('Aucune élasticité : ne force pas en fin d’amplitude.', 'No stretch: don’t force at end range.'),
  },
  // Bâton
  {
    id: 'stick_broom',
    equip: 'stick',
    name: S('Manche à balai', 'Broom handle'),
    kg: 0.4,
    fits: ['stick'],
    grip: S('Prise large, mains plus larges que les épaules.', 'Wide grip, hands wider than your shoulders.'),
    safety: S('Enlève la brosse ; garde la tête à l’écart.', 'Remove the brush head; keep clear of your face.'),
  },
  {
    id: 'stick_umb',
    equip: 'stick',
    name: S('Parapluie', 'Umbrella'),
    kg: 0.4,
    fits: ['stick'],
    grip: S('Ferme-le et attache-le ; poignée dans une main.', 'Close and strap it; handle in one hand.'),
    safety: S('Pointe vers le bas, loin du visage.', 'Tip down, away from the face.'),
  },
  {
    id: 'stick_towel',
    equip: 'stick',
    name: S('Serviette roulée', 'Rolled towel'),
    kg: 0.3,
    fits: ['stick'],
    grip: S('Roule-la serré et tiens-la aux deux bouts.', 'Roll it tight and hold both ends.'),
    safety: S('Moins rigide : pour les mouvements doux.', 'Less rigid: for gentle movements.'),
  },
  {
    id: 'stick_tube',
    equip: 'stick',
    name: S('Tube de papier cadeau ou canne', 'Wrapping-paper tube or cane'),
    kg: 0.3,
    fits: ['stick'],
    grip: S('Prise à deux mains, aux bouts.', 'Two-hand grip, at the ends.'),
    safety: S('Le carton plie : ne t’appuie pas dessus.', 'Cardboard bends: don’t lean on it.'),
  },
  // Marche
  {
    id: 'step_stair',
    equip: 'step',
    name: S('Première marche d’escalier', 'Bottom stair'),
    kg: 0,
    fits: ['step'],
    grip: S(
      'Tiens la rampe ; pose le pied complet sur la marche.',
      'Hold the rail; place the whole foot on the stair.',
    ),
    safety: S('Escalier sec, bonnes chaussures ; la rampe à portée.', 'Dry stairs, good shoes; rail in reach.'),
  },
  {
    id: 'step_book',
    equip: 'step',
    name: S('Gros livre stable (annuaire)', 'Thick stable book (phone book)'),
    kg: 0,
    fits: ['step'],
    grip: S('Pose-le à plat sur le tapis, contre un mur.', 'Place it flat on a rug, against a wall.'),
    safety: S(
      'Il ne doit pas glisser ni plier : mets plusieurs livres liés ensemble.',
      'It must not slide or bend: tie several books together.',
    ),
  },
  {
    id: 'step_stool',
    equip: 'step',
    name: S('Tabouret bas et stable', 'Low sturdy stool'),
    kg: 0,
    fits: ['step'],
    grip: S('Contre un mur, surface antidérapante.', 'Against a wall, non-slip surface.'),
    safety: S('Pas de chaise à roulettes.', 'No wheeled chair.'),
  },
  // Barre flexible
  {
    id: 'flex_towel',
    equip: 'flexbar',
    name: S('Serviette roulée et tordue', 'Rolled and twisted towel'),
    kg: 0,
    fits: ['twist'],
    grip: S(
      'Roule-la serré, tiens un bout dans chaque main, tords comme pour l’essorer.',
      'Roll tight, hold an end in each hand, twist as if wringing it out.',
    ),
    safety: S(
      'Tords progressivement ; tu peux la mouiller pour plus de résistance.',
      'Twist gradually; wet it for more resistance.',
    ),
  },
  {
    id: 'flex_rolling',
    equip: 'flexbar',
    name: S('Rouleau à pâte léger', 'Light rolling pin'),
    kg: 0,
    fits: ['twist'],
    grip: S('Tiens-le par une poignée, l’autre main sur l’autre.', 'Hold one handle, the other hand on the other.'),
    safety: S(
      'Mouvement lent : ça ne plie pas, donc ça ne fait pas l’exercice excentrique.',
      'Slow movement: it doesn’t bend, so it is a lighter version.',
    ),
  },
  // Pâte
  {
    id: 'putty_ball',
    equip: 'putty',
    name: S('Balle anti-stress ou de tennis', 'Stress ball or tennis ball'),
    kg: 0,
    fits: ['squeeze'],
    grip: S('Serre doucement, puis relâche.', 'Squeeze gently, then release.'),
    safety: S('Arrête si tu as une douleur vive ou des fourmillements.', 'Stop with sharp pain or tingling.'),
  },
  {
    id: 'putty_sponge',
    equip: 'putty',
    name: S('Éponge', 'Sponge'),
    kg: 0,
    fits: ['squeeze'],
    grip: S('Éponge mouillée : plus de résistance.', 'Wet sponge: more resistance.'),
    safety: S('Essuie-toi les mains après.', 'Dry your hands after.'),
  },
  {
    id: 'putty_sock',
    equip: 'putty',
    name: S('Chaussette roulée', 'Rolled sock'),
    kg: 0,
    fits: ['squeeze'],
    grip: S('Roule-la en boule serrée.', 'Roll it into a tight ball.'),
    safety: S('Résistance faible : bon pour commencer.', 'Low resistance: good to start.'),
  },
  // Serviette
  {
    id: 'towel_shirt',
    equip: 'towel',
    name: S('T-shirt ou taie d’oreiller', 'T-shirt or pillowcase'),
    kg: 0,
    fits: ['towel'],
    grip: S('Plie-le en bande épaisse.', 'Fold into a thick strip.'),
    safety: S('Surface glissante : sur un tapis.', 'Slippery surface: use a rug.'),
  },
  // Tapis, chaise, mur, table
  {
    id: 'mat_blanket',
    equip: 'mat',
    name: S('Couverture pliée ou tapis de salon', 'Folded blanket or rug'),
    kg: 0,
    fits: ['mat'],
    grip: S(
      'Plie en 4 pour avoir de l’épaisseur sous les genoux et le dos.',
      'Fold in 4 for cushioning under knees and back.',
    ),
    safety: S('Sur sol antidérapant ; pas de tapis qui glisse.', 'Non-slip floor; no sliding rug.'),
  },
  {
    id: 'chair_bench',
    equip: 'chair',
    name: S('Chaise stable, banc ou bord du lit', 'Stable chair, bench or edge of the bed'),
    kg: 0,
    fits: ['chair'],
    grip: S('Pieds au sol, dos droit.', 'Feet on the floor, back straight.'),
    safety: S('Pas de chaise à roulettes.', 'No wheeled chair.'),
  },
  {
    id: 'wall_door',
    equip: 'wall',
    name: S('Porte fermée ou armoire solide', 'Closed door or sturdy cupboard'),
    kg: 0,
    fits: ['wall'],
    grip: S('Appuie-toi à plat.', 'Lean flat.'),
    safety: S('Surface non glissante, qui ne bouge pas.', 'Non-slip surface that doesn’t move.'),
  },
  {
    id: 'table_counter',
    equip: 'table',
    name: S('Comptoir, commode ou dossier de chaise', 'Counter, dresser or chair back'),
    kg: 0,
    fits: ['table'],
    grip: S('Avant-bras ou main en appui stable.', 'Forearm or hand resting steadily.'),
    safety: S('Surface stable ; pas de table pliante.', 'Stable surface; no folding table.'),
  },
] as const satisfies readonly Substitute[];

export const subsOf = (equipId: string): Substitute[] =>
  (SUBSTITUTES as readonly Substitute[]).filter((s) => s.equip === equipId);
export const kgText = (kg: KgValue): string => (Array.isArray(kg) ? `${kg[0]}–${kg[1]}` : String(kg)).replace('.', ',');

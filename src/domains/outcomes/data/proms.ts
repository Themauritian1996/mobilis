// Questionnaires (PROM) : catalogue, calcul des scores, échéances, tendance. Module PUR (aucun accès navigateur) : testable avec node.
//
// DROITS D'AUTEUR : le texte des questionnaires protégés (QuickDASH, KOOS-12, HOOS-12, SPADI, LEFS, ODI, NDI) n'est PAS reproduit ici.
// Le catalogue « sous licence » ne contient que la structure et l'algorithme de calcul ; les items sont importés par le clinicien
// (fichier JSON { instrument, items:[{fr,en}], options:[...] }, voir importLicense()), conservés sur son appareil (réglages), jamais dans le code.
// Les questionnaires libres ci-dessous ont un texte original écrit pour Mobilis.
import type { Bilingual, CustomScale, InstrumentDef } from './types.ts';

const S = (fr: string, en: string): Bilingual => ({ fr, en });

// ---------- Échelles génériques ----------
export const LIKERT_DIFF = [
  S('Aucune difficulté', 'No difficulty'),
  S('Légère', 'Mild'),
  S('Modérée', 'Moderate'),
  S('Importante', 'Severe'),
  S('Impossible', 'Unable'),
];
export const LIKERT_AMOUNT = [
  S('Pas du tout', 'Not at all'),
  S('Un peu', 'A little'),
  S('Modérément', 'Moderately'),
  S('Beaucoup', 'A lot'),
  S('Extrêmement', 'Extremely'),
];
export const PGIC_OPTS = [
  S('Beaucoup mieux', 'Very much better'),
  S('Mieux', 'Better'),
  S('Un peu mieux', 'A little better'),
  S('Pareil', 'No change'),
  S('Un peu pire', 'A little worse'),
  S('Pire', 'Worse'),
  S('Beaucoup pire', 'Very much worse'),
];
export const YESNO = [S('Non', 'No'), S('Oui', 'Yes')];

// ---------- Questionnaire fonctionnel Mobilis par région (items originaux, 0–4, score 0–100 : 100 = aucune limitation) ----------
const MFQ_ITEMS = {
  cervical: [
    ['Tourner la tête pour regarder derrière toi', 'Turn your head to look behind you'],
    ['Rester devant un écran pendant 30 minutes', 'Stay at a screen for 30 minutes'],
    ['Lire ou regarder ton téléphone la tête penchée', 'Read or look at your phone with your head bent'],
    ['Te laver et te coiffer', 'Wash and style your hair'],
    ['Porter un sac d’épicerie', 'Carry a grocery bag'],
    ['Dormir sans que ton cou te réveille', 'Sleep without your neck waking you'],
    ['Conduire pendant 20 minutes', 'Drive for 20 minutes'],
    ['Lever la tête pour regarder une tablette haute', 'Look up at a high shelf'],
  ],
  trunk: [
    ['Te pencher pour enfiler tes chaussettes', 'Bend down to put on your socks'],
    ['Rester debout pendant 15 minutes', 'Stand for 15 minutes'],
    ['Rester assis pendant 30 minutes', 'Sit for 30 minutes'],
    ['Te lever d’une chaise basse', 'Get up from a low chair'],
    ['Soulever une charge de 5 kg du sol', 'Lift a 5 kg load from the floor'],
    ['Marcher pendant 20 minutes', 'Walk for 20 minutes'],
    ['Te retourner dans ton lit', 'Roll over in bed'],
    ['Faire du ménage léger (balayer, passer l’aspirateur)', 'Do light housework (sweeping, vacuuming)'],
  ],
  shoulder: [
    ['Lever le bras pour atteindre une tablette haute', 'Raise your arm to reach a high shelf'],
    ['Mettre la main dans ton dos', 'Reach your hand behind your back'],
    ['Te peigner ou te laver les cheveux', 'Comb or wash your hair'],
    ['Enfiler un manteau ou un chandail', 'Put on a coat or a sweater'],
    ['Porter un sac d’épicerie à bout de bras', 'Carry a grocery bag at arm’s length'],
    ['Dormir couché sur le côté atteint', 'Sleep lying on the affected side'],
    ['Pousser une porte lourde', 'Push a heavy door'],
    ['Lancer un objet vers l’avant', 'Throw an object forward'],
  ],
  elbow: [
    ['Plier le coude pour porter un verre à ta bouche', 'Bend your elbow to bring a glass to your mouth'],
    ['Tourner une clé ou une poignée de porte', 'Turn a key or a door handle'],
    ['Porter un sac ou une boîte', 'Carry a bag or a box'],
    ['Te brosser les dents ou te raser', 'Brush your teeth or shave'],
    ['Ouvrir un pot', 'Open a jar'],
    ['Te pousser avec les bras pour te lever d’une chaise', 'Push up with your arms to rise from a chair'],
    ['Écrire ou taper au clavier', 'Write or type'],
    ['Tendre le bras complètement pour attraper un objet', 'Straighten your arm fully to reach an object'],
  ],
  wrist: [
    ['Ouvrir un pot', 'Open a jar'],
    ['Écrire ou taper au clavier pendant 10 minutes', 'Write or type for 10 minutes'],
    ['Boutonner une chemise', 'Button a shirt'],
    ['Tordre un linge pour l’essorer', 'Wring out a cloth'],
    ['Porter une casserole pleine', 'Carry a full pot'],
    ['Tenir un verre rempli sans le laisser tomber', 'Hold a full glass without dropping it'],
    ['Couper des aliments avec un couteau', 'Cut food with a knife'],
    ['T’appuyer sur la main pour te lever', 'Lean on your hand to get up'],
  ],
  hip: [
    ['Monter un escalier', 'Climb stairs'],
    ['Enfiler tes chaussettes', 'Put on your socks'],
    ['Entrer dans une voiture et en sortir', 'Get in and out of a car'],
    ['Marcher pendant 20 minutes', 'Walk for 20 minutes'],
    ['Te lever d’une chaise', 'Get up from a chair'],
    ['Dormir couché sur le côté', 'Sleep lying on your side'],
    ['Rester debout pendant 15 minutes', 'Stand for 15 minutes'],
    ['T’accroupir pour ramasser un objet', 'Squat to pick something up'],
  ],
  knee: [
    ['Monter un escalier', 'Go up stairs'],
    ['Descendre un escalier', 'Go down stairs'],
    ['T’accroupir ou t’agenouiller', 'Squat or kneel'],
    ['Marcher pendant 20 minutes', 'Walk for 20 minutes'],
    ['Te lever d’une chaise basse', 'Get up from a low chair'],
    ['Rester debout pendant 15 minutes', 'Stand for 15 minutes'],
    ['Marcher vite ou changer de direction', 'Walk fast or change direction'],
    ['Entrer dans une voiture et en sortir', 'Get in and out of a car'],
  ],
  ankle: [
    ['Marcher sur un terrain inégal', 'Walk on uneven ground'],
    ['Marcher pendant 20 minutes', 'Walk for 20 minutes'],
    ['Monter un escalier', 'Climb stairs'],
    ['Te tenir sur la pointe des pieds', 'Stand on your tiptoes'],
    ['Te tenir sur un pied pendant 10 secondes', 'Stand on one foot for 10 seconds'],
    ['Marcher vite ou courir', 'Walk fast or run'],
    ['Porter tes chaussures toute une journée', 'Wear your shoes all day'],
    ['Descendre un trottoir ou une pente', 'Step off a curb or walk down a slope'],
  ],
} as const satisfies Readonly<Record<string, readonly (readonly [string, string])[]>>;
const MFQ_NAMES = {
  cervical: S('cou', 'neck'),
  trunk: S('dos', 'back'),
  shoulder: S('épaule', 'shoulder'),
  elbow: S('coude', 'elbow'),
  wrist: S('poignet / main', 'wrist / hand'),
  hip: S('hanche', 'hip'),
  knee: S('genou', 'knee'),
  ankle: S('cheville / pied', 'ankle / foot'),
} as const satisfies Readonly<Record<keyof typeof MFQ_ITEMS, Bilingual>>;
const MFQ_REGIONS = {
  cervical: ['cervical'],
  trunk: ['thoracic', 'lumbar'],
  shoulder: ['shoulder'],
  elbow: ['elbow'],
  wrist: ['wrist'],
  hip: ['hip'],
  knee: ['knee'],
  ankle: ['ankle', 'foot'],
};
const MFQ_MCID = {
  value: 10,
  note: S(
    'Seuil indicatif (échelle 0–100), non validé : ordre de grandeur usuel des questionnaires fonctionnels.',
    'Indicative threshold (0–100 scale), not validated: usual order of magnitude for functional questionnaires.',
  ),
};

const INSTRUMENTS: Record<string, InstrumentDef> = {};
const add = (d: InstrumentDef): InstrumentDef => {
  INSTRUMENTS[d.id] = d;
  return d;
};

// ---------- A. Libres, texte original ----------
add({
  id: 'nprs',
  kind: 'free',
  name: S('Douleur (0–10)', 'Pain (0–10)'),
  short: S('Douleur', 'Pain'),
  regions: ['all'],
  algo: 'mean',
  range: [0, 10],
  higherIsBetter: false,
  options: {
    min: 0,
    max: 10,
    ends: [S('Aucune douleur', 'No pain'), S('Pire douleur imaginable', 'Worst pain imaginable')],
  },
  items: [
    { id: 'now', text: S('Ta douleur en ce moment', 'Your pain right now') },
    { id: 'avg', text: S('Ta douleur moyenne des 7 derniers jours', 'Your average pain over the last 7 days') },
    { id: 'worst', text: S('Ta pire douleur des 7 derniers jours', 'Your worst pain over the last 7 days') },
  ],
  sub: { now: [0], avg: [1], worst: [2] },
  mcid: {
    value: 2,
    pct: 30,
    note: S(
      'Changement important : environ 2 points ou 30 % (valeur courante de la littérature sur la douleur).',
      'Important change: about 2 points or 30% (usual literature value for pain).',
    ),
  },
});
add({
  id: 'pgic',
  kind: 'free',
  name: S('Impression globale de changement', 'Global impression of change'),
  short: S('Impression globale', 'Global impression'),
  regions: ['all'],
  algo: 'single',
  range: [1, 7],
  higherIsBetter: false,
  noBaseline: true,
  options: { min: 1, max: 7, labels: PGIC_OPTS },
  items: [
    {
      id: 'g',
      text: S(
        'Comparé à ton état au début du programme, comment va ton problème maintenant ?',
        'Compared with when you started the program, how is your problem now?',
      ),
    },
  ],
  mcid: {
    type: 'level',
    value: 2,
    note: S(
      'Réponse « Mieux » ou « Beaucoup mieux » (1–2) = amélioration importante selon le patient.',
      'Answer “Better” or “Very much better” (1–2) = important improvement according to the patient.',
    ),
  },
});
add({
  id: 'sane',
  kind: 'free',
  name: S('Fonction globale (0–100 %)', 'Overall function (0–100%)'),
  short: S('Fonction', 'Function'),
  regions: ['all'],
  algo: 'single',
  range: [0, 100],
  higherIsBetter: true,
  options: {
    min: 0,
    max: 100,
    step: 5,
    ends: [
      S('0 % : impossible de fonctionner', '0%: cannot function'),
      S('100 % : comme avant le problème', '100%: as before the problem'),
    ],
  },
  items: [
    {
      id: 'f',
      text: S(
        'En pourcentage, à quel niveau fonctionne ta région atteinte aujourd’hui ? (100 % = comme avant le problème)',
        'As a percentage, how well does the affected area work today? (100% = as before the problem)',
      ),
    },
  ],
  mcid: {
    value: 15,
    note: S(
      'Changement important : environ 15–20 points (seuil indicatif).',
      'Important change: about 15–20 points (indicative threshold).',
    ),
  },
});
add({
  id: 'sleep',
  kind: 'free',
  name: S('Sommeil perturbé par la douleur', 'Sleep disturbed by pain'),
  short: S('Sommeil', 'Sleep'),
  regions: ['all'],
  algo: 'single',
  range: [0, 10],
  higherIsBetter: false,
  options: { min: 0, max: 10, ends: [S('Aucun effet', 'No effect'), S('Sommeil impossible', 'Cannot sleep')] },
  items: [
    {
      id: 's',
      text: S(
        'Cette semaine, à quel point la douleur a-t-elle perturbé ton sommeil ?',
        'This week, how much did pain disturb your sleep?',
      ),
    },
  ],
  mcid: { value: 2, note: S('Seuil indicatif (2 points sur 10).', 'Indicative threshold (2 points out of 10).') },
});
add({
  id: 'activities',
  kind: 'free',
  name: S('Mes activités importantes', 'My important activities'),
  short: S('Mes activités', 'My activities'),
  regions: ['all'],
  algo: 'mean',
  range: [0, 10],
  higherIsBetter: true,
  dynamicItems: { min: 3, max: 5 },
  options: { min: 0, max: 10, ends: [S('Impossible', 'Impossible'), S('Comme avant', 'Like before')] },
  items: [], // 3 à 5 activités choisies une fois par le patient (profile.promActivities)
  mcid: {
    value: 2,
    note: S('Seuil indicatif (2 points sur 10 en moyenne).', 'Indicative threshold (2 points out of 10 on average).'),
  },
});
for (const k of Object.keys(MFQ_ITEMS) as (keyof typeof MFQ_ITEMS)[]) {
  add({
    id: 'mfq_' + k,
    kind: 'free',
    mfq: true,
    name: S('Fonction : ' + MFQ_NAMES[k].fr, 'Function: ' + MFQ_NAMES[k].en),
    short: S('Fonction ' + MFQ_NAMES[k].fr, 'Function ' + MFQ_NAMES[k].en),
    regions: MFQ_REGIONS[k],
    algo: 'mfq',
    range: [0, 100],
    higherIsBetter: true,
    minAnswered: 0.75,
    stem: S(
      'Aujourd’hui, à cause de ton problème, quelle difficulté as-tu à…',
      'Today, because of your problem, how difficult is it for you to…',
    ),
    options: { min: 0, max: 4, labels: LIKERT_DIFF },
    items: MFQ_ITEMS[k].map((x, i) => ({ id: 'q' + (i + 1), text: S(x[0], x[1]) })),
    mcid: MFQ_MCID,
  });
}

// ---------- B. Catalogue sous licence : structure + algorithme + DMCI, SANS texte ----------
const LIC = (o: Omit<InstrumentDef, 'kind' | 'items' | 'licenseHolderNote'>): InstrumentDef =>
  add({
    kind: 'licensed',
    items: [],
    licenseHolderNote: S(
      'Licence requise : instrument protégé, texte à importer par le clinicien autorisé.',
      'Licence required: copyrighted instrument, text to be imported by the licensed clinician.',
    ),
    ...o,
  });
LIC({
  id: 'quickdash',
  name: S('QuickDASH', 'QuickDASH'),
  full: 'Disabilities of the Arm, Shoulder and Hand — short form',
  holder: 'Institute for Work & Health (Toronto)',
  regions: ['shoulder', 'elbow', 'wrist'],
  nItems: 11,
  options: { min: 1, max: 5, count: 5 },
  algo: 'quickdash',
  range: [0, 100],
  higherIsBetter: false,
  minAnswered: 10,
  mcid: {
    value: 16,
    note: S(
      'Environ 16 points (valeurs publiées 8–16 ; indicatif, à valider).',
      'About 16 points (published values 8–16; indicative, to be validated).',
    ),
  },
});
LIC({
  id: 'koos12',
  name: S('KOOS-12 (genou)', 'KOOS-12 (knee)'),
  full: 'Knee injury and Osteoarthritis Outcome Score — 12 items',
  holder: 'Roos & Lohmander, KOOS (licence via koos.nu / Université de Lund)',
  regions: ['knee'],
  nItems: 12,
  options: { min: 0, max: 4, count: 5 },
  algo: 'koos12',
  range: [0, 100],
  higherIsBetter: true,
  subs: { pain: [0, 1, 2, 3], function: [4, 5, 6, 7], qol: [8, 9, 10, 11] },
  note: S(
    'Chaque sous-échelle : 100 − moyenne/4 × 100 ; total = moyenne des 3 sous-échelles (simplification : la formule officielle du résumé peut différer, à valider avec le détenteur).',
    'Each subscale: 100 − mean/4 × 100; total = mean of the 3 subscales (simplification: the official summary formula may differ, to be validated with the holder).',
  ),
  mcid: {
    value: 8,
    note: S(
      'Environ 8–10 points selon les études (indicatif).',
      'About 8–10 points depending on studies (indicative).',
    ),
  },
});
LIC({
  id: 'hoos12',
  name: S('HOOS-12 (hanche)', 'HOOS-12 (hip)'),
  full: 'Hip disability and Osteoarthritis Outcome Score — 12 items',
  holder: 'Roos & Lohmander, HOOS (licence via koos.nu / Université de Lund)',
  regions: ['hip'],
  nItems: 12,
  options: { min: 0, max: 4, count: 5 },
  algo: 'koos12',
  range: [0, 100],
  higherIsBetter: true,
  subs: { pain: [0, 1, 2, 3], function: [4, 5, 6, 7], qol: [8, 9, 10, 11] },
  note: S(
    'Même calcul que KOOS-12 (simplification à valider avec le détenteur).',
    'Same calculation as KOOS-12 (simplification to be validated with the holder).',
  ),
  mcid: { value: 8, note: S('Environ 8–10 points (indicatif).', 'About 8–10 points (indicative).') },
});
LIC({
  id: 'spadi',
  name: S('SPADI (épaule)', 'SPADI (shoulder)'),
  full: 'Shoulder Pain and Disability Index',
  holder: 'Roach et coll. (licence : auteurs / éditeur)',
  regions: ['shoulder'],
  nItems: 13,
  options: { min: 0, max: 10, count: 11 },
  algo: 'spadi',
  range: [0, 100],
  higherIsBetter: false,
  subs: { pain: [0, 1, 2, 3, 4], disability: [5, 6, 7, 8, 9, 10, 11, 12] },
  note: S(
    'Douleur (5 items) et incapacité (8 items) en %, total = moyenne des deux ; items manquants : moyenne des items répondus.',
    'Pain (5 items) and disability (8 items) in %, total = mean of both; missing items: mean of answered items.',
  ),
  mcid: { value: 10, note: S('Environ 8–13 points (indicatif).', 'About 8–13 points (indicative).') },
});
LIC({
  id: 'lefs',
  name: S('LEFS (membre inférieur)', 'LEFS (lower limb)'),
  full: 'Lower Extremity Functional Scale',
  holder: 'Binkley et coll. (licence : auteurs / éditeur)',
  regions: ['hip', 'knee', 'ankle', 'foot'],
  nItems: 20,
  options: { min: 0, max: 4, count: 5 },
  algo: 'lefs',
  range: [0, 80],
  higherIsBetter: true,
  minAnswered: 18,
  note: S(
    'Somme 0–80 ; règle adoptée : proratisé si au plus 2 items manquants (à valider).',
    'Sum 0–80; adopted rule: prorated if at most 2 items are missing (to be validated).',
  ),
  mcid: { value: 9, note: S('Environ 9 points (valeur publiée).', 'About 9 points (published value).') },
});
LIC({
  id: 'odi',
  name: S('ODI (lombaire)', 'ODI (low back)'),
  full: 'Oswestry Disability Index',
  holder: 'Fairbank & Pynsent (licence : MAPI Research Trust)',
  regions: ['lumbar', 'thoracic'],
  nItems: 10,
  options: { min: 0, max: 5, count: 6 },
  algo: 'odi',
  range: [0, 100],
  higherIsBetter: false,
  minAnswered: 9,
  note: S(
    'Somme / (5 × sections répondues) × 100 ; valide si au moins 9 sections sur 10.',
    'Sum / (5 × answered sections) × 100; valid if at least 9 of 10 sections.',
  ),
  mcid: { value: 10, note: S('Environ 10 points (valeur publiée).', 'About 10 points (published value).') },
});
LIC({
  id: 'ndi',
  name: S('NDI (cervical)', 'NDI (neck)'),
  full: 'Neck Disability Index',
  holder: 'Vernon & Mior (licence : auteurs / MAPI Research Trust)',
  regions: ['cervical'],
  nItems: 10,
  options: { min: 0, max: 5, count: 6 },
  algo: 'odi',
  range: [0, 100],
  higherIsBetter: false,
  minAnswered: 9,
  note: S(
    'Même calcul en %, valide si au moins 9 sections sur 10.',
    'Same calculation in %, valid if at least 9 of 10 sections.',
  ),
  mcid: {
    value: 7.5,
    note: S(
      'Environ 7,5 points sur 100 (soit 5/50 ; indicatif).',
      'About 7.5 points out of 100 (i.e. 5/50; indicative).',
    ),
  },
});

export { INSTRUMENTS };
export const FREE_ORDER = [
  'nprs',
  'pgic',
  'sane',
  'sleep',
  'activities',
  ...Object.keys(MFQ_ITEMS).map((k) => 'mfq_' + k),
];
export const LICENSED_ORDER = ['quickdash', 'koos12', 'hoos12', 'spadi', 'lefs', 'odi', 'ndi'];

// ---------- Questionnaire personnalisé du clinicien : rx.promCustom = [{ id:'c_…', title, questions:[{text}], scale:'0-10'|'likert'|'yesno', score:'sum'|'mean'|'pct', higherIsBetter }] ----------
export const CUSTOM_SCALES = {
  '0-10': { min: 0, max: 10 },
  likert: { min: 0, max: 4, labels: LIKERT_AMOUNT },
  yesno: { min: 0, max: 1, labels: YESNO },
} as const satisfies Readonly<Record<string, CustomScale>>;

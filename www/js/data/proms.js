// Questionnaires (PROM) : catalogue, calcul des scores, échéances, tendance. Module PUR (aucun accès navigateur) : testable avec node.
//
// DROITS D'AUTEUR : le texte des questionnaires protégés (QuickDASH, KOOS-12, HOOS-12, SPADI, LEFS, ODI, NDI) n'est PAS reproduit ici.
// Le catalogue « sous licence » ne contient que la structure et l'algorithme de calcul ; les items sont importés par le clinicien
// (fichier JSON { instrument, items:[{fr,en}], options:[...] }, voir importLicense()), conservés sur son appareil (réglages), jamais dans le code.
// Les questionnaires libres ci-dessous ont un texte original écrit pour Mobilis.

const S = (fr, en) => ({ fr, en });
const DAY = 86400000;
const r1 = (x) => Math.round(x * 10) / 10;

// ---------- Échelles génériques ----------
export const LIKERT_DIFF = [S('Aucune difficulté', 'No difficulty'), S('Légère', 'Mild'), S('Modérée', 'Moderate'), S('Importante', 'Severe'), S('Impossible', 'Unable')];
export const LIKERT_AMOUNT = [S('Pas du tout', 'Not at all'), S('Un peu', 'A little'), S('Modérément', 'Moderately'), S('Beaucoup', 'A lot'), S('Extrêmement', 'Extremely')];
export const PGIC_OPTS = [
  S('Beaucoup mieux', 'Very much better'), S('Mieux', 'Better'), S('Un peu mieux', 'A little better'), S('Pareil', 'No change'),
  S('Un peu pire', 'A little worse'), S('Pire', 'Worse'), S('Beaucoup pire', 'Very much worse')];
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
};
const MFQ_NAMES = {
  cervical: S('cou', 'neck'), trunk: S('dos', 'back'), shoulder: S('épaule', 'shoulder'), elbow: S('coude', 'elbow'),
  wrist: S('poignet / main', 'wrist / hand'), hip: S('hanche', 'hip'), knee: S('genou', 'knee'), ankle: S('cheville / pied', 'ankle / foot'),
};
const MFQ_REGIONS = { cervical: ['cervical'], trunk: ['thoracic', 'lumbar'], shoulder: ['shoulder'], elbow: ['elbow'], wrist: ['wrist'], hip: ['hip'], knee: ['knee'], ankle: ['ankle', 'foot'] };
const MFQ_MCID = { value: 10, note: S('Seuil indicatif (échelle 0–100), non validé : ordre de grandeur usuel des questionnaires fonctionnels.', 'Indicative threshold (0–100 scale), not validated: usual order of magnitude for functional questionnaires.') };

const INSTRUMENTS = {};
const add = (d) => { INSTRUMENTS[d.id] = d; return d; };

// ---------- A. Libres, texte original ----------
add({ id: 'nprs', kind: 'free', name: S('Douleur (0–10)', 'Pain (0–10)'), short: S('Douleur', 'Pain'), regions: ['all'], algo: 'mean', range: [0, 10], higherIsBetter: false,
  options: { min: 0, max: 10, ends: [S('Aucune douleur', 'No pain'), S('Pire douleur imaginable', 'Worst pain imaginable')] },
  items: [
    { id: 'now', text: S('Ta douleur en ce moment', 'Your pain right now') },
    { id: 'avg', text: S('Ta douleur moyenne des 7 derniers jours', 'Your average pain over the last 7 days') },
    { id: 'worst', text: S('Ta pire douleur des 7 derniers jours', 'Your worst pain over the last 7 days') }],
  sub: { now: [0], avg: [1], worst: [2] },
  mcid: { value: 2, pct: 30, note: S('Changement important : environ 2 points ou 30 % (valeur courante de la littérature sur la douleur).', 'Important change: about 2 points or 30% (usual literature value for pain).') } });
add({ id: 'pgic', kind: 'free', name: S('Impression globale de changement', 'Global impression of change'), short: S('Impression globale', 'Global impression'), regions: ['all'], algo: 'single', range: [1, 7], higherIsBetter: false, noBaseline: true,
  options: { min: 1, max: 7, labels: PGIC_OPTS },
  items: [{ id: 'g', text: S('Comparé à ton état au début du programme, comment va ton problème maintenant ?', 'Compared with when you started the program, how is your problem now?') }],
  mcid: { type: 'level', value: 2, note: S('Réponse « Mieux » ou « Beaucoup mieux » (1–2) = amélioration importante selon le patient.', 'Answer “Better” or “Very much better” (1–2) = important improvement according to the patient.') } });
add({ id: 'sane', kind: 'free', name: S('Fonction globale (0–100 %)', 'Overall function (0–100%)'), short: S('Fonction', 'Function'), regions: ['all'], algo: 'single', range: [0, 100], higherIsBetter: true,
  options: { min: 0, max: 100, step: 5, ends: [S('0 % : impossible de fonctionner', '0%: cannot function'), S('100 % : comme avant le problème', '100%: as before the problem')] },
  items: [{ id: 'f', text: S('En pourcentage, à quel niveau fonctionne ta région atteinte aujourd’hui ? (100 % = comme avant le problème)', 'As a percentage, how well does the affected area work today? (100% = as before the problem)') }],
  mcid: { value: 15, note: S('Changement important : environ 15–20 points (seuil indicatif).', 'Important change: about 15–20 points (indicative threshold).') } });
add({ id: 'sleep', kind: 'free', name: S('Sommeil perturbé par la douleur', 'Sleep disturbed by pain'), short: S('Sommeil', 'Sleep'), regions: ['all'], algo: 'single', range: [0, 10], higherIsBetter: false,
  options: { min: 0, max: 10, ends: [S('Aucun effet', 'No effect'), S('Sommeil impossible', 'Cannot sleep')] },
  items: [{ id: 's', text: S('Cette semaine, à quel point la douleur a-t-elle perturbé ton sommeil ?', 'This week, how much did pain disturb your sleep?') }],
  mcid: { value: 2, note: S('Seuil indicatif (2 points sur 10).', 'Indicative threshold (2 points out of 10).') } });
add({ id: 'activities', kind: 'free', name: S('Mes activités importantes', 'My important activities'), short: S('Mes activités', 'My activities'), regions: ['all'], algo: 'mean', range: [0, 10], higherIsBetter: true, dynamicItems: { min: 3, max: 5 },
  options: { min: 0, max: 10, ends: [S('Impossible', 'Impossible'), S('Comme avant', 'Like before')] },
  items: [], // 3 à 5 activités choisies une fois par le patient (profile.promActivities)
  mcid: { value: 2, note: S('Seuil indicatif (2 points sur 10 en moyenne).', 'Indicative threshold (2 points out of 10 on average).') } });
for (const k of Object.keys(MFQ_ITEMS)) {
  add({ id: 'mfq_' + k, kind: 'free', mfq: true, name: S('Fonction : ' + MFQ_NAMES[k].fr, 'Function: ' + MFQ_NAMES[k].en), short: S('Fonction ' + MFQ_NAMES[k].fr, 'Function ' + MFQ_NAMES[k].en),
    regions: MFQ_REGIONS[k], algo: 'mfq', range: [0, 100], higherIsBetter: true, minAnswered: 0.75,
    stem: S('Aujourd’hui, à cause de ton problème, quelle difficulté as-tu à…', 'Today, because of your problem, how difficult is it for you to…'),
    options: { min: 0, max: 4, labels: LIKERT_DIFF },
    items: MFQ_ITEMS[k].map((x, i) => ({ id: 'q' + (i + 1), text: S(x[0], x[1]) })),
    mcid: MFQ_MCID });
}

// ---------- B. Catalogue sous licence : structure + algorithme + DMCI, SANS texte ----------
const LIC = (o) => add({ kind: 'licensed', items: [], licenseHolderNote: S('Licence requise : instrument protégé, texte à importer par le clinicien autorisé.', 'Licence required: copyrighted instrument, text to be imported by the licensed clinician.'), ...o });
LIC({ id: 'quickdash', name: S('QuickDASH', 'QuickDASH'), full: 'Disabilities of the Arm, Shoulder and Hand — short form', holder: 'Institute for Work & Health (Toronto)', regions: ['shoulder', 'elbow', 'wrist'],
  nItems: 11, options: { min: 1, max: 5, count: 5 }, algo: 'quickdash', range: [0, 100], higherIsBetter: false, minAnswered: 10,
  mcid: { value: 16, note: S('Environ 16 points (valeurs publiées 8–16 ; indicatif, à valider).', 'About 16 points (published values 8–16; indicative, to be validated).') } });
LIC({ id: 'koos12', name: S('KOOS-12 (genou)', 'KOOS-12 (knee)'), full: 'Knee injury and Osteoarthritis Outcome Score — 12 items', holder: 'Roos & Lohmander, KOOS (licence via koos.nu / Université de Lund)', regions: ['knee'],
  nItems: 12, options: { min: 0, max: 4, count: 5 }, algo: 'koos12', range: [0, 100], higherIsBetter: true,
  subs: { pain: [0, 1, 2, 3], function: [4, 5, 6, 7], qol: [8, 9, 10, 11] },
  note: S('Chaque sous-échelle : 100 − moyenne/4 × 100 ; total = moyenne des 3 sous-échelles (simplification : la formule officielle du résumé peut différer, à valider avec le détenteur).', 'Each subscale: 100 − mean/4 × 100; total = mean of the 3 subscales (simplification: the official summary formula may differ, to be validated with the holder).'),
  mcid: { value: 8, note: S('Environ 8–10 points selon les études (indicatif).', 'About 8–10 points depending on studies (indicative).') } });
LIC({ id: 'hoos12', name: S('HOOS-12 (hanche)', 'HOOS-12 (hip)'), full: 'Hip disability and Osteoarthritis Outcome Score — 12 items', holder: 'Roos & Lohmander, HOOS (licence via koos.nu / Université de Lund)', regions: ['hip'],
  nItems: 12, options: { min: 0, max: 4, count: 5 }, algo: 'koos12', range: [0, 100], higherIsBetter: true,
  subs: { pain: [0, 1, 2, 3], function: [4, 5, 6, 7], qol: [8, 9, 10, 11] },
  note: S('Même calcul que KOOS-12 (simplification à valider avec le détenteur).', 'Same calculation as KOOS-12 (simplification to be validated with the holder).'),
  mcid: { value: 8, note: S('Environ 8–10 points (indicatif).', 'About 8–10 points (indicative).') } });
LIC({ id: 'spadi', name: S('SPADI (épaule)', 'SPADI (shoulder)'), full: 'Shoulder Pain and Disability Index', holder: 'Roach et coll. (licence : auteurs / éditeur)', regions: ['shoulder'],
  nItems: 13, options: { min: 0, max: 10, count: 11 }, algo: 'spadi', range: [0, 100], higherIsBetter: false,
  subs: { pain: [0, 1, 2, 3, 4], disability: [5, 6, 7, 8, 9, 10, 11, 12] },
  note: S('Douleur (5 items) et incapacité (8 items) en %, total = moyenne des deux ; items manquants : moyenne des items répondus.', 'Pain (5 items) and disability (8 items) in %, total = mean of both; missing items: mean of answered items.'),
  mcid: { value: 10, note: S('Environ 8–13 points (indicatif).', 'About 8–13 points (indicative).') } });
LIC({ id: 'lefs', name: S('LEFS (membre inférieur)', 'LEFS (lower limb)'), full: 'Lower Extremity Functional Scale', holder: 'Binkley et coll. (licence : auteurs / éditeur)', regions: ['hip', 'knee', 'ankle', 'foot'],
  nItems: 20, options: { min: 0, max: 4, count: 5 }, algo: 'lefs', range: [0, 80], higherIsBetter: true, minAnswered: 18,
  note: S('Somme 0–80 ; règle adoptée : proratisé si au plus 2 items manquants (à valider).', 'Sum 0–80; adopted rule: prorated if at most 2 items are missing (to be validated).'),
  mcid: { value: 9, note: S('Environ 9 points (valeur publiée).', 'About 9 points (published value).') } });
LIC({ id: 'odi', name: S('ODI (lombaire)', 'ODI (low back)'), full: 'Oswestry Disability Index', holder: 'Fairbank & Pynsent (licence : MAPI Research Trust)', regions: ['lumbar', 'thoracic'],
  nItems: 10, options: { min: 0, max: 5, count: 6 }, algo: 'odi', range: [0, 100], higherIsBetter: false, minAnswered: 9,
  note: S('Somme / (5 × sections répondues) × 100 ; valide si au moins 9 sections sur 10.', 'Sum / (5 × answered sections) × 100; valid if at least 9 of 10 sections.'),
  mcid: { value: 10, note: S('Environ 10 points (valeur publiée).', 'About 10 points (published value).') } });
LIC({ id: 'ndi', name: S('NDI (cervical)', 'NDI (neck)'), full: 'Neck Disability Index', holder: 'Vernon & Mior (licence : auteurs / MAPI Research Trust)', regions: ['cervical'],
  nItems: 10, options: { min: 0, max: 5, count: 6 }, algo: 'odi', range: [0, 100], higherIsBetter: false, minAnswered: 9,
  note: S('Même calcul en %, valide si au moins 9 sections sur 10.', 'Same calculation in %, valid if at least 9 of 10 sections.'),
  mcid: { value: 7.5, note: S('Environ 7,5 points sur 100 (soit 5/50 ; indicatif).', 'About 7.5 points out of 100 (i.e. 5/50; indicative).') } });

export { INSTRUMENTS };
export const FREE_ORDER = ['nprs', 'pgic', 'sane', 'sleep', 'activities', ...Object.keys(MFQ_ITEMS).map((k) => 'mfq_' + k)];
export const LICENSED_ORDER = ['quickdash', 'koos12', 'hoos12', 'spadi', 'lefs', 'odi', 'ndi'];
export const isCustomId = (id) => typeof id === 'string' && id.startsWith('c_');

// ---------- Questionnaire personnalisé du clinicien : rx.promCustom = [{ id:'c_…', title, questions:[{text}], scale:'0-10'|'likert'|'yesno', score:'sum'|'mean'|'pct', higherIsBetter }] ----------
export const CUSTOM_SCALES = {
  '0-10': { min: 0, max: 10 },
  likert: { min: 0, max: 4, labels: LIKERT_AMOUNT },
  yesno: { min: 0, max: 1, labels: YESNO },
};
export function customToDef(c) {
  if (!c) return null;
  const sc = CUSTOM_SCALES[c.scale] || CUSTOM_SCALES['0-10'];
  const qs = (c.questions || []).map((q) => (typeof q === 'string' ? q : q?.text)).filter((x) => x && String(x).trim());
  const n = qs.length, mode = ['sum', 'mean', 'pct'].includes(c.score) ? c.score : 'mean';
  const range = mode === 'sum' ? [0, n * sc.max] : mode === 'pct' ? [0, 100] : [0, sc.max];
  return { id: c.id, kind: 'custom', name: c.title || 'Questionnaire', short: c.title || 'Questionnaire', regions: ['all'], algo: 'custom', mode, range, higherIsBetter: !!c.higherIsBetter,
    options: { ...sc, ends: sc.labels ? undefined : [S('0', '0'), S('10', '10')] }, items: qs.map((x, i) => ({ id: 'q' + (i + 1), text: x })), mcid: null, minAnswered: 1 };
}
export function instrumentDef(id, custom = []) {
  if (INSTRUMENTS[id]) return INSTRUMENTS[id];
  if (isCustomId(id)) return customToDef((custom || []).find((c) => c.id === id));
  return null;
}

// ---------- Licences importées ----------
// Fichier : { instrument:'koos12', items:[{fr,en,...}], options:[ {fr,en} | "texte" ... ] }. Retourne { ok, error?, id?, entry? }.
export function validateLicense(json) {
  const d = typeof json === 'string' ? (() => { try { return JSON.parse(json); } catch (_) { return null; } })() : json;
  if (!d || typeof d !== 'object') return { ok: false, error: 'json' };
  const def = INSTRUMENTS[d.instrument];
  if (!def || def.kind !== 'licensed') return { ok: false, error: 'instrument' };
  if (!Array.isArray(d.items) || d.items.length !== def.nItems) return { ok: false, error: 'items' };
  const items = d.items.map((x) => (typeof x === 'string' ? { fr: x, en: x } : { ...x }));
  if (items.some((x) => !(x.fr || x.en))) return { ok: false, error: 'items' };
  let options = null;
  if (d.options != null) {
    if (!Array.isArray(d.options) || d.options.length !== def.options.count) return { ok: false, error: 'options' };
    options = d.options.map((x) => (typeof x === 'string' ? { fr: x, en: x } : { ...x }));
  }
  return { ok: true, id: def.id, entry: { items, options, importedAt: Date.now() } };
}
// def avec items (licences : { id: entry })
export function resolveDef(id, { custom = [], licenses = {}, activities = [] } = {}) {
  const def = instrumentDef(id, custom);
  if (!def) return null;
  if (def.kind === 'licensed') {
    const lic = licenses?.[id];
    if (!lic?.items || lic.items.length !== def.nItems) return { ...def, items: [], available: false };
    const labels = lic.options || null;
    return { ...def, items: lic.items.map((x, i) => ({ id: 'q' + (i + 1), text: x })), options: { ...def.options, labels }, available: true };
  }
  if (def.dynamicItems) {
    const acts = (activities || []).filter((a) => a && String(a).trim()).slice(0, def.dynamicItems.max);
    return { ...def, items: acts.map((a, i) => ({ id: 'a' + (i + 1), text: String(a) })), available: acts.length >= def.dynamicItems.min };
  }
  return { ...def, available: !!def.items.length };
}
export const isAvailable = (id, ctx) => !!resolveDef(id, ctx)?.available;
export const nItemsOf = (def) => (def.kind === 'licensed' ? def.nItems : def.items.length);

// ---------- Calcul des scores ----------
// answers : tableau (index = item), null/undefined = manquant. Valeurs hors échelle = manquant.
// Résultat : { score|null, valid, answered, total, sub? }
export function score(def, answers) {
  if (typeof def === 'string') def = INSTRUMENTS[def];
  if (!def) return { score: null, valid: false, answered: 0, total: 0 };
  const total = nItemsOf(def);
  const lo = def.options.min, hi = def.options.max;
  const a = Array.from({ length: total }, (_, i) => {
    const v = answers?.[i];
    return typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null;
  });
  const got = a.filter((v) => v != null);
  const answered = got.length;
  const out = (s, extra = {}) => ({ score: s == null ? null : r1(s), valid: s != null, answered, total, ...extra });
  const sum = (arr) => arr.reduce((x, y) => x + y, 0);
  const need = def.minAnswered == null ? total : def.minAnswered < 1 ? Math.ceil(def.minAnswered * total) : def.minAnswered;
  switch (def.algo) {
    case 'single': return out(answered ? a.find((v) => v != null) : null);
    case 'mean': { // NPRS, activités : moyenne des items répondus
      if (!answered) return out(null);
      const sub = def.sub ? Object.fromEntries(Object.entries(def.sub).map(([k, ix]) => [k, a[ix[0]]])) : undefined;
      return out(sum(got) / answered, sub ? { sub } : {});
    }
    case 'mfq': { // 0–4 difficulté -> 0–100, 100 = aucune limitation ; valide si ≥ 75 % des items
      if (answered < need) return out(null);
      return out((1 - sum(got) / answered / hi) * 100);
    }
    case 'custom': {
      if (!answered || answered < (def.mode === 'sum' ? total : 1)) return out(null);
      const m = sum(got) / answered;
      return out(def.mode === 'sum' ? sum(got) : def.mode === 'pct' ? (m / hi) * 100 : m);
    }
    case 'quickdash': // ((somme/n) − 1) × 25, n ≥ 10 items répondus
      if (answered < need) return out(null);
      return out((sum(got) / answered - 1) * 25);
    case 'koos12': { // sous-échelles : 100 − moyenne/4 × 100 (≥ 3 items sur 4) ; total = moyenne des 3
      const sub = {};
      for (const [k, ix] of Object.entries(def.subs)) {
        const v = ix.map((i) => a[i]).filter((x) => x != null);
        sub[k] = v.length >= 3 ? r1(100 - (sum(v) / v.length / hi) * 100) : null;
      }
      const vals = Object.values(sub);
      return out(vals.every((x) => x != null) ? sum(vals) / vals.length : null, { sub });
    }
    case 'spadi': { // % douleur, % incapacité, total = moyenne ; manquants : moyenne des items répondus
      const sub = {};
      for (const [k, ix] of Object.entries(def.subs)) {
        const v = ix.map((i) => a[i]).filter((x) => x != null);
        sub[k] = v.length ? r1((sum(v) / v.length / hi) * 100) : null;
      }
      const vals = Object.values(sub);
      return out(vals.every((x) => x != null) ? sum(vals) / vals.length : null, { sub });
    }
    case 'lefs': { // somme 0–80, proratisée si ≤ 2 manquants
      if (answered < need) return out(null);
      return out(answered === total ? sum(got) : (sum(got) / answered) * total);
    }
    case 'odi': { // somme / (max × répondues) × 100 (ODI et NDI)
      if (answered < need) return out(null);
      return out((sum(got) / (hi * answered)) * 100);
    }
    default: return out(null);
  }
}

// Interprétation en mots simples : 0 = très peu de gêne … 3 = gêne importante (selon la position dans l'échelle)
export function band(def, s) {
  if (s == null) return null;
  const [lo, hi] = def.range;
  let n = (s - lo) / (hi - lo);
  if (!def.higherIsBetter) n = 1 - n;
  return n >= 0.85 ? 0 : n >= 0.65 ? 1 : n >= 0.4 ? 2 : 3;
}

// ---------- Échéances ----------
// plan : [{ id, every (semaines, 0 = une seule fois), first (jours après le début) }] ; log : [{ id, ts }] ; startTs, now (ms)
// Retourne [{ id, dueTs, lastTs|null, overdueDays }] des questionnaires dus (aujourd'hui ou en retard).
const dayStart = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
export function due(plan, log, startTs, now = Date.now()) {
  const res = [];
  for (const p of plan || []) {
    if (!p?.id) continue;
    const done = (log || []).filter((l) => l.id === p.id && l.ts).map((l) => l.ts).sort((x, y) => x - y);
    const last = done.length ? done[done.length - 1] : null;
    const every = Math.max(0, +p.every || 0);
    let dueTs;
    if (last == null) dueTs = (startTs || now) + Math.max(0, +p.first || 0) * DAY;
    else if (every === 0) continue;
    else dueTs = Math.max(last + every * 7 * DAY, (startTs || 0) + Math.max(0, +p.first || 0) * DAY);
    if (now >= dayStart(dueTs)) res.push({ id: p.id, dueTs, lastTs: last, overdueDays: Math.max(0, Math.floor((dayStart(now) - dayStart(dueTs)) / DAY)) });
  }
  return res;
}

// ---------- Tendance ----------
// -> { n, baseline, last, delta, improvement, mcidReached, worsened, lastTs }. delta = last − baseline (signe brut).
// improvement = amélioration dans le bon sens (positive = mieux). mcidReached : amélioration ≥ DMCI (ou niveau atteint pour PGIC).
export function trend(log, id, def) {
  def = def || INSTRUMENTS[id];
  const rows = (log || []).filter((l) => l.id === id && typeof l.score === 'number').sort((a, b) => a.ts - b.ts);
  const base = { n: rows.length, baseline: null, last: null, delta: null, improvement: null, mcidReached: false, worsened: false, lastTs: null };
  if (!rows.length) return base;
  const last = rows[rows.length - 1];
  const out = { ...base, last: last.score, lastTs: last.ts };
  if (def?.mcid?.type === 'level') { // PGIC : seuil sur la dernière réponse seulement
    out.mcidReached = def.higherIsBetter ? last.score >= def.mcid.value : last.score <= def.mcid.value;
    return out;
  }
  if (rows.length < 2 || def?.noBaseline) return { ...out, baseline: rows[0].score };
  out.baseline = rows[0].score;
  out.delta = r1(last.score - rows[0].score);
  out.improvement = def?.higherIsBetter === false ? -out.delta : out.delta;
  const m = def?.mcid;
  if (m) {
    const rel = m.pct && out.baseline > 0 ? Math.max(1, (out.baseline * m.pct) / 100) : Infinity; // « 2 points ou 30 % » : l'un ou l'autre
    out.mcidReached = out.improvement > 0 && (out.improvement >= m.value || out.improvement >= rel);
    out.worsened = out.improvement <= -m.value;
  }
  return out;
}

// ---------- Résumé pour le clinicien ----------
// -> { prom: [{ id, name, n, baseline, last, delta, improvement, mcidReached, worsened, lastTs, higherIsBetter, range, series:[[ts,score],...≤12] }] }
export function summaryPart(profile) {
  const log = profile?.promLog || [], custom = profile?.promCustom || [];
  const ids = [...new Set(log.map((l) => l.id))];
  const prom = ids.map((id) => {
    const def = instrumentDef(id, custom);
    if (!def) return null;
    const tr_ = trend(log, id, def);
    const series = log.filter((l) => l.id === id && typeof l.score === 'number').sort((a, b) => a.ts - b.ts).slice(-12).map((l) => [l.ts, l.score]);
    return { id, name: def.name, ...tr_, higherIsBetter: def.higherIsBetter, range: def.range, series };
  }).filter(Boolean);
  return { prom };
}

// Régions -> instruments proposés (libres génériques + fonctionnel Mobilis + catalogue sous licence)
export function suggestFor(region) {
  const mfq = FREE_ORDER.filter((id) => INSTRUMENTS[id].mfq && INSTRUMENTS[id].regions.includes(region));
  const lic = LICENSED_ORDER.filter((id) => INSTRUMENTS[id].regions.includes(region));
  return { general: ['nprs', 'pgic', 'sane', 'sleep', 'activities'], region: [...mfq, ...lic] };
}

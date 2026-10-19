// Bibliothèque d'exercices MSK (FR/EN).
// fig   : schéma cinétique (voir figure.js) — frames = positions clés, trace = segment dont on dessine la trajectoire, arc = angle affiché.
// keys  : points importants numérotés sur le schéma.
// dose  : dose de base (niveau 3). Le moteur de progression l'ajuste.
// track : suivi caméra 2D. planes.side = vue de côté (plan sagittal), planes.front = vue de face (plan frontal).
//         mode 'reps' : métrique qui va de `from` à `to` (rel:true = relatif à la position de départ).
//         mode 'hold' : temps compté seulement si la métrique est entre min et max.
//         checks : erreurs détectées -> consigne vocale (cue).
//         track:null = exercice guidé (minuterie + voix), non mesurable de façon fiable en 2D.

const S = (fr, en) => ({ fr, en });
const steps = (...a) => ({ fr: a.map((x) => x[0]), en: a.map((x) => x[1]) });
const k = (j, fr, en, off) => ({ j, fr, en, off });

// Positions types (vue de côté, personne tournée vers la droite)
const STAND = {};
const SUPINE_HOOK = { trunk: 270, head: 0, thigh: 45, shank: 150, foot: 90, uarm: 90, farm: 90, thigh2: 45, shank2: 150 };
const QUAD = { trunk: 90, head: 0, uarm: 180, farm: 180, thigh: 180, shank: 270, foot: 180, uarm2: 180, farm2: 180, thigh2: 180, shank2: 270, foot2: 180 };
const SIT = { trunk: 4, thigh: 90, shank: 180, foot: 90, uarm: 175, farm: 100, thigh2: 90, shank2: 180 };

export const EXERCISES = {
  // ---------------- CERVICAL ----------------
  chin_tuck: {
    name: S('Rétraction cervicale (menton rentré)', 'Chin tuck (cervical retraction)'),
    region: 'cervical', equip: [],
    steps: steps(
      ['Assis ou debout, dos droit, regard à l’horizontale.', 'Sit or stand tall, eyes level.'],
      ['Recule la tête à l’horizontale comme pour faire un double menton.', 'Glide your head straight back as if making a double chin.'],
      ['Tiens 3 à 5 s sans pencher la tête vers le bas.', 'Hold 3–5 s without tipping your head down.'],
      ['Reviens doucement.', 'Return slowly.']),
    keys: [k('head', 'Mouvement horizontal, pas de flexion', 'Horizontal glide, no nodding', [14, -8]), k('shoulder', 'Épaules relâchées', 'Shoulders relaxed', [-12, 4])],
    dose: { type: 'reps', sets: 2, reps: 10, holdTop: 4 },
    fig: { view: 'side', frames: [{ head: 24 }, { head: -6 }], trace: 'head', period: 3.4 },
    track: { mode: 'reps', planes: {
      side: { metric: 'neckFwd', rel: true, delta: -0.06, holdTop: 3, checks: [{ m: 'trunkLean', abs: true, max: 12, cue: 'trunkSway' }] },
    } },
  },
  dnf: {
    name: S('Fléchisseurs profonds du cou (hochement couché)', 'Deep neck flexor nod (supine)'),
    region: 'cervical', equip: ['mat'],
    steps: steps(
      ['Couché sur le dos, genoux fléchis, tête sur une serviette pliée.', 'Lie on your back, knees bent, head on a folded towel.'],
      ['Fais un petit « oui » : rentre doucement le menton sans soulever la tête.', 'Make a small “yes” nod: tuck the chin without lifting the head.'],
      ['Tiens 10 s en respirant normalement.', 'Hold 10 s, breathing normally.'],
      ['Les muscles superficiels de l’avant du cou restent relâchés.', 'Keep the superficial front neck muscles relaxed.']),
    keys: [k('head', 'Petit hochement, tête au sol', 'Small nod, head stays down', [0, -16])],
    dose: { type: 'hold', sets: 1, reps: 10, hold: 10 },
    fig: { view: 'side', anchor: { j: 'pelvis', x: 132, y: 170 }, frames: [{ ...SUPINE_HOOK }, { ...SUPINE_HOOK, head: -14 }], props: ['mat'], period: 3 },
    track: null,
  },
  cerv_rot: {
    name: S('Rotation cervicale active', 'Active cervical rotation'),
    region: 'cervical', equip: [],
    steps: steps(
      ['Assis, dos droit, épaules basses.', 'Sit tall, shoulders down.'],
      ['Tourne lentement la tête d’un côté jusqu’à une légère tension.', 'Slowly turn your head to one side until mild tension.'],
      ['Reviens au centre, puis de l’autre côté.', 'Return to center, then the other side.'],
      ['Garde le menton à l’horizontale.', 'Keep your chin level.']),
    keys: [k('head', 'Pivot pur, sans inclinaison', 'Pure rotation, no tilt', [14, -6]), k('shR', 'Épaules immobiles', 'Shoulders still', [-10, 8])],
    dose: { type: 'reps', sets: 2, reps: 10 },
    fig: { view: 'front', frames: [{ headRot: 0 }, { headRot: 1 }, { headRot: 0 }, { headRot: -1 }], period: 4.4 },
    track: { mode: 'reps', planes: {
      front: { metric: 'headRot', abs: true, from: 0.05, to: 0.5, checks: [{ m: 'headTilt', abs: true, max: 10, cue: 'headTilt' }, { m: 'shrug', rel: true, max: 0.12, cue: 'shrug' }] },
    } },
  },
  row_band: {
    name: S('Rangée à l’élastique (rétraction scapulaire)', 'Band row (scapular retraction)'),
    region: 'shoulder', equip: ['band'],
    steps: steps(
      ['Debout face à l’élastique fixé à hauteur de taille, bras tendus.', 'Stand facing a band anchored at waist height, arms straight.'],
      ['Tire les coudes vers l’arrière en serrant les omoplates.', 'Pull your elbows back, squeezing the shoulder blades.'],
      ['Garde le tronc immobile et les épaules basses.', 'Keep your trunk still and shoulders down.'],
      ['Reviens lentement en 2–3 s.', 'Return slowly over 2–3 s.']),
    keys: [k('elbow', 'Coude vers l’arrière, près du corps', 'Elbow back, close to body', [-6, 12]), k('shoulder', 'Omoplates serrées, épaules basses', 'Blades together, shoulders low', [-14, -4])],
    dose: { type: 'reps', sets: 3, reps: 12, tempo: '2-1-3' },
    fig: { view: 'side', anchor: { j: 'ankle', x: 100, y: 178 }, frames: [{ uarm: 100, farm: 95, uarm2: 100, farm2: 95 }, { uarm: 205, farm: 95, uarm2: 205, farm2: 95 }], trace: 'elbow', arc: ['elbow', 'shoulder', 'wrist'], held: [['band', 'wrist', [222, 112]]], props: [['wall', 222]] },
    track: { mode: 'reps', planes: {
      side: { metric: 'shFlex', from: 70, to: -10, checks: [{ m: 'trunkLean', abs: true, max: 12, cue: 'trunkSway' }] },
    } },
  },

  // ---------------- DORSAL ----------------
  thor_ext: {
    name: S('Extension thoracique assise', 'Seated thoracic extension'),
    region: 'thoracic', equip: ['chair'],
    steps: steps(
      ['Assis, mains derrière la tête, coudes vers l’avant.', 'Sit, hands behind your head, elbows forward.'],
      ['Ouvre le haut du dos vers l’arrière en levant le sternum.', 'Extend the upper back, lifting your breastbone.'],
      ['Le bas du dos reste neutre, le mouvement vient du thorax.', 'Low back stays neutral; motion comes from the upper back.'],
      ['Reviens lentement.', 'Return slowly.']),
    keys: [k('shoulder', 'Sternum vers le plafond', 'Breastbone up', [12, -8]), k('pelvis', 'Bassin stable sur la chaise', 'Pelvis stable on chair', [-14, 0])],
    dose: { type: 'reps', sets: 2, reps: 10, holdTop: 3 },
    fig: { view: 'side', anchor: { j: 'ankle', x: 130, y: 178 }, frames: [{ ...SIT, trunk: 12, head: 8, uarm: 25, farm: 245, uarm2: 25, farm2: 245 }, { ...SIT, trunk: -14, head: -12, uarm: 0, farm: 225, uarm2: 0, farm2: 225 }], props: ['chair'], trace: 'head' },
    track: { mode: 'reps', planes: {
      side: { metric: 'trunkLean', rel: true, delta: -12, holdTop: 2, checks: [] },
    } },
  },
  wall_angel: {
    name: S('Ange au mur (W → Y)', 'Wall angel (W → Y)'),
    region: 'thoracic', equip: ['wall'],
    steps: steps(
      ['Dos au mur, pieds à 10 cm du mur, bas du dos doux contre le mur.', 'Back to wall, feet 10 cm out, low back gently on the wall.'],
      ['Bras en W : coudes à hauteur d’épaules, avant-bras vers le haut.', 'Arms in a W: elbows at shoulder height, forearms up.'],
      ['Glisse les bras vers le haut en Y sans cambrer.', 'Slide arms up into a Y without arching.'],
      ['Redescends en W en serrant les omoplates.', 'Lower back to W, squeezing the blades.']),
    keys: [k('elbowR', 'Coudes et poignets près du mur', 'Elbows and wrists near the wall', [-12, -6]), k('pelvis', 'Pas de cambrure lombaire', 'No low-back arch', [14, 0]), k('shL', 'Épaules basses', 'Shoulders low', [10, -10])],
    dose: { type: 'reps', sets: 2, reps: 10 },
    fig: { view: 'front', frames: [{ shAbdR: 90, shAbdL: 90, elbowR: 90, elbowL: 90 }, { shAbdR: 155, shAbdL: 155, elbowR: 20, elbowL: 20 }], trace: 'wristL' },
    track: { mode: 'reps', planes: {
      front: { metric: 'armElev', both: true, from: 90, to: 150, checks: [{ m: 'armSym', max: 15, cue: 'symmetry' }, { m: 'trunkSide', abs: true, max: 8, cue: 'sideLean' }, { m: 'shrug', rel: true, max: 0.12, cue: 'shrug' }] },
      side: { metric: 'wristUp', from: 0.2, to: 0.85, checks: [{ m: 'trunkLean', min: -8, cue: 'arch' }] },
    } },
  },
  open_book: {
    name: S('Livre ouvert (rotation thoracique couchée)', 'Open book (side-lying thoracic rotation)'),
    region: 'thoracic', equip: ['mat'],
    caption: S('Vue du dessus', 'Top view'),
    steps: steps(
      ['Couché sur le côté, hanches et genoux fléchis à 90°, bras devant toi.', 'Lie on your side, hips and knees at 90°, arms in front.'],
      ['Ouvre le bras du dessus vers l’arrière en suivant la main des yeux.', 'Open the top arm backward, following your hand with your eyes.'],
      ['Les genoux restent collés au sol.', 'Keep your knees together on the floor.'],
      ['Expire en ouvrant, reviens lentement.', 'Breathe out as you open, return slowly.']),
    keys: [k('knee', 'Genoux immobiles', 'Knees stay put', [10, 8]), k('wrist', 'La main suit un arc', 'Hand traces an arc', [8, -10])],
    dose: { type: 'reps', sets: 2, reps: 8, holdTop: 3 },
    fig: { view: 'side', anchor: { j: 'pelvis', x: 140, y: 120 }, frames: [{ trunk: 270, head: 0, thigh: 0, shank: 90, foot: 0, uarm: 0, farm: 0, uarm2: 0, farm2: 0 }, { trunk: 270, head: 25, thigh: 0, shank: 90, foot: 0, uarm: 175, farm: 175, uarm2: 0, farm2: 0 }], trace: 'wrist', period: 4 },
    track: null,
  },

  // ---------------- ÉPAULE ----------------
  pendulum: {
    name: S('Pendulaire de Codman', 'Codman pendulum'),
    region: 'shoulder', equip: ['table'],
    steps: steps(
      ['Penche-toi vers l’avant, main saine appuyée sur une table.', 'Lean forward with your good hand on a table.'],
      ['Laisse pendre le bras atteint, complètement relâché.', 'Let the painful arm hang, fully relaxed.'],
      ['Balance le corps pour faire de petits cercles avec le bras.', 'Sway your body to make small circles with the arm.'],
      ['30 à 60 s dans chaque sens.', '30–60 s each direction.']),
    keys: [k('wrist', 'Le bras est passif', 'Arm is passive', [10, 6]), k('shoulder', 'Mouvement initié par le tronc', 'Motion driven by trunk', [8, -10])],
    dose: { type: 'hold', sets: 2, reps: 2, hold: 45 },
    fig: { view: 'side', anchor: { j: 'ankle', x: 66, y: 178 }, frames: [{ trunk: 72, head: 18, uarm: 168, farm: 168, uarm2: 120, farm2: 160, thigh: 186, shank: 178, thigh2: 170, shank2: 182 }, { trunk: 72, head: 18, uarm: 195, farm: 195, uarm2: 120, farm2: 160, thigh: 186, shank: 178, thigh2: 170, shank2: 182 }], trace: 'wrist', props: [['table', 124, 121]], period: 2.4 },
    track: null,
  },
  stick_flex: {
    name: S('Flexion d’épaule assistée au bâton', 'Stick-assisted shoulder flexion'),
    region: 'shoulder', equip: ['stick'],
    steps: steps(
      ['Debout, tiens un bâton à deux mains, largeur d’épaules.', 'Stand holding a stick with both hands, shoulder-width.'],
      ['Le bras sain aide le bras atteint à monter devant toi.', 'Your good arm helps the painful arm lift forward.'],
      ['Monte jusqu’à une tension tolérable, sans cambrer.', 'Lift to tolerable tension, without arching.'],
      ['Redescends lentement.', 'Lower slowly.']),
    keys: [k('wrist', 'Bras tendus, mouvement fluide', 'Arms straight, smooth motion', [10, -6]), k('pelvis', 'Pas de cambrure', 'No arching', [-14, 0])],
    dose: { type: 'reps', sets: 2, reps: 10, holdTop: 3 },
    fig: { view: 'side', frames: [{ uarm: 160, farm: 130, uarm2: 160, farm2: 130 }, { uarm: 18, farm: 14, uarm2: 18, farm2: 14 }], trace: 'wrist', arc: ['shoulder', 'pelvis', 'elbow'] },
    track: { mode: 'reps', planes: {
      side: { metric: 'shFlex', from: 25, to: 145, holdTop: 2, checks: [{ m: 'trunkLean', min: -8, cue: 'arch' }] },
      front: { metric: 'wristUp', from: -0.2, to: 0.9, checks: [{ m: 'armSym', max: 20, cue: 'symmetry' }, { m: 'shrug', rel: true, max: 0.14, cue: 'shrug' }] },
    } },
  },
  scaption: {
    name: S('Élévation dans le plan de l’omoplate (scaption)', 'Scaption (scapular-plane elevation)'),
    region: 'shoulder', equip: ['dumbbell'],
    steps: steps(
      ['Debout, bras le long du corps, pouces vers le haut.', 'Stand, arms at your sides, thumbs up.'],
      ['Lève les bras à 30° devant le plan du corps (en V).', 'Raise your arms 30° in front of your body (a V shape).'],
      ['Monte sans hausser les épaules, dans l’amplitude sans douleur.', 'Lift without shrugging, in a pain-free range.'],
      ['Redescends en 3 s.', 'Lower over 3 s.']),
    keys: [k('elbowR', 'Bras en V, pouces vers le haut', 'Arms in a V, thumbs up', [-12, -4]), k('shL', 'Épaules basses', 'Shoulders low', [10, -10]), k('neck', 'Tronc vertical', 'Trunk upright', [12, 4])],
    dose: { type: 'reps', sets: 3, reps: 10, tempo: '2-0-3' },
    fig: { view: 'front', frames: [{ shAbdR: 10, shAbdL: 10 }, { shAbdR: 110, shAbdL: 110 }], trace: 'wristL', arc: ['shL', 'hipL', 'elbowL'], held: [['dumbbell', 'wristR'], ['dumbbell', 'wristL']] },
    track: { mode: 'reps', planes: {
      front: { metric: 'armElev', both: true, from: 15, to: 110, checks: [{ m: 'armSym', max: 15, cue: 'symmetry' }, { m: 'trunkSide', abs: true, max: 8, cue: 'sideLean' }, { m: 'shrug', rel: true, max: 0.12, cue: 'shrug' }] },
      side: { metric: 'wristUp', from: -0.85, to: 0.15, checks: [{ m: 'trunkLean', min: -8, cue: 'arch' }, { m: 'trunkLean', abs: true, max: 12, cue: 'trunkSway' }] },
    } },
  },
  er_band: {
    name: S('Rotation externe à l’élastique, coude au corps', 'Band external rotation, elbow at side'),
    region: 'shoulder', equip: ['band', 'towel'],
    steps: steps(
      ['Coude plié à 90°, collé au corps (serviette roulée sous le bras).', 'Elbow bent 90°, tucked in (rolled towel under the arm).'],
      ['Tourne l’avant-bras vers l’extérieur contre l’élastique.', 'Rotate the forearm outward against the band.'],
      ['Le coude ne quitte pas le corps.', 'The elbow stays against your side.'],
      ['Reviens lentement en 3 s.', 'Return slowly over 3 s.']),
    keys: [k('elbowR', 'Coude collé au corps', 'Elbow at your side', [-12, 4]), k('wristR', 'L’avant-bras pivote vers l’extérieur', 'Forearm swings outward', [-8, -10])],
    dose: { type: 'reps', sets: 3, reps: 12, tempo: '2-1-3' },
    fig: { view: 'front', frames: [{ elbowR: -70, farmScaleR: 0.45 }, { elbowR: 80, farmScaleR: 0.95 }], trace: 'wristR', period: 3.4 },
    track: { mode: 'reps', planes: {
      front: { metric: 'erFront', side: 'auto', from: 0.05, to: 0.6, checks: [{ m: 'elbowAway', max: 0.45, cue: 'elbowSide' }, { m: 'shrug', rel: true, max: 0.12, cue: 'shrug' }] },
    } },
  },
  wall_slide: {
    name: S('Glissement des avant-bras au mur', 'Forearm wall slide'),
    region: 'shoulder', equip: ['wall'],
    steps: steps(
      ['Face au mur, avant-bras appuyés, coudes à hauteur d’épaules.', 'Face the wall, forearms on it, elbows at shoulder height.'],
      ['Glisse les avant-bras vers le haut en avançant légèrement.', 'Slide the forearms up while leaning slightly in.'],
      ['Garde les omoplates vers le bas et le ventre engagé.', 'Keep the blades down and your core engaged.'],
      ['Redescends lentement.', 'Slide back down slowly.']),
    keys: [k('elbow', 'Avant-bras en contact avec le mur', 'Forearms stay on the wall', [-12, 6]), k('pelvis', 'Pas de cambrure', 'No arching', [-14, 0])],
    dose: { type: 'reps', sets: 2, reps: 10 },
    fig: { view: 'side', anchor: { j: 'ankle', x: 150, y: 178 }, frames: [{ uarm: 90, farm: 0, uarm2: 90, farm2: 0 }, { uarm: 25, farm: 8, uarm2: 25, farm2: 8 }], trace: 'elbow', props: [['wall', 192]] },
    track: { mode: 'reps', planes: {
      side: { metric: 'shFlex', from: 90, to: 150, checks: [{ m: 'trunkLean', min: -8, cue: 'arch' }] },
      front: { metric: 'wristUp', from: 0.4, to: 1.1, checks: [{ m: 'armSym', max: 15, cue: 'symmetry' }, { m: 'shrug', rel: true, max: 0.12, cue: 'shrug' }] },
    } },
  },
  wall_pushup: {
    name: S('Push-up plus au mur', 'Wall push-up plus'),
    region: 'shoulder', equip: ['wall'],
    steps: steps(
      ['Mains au mur à hauteur d’épaules, corps droit en planche inclinée.', 'Hands on the wall at shoulder height, body straight.'],
      ['Plie les coudes pour approcher la poitrine du mur.', 'Bend the elbows to bring your chest toward the wall.'],
      ['Pousse et, en fin de mouvement, écarte les omoplates (« plus »).', 'Push back and, at the end, spread the shoulder blades (“plus”).'],
      ['Le corps reste aligné du talon à la tête.', 'Keep your body aligned from heels to head.']),
    keys: [k('pelvis', 'Corps aligné, pas de bassin cassé', 'Body in one line', [-4, -14]), k('elbow', 'Coudes à ~45° du corps', 'Elbows ~45° from body', [6, 12])],
    dose: { type: 'reps', sets: 3, reps: 10 },
    fig: { view: 'side', anchor: { j: 'ankle', x: 112, y: 178 }, frames: [{ trunk: 22, head: 0, thigh: 202, shank: 202, uarm: 92, farm: 92, uarm2: 92, farm2: 92 }, { trunk: 26, head: 0, thigh: 206, shank: 206, uarm: 150, farm: 35, uarm2: 150, farm2: 35 }], props: [['wall', 196]], arc: ['elbow', 'shoulder', 'wrist'] },
    track: { mode: 'reps', planes: {
      side: { metric: 'elbow', from: 165, to: 100, checks: [{ m: 'bodyLine', min: 158, cue: 'bodyLine' }] },
    } },
  },

  // ---------------- COUDE ----------------
  elbow_curl: {
    name: S('Flexion du coude (biceps)', 'Elbow flexion (biceps curl)'),
    region: 'elbow', equip: ['dumbbell'],
    steps: steps(
      ['Debout, coude le long du corps, paume vers l’avant.', 'Stand, elbow at your side, palm forward.'],
      ['Plie le coude pour monter la main vers l’épaule.', 'Bend the elbow to bring the hand to your shoulder.'],
      ['Le coude reste immobile, sans élan du tronc.', 'Keep the elbow still, no trunk swing.'],
      ['Redescends en 3 s jusqu’à l’extension complète.', 'Lower over 3 s to full extension.']),
    keys: [k('elbow', 'Coude fixe près du corps', 'Elbow fixed at side', [-12, 4]), k('shoulder', 'Tronc immobile', 'Trunk still', [-12, -6])],
    dose: { type: 'reps', sets: 3, reps: 12, tempo: '2-0-3' },
    fig: { view: 'side', frames: [{ uarm: 182, farm: 176 }, { uarm: 176, farm: 28 }], trace: 'wrist', arc: ['elbow', 'shoulder', 'wrist'], held: [['dumbbell', 'wrist']] },
    track: { mode: 'reps', planes: {
      side: { metric: 'elbow', from: 160, to: 60, checks: [{ m: 'shFlex', abs: true, max: 25, cue: 'elbowPin' }, { m: 'trunkLean', abs: true, max: 10, cue: 'trunkSway' }] },
    } },
  },
  iso_wrist_ext: {
    name: S('Isométrique des extenseurs du poignet', 'Isometric wrist extension'),
    region: 'elbow', equip: ['table'],
    steps: steps(
      ['Avant-bras sur une table, paume vers le bas, main dans le vide.', 'Forearm on a table, palm down, hand over the edge.'],
      ['Pousse le dos de la main contre ton autre main, sans bouger.', 'Push the back of your hand up into your other hand, no movement.'],
      ['Intensité modérée (≈ 5/10), douleur ≤ 3–4/10.', 'Moderate effort (≈5/10), pain ≤3–4/10.'],
      ['Tiens 30–45 s, repos 1 min.', 'Hold 30–45 s, rest 1 min.']),
    keys: [k('wrist', 'Poignet neutre, aucun mouvement', 'Wrist neutral, no motion', [0, -14]), k('elbow', 'Coude fléchi, appuyé', 'Elbow bent, supported', [0, 14])],
    dose: { type: 'hold', sets: 1, reps: 5, hold: 40 },
    fig: { view: 'hand', frames: [{ wrist: -8, mcp: 10, pip: 10 }], props: ['table'], arc: ['wrist', 'elbow', 'mcp'] },
    track: null,
  },
  ecc_wrist_ext: {
    name: S('Excentrique des extenseurs du poignet', 'Eccentric wrist extension'),
    region: 'elbow', equip: ['dumbbell', 'table'],
    steps: steps(
      ['Avant-bras sur une table, paume vers le bas, haltère légère.', 'Forearm on a table, palm down, light dumbbell.'],
      ['Avec l’autre main, monte le poignet en extension.', 'Use your other hand to lift the wrist up.'],
      ['Descends seul lentement en 3–4 s.', 'Lower on your own slowly over 3–4 s.'],
      ['Douleur tolérée ≤ 4/10, qui se calme en 24 h.', 'Pain ≤4/10, settling within 24 h.']),
    keys: [k('wrist', 'Descente lente (3–4 s)', 'Slow lowering (3–4 s)', [0, -16]), k('elbow', 'Avant-bras immobile', 'Forearm still', [0, 14])],
    dose: { type: 'reps', sets: 3, reps: 15, tempo: '0-0-4' },
    fig: { view: 'hand', frames: [{ wrist: -40, mcp: 50, pip: 70 }, { wrist: 40, mcp: 50, pip: 70 }], props: ['table'], held: [['dumbbell', 'mcp']], trace: 'mcp', arc: ['wrist', 'elbow', 'mcp'] },
    track: null,
  },
  ecc_wrist_flex: {
    name: S('Excentrique des fléchisseurs du poignet', 'Eccentric wrist flexion'),
    region: 'elbow', equip: ['dumbbell', 'table'],
    steps: steps(
      ['Avant-bras sur une table, paume vers le haut, haltère légère.', 'Forearm on a table, palm up, light dumbbell.'],
      ['Monte le poignet avec l’aide de l’autre main.', 'Lift the wrist with help from the other hand.'],
      ['Descends seul lentement en 3–4 s.', 'Lower on your own over 3–4 s.'],
      ['Garde le coude fléchi et appuyé.', 'Keep the elbow bent and supported.']),
    keys: [k('wrist', 'Descente lente', 'Slow lowering', [0, -16])],
    dose: { type: 'reps', sets: 3, reps: 15, tempo: '0-0-4' },
    fig: { view: 'hand', frames: [{ wrist: -40, mcp: 50, pip: 70 }, { wrist: 35, mcp: 50, pip: 70 }], props: ['table'], held: [['dumbbell', 'mcp']], trace: 'mcp' },
    track: null,
  },
  tyler_twist: {
    name: S('Torsion à la barre flexible (Tyler twist)', 'Flexbar Tyler twist'),
    region: 'elbow', equip: ['flexbar'],
    steps: steps(
      ['Tiens la barre verticale, main atteinte en bas, poignet en extension.', 'Hold the bar upright, affected hand below, wrist extended.'],
      ['Tords le haut de la barre avec la main saine.', 'Twist the top of the bar with your good hand.'],
      ['Tends les bras devant toi en gardant la torsion.', 'Bring arms forward keeping the twist.'],
      ['Laisse la main atteinte se dérouler lentement (excentrique).', 'Let the affected wrist untwist slowly (eccentric).']),
    keys: [k('wrist', 'Le poignet atteint cède lentement', 'Affected wrist yields slowly', [0, -14])],
    dose: { type: 'reps', sets: 3, reps: 15 },
    fig: { view: 'hand', frames: [{ wrist: -35, mcp: 60, pip: 80 }, { wrist: 25, mcp: 60, pip: 80 }], trace: 'mcp' },
    track: null,
  },
  pron_sup: {
    name: S('Pronation-supination avec marteau', 'Pronation–supination with hammer'),
    region: 'elbow', equip: ['hammer'],
    steps: steps(
      ['Avant-bras appuyé, coude à 90°, marteau tenu près de la tête.', 'Forearm supported, elbow 90°, hammer held near its head.'],
      ['Tourne lentement la paume vers le bas, puis vers le haut.', 'Slowly turn the palm down, then up.'],
      ['Le coude reste immobile.', 'Keep the elbow still.'],
      ['Éloigne la main de la tête du marteau pour progresser.', 'Grip further from the head to progress.']),
    keys: [k('mcp', 'Rotation de l’avant-bras seulement', 'Forearm rotation only', [10, 10])],
    dose: { type: 'reps', sets: 3, reps: 12 },
    fig: { view: 'hand', frames: [{ wrist: 0, mcp: 75, pip: 90, dip: 60, forearmRot: -70 }, { wrist: 0, mcp: 75, pip: 90, dip: 60, forearmRot: 70 }], props: ['table'], held: [['hammer']] },
    track: null,
  },

  // ---------------- POIGNET / MAIN ----------------
  tendon_glides: {
    name: S('Glissements tendineux des fléchisseurs', 'Flexor tendon glides'),
    region: 'wrist', equip: [],
    steps: steps(
      ['Main droite, doigts tendus.', 'Start with fingers straight.'],
      ['Crochet → poing complet → table → poing droit.', 'Hook → full fist → tabletop → straight fist.'],
      ['Tiens chaque position 3 s, retour aux doigts tendus entre chacune.', 'Hold each 3 s, back to straight between each.'],
      ['Mouvement lent, sans douleur.', 'Slow, pain-free.']),
    keys: [k('pip', 'Chaque position isole un tendon', 'Each position isolates a tendon', [6, -14])],
    dose: { type: 'reps', sets: 1, reps: 10, holdTop: 3 },
    fig: { view: 'hand', frames: [{}, { pip: 95, dip: 70 }, { mcp: 85, pip: 100, dip: 70 }, { mcp: 85 }, { mcp: 85, pip: 95 }], period: 7 },
    track: null,
  },
  median_glide: {
    name: S('Glissement neural du nerf médian', 'Median nerve glide'),
    region: 'wrist', equip: [],
    steps: steps(
      ['Debout, bras à l’horizontale sur le côté, coude plié, paume vers le plafond.', 'Stand, arm out to the side, elbow bent, palm up.'],
      ['Tends le coude et étends le poignet en même temps.', 'Straighten the elbow and extend the wrist together.'],
      ['Incline la tête vers le côté opposé en même temps (glissement).', 'Tilt the head away at the same time (slider).'],
      ['Mouvement doux : picotements légers et brefs seulement.', 'Gentle: only brief, mild tingling.']),
    keys: [k('elbowR', 'Coude et poignet bougent ensemble', 'Elbow and wrist move together', [-8, 12]), k('head', 'Tête s’éloigne du bras', 'Head tilts away', [12, -8])],
    dose: { type: 'reps', sets: 2, reps: 10 },
    fig: { view: 'front', frames: [{ shAbdR: 90, elbowR: 90, head: 0 }, { shAbdR: 90, elbowR: 5, head: 15 }], trace: 'wristR' },
    track: null,
  },
  wrist_rom: {
    name: S('Flexion-extension active du poignet', 'Active wrist flexion–extension'),
    region: 'wrist', equip: ['table'],
    steps: steps(
      ['Avant-bras appuyé, main au-delà du bord de la table.', 'Forearm supported, hand past the table edge.'],
      ['Plie lentement le poignet vers le haut puis vers le bas.', 'Slowly bend the wrist up, then down.'],
      ['Doigts détendus.', 'Fingers relaxed.'],
      ['Tiens 2 s à chaque extrémité.', 'Hold 2 s at each end.']),
    keys: [k('wrist', 'Amplitude maximale confortable', 'Full comfortable range', [0, -16])],
    dose: { type: 'reps', sets: 2, reps: 10 },
    fig: { view: 'hand', frames: [{ wrist: -55 }, { wrist: 55 }], props: ['table'], arc: ['wrist', 'elbow', 'mcp'], trace: 'tip' },
    track: null,
  },
  radial_dev: {
    name: S('Déviation radiale progressive (pouce vers le haut)', 'Graded radial deviation (thumb up)'),
    region: 'wrist', equip: ['hammer'],
    steps: steps(
      ['Avant-bras sur la table, pouce vers le plafond, marteau léger.', 'Forearm on the table, thumb up, light hammer.'],
      ['Monte la main vers le pouce en déviation radiale.', 'Lift the hand toward the thumb side.'],
      ['Redescends en 3 s.', 'Lower over 3 s.'],
      ['Commence sans charge si irritable.', 'Start without load if irritable.']),
    keys: [k('wrist', 'Bouge au poignet, pas à l’avant-bras', 'Move at the wrist, not forearm', [0, -16])],
    dose: { type: 'reps', sets: 3, reps: 10, tempo: '2-0-3' },
    fig: { view: 'hand', frames: [{ wrist: 20, mcp: 70, pip: 90, forearmRot: 20 }, { wrist: -20, mcp: 70, pip: 90, forearmRot: -20 }], props: ['table'], held: [['hammer']] },
    track: null,
  },
  thumb_opp: {
    name: S('Opposition du pouce', 'Thumb opposition'),
    region: 'wrist', equip: [],
    steps: steps(
      ['Main ouverte.', 'Open hand.'],
      ['Touche le bout de chaque doigt avec le bout du pouce en faisant un « O ».', 'Touch each fingertip with the thumb tip, making an “O”.'],
      ['Garde la première articulation du pouce arrondie.', 'Keep the thumb joint rounded.'],
      ['Reviens main ouverte entre chaque doigt.', 'Open the hand between each finger.']),
    keys: [k('thumbTip', 'Forme un O, pas un D', 'Make an O, not a D', [8, 8])],
    dose: { type: 'reps', sets: 2, reps: 10 },
    fig: { view: 'hand', frames: [{ thumb: 20 }, { thumb: -45, mcp: 40, pip: 35, dip: 20 }] },
    track: null,
  },
  thumb_cmc: {
    name: S('Stabilisation du pouce en « C »', 'Thumb “C” stabilization'),
    region: 'wrist', equip: ['band'],
    steps: steps(
      ['Élastique autour du pouce et de l’index.', 'Band around thumb and index.'],
      ['Ouvre le pouce en arc en gardant la base stable et arrondie.', 'Open the thumb in an arc, keeping the base stable and rounded.'],
      ['Tiens 5 s, reviens lentement.', 'Hold 5 s, return slowly.'],
      ['Évite d’hyperétendre la base du pouce.', 'Avoid collapsing the thumb base.']),
    keys: [k('thumbBase', 'Base du pouce stable', 'Stable thumb base', [-6, -12])],
    dose: { type: 'reps', sets: 2, reps: 10, holdTop: 5 },
    fig: { view: 'hand', frames: [{ thumb: 0, mcp: 20, pip: 20 }, { thumb: 45, mcp: 20, pip: 20 }] },
    track: null,
  },
  grip_putty: {
    name: S('Préhension à la pâte thérapeutique', 'Therapy putty grip'),
    region: 'wrist', equip: ['putty'],
    steps: steps(
      ['Pâte molle dans la paume.', 'Soft putty in the palm.'],
      ['Serre lentement en fermant le poing.', 'Squeeze slowly into a fist.'],
      ['Tiens 3 s puis relâche complètement.', 'Hold 3 s, then fully relax.'],
      ['Augmente la dureté de la pâte au fil des semaines.', 'Use firmer putty over the weeks.']),
    keys: [k('pip', 'Fermeture complète des doigts', 'Full finger closure', [6, -14])],
    dose: { type: 'reps', sets: 3, reps: 12, holdTop: 3 },
    fig: { view: 'hand', frames: [{ mcp: 20, pip: 20, dip: 10 }, { mcp: 85, pip: 100, dip: 70 }], held: [['ball', 'pip']] },
    track: null,
  },

  // ---------------- LOMBAIRE ----------------
  glute_bridge: {
    name: S('Pont fessier', 'Glute bridge'),
    region: 'lumbar', equip: ['mat'],
    steps: steps(
      ['Couché sur le dos, genoux fléchis, pieds à plat largeur de hanches.', 'Lie on your back, knees bent, feet hip-width.'],
      ['Serre les fesses et soulève le bassin jusqu’à aligner épaules-hanches-genoux.', 'Squeeze the glutes and lift until shoulders, hips and knees align.'],
      ['Ne cambre pas : les côtes restent basses.', 'Don’t arch: keep ribs down.'],
      ['Tiens 2 s, redescends vertèbre par vertèbre.', 'Hold 2 s, roll down slowly.']),
    keys: [k('pelvis', 'Bassin monte, sans cambrer', 'Hips up, no arching', [0, -14]), k('knee', 'Genoux largeur de hanches', 'Knees hip-width', [8, -10])],
    dose: { type: 'reps', sets: 3, reps: 12, holdTop: 2 },
    fig: { view: 'side', anchor: { j: 'ankle', x: 160, y: 178 }, frames: [{ ...SUPINE_HOOK }, { ...SUPINE_HOOK, trunk: 243, thigh: 74, thigh2: 74, uarm: 112, farm: 100 }], props: ['mat'], trace: 'pelvis', arc: ['pelvis', 'shoulder', 'knee'] },
    track: { mode: 'reps', planes: {
      side: { metric: 'hip', from: 125, to: 168, holdTop: 1.5, checks: [] },
      front: { metric: 'hipY', rel: true, delta: 0.35, checks: [{ m: 'pelvisDrop', abs: true, max: 8, cue: 'pelvis' }] },
    } },
  },
  bird_dog: {
    name: S('Chien d’arrêt (bird dog)', 'Bird dog'),
    region: 'lumbar', equip: ['mat'],
    steps: steps(
      ['À quatre pattes, mains sous les épaules, genoux sous les hanches.', 'On all fours, hands under shoulders, knees under hips.'],
      ['Allonge un bras et la jambe opposée en gardant le dos plat.', 'Reach one arm and the opposite leg, back flat.'],
      ['Imagine un verre d’eau sur le bas du dos.', 'Imagine a glass of water on your low back.'],
      ['Tiens 3 s, alterne les côtés.', 'Hold 3 s, alternate sides.']),
    keys: [k('pelvis', 'Bassin à niveau, sans rotation', 'Pelvis level, no rotation', [0, -14]), k('shoulder', 'Dos plat', 'Flat back', [0, -14])],
    dose: { type: 'reps', sets: 3, reps: 8, holdTop: 3 },
    fig: { view: 'side', anchor: { j: 'knee', x: 92, y: 178 }, frames: [{ ...QUAD }, { ...QUAD, uarm: 88, farm: 88, thigh2: 268, shank2: 268, foot2: 180 }], props: ['mat'], trace: 'wrist' },
    track: { mode: 'reps', planes: {
      side: { metric: 'hipMax', from: 100, to: 165, holdTop: 2, checks: [{ m: 'trunkTilt', abs: true, max: 12, cue: 'bodyLine' }] },
      front: { metric: 'wristUp', both: false, from: -0.9, to: 0.0, checks: [{ m: 'pelvisDrop', abs: true, max: 10, cue: 'pelvis' }] },
    } },
  },
  cat_camel: {
    name: S('Chat-chameau', 'Cat–camel'),
    region: 'lumbar', equip: ['mat'],
    steps: steps(
      ['À quatre pattes.', 'On all fours.'],
      ['Arrondis le dos vers le plafond en rentrant le menton.', 'Round your back up, tucking your chin.'],
      ['Puis creuse doucement le dos en levant le regard.', 'Then gently hollow your back, looking up.'],
      ['Mouvement lent et sans douleur, synchronisé à la respiration.', 'Slow, pain-free, with your breathing.']),
    keys: [k('shoulder', 'Mouvement segmentaire de la colonne', 'Segmental spine motion', [-20, -16])],
    dose: { type: 'reps', sets: 1, reps: 10 },
    fig: { view: 'side', anchor: { j: 'knee', x: 92, y: 178 }, frames: [{ ...QUAD, bend: -9, head: 30 }, { ...QUAD, bend: 6, head: -25 }], props: ['mat'] },
    track: null,
  },
  press_up: {
    name: S('Extension lombaire couché (McKenzie)', 'Prone press-up (McKenzie)'),
    region: 'lumbar', equip: ['mat'],
    steps: steps(
      ['Couché sur le ventre, mains sous les épaules.', 'Lie face down, hands under your shoulders.'],
      ['Pousse avec les bras pour soulever le haut du corps.', 'Press up with your arms, lifting the upper body.'],
      ['Le bassin et les fesses restent relâchés au sol.', 'Hips and glutes stay relaxed on the floor.'],
      ['Arrête si la douleur descend dans la jambe.', 'Stop if pain spreads down the leg.']),
    keys: [k('pelvis', 'Bassin au sol', 'Pelvis stays down', [0, -14]), k('elbow', 'Les bras font le travail', 'Arms do the work', [8, -8])],
    dose: { type: 'reps', sets: 1, reps: 10, holdTop: 2 },
    fig: { view: 'side', anchor: { j: 'pelvis', x: 110, y: 172 }, frames: [{ trunk: 90, head: -10, uarm: 200, farm: 92, thigh: 272, shank: 272, foot: 200, thigh2: 272, shank2: 272, foot2: 200 }, { trunk: 64, head: -20, uarm: 178, farm: 178, thigh: 272, shank: 272, foot: 200, thigh2: 272, shank2: 272, foot2: 200 }], props: ['mat'], arc: ['elbow', 'shoulder', 'wrist'] },
    track: { mode: 'reps', planes: {
      side: { metric: 'elbow', from: 95, to: 160, holdTop: 1.5, checks: [] },
    } },
  },
  knee_chest: {
    name: S('Genoux à la poitrine', 'Knees to chest'),
    region: 'lumbar', equip: ['mat'],
    steps: steps(
      ['Couché sur le dos, genoux fléchis.', 'Lie on your back, knees bent.'],
      ['Ramène un genou puis les deux vers la poitrine avec les mains.', 'Bring one knee, then both, toward your chest.'],
      ['Tiens 10–20 s en respirant.', 'Hold 10–20 s, breathing.'],
      ['Redescends un pied à la fois.', 'Lower one foot at a time.']),
    keys: [k('pelvis', 'Le bas du dos s’arrondit doucement', 'Low back gently rounds', [0, 12])],
    dose: { type: 'reps', sets: 1, reps: 6, holdTop: 15 },
    fig: { view: 'side', anchor: { j: 'pelvis', x: 120, y: 172 }, frames: [{ ...SUPINE_HOOK }, { ...SUPINE_HOOK, thigh: 330, shank: 70, thigh2: 330, shank2: 70, uarm: 20, farm: 55 }], props: ['mat'], trace: 'knee' },
    track: { mode: 'reps', planes: {
      side: { metric: 'hip', from: 120, to: 65, holdTop: 5, checks: [] },
    } },
  },
  dead_bug: {
    name: S('Dead bug', 'Dead bug'),
    region: 'lumbar', equip: ['mat'],
    steps: steps(
      ['Sur le dos, hanches et genoux à 90°, bras vers le plafond.', 'On your back, hips and knees at 90°, arms up.'],
      ['Allonge lentement une jambe et le bras opposé.', 'Slowly extend one leg and the opposite arm.'],
      ['Le bas du dos reste en contact avec le sol.', 'Low back stays in contact with the floor.'],
      ['Reviens et alterne.', 'Return and alternate.']),
    keys: [k('pelvis', 'Bas du dos au sol', 'Low back down', [0, 14]), k('ankle', 'Jambe descend lentement', 'Leg lowers slowly', [8, -10])],
    dose: { type: 'reps', sets: 3, reps: 8 },
    fig: { view: 'side', anchor: { j: 'pelvis', x: 110, y: 172 }, frames: [{ trunk: 270, head: 0, thigh: 0, shank: 90, foot: 0, thigh2: 0, shank2: 90, foot2: 0, uarm: 0, farm: 0, uarm2: 0, farm2: 0 }, { trunk: 270, head: 0, thigh: 72, shank: 80, foot: 0, thigh2: 0, shank2: 90, foot2: 0, uarm: 0, farm: 0, uarm2: 290, farm2: 290 }], props: ['mat'], trace: 'ankle' },
    track: { mode: 'reps', planes: {
      side: { metric: 'hipMax', from: 95, to: 155, checks: [] },
    } },
  },
  side_plank: {
    name: S('Planche latérale', 'Side plank'),
    region: 'lumbar', equip: ['mat'],
    caption: S('Vue de face (le patient fait face à la caméra)', 'Front view (patient faces the camera)'),
    steps: steps(
      ['Couché sur le côté, appui sur l’avant-bras, coude sous l’épaule.', 'Lie on your side on your forearm, elbow under shoulder.'],
      ['Soulève le bassin pour aligner épaules, hanches et pieds (version facile : genoux).', 'Lift your hips into a straight line (easier: from knees).'],
      ['Ne laisse pas tomber les hanches.', 'Don’t let the hips sag.'],
      ['Respire normalement pendant le maintien.', 'Breathe normally during the hold.']),
    keys: [k('pelvis', 'Hanches hautes, corps aligné', 'Hips up, body aligned', [0, -14]), k('elbow', 'Coude sous l’épaule', 'Elbow under shoulder', [-10, 0])],
    dose: { type: 'hold', sets: 3, reps: 1, hold: 25 },
    fig: { view: 'side', anchor: { j: 'ankle', x: 36, y: 176 }, frames: [{ trunk: 74, head: 0, thigh: 262, shank: 258, foot: 0, uarm: 168, farm: 90, uarm2: 200, farm2: 200 }, { trunk: 68, head: 0, thigh: 248, shank: 248, foot: 0, uarm: 180, farm: 90, uarm2: 200, farm2: 200 }], props: ['mat'], arc: ['pelvis', 'shoulder', 'ankle'] },
    track: { mode: 'hold', planes: {
      front: { metric: 'bodyLine', min: 158, max: 200, checks: [] },
    } },
  },
  hip_hinge: {
    name: S('Charnière de hanche', 'Hip hinge'),
    region: 'lumbar', equip: ['stick'],
    steps: steps(
      ['Debout, pieds largeur de hanches, genoux légèrement fléchis.', 'Stand feet hip-width, knees soft.'],
      ['Pousse les fesses vers l’arrière en penchant le tronc, dos droit.', 'Push your hips back and tip the trunk forward, back straight.'],
      ['Bâton contre tête, haut du dos et sacrum : 3 points de contact.', 'Stick touching head, upper back and sacrum: 3 contact points.'],
      ['Reviens en serrant les fesses.', 'Return by squeezing the glutes.']),
    keys: [k('pelvis', 'Les hanches reculent', 'Hips move back', [-14, 0]), k('knee', 'Genoux peu fléchis', 'Knees only slightly bent', [10, 0]), k('shoulder', 'Dos droit', 'Neutral spine', [4, -12])],
    dose: { type: 'reps', sets: 3, reps: 10 },
    fig: { view: 'side', frames: [{}, { trunk: 58, head: -8, thigh: 168, shank: 192, thigh2: 168, shank2: 192, uarm: 178, farm: 178, uarm2: 178, farm2: 178 }], trace: 'shoulder', arc: ['pelvis', 'shoulder', 'knee'] },
    track: { mode: 'reps', planes: {
      side: { metric: 'trunkLean', from: 5, to: 50, checks: [{ m: 'knee', min: 140, cue: 'hinge' }] },
    } },
  },
  sit_stand: {
    name: S('Assis-debout', 'Sit-to-stand'),
    region: 'lumbar', equip: ['chair'],
    steps: steps(
      ['Assis au bord d’une chaise, pieds à plat, bras croisés.', 'Sit at the front of a chair, feet flat, arms crossed.'],
      ['Penche le tronc vers l’avant et lève-toi sans les mains.', 'Lean forward and stand up without your hands.'],
      ['Genoux alignés avec les pieds.', 'Knees in line with feet.'],
      ['Rassieds-toi lentement, sans te laisser tomber.', 'Sit back down slowly, don’t drop.']),
    keys: [k('knee', 'Genoux au-dessus des orteils', 'Knees over toes', [10, -8]), k('shoulder', 'Nez au-dessus des orteils au départ', 'Nose over toes to start', [10, -10])],
    dose: { type: 'reps', sets: 3, reps: 10 },
    fig: { view: 'side', anchor: { j: 'ankle', x: 128, y: 178 }, frames: [{ trunk: 38, head: -8, thigh: 92, shank: 186, thigh2: 92, shank2: 186, uarm: 120, farm: 80, uarm2: 120, farm2: 80 }, { uarm: 120, farm: 80, uarm2: 120, farm2: 80 }], props: [['chair', 46, 140]], trace: 'pelvis', arc: ['knee', 'pelvis', 'ankle'] },
    track: { mode: 'reps', planes: {
      side: { metric: 'knee', from: 168, to: 105, checks: [{ m: 'trunkLean', max: 55, cue: 'trunk' }] },
      front: { metric: 'hipLow', rel: true, delta: 0.55, checks: [{ m: 'kneeValgus', max: 0.1, cue: 'valgus' }, { m: 'trunkSide', abs: true, max: 10, cue: 'sideLean' }] },
    } },
  },
  sciatic_glide: {
    name: S('Glissement neural sciatique assis', 'Seated sciatic nerve glide'),
    region: 'lumbar', equip: ['chair'],
    steps: steps(
      ['Assis, dos droit, mains sur les cuisses.', 'Sit tall, hands on thighs.'],
      ['Tends le genou en relevant la tête (regard au plafond).', 'Straighten the knee while looking up.'],
      ['Plie le genou en baissant la tête.', 'Bend the knee while looking down.'],
      ['Doux et rythmé : pas de douleur qui persiste.', 'Gentle and rhythmic: no lingering pain.']),
    keys: [k('knee', 'Genou et tête bougent en sens opposé', 'Knee and head move opposite ways', [10, -10])],
    dose: { type: 'reps', sets: 2, reps: 10 },
    fig: { view: 'side', anchor: { j: 'pelvis', x: 78, y: 138 }, frames: [{ ...SIT, head: 20 }, { ...SIT, shank: 98, foot: 30, head: -18 }], props: [['chair', 46, 140]], trace: 'ankle' },
    track: null,
  },

  // ---------------- HANCHE ----------------
  clamshell: {
    name: S('Coquillage (clamshell)', 'Clamshell'),
    region: 'hip', equip: ['mat', 'band'],
    caption: S('Vue de face', 'Front view'),
    steps: steps(
      ['Couché sur le côté, hanches à 45°, genoux à 90°, pieds ensemble.', 'Side-lying, hips 45°, knees 90°, feet together.'],
      ['Ouvre le genou du dessus sans rouler le bassin vers l’arrière.', 'Open the top knee without rolling the pelvis back.'],
      ['Pieds en contact.', 'Feet stay together.'],
      ['Redescends en 2–3 s.', 'Lower over 2–3 s.']),
    keys: [k('knee2', 'Le genou s’ouvre', 'Knee opens', [8, -10]), k('pelvis', 'Bassin immobile', 'Pelvis still', [-14, -6])],
    dose: { type: 'reps', sets: 3, reps: 12 },
    fig: { view: 'side', anchor: { j: 'pelvis', x: 120, y: 166 }, frames: [{ trunk: 270, head: 0, uarm: 300, farm: 30, thigh: 100, shank: 285, foot: 180, thigh2: 96, shank2: 287, foot2: 180, uarm2: 92, farm2: 95 }, { trunk: 270, head: 0, uarm: 300, farm: 30, thigh: 100, shank: 285, foot: 180, thigh2: 45, shank2: 225, foot2: 180, uarm2: 92, farm2: 95 }], props: ['mat'], trace: 'knee2' },
    track: { mode: 'reps', planes: {
      front: { metric: 'kneeGap', from: 8, to: 38, checks: [] },
    } },
  },
  hip_abd_stand: {
    name: S('Abduction de hanche debout', 'Standing hip abduction'),
    region: 'hip', equip: ['band'],
    steps: steps(
      ['Debout, main sur un mur ou une chaise.', 'Stand with a hand on a wall or chair.'],
      ['Écarte une jambe tendue sur le côté, orteils vers l’avant.', 'Lift one straight leg out to the side, toes forward.'],
      ['Le tronc reste droit, le bassin à niveau.', 'Trunk upright, pelvis level.'],
      ['Redescends lentement.', 'Lower slowly.']),
    keys: [k('kneeL', 'Jambe tendue, orteils devant', 'Leg straight, toes forward', [10, 0]), k('neck', 'Pas d’inclinaison du tronc', 'No trunk lean', [12, 0])],
    dose: { type: 'reps', sets: 3, reps: 12 },
    fig: { view: 'front', frames: [{}, { hipAbdL: 30, trunk: -3 }], trace: 'ankleL', arc: ['hipL', 'pelvis', 'kneeL'] },
    track: { mode: 'reps', planes: {
      front: { metric: 'hipAbd', side: 'auto', from: 4, to: 26, checks: [{ m: 'trunkSide', abs: true, max: 8, cue: 'sideLean' }] },
    } },
  },
  iso_hip_abd: {
    name: S('Abduction isométrique de hanche', 'Isometric hip abduction'),
    region: 'hip', equip: ['wall'],
    steps: steps(
      ['Debout, côté atteint près d’un mur, genou plié contre le mur.', 'Stand with the affected side near a wall, bent knee against it.'],
      ['Pousse le genou contre le mur, bassin à niveau.', 'Press the knee into the wall, pelvis level.'],
      ['Effort ≈ 5/10, sans douleur aggravée.', 'Effort ≈5/10, no increase in pain.'],
      ['Tiens 30–45 s.', 'Hold 30–45 s.']),
    keys: [k('kneeR', 'Pousse latéralement', 'Push outward', [-12, 0])],
    dose: { type: 'hold', sets: 1, reps: 5, hold: 40 },
    fig: { view: 'front', frames: [{ hipAbdR: 6, thighScaleR: 0.8, liftR: 10 }], props: [['wall', 76]] },
    track: null,
  },
  step_up: {
    name: S('Montée de marche', 'Step-up'),
    region: 'hip', equip: ['step'],
    steps: steps(
      ['Pied complet sur une marche.', 'Place your whole foot on a step.'],
      ['Monte en poussant avec la jambe du dessus, sans pousser avec l’autre.', 'Step up driving through the top leg, not the bottom one.'],
      ['Genou aligné avec le 2e orteil, bassin à niveau.', 'Knee over second toe, pelvis level.'],
      ['Redescends lentement.', 'Step down slowly.']),
    keys: [k('knee', 'Genou dans l’axe du pied', 'Knee tracks over foot', [10, -6]), k('pelvis', 'Bassin à niveau', 'Pelvis level', [-14, 0])],
    dose: { type: 'reps', sets: 3, reps: 10 },
    fig: { view: 'side', anchor: { j: 'ankle', x: 132, y: 158 }, frames: [{ trunk: 20, thigh: 118, shank: 200, thigh2: 192, shank2: 188, uarm: 190, farm: 180 }, { trunk: 0, thigh: 180, shank: 180, thigh2: 160, shank2: 210, foot2: 120 }], props: [['step', 104, 64]], trace: 'pelvis', arc: ['knee', 'pelvis', 'ankle'] },
    track: { mode: 'reps', planes: {
      side: { metric: 'knee', from: 110, to: 168, checks: [{ m: 'trunkLean', max: 30, cue: 'trunk' }] },
      front: { metric: 'hipLow', rel: true, delta: -0.45, checks: [{ m: 'kneeValgus', max: 0.1, cue: 'valgus' }, { m: 'pelvisDrop', abs: true, max: 8, cue: 'pelvis' }] },
    } },
  },
  bridge_long: {
    name: S('Pont isométrique jambes allongées', 'Long-lever isometric bridge'),
    region: 'hip', equip: ['step'],
    steps: steps(
      ['Sur le dos, talons sur une marche, genoux presque tendus.', 'On your back, heels on a step, knees almost straight.'],
      ['Soulève le bassin en poussant dans les talons.', 'Lift your hips by pushing through the heels.'],
      ['Tiens sans douleur aggravée (≤ 3/10).', 'Hold without increased pain (≤3/10).'],
      ['Plie davantage les genoux pour faciliter.', 'Bend the knees more to make it easier.']),
    keys: [k('pelvis', 'Corps aligné', 'Body aligned', [0, -14]), k('ankle', 'Pousse dans les talons', 'Push through heels', [6, -10])],
    dose: { type: 'hold', sets: 1, reps: 5, hold: 30 },
    fig: { view: 'side', anchor: { j: 'ankle', x: 186, y: 160 }, frames: [{ trunk: 270, head: 0, thigh: 72, shank: 82, foot: 20, thigh2: 72, shank2: 82, foot2: 20, uarm: 90, farm: 90 }, { trunk: 250, head: 0, thigh: 96, shank: 100, foot: 20, thigh2: 96, shank2: 100, foot2: 20, uarm: 110, farm: 100 }], props: [['step', 172, 40], 'mat'], trace: 'pelvis' },
    track: { mode: 'hold', planes: {
      side: { metric: 'bodyLine', min: 160, max: 200, checks: [] },
    } },
  },
  hip_flex_stretch: {
    name: S('Étirement des fléchisseurs de hanche', 'Hip flexor stretch'),
    region: 'hip', equip: ['mat'],
    steps: steps(
      ['Un genou au sol, l’autre pied devant (position de chevalier).', 'Half-kneel: one knee down, other foot forward.'],
      ['Bascule le bassin vers l’arrière (rentre les fesses).', 'Tuck your pelvis under.'],
      ['Avance doucement le bassin jusqu’à sentir l’étirement devant la hanche.', 'Shift forward until you feel a stretch at the front of the hip.'],
      ['Tiens 30 s sans cambrer.', 'Hold 30 s without arching.']),
    keys: [k('pelvis', 'Bassin rentré', 'Pelvis tucked', [-14, -4]), k('knee2', 'Genou arrière au sol', 'Back knee down', [-10, -8])],
    dose: { type: 'hold', sets: 1, reps: 3, hold: 30 },
    fig: { view: 'side', anchor: { j: 'knee2', x: 92, y: 178 }, frames: [{ trunk: 0, thigh: 92, shank: 180, thigh2: 186, shank2: 270, foot2: 180 }, { trunk: 2, thigh: 78, shank: 196, thigh2: 206, shank2: 270, foot2: 180 }], props: ['mat'], trace: 'pelvis' },
    track: null,
  },
  sl_balance: {
    name: S('Équilibre unipodal', 'Single-leg balance'),
    region: 'ankle', equip: [],
    steps: steps(
      ['Debout près d’un appui, lève un pied.', 'Stand near support and lift one foot.'],
      ['Garde le bassin à niveau et le genou légèrement fléchi.', 'Keep the pelvis level, knee soft.'],
      ['Progression : yeux fermés, surface molle, tourner la tête.', 'Progress: eyes closed, soft surface, head turns.'],
      ['Tiens 30 s par côté.', 'Hold 30 s each side.']),
    keys: [k('hipR', 'Bassin à niveau', 'Pelvis level', [-12, -8]), k('kneeL', 'Genou d’appui souple', 'Stance knee soft', [12, 0])],
    dose: { type: 'hold', sets: 2, reps: 2, hold: 30 },
    fig: { view: 'front', frames: [{ thighScaleR: 0.7, liftR: 16, shankR: 10 }] },
    track: { mode: 'hold', planes: {
      front: { metric: 'footLift', min: 0.05, max: 9, checks: [{ m: 'pelvisDrop', abs: true, max: 8, cue: 'pelvis' }, { m: 'trunkSide', abs: true, max: 10, cue: 'sideLean' }] },
    } },
  },

  // ---------------- GENOU ----------------
  squat: {
    name: S('Squat (mini-squat à squat complet)', 'Squat (mini to full)'),
    region: 'knee', equip: [],
    steps: steps(
      ['Debout, pieds largeur d’épaules, orteils légèrement vers l’extérieur.', 'Stand feet shoulder-width, toes slightly out.'],
      ['Descends comme pour t’asseoir, hanches vers l’arrière.', 'Sit back, hips going back.'],
      ['Genoux dans l’axe des orteils, talons au sol.', 'Knees over toes, heels down.'],
      ['Remonte en poussant dans le sol.', 'Drive back up through the floor.']),
    keys: [k('knee', 'Genoux alignés avec le 2e orteil', 'Knees over second toe', [10, -6]), k('ankle', 'Talons au sol', 'Heels down', [-10, 4]), k('shoulder', 'Poitrine haute', 'Chest up', [8, -12])],
    dose: { type: 'reps', sets: 3, reps: 10, tempo: '3-0-2' },
    fig: { view: 'side', frames: [{ uarm: 90, farm: 90, uarm2: 90, farm2: 90 }, { trunk: 35, head: -10, thigh: 98, shank: 206, thigh2: 98, shank2: 206, uarm: 92, farm: 92, uarm2: 92, farm2: 92 }], trace: 'pelvis', arc: ['knee', 'pelvis', 'ankle'] },
    track: { mode: 'reps', planes: {
      side: { metric: 'knee', from: 168, to: 95, checks: [{ m: 'trunkLean', max: 45, cue: 'trunk' }, { m: 'heelRise', rel: true, max: 0.04, cue: 'heelDown' }] },
      front: { metric: 'hipLow', rel: true, delta: 0.45, checks: [{ m: 'kneeValgus', max: 0.1, cue: 'valgus' }, { m: 'kneeSym', max: 15, cue: 'symmetry' }, { m: 'trunkSide', abs: true, max: 8, cue: 'sideLean' }] },
    } },
  },
  slr: {
    name: S('Élévation de la jambe tendue', 'Straight-leg raise'),
    region: 'knee', equip: ['mat'],
    steps: steps(
      ['Sur le dos, une jambe pliée, l’autre tendue (côté caméra).', 'On your back, one knee bent, the other straight (camera side).'],
      ['Contracte la cuisse pour verrouiller le genou.', 'Tighten the thigh to lock the knee.'],
      ['Lève la jambe tendue jusqu’à la hauteur du genou opposé.', 'Lift the straight leg to the height of the other knee.'],
      ['Redescends en 3 s.', 'Lower over 3 s.']),
    keys: [k('knee', 'Genou verrouillé', 'Knee locked', [8, -10])],
    dose: { type: 'reps', sets: 3, reps: 12, tempo: '2-1-3' },
    fig: { view: 'side', anchor: { j: 'pelvis', x: 92, y: 172 }, frames: [{ trunk: 270, head: 0, thigh: 92, shank: 92, foot: 0, thigh2: 45, shank2: 150, uarm: 90, farm: 90 }, { trunk: 270, head: 0, thigh: 50, shank: 50, foot: 320, thigh2: 45, shank2: 150, uarm: 90, farm: 90 }], props: ['mat'], trace: 'ankle', arc: ['pelvis', 'shoulder', 'knee'] },
    track: { mode: 'reps', planes: {
      side: { metric: 'hip', from: 172, to: 138, checks: [{ m: 'knee', min: 160, cue: 'kneeStraight' }] },
    } },
  },
  knee_ext_sit: {
    name: S('Extension du genou assis', 'Seated knee extension'),
    region: 'knee', equip: ['chair', 'weight'],
    steps: steps(
      ['Assis au fond de la chaise, cuisse appuyée.', 'Sit back in the chair, thigh supported.'],
      ['Tends le genou complètement en tirant les orteils vers toi.', 'Straighten the knee fully, toes pulled up.'],
      ['Tiens 2 s, redescends en 3 s.', 'Hold 2 s, lower over 3 s.'],
      ['Ajoute un poids à la cheville pour progresser.', 'Add an ankle weight to progress.']),
    keys: [k('knee', 'Extension complète', 'Full extension', [8, -10]), k('pelvis', 'Cuisse reste sur la chaise', 'Thigh stays on chair', [-12, 4])],
    dose: { type: 'reps', sets: 3, reps: 12, holdTop: 2 },
    fig: { view: 'side', anchor: { j: 'pelvis', x: 78, y: 138 }, frames: [{ ...SIT }, { ...SIT, shank: 96, foot: 10 }], props: [['chair', 46, 140]], trace: 'ankle', arc: ['knee', 'pelvis', 'ankle'] },
    track: { mode: 'reps', planes: {
      side: { metric: 'knee', from: 100, to: 165, holdTop: 1.5, checks: [{ m: 'trunkLean', abs: true, max: 20, cue: 'trunkSway' }] },
    } },
  },
  wall_sit: {
    name: S('Squat isométrique au mur', 'Isometric wall sit'),
    region: 'knee', equip: ['wall'],
    steps: steps(
      ['Dos au mur, pieds à 40–50 cm du mur.', 'Back to the wall, feet 40–50 cm out.'],
      ['Glisse vers le bas jusqu’à un angle confortable (≈ 60° de flexion).', 'Slide down to a comfortable angle (≈60° knee bend).'],
      ['Genoux au-dessus des chevilles, poids sur les talons.', 'Knees over ankles, weight in the heels.'],
      ['Tiens 30–45 s, douleur ≤ 3/10.', 'Hold 30–45 s, pain ≤3/10.']),
    keys: [k('knee', 'Genoux au-dessus des chevilles', 'Knees over ankles', [10, -6]), k('pelvis', 'Dos contre le mur', 'Back on the wall', [-14, 0])],
    dose: { type: 'hold', sets: 1, reps: 5, hold: 40 },
    fig: { view: 'side', anchor: { j: 'ankle', x: 132, y: 178 }, frames: [{ trunk: 0, head: 0, thigh: 112, shank: 188, thigh2: 112, shank2: 188, uarm: 180, farm: 160 }], props: [['wall', 88]], arc: ['knee', 'pelvis', 'ankle'] },
    track: { mode: 'hold', planes: {
      side: { metric: 'knee', min: 100, max: 140, checks: [{ m: 'trunkLean', abs: true, max: 20, cue: 'trunk' }] },
    } },
  },
  step_down: {
    name: S('Descente de marche latérale', 'Lateral step-down'),
    region: 'knee', equip: ['step'],
    steps: steps(
      ['Debout sur une marche, une jambe dans le vide sur le côté.', 'Stand on a step, one leg hanging off the side.'],
      ['Plie le genou d’appui pour toucher le sol du talon.', 'Bend the stance knee to tap the heel to the floor.'],
      ['Genou dans l’axe du 2e orteil, bassin à niveau.', 'Knee over second toe, pelvis level.'],
      ['Remonte lentement.', 'Rise slowly.']),
    keys: [k('kneeL', 'Genou ne rentre pas vers l’intérieur', 'Knee doesn’t cave in', [12, 0]), k('hipR', 'Bassin à niveau', 'Pelvis level', [-12, -8])],
    dose: { type: 'reps', sets: 3, reps: 10, tempo: '3-0-2' },
    fig: { view: 'front', anchor: { j: 'ankleL', x: 132, y: 160 }, frames: [{ liftR: -2 }, { thighScaleL: 0.84, shankL: -6, thighScaleR: 0.95, liftR: -14, trunk: -2 }], props: [['step', 112, 44]], trace: 'ankleR' },
    track: { mode: 'reps', planes: {
      front: { metric: 'hipLow', rel: true, delta: 0.19, checks: [{ m: 'kneeValgus', max: 0.08, cue: 'valgus' }, { m: 'pelvisDrop', abs: true, max: 8, cue: 'pelvis' }, { m: 'trunkSide', abs: true, max: 10, cue: 'sideLean' }] },
      side: { metric: 'knee', from: 170, to: 130, checks: [{ m: 'trunkLean', max: 30, cue: 'trunk' }] },
    } },
  },
  tke: {
    name: S('Extension terminale du genou à l’élastique', 'Terminal knee extension (band)'),
    region: 'knee', equip: ['band'],
    steps: steps(
      ['Élastique derrière le genou, fixé devant toi.', 'Band behind the knee, anchored in front.'],
      ['Genou légèrement plié, pousse-le vers l’arrière pour le tendre.', 'From a slight bend, push the knee back to straighten.'],
      ['Contracte la cuisse 2 s.', 'Squeeze the thigh 2 s.'],
      ['Relâche lentement.', 'Release slowly.']),
    keys: [k('knee', 'Extension complète', 'Full extension', [10, -6])],
    dose: { type: 'reps', sets: 3, reps: 15, holdTop: 2 },
    fig: { view: 'side', frames: [{ thigh: 170, shank: 198 }, {}], held: [['band', 'knee', [222, 136]]], props: [['wall', 222]], arc: ['knee', 'pelvis', 'ankle'] },
    track: { mode: 'reps', planes: {
      side: { metric: 'knee', from: 150, to: 174, holdTop: 1.5, checks: [] },
    } },
  },

  // ---------------- CHEVILLE ----------------
  heel_raise: {
    name: S('Montée sur pointes', 'Heel raise'),
    region: 'ankle', equip: ['wall'],
    steps: steps(
      ['Debout, mains légèrement sur un mur.', 'Stand with fingertips on a wall.'],
      ['Monte sur la pointe des pieds le plus haut possible.', 'Rise onto your toes as high as you can.'],
      ['Poids sur le gros orteil, chevilles droites.', 'Weight over the big toe, ankles straight.'],
      ['Redescends en 3 s. Progression : une jambe.', 'Lower over 3 s. Progress: single leg.']),
    keys: [k('ankle', 'Chevilles droites, pas de roulis externe', 'Ankles straight, no rolling out', [-12, -4]), k('knee', 'Genoux tendus', 'Knees straight', [10, -6])],
    dose: { type: 'reps', sets: 3, reps: 15, tempo: '2-1-3' },
    fig: { view: 'side', anchor: { j: 'toe', x: 135, y: 178 }, frames: [{}, { foot: 126, foot2: 126 }], trace: 'ankle', arc: ['ankle', 'knee', 'toe'] },
    track: { mode: 'reps', planes: {
      side: { metric: 'heelRise', rel: true, delta: 0.06, checks: [{ m: 'trunkLean', abs: true, max: 12, cue: 'trunkSway' }, { m: 'knee', min: 158, cue: 'kneeStraight' }] },
      front: { metric: 'heelRise', rel: true, delta: 0.06, checks: [{ m: 'trunkSide', abs: true, max: 8, cue: 'sideLean' }] },
    } },
  },
  heel_raise_towel: {
    name: S('Montée sur pointes lente, serviette sous les orteils', 'Slow heel raise, towel under toes'),
    region: 'foot', equip: ['step', 'towel'],
    steps: steps(
      ['Serviette roulée sous les orteils (orteils relevés).', 'Rolled towel under your toes (toes lifted).'],
      ['Monte en 3 s, tiens 2 s, descends en 3 s.', 'Rise over 3 s, hold 2 s, lower over 3 s.'],
      ['Progression : sur une jambe avec sac à dos chargé.', 'Progress: single leg with a loaded backpack.'],
      ['Tous les 2 jours.', 'Every other day.']),
    keys: [k('toe', 'Orteils en extension (fascia tendu)', 'Toes extended (fascia tensioned)', [10, -8]), k('ankle', 'Tempo lent 3-2-3', 'Slow 3-2-3 tempo', [-12, -4])],
    dose: { type: 'reps', sets: 3, reps: 12, tempo: '3-2-3', holdTop: 2 },
    fig: { view: 'side', anchor: { j: 'toe', x: 135, y: 178 }, frames: [{}, { foot: 126, foot2: 126 }], trace: 'ankle' },
    track: { mode: 'reps', planes: {
      side: { metric: 'heelRise', rel: true, delta: 0.06, holdTop: 1.5, minRepSec: 5, checks: [{ m: 'knee', min: 158, cue: 'kneeStraight' }] },
      front: { metric: 'heelRise', rel: true, delta: 0.06, minRepSec: 5, checks: [{ m: 'trunkSide', abs: true, max: 8, cue: 'sideLean' }] },
    } },
  },
  ecc_heel_drop: {
    name: S('Excentrique du mollet sur marche (Alfredson)', 'Eccentric heel drop on step (Alfredson)'),
    region: 'ankle', equip: ['step'],
    steps: steps(
      ['Avant-pied sur le bord d’une marche.', 'Ball of foot on the edge of a step.'],
      ['Monte sur deux pieds.', 'Rise up on both feet.'],
      ['Descends lentement en 3–4 s sur la jambe atteinte, talon sous la marche.', 'Lower slowly over 3–4 s on the affected leg, heel below the step.'],
      ['Tendinopathie d’insertion : arrête au niveau de la marche.', 'Insertional tendinopathy: stop at step level.']),
    keys: [k('ankle', 'Descente lente', 'Slow lowering', [-12, -4]), k('knee', 'Genou tendu (puis fléchi pour le soléaire)', 'Knee straight (then bent for soleus)', [10, -6])],
    dose: { type: 'reps', sets: 3, reps: 15, tempo: '0-0-4' },
    fig: { view: 'side', anchor: { j: 'toe', x: 128, y: 162 }, frames: [{ foot: 124, foot2: 124 }, { foot: 62, foot2: 62 }], props: [['step', 112, 56]], trace: 'ankle', arc: ['ankle', 'knee', 'toe'] },
    track: { mode: 'reps', planes: {
      side: { metric: 'ankle', from: 125, to: 85, minRepSec: 3, checks: [{ m: 'knee', min: 155, cue: 'kneeStraight' }] },
    } },
  },
  knee_to_wall: {
    name: S('Dorsiflexion genou au mur', 'Knee-to-wall dorsiflexion'),
    region: 'ankle', equip: ['wall'],
    steps: steps(
      ['Face au mur, pied atteint devant, à 5–10 cm du mur.', 'Face the wall, affected foot forward, 5–10 cm away.'],
      ['Avance le genou vers le mur sans lever le talon.', 'Drive the knee toward the wall without lifting the heel.'],
      ['Genou dans l’axe du 2e orteil.', 'Knee over second toe.'],
      ['Recule le pied quand c’est facile.', 'Move the foot back as it gets easy.']),
    keys: [k('ankle', 'Talon au sol', 'Heel down', [-12, -2]), k('knee', 'Genou vers le mur', 'Knee to the wall', [10, -6])],
    dose: { type: 'reps', sets: 2, reps: 12, holdTop: 2 },
    fig: { view: 'side', anchor: { j: 'ankle', x: 150, y: 178 }, frames: [{ uarm: 110, farm: 80, uarm2: 110, farm2: 80, thigh2: 195, shank2: 190 }, { trunk: 6, thigh: 162, shank: 214, uarm: 100, farm: 70, uarm2: 100, farm2: 70, thigh2: 200, shank2: 195 }], props: [['wall', 196]], trace: 'knee', arc: ['ankle', 'knee', 'toe'] },
    track: { mode: 'reps', planes: {
      side: { metric: 'shinLean', from: 3, to: 32, holdTop: 1.5, checks: [{ m: 'heelRise', rel: true, max: 0.03, cue: 'heelDown' }] },
    } },
  },
  calf_stretch: {
    name: S('Étirement du mollet au mur', 'Wall calf stretch'),
    region: 'ankle', equip: ['wall'],
    steps: steps(
      ['Mains au mur, jambe atteinte derrière, talon au sol.', 'Hands on wall, affected leg back, heel down.'],
      ['Plie le genou avant jusqu’à sentir l’étirement du mollet arrière.', 'Bend the front knee until you feel the back calf stretch.'],
      ['Pied arrière droit vers l’avant.', 'Back foot pointing straight ahead.'],
      ['Tiens 30 s ; refais genou arrière fléchi (soléaire).', 'Hold 30 s; repeat with back knee bent (soleus).']),
    keys: [k('ankle', 'Talon arrière au sol', 'Back heel down', [-12, -2])],
    dose: { type: 'hold', sets: 1, reps: 3, hold: 30 },
    fig: { view: 'side', anchor: { j: 'ankle', x: 92, y: 178 }, frames: [{ trunk: 18, thigh: 198, shank: 198, thigh2: 145, shank2: 165, uarm: 95, farm: 80, uarm2: 95, farm2: 80 }], props: [['wall', 196]] },
    track: null,
  },
  ankle_alpha: {
    name: S('Alphabet avec la cheville', 'Ankle alphabet'),
    region: 'ankle', equip: [],
    steps: steps(
      ['Assis, jambe tendue ou croisée, pied dans le vide.', 'Sit with the foot off the floor.'],
      ['Dessine les lettres de l’alphabet avec le gros orteil.', 'Trace the alphabet with your big toe.'],
      ['Mouvement à la cheville, la jambe reste immobile.', 'Move at the ankle; keep the leg still.'],
      ['1 à 2 alphabets.', '1–2 alphabets.']),
    keys: [k('mtp', 'Le gros orteil trace les lettres', 'Big toe traces letters', [10, 10])],
    dose: { type: 'reps', sets: 1, reps: 2 },
    fig: { view: 'foot', frames: [{ ankle: 0, toes: 0 }, { ankle: 18, toes: 0 }, { ankle: -18, toes: 0 }], period: 4 },
    track: null,
  },
  eversion_band: {
    name: S('Éversion à l’élastique', 'Band eversion'),
    region: 'ankle', equip: ['band'],
    steps: steps(
      ['Assis, élastique autour de l’avant-pied, tenu vers l’intérieur.', 'Sit with a band around the forefoot, pulled inward.'],
      ['Tourne la plante du pied vers l’extérieur.', 'Turn the sole of the foot outward.'],
      ['La jambe ne tourne pas.', 'The leg doesn’t rotate.'],
      ['Reviens en 3 s.', 'Return over 3 s.']),
    keys: [k('ankle', 'Mouvement à la cheville seulement', 'Ankle motion only', [-10, -8])],
    dose: { type: 'reps', sets: 3, reps: 12 },
    fig: { view: 'foot', frames: [{ ankle: 0 }, { ankle: 12, toes: 10 }] },
    track: null,
  },
  inversion_band: {
    name: S('Inversion à l’élastique (tibial postérieur)', 'Band inversion (tibialis posterior)'),
    region: 'ankle', equip: ['band'],
    steps: steps(
      ['Assis, jambe croisée, élastique tiré vers l’extérieur.', 'Sit, leg crossed, band pulled outward.'],
      ['Tourne la plante du pied vers l’intérieur et vers le bas.', 'Turn the sole of the foot in and down.'],
      ['Garde l’arche du pied active.', 'Keep the arch active.'],
      ['Reviens en 3 s.', 'Return over 3 s.']),
    keys: [k('archTop', 'Arche soutenue', 'Arch supported', [0, -12])],
    dose: { type: 'reps', sets: 3, reps: 15 },
    fig: { view: 'foot', frames: [{ arch: 5 }, { arch: 12, ankle: -10 }] },
    track: null,
  },

  // ---------------- PIED ----------------
  short_foot: {
    name: S('Pied court (renforcement intrinsèque)', 'Short foot (intrinsic strengthening)'),
    region: 'foot', equip: [],
    steps: steps(
      ['Assis puis debout, pied à plat.', 'Seated then standing, foot flat.'],
      ['Rapproche l’avant-pied du talon en montant l’arche, sans plier les orteils.', 'Draw the ball of the foot toward the heel, lifting the arch, toes straight.'],
      ['Tiens 5–10 s.', 'Hold 5–10 s.'],
      ['Progression : debout sur une jambe.', 'Progress: standing on one leg.']),
    keys: [k('archTop', 'L’arche monte', 'Arch rises', [0, -12]), k('toe', 'Orteils à plat', 'Toes flat', [8, -6])],
    dose: { type: 'reps', sets: 2, reps: 10, holdTop: 6 },
    fig: { view: 'foot', frames: [{ arch: 3 }, { arch: 15 }] },
    track: null,
  },
  plantar_stretch: {
    name: S('Étirement du fascia plantaire', 'Plantar fascia stretch'),
    region: 'foot', equip: [],
    steps: steps(
      ['Assis, cheville sur le genou opposé.', 'Sit with the ankle on the opposite knee.'],
      ['Tire les orteils vers le tibia avec la main.', 'Pull your toes back toward the shin.'],
      ['Sens la tension sous l’arche (palpe-la avec le pouce).', 'Feel the tension under the arch (palpate it).'],
      ['Tiens 10–30 s, surtout avant les premiers pas le matin.', 'Hold 10–30 s, especially before first steps in the morning.']),
    keys: [k('mtp', 'Orteils en extension', 'Toes extended', [8, 10])],
    dose: { type: 'hold', sets: 1, reps: 10, hold: 15 },
    fig: { view: 'foot', frames: [{ toes: 0 }, { toes: 50, ankle: -8 }], trace: 'toe' },
    track: null,
  },
  towel_curl: {
    name: S('Ramasser une serviette avec les orteils', 'Towel scrunches'),
    region: 'foot', equip: ['towel'],
    steps: steps(
      ['Assis, pied sur une serviette au sol.', 'Sit with your foot on a towel.'],
      ['Agrippe la serviette avec les orteils et tire-la vers toi.', 'Grip the towel with your toes and pull it toward you.'],
      ['Le talon reste au sol.', 'Keep the heel down.'],
      ['Ajoute un poids sur la serviette pour progresser.', 'Put a weight on the towel to progress.']),
    keys: [k('toe', 'Flexion des orteils', 'Toe curling', [8, 8])],
    dose: { type: 'reps', sets: 3, reps: 10 },
    fig: { view: 'foot', frames: [{ toes: 0 }, { toes: -35 }] },
    track: null,
  },
  hallux_mob: {
    name: S('Mobilisation du gros orteil', 'Big-toe mobilisation'),
    region: 'foot', equip: [],
    steps: steps(
      ['Assis, tiens le 1er métatarse d’une main.', 'Seated, stabilise the first metatarsal with one hand.'],
      ['De l’autre main, monte le gros orteil vers le haut doucement.', 'With the other hand, gently lift the big toe up.'],
      ['Puis fléchis-le vers le bas.', 'Then bend it down.'],
      ['Mouvement dans une amplitude tolérable.', 'Move within a tolerable range.']),
    keys: [k('mtp', 'Articulation du gros orteil', 'Big-toe joint', [8, 10])],
    dose: { type: 'reps', sets: 2, reps: 15 },
    fig: { view: 'foot', frames: [{ toes: -15 }, { toes: 45 }], trace: 'toe' },
    track: null,
  },
};

// Équipement (étiquettes)
export const EQUIP = {
  mat: S('Tapis', 'Mat'), band: S('Élastique', 'Band'), chair: S('Chaise', 'Chair'), wall: S('Mur', 'Wall'),
  step: S('Marche', 'Step'), dumbbell: S('Haltère', 'Dumbbell'), stick: S('Bâton', 'Stick'), table: S('Table', 'Table'),
  towel: S('Serviette', 'Towel'), flexbar: S('Barre flexible', 'Flexbar'), hammer: S('Marteau', 'Hammer'),
  putty: S('Pâte', 'Putty'), weight: S('Poids cheville', 'Ankle weight'),
};

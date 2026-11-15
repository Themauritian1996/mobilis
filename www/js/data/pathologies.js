// Régions et pathologies MSK fréquentes en physiatrie.
// phases : 1 = semaines 1–2 (calmer, mobilité, contrôle), 2 = semaines 3–6 (renforcement), 3 = semaine 7+ (charge, fonction).
// painMax : douleur acceptable pendant l'exercice (modèle de surveillance de la douleur), retour à la base en < 24 h.

const S = (fr, en) => ({ fr, en });
const L = (...a) => ({ fr: a.map((x) => x[0]), en: a.map((x) => x[1]) });

export const REGIONS = [
  { id: 'cervical', name: S('Cervical', 'Neck'), icon: 'neck' },
  { id: 'thoracic', name: S('Dorsal', 'Upper back'), icon: 'spine' },
  { id: 'shoulder', name: S('Épaule', 'Shoulder'), icon: 'shoulder' },
  { id: 'elbow', name: S('Coude', 'Elbow'), icon: 'elbow' },
  { id: 'wrist', name: S('Poignet / main', 'Wrist / hand'), icon: 'hand' },
  { id: 'lumbar', name: S('Lombaire', 'Low back'), icon: 'spine' },
  { id: 'hip', name: S('Hanche', 'Hip'), icon: 'hip' },
  { id: 'knee', name: S('Genou', 'Knee'), icon: 'knee' },
  { id: 'ankle', name: S('Cheville', 'Ankle'), icon: 'ankle' },
  { id: 'foot', name: S('Pied', 'Foot'), icon: 'foot' },
];

export const PATHOLOGIES = [
  // CERVICAL
  { id: 'neck_mech', region: 'cervical', name: S('Cervicalgie mécanique chronique', 'Chronic mechanical neck pain'), painMax: 4,
    phases: { 1: ['chin_tuck', 'cerv_rot', 'dnf'], 2: ['dnf', 'chin_tuck', 'row_band', 'thor_ext'], 3: ['row_band', 'wall_angel', 'dnf', 'scaption'] },
    edu: L(['Le mouvement régulier aide plus que le repos complet.', 'Regular movement helps more than full rest.'], ['Varie les postures au travail : la meilleure posture est la suivante.', 'Vary postures at work: your best posture is your next one.']),
    avoid: L(['Mouvements brusques en fin d’amplitude.', 'Jerky end-range movements.']) },
  { id: 'cerv_radic', region: 'cervical', name: S('Radiculopathie cervicale', 'Cervical radiculopathy'), painMax: 3,
    phases: { 1: ['chin_tuck', 'median_glide', 'dnf'], 2: ['dnf', 'row_band', 'median_glide', 'chin_tuck'], 3: ['row_band', 'scaption', 'wall_angel'] },
    edu: L(['La plupart s’améliorent en 6–12 semaines.', 'Most improve within 6–12 weeks.'], ['Les glissements neuraux doivent rester doux.', 'Nerve glides should stay gentle.']),
    avoid: L(['Arrête si la douleur ou les engourdissements descendent plus loin dans le bras.', 'Stop if pain or numbness spreads further down the arm.'], ['Consulte rapidement si faiblesse qui progresse.', 'Seek care promptly for progressive weakness.']) },
  { id: 'cervicogenic_ha', region: 'cervical', name: S('Céphalée cervicogénique', 'Cervicogenic headache'), painMax: 3,
    phases: { 1: ['dnf', 'chin_tuck', 'cerv_rot'], 2: ['dnf', 'row_band', 'cerv_rot'], 3: ['row_band', 'wall_angel', 'dnf'] },
    edu: L(['Les fléchisseurs profonds du cou sont la base du traitement.', 'Deep neck flexor training is the cornerstone.']),
    avoid: L(['Nouvelle céphalée intense, différente ou avec symptômes neurologiques : consulte.', 'New severe or different headache, or neuro symptoms: seek care.']) },
  { id: 'wad', region: 'cervical', name: S('Entorse cervicale (coup de fouet)', 'Whiplash-associated disorder'), painMax: 4,
    phases: { 1: ['cerv_rot', 'chin_tuck'], 2: ['dnf', 'cerv_rot', 'row_band'], 3: ['row_band', 'wall_angel', 'dnf'] },
    edu: L(['Reprendre tôt les activités normales améliore le pronostic.', 'Early return to normal activity improves outcomes.']),
    avoid: L(['Collier cervical prolongé.', 'Prolonged collar use.']) },

  // DORSAL
  { id: 'thor_mech', region: 'thoracic', name: S('Dorsalgie mécanique / posture cyphotique', 'Mechanical thoracic pain / kyphotic posture'), painMax: 4,
    phases: { 1: ['thor_ext', 'open_book', 'chin_tuck'], 2: ['wall_angel', 'row_band', 'open_book'], 3: ['row_band', 'wall_angel', 'scaption'] },
    edu: L(['Bouge souvent ta colonne dans toutes les directions.', 'Move your spine often in all directions.']), avoid: L(['Rester figé longtemps.', 'Staying static for long periods.']) },
  { id: 'osteo_kyph', region: 'thoracic', name: S('Cyphose ostéoporotique', 'Osteoporotic kyphosis'), painMax: 3,
    phases: { 1: ['thor_ext', 'chin_tuck', 'sl_balance'], 2: ['wall_angel', 'row_band', 'sit_stand'], 3: ['row_band', 'sit_stand', 'sl_balance', 'step_up'] },
    edu: L(['Extension et renforcement du dos, équilibre et mise en charge réduisent le risque de chute.', 'Back extension, strengthening and balance reduce fall risk.']),
    avoid: L(['Flexion du tronc chargée, torsion en fin d’amplitude (ex. redressements assis).', 'Loaded trunk flexion and end-range twisting (e.g., sit-ups).']) },

  // ÉPAULE
  { id: 'sub_acromial', region: 'shoulder', name: S('Douleur sous-acromiale / tendinopathie de la coiffe', 'Subacromial pain / rotator cuff tendinopathy'), painMax: 5,
    phases: { 1: ['pendulum', 'er_band', 'scaption', 'row_band'], 2: ['er_band', 'scaption', 'wall_slide', 'row_band'], 3: ['scaption', 'wall_pushup', 'er_band', 'wall_slide'] },
    edu: L(['Une douleur ≤ 5/10 pendant l’exercice est acceptable si elle revient à la base le lendemain.', 'Pain ≤5/10 during exercise is fine if it settles by the next day.'], ['La charge progressive est le traitement de choix.', 'Progressive loading is the treatment of choice.']),
    avoid: L(['Travail répété au-dessus de la tête en phase irritable.', 'Repeated overhead work while irritable.']) },
  { id: 'frozen', region: 'shoulder', name: S('Capsulite rétractile', 'Frozen shoulder (adhesive capsulitis)'), painMax: 4,
    phases: { 1: ['pendulum', 'stick_flex', 'er_band'], 2: ['stick_flex', 'wall_slide', 'er_band'], 3: ['wall_slide', 'scaption', 'row_band'] },
    edu: L(['Évolution longue (souvent 1–2 ans), mais favorable.', 'Long course (often 1–2 years), but favourable.'], ['En phase douloureuse, étirements doux seulement.', 'In the painful phase, gentle stretches only.']),
    avoid: L(['Étirements agressifs pendant la phase inflammatoire.', 'Aggressive stretching in the painful phase.']) },
  { id: 'cuff_tear', region: 'shoulder', name: S('Déchirure dégénérative de la coiffe (non opérée)', 'Degenerative rotator cuff tear (non-operative)'), painMax: 5,
    phases: { 1: ['pendulum', 'stick_flex', 'er_band'], 2: ['scaption', 'er_band', 'wall_slide'], 3: ['scaption', 'wall_pushup', 'row_band'] },
    edu: L(['Le deltoïde antérieur et les muscles restants peuvent compenser avec l’entraînement.', 'The anterior deltoid and remaining cuff can compensate with training.']),
    avoid: L(['Perte de force soudaine après un traumatisme : réévaluation.', 'Sudden loss of strength after trauma: reassessment needed.']) },
  { id: 'gh_instab', region: 'shoulder', name: S('Instabilité gléno-humérale', 'Glenohumeral instability'), painMax: 4,
    phases: { 1: ['er_band', 'row_band'], 2: ['er_band', 'scaption', 'wall_pushup', 'row_band'], 3: ['wall_pushup', 'scaption', 'wall_slide'] },
    edu: L(['Contrôle de l’omoplate et de la coiffe = stabilité dynamique.', 'Scapular and cuff control = dynamic stability.']),
    avoid: L(['Position abduction + rotation externe en fin d’amplitude (ex. lancer) au début.', 'End-range abduction + external rotation early on (e.g., throwing).']) },
  { id: 'gh_oa', region: 'shoulder', name: S('Arthrose gléno-humérale', 'Glenohumeral osteoarthritis'), painMax: 5,
    phases: { 1: ['pendulum', 'stick_flex'], 2: ['stick_flex', 'er_band', 'row_band'], 3: ['scaption', 'er_band', 'row_band'] },
    edu: L(['Maintenir l’amplitude et la force réduit la douleur.', 'Maintaining range and strength reduces pain.']), avoid: L(['Charges lourdes au-dessus de la tête.', 'Heavy overhead loads.']) },

  // COUDE
  { id: 'lat_epi', region: 'elbow', name: S('Épicondylalgie latérale (tennis elbow)', 'Lateral epicondylalgia (tennis elbow)'), painMax: 4,
    phases: { 1: ['iso_wrist_ext', 'pron_sup'], 2: ['ecc_wrist_ext', 'tyler_twist', 'pron_sup', 'row_band'], 3: ['ecc_wrist_ext', 'tyler_twist', 'row_band', 'er_band'] },
    edu: L(['Évolution souvent favorable en 6–12 mois ; la charge progressive accélère la récupération.', 'Usually improves over 6–12 months; progressive loading helps.'], ['Prends les objets paume vers le haut.', 'Lift objects palm up.']),
    avoid: L(['Prise serrée prolongée, paume vers le bas.', 'Prolonged tight grip, palm down.']) },
  { id: 'med_epi', region: 'elbow', name: S('Épicondylalgie médiale (golfer’s elbow)', 'Medial epicondylalgia (golfer’s elbow)'), painMax: 4,
    phases: { 1: ['pron_sup', 'wrist_rom'], 2: ['ecc_wrist_flex', 'pron_sup'], 3: ['ecc_wrist_flex', 'elbow_curl', 'row_band'] },
    edu: L(['Surveille les picotements des 4e–5e doigts (nerf ulnaire).', 'Watch for tingling in the 4th–5th fingers (ulnar nerve).']), avoid: L(['Flexion répétée du poignet contre résistance.', 'Repeated resisted wrist flexion.']) },
  { id: 'distal_biceps', region: 'elbow', name: S('Tendinopathie distale du biceps', 'Distal biceps tendinopathy'), painMax: 4,
    phases: { 1: ['pron_sup', 'wrist_rom'], 2: ['elbow_curl', 'pron_sup'], 3: ['elbow_curl', 'row_band', 'wall_pushup'] },
    edu: L(['Supination et flexion chargées progressivement.', 'Gradually load supination and flexion.']), avoid: L(['« Pop » soudain avec ecchymose : consultation urgente.', 'Sudden “pop” with bruising: urgent assessment.']) },
  { id: 'elbow_stiff', region: 'elbow', name: S('Raideur post-fracture / immobilisation du coude', 'Post-fracture / immobilisation elbow stiffness'), painMax: 4,
    phases: { 1: ['elbow_curl', 'pron_sup', 'wrist_rom'], 2: ['elbow_curl', 'pron_sup', 'grip_putty'], 3: ['elbow_curl', 'wall_pushup', 'row_band'] },
    edu: L(['Des répétitions fréquentes et douces récupèrent l’amplitude.', 'Frequent gentle repetitions restore range.']), avoid: L(['Mobilisation forcée douloureuse.', 'Forced painful stretching.']) },

  // POIGNET / MAIN
  { id: 'cts', region: 'wrist', name: S('Syndrome du tunnel carpien', 'Carpal tunnel syndrome'), painMax: 3,
    phases: { 1: ['tendon_glides', 'median_glide'], 2: ['tendon_glides', 'median_glide', 'wrist_rom'], 3: ['grip_putty', 'tendon_glides'] },
    edu: L(['Orthèse de poignet neutre la nuit.', 'Neutral wrist splint at night.']), avoid: L(['Atrophie du pouce ou perte de sensibilité constante : réévaluation (EMG).', 'Thumb muscle wasting or constant numbness: reassessment (EMG).']) },
  { id: 'dequervain', region: 'wrist', name: S('Ténosynovite de De Quervain', 'De Quervain tenosynovitis'), painMax: 3,
    phases: { 1: ['thumb_opp', 'wrist_rom'], 2: ['radial_dev', 'thumb_opp'], 3: ['radial_dev', 'grip_putty'] },
    edu: L(['Orthèse pouce-poignet au besoin.', 'Thumb spica splint as needed.']), avoid: L(['Déviation ulnaire répétée pouce fléchi (ex. bébé porté).', 'Repeated ulnar deviation with thumb flexed (e.g., lifting a baby).']) },
  { id: 'cmc_oa', region: 'wrist', name: S('Rhizarthrose (arthrose du pouce)', 'Thumb CMC osteoarthritis'), painMax: 4,
    phases: { 1: ['thumb_opp', 'thumb_cmc'], 2: ['thumb_cmc', 'grip_putty'], 3: ['thumb_cmc', 'grip_putty'] },
    edu: L(['Préhension en « C » plutôt qu’en pince serrée.', 'Use a “C” grip rather than a tight pinch.']), avoid: L(['Pinces fortes répétées.', 'Repeated forceful pinching.']) },
  { id: 'wrist_stiff', region: 'wrist', name: S('Raideur post-fracture du radius distal', 'Post distal radius fracture stiffness'), painMax: 4,
    phases: { 1: ['wrist_rom', 'tendon_glides', 'pron_sup'], 2: ['wrist_rom', 'grip_putty', 'pron_sup'], 3: ['grip_putty', 'ecc_wrist_ext', 'wall_pushup'] },
    edu: L(['Douleur diffuse disproportionnée, enflure, changement de couleur : consulte (SDRC).', 'Disproportionate diffuse pain, swelling, colour change: seek care (CRPS).']), avoid: L(['Immobilisation inutile.', 'Unnecessary immobilisation.']) },

  // LOMBAIRE
  { id: 'lbp_chronic', region: 'lumbar', name: S('Lombalgie chronique non spécifique', 'Chronic non-specific low back pain'), painMax: 5,
    phases: { 1: ['cat_camel', 'knee_chest', 'glute_bridge', 'bird_dog'], 2: ['bird_dog', 'dead_bug', 'side_plank', 'hip_hinge'], 3: ['hip_hinge', 'squat', 'side_plank', 'step_up'] },
    edu: L(['Le dos est solide : bouger ne l’abîme pas.', 'Your back is strong: movement won’t damage it.'], ['Un peu de douleur pendant l’exercice est normale et sécuritaire.', 'Some pain during exercise is normal and safe.']),
    avoid: L(['Repos au lit prolongé.', 'Prolonged bed rest.']) },
  { id: 'lumb_radic', region: 'lumbar', name: S('Radiculopathie lombaire (sciatalgie)', 'Lumbar radiculopathy (sciatica)'), painMax: 4,
    phases: { 1: ['press_up', 'sciatic_glide', 'glute_bridge'], 2: ['bird_dog', 'glute_bridge', 'sciatic_glide', 'dead_bug'], 3: ['hip_hinge', 'side_plank', 'squat'] },
    edu: L(['Si la douleur se centralise (remonte vers le dos), c’est bon signe.', 'If pain centralises (moves toward the back), that’s a good sign.']),
    avoid: L(['Arrête un exercice qui fait descendre la douleur dans la jambe.', 'Stop any exercise that sends pain further down the leg.']) },
  { id: 'stenosis', region: 'lumbar', name: S('Sténose spinale lombaire', 'Lumbar spinal stenosis'), painMax: 4,
    phases: { 1: ['knee_chest', 'cat_camel', 'glute_bridge'], 2: ['sit_stand', 'glute_bridge', 'dead_bug'], 3: ['sit_stand', 'step_up', 'sl_balance'] },
    edu: L(['La flexion soulage ; le vélo stationnaire est souvent bien toléré.', 'Flexion relieves; stationary cycling is often well tolerated.']), avoid: L(['Extension lombaire prolongée.', 'Prolonged lumbar extension.']) },
  { id: 'si_joint', region: 'lumbar', name: S('Douleur sacro-iliaque / ceinture pelvienne', 'Sacroiliac / pelvic girdle pain'), painMax: 4,
    phases: { 1: ['glute_bridge', 'clamshell'], 2: ['bird_dog', 'side_plank', 'glute_bridge'], 3: ['step_up', 'squat', 'side_plank'] },
    edu: L(['Le renforcement des fessiers et du tronc stabilise le bassin.', 'Glute and trunk strength stabilises the pelvis.']), avoid: L(['Appui prolongé sur une seule jambe en phase aiguë.', 'Prolonged single-leg standing when acute.']) },
  { id: 'spondylolisthesis', region: 'lumbar', name: S('Spondylolisthésis / spondylolyse', 'Spondylolisthesis / spondylolysis'), painMax: 4,
    phases: { 1: ['knee_chest', 'dead_bug', 'glute_bridge'], 2: ['dead_bug', 'side_plank', 'bird_dog'], 3: ['side_plank', 'squat', 'hip_hinge'] },
    edu: L(['Contrôle du tronc en position neutre.', 'Trunk control in neutral spine.']), avoid: L(['Extensions lombaires répétées ou en fin d’amplitude.', 'Repeated or end-range lumbar extension.']) },

  // HANCHE
  { id: 'hip_oa', region: 'hip', name: S('Coxarthrose', 'Hip osteoarthritis'), painMax: 5,
    phases: { 1: ['glute_bridge', 'hip_abd_stand', 'sit_stand'], 2: ['sit_stand', 'step_up', 'squat', 'hip_flex_stretch'], 3: ['step_up', 'squat', 'sl_balance'] },
    edu: L(['L’exercice est un traitement de première ligne, aussi efficace qu’un anti-inflammatoire.', 'Exercise is first-line treatment, as effective as anti-inflammatories.']), avoid: L(['Arrêter de bouger à cause de la peur.', 'Avoiding movement out of fear.']) },
  { id: 'gtps', region: 'hip', name: S('Tendinopathie glutéale (grand trochanter)', 'Gluteal tendinopathy (GTPS)'), painMax: 3,
    phases: { 1: ['iso_hip_abd', 'glute_bridge'], 2: ['sit_stand', 'step_up', 'glute_bridge'], 3: ['step_up', 'hip_abd_stand', 'sl_balance'] },
    edu: L(['Dors avec un oreiller entre les genoux.', 'Sleep with a pillow between your knees.']),
    avoid: L(['Croiser les jambes, se tenir « sur une hanche », étirer la bandelette.', 'Crossing legs, hanging on one hip, ITB stretching.']) },
  { id: 'fai', region: 'hip', name: S('Conflit fémoro-acétabulaire', 'Femoroacetabular impingement'), painMax: 4,
    phases: { 1: ['glute_bridge', 'clamshell', 'dead_bug'], 2: ['hip_abd_stand', 'side_plank', 'step_up'], 3: ['squat', 'step_up', 'sl_balance'] },
    edu: L(['Limite la profondeur du squat à l’amplitude confortable.', 'Limit squat depth to the comfortable range.']), avoid: L(['Flexion profonde avec rotation interne.', 'Deep flexion with internal rotation.']) },
  { id: 'prox_hams', region: 'hip', name: S('Tendinopathie proximale des ischio-jambiers', 'Proximal hamstring tendinopathy'), painMax: 3,
    phases: { 1: ['bridge_long', 'glute_bridge'], 2: ['bridge_long', 'hip_hinge', 'step_up'], 3: ['hip_hinge', 'step_up', 'squat'] },
    edu: L(['Isométriques d’abord, puis charge progressive en longueur.', 'Isometrics first, then progressive lengthened loading.']), avoid: L(['Étirements des ischio-jambiers et assis prolongé sur surface dure.', 'Hamstring stretching and prolonged sitting on hard surfaces.']) },

  // GENOU
  { id: 'knee_oa', region: 'knee', name: S('Gonarthrose', 'Knee osteoarthritis'), painMax: 5,
    phases: { 1: ['slr', 'knee_ext_sit', 'sit_stand'], 2: ['squat', 'step_up', 'tke', 'sit_stand'], 3: ['step_down', 'step_up', 'sl_balance'] },
    edu: L(['Renforcer le quadriceps diminue la douleur.', 'Strengthening the quadriceps reduces pain.'], ['Gonflement qui dure > 24 h : diminue la charge.', 'Swelling lasting >24 h: reduce the load.']), avoid: L(['Arrêter toute activité.', 'Stopping all activity.']) },
  { id: 'pfps', region: 'knee', name: S('Syndrome fémoro-patellaire', 'Patellofemoral pain syndrome'), painMax: 3,
    phases: { 1: ['hip_abd_stand', 'glute_bridge', 'wall_sit', 'slr'], 2: ['squat', 'step_up', 'clamshell'], 3: ['step_down', 'sl_balance', 'squat'] },
    edu: L(['Hanche + genou ensemble donnent de meilleurs résultats.', 'Hip + knee exercises together work best.']), avoid: L(['Squats profonds et escaliers en descente en phase irritable.', 'Deep squats and stair descent while irritable.']) },
  { id: 'patellar_tendon', region: 'knee', name: S('Tendinopathie rotulienne', 'Patellar tendinopathy'), painMax: 3,
    phases: { 1: ['wall_sit'], 2: ['knee_ext_sit', 'squat', 'wall_sit'], 3: ['squat', 'step_down', 'step_up'] },
    edu: L(['Isométriques pour calmer, puis charge lente et lourde.', 'Isometrics to settle, then heavy slow resistance.']), avoid: L(['Sauts et pliométrie avant la fin de la phase de force.', 'Jumping and plyometrics before the strength phase is done.']) },
  { id: 'itbs', region: 'knee', name: S('Syndrome de la bandelette ilio-tibiale', 'Iliotibial band syndrome'), painMax: 3,
    phases: { 1: ['hip_abd_stand', 'glute_bridge'], 2: ['side_plank', 'step_down', 'hip_abd_stand'], 3: ['step_down', 'sl_balance', 'step_up'] },
    edu: L(['Réduis temporairement le volume de course, pas l’activité totale.', 'Temporarily reduce running volume, not overall activity.']), avoid: L(['Descentes en course et augmentations brusques de volume.', 'Downhill running and sudden mileage jumps.']) },
  { id: 'knee_sprain', region: 'knee', name: S('Entorse du genou / LCA (non opéré)', 'Knee sprain / ACL (non-operative)'), painMax: 3,
    phases: { 1: ['slr', 'tke', 'knee_ext_sit'], 2: ['squat', 'step_up', 'sl_balance'], 3: ['step_down', 'sl_balance', 'squat'] },
    edu: L(['Objectif : extension complète et contrôle du quadriceps tôt.', 'Goal: early full extension and quad control.']), avoid: L(['Pivots et changements de direction avant le feu vert.', 'Pivoting and cutting before clearance.']) },

  // CHEVILLE
  { id: 'ankle_sprain', region: 'ankle', name: S('Entorse latérale / instabilité chronique', 'Lateral ankle sprain / chronic instability'), painMax: 4,
    phases: { 1: ['ankle_alpha', 'knee_to_wall', 'eversion_band'], 2: ['heel_raise', 'sl_balance', 'eversion_band'], 3: ['sl_balance', 'step_down', 'heel_raise'] },
    edu: L(['Le travail d’équilibre réduit le risque de récidive d’environ 1/3.', 'Balance training cuts re-sprain risk by about a third.']), avoid: L(['Ignorer une douleur osseuse à la palpation (règles d’Ottawa).', 'Ignoring bony tenderness (Ottawa rules).']) },
  { id: 'achilles', region: 'ankle', name: S('Tendinopathie achilléenne', 'Achilles tendinopathy'), painMax: 5,
    phases: { 1: ['heel_raise', 'calf_stretch'], 2: ['ecc_heel_drop', 'heel_raise'], 3: ['ecc_heel_drop', 'heel_raise', 'sl_balance'] },
    edu: L(['Douleur ≤ 5/10 acceptable si raideur matinale pas pire le lendemain.', 'Pain ≤5/10 is fine if morning stiffness isn’t worse the next day.']), avoid: L(['Arrêt complet de la charge ; injections de corticostéroïdes dans le tendon.', 'Complete unloading; steroid injections into the tendon.']) },
  { id: 'tib_post', region: 'ankle', name: S('Dysfonction du tibial postérieur', 'Posterior tibial tendon dysfunction'), painMax: 4,
    phases: { 1: ['inversion_band', 'short_foot'], 2: ['inversion_band', 'heel_raise', 'short_foot'], 3: ['heel_raise', 'sl_balance'] },
    edu: L(['Orthèse plantaire avec support de l’arche souvent utile.', 'Arch-support orthoses are often helpful.']), avoid: L(['Marche prolongée pieds nus en phase douloureuse.', 'Prolonged barefoot walking while painful.']) },
  { id: 'ankle_stiff', region: 'ankle', name: S('Raideur post-fracture de la cheville', 'Post-fracture ankle stiffness'), painMax: 4,
    phases: { 1: ['ankle_alpha', 'knee_to_wall', 'calf_stretch'], 2: ['heel_raise', 'knee_to_wall', 'sl_balance'], 3: ['heel_raise', 'step_down', 'sl_balance'] },
    edu: L(['La dorsiflexion est clé pour la marche et les escaliers.', 'Dorsiflexion is key for walking and stairs.']), avoid: L(['Mollet chaud, rouge, enflé : consulte (thrombose).', 'Warm, red, swollen calf: seek care (thrombosis).']) },

  // PIED
  { id: 'plantar_fasc', region: 'foot', name: S('Fasciopathie plantaire', 'Plantar fasciopathy'), painMax: 4,
    phases: { 1: ['plantar_stretch', 'calf_stretch', 'short_foot'], 2: ['heel_raise_towel', 'plantar_stretch', 'short_foot'], 3: ['heel_raise_towel', 'sl_balance'] },
    edu: L(['Étire avant les premiers pas le matin ; chaussures avec bon soutien.', 'Stretch before your first morning steps; supportive shoes.']), avoid: L(['Marcher pieds nus sur surfaces dures.', 'Barefoot walking on hard floors.']) },
  { id: 'hallux', region: 'foot', name: S('Hallux rigidus / valgus', 'Hallux rigidus / valgus'), painMax: 4,
    phases: { 1: ['hallux_mob', 'short_foot'], 2: ['towel_curl', 'short_foot', 'hallux_mob'], 3: ['heel_raise', 'sl_balance'] },
    edu: L(['Chaussures à semelle rigide et boîte à orteils large.', 'Stiff-soled shoes with a wide toe box.']), avoid: L(['Talons hauts.', 'High heels.']) },
  { id: 'metatarsalgia', region: 'foot', name: S('Métatarsalgie', 'Metatarsalgia'), painMax: 4,
    phases: { 1: ['short_foot', 'towel_curl', 'calf_stretch'], 2: ['short_foot', 'towel_curl', 'heel_raise'], 3: ['heel_raise', 'sl_balance'] },
    edu: L(['Coussinet rétro-capital pour décharger l’avant-pied.', 'Metatarsal pad to offload the forefoot.']), avoid: L(['Chaussures étroites ou à talon.', 'Narrow or heeled shoes.']) },

  // ───── Ajouts v1.14 : autres pathologies fréquentes en physiatrie ─────
  // `lay` : nom simple + mots-clés pour le triage (voir LAY_NEW plus bas ; l'intégrateur les fusionne dans data/triage.js).
  // ÉPAULE
  { id: 'scapular_dysk', region: 'shoulder', name: S('Dyskinésie scapulaire / faiblesse de l’omoplate', 'Scapular dyskinesis / scapular weakness'), painMax: 4,
    lay: { name: S('Épaule fatiguée ou omoplate qui « décolle »', 'Tired shoulder or shoulder blade that “winges”'), kw: ['dyskinesie', 'omoplate qui decolle', 'scapula', 'scapular', 'winging', 'omoplate'] },
    phases: { 1: ['row_band', 'thor_ext', 'wall_slide'], 2: ['wall_slide', 'row_band', 'wall_pushup', 'er_band'], 3: ['wall_pushup', 'scaption', 'row_band', 'er_band'] },
    edu: L(['Le contrôle de l’omoplate précède la force de l’épaule.', 'Scapular control comes before shoulder strength.'], ['Vise la qualité du mouvement plutôt que la charge.', 'Aim for movement quality rather than load.']),
    avoid: L(['Lever des charges avec haussement de l’épaule.', 'Lifting loads while shrugging the shoulder.'], ['Faiblesse ou « décollement » soudain de l’omoplate après un effort ou un virus : consulte.', 'Sudden weakness or winging after exertion or a viral illness: seek care.']) },
  { id: 'biceps_long', region: 'shoulder', name: S('Tendinopathie du long biceps', 'Long head of biceps tendinopathy'), painMax: 4,
    lay: { name: S('Douleur à l’avant de l’épaule', 'Pain at the front of the shoulder'), kw: ['long biceps', 'biceps epaule', 'gouttiere bicipitale', 'avant de l epaule', 'biceps tendinopathy', 'front of shoulder'] },
    phases: { 1: ['pendulum', 'er_band', 'row_band'], 2: ['er_band', 'row_band', 'scaption', 'elbow_curl'], 3: ['elbow_curl', 'scaption', 'row_band', 'wall_pushup'] },
    edu: L(['La charge progressive du biceps et de la coiffe calme le tendon.', 'Progressive loading of the biceps and cuff settles the tendon.']),
    avoid: L(['« Pop » avec bosse au bras (rupture) : consulte.', 'A “pop” with a bulge in the arm (rupture): seek care.'], ['Charges lourdes bras tendus devant soi en phase irritable.', 'Heavy loads with the arms straight in front while irritable.']) },
  { id: 'ac_joint', region: 'shoulder', name: S('Douleur acromio-claviculaire (entorse ou arthrose)', 'Acromioclavicular joint pain (sprain or arthritis)'), painMax: 4,
    lay: { name: S('Douleur sur le dessus de l’épaule, près de la clavicule', 'Pain on top of the shoulder near the collarbone'), kw: ['acromio', 'clavicule', 'acromioclaviculaire', 'ac joint', 'collarbone', 'separation epaule', 'shoulder separation'] },
    phases: { 1: ['pendulum', 'row_band'], 2: ['row_band', 'scaption', 'wall_slide'], 3: ['wall_pushup', 'scaption', 'row_band'] },
    edu: L(['La douleur sur le dessus de l’épaule et en passant le bras devant le corps est typique.', 'Pain on top of the shoulder and when reaching across the body is typical.']),
    avoid: L(['Bras croisé devant la poitrine avec charge, développé couché large, pompes profondes en phase irritable.', 'Loaded cross-body reaching, wide bench press and deep push-ups while irritable.']) },

  // COUDE
  { id: 'cubital_tunnel', region: 'elbow', name: S('Neuropathie ulnaire au coude (tunnel cubital)', 'Ulnar neuropathy at the elbow (cubital tunnel)'), painMax: 3,
    lay: { name: S('Engourdissement du petit doigt et de l’annulaire', 'Numb little and ring fingers'), kw: ['ulnaire', 'cubital', 'petit doigt', 'annulaire', 'funny bone', 'nerf ulnaire', 'ulnar nerve', 'cubital tunnel', 'little finger'] },
    phases: { 1: ['pron_sup', 'wrist_rom', 'tendon_glides'], 2: ['pron_sup', 'grip_putty', 'row_band'], 3: ['grip_putty', 'elbow_curl', 'row_band'] },
    edu: L(['Évite de garder le coude plié longtemps, surtout la nuit (serviette autour du coude).', 'Avoid keeping the elbow bent for long, especially at night (towel wrapped around the elbow).']),
    avoid: L(['Appui prolongé sur le coude.', 'Prolonged leaning on the elbow.'], ['Faiblesse de la main ou atrophie entre le pouce et l’index : consulte (EMG).', 'Hand weakness or wasting between thumb and index: seek care (EMG).']) },

  // POIGNET / MAIN
  { id: 'trigger_finger', region: 'wrist', name: S('Doigt à ressaut (doigt à gâchette)', 'Trigger finger (stenosing tenosynovitis)'), painMax: 3,
    lay: { name: S('Doigt qui accroche ou se bloque en pliant', 'Finger that catches or locks when bending'), kw: ['doigt a ressaut', 'doigt a gachette', 'trigger finger', 'ressaut', 'doigt bloque', 'locking finger', 'trigger thumb'] },
    phases: { 1: ['tendon_glides', 'wrist_rom'], 2: ['tendon_glides', 'grip_putty'], 3: ['grip_putty', 'tendon_glides'] },
    edu: L(['Une orthèse de nuit (doigt à demi plié) aide souvent ; la plupart s’améliorent sans chirurgie.', 'A night splint (finger half bent) often helps; most improve without surgery.']),
    avoid: L(['Serrer fort et longtemps des outils ou un volant.', 'Long, tight gripping of tools or a steering wheel.'], ['Doigt bloqué plié et impossible à redresser : consulte.', 'Finger stuck bent and impossible to straighten: seek care.']) },
  { id: 'tfcc', region: 'wrist', name: S('Douleur ulnaire du poignet (complexe fibrocartilagineux, TFCC)', 'Ulnar-sided wrist pain (TFCC)'), painMax: 3,
    lay: { name: S('Douleur au poignet du côté du petit doigt', 'Wrist pain on the little-finger side'), kw: ['tfcc', 'cote du petit doigt', 'ulnaire poignet', 'ulnar wrist', 'fibrocartilage', 'poignet cote ulnaire'] },
    phases: { 1: ['wrist_rom', 'pron_sup'], 2: ['pron_sup', 'grip_putty', 'wrist_rom'], 3: ['grip_putty', 'ecc_wrist_ext', 'wall_pushup'] },
    edu: L(['Les rotations avec charge et les appuis sur la main aggravent ; la force de prise et l’avant-bras se travaillent par étapes.', 'Loaded rotation and weight through the hand aggravate it; grip and forearm strength are built in steps.']),
    avoid: L(['Appui et torsion forcés du poignet, déviation ulnaire chargée.', 'Forced weight-bearing and twisting, loaded ulnar deviation.'], ['Blocage, clac douloureux ou instabilité après une chute : réévaluation.', 'Locking, painful clunk or instability after a fall: reassessment.']) },

  // DORSAL
  { id: 'vertebral_fx', region: 'thoracic', name: S('Fracture-tassement vertébral ostéoporotique (traitement conservateur)', 'Osteoporotic vertebral compression fracture (conservative)'), painMax: 3,
    lay: { name: S('Douleur forte au dos après un faux mouvement ou une petite chute, avec ostéoporose', 'Sharp back pain after a small fall or awkward move, with osteoporosis'), kw: ['tassement vertebral', 'fracture vertebrale', 'vertebre tassee', 'compression fracture', 'vertebral fracture', 'ostéoporose dos', 'osteoporose dos'] },
    phases: { 1: ['thor_ext', 'chin_tuck', 'glute_bridge'], 2: ['thor_ext', 'wall_angel', 'sit_stand', 'row_band'], 3: ['row_band', 'sit_stand', 'sl_balance', 'step_up'] },
    edu: L(['Marcher tôt, extension du dos et équilibre réduisent la douleur et le risque de nouvelle fracture ; parle du traitement de l’ostéoporose avec ton médecin.', 'Early walking, back extension and balance reduce pain and refracture risk; discuss osteoporosis treatment with your doctor.']),
    avoid: L(['Flexion du tronc chargée, torsion, soulèvement lourd, toux ou éternuements sans appui.', 'Loaded trunk flexion, twisting, heavy lifting, coughing or sneezing without bracing.'], ['Douleur nouvelle et soudaine, faiblesse ou engourdissement des jambes, perte de contrôle de la vessie : urgence.', 'New sudden pain, leg weakness or numbness, loss of bladder control: emergency.']) },

  // LOMBAIRE
  { id: 'acute_lbp', region: 'lumbar', name: S('Lombalgie aiguë non spécifique (< 6 semaines)', 'Acute non-specific low back pain (< 6 weeks)'), painMax: 5,
    lay: { name: S('Tour de reins ou mal de dos récent', 'Recent back strain or sudden back pain'), kw: ['tour de reins', 'lumbago aigu', 'lombalgie aigue', 'mal de dos recent', 'acute back', 'back spasm', 'acute low back', 'dos barre'] },
    phases: { 1: ['cat_camel', 'knee_chest', 'glute_bridge'], 2: ['bird_dog', 'glute_bridge', 'dead_bug'], 3: ['hip_hinge', 'bird_dog', 'side_plank', 'squat'] },
    edu: L(['La grande majorité guérit en quelques semaines ; reste actif et marche.', 'The vast majority recover within weeks; stay active and keep walking.']),
    avoid: L(['Repos au lit prolongé.', 'Prolonged bed rest.'], ['Drapeaux rouges (vessie, faiblesse qui s’aggrave, fièvre, traumatisme) : consulte.', 'Red flags (bladder, worsening weakness, fever, trauma): seek care.']) },
  { id: 'deep_gluteal', region: 'lumbar', name: S('Syndrome du piriforme / douleur fessière profonde', 'Piriformis / deep gluteal pain syndrome'), painMax: 3,
    lay: { name: S('Douleur profonde à la fesse, parfois vers la cuisse', 'Deep buttock pain, sometimes into the thigh'), kw: ['piriforme', 'piriformis', 'fessier profond', 'deep gluteal', 'sciatique fessier', 'fausse sciatique'] },
    phases: { 1: ['glute_bridge', 'sciatic_glide'], 2: ['clamshell', 'bird_dog', 'glute_bridge'], 3: ['step_up', 'side_plank', 'hip_hinge'] },
    edu: L(['Varie les positions assises ; les glissements neuraux restent doux.', 'Vary sitting positions; nerve glides stay gentle.']),
    avoid: L(['Rester assis longtemps sur un portefeuille ou une surface dure.', 'Long sitting on a wallet or hard surface.'], ['Engourdissement de l’entrejambe ou faiblesse de la jambe : consulte.', 'Saddle numbness or leg weakness: seek care.']) },

  // HANCHE
  { id: 'hamstring_strain', region: 'hip', name: S('Élongation / déchirure des ischio-jambiers', 'Hamstring strain'), painMax: 4,
    lay: { name: S('Douleur ou claquage à l’arrière de la cuisse', 'Pain or pulled muscle at the back of the thigh'), kw: ['claquage', 'ischio', 'arriere de la cuisse', 'hamstring strain', 'pulled hamstring', 'elongation ischio'] },
    phases: { 1: ['glute_bridge'], 2: ['bridge_long', 'glute_bridge'], 3: ['hip_hinge', 'bridge_long', 'step_up'] },
    edu: L(['Charge progressive en isométrique, puis en allongement, avant la vitesse.', 'Progress from isometrics to lengthened loading before speed.']),
    avoid: L(['Étirements forcés et sprint avant la force complète.', 'Forced stretching and sprinting before full strength.'], ['Gros hématome, « pop » avec incapacité de marcher : consulte.', 'Large bruise, “pop” with inability to walk: seek care.']) },
  { id: 'adductor_groin', region: 'hip', name: S('Douleur à l’aine d’origine musculaire (adducteurs)', 'Adductor-related groin pain'), painMax: 3,
    lay: { name: S('Douleur à l’intérieur de la cuisse ou à l’aine en courant ou en changeant de direction', 'Inner-thigh or groin pain when running or changing direction'), kw: ['adducteur', 'adducteurs', 'aine sportif', 'pubalgie', 'groin strain', 'adductor', 'inner thigh'] },
    phases: { 1: ['glute_bridge', 'clamshell', 'dead_bug'], 2: ['side_plank', 'hip_abd_stand', 'clamshell'], 3: ['side_plank', 'squat', 'step_up'] },
    edu: L(['Le renforcement du tronc, du bassin et des adducteurs réduit la récidive.', 'Strengthening the trunk, pelvis and adductors reduces recurrence.']),
    avoid: L(['Reprendre les changements de direction avant la force complète.', 'Returning to cutting before full strength.'], ['Douleur à l’aine à la marche chez une personne âgée après une chute : consulte (fracture).', 'Groin pain on walking after a fall in an older adult: seek care (fracture).']) },

  // GENOU
  { id: 'meniscus_deg', region: 'knee', name: S('Lésion méniscale dégénérative (traitement non chirurgical)', 'Degenerative meniscal tear (non-operative)'), painMax: 4,
    lay: { name: S('Douleur au genou avec accrochages, sans accident précis', 'Knee pain with catching, without a clear injury'), kw: ['menisque', 'meniscus', 'menisque degeneratif', 'accrochage genou', 'degenerative meniscal', 'meniscal tear', 'genou accroche'] },
    phases: { 1: ['slr', 'knee_ext_sit', 'sit_stand'], 2: ['squat', 'step_up', 'tke'], 3: ['step_down', 'step_up', 'sl_balance'] },
    edu: L(['Le renforcement donne des résultats comparables à la chirurgie pour la plupart des lésions dégénératives.', 'Strengthening gives results comparable to surgery for most degenerative tears.']),
    avoid: L(['Genou verrouillé (impossible de le tendre) : consulte rapidement.', 'A locked knee (cannot straighten): seek prompt assessment.'], ['Squats très profonds avec torsion en phase irritable.', 'Very deep squats with twisting while irritable.']) },

  // CHEVILLE / JAMBE
  { id: 'calf_strain', region: 'ankle', name: S('Élongation du mollet', 'Calf strain'), painMax: 4,
    lay: { name: S('Douleur ou claquage au mollet', 'Pain or pulled muscle in the calf'), kw: ['mollet', 'claquage mollet', 'calf strain', 'gastrocnemien', 'tennis leg', 'calf muscle'] },
    phases: { 1: ['ankle_alpha', 'calf_stretch'], 2: ['heel_raise', 'calf_stretch'], 3: ['heel_raise', 'ecc_heel_drop', 'sl_balance'] },
    edu: L(['Charge progressive : montées sur la pointe des deux pieds, puis d’un seul.', 'Progressive loading: two-leg then single-leg heel raises.']),
    avoid: L(['Mollet chaud, rouge, enflé et tendu : consulte (thrombose) avant d’étirer.', 'Warm, red, swollen, tight calf: seek care (thrombosis) before stretching.']) },
  { id: 'mtss', region: 'ankle', name: S('Syndrome de stress tibial médial (périostite tibiale)', 'Medial tibial stress syndrome (shin splints)'), painMax: 3,
    lay: { name: S('Douleur le long du tibia en courant', 'Pain along the shin when running'), kw: ['periostite', 'tibia', 'shin splints', 'canal tibial', 'mtss', 'devant de la jambe', 'douleur tibia'] },
    phases: { 1: ['calf_stretch', 'short_foot', 'heel_raise'], 2: ['heel_raise', 'short_foot', 'sl_balance'], 3: ['heel_raise', 'step_down', 'sl_balance'] },
    edu: L(['Baisse temporairement le volume de course ; renforce mollets et pieds ; reprends progressivement.', 'Temporarily reduce running volume; strengthen calves and feet; return gradually.']),
    avoid: L(['Douleur osseuse précise et constante, même au repos ou la nuit : consulte (fracture de stress).', 'Pinpoint, constant bone pain, even at rest or at night: seek care (stress fracture).']) },
];

// Dépistage des drapeaux rouges à l'inscription (bloque le programme et recommande une consultation)
export const RED_FLAGS = [
  S('Perte de contrôle de la vessie ou des intestins, ou engourdissement entre les cuisses', 'Loss of bladder or bowel control, or numbness between the legs'),
  S('Faiblesse qui s’aggrave dans un bras ou une jambe', 'Worsening weakness in an arm or leg'),
  S('Fièvre, perte de poids inexpliquée ou antécédent de cancer avec nouvelle douleur', 'Fever, unexplained weight loss, or history of cancer with new pain'),
  S('Douleur constante la nuit, non soulagée par le repos ou les changements de position', 'Constant night pain not eased by rest or position'),
  S('Traumatisme important récent (chute, accident) sans évaluation médicale', 'Recent significant trauma (fall, accident) not yet assessed'),
  S('Mollet chaud, rouge et enflé, ou essoufflement inhabituel', 'Warm, red, swollen calf, or unusual shortness of breath'),
];

// Triage : noms simples et mots-clés des pathologies ajoutées (à fusionner dans LAY de data/triage.js : Object.assign(LAY, LAY_NEW)).
export const LAY_NEW = Object.fromEntries(PATHOLOGIES.filter((p) => p.lay).map((p) => [p.id, p.lay]));

// Une question de plus par région (à ajouter à la fin de QUESTIONS[region] de data/triage.js) pour atteindre les pathologies ajoutées.
const Q = (fr, en, opts) => ({ q: S(fr, en), opts });
const O = (fr, en, s = {}) => ({ t: S(fr, en), s });
const NONE = O('Aucun de ces cas', 'None of these');
export const EXTRA_QUESTIONS = {
  shoulder: [Q('Autre point précis ?', 'Anything more specific?', [
    O('Douleur à l’avant de l’épaule, surtout en soulevant ou en tirant', 'Pain at the front of the shoulder, especially lifting or pulling', { biceps_long: 4 }),
    O('Douleur sur le dessus de l’épaule, près de la clavicule', 'Pain on top of the shoulder, near the collarbone', { ac_joint: 5 }),
    O('Omoplate qui décolle ou épaule fatiguée avec les mouvements répétés', 'Shoulder blade winging or fatigue with repeated movement', { scapular_dysk: 4 }), NONE])],
  elbow: [Q('Engourdissement ?', 'Numbness?', [
    O('Petit doigt et annulaire engourdis, pire coude plié', 'Little and ring fingers numb, worse with the elbow bent', { cubital_tunnel: 6 }), NONE])],
  wrist: [Q('Autre point précis ?', 'Anything more specific?', [
    O('Un doigt qui accroche ou se bloque en pliant', 'A finger that catches or locks when bending', { trigger_finger: 6 }),
    O('Douleur au poignet du côté du petit doigt, surtout en tournant', 'Wrist pain on the little-finger side, especially turning', { tfcc: 5 }), NONE])],
  thoracic: [Q('Fracture ?', 'Fracture?', [
    O('Douleur forte apparue après un faux mouvement ou une petite chute (ostéoporose)', 'Sharp pain after an awkward move or small fall (osteoporosis)', { vertebral_fx: 5 }), NONE])],
  lumbar: [Q('Depuis quand ?', 'Since when?', [
    O('Moins de 6 semaines, après un effort ou un faux mouvement', 'Under 6 weeks, after exertion or an awkward move', { acute_lbp: 4 }),
    O('Douleur profonde à la fesse, pire assis', 'Deep buttock pain, worse sitting', { deep_gluteal: 4 }), NONE])],
  hip: [Q('Autre point précis ?', 'Anything more specific?', [
    O('Douleur à l’arrière de la cuisse après un sprint ou un étirement', 'Back-of-thigh pain after a sprint or stretch', { hamstring_strain: 5 }),
    O('Douleur à l’aine ou à l’intérieur de la cuisse en changeant de direction', 'Groin or inner-thigh pain when changing direction', { adductor_groin: 5 }), NONE])],
  knee: [Q('Accrochages ?', 'Catching?', [
    O('Le genou accroche ou claque, sans accident précis, après 40 ans', 'Knee catches or clicks, no clear injury, over 40', { meniscus_deg: 4 }), NONE])],
  ankle: [Q('Autre point précis ?', 'Anything more specific?', [
    O('Douleur ou claquage au mollet', 'Calf pain or pulled calf', { calf_strain: 5 }),
    O('Douleur le long du tibia en courant', 'Pain along the shin when running', { mtss: 5 }), NONE])],
};

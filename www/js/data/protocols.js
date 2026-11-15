// Protocoles de réadaptation post-opératoires, par phases (semaines écoulées depuis la chirurgie).
//
// Sources (familles de protocoles publiés, contenu général et prudent, jamais spécifique à un fabricant) :
//  - protocoles de réadaptation de centres universitaires d'orthopédie et de médecine du sport (style MGH / Brigham and Women's,
//    Vanderbilt, Cleveland Clinic, Hospital for Special Surgery) ;
//  - guides de pratique clinique de l'APTA / JOSPT (LCA, hanche, genou), consensus ASSET (réparation de la coiffe, 2016),
//    critères de retour au sport du consortium MOON (LCA) ;
//  - information aux patients de l'AAOS (OrthoInfo) et de la Société canadienne d'orthopédie ;
//  - revues Cochrane sur la réadaptation après PTG / PTH et fracture du radius distal.
// Ce sont des cadres généraux : TOUT doit être adapté par le chirurgien / le clinicien (type d'opération, qualité du tissu,
// chirurgies associées, douleur, complications). Le chirurgien prime toujours sur ce document.
//
// Modèle :
//  phase.weeks = [de, à[ en semaines écoulées depuis la chirurgie (à = null : jusqu'à la fin) ; [0,2[ = jours 0 à 13.
//  phase.exercises = ids de data/exercises.js, ou { id, level?, maxLevel?, dose?: { sets, reps, hold } }.
//  phase.byVariant = { idVariante: { weeks?, goals?, precautions?, precautionsAdd?, exercises?, exercisesAdd?, progressionCriteria?, romTargets? } }.
//  romTargets : [{ test, deg, dir? }] ; dir 'max' = « au plus » (ex. déficit d'extension) ; par défaut « au moins ».
//  Ids de tests d'amplitude : sh_flex, sh_abd, sh_er, elbow_flex, elbow_ext, wrist_flex, wrist_ext, hip_flex, knee_flex, knee_ext, ankle_df, cerv_rot, lumb_flex.

const S = (fr, en) => ({ fr, en });
const G = (...a) => a.map(([fr, en]) => ({ fr, en }));

export const DISCLAIMER = S(
  'Cadre général à adapter par le chirurgien / clinicien. En cas de doute, suis toujours les consignes de ton chirurgien.',
  'General framework to be adapted by the surgeon / clinician. If in doubt, always follow your surgeon’s instructions.');

const RF_COMMON = G(
  ['Fièvre (≥ 38,5 °C) ou frissons', 'Fever (≥ 38.5 °C / 101.3 °F) or chills'],
  ['Plaie rouge, chaude, qui coule (pus, liquide) ou qui s’ouvre', 'Wound that is red, hot, draining (pus, fluid) or opening'],
  ['Mollet douloureux, chaud, rouge ou enflé d’un seul côté (risque de thrombose)', 'Painful, warm, red or swollen calf on one side (clot risk)'],
  ['Essoufflement soudain ou douleur à la poitrine : urgence', 'Sudden shortness of breath or chest pain: emergency'],
  ['Douleur soudaine, très forte, non soulagée par le repos et les médicaments prescrits', 'Sudden severe pain not relieved by rest and prescribed medication'],
  ['Perte soudaine d’amplitude ou de force, ou « clac » avec chute de fonction', 'Sudden loss of motion or strength, or a “pop” with loss of function'],
  ['Engourdissement, doigts ou orteils froids, pâles ou bleus', 'Numbness, or cold, pale or blue fingers/toes']);

export const PROTOCOLS = [
  // ───────────────────────── GENOU : LCA ─────────────────────────
  {
    id: 'acl', region: 'knee', name: S('Reconstruction du ligament croisé antérieur (LCA)', 'ACL reconstruction'),
    surgery: S('Reconstruction du LCA avec greffe (tendon rotulien, ischio-jambiers ou autre)', 'ACL reconstruction with graft (patellar tendon, hamstring or other)'),
    painMax: 3,
    variants: [
      { id: 'btb', name: S('Greffe tendon rotulien (BTB)', 'Patellar tendon graft (BTB)') },
      { id: 'hamstring', name: S('Greffe ischio-jambiers', 'Hamstring graft') },
    ],
    phases: [
      { id: 'acl1', weeks: [0, 2],
        goals: G(['Extension complète du genou (0°) et contrôle du quadriceps', 'Full knee extension (0°) and quadriceps control'], ['Réduire l’enflure et la douleur', 'Reduce swelling and pain'], ['Marcher avec béquilles selon l’appui permis', 'Walk with crutches as permitted']),
        precautions: G(['Appui et orthèse selon les consignes du chirurgien (souvent appui toléré avec béquilles).', 'Weight-bearing and brace as your surgeon directs (often as tolerated with crutches).'], ['Ne jamais mettre un coussin sous le genou : garde-le tendu au repos.', 'Never rest with a pillow under the knee: keep it straight at rest.'], ['Pas de pivot, pas de course, pas de sport.', 'No pivoting, running or sport.'], ['Glace et jambe surélevée après les exercices.', 'Ice and elevate after exercises.']),
        exercises: ['slr', 'tke', { id: 'knee_ext_sit', maxLevel: 2 }],
        byVariant: {
          btb: { precautionsAdd: G(['Greffe rotulienne : douleur à l’avant du genou fréquente ; vise l’extension complète tôt, sans forcer.', 'Patellar graft: front-of-knee soreness is common; regain full extension early without forcing.']) },
          hamstring: { precautionsAdd: G(['Greffe ischio-jambiers : pas de flexion contre résistance des ischio-jambiers avant 6 semaines.', 'Hamstring graft: no resisted hamstring curls before 6 weeks.']) },
        },
        progressionCriteria: G(['Extension complète ou symétrique à l’autre genou', 'Full extension or symmetrical with the other knee'], ['Flexion ≥ 90°', 'Flexion ≥ 90°'], ['Enflure légère et en baisse', 'Mild, decreasing swelling'], ['Soulèvement de la jambe tendue sans retard d’extension', 'Straight-leg raise without extension lag'], ['Marche sans boiterie importante', 'Walking without marked limp']),
        romTargets: [{ test: 'knee_ext', deg: 0, dir: 'max' }, { test: 'knee_flex', deg: 90 }] },
      { id: 'acl2', weeks: [2, 6],
        goals: G(['Flexion ≥ 120° et extension complète', 'Flexion ≥ 120° and full extension'], ['Marche normale sans aide', 'Normal walking without aids'], ['Contrôle du quadriceps en chaîne fermée', 'Quadriceps control in closed chain']),
        precautions: G(['Arrête les béquilles seulement si la marche est sans boiterie et que le chirurgien est d’accord.', 'Stop crutches only when walking is limp-free and your surgeon agrees.'], ['Pas de course, de sauts, de pivots.', 'No running, jumping or pivoting.'], ['Pas de squat profond (reste à moins de 60–70° de flexion au début).', 'No deep squats (stay within about 60–70° of flexion at first).']),
        exercises: ['slr', 'tke', 'sit_stand', 'wall_sit', { id: 'heel_raise', maxLevel: 3 }, 'glute_bridge'],
        byVariant: { hamstring: { precautionsAdd: G(['Pont jambe tendue (ischio-jambiers) et flexions contre résistance : attendre 6–8 semaines.', 'Long-lever bridges and resisted curls: wait 6–8 weeks.']) } },
        progressionCriteria: G(['Flexion ≥ 120° et extension complète', 'Flexion ≥ 120° and full extension'], ['Pas d’épanchement ni de chaleur au genou', 'No effusion or warmth at the knee'], ['Marche normale sans béquilles', 'Normal gait without crutches'], ['Contrôle du quadriceps sans retard d’extension', 'Quadriceps control, no extension lag']),
        romTargets: [{ test: 'knee_ext', deg: 0, dir: 'max' }, { test: 'knee_flex', deg: 120 }] },
      { id: 'acl3', weeks: [6, 12],
        goals: G(['Force des jambes et du bassin', 'Leg and hip strength'], ['Équilibre sur une jambe', 'Single-leg balance'], ['Montées de marches contrôlées', 'Controlled step-ups']),
        precautions: G(['Pas de course ni de sauts avant l’autorisation du chirurgien (souvent ≥ 12 semaines et critères atteints).', 'No running or jumping before surgeon clearance (often ≥ 12 weeks and criteria met).'], ['Pas de sport de pivot ni de contact.', 'No pivoting or contact sport.'], ['Évite l’extension du genou assis avec charge lourde si douleur rotulienne.', 'Avoid heavy seated knee extension if kneecap pain.']),
        exercises: ['squat', 'step_up', 'sl_balance', 'glute_bridge', 'hip_abd_stand', 'heel_raise'],
        byVariant: { hamstring: { exercisesAdd: ['bridge_long'] } },
        progressionCriteria: G(['Aucun épanchement', 'No effusion'], ['Amplitude complète, symétrique', 'Full, symmetrical range'], ['Squat et montée de marche sans douleur ni affaissement du genou vers l’intérieur', 'Squat and step-up pain-free, no knee collapsing inward'], ['Force du quadriceps ≥ 70 % de l’autre jambe (test mesuré)', 'Quadriceps strength ≥ 70% of the other leg (measured)']),
        romTargets: [{ test: 'knee_flex', deg: 130 }, { test: 'knee_ext', deg: 0, dir: 'max' }] },
      { id: 'acl4', weeks: [12, 26],
        goals: G(['Force du quadriceps et des ischio-jambiers ≥ 80–90 %', 'Quadriceps and hamstring strength ≥ 80–90%'], ['Contrôle à l’atterrissage et à la descente', 'Landing and descent control'], ['Reprise progressive de la course en ligne droite si critères atteints', 'Gradual straight-line running if criteria met']),
        precautions: G(['Course en ligne droite seulement avec l’accord du chirurgien et des critères atteints (force, absence d’enflure, descente de marche contrôlée).', 'Straight-line running only with surgeon approval and criteria met (strength, no swelling, controlled step-down).'], ['Pas de pivots, de changements de direction ni de sauts avant la fin de cette phase et des tests fonctionnels.', 'No pivoting, cutting or jumping before the end of this phase and functional testing.']),
        exercises: ['step_down', 'squat', 'hip_hinge', 'sl_balance', 'side_plank', 'bridge_long'],
        progressionCriteria: G(['Aucun épanchement, aucune douleur', 'No effusion, no pain'], ['Force du quadriceps et des ischio-jambiers ≥ 80 % de l’autre jambe', 'Quadriceps and hamstring strength ≥ 80% of the other leg'], ['Descente de marche et squat sur une jambe contrôlés', 'Controlled step-down and single-leg squat'], ['Course en ligne droite sans douleur ni boiterie', 'Pain-free, limp-free straight-line running']),
        romTargets: [{ test: 'knee_flex', deg: 135 }] },
      { id: 'acl5', weeks: [26, null],
        goals: G(['Tests fonctionnels (sauts, force) ≥ 90 % de l’autre jambe', 'Functional tests (hops, strength) ≥ 90% of the other leg'], ['Retour au sport par étapes avec le clinicien', 'Staged return to sport with your clinician']),
        precautions: G(['Le retour aux sports de pivot ou de contact se décide avec le chirurgien après des tests fonctionnels, en général pas avant 9 mois.', 'Return to pivoting or contact sport is decided with your surgeon after functional testing, generally not before 9 months.'], ['Le risque de nouvelle déchirure est plus élevé si le retour est précoce.', 'Re-tear risk is higher with early return.']),
        exercises: ['step_down', 'squat', 'hip_hinge', 'sl_balance', 'side_plank'],
        progressionCriteria: G(['Tests de sauts et de force ≥ 90 % de l’autre jambe', 'Hop and strength tests ≥ 90% of the other leg'], ['Confiance et absence de peur du genou (questionnaire)', 'Confidence and no fear of re-injury (questionnaire)'], ['Accord écrit du chirurgien', 'Surgeon clearance'])},
    ],
    redFlags: [...RF_COMMON, ...G(['Genou qui lâche, ou nouvelle enflure importante après un faux mouvement', 'Knee giving way, or large new swelling after a twist'], ['Impossible de tendre complètement le genou malgré les exercices (blocage)', 'Unable to straighten the knee despite exercises (locking)'])],
  },

  // ───────────────────────── ÉPAULE : COIFFE ─────────────────────────
  {
    id: 'cuff_repair', region: 'shoulder', name: S('Réparation de la coiffe des rotateurs', 'Rotator cuff repair'),
    surgery: S('Réparation arthroscopique ou ouverte d’un tendon de la coiffe', 'Arthroscopic or open rotator cuff tendon repair'),
    painMax: 3,
    variants: [
      { id: 'small_med', name: S('Déchirure petite ou moyenne', 'Small to medium tear') },
      { id: 'large', name: S('Déchirure grande ou massive', 'Large or massive tear') },
    ],
    phases: [
      { id: 'cr1', weeks: [0, 6],
        goals: G(['Protéger la réparation', 'Protect the repair'], ['Contrôler la douleur et l’enflure', 'Control pain and swelling'], ['Garder coude, poignet et main mobiles', 'Keep elbow, wrist and hand moving']),
        precautions: G(['Écharpe (souvent avec coussin d’abduction) en tout temps, sauf pour l’hygiène et les exercices permis.', 'Sling (often with an abduction pillow) at all times except for hygiene and allowed exercises.'], ['Mouvements passifs seulement : aucun soulèvement actif du bras.', 'Passive motion only: no active lifting of the arm.'], ['Aucune résistance, aucun poids ; ne pas s’appuyer sur le bras (ex. se lever d’une chaise).', 'No resistance or weights; do not push up with the arm (e.g. rising from a chair).'], ['Ne pas tendre le bras derrière le dos ; limite de rotation externe passive selon le chirurgien.', 'No reaching behind the back; passive external rotation limit set by your surgeon.']),
        exercises: [{ id: 'pendulum', maxLevel: 2 }, 'wrist_rom', 'tendon_glides', 'pron_sup', { id: 'grip_putty', maxLevel: 1 }],
        progressionCriteria: G(['Durée écoulée respectée (6 semaines)', 'Time elapsed (6 weeks)'], ['Douleur au repos contrôlée', 'Resting pain controlled'], ['Plaie guérie, sans signe d’infection', 'Wound healed, no signs of infection'], ['Feu vert du chirurgien pour commencer l’amplitude assistée', 'Surgeon go-ahead to start assisted range of motion']) },
      { id: 'cr2', weeks: [6, 12],
        goals: G(['Récupérer l’amplitude passive puis active-assistée', 'Regain passive then active-assisted range'], ['Abandonner l’écharpe progressivement', 'Wean from the sling gradually']),
        precautions: G(['Pas de renforcement ni de résistance (pas d’élastique) avant 12 semaines.', 'No strengthening or resistance (no bands) before 12 weeks.'], ['Pas de soulèvement d’objets ; pas de mouvements brusques ni au-dessus de la tête avec charge.', 'No lifting objects; no sudden movements or loaded overhead activity.'], ['Reste dans les limites d’amplitude données par le chirurgien (rotation externe, élévation).', 'Stay within the range limits your surgeon gave (external rotation, elevation).']),
        exercises: [{ id: 'pendulum', maxLevel: 3 }, { id: 'stick_flex', maxLevel: 3 }, { id: 'wall_slide', maxLevel: 2 }, 'wrist_rom', 'elbow_curl'],
        byVariant: { large: { weeks: [6, 16], precautionsAdd: G(['Déchirure massive : l’amplitude active contre la gravité est retardée ; reste en actif-assisté.', 'Massive tear: active motion against gravity is delayed; stay with assisted motion.']) } },
        progressionCriteria: G(['Élévation passive ≈ 120–140° sans douleur vive', 'Passive elevation about 120–140° without sharp pain'], ['Rotation externe passive confortable dans les limites', 'Comfortable passive external rotation within limits'], ['Pas de douleur nocturne qui augmente', 'No increasing night pain'], ['Accord du chirurgien pour commencer le renforcement', 'Surgeon approval to start strengthening']),
        romTargets: [{ test: 'sh_flex', deg: 120 }, { test: 'sh_abd', deg: 90 }] },
      { id: 'cr3', weeks: [12, 24],
        goals: G(['Renforcement progressif de la coiffe et de l’omoplate', 'Progressive cuff and scapular strengthening'], ['Amplitude active complète ou presque', 'Full or near-full active range'], ['Utiliser le bras pour les activités légères', 'Use the arm for light daily activities']),
        precautions: G(['Charges légères, élastiques souples seulement ; douleur ≤ 3/10.', 'Light loads, soft bands only; pain ≤ 3/10.'], ['Pas de charges lourdes ni de travail répété au-dessus de la tête.', 'No heavy loads or repeated overhead work.'], ['Si perte de force soudaine : cesse et consulte.', 'If sudden loss of strength: stop and seek review.']),
        exercises: ['er_band', 'row_band', 'scaption', 'wall_slide', 'stick_flex'],
        byVariant: { large: { weeks: [16, 28], exercises: ['row_band', { id: 'er_band', maxLevel: 3 }, { id: 'scaption', maxLevel: 3 }, 'wall_slide'] } },
        progressionCriteria: G(['Élévation active ≥ 140° sans compensation (haussement de l’épaule)', 'Active elevation ≥ 140° without shrugging'], ['Rotation externe contre résistance légère sans douleur', 'External rotation against light resistance without pain'], ['Pas d’inflammation après les exercices (douleur de base le lendemain)', 'No flare-up after exercise (baseline pain next day)']),
        romTargets: [{ test: 'sh_flex', deg: 150 }, { test: 'sh_abd', deg: 140 }, { test: 'sh_er', deg: 50 }] },
      { id: 'cr4', weeks: [24, null],
        goals: G(['Force fonctionnelle pour le travail et les loisirs', 'Functional strength for work and recreation'], ['Retour progressif aux charges et au sport', 'Gradual return to loading and sport']),
        precautions: G(['Reprise des charges lourdes, du lancer ou du travail au-dessus de la tête par étapes avec le clinicien (souvent 6 à 9 mois).', 'Heavy loading, throwing and overhead work resume in stages with your clinician (often 6–9 months).']),
        exercises: ['er_band', 'row_band', 'scaption', 'wall_pushup', 'wall_slide'],
        byVariant: { large: { weeks: [28, null] } },
        progressionCriteria: G(['Force comparable à l’autre épaule (test)', 'Strength comparable to the other shoulder (testing)'], ['Aucune douleur aux gestes du travail visé', 'No pain with work-specific tasks']) },
    ],
    redFlags: [...RF_COMMON, ...G(['Perte soudaine de la capacité de lever le bras après une période d’amélioration (re-déchirure possible)', 'Sudden loss of ability to lift the arm after a period of improvement (possible re-tear)'], ['Raideur qui s’aggrave nettement malgré les exercices (épaule gelée)', 'Stiffness clearly worsening despite exercises (frozen shoulder)'])],
  },

  // ───────────────────────── GENOU : PTG ─────────────────────────
  {
    id: 'tka', region: 'knee', name: S('Prothèse totale du genou (PTG)', 'Total knee arthroplasty (TKA)'),
    surgery: S('Remplacement total de l’articulation du genou', 'Total knee joint replacement'),
    painMax: 4,
    phases: [
      { id: 'tka1', weeks: [0, 2],
        goals: G(['Extension complète et flexion ≥ 90°', 'Full extension and flexion ≥ 90°'], ['Contrôler l’enflure et la douleur', 'Control swelling and pain'], ['Marcher avec une aide (marchette ou béquilles)', 'Walk with an aid (walker or crutches)']),
        precautions: G(['Appui toléré avec une aide à la marche, sauf avis contraire du chirurgien.', 'Weight-bearing as tolerated with a walking aid unless your surgeon says otherwise.'], ['Anticoagulant ou autre prévention des caillots comme prescrit.', 'Blood-clot prevention medication as prescribed.'], ['Pas de coussin sous le genou au repos ; glace et jambe surélevée.', 'No pillow under the knee at rest; ice and elevation.'], ['Pas de genoux à terre (s’agenouiller) ni de torsion avec le pied fixé.', 'No kneeling and no twisting on a planted foot.']),
        exercises: ['slr', { id: 'knee_ext_sit', maxLevel: 2 }, { id: 'ankle_alpha', maxLevel: 2 }, { id: 'sit_stand', maxLevel: 2 }],
        progressionCriteria: G(['Flexion ≥ 90°', 'Flexion ≥ 90°'], ['Extension à moins de 5–10° du genou droit', 'Extension within 5–10° of straight'], ['Plaie propre et sèche', 'Wound clean and dry'], ['Douleur contrôlée avec la médication prescrite', 'Pain controlled with prescribed medication']),
        romTargets: [{ test: 'knee_flex', deg: 90 }, { test: 'knee_ext', deg: 5, dir: 'max' }] },
      { id: 'tka2', weeks: [2, 6],
        goals: G(['Flexion ≥ 110–120°', 'Flexion ≥ 110–120°'], ['Marche sans boiterie, puis avec une canne', 'Limp-free walking, then with a cane'], ['Monter et descendre l’escalier en alternant les pieds', 'Climb stairs foot over foot']),
        precautions: G(['La chaleur et l’enflure en fin de journée sont normales ; réduis si elles durent plus de 24 h.', 'End-of-day warmth and swelling are expected; ease off if they last over 24 h.'], ['Évite les activités à impact (course, sauts).', 'Avoid impact activities (running, jumping).']),
        exercises: ['slr', 'knee_ext_sit', 'sit_stand', 'tke', 'heel_raise', 'glute_bridge'],
        progressionCriteria: G(['Flexion ≥ 110°', 'Flexion ≥ 110°'], ['Extension à moins de 5° du genou droit', 'Extension within 5° of straight'], ['Marche sans aide, boiterie minimale', 'Walking without aid, minimal limp'], ['Pas de chaleur ni de rougeur croissante', 'No increasing warmth or redness']),
        romTargets: [{ test: 'knee_flex', deg: 110 }, { test: 'knee_ext', deg: 5, dir: 'max' }] },
      { id: 'tka3', weeks: [6, 12],
        goals: G(['Force du quadriceps et des fessiers', 'Quadriceps and glute strength'], ['Équilibre et endurance de marche', 'Balance and walking endurance']),
        precautions: G(['Activités à faible impact seulement (marche, vélo, natation).', 'Low-impact activities only (walking, cycling, swimming).'], ['Pas de charge lourde ni de squats profonds.', 'No heavy loads or deep squats.']),
        exercises: ['sit_stand', 'step_up', 'squat', 'wall_sit', 'sl_balance', 'heel_raise'],
        progressionCriteria: G(['Flexion ≥ 120°', 'Flexion ≥ 120°'], ['Montée d’une marche de 15 cm sans appui ni douleur', 'Step-up on a 15 cm step without support or pain'], ['Marche 20–30 min sans boiterie', 'Walk 20–30 min without limp']),
        romTargets: [{ test: 'knee_flex', deg: 120 }] },
      { id: 'tka4', weeks: [12, null],
        goals: G(['Reprise des activités à faible impact et du quotidien complet', 'Return to low-impact activities and full daily life'], ['Maintenir force et amplitude à long terme', 'Maintain strength and range long term']),
        precautions: G(['Évite durablement la course, les sauts et les sports de pivot, sauf avis du chirurgien.', 'Avoid running, jumping and pivoting sports long term unless your surgeon says otherwise.'], ['Antibiotiques avant certains soins dentaires ou chirurgicaux : selon la consigne du chirurgien.', 'Antibiotics before some dental or surgical procedures: follow your surgeon’s advice.']),
        exercises: ['step_up', 'step_down', 'squat', 'sl_balance', 'heel_raise'],
        progressionCriteria: G(['Fonction acceptable pour tes activités (escalier, marche, transferts)', 'Function adequate for your activities (stairs, walking, transfers)'], ['Suivi chirurgical selon calendrier', 'Surgical follow-up as scheduled']),
        romTargets: [{ test: 'knee_flex', deg: 120 }] },
    ],
    redFlags: [...RF_COMMON, ...G(['Genou très chaud, rouge et enflé avec douleur croissante', 'Knee very hot, red and swollen with increasing pain'], ['Incapacité soudaine de mettre du poids sur la jambe', 'Sudden inability to bear weight on the leg'])],
  },

  // ───────────────────────── HANCHE : PTH ─────────────────────────
  {
    id: 'tha', region: 'hip', name: S('Prothèse totale de la hanche (PTH)', 'Total hip arthroplasty (THA)'),
    surgery: S('Remplacement total de l’articulation de la hanche', 'Total hip joint replacement'),
    painMax: 4,
    variants: [
      { id: 'posterior', name: S('Voie postérieure (ou latérale)', 'Posterior (or lateral) approach') },
      { id: 'anterior', name: S('Voie antérieure', 'Anterior approach') },
    ],
    phases: [
      { id: 'tha1', weeks: [0, 2],
        goals: G(['Marcher avec marchette ou béquilles', 'Walk with walker or crutches'], ['Contrôler douleur et enflure', 'Control pain and swelling'], ['Activer les fessiers et le quadriceps', 'Wake up glutes and quadriceps']),
        precautions: G(['Appui toléré avec aide, sauf avis contraire du chirurgien.', 'Weight-bearing as tolerated with an aid unless your surgeon says otherwise.'], ['Prévention des caillots comme prescrite ; bouge les chevilles souvent.', 'Clot prevention as prescribed; pump your ankles often.'], ['Pas de conduite tant que le chirurgien ne le permet pas.', 'No driving until your surgeon allows it.']),
        exercises: [{ id: 'ankle_alpha', maxLevel: 2 }, { id: 'iso_hip_abd', maxLevel: 2 }, { id: 'glute_bridge', maxLevel: 2 }, { id: 'sit_stand', maxLevel: 1 }],
        byVariant: {
          posterior: { precautionsAdd: G(['Voie postérieure : pas de flexion de hanche au-delà de 90°, pas de croiser les jambes ni de rotation interne (pointes de pieds vers l’intérieur), en général 6 à 12 semaines.', 'Posterior approach: no hip flexion past 90°, no crossing legs, no internal rotation (toes turned in), generally for 6–12 weeks.'], ['Siège surélevé, toilette rehaussée ; oreiller entre les genoux la nuit.', 'Raised chair and toilet seat; pillow between the knees at night.']), exercises: [{ id: 'ankle_alpha', maxLevel: 2 }, { id: 'iso_hip_abd', maxLevel: 2 }, { id: 'glute_bridge', maxLevel: 2 }] },
          anterior: { precautionsAdd: G(['Voie antérieure : évite d’étendre la hanche en arrière et de la tourner vers l’extérieur de façon extrême (position de fente, pivot sur le pied fixe) pendant les premières semaines.', 'Anterior approach: avoid extending the hip far back and extreme outward rotation (lunge position, pivoting on a planted foot) for the first weeks.'], ['Ménage le devant de la hanche : pas d’étirement du fléchisseur de hanche.', 'Protect the front of the hip: no hip flexor stretching.']) },
        },
        progressionCriteria: G(['Marche sécuritaire avec aide, transferts autonomes', 'Safe walking with aid, independent transfers'], ['Plaie propre et sèche', 'Wound clean and dry'], ['Douleur contrôlée', 'Pain controlled']) },
      { id: 'tha2', weeks: [2, 6],
        goals: G(['Marche avec canne puis sans aide', 'Walk with a cane then without'], ['Force des abducteurs de hanche (fessier moyen)', 'Hip abductor (gluteus medius) strength'], ['Endurance de marche', 'Walking endurance']),
        precautions: G(['Boiterie : corrige-la, ne la tolère pas ; utilise l’aide tant que la boiterie persiste.', 'Correct a limp rather than tolerating it; keep the aid until it settles.'], ['Pas de sport à impact ni de charges lourdes.', 'No impact sport or heavy loads.']),
        exercises: ['glute_bridge', 'hip_abd_stand', 'iso_hip_abd', 'sit_stand', { id: 'step_up', maxLevel: 2 }],
        byVariant: {
          posterior: { precautionsAdd: G(['Les précautions de la voie postérieure restent en vigueur : flexion ≤ 90°, pas de rotation interne, pas de croisement.', 'Posterior-approach precautions remain: flexion ≤ 90°, no internal rotation, no crossing.'], ['Pour s’asseoir et se lever, garde les hanches plus hautes que les genoux.', 'When sitting and rising, keep the hips higher than the knees.']) },
          anterior: { precautionsAdd: G(['Pas d’extension en fente profonde ni de pivot sur le pied fixe.', 'No deep lunge extension or pivoting on a planted foot.']) },
        },
        progressionCriteria: G(['Marche sans aide et sans boiterie visible', 'Walking without aid and without visible limp'], ['Pas de signe de Trendelenburg (bassin qui tombe) sur appui unipodal', 'No Trendelenburg sign (pelvis drop) on single-leg stance'], ['Douleur ≤ 3/10 à la marche', 'Pain ≤ 3/10 when walking']),
        romTargets: [{ test: 'hip_flex', deg: 90 }] },
      { id: 'tha3', weeks: [6, 12],
        goals: G(['Force des fessiers et du quadriceps', 'Glute and quadriceps strength'], ['Équilibre sur une jambe', 'Single-leg balance'], ['Escaliers alternés', 'Alternating stairs']),
        precautions: G(['Activités à faible impact seulement.', 'Low-impact activities only.'], ['Pas de sport de pivot ni de contact.', 'No pivoting or contact sports.']),
        exercises: ['step_up', 'squat', 'hip_abd_stand', 'clamshell', 'sl_balance', 'glute_bridge'],
        byVariant: {
          posterior: { precautionsAdd: G(['Les précautions (flexion > 90°, rotation interne, croisement) sont levées seulement par le chirurgien, souvent 6 à 12 semaines ; squats limités à 90° de flexion.', 'Precautions (flexion > 90°, internal rotation, crossing) are lifted only by your surgeon, often at 6–12 weeks; squats limited to 90° of hip flexion.']) },
          anterior: { precautionsAdd: G(['Ajoute l’extension de hanche progressivement, sans douleur à l’avant.', 'Add hip extension gradually, without front-of-hip pain.']) },
        },
        progressionCriteria: G(['Appui unipodal 20–30 s sans chute du bassin', 'Single-leg stance 20–30 s without pelvic drop'], ['Montée d’escalier alternée sans douleur', 'Pain-free alternating stair climbing'], ['Aucune boiterie sur 30 min de marche', 'No limp over 30 min of walking']) },
      { id: 'tha4', weeks: [12, null],
        goals: G(['Retour aux activités faible impact : marche, vélo, natation, golf léger', 'Return to low-impact activity: walking, cycling, swimming, light golf'], ['Maintien de la force et de l’équilibre', 'Maintain strength and balance']),
        precautions: G(['Évite les sports à impact élevé (course, sauts) ; discute-en avec le chirurgien.', 'Avoid high-impact sports (running, jumping); discuss with your surgeon.'], ['Cesse tout mouvement qui donne une sensation de « déboîtement » de la hanche.', 'Stop any movement that gives a feeling of the hip “slipping out”.']),
        exercises: ['step_up', 'squat', 'hip_hinge', 'hip_abd_stand', 'sl_balance', 'side_plank'],
        progressionCriteria: G(['Fonction adéquate pour le quotidien', 'Adequate function for daily life'], ['Suivi chirurgical selon calendrier', 'Surgical follow-up as scheduled']),
        romTargets: [{ test: 'hip_flex', deg: 100 }] },
    ],
    redFlags: [...RF_COMMON, ...G(['Hanche qui se déboîte : douleur vive à l’aine ou à la fesse, jambe raccourcie ou tournée, impossible d’appuyer — urgence', 'Hip dislocation: sharp groin or buttock pain, leg shortened or turned, unable to bear weight — emergency'], ['Jambe qui devient inégale ou douleur nouvelle à la cuisse à l’appui', 'New leg-length difference or new thigh pain on weight-bearing'])],
  },

  // ───────────────────────── ÉPAULE : BANKART ─────────────────────────
  {
    id: 'bankart', region: 'shoulder', name: S('Stabilisation de l’épaule (Bankart)', 'Shoulder stabilization (Bankart repair)'),
    surgery: S('Réparation du labrum antéro-inférieur après luxation (arthroscopique ou ouverte)', 'Repair of the anteroinferior labrum after dislocation (arthroscopic or open)'),
    painMax: 3,
    phases: [
      { id: 'bk1', weeks: [0, 4],
        goals: G(['Protéger la réparation', 'Protect the repair'], ['Contrôler douleur et enflure', 'Control pain and swelling'], ['Garder coude, poignet et main mobiles', 'Keep elbow, wrist and hand moving']),
        precautions: G(['Écharpe de 3 à 4 semaines (parfois 6), selon le chirurgien.', 'Sling for 3–4 weeks (sometimes 6), per your surgeon.'], ['Pas de rotation externe forcée : limite fixée par le chirurgien (souvent ≈ 30°).', 'No forced external rotation: limit set by your surgeon (often about 30°).'], ['Pas d’élévation active, pas de bras en arrière ni en position « bras levé tourné vers l’arrière ».', 'No active elevation, no reaching back, no “arm raised and rotated back” position.'], ['Aucune charge.', 'No loads.']),
        exercises: [{ id: 'pendulum', maxLevel: 2 }, 'wrist_rom', 'tendon_glides', 'pron_sup', { id: 'grip_putty', maxLevel: 1 }],
        progressionCriteria: G(['Plaie guérie', 'Wound healed'], ['Douleur au repos contrôlée', 'Resting pain controlled'], ['Accord du chirurgien pour l’amplitude assistée', 'Surgeon approval for assisted motion']) },
      { id: 'bk2', weeks: [4, 8],
        goals: G(['Élévation assistée progressive', 'Progressive assisted elevation'], ['Abandonner l’écharpe', 'Discontinue sling'], ['Reprise des activités légères de la vie quotidienne', 'Resume light daily activities']),
        precautions: G(['Reste en dessous de la limite de rotation externe et d’abduction donnée par le chirurgien.', 'Stay under the external rotation and abduction limits your surgeon gave.'], ['Pas de position d’abduction + rotation externe (geste de lancer).', 'No abduction + external rotation (throwing position).'], ['Pas de résistance ni de poids.', 'No resistance or weights.']),
        exercises: [{ id: 'stick_flex', maxLevel: 3 }, { id: 'pendulum', maxLevel: 3 }, { id: 'wall_slide', maxLevel: 2 }, 'wrist_rom', 'elbow_curl'],
        progressionCriteria: G(['Élévation passive ≈ 120–140° sans douleur vive', 'Passive elevation about 120–140° without sharp pain'], ['Épaule qui ne donne pas d’impression de glisser', 'No sense of the shoulder slipping'], ['Accord du chirurgien pour les exercices de renforcement', 'Surgeon approval to start strengthening']),
        romTargets: [{ test: 'sh_flex', deg: 130 }, { test: 'sh_er', deg: 30 }] },
      { id: 'bk3', weeks: [8, 12],
        goals: G(['Amplitude active presque complète', 'Near-full active range'], ['Contrôle de l’omoplate et de la coiffe', 'Scapular and cuff control']),
        precautions: G(['Rotation externe en position d’abduction : encore limitée ; pas de lancer.', 'External rotation in abduction still limited; no throwing.'], ['Élastiques légers, douleur ≤ 3/10 ; pas de charge lourde.', 'Light bands, pain ≤ 3/10; no heavy loads.']),
        exercises: ['er_band', 'row_band', { id: 'scaption', maxLevel: 3 }, 'wall_slide', { id: 'wall_pushup', maxLevel: 2 }],
        progressionCriteria: G(['Élévation active ≥ 150° sans compensation', 'Active elevation ≥ 150° without compensation'], ['Rotation externe active à 90° d’abduction progressant sans appréhension', 'External rotation at 90° abduction progressing without apprehension'], ['Force de la coiffe proche de l’autre épaule', 'Cuff strength close to the other shoulder']),
        romTargets: [{ test: 'sh_flex', deg: 150 }, { test: 'sh_er', deg: 45 }] },
      { id: 'bk4', weeks: [12, 24],
        goals: G(['Force et endurance de l’épaule', 'Shoulder strength and endurance'], ['Stabilité dynamique en position fonctionnelle', 'Dynamic stability in functional positions']),
        precautions: G(['Pas de sport de contact ni de lancer complet avant l’autorisation.', 'No contact sport or full throwing before clearance.'], ['Arrête les gestes qui donnent la sensation d’une épaule qui sort.', 'Stop movements that give a sense of the shoulder slipping out.']),
        exercises: ['er_band', 'row_band', 'scaption', 'wall_pushup', 'wall_slide'],
        progressionCriteria: G(['Force ≥ 90 % de l’autre épaule (test)', 'Strength ≥ 90% of the other shoulder (testing)'], ['Aucune appréhension aux positions à risque', 'No apprehension in provocative positions'], ['Accord du chirurgien pour le retour au sport', 'Surgeon clearance for return to sport']),
        romTargets: [{ test: 'sh_flex', deg: 165 }, { test: 'sh_er', deg: 60 }] },
      { id: 'bk5', weeks: [24, null],
        goals: G(['Retour au sport et au travail', 'Return to sport and work']),
        precautions: G(['Le retour aux sports de contact ou de lancer se fait par étapes, en général après 5 à 6 mois ou plus, avec l’accord du chirurgien.', 'Return to contact or throwing sports is staged, generally after 5–6 months or more, with surgeon clearance.'], ['Le risque de nouvelle luxation est plus élevé chez les jeunes et en sport de contact.', 'Re-dislocation risk is higher in young patients and contact sport.']),
        exercises: ['er_band', 'row_band', 'wall_pushup', 'scaption'],
        progressionCriteria: G(['Tests fonctionnels satisfaisants', 'Satisfactory functional tests'], ['Confiance dans l’épaule', 'Confidence in the shoulder']) },
    ],
    redFlags: [...RF_COMMON, ...G(['Nouvelle luxation ou sensation que l’épaule sort', 'New dislocation or feeling the shoulder slips out'], ['Engourdissement ou faiblesse nouvelle dans la main ou le bras', 'New numbness or weakness in the hand or arm'])],
  },

  // ───────────────────────── CHEVILLE : ACHILLE ─────────────────────────
  {
    id: 'achilles_repair', region: 'ankle', name: S('Réparation du tendon d’Achille', 'Achilles tendon repair'),
    surgery: S('Suture chirurgicale d’une rupture du tendon d’Achille (réadaptation fonctionnelle précoce)', 'Surgical repair of an Achilles tendon rupture (early functional rehabilitation)'),
    painMax: 3,
    phases: [
      { id: 'ar1', weeks: [0, 2],
        goals: G(['Protéger le tendon et laisser la plaie guérir', 'Protect the tendon and let the wound heal'], ['Contrôler l’enflure (jambe surélevée)', 'Control swelling (leg elevated)']),
        precautions: G(['Attelle ou botte en pointe de pied (cheville vers le bas), selon le chirurgien ; ne la retire pas.', 'Splint or boot with the foot pointed down, per your surgeon; do not remove it.'], ['Appui : aucun ou partiel selon le chirurgien, avec béquilles.', 'Weight-bearing: none or partial per your surgeon, with crutches.'], ['Aucun mouvement de la cheville ni étirement du mollet.', 'No ankle motion or calf stretching.']),
        exercises: ['slr', 'iso_hip_abd'],
        progressionCriteria: G(['Plaie guérie et sèche', 'Wound healed and dry'], ['Rendez-vous de suivi passé : feu vert pour la botte', 'Follow-up visit done: go-ahead for the boot']) },
      { id: 'ar2', weeks: [2, 6],
        goals: G(['Passer à la botte avec cales sous le talon', 'Progress to the boot with heel wedges'], ['Appui progressif selon le chirurgien', 'Progressive weight-bearing per your surgeon'], ['Amplitude active douce jusqu’au neutre', 'Gentle active motion up to neutral']),
        precautions: G(['Ne jamais plier la cheville au-delà de la position neutre (90°) : le tendon doit rester protégé.', 'Never bend the ankle past neutral (90°): the tendon must stay protected.'], ['Garde la botte (cales retirées selon le calendrier du chirurgien), même pour dormir si demandé.', 'Keep the boot on (wedges removed on your surgeon’s schedule), including sleeping if instructed.'], ['Pas de marche sans botte ni d’étirement du mollet.', 'No walking out of the boot and no calf stretching.']),
        exercises: [{ id: 'ankle_alpha', maxLevel: 2 }, 'slr', 'iso_hip_abd', 'glute_bridge'],
        progressionCriteria: G(['Appui possible dans la botte sans douleur au tendon', 'Weight-bearing possible in the boot without tendon pain'], ['Pas de sensibilité ni d’enflure croissante', 'No increasing tenderness or swelling'], ['Accord du chirurgien pour sevrer la botte', 'Surgeon approval to wean from the boot']),
        romTargets: [{ test: 'ankle_df', deg: 0 }] },
      { id: 'ar3', weeks: [6, 12],
        goals: G(['Marcher en chaussure avec talonnette, sans boiterie', 'Walk in a shoe with a heel lift, without limp'], ['Récupérer l’amplitude et le contrôle de la cheville', 'Regain ankle range and control']),
        precautions: G(['Pas d’étirement agressif du mollet ; dorsiflexion progressive seulement.', 'No aggressive calf stretching; progress dorsiflexion gradually.'], ['Pas de course, de sauts ni de montées sur la pointe d’une seule jambe.', 'No running, jumping or single-leg heel raises.'], ['Retire la talonnette de façon progressive, comme indiqué.', 'Reduce the heel lift gradually as instructed.']),
        exercises: ['ankle_alpha', 'eversion_band', 'inversion_band', 'short_foot', 'sit_stand', { id: 'heel_raise', maxLevel: 2 }, 'tke'],
        progressionCriteria: G(['Marche sans botte ni boiterie', 'Walking without boot or limp'], ['Dorsiflexion proche de l’autre cheville', 'Dorsiflexion close to the other ankle'], ['Montée sur la pointe des deux pieds sans douleur', 'Pain-free double-leg heel raise']),
        romTargets: [{ test: 'ankle_df', deg: 10 }] },
      { id: 'ar4', weeks: [12, 26],
        goals: G(['Force du mollet : montées sur la pointe sur une jambe', 'Calf strength: single-leg heel raises'], ['Équilibre et contrôle', 'Balance and control']),
        precautions: G(['La force du mollet revient lentement (6–12 mois) : avance de façon progressive.', 'Calf strength returns slowly (6–12 months): progress gradually.'], ['Pas de course avant ≈ 16–20 semaines et seulement si les critères sont atteints.', 'No running before about 16–20 weeks, and only when criteria are met.'], ['Douleur ≤ 3/10 ; raideur matinale qui ne s’aggrave pas le lendemain.', 'Pain ≤ 3/10; morning stiffness no worse the next day.']),
        exercises: ['heel_raise', 'ecc_heel_drop', 'calf_stretch', 'knee_to_wall', 'step_up', 'sl_balance', 'squat'],
        progressionCriteria: G(['Montées sur la pointe sur une jambe : ≥ 20 répétitions sans douleur', 'Single-leg heel raises: ≥ 20 repetitions pain-free'], ['Force du mollet ≥ 80 % de l’autre jambe', 'Calf strength ≥ 80% of the other leg'], ['Dorsiflexion symétrique', 'Symmetrical dorsiflexion']),
        romTargets: [{ test: 'ankle_df', deg: 15 }] },
      { id: 'ar5', weeks: [26, null],
        goals: G(['Retour aux sports et aux sauts par étapes', 'Staged return to sport and jumping'], ['Force et endurance du mollet symétriques', 'Symmetrical calf strength and endurance']),
        precautions: G(['Sauts, sprints et changements de direction : après tests fonctionnels et accord du chirurgien, en général ≥ 6 mois.', 'Jumping, sprinting and cutting: after functional testing and surgeon clearance, generally ≥ 6 months.']),
        exercises: ['heel_raise', 'ecc_heel_drop', 'step_down', 'sl_balance'],
        progressionCriteria: G(['Tests de sauts et de force symétriques (≥ 90 %)', 'Symmetrical hop and strength tests (≥ 90%)'], ['Aucune douleur au tendon', 'No tendon pain']) },
    ],
    redFlags: [...RF_COMMON, ...G(['« Clac » ou douleur soudaine derrière la cheville : nouvelle rupture possible', 'A “pop” or sudden pain behind the ankle: possible re-rupture'], ['Impossible de se mettre sur la pointe du pied ou creux visible sur le tendon', 'Unable to rise on tiptoe, or a visible gap in the tendon'])],
  },

  // ───────────────────────── GENOU : MÉNISQUE ─────────────────────────
  {
    id: 'meniscus', region: 'knee', name: S('Méniscectomie partielle / suture méniscale', 'Partial meniscectomy / meniscal repair'),
    surgery: S('Ablation partielle ou réparation (suture) d’un ménisque du genou', 'Partial removal or repair (suture) of a knee meniscus'),
    painMax: 3,
    variants: [
      { id: 'partial', name: S('Méniscectomie partielle', 'Partial meniscectomy') },
      { id: 'repair', name: S('Suture (réparation) méniscale', 'Meniscal repair') },
    ],
    phases: [
      { id: 'mn1', weeks: [0, 1],
        goals: G(['Contrôler l’enflure, bouger le genou, marcher normalement', 'Control swelling, move the knee, walk normally']),
        precautions: G(['Appui toléré, avec béquilles au besoin.', 'Weight-bearing as tolerated, crutches if needed.'], ['Glace et jambe surélevée.', 'Ice and elevation.']),
        exercises: ['slr', 'tke', 'knee_ext_sit'],
        byVariant: { repair: { weeks: [0, 6],
          goals: G(['Protéger la suture, extension complète', 'Protect the repair, full extension'], ['Contrôler l’enflure', 'Control swelling']),
          precautions: G(['Appui limité (souvent sans appui ou partiel 4 à 6 semaines) et orthèse selon le chirurgien.', 'Limited weight-bearing (often none or partial for 4–6 weeks) and brace per your surgeon.'], ['Flexion limitée (souvent ≤ 90°) pendant 4 à 6 semaines.', 'Flexion limited (often ≤ 90°) for 4–6 weeks.'], ['Pas de squat, de torsion ni de flexion profonde.', 'No squatting, twisting or deep flexion.'], ['Pas de flexion contre résistance des ischio-jambiers.', 'No resisted hamstring curls.']),
          exercises: ['slr', 'tke', { id: 'knee_ext_sit', maxLevel: 2 }],
          progressionCriteria: G(['Extension complète, flexion à la limite permise', 'Full extension, flexion to the allowed limit'], ['Enflure en baisse', 'Swelling decreasing'], ['Accord du chirurgien pour l’appui complet', 'Surgeon approval for full weight-bearing']),
          romTargets: [{ test: 'knee_ext', deg: 0, dir: 'max' }, { test: 'knee_flex', deg: 90 }] } },
        progressionCriteria: G(['Marche sans boiterie', 'Walking without limp'], ['Extension complète', 'Full extension'], ['Enflure légère', 'Mild swelling']),
        romTargets: [{ test: 'knee_ext', deg: 0, dir: 'max' }, { test: 'knee_flex', deg: 110 }] },
      { id: 'mn2', weeks: [1, 3],
        goals: G(['Amplitude complète et marche normale', 'Full range and normal walking'], ['Force du quadriceps', 'Quadriceps strength']),
        precautions: G(['Pas de course ni de sauts.', 'No running or jumping.'], ['Réduis si le genou gonfle ou chauffe après les exercices.', 'Ease off if the knee swells or warms after exercise.']),
        exercises: ['slr', 'tke', 'sit_stand', 'wall_sit', 'heel_raise', 'glute_bridge'],
        byVariant: { repair: { weeks: [6, 12],
          goals: G(['Amplitude complète progressive', 'Gradual full range'], ['Force des jambes en chaîne fermée', 'Closed-chain leg strength']),
          precautions: G(['Squat limité à environ 60–90° de flexion ; pas de torsion sur le pied fixé.', 'Squats limited to about 60–90° of flexion; no twisting on a planted foot.'], ['Pas de course ni de sauts.', 'No running or jumping.']),
          exercises: ['sit_stand', 'wall_sit', 'heel_raise', 'glute_bridge', 'tke', 'hip_abd_stand'],
          progressionCriteria: G(['Flexion ≥ 120° sans douleur', 'Flexion ≥ 120° pain-free'], ['Pas d’épanchement', 'No effusion'], ['Marche normale', 'Normal gait']),
          romTargets: [{ test: 'knee_flex', deg: 120 }] } },
        progressionCriteria: G(['Pas d’épanchement', 'No effusion'], ['Flexion complète sans douleur', 'Pain-free full flexion'], ['Montée de marche et squat partiel sans douleur', 'Pain-free step-up and partial squat']),
        romTargets: [{ test: 'knee_flex', deg: 130 }] },
      { id: 'mn3', weeks: [3, 6],
        goals: G(['Force et équilibre ; préparer le retour à la course', 'Strength and balance; prepare return to running']),
        precautions: G(['Course légère seulement si aucun épanchement, force symétrique et accord du clinicien.', 'Light jogging only with no effusion, symmetrical strength and clinician approval.']),
        exercises: ['squat', 'step_up', 'step_down', 'sl_balance', 'hip_abd_stand', 'heel_raise'],
        byVariant: { repair: { weeks: [12, 20],
          goals: G(['Force des jambes, équilibre', 'Leg strength, balance']),
          precautions: G(['Pas de squat profond ni de torsion avant ≈ 4 mois, selon le chirurgien.', 'No deep squats or twisting before about 4 months, per your surgeon.'], ['Course : en général après 4 mois et critères atteints.', 'Running: generally after 4 months and criteria met.']),
          exercises: ['squat', 'step_up', 'step_down', 'sl_balance', 'hip_hinge', 'heel_raise'],
          progressionCriteria: G(['Force ≥ 80 % de l’autre jambe', 'Strength ≥ 80% of the other leg'], ['Pas d’enflure ni de blocage', 'No swelling or locking']) } },
        progressionCriteria: G(['Force ≥ 80–90 % de l’autre jambe', 'Strength ≥ 80–90% of the other leg'], ['Aucun épanchement après l’effort', 'No effusion after exertion'], ['Squat sur une jambe contrôlé', 'Controlled single-leg squat']) },
      { id: 'mn4', weeks: [6, null],
        goals: G(['Retour aux activités et au sport', 'Return to activity and sport']),
        precautions: G(['Retour au sport par étapes (course, puis changements de direction) selon la tolérance.', 'Staged return to sport (running, then cutting) as tolerated.']),
        exercises: ['squat', 'step_down', 'hip_hinge', 'sl_balance', 'side_plank'],
        byVariant: { repair: { weeks: [20, null],
          precautions: G(['Retour aux sports de pivot en général à 5–6 mois ou plus, avec l’accord du chirurgien.', 'Return to pivoting sport generally at 5–6 months or more, with surgeon clearance.']) } },
        progressionCriteria: G(['Fonction sans douleur ni enflure', 'Pain-free and swelling-free function'], ['Accord du chirurgien si suture', 'Surgeon clearance if repair']) },
    ],
    redFlags: [...RF_COMMON, ...G(['Genou bloqué (impossible de tendre ou plier) ou qui craque avec douleur vive', 'Knee locked (cannot straighten or bend) or clicking with sharp pain'], ['Enflure importante qui revient après chaque exercice', 'Large swelling that returns after every exercise session'])],
  },

  // ───────────────────────── LOMBAIRE ─────────────────────────
  {
    id: 'lumbar_surgery', region: 'lumbar', name: S('Discectomie / décompression lombaire', 'Lumbar discectomy / decompression'),
    surgery: S('Discectomie (hernie discale) ou laminectomie / décompression (sténose), sans fusion', 'Discectomy (disc herniation) or laminectomy / decompression (stenosis), without fusion'),
    painMax: 4,
    variants: [
      { id: 'discectomy', name: S('Discectomie', 'Discectomy') },
      { id: 'decompression', name: S('Décompression / laminectomie', 'Decompression / laminectomy') },
    ],
    phases: [
      { id: 'lm1', weeks: [0, 2],
        goals: G(['Marcher chaque jour, un peu plus souvent', 'Walk daily, a little more often'], ['Contrôler la douleur de la plaie', 'Control wound pain'], ['Activer doucement le tronc', 'Gently activate the trunk']),
        precautions: G(['Évite de te pencher en avant, de soulever (plus de 4–5 kg) et de te tordre (règle « BLT » : Bending, Lifting, Twisting).', 'Avoid bending forward, lifting (over 4–5 kg / 10 lb) and twisting (“BLT” rule).'], ['Alterne assis, debout et marche ; évite de rester assis plus de 30 min.', 'Alternate sitting, standing and walking; avoid sitting more than 30 min.'], ['Garde la plaie propre et sèche.', 'Keep the wound clean and dry.'], ['Pas de conduite tant que tu prends des narcotiques ou que le chirurgien ne le permet pas.', 'No driving while on narcotics or until your surgeon allows it.']),
        exercises: [{ id: 'glute_bridge', maxLevel: 2 }, { id: 'cat_camel', maxLevel: 2 }],
        progressionCriteria: G(['Marche 15–20 min sans augmentation de la jambe douloureuse', 'Walk 15–20 min without more leg pain'], ['Plaie guérie', 'Wound healed'], ['Pas de nouvelle faiblesse', 'No new weakness']) },
      { id: 'lm2', weeks: [2, 6],
        goals: G(['Contrôle du tronc en position neutre', 'Trunk control in neutral spine'], ['Marche 30 min', '30-minute walks'], ['Retour progressif aux tâches légères', 'Gradual return to light tasks']),
        precautions: G(['Limite de soulèvement ≈ 5 kg jusqu’à l’autorisation du chirurgien (souvent 6 semaines).', 'Lifting limit about 5 kg until your surgeon clears you (often 6 weeks).'], ['Pas de flexion répétée en fin d’amplitude ni de torsion avec charge.', 'No repeated end-range bending or loaded twisting.'], ['Arrête un exercice qui fait descendre la douleur plus bas dans la jambe.', 'Stop any exercise that sends pain further down the leg.']),
        exercises: ['dead_bug', 'bird_dog', 'glute_bridge', 'cat_camel'],
        byVariant: { discectomy: { exercisesAdd: [{ id: 'sciatic_glide', maxLevel: 2 }] }, decompression: { precautionsAdd: G(['Décompression : si les jambes se fatiguent en marchant, fais des pauses assis ; la flexion soulage souvent.', 'Decompression: if your legs tire on walking, take seated rests; flexion often relieves.']) } },
        progressionCriteria: G(['Marche 30 min sans augmentation des symptômes', '30-min walk without symptom increase'], ['Position quadrupédique et pont tenus avec contrôle', 'Quadruped and bridge held with control'], ['Aucune faiblesse nouvelle de la jambe ou du pied', 'No new leg or foot weakness']) },
      { id: 'lm3', weeks: [6, 12],
        goals: G(['Endurance et force du tronc et des fessiers', 'Trunk and glute endurance and strength'], ['Apprendre à se pencher avec les hanches (charnière)', 'Learn to hinge at the hips']),
        precautions: G(['Augmente les charges lentement ; soulever en gardant la charge près du corps.', 'Increase loads slowly; keep the load close to your body.'], ['Évite les sports de torsion à impact avant 12 semaines.', 'Avoid impact twisting sports before 12 weeks.']),
        exercises: ['bird_dog', 'side_plank', 'hip_hinge', 'sit_stand', 'step_up', 'glute_bridge'],
        progressionCriteria: G(['Planche latérale (genoux) 20–30 s de chaque côté', 'Side plank (knees) 20–30 s each side'], ['Charnière de hanche sans douleur', 'Pain-free hip hinge'], ['Tolérance au travail léger à modéré', 'Tolerance of light–moderate work']) },
      { id: 'lm4', weeks: [12, null],
        goals: G(['Retour au travail et au sport selon les exigences', 'Return to work and sport as demanded'], ['Programme d’entretien à vie', 'Lifelong maintenance program']),
        precautions: G(['Les travaux lourds se reprennent par paliers avec le clinicien.', 'Heavy work resumes in stages with your clinician.'], ['La douleur légère au début d’une activité nouvelle est acceptable si elle revient à la base en 24 h.', 'Mild pain when starting a new activity is acceptable if it settles within 24 h.']),
        exercises: ['hip_hinge', 'squat', 'side_plank', 'step_up'],
        progressionCriteria: G(['Fonction adéquate pour le travail visé', 'Function adequate for your work'], ['Pas de symptômes neurologiques', 'No neurological symptoms']) },
    ],
    redFlags: [...RF_COMMON, ...G(['Perte de contrôle de la vessie ou des intestins, ou engourdissement entre les cuisses : urgence', 'Loss of bladder or bowel control, or numbness between the legs: emergency'], ['Faiblesse nouvelle ou qui s’aggrave dans une jambe ou le pied (pied qui traîne)', 'New or worsening leg or foot weakness (foot drop)'], ['Écoulement clair (liquide céphalo-rachidien) ou maux de tête intenses en position debout', 'Clear fluid leak (cerebrospinal fluid) or severe headache on standing'])],
  },

  // ───────────────────────── POIGNET : RADIUS DISTAL ─────────────────────────
  {
    id: 'distal_radius', region: 'wrist', name: S('Fracture du radius distal (après immobilisation ou ostéosynthèse)', 'Distal radius fracture (after immobilization or fixation)'),
    surgery: S('Fracture traitée par plâtre / attelle, ou par fixation chirurgicale (plaque, broches)', 'Fracture treated by cast / splint, or surgical fixation (plate, pins)'),
    painMax: 4,
    variants: [
      { id: 'orif', name: S('Fixation chirurgicale (plaque)', 'Surgical fixation (plate)') },
      { id: 'cast', name: S('Plâtre / attelle (sans chirurgie)', 'Cast / splint (no surgery)') },
    ],
    phases: [
      { id: 'dr1', weeks: [0, 2],
        goals: G(['Contrôler l’enflure (main plus haute que le coude)', 'Control swelling (hand above elbow)'], ['Garder doigts, coude et épaule mobiles', 'Keep fingers, elbow and shoulder moving']),
        precautions: G(['Garde l’attelle ou le plâtre en place ; ne le mouille pas.', 'Keep the splint or cast on; keep it dry.'], ['Bouge tous les doigts à fond plusieurs fois par jour.', 'Move all fingers fully several times a day.'], ['Aucune charge sur la main ni le poignet.', 'No weight through the hand or wrist.']),
        exercises: ['tendon_glides', { id: 'pendulum', maxLevel: 2 }, { id: 'elbow_curl', maxLevel: 2 }],
        byVariant: { cast: { weeks: [0, 6], precautionsAdd: G(['Date de départ conseillée : date de la fracture ; le plâtre dure en général 5 à 6 semaines.', 'Suggested start date: the date of the fracture; the cast usually stays 5–6 weeks.']) } },
        progressionCriteria: G(['Enflure des doigts contrôlée', 'Finger swelling controlled'], ['Doigts qui forment un poing complet', 'Fingers make a full fist'], ['Accord du chirurgien pour retirer l’attelle / le plâtre', 'Surgeon approval to remove the splint / cast']) },
      { id: 'dr2', weeks: [2, 6],
        goals: G(['Récupérer l’amplitude active du poignet et de l’avant-bras', 'Regain active wrist and forearm range'], ['Réduire l’enflure et la raideur des doigts', 'Reduce finger swelling and stiffness']),
        precautions: G(['Orthèse amovible entre les exercices, si prescrite.', 'Removable splint between exercises, if prescribed.'], ['Pas de charge : rien de plus lourd qu’une tasse (≈ 0,5 kg).', 'No loading: nothing heavier than a cup (about 0.5 kg).'], ['Pas d’appui sur la paume (pousser pour se lever).', 'No pushing through the palm (e.g. rising from a chair).'], ['Douleur diffuse disproportionnée, enflure, changement de couleur de la main : consulte (SDRC).', 'Disproportionate diffuse pain, swelling or colour change in the hand: seek care (CRPS).']),
        exercises: ['wrist_rom', 'pron_sup', 'tendon_glides', { id: 'median_glide', maxLevel: 2 }],
        byVariant: { cast: { weeks: [6, 10], precautionsAdd: G(['Plâtre retiré : la peau et les articulations sont sensibles ; vas-y doucement.', 'Cast removed: skin and joints are sensitive; go gently.']) } },
        progressionCriteria: G(['Flexion et extension du poignet ≥ 50 % de l’autre côté', 'Wrist flexion and extension ≥ 50% of the other side'], ['Rotation de l’avant-bras presque complète', 'Near-full forearm rotation'], ['Consolidation confirmée à la radiographie', 'Healing confirmed on X-ray']),
        romTargets: [{ test: 'wrist_flex', deg: 40 }, { test: 'wrist_ext', deg: 40 }] },
      { id: 'dr3', weeks: [6, 10],
        goals: G(['Amplitude complète ou presque', 'Full or near-full range'], ['Début du renforcement de la prise', 'Start grip strengthening']),
        precautions: G(['Charges progressives seulement avec l’accord du chirurgien (souvent après 6–8 semaines).', 'Progressive loading only with surgeon approval (often after 6–8 weeks).'], ['Pas de sport de contact, de chute ni de charge lourde.', 'No contact sport, falls or heavy loads.']),
        exercises: ['wrist_rom', 'pron_sup', 'grip_putty', 'tendon_glides', 'radial_dev'],
        byVariant: { cast: { weeks: [10, 14] } },
        progressionCriteria: G(['Amplitude du poignet ≥ 80 % de l’autre côté', 'Wrist range ≥ 80% of the other side'], ['Prise sans douleur', 'Pain-free grip'], ['Radiographie : consolidation solide', 'X-ray: solid healing']),
        romTargets: [{ test: 'wrist_flex', deg: 55 }, { test: 'wrist_ext', deg: 55 }] },
      { id: 'dr4', weeks: [10, null],
        goals: G(['Force de prise et fonction pour le travail et les loisirs', 'Grip strength and function for work and recreation'], ['Tolérance à l’appui sur la main (pompes au mur)', 'Tolerance for weight through the hand (wall push-ups)']),
        precautions: G(['Augmente les charges et les appuis graduellement ; douleur ≤ 4/10.', 'Increase loads and weight-bearing gradually; pain ≤ 4/10.'], ['Sports de contact ou à risque de chute : après l’accord du chirurgien.', 'Contact or fall-risk sports: after surgeon approval.']),
        exercises: ['grip_putty', 'ecc_wrist_ext', 'wall_pushup', 'tyler_twist', 'radial_dev', 'wrist_rom'],
        byVariant: { cast: { weeks: [14, null] } },
        progressionCriteria: G(['Force de prise ≥ 80–90 % de l’autre main', 'Grip strength ≥ 80–90% of the other hand'], ['Amplitude du poignet quasi symétrique', 'Near-symmetrical wrist range']),
        romTargets: [{ test: 'wrist_flex', deg: 60 }, { test: 'wrist_ext', deg: 60 }] },
    ],
    redFlags: [...RF_COMMON, ...G(['Engourdissement ou picotements croissants dans les doigts (nerf médian)', 'Increasing numbness or tingling in the fingers (median nerve)'], ['Impossible de bouger le pouce ou les doigts, ou doigts très enflés et froids', 'Unable to move the thumb or fingers, or fingers very swollen and cold'], ['Douleur diffuse disproportionnée avec changement de couleur et sueurs (SDRC)', 'Disproportionate diffuse pain with colour change and sweating (CRPS)'])],
  },

  // ───────────────────────── POIGNET : CANAL CARPIEN ─────────────────────────
  {
    id: 'carpal_release', region: 'wrist', name: S('Libération du canal carpien', 'Carpal tunnel release'),
    surgery: S('Section du ligament transverse du carpe (ouverte ou endoscopique)', 'Division of the transverse carpal ligament (open or endoscopic)'),
    painMax: 3,
    phases: [
      { id: 'cc1', weeks: [0, 2],
        goals: G(['Plaie propre et sèche', 'Clean, dry wound'], ['Bouger les doigts dès le premier jour', 'Move the fingers from day 1'], ['Main plus haute que le coude pour l’enflure', 'Hand above elbow for swelling']),
        precautions: G(['Pansement et points selon les consignes ; ne les mouille pas.', 'Dressing and stitches as instructed; keep them dry.'], ['Pas de charges ni d’appui sur la paume.', 'No loads or weight through the palm.'], ['Pas de prise serrée prolongée.', 'No prolonged tight gripping.']),
        exercises: ['tendon_glides', { id: 'wrist_rom', maxLevel: 2 }],
        progressionCriteria: G(['Plaie guérie, points retirés', 'Wound healed, stitches out'], ['Poing complet', 'Full fist'], ['Douleur contrôlée', 'Pain controlled']) },
      { id: 'cc2', weeks: [2, 6],
        goals: G(['Amplitude complète du poignet', 'Full wrist range'], ['Masser la cicatrice (une fois guérie)', 'Massage the scar (once healed)'], ['Récupérer la prise légère', 'Regain light grip']),
        precautions: G(['Évite les charges plus lourdes que ≈ 1–2 kg et les prises serrées répétées jusqu’à 4–6 semaines environ.', 'Avoid loads heavier than about 1–2 kg and repeated tight grips until about 4–6 weeks.'], ['La douleur à la base de la paume (« pilier ») est fréquente et diminue lentement.', 'Pain at the base of the palm (“pillar pain”) is common and fades slowly.'], ['Évite l’appui direct sur la cicatrice.', 'Avoid direct pressure on the scar.']),
        exercises: ['tendon_glides', 'median_glide', 'wrist_rom', 'thumb_opp', 'pron_sup'],
        progressionCriteria: G(['Plaie complètement fermée, cicatrice souple', 'Wound fully closed, scar supple'], ['Amplitude du poignet complète', 'Full wrist range'], ['Engourdissement stable ou en amélioration', 'Numbness stable or improving']),
        romTargets: [{ test: 'wrist_flex', deg: 60 }, { test: 'wrist_ext', deg: 60 }] },
      { id: 'cc3', weeks: [6, null],
        goals: G(['Retour progressif à la force de prise et au travail', 'Gradual return to grip strength and work'], ['Corriger l’ergonomie (poste, outils)', 'Correct ergonomics (workstation, tools)']),
        precautions: G(['Augmente la charge progressivement ; douleur ≤ 3/10.', 'Increase loads gradually; pain ≤ 3/10.'], ['Le retour aux travaux manuels lourds est décidé avec le chirurgien.', 'Return to heavy manual work is decided with your surgeon.'], ['La force et la sensibilité peuvent s’améliorer pendant plusieurs mois.', 'Strength and sensation can keep improving over several months.']),
        exercises: ['grip_putty', 'thumb_opp', 'wrist_rom', 'median_glide', 'tendon_glides'],
        progressionCriteria: G(['Force de prise ≥ 80 % de l’autre main', 'Grip strength ≥ 80% of the other hand'], ['Cicatrice peu sensible', 'Scar not tender']) },
    ],
    redFlags: [...RF_COMMON, ...G(['Engourdissement qui s’aggrave nettement après l’opération ou nouvelle perte de sensation', 'Numbness clearly worsening after surgery or new loss of sensation'], ['Perte du mouvement du pouce ou des doigts', 'Loss of thumb or finger movement'], ['Douleur diffuse disproportionnée avec enflure et changement de couleur (SDRC)', 'Disproportionate diffuse pain with swelling and colour change (CRPS)'])],
  },
];

// ───────── Utilitaires purs ─────────
export const protocolById = (id) => PROTOCOLS.find((p) => p.id === id) || null;
export const defaultVariant = (p) => p?.variants?.[0]?.id || null;
export const variantOf = (p, vid) => (p?.variants?.length ? (p.variants.find((v) => v.id === vid) || p.variants[0]).id : null);

// Phase avec les remplacements de la variante appliqués (weeks, goals, precautions, exercises, criteria, romTargets).
export function resolvePhase(phase, variantId) {
  const o = (variantId && phase.byVariant?.[variantId]) || {};
  const r = { ...phase, ...o };
  r.precautions = [...(o.precautions || phase.precautions || []), ...(o.precautionsAdd || [])];
  r.exercises = [...(o.exercises || phase.exercises || []), ...(o.exercisesAdd || [])];
  r.goals = o.goals || phase.goals || [];
  r.progressionCriteria = o.progressionCriteria || phase.progressionCriteria || [];
  r.romTargets = o.romTargets || phase.romTargets || [];
  r.weeks = o.weeks || phase.weeks;
  delete r.byVariant; delete r.precautionsAdd; delete r.exercisesAdd;
  return r;
}
// Phases d'un protocole pour une variante, triées, sans trou ni chevauchement (le début d'une phase = la fin de la précédente).
export function protocolPhases(protocol, variantId) {
  const v = variantOf(protocol, variantId);
  return protocol.phases.map((ph) => resolvePhase(ph, v));
}
// Entrée d'exercice normalisée : { id, level?, maxLevel?, dose? }
export const exerciseEntry = (e) => (typeof e === 'string' ? { id: e } : { ...e });
export const phaseExerciseIds = (phase) => [...new Set((phase.exercises || []).map((e) => exerciseEntry(e).id))];

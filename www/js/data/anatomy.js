// Structures anatomiques affichables sur les schémas (option « Anatomie »).
// seg = [articulation de départ, d'arrivée] du bonhomme ; t = portion du segment ; off = décalage perpendiculaire
// (positif = avant pour un membre qui descend) ; w = épaisseur. kind : muscle, tendon, nerve, fascia, joint.
const S = (fr, en) => ({ fr, en });

export const STRUCTURES = {
  quads: { kind: 'muscle', name: S('Quadriceps', 'Quadriceps'), seg: ['pelvis', 'knee'], t: [0.15, 0.85], off: 5, w: 7 },
  hamstrings: { kind: 'muscle', name: S('Ischio-jambiers', 'Hamstrings'), seg: ['pelvis', 'knee'], t: [0.12, 0.85], off: -5, w: 6 },
  glutes: { kind: 'muscle', name: S('Fessiers', 'Glutes'), seg: ['pelvis', 'knee'], t: [-0.12, 0.25], off: -8, w: 10 },
  hip_flexors_far: { kind: 'muscle', name: S('Fléchisseurs de hanche', 'Hip flexors'), seg: ['pelvis', 'knee2'], t: [-0.1, 0.45], off: 5, w: 5 },
  glute_med_side: { kind: 'muscle', name: S('Moyen fessier', 'Gluteus medius'), seg: ['pelvis', 'knee2'], t: [-0.15, 0.3], off: -6, w: 9 },
  gastroc: { kind: 'muscle', name: S('Mollet', 'Calf'), seg: ['knee', 'ankle'], t: [0.08, 0.6], off: -4, w: 7 },
  achilles: { kind: 'tendon', name: S('Tendon d’Achille', 'Achilles tendon'), seg: ['knee', 'ankle'], t: [0.62, 1.02], off: -3.5, w: 2.5 },
  patellar: { kind: 'tendon', name: S('Tendon rotulien', 'Patellar tendon'), seg: ['knee', 'ankle'], t: [0.0, 0.2], off: 4, w: 2.5 },
  plantar_side: { kind: 'fascia', name: S('Fascia plantaire', 'Plantar fascia'), seg: ['ankle', 'toe'], t: [0, 1], off: 3, w: 2 },
  erector: { kind: 'muscle', name: S('Muscles du dos', 'Back muscles'), seg: ['pelvis', 'shoulder'], t: [0.05, 0.9], off: 5, w: 6 },
  abs: { kind: 'muscle', name: S('Abdominaux', 'Core muscles'), seg: ['pelvis', 'shoulder'], t: [0.05, 0.75], off: -5, w: 6 },
  scap_retract: { kind: 'muscle', name: S('Muscles entre les omoplates', 'Muscles between shoulder blades'), seg: ['pelvis', 'shoulder'], t: [0.7, 0.98], off: 7, w: 6 },
  serratus: { kind: 'muscle', name: S('Dentelé (stabilise l’omoplate)', 'Serratus (shoulder-blade stabiliser)'), seg: ['pelvis', 'shoulder'], t: [0.6, 0.92], off: -6, w: 5 },
  dnf: { kind: 'muscle', name: S('Fléchisseurs profonds du cou', 'Deep neck flexors'), seg: ['shoulder', 'head'], t: [0.05, 0.6], off: -4, w: 3.5 },
  cuff_side: { kind: 'muscle', name: S('Coiffe des rotateurs', 'Rotator cuff'), seg: ['shoulder', 'elbow'], t: [-0.08, 0.35], off: 0, w: 9 },
  biceps: { kind: 'muscle', name: S('Biceps', 'Biceps'), seg: ['shoulder', 'elbow'], t: [0.2, 0.9], off: 4, w: 6 },
  triceps: { kind: 'muscle', name: S('Triceps', 'Triceps'), seg: ['shoulder', 'elbow'], t: [0.2, 0.9], off: -4, w: 6 },
  sciatic: { kind: 'nerve', name: S('Nerf sciatique', 'Sciatic nerve'), seg: ['pelvis', 'knee'], t: [0, 1], off: -2, w: 1.6, more: [['knee', 'ankle', -2]] },
  // vue de face
  glute_med_front: { kind: 'muscle', name: S('Moyen fessier', 'Gluteus medius'), seg: ['hipL', 'kneeL'], t: [-0.15, 0.25], off: 7, w: 9, mirror: ['hipR', 'kneeR', -7] },
  quads_front: { kind: 'muscle', name: S('Quadriceps', 'Quadriceps'), seg: ['hipL', 'kneeL'], t: [0.25, 0.9], off: 0, w: 7, mirror: ['hipR', 'kneeR', 0] },
  deltoid_front: { kind: 'muscle', name: S('Deltoïde et coiffe', 'Deltoid and cuff'), seg: ['shL', 'elbowL'], t: [-0.05, 0.4], off: 0, w: 8, mirror: ['shR', 'elbowR', 0] },
  scap_front: { kind: 'muscle', name: S('Muscles de l’omoplate', 'Shoulder-blade muscles'), seg: ['shL', 'hipL'], t: [0.05, 0.35], off: 4, w: 6, mirror: ['shR', 'hipR', -4] },
  er_cuff_front: { kind: 'muscle', name: S('Rotateurs externes (coiffe)', 'External rotators (cuff)'), seg: ['shR', 'elbowR'], t: [-0.05, 0.35], off: 0, w: 8 },
  neck_front: { kind: 'muscle', name: S('Muscles du cou', 'Neck muscles'), seg: ['neck', 'head'], t: [0, 0.6], off: 6, w: 3, mirror: ['neck', 'head', -6] },
  median_front: { kind: 'nerve', name: S('Nerf médian', 'Median nerve'), seg: ['shR', 'elbowR'], t: [0, 1], off: 2, w: 1.6, more: [['elbowR', 'wristR', 2]] },
  // main (vue de côté de l'avant-bras)
  extensors_hand: { kind: 'muscle', name: S('Extenseurs du poignet', 'Wrist extensors'), seg: ['elbow', 'wrist'], t: [0.03, 0.65], off: 4, w: 6 },
  flexors_hand: { kind: 'muscle', name: S('Fléchisseurs du poignet', 'Wrist flexors'), seg: ['elbow', 'wrist'], t: [0.03, 0.65], off: -4, w: 6 },
  flexor_tendons: { kind: 'tendon', name: S('Tendons fléchisseurs', 'Flexor tendons'), seg: ['wrist', 'mcp'], t: [0, 1], off: -3, w: 2, more: [['mcp', 'pip', -2.5], ['pip', 'dip', -2], ['dip', 'tip', -2]] },
  dequervain: { kind: 'tendon', name: S('Tendons du pouce', 'Thumb tendons'), seg: ['wrist', 'thumbTip'], t: [-0.2, 0.8], off: 2, w: 2.2 },
  thenar: { kind: 'muscle', name: S('Muscles du pouce', 'Thumb muscles'), seg: ['thumbBase', 'thumbTip'], t: [-0.3, 0.5], off: -2, w: 5 },
  lat_epi: { kind: 'joint', name: S('Épicondyle latéral', 'Lateral epicondyle'), at: 'elbow', r: 5 },
  med_epi: { kind: 'joint', name: S('Épicondyle médial', 'Medial epicondyle'), at: 'elbow', r: 5 },
  cmc: { kind: 'joint', name: S('Base du pouce', 'Thumb base joint'), at: 'thumbBase', r: 4.5 },
  // pied
  plantar_foot: { kind: 'fascia', name: S('Fascia plantaire', 'Plantar fascia'), seg: ['heel', 'mtp'], t: [0, 1], off: -2, w: 2.5 },
  intrinsics_foot: { kind: 'muscle', name: S('Petits muscles du pied', 'Foot muscles'), seg: ['heel', 'mtp'], t: [0.25, 0.85], off: 4, w: 5 },
  tibpost_foot: { kind: 'tendon', name: S('Tibial postérieur', 'Tibialis posterior'), seg: ['knee', 'ankle'], t: [0.45, 1], off: -3, w: 2.5, more: [['ankle', 'archTop', -2]] },
  peroneals_foot: { kind: 'tendon', name: S('Péroniers (stabilisent la cheville)', 'Peroneals (ankle stabilisers)'), seg: ['knee', 'ankle'], t: [0.3, 1], off: 3, w: 2.5 },
  ankle_joint: { kind: 'joint', name: S('Articulation de la cheville', 'Ankle joint'), at: 'ankle', r: 6 },
  hallux_joint: { kind: 'joint', name: S('Articulation du gros orteil', 'Big-toe joint'), at: 'mtp', r: 5 },
};

export const EX_ANATOMY = {
  chin_tuck: ['dnf'], dnf: ['dnf'], cerv_rot: ['neck_front'], row_band: ['scap_retract', 'biceps'], thor_ext: ['erector'],
  wall_angel: ['scap_front', 'deltoid_front'], open_book: [], pendulum: ['cuff_side'], stick_flex: ['cuff_side'],
  scaption: ['deltoid_front'], er_band: ['er_cuff_front'], wall_slide: ['cuff_side', 'serratus'], wall_pushup: ['serratus', 'triceps'],
  elbow_curl: ['biceps'], iso_wrist_ext: ['extensors_hand', 'lat_epi'], ecc_wrist_ext: ['extensors_hand', 'lat_epi'],
  ecc_wrist_flex: ['flexors_hand', 'med_epi'], tyler_twist: ['extensors_hand', 'lat_epi'], pron_sup: ['extensors_hand', 'flexors_hand'],
  tendon_glides: ['flexor_tendons'], median_glide: ['median_front'], wrist_rom: ['extensors_hand', 'flexors_hand'],
  radial_dev: ['dequervain'], thumb_opp: ['thenar', 'cmc'], thumb_cmc: ['thenar', 'cmc'], grip_putty: ['flexors_hand', 'flexor_tendons'],
  glute_bridge: ['glutes', 'hamstrings'], bird_dog: ['erector', 'glutes'], cat_camel: ['erector'], press_up: ['erector'],
  knee_chest: ['erector'], dead_bug: ['abs'], side_plank: ['abs'], hip_hinge: ['hamstrings', 'glutes', 'erector'],
  sit_stand: ['quads', 'glutes'], sciatic_glide: ['sciatic'], clamshell: ['glute_med_side'], hip_abd_stand: ['glute_med_front'],
  iso_hip_abd: ['glute_med_front'], step_up: ['quads', 'glutes'], bridge_long: ['hamstrings', 'glutes'], hip_flex_stretch: ['hip_flexors_far'],
  sl_balance: ['glute_med_front'], squat: ['quads', 'glutes'], slr: ['quads'], knee_ext_sit: ['quads'], wall_sit: ['quads', 'patellar'],
  step_down: ['quads_front', 'glute_med_front'], tke: ['quads'], heel_raise: ['gastroc', 'achilles'], heel_raise_towel: ['gastroc', 'plantar_side'],
  ecc_heel_drop: ['gastroc', 'achilles'], knee_to_wall: ['gastroc', 'achilles'], calf_stretch: ['gastroc'], ankle_alpha: ['ankle_joint'],
  eversion_band: ['peroneals_foot'], inversion_band: ['tibpost_foot'], short_foot: ['intrinsics_foot', 'plantar_foot'],
  plantar_stretch: ['plantar_foot'], towel_curl: ['intrinsics_foot'], hallux_mob: ['hallux_joint'],
};

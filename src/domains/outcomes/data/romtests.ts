// Catalogue des tests d'amplitude (textes, valeurs normales, consignes, schémas). Le calcul des angles est dans
// src/vision/goniometry.ts. Valeurs de référence : AAOS (Greene & Heckman, The Clinical Measurement of Joint Motion, 1994) et
// Guides de l'AMA (5e éd.) ; indicatives (âge, sexe, morphologie).
import { CALC, LM, cerv, wrist, type RomCalc, type RomFrame, type RomResult } from '../../../vision/goniometry.ts';
import type { Bilingual, RomStart, RomSuggestion, RomTest } from './types.ts';

const S = (fr: string, en: string): Bilingual => ({ fr, en });
// Références : AAOS = American Academy of Orthopaedic Surgeons (Greene & Heckman 1994) ; AMA = Guides to the Evaluation of Permanent Impairment, 5e éd.
// sch = schéma : axes en degrés d'écran (0 = vers la droite, 90 = vers le bas) — segment fixe, position de départ, position d'arrivée.
const TESTS_BASE = {
  sh_flex: {
    id: 'sh_flex',
    region: 'shoulder',
    name: S('Épaule — flexion', 'Shoulder — flexion'),
    plane: 'sagittal',
    view: 'side',
    scope: 'upper',
    sided: true,
    dir: 1,
    unit: '°',
    joints: ['sh', 'el', 'hip'],
    minTravel: 25,
    maxConf: 1,
    calc: CALC.shoulderFlex,
    normal: { ref: 180, lo: 160, hi: 180, src: 'AAOS 0–180°, AMA 180°' },
    pos: S(
      'Debout (ou assis dos droit), bras le long du corps, paume vers la cuisse.',
      'Standing (or sitting upright), arm at your side, palm toward the thigh.',
    ),
    how: S(
      'Lève le bras tendu vers l’avant puis vers le haut, le plus haut possible sans douleur importante, sans te pencher en arrière. Tiens 2 secondes.',
      'Raise your straight arm forward and up as high as you comfortably can, without leaning back. Hold 2 seconds.',
    ),
    cam: S(
      'Téléphone à la hauteur de la poitrine, à 2–3 m, côté travaillé face à la caméra (tu es de profil), en entier dans l’image.',
      'Phone at chest height, 2–3 m away, the tested side toward the camera (you are in profile), full upper body in frame.',
    ),
    note: S(
      'Angle tronc–bras dans le plan sagittal. Un bras qui part de côté (abduction) est sous-estimé. Le tronc sert de référence : une inclinaison du tronc est en partie compensée.',
      'Trunk–arm angle in the sagittal plane. An arm drifting sideways (abduction) is underestimated. The trunk is the reference, so trunk lean is partly compensated.',
    ),
    sch: { fix: 90, from: 90, to: -90 },
  },
  sh_abd: {
    id: 'sh_abd',
    region: 'shoulder',
    name: S('Épaule — abduction', 'Shoulder — abduction'),
    plane: 'frontal',
    view: 'front',
    scope: 'upper',
    sided: true,
    dir: 1,
    unit: '°',
    joints: ['sh', 'el', 'hip'],
    both: ['sh'],
    minTravel: 25,
    maxConf: 1,
    calc: CALC.shoulderAbd,
    normal: { ref: 180, lo: 160, hi: 180, src: 'AAOS 0–180°, AMA 180°' },
    pos: S(
      'Debout face à la caméra, bras le long du corps, paume vers la cuisse.',
      'Standing facing the camera, arm at your side, palm toward the thigh.',
    ),
    how: S(
      'Lève le bras tendu sur le côté, paume vers le haut en haut du mouvement, le plus haut possible sans douleur importante, sans pencher le tronc. Tiens 2 secondes.',
      'Raise your straight arm out to the side as high as you comfortably can, without leaning the trunk. Hold 2 seconds.',
    ),
    cam: S(
      'Téléphone à la hauteur de la poitrine, à 2–3 m, de face, épaules et hanches visibles.',
      'Phone at chest height, 2–3 m away, facing you, shoulders and hips visible.',
    ),
    note: S(
      'Angle tronc–bras dans le plan frontal. Si le bras monte vers l’avant (scaption), le bras est raccourci et l’angle sous-estimé.',
      'Trunk–arm angle in the frontal plane. If the arm drifts forward (scaption) it is foreshortened and the angle underestimated.',
    ),
    sch: { fix: 90, from: 90, to: -90 },
  },
  sh_er: {
    id: 'sh_er',
    region: 'shoulder',
    name: S('Épaule — rotation externe (coude au corps)', 'Shoulder — external rotation (elbow at side)'),
    plane: 'transverse',
    view: 'front',
    scope: 'upper',
    sided: true,
    dir: 1,
    unit: '°',
    joints: ['sh', 'el', 'wr'],
    both: ['sh'],
    minTravel: 15,
    maxConf: 0.8,
    calc: CALC.shoulderER,
    normal: { ref: 90, lo: 70, hi: 90, src: 'AAOS 0–90°, AMA 90°' },
    pos: S(
      'Debout face à la caméra, coude collé au corps plié à 90°, avant-bras vers l’avant (pouce vers le haut). Une serviette roulée sous le coude aide à le garder collé.',
      'Standing facing the camera, elbow tucked against your side bent to 90°, forearm pointing forward (thumb up). A rolled towel under the elbow helps keep it in.',
    ),
    how: S(
      'Garde le coude collé et ouvre l’avant-bras vers l’extérieur, comme on ouvre une porte, le plus loin possible sans douleur importante. Tiens 2 secondes.',
      'Keep the elbow tucked and swing the forearm outward like opening a door, as far as you comfortably can. Hold 2 seconds.',
    ),
    cam: S(
      'Téléphone à la hauteur de la poitrine, à 2–3 m, de face, bras et avant-bras bien visibles.',
      'Phone at chest height, 2–3 m away, facing you, arm and forearm clearly visible.',
    ),
    note: S(
      'Le mouvement se fait dans le plan horizontal : de face l’avant-bras est raccourci. Estimation 2D (décalage du poignet ÷ longueur d’avant-bras ≈ 0,79 × bras) combinée à la 3D des worldLandmarks (profondeur bruitée ± 15–20°). Précision attendue ± 10–15° : à utiliser pour suivre l’évolution, pas pour un diagnostic. Un goniomètre reste la référence.',
      'The movement happens in the horizontal plane: from the front the forearm is foreshortened. 2D estimate (wrist offset ÷ forearm length ≈ 0.79 × upper arm) blended with the 3D worldLandmarks (noisy depth ± 15–20°). Expected accuracy ± 10–15°: use it to follow change, not to diagnose. A goniometer remains the reference.',
    ),
    sch: { fix: -90, from: 0, to: 60 },
  },
  el_flex: {
    id: 'el_flex',
    region: 'elbow',
    name: S('Coude — flexion', 'Elbow — flexion'),
    plane: 'sagittal',
    view: 'side',
    scope: 'upper',
    sided: true,
    dir: 1,
    unit: '°',
    joints: ['sh', 'el', 'wr'],
    minTravel: 25,
    maxConf: 1,
    calc: CALC.elbowAngle,
    normal: { ref: 150, lo: 135, hi: 150, src: 'AAOS 0–150°, AMA 140°' },
    pos: S(
      'Debout ou assis, bras le long du corps, coude tendu, paume vers l’avant.',
      'Standing or sitting, arm at your side, elbow straight, palm forward.',
    ),
    how: S(
      'Plie le coude au maximum en amenant la main vers l’épaule, sans lever l’épaule. Tiens 2 secondes.',
      'Bend the elbow as far as it goes, bringing the hand toward the shoulder, without lifting the shoulder. Hold 2 seconds.',
    ),
    cam: S(
      'Téléphone à la hauteur de la poitrine, à 2 m, de profil, côté travaillé vers la caméra.',
      'Phone at chest height, 2 m away, side-on, tested side toward the camera.',
    ),
    note: S(
      '0° = bras tendu. Angle épaule–coude–poignet : un bras qui part vers l’avant ou en dehors du plan sagittal est faussé.',
      '0° = straight arm. Shoulder–elbow–wrist angle: an arm moving forward or out of the sagittal plane distorts it.',
    ),
    sch: { fix: 90, from: 90, to: -150 },
  },
  el_ext: {
    id: 'el_ext',
    region: 'elbow',
    name: S('Coude — extension (déficit)', 'Elbow — extension (deficit)'),
    plane: 'sagittal',
    view: 'side',
    scope: 'upper',
    sided: true,
    dir: -1,
    unit: '°',
    joints: ['sh', 'el', 'wr'],
    minTravel: 15,
    maxConf: 1,
    calc: CALC.elbowAngle,
    deficit: true,
    normal: { ref: 0, lo: 0, hi: 5, src: 'AAOS 0° (extension complète) ; hyperextension 0–10° possible' },
    pos: S(
      'Debout ou assis, bras légèrement en avant, coude plié.',
      'Standing or sitting, arm slightly forward, elbow bent.',
    ),
    how: S(
      'Tends le coude au maximum, comme pour pousser un objet loin devant toi, sans forcer. Tiens 2 secondes.',
      'Straighten the elbow as far as possible, like pushing something away, without forcing. Hold 2 seconds.',
    ),
    cam: S(
      'Téléphone à la hauteur de la poitrine, à 2 m, de profil, côté travaillé vers la caméra.',
      'Phone at chest height, 2 m away, side-on, tested side toward the camera.',
    ),
    note: S(
      'Rapporté comme déficit d’extension (0° = coude tendu, plus petit = mieux). L’hyperextension n’est pas détectée en 2D (valeur plancher à 0°).',
      'Reported as extension deficit (0° = straight elbow, lower is better). Hyperextension is not detected in 2D (floored at 0°).',
    ),
    sch: { fix: 90, from: -60, to: -90 },
  },
  wr_flex: {
    id: 'wr_flex',
    region: 'wrist',
    name: S('Poignet — flexion', 'Wrist — flexion'),
    plane: 'sagittal',
    view: 'side',
    scope: 'upper',
    sided: true,
    dir: 1,
    unit: '°',
    joints: ['el', 'wr'],
    minTravel: 20,
    maxConf: 0.9,
    calc: wrist(-1),
    needsHand: true,
    normal: { ref: 80, lo: 65, hi: 80, src: 'AAOS 0–80°, AMA 60°' },
    pos: S(
      'Assis à une table, avant-bras à plat, paume vers le bas, main qui dépasse du bord.',
      'Sitting at a table, forearm resting flat, palm down, hand beyond the edge.',
    ),
    how: S(
      'Laisse la main descendre puis fléchis le poignet vers le bas au maximum, doigts relâchés. Tiens 2 secondes. L’avant-bras reste posé.',
      'Let the hand drop then flex the wrist down as far as it goes, fingers relaxed. Hold 2 seconds. The forearm stays resting.',
    ),
    cam: S(
      'Téléphone posé à hauteur de la table, à 50–80 cm, de profil : on voit le coude, le poignet et la main de côté.',
      'Phone at table height, 50–80 cm away, side-on: elbow, wrist and hand seen from the side.',
    ),
    note: S(
      'Angle entre l’avant-bras (coude → poignet) et l’axe de la main (points de la main). La paume doit être vers le bas (sinon flexion et extension sont inversées). Précision limitée par la petite taille de la main : ± 8–10°.',
      'Angle between forearm (elbow → wrist) and hand axis (hand landmarks). Palm must face down (otherwise flexion and extension swap). Accuracy limited by the small hand size: ± 8–10°.',
    ),
    sch: { fix: 0, from: 0, to: 70 },
  },
  wr_ext: {
    id: 'wr_ext',
    region: 'wrist',
    name: S('Poignet — extension', 'Wrist — extension'),
    plane: 'sagittal',
    view: 'side',
    scope: 'upper',
    sided: true,
    dir: 1,
    unit: '°',
    joints: ['el', 'wr'],
    minTravel: 20,
    maxConf: 0.9,
    calc: wrist(1),
    needsHand: true,
    normal: { ref: 70, lo: 55, hi: 70, src: 'AAOS 0–70°, AMA 60°' },
    pos: S(
      'Assis à une table, avant-bras à plat, paume vers le bas, main qui dépasse du bord.',
      'Sitting at a table, forearm resting flat, palm down, hand beyond the edge.',
    ),
    how: S(
      'Relève la main vers le haut au maximum, comme pour dire « stop », doigts relâchés. Tiens 2 secondes. L’avant-bras reste posé.',
      'Lift the hand up as far as it goes, like a “stop” sign, fingers relaxed. Hold 2 seconds. The forearm stays resting.',
    ),
    cam: S(
      'Téléphone posé à hauteur de la table, à 50–80 cm, de profil : on voit le coude, le poignet et la main de côté.',
      'Phone at table height, 50–80 cm away, side-on: elbow, wrist and hand seen from the side.',
    ),
    note: S(
      'Même méthode que la flexion ; paume vers le bas obligatoire. Précision ± 8–10°.',
      'Same method as flexion; palm down required. Accuracy ± 8–10°.',
    ),
    sch: { fix: 0, from: 0, to: -65 },
  },
  hip_flex: {
    id: 'hip_flex',
    region: 'hip',
    name: S('Hanche — flexion (genou vers la poitrine)', 'Hip — flexion (knee to chest)'),
    plane: 'sagittal',
    view: 'side',
    scope: 'full',
    sided: true,
    dir: 1,
    unit: '°',
    joints: ['sh', 'hip', 'kn'],
    minTravel: 25,
    maxConf: 0.9,
    calc: CALC.hipFlex,
    normal: { ref: 120, lo: 100, hi: 125, src: 'AAOS 0–120°, AMA 100° (genou fléchi)' },
    pos: S(
      'Couché sur le dos, jambes allongées (ou debout appuyé au mur). L’autre jambe reste tendue et à plat.',
      'Lying on your back, legs straight (or standing against a wall). The other leg stays straight and flat.',
    ),
    how: S(
      'Ramène un genou vers la poitrine le plus loin possible, en laissant le genou se plier. Le bas du dos reste à plat. Tiens 2 secondes.',
      'Bring one knee toward your chest as far as it goes, letting the knee bend. Keep your lower back flat. Hold 2 seconds.',
    ),
    cam: S(
      'Téléphone au sol ou sur un support à 2 m, côté travaillé face à la caméra, du tronc aux pieds visibles.',
      'Phone on the floor or a stand 2 m away, the tested side toward the camera, trunk to feet visible.',
    ),
    note: S(
      'Angle tronc–cuisse. La bascule du bassin et la flexion lombaire ajoutent des degrés (la valeur surestime la hanche si le dos se décolle). Précision ± 8°.',
      'Trunk–thigh angle. Pelvic tilt and lumbar flexion add degrees (the value overestimates the hip if the back lifts). Accuracy ± 8°.',
    ),
    sch: { fix: 180, from: 180, to: 60 },
  },
  kn_flex: {
    id: 'kn_flex',
    region: 'knee',
    name: S('Genou — flexion', 'Knee — flexion'),
    plane: 'sagittal',
    view: 'side',
    scope: 'full',
    sided: true,
    dir: 1,
    unit: '°',
    joints: ['hip', 'kn', 'an'],
    minTravel: 25,
    maxConf: 1,
    calc: CALC.kneeAngle,
    normal: { ref: 135, lo: 125, hi: 145, src: 'AAOS 0–135°, AMA 140°' },
    pos: S(
      'Assis au bord d’une chaise ou couché sur le dos, jambe détendue.',
      'Sitting on the edge of a chair or lying on your back, leg relaxed.',
    ),
    how: S(
      'Plie le genou au maximum en ramenant le talon vers la fesse (le pied peut glisser). Tiens 2 secondes.',
      'Bend the knee as far as it goes, bringing the heel toward the buttock (the foot may slide). Hold 2 seconds.',
    ),
    cam: S(
      'Téléphone à la hauteur du genou, à 2 m, de profil, hanche, genou et cheville visibles.',
      'Phone at knee height, 2 m away, side-on, hip, knee and ankle visible.',
    ),
    note: S(
      'Angle hanche–genou–cheville. 0° = jambe tendue. Précision ± 5°.',
      'Hip–knee–ankle angle. 0° = straight leg. Accuracy ± 5°.',
    ),
    sch: { fix: 90, from: 90, to: 230 },
  },
  kn_ext: {
    id: 'kn_ext',
    region: 'knee',
    name: S('Genou — extension (déficit)', 'Knee — extension (deficit)'),
    plane: 'sagittal',
    view: 'side',
    scope: 'full',
    sided: true,
    dir: -1,
    unit: '°',
    joints: ['hip', 'kn', 'an'],
    minTravel: 15,
    maxConf: 1,
    calc: CALC.kneeAngle,
    deficit: true,
    normal: { ref: 0, lo: 0, hi: 5, src: 'AAOS 0° (extension complète) ; hyperextension 0–10° possible' },
    pos: S(
      'Assis sur une chaise, dos droit, genou plié à 90° ; ou couché sur le dos.',
      'Sitting on a chair, back straight, knee bent to 90°; or lying on your back.',
    ),
    how: S(
      'Tends le genou au maximum en levant le pied, quadriceps contracté. Tiens 2 secondes.',
      'Straighten the knee as far as it goes by lifting the foot, quadriceps tight. Hold 2 seconds.',
    ),
    cam: S(
      'Téléphone à la hauteur du genou, à 2 m, de profil, hanche, genou et cheville visibles.',
      'Phone at knee height, 2 m away, side-on, hip, knee and ankle visible.',
    ),
    note: S(
      'Rapporté comme déficit d’extension (0° = jambe tendue, plus petit = mieux). Hyperextension non détectée en 2D.',
      'Reported as extension deficit (0° = straight leg, lower is better). Hyperextension not detected in 2D.',
    ),
    sch: { fix: 90, from: 150, to: 180 },
  },
  an_df: {
    id: 'an_df',
    region: 'ankle',
    name: S('Cheville — dorsiflexion (fente genou au mur)', 'Ankle — dorsiflexion (knee-to-wall lunge)'),
    plane: 'sagittal',
    view: 'side',
    scope: 'full',
    sided: true,
    dir: 1,
    unit: '°',
    joints: ['kn', 'an', 'heel', 'ft'],
    minTravel: 12,
    maxConf: 0.9,
    calc: CALC.ankleLunge,
    normal: {
      ref: 40,
      lo: 35,
      hi: 45,
      src: 'Test de fente en charge (Bennell 1998 ; Konor 2012) ≈ 35–45° d’inclinaison du tibia. ≠ AAOS 20° sans charge.',
    },
    pos: S(
      'Debout face à un mur, le pied testé en avant, orteils vers le mur (≈ 10 cm au début), l’autre jambe en arrière.',
      'Standing facing a wall, tested foot forward, toes toward the wall (≈ 10 cm at first), other leg behind.',
    ),
    how: S(
      'Fléchis le genou vers le mur sans décoller le talon, le plus loin possible. Tiens 2 secondes. Si le genou touche le mur facilement, recule le pied.',
      'Bend the knee toward the wall without lifting the heel, as far as possible. Hold 2 seconds. If the knee touches the wall easily, move the foot back.',
    ),
    cam: S(
      'Téléphone à hauteur de la jambe, à 2 m, de profil, côté travaillé vers la caméra ; le genou, la cheville et le pied sont visibles.',
      'Phone at leg height, 2 m away, side-on, tested side toward the camera; knee, ankle and foot visible.',
    ),
    note: S(
      'Inclinaison du tibia par rapport à la verticale, en charge. Le talon doit rester au sol (un talon qui se décolle gonfle la valeur). Mesure différente de la dorsiflexion au goniomètre sans charge.',
      'Tibia inclination from vertical, weight-bearing. The heel must stay down (a lifting heel inflates the value). A different measure from non-weight-bearing goniometric dorsiflexion.',
    ),
    sch: { fix: -90, from: -90, to: -50 },
  },
  cerv_rot: {
    id: 'cerv_rot',
    region: 'cervical',
    name: S('Rotation cervicale', 'Cervical rotation'),
    plane: 'transverse',
    view: 'front',
    scope: 'upper',
    sided: true,
    dir: 1,
    unit: '°',
    joints: ['nose', 'ear'],
    both: ['sh'],
    minTravel: 20,
    maxConf: 0.7,
    calc: cerv,
    lowConfidence: true,
    normal: { ref: 80, lo: 70, hi: 90, src: 'AAOS 0–80° de chaque côté, AMA 80°' },
    pos: S(
      'Assis ou debout, dos droit, épaules relâchées et de face, regard devant toi.',
      'Sitting or standing, back straight, shoulders relaxed and square, looking ahead.',
    ),
    how: S(
      'Tourne la tête du côté demandé le plus loin possible sans douleur importante, sans tourner les épaules ni le tronc. Tiens 2 secondes.',
      'Turn your head to the requested side as far as you comfortably can, without turning shoulders or trunk. Hold 2 seconds.',
    ),
    cam: S(
      'Téléphone à la hauteur du visage, à 1,5 m, de face, la tête et les deux épaules visibles.',
      'Phone at face height, 1.5 m away, facing you, head and both shoulders visible.',
    ),
    note: S(
      'Mesure prudente, confiance plafonnée à 70 % : le lacet de la tête est déduit du décalage du nez par rapport aux oreilles (2D) et de la profondeur 3D. Au-delà de ~60° l’oreille se cache. Les épaules qui tournent faussent la mesure. Précision ± 10–15°.',
      'Conservative measure, confidence capped at 70%: head yaw is inferred from the nose offset against the ears (2D) and 3D depth. Beyond ~60° the ear disappears. Rotating shoulders distort the measure. Accuracy ± 10–15°.',
    ),
    sch: { fix: -90, from: -90, to: -170 },
  },
  lumb_flex: {
    id: 'lumb_flex',
    region: 'lumbar',
    name: S('Flexion lombaire (doigts–sol)', 'Lumbar flexion (fingertips–floor)'),
    plane: 'sagittal',
    view: 'side',
    scope: 'full',
    sided: false,
    dir: -1,
    unit: '%',
    unitLabel: S('% de la longueur de jambe', '% of leg length'),
    optional: true,
    joints: ['hip', 'an', 'idx'],
    minTravel: 15,
    maxConf: 0.8,
    calc: CALC.lumbarFloor,
    deficit: true,
    ratio: true,
    normal: {
      ref: 0,
      lo: 0,
      hi: 10,
      src: 'Indicatif : bout des doigts au sol ou presque chez l’adulte sans raideur (grande variabilité, surtout avec des ischio-jambiers courts)',
    },
    pos: S(
      'Debout, pieds à la largeur des hanches, genoux tendus, bras relâchés.',
      'Standing, feet hip-width apart, knees straight, arms relaxed.',
    ),
    how: S(
      'Penche-toi lentement vers l’avant en glissant les mains vers le sol, genoux tendus, le plus bas possible. Tiens 2 secondes.',
      'Slowly bend forward sliding your hands toward the floor, knees straight, as low as you can. Hold 2 seconds.',
    ),
    cam: S(
      'Téléphone à la hauteur de la taille, à 2,5 m, de profil, le corps entier (mains et pieds) dans l’image.',
      'Phone at waist height, 2.5 m away, side-on, whole body (hands and feet) in frame.',
    ),
    note: S(
      'Distance doigts–sol en % de la longueur de jambe (0 % = doigts au sol) : mesure indirecte qui mélange la hanche et le dos, pas un angle lombaire. Sert à suivre l’évolution d’une même personne.',
      'Fingertip-to-floor distance as % of leg length (0% = fingers on the floor): an indirect measure mixing hip and spine, not a lumbar angle. Use it to follow the same person over time.',
    ),
    sch: { fix: 90, from: 90, to: 10 },
  },
} as const satisfies Readonly<Record<string, RomTest<RomCalc>>>;

// ---------- Position de départ guidée ----------
// Pour chaque test : partie du corps nommée (gros libellé « Bras DROIT » ; g = genre grammatical m / f), mode d'orientation
//   'near'    : vue de profil, le côté testé doit être tourné vers le téléphone ;
//   'front'   : vue de face (le côté testé s'affiche à droite ou à gauche de l'écran selon le miroir) ;
//   'dir'     : vue de face, le côté = sens de rotation de la tête ;
//   'profile' : vue de profil, sans côté.
// lo / hi : plage acceptée pour la valeur du test (mêmes unités que deg) à la position de départ ; fixed : segment censé rester immobile
// (deux points, « sh » = épaule du côté testé, « sh.L » = point explicite) ; lying : couché (le côté tourné vers la caméra ne se déduit pas de la tête).
// instr : consigne de départ (dite et affichée) ; go : consigne du mouvement (dite après « Bien. Maintenant, … »). {side} → « droite » / « gauche ».
export const START = {
  sh_flex: {
    part: ['arm', 'm'],
    mode: 'near',
    lo: -20,
    hi: 22,
    fixed: ['sh', 'hip'],
    instr: S(
      'Debout, dos droit, bras le long du corps, paume vers la cuisse.',
      'Stand tall, arm at your side, palm toward your thigh.',
    ),
    go: S(
      'lève le bras tendu vers l’avant et vers le haut, doucement, aussi haut que c’est confortable, puis tiens 2 secondes.',
      'raise your straight arm forward and up slowly, as high as is comfortable, then hold 2 seconds.',
    ),
  },
  sh_abd: {
    part: ['arm', 'm'],
    mode: 'front',
    lo: -10,
    hi: 25,
    fixed: ['sh', 'hip'],
    instr: S(
      'Debout face au téléphone, dos droit, bras le long du corps, paume vers la cuisse.',
      'Stand facing the phone, back straight, arm at your side, palm toward your thigh.',
    ),
    go: S(
      'lève le bras tendu sur le côté, doucement, aussi haut que c’est confortable, puis tiens 2 secondes.',
      'raise your straight arm out to the side slowly, as high as is comfortable, then hold 2 seconds.',
    ),
  },
  sh_er: {
    part: ['arm', 'm'],
    mode: 'front',
    lo: -25,
    hi: 25,
    fixed: ['sh', 'el'],
    instr: S(
      'Face au téléphone, coude collé au corps plié à 90°, avant-bras vers l’avant, pouce vers le haut.',
      'Facing the phone, elbow tucked in and bent to 90°, forearm pointing forward, thumb up.',
    ),
    go: S(
      'garde le coude collé et ouvre l’avant-bras vers l’extérieur, comme une porte, puis tiens 2 secondes.',
      'keep the elbow tucked and swing the forearm outward like a door, then hold 2 seconds.',
    ),
  },
  el_flex: {
    part: ['elbow', 'm'],
    mode: 'near',
    lo: -10,
    hi: 22,
    fixed: ['sh', 'hip'],
    instr: S(
      'Debout ou assis, dos droit, bras le long du corps, coude tendu, paume vers l’avant.',
      'Stand or sit tall, arm at your side, elbow straight, palm forward.',
    ),
    go: S(
      'plie le coude en amenant la main vers l’épaule, sans lever l’épaule, puis tiens 2 secondes.',
      'bend the elbow bringing your hand toward your shoulder, without lifting the shoulder, then hold 2 seconds.',
    ),
  },
  el_ext: {
    part: ['elbow', 'm'],
    mode: 'near',
    lo: 35,
    hi: 130,
    fixed: ['sh', 'hip'],
    instr: S(
      'Debout ou assis, dos droit, bras un peu en avant, coude plié.',
      'Stand or sit tall, arm slightly forward, elbow bent.',
    ),
    go: S(
      'tends le coude au maximum, comme pour pousser quelque chose devant toi, sans forcer, puis tiens 2 secondes.',
      'straighten the elbow as far as it goes, as if pushing something away, without forcing, then hold 2 seconds.',
    ),
  },
  wr_flex: {
    part: ['wrist', 'm'],
    mode: 'near',
    lo: -22,
    hi: 22,
    fixed: ['el', 'wr'],
    instr: S(
      'Assis à la table, avant-bras à plat, paume vers le bas, main dans le vide au bord de la table, poignet droit.',
      'Sit at the table, forearm flat, palm down, hand hanging past the edge, wrist straight.',
    ),
    go: S(
      'laisse la main descendre et plie le poignet vers le bas, doigts relâchés, l’avant-bras reste posé, puis tiens 2 secondes.',
      'let the hand drop and bend the wrist down, fingers relaxed, forearm staying on the table, then hold 2 seconds.',
    ),
  },
  wr_ext: {
    part: ['wrist', 'm'],
    mode: 'near',
    lo: -22,
    hi: 22,
    fixed: ['el', 'wr'],
    instr: S(
      'Assis à la table, avant-bras à plat, paume vers le bas, main dans le vide au bord de la table, poignet droit.',
      'Sit at the table, forearm flat, palm down, hand hanging past the edge, wrist straight.',
    ),
    go: S(
      'relève la main vers le haut, comme pour dire stop, l’avant-bras reste posé, puis tiens 2 secondes.',
      'lift the hand up like a stop sign, forearm staying on the table, then hold 2 seconds.',
    ),
  },
  hip_flex: {
    part: ['hip', 'f'],
    mode: 'near',
    lying: true,
    lo: -15,
    hi: 30,
    fixed: ['sh', 'hip'],
    instr: S(
      'Couché sur le dos, jambes allongées, l’autre jambe tendue et à plat, bas du dos au sol.',
      'Lie on your back, legs straight, the other leg flat and straight, lower back on the floor.',
    ),
    go: S(
      'ramène le genou vers la poitrine, le bas du dos reste à plat, puis tiens 2 secondes.',
      'bring the knee toward your chest, keeping your lower back flat, then hold 2 seconds.',
    ),
  },
  kn_flex: {
    part: ['knee', 'm'],
    mode: 'near',
    lo: -12,
    hi: 100,
    fixed: ['sh', 'hip'],
    instr: S(
      'Assis au bord d’une chaise, dos droit, ou couché sur le dos, jambe détendue, cheville visible.',
      'Sit on the edge of a chair, back straight, or lie on your back, leg relaxed, ankle visible.',
    ),
    go: S(
      'plie le genou en ramenant le talon vers la fesse, puis tiens 2 secondes.',
      'bend the knee bringing your heel toward your buttock, then hold 2 seconds.',
    ),
  },
  kn_ext: {
    part: ['knee', 'm'],
    mode: 'near',
    lo: 45,
    hi: 120,
    fixed: ['sh', 'hip'],
    instr: S(
      'Assis sur une chaise, dos droit, genou plié à 90°, pied au sol.',
      'Sit on a chair, back straight, knee bent to 90°, foot on the floor.',
    ),
    go: S(
      'tends le genou en levant le pied, cuisse contractée, puis tiens 2 secondes.',
      'straighten the knee by lifting your foot, thigh tight, then hold 2 seconds.',
    ),
  },
  an_df: {
    part: ['ankle', 'f'],
    mode: 'near',
    lo: -8,
    hi: 22,
    fixed: ['heel', 'ft'],
    instr: S(
      'Debout face à un mur, pied testé en avant, orteils à environ 10 cm du mur, talon au sol, genou tendu.',
      'Stand facing a wall, tested foot forward, toes about 10 cm from the wall, heel down, knee straight.',
    ),
    go: S(
      'plie le genou vers le mur sans décoller le talon, puis tiens 2 secondes.',
      'bend the knee toward the wall without lifting the heel, then hold 2 seconds.',
    ),
  },
  cerv_rot: {
    part: ['head', 'f'],
    mode: 'dir',
    lo: -16,
    hi: 16,
    fixed: ['sh.L', 'sh.R'],
    instr: S(
      'Assis ou debout, dos droit, épaules relâchées et de face, regard droit devant.',
      'Sit or stand tall, shoulders relaxed and square, looking straight ahead.',
    ),
    go: S(
      'tourne lentement la tête vers ta {side}, sans tourner les épaules, aussi loin que c’est confortable, puis tiens 2 secondes.',
      'slowly turn your head to your {side}, without turning your shoulders, as far as is comfortable, then hold 2 seconds.',
    ),
  },
  lumb_flex: {
    part: null,
    mode: 'profile',
    lo: 12,
    hi: 85,
    fixed: ['hip', 'an'],
    instr: S(
      'Debout de profil, pieds à la largeur des hanches, genoux tendus, bras relâchés, corps entier visible.',
      'Stand side-on, feet hip-width apart, knees straight, arms relaxed, whole body visible.',
    ),
    go: S(
      'penche-toi lentement vers l’avant en glissant les mains vers le sol, genoux tendus, puis tiens 2 secondes.',
      'slowly bend forward sliding your hands toward the floor, knees straight, then hold 2 seconds.',
    ),
  },
} as const satisfies Readonly<Record<keyof typeof TESTS_BASE, RomStart>>;

/** Catalogue des tests d'amplitude (chaque test porte aussi son aide au placement `start`). */
export const TESTS: Readonly<Record<string, RomTest<RomCalc>>> = Object.fromEntries(
  Object.entries(TESTS_BASE).map(([id, t]) => [id, { ...t, start: START[id as keyof typeof START] }]),
);

export const TEST_IDS: string[] = Object.keys(TESTS);
export const getTest = (id: string): RomTest<RomCalc> | null => TESTS[id] || null;
/** Côtés mesurables d'un test : ['L','R'] ou [null] (test sans côté). */
export const sidesOf = (id: string): (string | null)[] => (TESTS[id]?.sided ? ['L', 'R'] : [null]);
/** Indices MediaPipe Pose utilisés (pour la visibilité) pour un test et un côté. */
export function jointIdx(test: string | RomTest<RomCalc> | null | undefined, side?: string | null): number[] {
  const T = typeof test === 'string' ? TESTS[test] : test;
  if (!T) return [];
  const s = (side || 'L') as 'L' | 'R',
    out: number[] = [];
  const lm: Readonly<Record<string, number | { readonly L: number; readonly R: number } | undefined>> = LM;
  for (const j of T.joints) {
    const v = lm[j];
    if (typeof v === 'number') out.push(v);
    else if (v) out.push(v[s]);
  }
  for (const j of T.both || []) {
    const v = lm[j];
    if (v && typeof v === 'object') out.push(v.L, v.R);
  }
  return out;
}
/** Calcule le test sur une image ; null si impossible. */
export function measure(testId: string, f: RomFrame, side?: string | null): RomResult | null {
  const T = TESTS[testId];
  if (!T) return null;
  const r = T.calc(f, (side || 'L') as 'L' | 'R');
  return r && Number.isFinite(r.deg) ? r : null;
}
/** Ensembles suggérés au clinicien d'après la pathologie / la région. Chaque entrée : [test, côtés]. */
export const SUGGESTED = {
  frozen: [
    ['sh_flex', 'LR'],
    ['sh_abd', 'LR'],
    ['sh_er', 'LR'],
  ],
  sub_acromial: [
    ['sh_flex', 'LR'],
    ['sh_abd', 'LR'],
  ],
  cuff_tear: [
    ['sh_flex', 'LR'],
    ['sh_abd', 'LR'],
    ['sh_er', 'LR'],
  ],
  gh_instab: [
    ['sh_flex', 'LR'],
    ['sh_abd', 'LR'],
    ['sh_er', 'LR'],
  ],
  gh_oa: [
    ['sh_flex', 'LR'],
    ['sh_abd', 'LR'],
    ['sh_er', 'LR'],
  ],
  elbow_stiff: [
    ['el_flex', 'LR'],
    ['el_ext', 'LR'],
  ],
  wrist_stiff: [
    ['wr_flex', 'LR'],
    ['wr_ext', 'LR'],
  ],
  hip_oa: [['hip_flex', 'LR']],
  knee_oa: [
    ['kn_flex', 'LR'],
    ['kn_ext', 'LR'],
  ],
  knee_sprain: [
    ['kn_flex', 'LR'],
    ['kn_ext', 'LR'],
  ],
  ankle_stiff: [['an_df', 'LR']],
  ankle_sprain: [['an_df', 'LR']],
  neck_mech: [['cerv_rot', 'LR']],
  wad: [['cerv_rot', 'LR']],
  cerv_radic: [['cerv_rot', 'LR']],
  lbp_chronic: [['lumb_flex', '']],
  stenosis: [['lumb_flex', '']],
} as const satisfies Readonly<Record<string, RomSuggestion>>;
export const SUGGESTED_REGION = {
  shoulder: [
    ['sh_flex', 'LR'],
    ['sh_abd', 'LR'],
  ],
  elbow: [
    ['el_flex', 'LR'],
    ['el_ext', 'LR'],
  ],
  wrist: [
    ['wr_flex', 'LR'],
    ['wr_ext', 'LR'],
  ],
  hip: [['hip_flex', 'LR']],
  knee: [
    ['kn_flex', 'LR'],
    ['kn_ext', 'LR'],
  ],
  ankle: [['an_df', 'LR']],
  cervical: [['cerv_rot', 'LR']],
  lumbar: [['lumb_flex', '']],
} as const satisfies Readonly<Record<string, RomSuggestion>>;

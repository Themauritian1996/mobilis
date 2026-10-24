// Triage en langage simple : noms compréhensibles, reconnaissance d'un diagnostic écrit, questions par région.
const S = (fr, en) => ({ fr, en });

// Nom simple (affiché au patient) + mots-clés pour reconnaître un diagnostic écrit librement
export const LAY = {
  neck_mech: { name: S('Douleur et raideur au cou', 'Neck pain and stiffness'), kw: ['cou', 'nuque', 'cervical', 'cervicalgie', 'torticolis', 'neck', 'stiff neck', 'posture'] },
  cerv_radic: { name: S('Douleur au cou qui descend dans le bras', 'Neck pain spreading down the arm'), kw: ['radiculopathie cervicale', 'nerf coince cou', 'nevralgie cervico', 'cervicobrachial', 'hernie cervicale', 'pinched nerve neck', 'cervical radiculopathy', 'bras engourdi'] },
  cervicogenic_ha: { name: S('Maux de tête qui partent du cou', 'Headaches that start in the neck'), kw: ['cephalee', 'mal de tete', 'migraine cou', 'cervicogenique', 'headache', 'cervicogenic'] },
  wad: { name: S('Douleur au cou après un accident (coup du lapin)', 'Neck pain after an accident (whiplash)'), kw: ['coup du lapin', 'whiplash', 'accident auto', 'entorse cervicale', 'car accident'] },
  thor_mech: { name: S('Douleur au milieu du dos ou dos voûté', 'Mid-back pain or rounded back'), kw: ['dorsal', 'dorsalgie', 'milieu du dos', 'omoplate', 'thoracique', 'mid back', 'upper back', 'dos vouté', 'dos voute'] },
  osteo_kyph: { name: S('Dos voûté avec ostéoporose', 'Rounded back with osteoporosis'), kw: ['osteoporose', 'cyphose', 'fracture vertebre', 'tassement', 'osteoporosis', 'kyphosis'] },
  sub_acromial: { name: S('Douleur à l’épaule en levant le bras', 'Shoulder pain when lifting the arm'), kw: ['coiffe', 'tendinite epaule', 'tendinopathie epaule', 'accrochage', 'sous acromial', 'bursite epaule', 'impingement', 'rotator cuff', 'shoulder tendinitis', 'supra epineux', 'supraspinatus'] },
  frozen: { name: S('Épaule gelée (très raide)', 'Frozen shoulder (very stiff)'), kw: ['capsulite', 'epaule gelee', 'epaule bloquee', 'frozen', 'adhesive'] },
  cuff_tear: { name: S('Épaule faible pour lever le bras (tendon usé ou déchiré)', 'Weak shoulder lifting the arm (worn or torn tendon)'), kw: ['dechirure coiffe', 'rupture coiffe', 'tendon dechire epaule', 'cuff tear', 'torn rotator'] },
  gh_instab: { name: S('Épaule qui se déboîte ou semble instable', 'Shoulder that slips out or feels loose'), kw: ['luxation epaule', 'epaule debotee', 'deboite', 'instabilite epaule', 'subluxation', 'dislocation', 'unstable shoulder'] },
  gh_oa: { name: S('Usure de l’épaule (arthrose)', 'Worn shoulder joint (arthritis)'), kw: ['arthrose epaule', 'shoulder arthritis', 'omarthrose'] },
  lat_epi: { name: S('Douleur à l’extérieur du coude', 'Pain on the outside of the elbow'), kw: ['tennis elbow', 'epicondylite', 'epicondylalgie laterale', 'coude tennis', 'lateral epicondyl'] },
  med_epi: { name: S('Douleur à l’intérieur du coude', 'Pain on the inside of the elbow'), kw: ['golfeur', 'golfer', 'epitrochleite', 'epicondylite medial', 'medial epicondyl'] },
  distal_biceps: { name: S('Douleur à l’avant du coude', 'Pain at the front of the elbow'), kw: ['biceps coude', 'tendon biceps distal', 'distal biceps'] },
  elbow_stiff: { name: S('Coude raide après une fracture ou un plâtre', 'Stiff elbow after a fracture or cast'), kw: ['fracture coude', 'coude raide', 'platre coude', 'stiff elbow', 'elbow fracture'] },
  cts: { name: S('Doigts engourdis, surtout la nuit', 'Numb fingers, especially at night'), kw: ['canal carpien', 'tunnel carpien', 'engourdissement doigts', 'carpal tunnel', 'nerf median', 'fourmillements main'] },
  dequervain: { name: S('Douleur au poignet du côté du pouce', 'Wrist pain on the thumb side'), kw: ['de quervain', 'dequervain', 'tendinite pouce', 'tenosynovite', 'pouce poignet'] },
  cmc_oa: { name: S('Usure à la base du pouce', 'Worn joint at the base of the thumb'), kw: ['rhizarthrose', 'arthrose pouce', 'base du pouce', 'thumb arthritis'] },
  wrist_stiff: { name: S('Poignet raide après une fracture', 'Stiff wrist after a fracture'), kw: ['fracture poignet', 'fracture radius', 'poignet raide', 'pouteau colles', 'wrist fracture'] },
  lbp_chronic: { name: S('Mal au bas du dos qui dure', 'Long-lasting low back pain'), kw: ['lombalgie', 'mal de dos', 'bas du dos', 'lumbago', 'tour de rein', 'low back', 'back pain', 'discopathie'] },
  lumb_radic: { name: S('Mal de dos qui descend dans la jambe', 'Back pain spreading down the leg'), kw: ['sciatique', 'sciatalgie', 'hernie discale', 'nerf sciatique', 'cruralgie', 'radiculopathie lombaire', 'sciatica', 'herniated disc'] },
  stenosis: { name: S('Jambes douloureuses en marchant, mieux assis', 'Legs hurt when walking, better sitting'), kw: ['stenose', 'canal lombaire etroit', 'claudication', 'spinal stenosis'] },
  si_joint: { name: S('Douleur à la fesse ou au bassin', 'Pain in the buttock or pelvis'), kw: ['sacro iliaque', 'sacroiliaque', 'bassin', 'fesse', 'ceinture pelvienne', 'pelvic', 'si joint'] },
  spondylolisthesis: { name: S('Vertèbre qui glisse (vue à la radiographie)', 'Slipped vertebra (seen on X-ray)'), kw: ['spondylolisthesis', 'spondylolyse', 'vertebre qui glisse', 'listhesis'] },
  hip_oa: { name: S('Usure de la hanche (raideur, douleur à l’aine)', 'Worn hip (stiffness, groin pain)'), kw: ['arthrose hanche', 'coxarthrose', 'hip arthritis', 'hip osteoarthritis'] },
  gtps: { name: S('Douleur sur le côté de la hanche', 'Pain on the side of the hip'), kw: ['bursite', 'trochanter', 'tendinite fessier', 'tendinopathie glute', 'gluteal', 'trochanteric', 'cote de la hanche'] },
  fai: { name: S('Douleur à l’aine en pliant la hanche', 'Groin pain when bending the hip'), kw: ['conflit femoro', 'impingement hanche', 'fai', 'labrum', 'aine'] },
  prox_hams: { name: S('Douleur sous la fesse en position assise', 'Pain under the buttock when sitting'), kw: ['ischio', 'ischiojambier', 'hamstring', 'tendinopathie ischio'] },
  knee_oa: { name: S('Usure du genou (raideur, gonflement)', 'Worn knee (stiffness, swelling)'), kw: ['arthrose genou', 'gonarthrose', 'knee arthritis', 'knee osteoarthritis', 'menisque degeneratif'] },
  pfps: { name: S('Douleur à l’avant du genou (escaliers, accroupi)', 'Front-of-knee pain (stairs, squatting)'), kw: ['pfps', 'sfp', 'femoro patellaire', 'rotule', 'syndrome rotulien', 'patellofemoral', 'chondromalacie', 'runner knee'] },
  patellar_tendon: { name: S('Douleur juste sous la rotule (sauts)', 'Pain just below the kneecap (jumping)'), kw: ['tendon rotulien', 'tendinite rotulienne', 'jumper', 'patellar tendon', 'tendinopathie rotulienne'] },
  itbs: { name: S('Douleur à l’extérieur du genou en courant', 'Outer knee pain when running'), kw: ['bandelette', 'tfl', 'it band', 'iliotibial', 'essuie glace'] },
  knee_sprain: { name: S('Genou instable après une torsion', 'Unstable knee after a twist'), kw: ['entorse genou', 'ligament croise', 'lca', 'acl', 'ligament genou', 'menisque'] },
  ankle_sprain: { name: S('Cheville qui tourne (entorse)', 'Rolled ankle (sprain)'), kw: ['entorse cheville', 'cheville tournee', 'foulure', 'ankle sprain', 'instabilite cheville'] },
  achilles: { name: S('Douleur au tendon derrière le talon', 'Pain in the tendon behind the heel'), kw: ['achille', 'achilles', 'tendon d achille', 'tendinite achille'] },
  tib_post: { name: S('Pied qui s’affaisse, douleur à l’intérieur de la cheville', 'Flattening foot, pain inside the ankle'), kw: ['tibial posterieur', 'pied plat', 'affaissement', 'posterior tibial', 'flat foot'] },
  ankle_stiff: { name: S('Cheville raide après une fracture', 'Stiff ankle after a fracture'), kw: ['fracture cheville', 'cheville raide', 'ankle fracture', 'malleole'] },
  plantar_fasc: { name: S('Douleur sous le talon aux premiers pas', 'Pain under the heel on first steps'), kw: ['fasciite', 'fasciopathie', 'aponevrosite', 'epine de lenoir', 'plantar', 'talon', 'heel spur'] },
  hallux: { name: S('Douleur au gros orteil (oignon ou raideur)', 'Big-toe pain (bunion or stiffness)'), kw: ['hallux', 'oignon', 'gros orteil', 'bunion', 'big toe'] },
  metatarsalgia: { name: S('Douleur sous l’avant du pied', 'Pain under the ball of the foot'), kw: ['metatarsalgie', 'avant pied', 'morton', 'metatarsal', 'ball of foot'] },
};

// Questions simples par région : chaque réponse donne des points aux problèmes possibles
const Q = (fr, en, opts) => ({ q: S(fr, en), opts });
const O = (fr, en, s = {}) => ({ t: S(fr, en), s });
const DK = O('Je ne sais pas / aucun', 'Not sure / none');

export const QUESTIONS = {
  cervical: [
    Q('Où est la douleur surtout ?', 'Where is the pain mostly?', [
      O('Seulement au cou ou aux épaules', 'Only the neck or shoulders', { neck_mech: 2, wad: 1 }),
      O('Elle descend dans le bras ou la main', 'It travels down the arm or hand', { cerv_radic: 3 }),
      O('Elle monte à l’arrière de la tête', 'It goes up to the back of the head', { cervicogenic_ha: 3 }), DK]),
    Q('Est-ce que ça a commencé après un accident ?', 'Did it start after an accident?', [
      O('Oui, accident de voiture ou chute', 'Yes, car accident or fall', { wad: 3 }), O('Non', 'No', { neck_mech: 1 })]),
    Q('As-tu des engourdissements ou picotements dans les doigts ?', 'Any numbness or tingling in the fingers?', [
      O('Oui', 'Yes', { cerv_radic: 2 }), O('Non', 'No', { neck_mech: 1, cervicogenic_ha: 1 })]),
  ],
  thoracic: [
    Q('Qu’est-ce qui te décrit le mieux ?', 'What fits you best?', [
      O('Douleur entre les omoplates, pire assis longtemps', 'Pain between the shoulder blades, worse after sitting', { thor_mech: 3 }),
      O('On m’a dit que j’ai de l’ostéoporose ou une vertèbre tassée', 'I was told I have osteoporosis or a compressed vertebra', { osteo_kyph: 4 }), DK]),
  ],
  shoulder: [
    Q('Quand as-tu le plus mal ?', 'When does it hurt most?', [
      O('En levant le bras sur le côté ou au-dessus de la tête', 'Lifting the arm to the side or overhead', { sub_acromial: 3, cuff_tear: 1 }),
      O('Presque tout le temps, et l’épaule est très raide', 'Almost all the time, and the shoulder is very stiff', { frozen: 3, gh_oa: 1 }),
      O('Quand le bras est en arrière ou loin du corps, j’ai peur qu’elle sorte', 'With the arm back or away from the body, I fear it will slip out', { gh_instab: 4 }), DK]),
    Q('Si quelqu’un lève ton bras pour toi, ça monte bien ?', 'If someone lifts your arm for you, does it go up well?', [
      O('Oui, mais c’est moi qui n’arrive pas à le lever', 'Yes, but I can’t lift it myself', { cuff_tear: 3, sub_acromial: 1 }),
      O('Non, c’est bloqué même aidé', 'No, it’s blocked even with help', { frozen: 3, gh_oa: 2 }),
      O('Oui, ça monte bien', 'Yes, it goes up fine', { sub_acromial: 1, gh_instab: 1 }), DK]),
    Q('As-tu des craquements et une raideur depuis des années ?', 'Grinding and stiffness for years?', [
      O('Oui', 'Yes', { gh_oa: 3 }), O('Non', 'No', { sub_acromial: 1 })]),
    Q('As-tu déjà eu l’épaule déboîtée ?', 'Has your shoulder ever dislocated?', [
      O('Oui', 'Yes', { gh_instab: 4 }), O('Non', 'No')]),
  ],
  elbow: [
    Q('Où est la douleur ?', 'Where is the pain?', [
      O('À l’extérieur du coude', 'Outside of the elbow', { lat_epi: 4 }),
      O('À l’intérieur du coude', 'Inside of the elbow', { med_epi: 4 }),
      O('À l’avant du coude (pli)', 'Front of the elbow (crease)', { distal_biceps: 4 }),
      O('Tout le coude est raide après une fracture ou un plâtre', 'The whole elbow is stiff after a fracture or cast', { elbow_stiff: 5 })]),
    Q('Qu’est-ce qui réveille la douleur ?', 'What triggers it?', [
      O('Serrer, tenir une tasse, la souris', 'Gripping, holding a cup, the mouse', { lat_epi: 2 }),
      O('Plier le poignet vers soi, lancer', 'Bending the wrist toward me, throwing', { med_epi: 2 }),
      O('Porter des charges, tourner une poignée', 'Carrying loads, turning a handle', { distal_biceps: 2 }), DK]),
  ],
  wrist: [
    Q('Qu’est-ce qui te décrit le mieux ?', 'What fits you best?', [
      O('Doigts engourdis (pouce à majeur), surtout la nuit', 'Numb fingers (thumb to middle), especially at night', { cts: 5 }),
      O('Douleur au poignet côté pouce en le tournant ou en portant', 'Thumb-side wrist pain when turning or lifting', { dequervain: 4 }),
      O('Douleur à la base du pouce en pinçant ou en ouvrant un pot', 'Pain at the base of the thumb when pinching or opening a jar', { cmc_oa: 4 }),
      O('Poignet raide après une fracture ou un plâtre', 'Stiff wrist after a fracture or cast', { wrist_stiff: 5 })]),
  ],
  lumbar: [
    Q('Où va la douleur ?', 'Where does the pain go?', [
      O('Elle reste dans le bas du dos', 'It stays in the low back', { lbp_chronic: 3 }),
      O('Elle descend dans une jambe, sous le genou', 'It goes down one leg, below the knee', { lumb_radic: 4 }),
      O('Elle est surtout dans une fesse ou le bassin', 'Mostly in a buttock or the pelvis', { si_joint: 3 }), DK]),
    Q('En marchant longtemps…', 'When walking a long time…', [
      O('Mes jambes deviennent lourdes, ça va mieux si je m’assois ou me penche', 'My legs get heavy, better if I sit or lean forward', { stenosis: 5 }),
      O('Pas de différence particulière', 'No particular difference', { lbp_chronic: 1 })]),
    Q('Qu’est-ce qui empire la douleur ?', 'What makes it worse?', [
      O('Me pencher vers l’avant, rester assis', 'Bending forward, sitting', { lumb_radic: 1, lbp_chronic: 1 }),
      O('Me pencher vers l’arrière, rester debout', 'Bending backward, standing', { stenosis: 2, spondylolisthesis: 2 }), DK]),
    Q('Un médecin t’a parlé d’une vertèbre qui glisse ?', 'Has a doctor mentioned a slipped vertebra?', [
      O('Oui', 'Yes', { spondylolisthesis: 5 }), O('Non', 'No')]),
  ],
  hip: [
    Q('Où est la douleur ?', 'Where is the pain?', [
      O('Dans l’aine (pli de la hanche, devant)', 'In the groin (front crease of the hip)', { hip_oa: 2, fai: 2 }),
      O('Sur le côté de la hanche, pire couché sur ce côté', 'On the side of the hip, worse lying on it', { gtps: 5 }),
      O('Sous la fesse, pire assis', 'Under the buttock, worse sitting', { prox_hams: 5 }), DK]),
    Q('Quel âge as-tu ?', 'How old are you?', [
      O('Moins de 45 ans', 'Under 45', { fai: 2 }), O('45 ans et plus', '45 or older', { hip_oa: 2, gtps: 1 })]),
    Q('La hanche est raide le matin ou pour mettre tes bas ?', 'Is the hip stiff in the morning or putting on socks?', [
      O('Oui', 'Yes', { hip_oa: 3 }), O('Non', 'No', { fai: 1, gtps: 1 })]),
  ],
  knee: [
    Q('Où est la douleur ?', 'Where is the pain?', [
      O('Autour ou derrière la rotule', 'Around or behind the kneecap', { pfps: 4 }),
      O('Juste sous la rotule, sur le tendon', 'Just below the kneecap, on the tendon', { patellar_tendon: 5 }),
      O('À l’extérieur du genou', 'On the outside of the knee', { itbs: 4 }),
      O('Dans tout le genou, avec raideur ou gonflement', 'All over, with stiffness or swelling', { knee_oa: 4 })]),
    Q('Comment est-ce arrivé ?', 'How did it start?', [
      O('Une torsion ou un choc, le genou a lâché', 'A twist or hit, the knee gave way', { knee_sprain: 5 }),
      O('Petit à petit, avec le sport (course, sauts)', 'Gradually, with sport (running, jumping)', { patellar_tendon: 1, itbs: 2, pfps: 1 }),
      O('Petit à petit, avec les années', 'Gradually, over the years', { knee_oa: 3 }), DK]),
    Q('Qu’est-ce qui fait mal ?', 'What hurts?', [
      O('Descendre les escaliers, rester assis longtemps', 'Going downstairs, sitting a long time', { pfps: 2 }),
      O('Sauter, courir', 'Jumping, running', { patellar_tendon: 2, itbs: 1 }),
      O('Marcher longtemps, se lever le matin', 'Walking a long time, getting up in the morning', { knee_oa: 2 }), DK]),
  ],
  ankle: [
    Q('Qu’est-ce qui te décrit le mieux ?', 'What fits you best?', [
      O('Je me suis tourné la cheville, ou elle tourne souvent', 'I rolled my ankle, or it rolls often', { ankle_sprain: 5 }),
      O('Douleur au tendon derrière le talon', 'Pain in the tendon behind the heel', { achilles: 5 }),
      O('Mon pied s’affaisse, douleur à l’intérieur de la cheville', 'My foot is flattening, pain inside the ankle', { tib_post: 5 }),
      O('Cheville raide après une fracture ou un plâtre', 'Stiff ankle after a fracture or cast', { ankle_stiff: 5 })]),
  ],
  foot: [
    Q('Où est la douleur ?', 'Where is the pain?', [
      O('Sous le talon, surtout aux premiers pas du matin', 'Under the heel, especially first steps in the morning', { plantar_fasc: 5 }),
      O('Au gros orteil (bosse ou raideur)', 'At the big toe (bump or stiffness)', { hallux: 5 }),
      O('Sous l’avant du pied, comme un caillou', 'Under the ball of the foot, like a pebble', { metatarsalgia: 5 })]),
  ],
};

// Où en est le patient : durée et exercices déjà commencés → phase et niveau de départ
export const START_QS = [
  { id: 'since', q: S('Depuis combien de temps as-tu ce problème ?', 'How long have you had this problem?'), opts: [
    { v: 'acute', t: S('Moins de 6 semaines', 'Less than 6 weeks') },
    { v: 'sub', t: S('6 semaines à 3 mois', '6 weeks to 3 months') },
    { v: 'chronic', t: S('Plus de 3 mois', 'More than 3 months') }] },
  { id: 'prior', q: S('As-tu déjà commencé des exercices pour ce problème ?', 'Have you already started exercises for this?'), opts: [
    { v: 'no', t: S('Non, je commence', 'No, I’m starting') },
    { v: 'w2', t: S('Oui, depuis moins de 3 semaines', 'Yes, for less than 3 weeks') },
    { v: 'w6', t: S('Oui, depuis 3 à 6 semaines', 'Yes, for 3 to 6 weeks') },
    { v: 'w7', t: S('Oui, depuis plus de 6 semaines', 'Yes, for more than 6 weeks') }] },
  { id: 'how', q: S('Comment ça se passe avec ces exercices ?', 'How are those exercises going?'), when: (a) => a.prior && a.prior !== 'no', opts: [
    { v: 'easy', t: S('Facile, peu de douleur', 'Easy, little pain') },
    { v: 'ok', t: S('Correct', 'Okay') },
    { v: 'hard', t: S('Difficile ou ça fait mal', 'Hard or painful') }] },
];

// Calcule phase et niveau de départ
export function startingPoint(ans, irritability) {
  let phase = 1, level = irritability === 'high' ? 1 : irritability === 'low' ? 3 : 2;
  if (ans.prior === 'w2') phase = 1;
  if (ans.prior === 'w6') phase = 2;
  if (ans.prior === 'w7') phase = 3;
  if (ans.how === 'easy') level += 1;
  if (ans.how === 'hard') { level -= 1; phase = Math.max(1, phase - 1); }
  if (ans.since === 'acute' && irritability === 'high') phase = 1;
  // décale la date de départ pour que le calendrier corresponde à la phase atteinte
  const weeksDone = { no: 0, w2: 1, w6: 3, w7: 7 }[ans.prior || 'no'];
  return { phase, level: Math.max(1, Math.min(5, level)), weeksDone };
}

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

// Reconnaît un diagnostic écrit : retourne les pathologies les plus probables
const REGION_WORDS = {
  cervical: ['cou', 'nuque', 'cervical', 'neck'], thoracic: ['dorsal', 'omoplate', 'thoracique', 'milieu du dos', 'upper back'],
  shoulder: ['epaule', 'shoulder', 'coiffe'], elbow: ['coude', 'elbow'], wrist: ['poignet', 'main', 'pouce', 'doigt', 'wrist', 'hand', 'thumb', 'finger'],
  lumbar: ['lombaire', 'bas du dos', 'reins', 'low back', 'sciatique', 'lumbar', 'dos', 'back'], hip: ['hanche', 'aine', 'fesse', 'hip', 'groin', 'buttock'],
  knee: ['genou', 'rotule', 'knee', 'kneecap'], ankle: ['cheville', 'achille', 'ankle'], foot: ['pied', 'talon', 'orteil', 'foot', 'heel', 'toe'],
};
const STOP = new Set(['douleur', 'douleurs', 'apres', 'avant', 'quand', 'surtout', 'arthritis', 'pain', 'after', 'when', 'tendon']);

// Autres langues (es, pt, ar, zh…) : on compare aussi au nom simple et au nom médical traduits.
const normU = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f\u064b-\u0652]/g, '').replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();
const CJK = /[\u3400-\u9fff]/;
const grams = (s) => { const c = s.replace(/ /g, ''); const g = new Set(); for (let i = 0; i < c.length - 1; i++) g.add(c.slice(i, i + 2)); return g; };
const XSTOP = new Set(['douleur', 'quand', 'apres', 'avant', 'dans', 'avec', 'pain', 'when', 'after', 'dolor', 'dores', 'dolores', 'pain', 'despues', 'depois', 'quando', 'cuando', 'muito', 'mucho', 'para', 'como', 'with', 'sobre', 'todo', 'toda', 'tiempo', 'tempo']);
function xScore(t, cand) {
  const c = normU(cand); if (!c) return 0;
  if (CJK.test(c)) { const tg = grams(t); let n = 0; for (const g of grams(c)) if (tg.has(g)) n++; return n * 1.5; }
  let n = 0;
  for (const w of new Set(c.split(' '))) if (w.length > 3 && !XSTOP.has(w) && (' ' + t + ' ').includes(' ' + (w.length > 6 ? w.slice(0, 6) : w))) n += 2;
  // arabe : racines collées aux articles (ال) → recherche sans espaces
  if (!n && /[\u0600-\u06ff]/.test(c)) for (const w of new Set(c.split(' '))) { const r = w.replace(/^ال/, ''); if (r.length > 2 && t.includes(r)) n += 2; }
  return n;
}
export function matchDiagnosis(text, pathologies, opts = {}) {
  const t = ' ' + norm(text) + ' ';
  const tu = normU(text);
  const xl = opts.tr; // fonction de traduction si langue ≠ fr/en
  if (tu.length < 2) return [];
  const regions = Object.entries(REGION_WORDS).filter(([, ws]) => ws.some((w) => t.includes(' ' + w))).map(([r]) => r);
  if (xl && opts.regions) for (const r of opts.regions) if (!regions.includes(r.id) && xScore(tu, xl(r.name)) >= 1.5) regions.push(r.id);
  const out = [];
  for (const p of pathologies) {
    const lay = LAY[p.id]; if (!lay) continue;
    let score = 0;
    for (const k of lay.kw) { const ws = norm(k).split(' ').filter((w) => w.length > 1); if (ws.length && ws.every((w) => t.includes(' ' + w))) score += ws.length * 2 + 1; }
    for (const w of new Set(norm(p.name.fr + ' ' + p.name.en).split(' '))) if (w.length > 5 && !STOP.has(w) && t.includes(' ' + w)) score += 1;
    if (xl) score += Math.max(xScore(tu, xl(lay.name)), xScore(tu, xl(p.name)));
    else score += Math.max(xScore(tu, lay.name.fr), xScore(tu, lay.name.en), xScore(tu, p.name.fr) * 0.75, xScore(tu, p.name.en) * 0.75) * 0.75;
    if (regions.length) score += regions.includes(p.region) ? 3 : -3;
    if (score > (regions.length ? 3 : 1)) out.push({ id: p.id, score });
  }
  const res = out.sort((a, b) => b.score - a.score).slice(0, 3);
  res.regions = regions;
  return res;
}

// Score des réponses aux questions d'une région
export function scoreAnswers(region, answers, pathologies) {
  const sc = {};
  for (const p of pathologies.filter((x) => x.region === region)) sc[p.id] = 0;
  (QUESTIONS[region] || []).forEach((q, i) => {
    const o = q.opts[answers[i]]; if (!o) return;
    for (const [k, v] of Object.entries(o.s)) sc[k] = (sc[k] || 0) + v;
  });
  return Object.entries(sc).sort((a, b) => b[1] - a[1]).map(([id, score]) => ({ id, score }));
}

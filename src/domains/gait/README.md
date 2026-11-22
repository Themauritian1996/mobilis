# Moteur d'analyse de la marche (`src/domains/gait`)

> Outil d'évaluation clinique — **non homologué Santé Canada**. Toutes les sorties sont des hypothèses fondées sur la
> littérature (`requiresClinicianValidation: true`), jamais un diagnostic. Spécification : `docs/spec-v2.md` §4, §5, §7.

Moteur **pur** en TypeScript strict : aucune interface, caméra ni DOM. Entrée : trames MediaPipe Pose (33 repères
normalisés, visibilité, repères « monde » facultatifs, horodatage). Sortie : objets sérialisables (JSON).

## API publique (`index.ts`)

| Fonction | Rôle |
|---|---|
| `analyzeGait({ frames, view, patient, options? }): GaitAnalysis` | Une vue : qualité, échelle, événements, cycles, métriques, courbes. `patient.heightCm` obligatoire. |
| `assessGait(analyses[], config?): GaitAssessment` | Plusieurs vues fusionnées : défauts (`findings`), 6 déterminants, articulations × phases, `limitingFactor`. |
| `compareAssessments(a[], b[], config?): GaitComparison` | Avant/après (ex. ajustement de canne ou de prothèse) : deltas, marge d'erreur, significativité, changements de statut. |
| `prepareRecording(input)` + `measureCustomAngle(prep, def)` | Mesure personnalisée (module recherche) : angle de 3 repères à une phase de Perry ou à un % du cycle. |
| `evaluateFindings(defs, analyses, config, sides)` | Moteur de règles générique (utilisé par `prosthetics`). |
| `DEFAULT_GAIT_CONFIG` / `withConfig()` | Paramètres cliniques (voir ci-dessous). |
| `prosthetics/assessProstheticGait(analyses, { level, side })` | Toutes les déviations prothétiques du niveau (audience : clinicien). |

Vues : `sagittal-left` (caméra du côté gauche du patient), `sagittal-right`, `frontal` (marche vers la caméra),
`posterior` (s'éloigne).

## Chaîne de traitement

1. **Prétraitement** (`preprocess.ts`) : coordonnées converties en « hauteurs d'image » (x × largeur/hauteur, y) pour
   des distances isotropes ; repères de visibilité < 0,5 masqués ; trous ≤ 0,2 s interpolés linéairement ; filtre de
   **Butterworth passe-bas d'ordre 2 appliqué aller-retour** (phase nulle), coupure 6 Hz corrigée du double passage
   (÷ (√2 − 1)^¼ ≈ 0,802), d'après Winter 2009 (`winter2009`). Les signaux d'événements utilisent une coupure de 12 Hz
   (un filtre à 6 Hz arrondit l'arrêt du talon et décale l'extremum d'environ 25–30 ms).
2. **Qualité** : visibilité moyenne des pieds, % de trames utilisables, % de repères reconstruits, fréquence d'images
   (≥ 30 i/s recommandé, idéalement 60 : `hii2023`), durée.
3. **Calibration par la taille** (`calibration.ts`, spec §4.2) : échelle m/unité = 0,818 × H / (sol → épaules) en
   station debout (1re seconde) ; mise à jour par la longueur des segments (cuisse + jambe = 0,491 H en vue latérale ;
   tronc = 0,288 H en vue frontale/postérieure, qui compense l'approche de la caméra). Proportions de **Winter 2009,
   fig. 4.1 (Drillis & Contini)**, statut `to_verify` (page non relue). Objet d'échelle facultatif (prioritaire, l'écart
   avec la taille est rapporté). Incertitude relative = √(3 %² [variabilité des proportions, proposition] + CV des
   segments² + (écart entre méthodes / 2)²) ; confiance = 1 − 5 × incertitude.
4. **Événements** (`events.ts`) — vue latérale : **Zeni 2008** (`zeni2008`) : contact initial = maximum de
   (talon − bassin) dans le sens de marche (détecté par la vitesse médiane du bassin), décollement = minimum de
   (orteil − bassin). Vues frontale/postérieure (adaptation non validée, confiance plus basse) : la caméra étant fixe,
   un pied en appui est immobile dans l'image ; plages d'immobilité (vitesse < 30 % du 90e centile, en longueurs de tronc
   par seconde) : début de plage du talon = contact, fin de plage de l'orteil = décollement. Nettoyage : alternance
   IC/TO par pied, distance minimale de 0,6 période (période par autocorrélation).
5. **Cycles** (`cycles.ts`) : contact → contact du même pied ; rejet des cycles aberrants (durée hors médiane ±
   max(3 × 1,4826 × MAD, 15 %), appui hors 40–85 %, décollement absent, > 30 % de trames reconstruites) ;
   normalisation 0–100 % sur **101 points** ; **phases de Perry** recalées sur les événements (fin de LR = décollement
   controlatéral, fin de TSt = contact controlatéral, fin de PSw = décollement ; MSt/TSt et tiers de l'oscillation
   selon les proportions de `norms.json > phases`).
6. **Angles** (`kinematics.ts`) : flexion +, dorsiflexion + ; **hanche = cuisse–verticale (Perry)** ; genou = cuisse −
   jambe ; cheville = angle du pied (talon → orteil) − angle de la jambe ; tronc = hanches → épaules vs verticale.
   **Zéro = station debout** (moyenne de la 1re seconde soustraite). Plan frontal (estimations) : obliquité pelvienne,
   inclinaison latérale du tronc, FPPA du genou (signe valgus = genou médial à la ligne hanche–cheville, Willson & Davis
   2008), alignement du talon (postérieur), position latérale de la cheville et du bassin.
7. **Métriques** (`metrics.ts`) : cadence (120 / durée de foulée), temps de pas/foulée/appui/simple appui, longueur de
   pas (distance talon–talon au contact × échelle), longueur de foulée, vitesse (foulée / durée), % appui/oscillation,
   double appui, indices de symétrie |G − D| / moyenne × 100, CV ; valeurs aux phases clés (cheville au contact, en
   réponse à la charge, en oscillation moyenne, dorsiflexion maximale en appui ; genou en réponse à la charge, minimum
   en appui, au décollement, pic en oscillation et son instant ; hanche au contact, extension maximale, flexion maximale
   en oscillation, amplitude) ; décollement du talon, pied à plat, vitesses angulaires ; frontal : chute pelvienne
   controlatérale, obliquité en oscillation (hip hiking), inclinaison du tronc vers l'appui, FPPA, arc latéral du pied,
   largeur de base, déplacement latéral du bassin (mesures prises au pic de la **courbe moyenne** des cycles, plus
   robuste au bruit de repères proches) ; rotation pelvienne transverse seulement avec les repères « monde » (estimation,
   confiance 0,15), sinon `value: null`. Chaque métrique : valeur, ET, n, valeurs par cycle, unité, vue, `confidence`
   (vue × visibilité × min(1, n/3) × 0,6 si estimation), `estimate`, comparaison à la norme (z si ET publiée, % de la
   moyenne).

## Normes (`data/norms.ts`, copie de `docs/gait-literature/norms.json`)

Sélection (décisions cliniques) : vitesse **Bohannon 1997** (< 70 ans, avec ET → z et % de la norme), **Hollman 2011**
de 70 à 79 ans (et autres paramètres ≥ 70 ans), **Bohannon & Andrews 2011 seul** de 80 à 99 ans (sans ET) ; cadence et
longueur de pas Oberg 1993 ; angles Oberg 1994 ; pas de normes pédiatriques. Sexe ou âge inconnus : mélange à poids
égaux des lignes. Normes vides (`to_verify`) : chute pelvienne, inclinaison du tronc, FPPA à la marche, largeur de base
< 70 ans, ratio pas/taille → aucune comparaison. Les amputés sont comparés à la norme générale.

## Moteur de règles (`rules.ts`, `data/findings.ts`, `prosthetics/deviations.ts`)

Chaque critère a un seuil d'**anomalie** et un seuil **« confiant »** ; entre les deux : **« doute »**. Pied tombant :
cheville en oscillation moyenne < 0° = anomalie, < −5° = confiant (configurable). Ailleurs, la bande de doute est l'erreur
2D de Stenum 2021 (hanche 4,0°, genou 5,6°, cheville 7,4° ; frontal 3°, proposition) ou un demi-seuil. Rôles :
`primary`, `required`, `supporting`, `compensation` (signes compensatoires sagittaux ET frontaux/postérieurs : steppage,
circumduction, hip hiking, vaulting), `contrary`. Concordance : ≥ 3 cycles valides par côté et critère présent dans ≥ 2/3
des cycles (sinon « confiant » → « doute »). Statut : `probable`, `possible`, `absent`, `insufficient_data`, `observe`.
Score du défaut (0–1, pas un score global) = 0,6 (confiant) ou 0,35 (doute) + 0,1 par signe d'appui (max 0,3) − 0,15 par
signe contraire, pondéré par la part d'estimations. Chaque résultat : `why` (critères remplis avec valeur, seuils,
concordance, type de seuil), causes, diagnostics différentiels, **suggestions orientées vers la restauration du/des
déterminant(s) altéré(s)** puis prise en charge de la littérature, références, `determinants`, `unvalidatedThresholds`
(`proposed_heuristic` / `to_verify`), `requiresClinicianValidation: true`, `audience`.

Prothèses : toutes les déviations du niveau (TT, TF ; désarticulation du genou → TF, Syme/Chopart → TT, `to_verify`) ;
fouets médial/latéral, pistonnage, rotation du pied et hyperlordose = `observe` (estimation, à observer cliniquement) ;
`audience: 'clinician'`.

## Les six déterminants de la marche (`determinant-ids.ts`, `determinants.ts`)

Cadre d'interprétation : « se rapprocher le plus possible d'une marche normale », selon **Saunders JB, Inman VT,
Eberhart HD (1953) The major determinants in normal and pathological gait. J Bone Joint Surg Am 35-A(3):543-558**
(métadonnées recoupées par des sources secondaires) : 1) rotation pelvienne (transverse : **non mesurable de façon
fiable en 2D**, toujours `uncertain`), 2) bascule pelvienne frontale (≈ 5°), 3) flexion du genou en appui (≈ 15–20°),
4) mécanismes pied–cheville (bascules du talon, de la cheville, de l'avant-pied), 5) interaction genou–cheville,
6) déplacement latéral du bassin. **Pas de score global** : chaque déterminant et chaque articulation × phase reçoit
`affected | preserved | uncertain` avec une explication (ce qui est affecté, préservé, incertain, défauts liés). La
correspondance défaut → déterminants est une **proposition à valider**.

Critique moderne (références vérifiées) : le rôle des déterminants dans la réduction de l'excursion verticale du centre
de masse est discuté — Della Croce U, Riley PO, Lelas JL, Kerrigan DC (2001) *A refined view of the determinants of
gait*, Gait Posture 14:79-84 (le décollement du talon contribue davantage que la flexion du genou en appui) ; Gard SA,
Childress DS (1997) *The effect of pelvic list on the vertical displacement of the trunk during normal walking*, Gait
Posture 5(3):233-238 (effet faible de la bascule pelvienne) ; Kuo AD (2007) *The six determinants of gait and the
inverted pendulum analogy: a dynamic walking perspective*, Hum Mov Sci 26(4):617-656 (aplatir la trajectoire du centre
de masse coûterait plus d'énergie qu'il n'en économise). Les déterminants servent donc ici de **grille de lecture
clinique**, pas de modèle énergétique.

## Comparaison A/B

Pour chaque métrique : delta = B − A ; marge = max(MDC connu, précision 2D, IC95 % de la différence entre cycles) ;
vitesse 0,10 m/s (Stenum 2021 ; MDC 0,08 m/s post-fracture de hanche, `perera2006` à vérifier), longueur de pas 1,8 cm,
temps 0,01 s, angles 4,0/5,6/7,4°, frontal 3° (proposition) ; `towardNorm` ; changements de statut des défauts et
des déterminants.

## Précision attendue et limites de la 2D

* Littérature (`norms.json > camera2dAccuracy`) : OpenPose sagittal, adultes sains (**Stenum 2021**) : temps
  0,01–0,02 s, longueur de pas 4,9 cm par pas (1,8 cm en moyenne par participant), vitesse < 0,10 m/s, hanche 4,0°,
  genou 5,6°, cheville 7,4° (erreur absolue moyenne). MediaPipe : événements 20–30 ms à 25 i/s, double appui mal mesuré
  (**Hii 2023**) ; MediaPipe moins précis à la cheville et à la hanche, inversions G/D (**Menychtas 2023**). Erreurs
  probablement plus grandes chez les patients (aides techniques, prothèses, vêtements amples).
* **Plan frontal non validé** : aucune étude retrouvée pour la chute pelvienne, l'inclinaison du tronc, le FPPA ou la
  largeur de base à la marche avec une caméra → `estimate: true`, `limitingFactor` seulement si liées à un défaut ou à un
  déterminant affecté.
* Perspective et parallaxe : caméra non perpendiculaire, repères à des profondeurs différentes (hanche plus large que
  le genou), rotations hors plan projetées en flexion/valgus ; la calibration debout doit se faire au centre de l'image.
* Résultats sur squelettes **synthétiques** (`testing/synthetic.ts`, tests `*.test.ts`) : événements Zeni à ±1 trame à
  30 i/s (≥ 90 % à ±1 et tous à ±2 trames à 60 i/s) ; vues frontale/postérieure ≥ 75 % à ±2 trames ; longueur de pas
  et vitesse à ±5 % (taille ou objet d'échelle) ; angles : erreur moyenne < 2° et pics/valeur au contact à ±2° (référence
  filtrée de la même façon, 60 i/s, membres dans un plan parasagittal) ; chaque variante pathologique (pied tombant,
  Trendelenburg, genou raide, circumduction, asymétrie prothétique) déclenche le bon défaut et aucun autre défaut
  principal. Ces chiffres valident le code, **pas** la précision clinique.

## Éléments à faire valider par le clinicien

Seuils `proposed_heuristic` (listés dans chaque résultat), bandes « doute », correspondance défauts → déterminants,
cibles des déterminants sans norme (chute pelvienne ≈ 5°, déplacement latéral 4–5 cm, rotation 4°), règle « 2/3 des
cycles », interprétation de la circumduction (arc par rapport à la ligne d'appui), variabilité 10 % pour l'ataxie,
choix des normes chez l'aîné, extrapolation des niveaux d'amputation.

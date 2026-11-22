# Mobilis v2 — Spécification (branche `dev-v2`)

Statut : brouillon validé par l'utilisateur le 22 nov. 2026. **`main` (v1.15) ne doit jamais être modifié** tant que l'utilisateur n'a pas confirmé l'écrasement. Tout le travail se fait sur `dev-v2` (ou des sous-branches `dev-v2-*` fusionnées en avant rapide dans `dev-v2`).

## 1. Objectif
1. **Architecture** modulaire, lisible par un ingénieur externe, aux standards d'une future compagnie privée (TypeScript + Vite, domaines séparés, ports/adaptateurs, tests, CI, documentation, licence propriétaire, traçabilité réglementaire).
2. **Volet analyse de la marche** (outil d'évaluation et de traitement pour cliniciens) : démarche inspirée d'un laboratoire de marche, avec un téléphone, 3 vues (latérale, frontale, postérieure).
3. **Volet amputés / prothèses** (tibial, fémoral) : métriques et déviations propres, causes possibles liées à la prothèse (emboîture, alignement, suspension), conseils.
4. **Plans de traitement** générés à partir des défauts trouvés (exercices de la bibliothèque, ajustements : emboîture, aide technique/canne, orthèse, références), modifiables par le clinicien.
5. **Recherche malléable** : le clinicien définit un protocole de mesures (ex. angles à des phases précises de la marche avant/après infiltration de toxine botulique, à T0, T+2 sem, T+6 sem…), enregistrées par patient, comparées et exportables.
6. **Mesures calibrées** par la taille du patient (saisie) pour estimer échelle, longueur de pas/foulée, vitesse.
7. **Privé** : dépôt privé, partage par lien seulement (Firebase Hosting + canaux d'aperçu ; APK via Firebase App Distribution ou artefacts privés).

## 2. Contraintes
- Français d'abord ; i18n FR/EN/ES/PT/AR/ZH (même mécanisme qu'en v1.15).
- Aucune vidéo n'est conservée ni envoyée par défaut (traitement sur l'appareil). Les images envoyées à Gemini exigent le consentement existant.
- Aucun mot de passe, clé ou jeton saisi par l'assistant. Pas de secret dans le dépôt.
- Fonctions de marche/amputés/recherche derrière un **drapeau de fonctionnalité** `gait` (désactivé par défaut), libellé « outil d'évaluation clinique — non homologué Santé Canada » tant que la voie réglementaire n'est pas choisie. Les conseils sont des **suggestions fondées sur la littérature, à valider par le clinicien**, jamais un diagnostic.
- Toute valeur clinique (normes, règles, conseils) cite sa source (auteur, année, titre/revue). Ne rien inventer : si une valeur n'est pas retrouvée, la marquer `reference: null, status: "to_verify"`.
- Ne pas régresser : tous les tests v1.15 passent (`npm test`, e2e) tout au long de la migration.
- Hors ligne et APK Capacitor continuent de fonctionner.

## 3. Architecture cible (src/)
```
src/
  core/        types partagés, utilitaires purs, erreurs, bus d'événements, config, i18n, drapeaux de fonctionnalité
  platform/    adaptateurs appareil : caméra, audio/voix, partage/fichiers (Capacitor), stockage local, hors ligne
  services/    ports (interfaces) + adaptateurs : auth, base de données (Firestore), IA (Gemini direct / relais), synchronisation
  vision/      pose, main, tracker de répétitions, superposition, placement, calibration par taille
  domains/
    rehab/ (exercices, programmes, séance, calendrier, progression, matériel)
    clinic/ (programmes cliniciens, partage, patients)
    outcomes/ (questionnaires PROMs, amplitude ROM, rapports PDF, badges, protocoles post-op)
    gait/ (NOUVEAU : capture, événements, cycles, métriques, normes, règles, résultats)
    prosthetics/ (NOUVEAU : amputés/prothèses)
    treatment/ (NOUVEAU : plans de traitement, aides techniques)
    research/ (NOUVEAU : protocoles de mesure, chronologie d'interventions, comparaisons, exports)
  ui/          routeur, écrans (vues), composants, styles
  main.ts      point d'entrée
```
Règles : un domaine n'importe jamais l'interface ; `domains/*` dépend de `core`, `vision`, `services` (via ports) ; pas de dépendance circulaire (vérifiée par ESLint `import/no-cycle` ou dependency-cruiser) ; Firebase uniquement dans `services/*/firebase` (remplaçable). Données cliniques en fichiers de données typés et versionnés, séparés de la logique. Modèle de données versionné (`schemaVersion`) avec migrations testées.
Outillage : TypeScript strict (migration progressive : `allowJs` au début, objectif `strict` sur tout code nouveau), Vite (build web + `cap sync`), Vitest (tests unitaires, remplace les scripts `tests/*.test.mjs`), Playwright (e2e existants), ESLint + Prettier, `.editorconfig`, Husky ou script `npm run check` (lint + types + tests), CI GitHub Actions (lint, types, tests, build web, APK), commits conventionnels, SemVer, CHANGELOG.
Documentation attendue : `docs/architecture.md` (diagrammes Mermaid), `docs/adr/` (décisions d'architecture), `CONTRIBUTING.md`, `SECURITY.md`, `CODEOWNERS`, `LICENSE` propriétaire (« Tous droits réservés », `UNLICENSED`), `NOTICE` (licences tierces : MediaPipe Apache-2.0, jsPDF, Firebase, Capacitor…), `docs/regulatory/` (squelette : usage prévu, classification SaMD Santé Canada, gestion des risques ISO 14971, cycle de vie logiciel IEC 62304, plan de validation), `docs/privacy/` (Loi 25 : registre des données, EFVP modèle).

## 4. Volet marche
### 4.1 Capture
- 3 enregistrements indépendants : **latéral** (gauche ou droite), **frontal** (le patient marche vers la caméra), **postérieur** (s'éloigne). Chaque vue a son guide de placement (réutiliser `placement.js` : distance, hauteur de la caméra ≈ hanche, trépied, corridor 5–6 m, lumière, vêtements ajustés/short), instructions vocales (voix de l'app, langue de l'app) et vérification pose/visibilité (pieds visibles).
- Entrées : **taille du patient (cm)** obligatoire ; poids facultatif ; côté atteint ; type d'aide technique utilisée ; chaussures/prothèse ; vitesse (confortable/rapide).
- Optionnel : objet d'échelle connu (feuille 8,5×11 po, ruban de 1 m) pour valider l'échelle.
### 4.2 Calibration par la taille
- Échelle m/px estimée à partir de la hauteur du corps en pixels (tête–talon en station debout, début d'enregistrement) et de la taille saisie ; mise à jour continue par la longueur du tronc/segments (proportions anthropométriques de Winter/Drillis-Contini) pour compenser la profondeur ; longueur de pas = distance horizontale entre talons aux contacts initiaux × échelle ; vitesse = distance parcourue / temps ; documenter les erreurs (perspective, caméra non perpendiculaire) et fournir une **cote de confiance** par mesure (visibilité, plan, stabilité) comme `rom.js`.
### 4.3 Événements et cycles
- Détection des **contacts initiaux** (heel strike) et **décollements des orteils** (toe-off) par cinématique talon/orteil par rapport au bassin (méthode de type Zeni 2008), filtrage (Butterworth ou lissage), segmentation des cycles, **normalisation 0–100 %**, phases de Perry (contact initial, réponse à la charge, mi-appui, appui terminal, pré-oscillation, oscillation initiale/moyenne/terminale), détection des cycles aberrants.
### 4.4 Métriques
- Spatio-temporelles : cadence, temps de pas/foulée, longueur de pas/foulée (calibrées), vitesse, % appui/oscillation, double appui, largeur de base (frontal), indices de symétrie G/D.
- Sagittal : angles hanche, genou, cheville (flexion/extension, dorsiflexion/plantiflexion), inclinaison du tronc, courbes sur le cycle et valeurs aux phases clés (ex. cheville au contact initial et en oscillation moyenne, flexion de genou maximale en oscillation, extension de hanche en appui terminal).
- Frontal : valgus/varus du genou (angle de projection dans le plan frontal, FPPA), chute du bassin (Trendelenburg), inclinaison latérale du tronc, largeur de base, angle de progression du pied (estimation).
- Postérieur : alignement du talon/arrière-pied (estimation), chute pelvienne, déviation latérale du tronc.
- Chaque métrique : valeur, unité, écart à la norme (selon âge/sexe quand disponible), confiance, vue source, avertissement de précision. Les limites de la 2D (une caméra) sont explicites dans l'interface et les rapports.
### 4.5 Normes et règles (littérature)
- `data/gait-norms` : valeurs de référence (Perry & Burnfield, Winter, Kadaba, Oberg, Bohannon pour la vitesse de marche, etc.) avec sources.
- `data/gait-findings` : catalogue de **défauts de marche** avec critères mesurables, causes fréquentes, diagnostics différentiels courants, conseils/options de prise en charge, références, niveau de preuve : pied tombant (foot drop) / steppage, démarche fauchante (circumduction), « vaulting », hip hiking, Trendelenburg (et Trendelenburg compensé), diminution de la flexion de hanche, diminution de l'extension de hanche, genou raide en oscillation (stiff-knee), genu recurvatum, crouch, démarche antalgique, équin dynamique, valgus/varus dynamique, appui asymétrique, vitesse réduite (risque de chute), base élargie (ataxie), etc.
- Moteur de règles transparent (entrée : métriques → sorties : défauts probables avec score de confiance + « pourquoi » + sources). Aucune boîte noire. IA (Gemini) facultative uniquement pour reformuler/expliquer, avec consentement.
## 5. Amputés et prothèses
- Profil : niveau (transtibial, transfémoral, désarticulation, Syme, Chopart…), côté, étiologie, date, type de pied/genou prothétique, emboîture, suspension, ancienneté, aide technique.
- Métriques spécifiques : asymétrie des temps d'appui/oscillation et longueurs de pas, flexion du genou en appui/oscillation (prothèse et côté sain), inclinaison latérale du tronc, abduction/circumduction, vaulting, hip hiking, « foot slap », « terminal swing impact », « medial/lateral whip » (estimation), élévation du talon asymétrique, « drop-off », hyperlordose compensatoire, variation de la cadence, largeur de base.
- Règles : déviation → causes possibles classées (alignement prothétique, emboîture/suspension, longueur, faiblesse/ROM résiduels, douleur, habitude) → suggestions (ajustement à discuter avec le prothésiste, exercices, aide technique) avec références (ex. Smith/Michael/Bowker *Atlas of Amputations and Limb Deficiencies*, Gailey, Perry, Sanders). Toujours « à valider par l'équipe (prothésiste, physiatre) ».
- Comparaison avant/après ajustement de la prothèse (même protocole de recherche).
## 6. Plans de traitement
- À partir des défauts : liste d'actions proposées (exercices de la bibliothèque `rehab/exercises` associés, étirements/renforcement, entraînement de marche, ajustement d'aide technique, orthèse/AFO, ajustement d'emboîture/alignement, référence en orthopédie/orthèse-prothèse, évaluation de la toxine botulique, etc.) ; le clinicien **ajoute/retire/modifie**, fixe la durée et les objectifs mesurables (ex. « cheville ≥ 0° en oscillation moyenne ») ; plan versionné par patient, relié au programme (`rx`) existant, suivi des objectifs au fil des évaluations.
- **Aides techniques** : calculateur (canne/béquilles/déambulateur) à partir de la taille et du trochanter/poignet (hauteur de poignée ≈ trochanter, flexion du coude 20–30°, côté controlatéral), vérification par caméra (angle du coude) et conseils d'ajustement, avec sources.
## 7. Recherche malléable
- **Protocole** = liste de *mesures* × *points dans le temps* × *conditions*. Une mesure peut être : métrique de marche à une phase (ex. angle de cheville au contact initial côté G), courbe complète, ROM, PROM, ou **mesure personnalisée** (3 repères du squelette + phase de marche → angle).
- **Chronologie d'interventions** par patient (type : infiltration de toxine botulique, ajustement de prothèse, orthèse, chirurgie, médicament…, date, site/dose en champs libres).
- Gabarits prêts à l'emploi (modifiables) : « Infiltration de toxine botulique (T0, 2, 6, 12 sem) », « Ajustement de prothèse (avant/après) », « Suivi post-AVC ».
- Comparaison avant/après : tableaux et graphiques (courbes superposées sur le cycle normalisé, deltas, écart-type, changement minimal détectable si connu), notes cliniques, export **CSV/JSON/PDF**, option d'**anonymisation** (identifiant de recherche).
- Données stockées par patient (local + synchronisation Firebase avec compte), schéma versionné, aucune vidéo conservée.
## 8. Hébergement et confidentialité
- Dépôt GitHub **privé** (à basculer seulement après confirmation de l'utilisateur, car GitHub Pages gratuit cesse de servir un dépôt privé et le lien APK public cesse de fonctionner).
- Firebase Hosting (projet `mobilis-6828b`) avec **canaux d'aperçu** (URL non devinables, expiration) pour `dev-v2` ; déploiement via GitHub Actions avec secret `FIREBASE_SERVICE_ACCOUNT` créé par l'utilisateur ; APK de test via Firebase App Distribution ou artefact privé.
- Règles Firestore étendues pour `assessments`, `plans`, `studies` (propriétaire seulement ; cliniciens via programme partagé), testées.
## 9. Livrables et critères de réussite
1. `dev-v2` compile (`npm run check` vert), tous les tests v1.15 passent, e2e passent, APK construit en CI.
2. Arborescence `src/` conforme, aucune dépendance circulaire, documentation et fichiers de standards présents.
3. Marche : pipeline testé sur squelettes synthétiques (cycles connus → événements ±1 image, longueur de pas ±5 % avec échelle connue, angles ±2° sur données synthétiques) ; flux de capture 3 vues fonctionnel en e2e avec caméra simulée ; résultats par patient enregistrés.
4. Catalogues normes/règles avec références vérifiables ; toute valeur sans source marquée `to_verify`.
5. Amputés, plan de traitement, aides techniques, recherche : écrans fonctionnels, données enregistrées, export CSV/JSON/PDF.
6. i18n complète (FR/EN/ES/PT/AR/ZH) pour les nouveaux textes.
7. Audit indépendant final (agent distinct) listant les écarts ; corrections appliquées.

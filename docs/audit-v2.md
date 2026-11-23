# Audit indépendant de la branche `dev-v2` (spec v2 §9.7)

* Date : 23 nov. 2026. Branche auditée : `origin/dev-v2` (`eab94b7`, puis rebasée sur `c5496ba`, qui ajoute les
  traductions es/pt/ar/zh). Corrections : branche `dev-v2-audit`.
* Auditeur : agent distinct des auteurs du code. Références : `docs/spec-v2.md` (§9 critères, §10 décisions cliniques),
  `docs/v2-features-brief.md`, `docs/architecture.md`, `docs/MIGRATION.md`, `src/domains/gait/README.md`,
  `docs/adr/0009-dossier-patient.md`.
* Les fichiers `src/ui/features/*/strings.ts` n'ont pas été modifiés (traductions en cours ailleurs).

## 1. Résumé

La branche compile et les suites automatiques sont vertes. Le moteur de marche respecte la plupart des décisions
cliniques du §10 : seuils du pied tombant à 0 / −5°, seuil à ±2 ET, angle cuisse–verticale, pas de score global,
statuts des 6 déterminants, normes Bohannon/Hollman selon l'âge, déviations prothétiques réservées au clinicien et
comparaison A/B avec marge d'erreur. Avec le drapeau `gait` désactivé, l'app affiche exactement le même texte que la
v1.15 (test de parité).

Le parcours réel dans Chromium (390 × 844 et 1280 × 900, rôles clinicien et patient, évaluations synthétiques passées
par `analyzeCapture` → `buildAssessmentDoc` → `saveAssessment`, comme à la capture) a révélé des défauts que les tests
unitaires ne voyaient pas :

* le plus grave : **en rôle patient, l'écran de résultats montrait la toxine botulique, l'orthèse AFO et toute
  l'évaluation prothétique** (§10.8, §10.10) ;
* la page débordait horizontalement sur téléphone ;
* des identifiants internes s'affichaient à l'écran ;
* un clinicien en « mode test patient » recevait « Accès refusé » ;
* des changements A/B étaient déclarés significatifs à tort ;
* le nombre de cycles réglé n'était pas transmis aux règles.

Ces défauts sont corrigés et chaque correctif a son test.

Restent ouverts : deux écarts de règles cliniques à trancher par le physiatre (concordance 2/3, corrélation
obligatoire des compensations), le parcours de capture du patient (bouton sans effet), les règles Firestore jamais
testées sur l'émulateur, un risque de dossiers imposés à un clinicien, la suppression Loi 25 en ligne qui peut échouer
sans prévenir l'utilisateur, l'absence d'e2e de capture en 3 vues, ainsi que des points mineurs d'accessibilité et
d'architecture.

**Bilan : 27 constats — 1 critique, 13 majeurs, 13 mineurs ; 9 corrigés, 18 ouverts.**

## 2. Vérifications exécutées

| Commande | Résultat |
|---|---|
| `npm run check` (avant audit) | Vert : ESLint, dependency-cruiser (0 erreur, **164 avertissements** `new-code-not-legacy`), Prettier, `tsc`, Vitest **77 fichiers / 599 tests**, build et `verify:dist` (276 fichiers pré-cachés). |
| `npm run check` (après correctifs et rebasage) | Vert (voir §5). |
| `npm run test:legacy` | « 22 scripts de test v1.15 : OK ». |
| `MOBILIS_BASE=<worktree origin/main>/www npm run test:parity` | « Parité www/dist : OK » sur 24 écrans (patient fr/en/ar, clinicien fr), drapeau désactivé. Le worktree temporaire a été supprimé ensuite. |
| `npm run test:e2e:dist` | Superposition et amplitude **ignorées** : modèles MediaPipe absents, `storage.googleapis.com` renvoie 403 via le proxy (`npm run fetch-model`). Caméra : 1 échec connu, « compte à rebours affiché » (MIGRATION §6), même résultat qu'en v1.15. |
| Parcours Playwright (`dist/`, `?flags=gait`) | 0 erreur de console ou de page sur ≈ 70 écrans visités (2 rôles × 2 tailles). Détails au §4. |

## 3. Constats

Gravité : **critique** = sécurité clinique ou vie privée compromise ; **majeur** = écart à la spec ou fonction
cassée ; **mineur** = qualité, accessibilité ou dette.

| # | Gravité | Domaine | Constat | Preuve | Statut |
|---|---|---|---|---|---|
| 1 | critique | Clinique §10.8, §10.10 | En rôle patient, `#/marche-res` (écran, PDF et JSON) affichait les options de prise en charge du catalogue (« Orthèse tibio-pédieuse (AFO) », « Toxine botulique… ») et toute l'évaluation prothétique (« Emboîture / suspension », « À discuter avec le prothésiste »). | Parcours patient : `forbidden` non vide dans `tel-pat-marche-res-*` (avant). Test `src/ui/features/gait/patient-view.test.ts`. | **Corrigé** `6eed1ab` : `patientSafeResult` / `patientSafeDoc` (`model.ts`) retirent la partie prothétique et les défauts réservés au clinicien ; les suggestions se limitent aux buts de restauration des déterminants. |
| 2 | majeur | Interface, rôles | Un clinicien en « mode test patient » (profil avec `pathology`) recevait « Accès refusé : cette évaluation n'est pas la vôtre » sur `#/marche-res` et `#/marche-ab` de son patient. Le registre des routes utilise le rôle du profil, l'écran utilisait `navRole()`. | Capture `avant/tel-clin-marche-res-footdrop.png`. Test `viewerRole` (patient-view.test.ts). | **Corrigé** `6eed1ab` |
| 3 | majeur | Accessibilité / mise en page | À 390 px, `#/marche-res` débordait horizontalement (`scrollWidth` 741 px). Les `.sr-only` absolus des cellules du tableau articulations × phases sortaient de `.gc-scroll`, qui n'était pas positionné. | Audit : `overflowX "741 > 390"` (avant), recherche par masquage jusqu'à `TABLE.gc-jtable`. Test `src/ui/features/gait/css.test.ts`. | **Corrigé** `d10c3ff` |
| 4 | majeur | Clinique §10.11 (A/B) | `measurementError` appliquait la marge des durées (0,01 s) aux indices `symmetry_index_*_time`, qui sont en %. Deux captures normales différant seulement par le bruit montraient « Symétrie : temps de pas Δ 3,2 % significatif ». | Sonde Vitest (normal graine 1 vs graine 2). Test `src/domains/gait/measurement-error.test.ts`. | **Corrigé** `98adae6` |
| 5 | majeur | Clinique §10.6 | Le formulaire acceptait 1 ou 2 « cycles visés » (minimum 1) et ce réglage ne servait qu'à la fin automatique : les règles exigeaient toujours 3 cycles. | `model.ts` (`MIN_TARGET_CYCLES = 1`) ; `analysis.ts` appelait `assessGait(analyses)` sans configuration. Test `cycles-config.test.ts`. | **Corrigé** `99441bb` : minimum 3, `engineConfig()` → `minCyclesPerSide` de `assessGait` et `assessProstheticGait`. |
| 6 | majeur | Clinique §10.6 | Concordance entre cycles : un critère « confiant » présent dans moins des 2/3 des cycles passe à « doute », donc le défaut reste **« possible »** (retenu). La spec dit : « défaut retenu si présent dans ≥ 2/3 des cycles ». | Sonde : cheville en oscillation moyenne −6°, par cycle [−6, −6, −6, 1, 1, 1] → `foot_drop_steppage` « possible ». `rules.ts` l. 300. | Ouvert : à trancher par le physiatre (« possible » ou « absent » sous 2/3). |
| 7 | majeur | Clinique §10.4 | La « corrélation obligatoire » avec les compensations sagittales et frontales/postérieures n'est pas appliquée : les compensations ne font qu'augmenter le score. Une cheville entre 0 et −5° suffit pour un pied tombant « possible », −5° pour « probable ». Conséquence : sur la **marche normale synthétique**, le pied tombant ressort « possible » des deux côtés. La cheville en oscillation moyenne mesure −2,1° pour une vérité de 0°, et la bande 0/−5° est plus étroite que l'erreur 2D publiée (7,4°, Stenum 2021). | Parcours (`res.mjs`) : normal → `foot_drop_steppage:L:possible`, `:R:possible`. Sonde : −1° sans compensation → « possible ». | Ouvert : choix clinique (exiger ≥ 1 compensation pour retenir le défaut, ou bande de doute plus large). |
| 8 | majeur | Parcours patient §10.11 | En rôle patient, le bouton « Nouvelle analyse de marche » de `#/dossier` et les mesures de marche de `#/suivi` mènent à `#/marche/<uid>`, route réservée au clinicien (`roles: ['clinician']`) : retour silencieux à l'accueil. La spec prévoit l'enregistrement par le patient dans son compte. | `patients/views.ts` l. 399, `research/followup.ts` `measureHref`, `gait/routes.ts` l. 10. Parcours : `forbidden-marche` → accueil. | Ouvert : décision produit (ouvrir la capture au patient sans mode prothèse, ou masquer ces liens). |
| 9 | majeur | Sécurité | `firestore.rules` v2 n'a jamais été exécuté sur l'émulateur (ADR 0009 : « non publiées », 10 cas listés) ; aucun test de règles en CI. Les tests Vitest utilisent un faux Firestore qui réimplémente les contrôles. | ADR 0009 §« Cas à tester » ; aucun `@firebase/rules-unit-testing` dans le dépôt. | Ouvert : ajouter `firebase emulators:exec` + tests des 10 cas avant publication. |
| 10 | majeur | Sécurité / intégrité | Données imposées à un clinicien : `rx/{code}` est lisible par tous (`allow get: if true`), y compris `by` (uid du clinicien). Tout compte qui connaît un code (ils circulent sur papier ou par QR) peut écrire des documents `sharedWith: [by]` qui passent `validShare`. Le clinicien les lit, et sa synchronisation **crée automatiquement un dossier** dans son espace. Aucune fuite de lecture n'a été trouvée : un compte ne lit que ses documents ou ceux qu'on lui partage, aucune écriture ailleurs que chez soi, `ownerUid` est immuable et l'id est lié au propriétaire. | Raisonnement sur `validShare` et `rx` ; ADR 0009 « création automatique ». | Ouvert : exiger une acceptation par le clinicien (ou une liste de patients liés) avant la création automatique ; limiter le débit et la taille des documents. |
| 11 | majeur | Vie privée (Loi 25) | `eraseRecordsForErase` : si la suppression en ligne échoue pour une raison **autre que réseau** (règles non publiées, permission refusée), l'erreur n'est que journalisée. Les données locales sont effacées et l'utilisateur pense ses données en ligne supprimées alors qu'elles subsistent. | `src/ui/features/patients/settings.ts` l. 29–37. | Ouvert : signaler l'échec à l'utilisateur et conserver une tâche de suppression à reprendre. |
| 12 | majeur | Critère §9.3 | Aucun test e2e du flux de capture en 3 vues avec caméra simulée. Seul `camera.e2e.mjs` (v1) existe ; aucun e2e ne couvre `#/marche`. | `ls tests/` | Ouvert |
| 13 | majeur | Critère §9.1 / §9.2 | L'intégration de la migration (MIGRATION §4) n'est pas faite : 164 avertissements `new-code-not-legacy`, dont les volets v2 vers `www/js/i18n.js` et `www/js/store.js`. `index.html` charge toujours `js/app.js`. | Sortie de `npm run lint:deps`. | Ouvert |
| 14 | majeur | Clinique §10.11 | La comparaison A/B (`compare.ts`) recalcule les défauts avec la configuration par défaut (3 cycles), pas avec le nombre de cycles réglé pour la capture ; le nombre de cycles n'est pas mémorisé **par patient** (seulement par capture). | `compare.ts` : `compareAssessments(ra.analyses, rb.analyses)`. | Ouvert |
| 15 | mineur | i18n / lisibilité | Identifiants internes affichés : « Seuils non validés : ankle_msw_plantarflexed (proposed_heuristic) » et « Défauts liés : foot_drop_steppage ». | Audit `rawKeys` (avant). Test `present-labels.test.ts`. | **Corrigé** `c8dd8ab` |
| 16 | mineur | Lisibilité A/B | Marge inconnue (indices de symétrie, CV) affichée « ± 0,0 », ce qui laisse croire à une mesure exacte. | Capture `avant/tel-res-marche-ab.png`. Test `present-labels.test.ts`. | **Corrigé** `87d469b` : « — ». |
| 17 | mineur | Lisibilité | La chronologie du dossier affichait les codes techniques des conditions : « 175 · none · none · shoes · comfortable · 3 ». | Parcours patient `#/dossier`. Test `src/domains/clinic/condition-summary.test.ts`. | **Corrigé** `1c7c9de` |
| 18 | mineur | Code mort | `void JOINT_ORDER;` (import conservé artificiellement) dans `sections.ts`. | grep | **Corrigé** `ea91587` |
| 19 | mineur | i18n | Textes du moteur (explications des déterminants, `why`, causes) en français seulement, avec les côtés « (L) / (R) » au lieu de G/D. | Capture `tel-res-marche-res-drop.png` (« cheville au contact initial (L) »). | Ouvert (domaine) |
| 20 | mineur | i18n | Clés brutes restantes : objectifs du plan brouillon (« ankle_msw », « ankle_ic »), aides techniques (« yi1996 : … », « (to_verify) » dans les données et les chaînes). | Audit `plan-draft`, `aides`. | Ouvert (données ou `strings.ts` non modifiables ici) |
| 21 | mineur | Accessibilité | Cibles tactiles < 44 px : interrupteur « Anonymiser » 52 × 32, « × » des conditions 32 × 32, points du squelette 30 × 30 (angle personnalisé), `summary` de 19–24 px de haut (`#/etude`, `#/suivi`), liens « Ouvrir le résultat » de 22 px (`#/marche-ab`). Contraste : aucun texte sous 4,5:1 détecté. | Rapports `clin-*.json` (`smallEx`). | Ouvert |
| 22 | mineur | Sécurité web | La CSP n'est que `Content-Security-Policy-Report-Only` (firebase.json), avec `script-src 'unsafe-inline'` ; aucune CSP appliquée dans `index.html`. | `firebase.json` | Ouvert |
| 23 | mineur | Secrets | Clé API web Firebase dans `src/core/config.ts` (publique par conception, présente en v1.15). Aucun autre secret trouvé (motifs AIza, sk-, clés privées, `.env`, comptes de service, keystores). | `git grep` | Ouvert : restreindre la clé (référents HTTP, application Android) dans la console GCP. |
| 24 | mineur | Loi 25 | « Effacer l'appareil » n'efface pas les notes d'étude legacy `mobilis.research.notes.*` (localStorage), ni les dossiers v2 d'une autre portée (`local` / `anon`) sur le même appareil. | `research/study.ts` l. 32 ; `records-account.ts` (portée courante seulement). | Ouvert |
| 25 | mineur | Architecture | Doublons entre volets : 4 fonctions d'uid aux replis différents (`'local-user'` dans gait, `'local'` dans research et treatment, `'anon'` dans patients) ; 5 `ensureCss` ; `.sr-only` défini dans 3 CSS ; `esc` redéfini dans `report.ts` et `rom.ts`. Pas de cycle, pas d'`any`, 3 `eslint-disable` justifiés. | grep | Ouvert : un `currentUid` et un `ensureFeatureCss` communs. |
| 26 | mineur | Recherche (export) | Une évaluation faite hors contexte d'étude mais rattachée par date à l'échéance donne des lignes CSV en double (même mesure, même date, avec et sans condition). | `export-tel.csv` (R-001, t0 : chaque mesure deux fois). | Ouvert |
| 27 | mineur | Vue patient | La vue patient garde les causes et diagnostics différentiels de la littérature (ex. SLA, AVC). La spec ne les exclut pas, mais ils peuvent inquiéter le patient. | Parcours patient. | Ouvert (choix clinique) |

### Conformité aux décisions cliniques §10 (code et sondes Vitest)

| Décision | Constat |
|---|---|
| 1. Vitesse, Bohannon 1997, % de la norme et z | Conforme. Écran : « 97 % de la norme · z = −0,2 ». |
| 2. ±2 ET ; MDC en suivi | Conforme (`zThreshold: 2`, `normZ`). MDC en A/B : vitesse 0,10 m/s ≥ MDC 0,08 (`to_verify`). |
| 3. Hanche cuisse–verticale | Conforme (`hipConvention: 'thigh_vertical'`, `kinematics.ts`). |
| 4. Pied tombant 0 / −5°, corrélation obligatoire | Seuils conformes et configurables (−1° → possible, −5,1° → probable). **Corrélation non obligatoire** (#7). |
| 5. Frontal = « estimation », mis en avant seulement si facteur limitant | Conforme (`estimate`, `limitingFactor`, étiquette « estimation » à l'écran). |
| 6. ≥ 3 cycles, 2/3, configurable | Seuil de 3 cycles conforme (2 cycles → `insufficient_data`) ; réglage **corrigé** (#5) ; règle des 2/3 **non stricte** (#6) ; réglage non mémorisé par patient (#14). |
| 7. Hollman dès 70 ans, Bohannon 2011 de 80 à 99 ans, pas de pédiatrie | Conforme : 69 ans → Bohannon 1997 ; 70 et 79 → Hollman 2011 ; 80 et 99 → Bohannon 2011 sans ET ; moins de 18 ans → aucune norme. |
| 8. Patient : exercices et aides ; pas de toxine, chirurgie, orthèse ni prothèse | Plan de traitement conforme (`plan.test.ts`) ; résultats de marche **corrigés** (#1). Le suivi patient cite les interventions (attendu : le patient s'y mesure). |
| 9. Aides techniques par repères et coude à 20–30°, pas de formule par la taille | Conforme (repères trochanter et pli du poignet, vérification caméra du coude, formules signalées « non utilisées »). |
| 10. Toutes les déviations prothétiques en alerte, audience clinicien | Conforme : 18 déviations du catalogue, fouets, pistonnage, rotation et hyperlordose en `observe` (« estimation »), `audience: 'clinician'`, routes `prothese*` réservées au clinicien. |
| 11. A/B avec erreur de mesure ; dossier, création automatique | Marges Stenum 2021 et IC 95 % (**corrigé** #4, #16) ; création automatique du dossier chez le clinicien : implémentée et testée avec un faux Firestore (`records-sync.test.ts`), risque d'abus (#10). |
| 12. Amputés comparés à la norme générale | Conforme (`assessGait` sur les mêmes analyses). |
| Pas de score global | Conforme : `GaitAssessment` n'a pas de champ de score ; le score par défaut est une confiance, libellée comme telle. |
| Statuts des 6 déterminants | Conforme : `affected` / `preserved` / `uncertain` ; rotation pelvienne toujours `uncertain` sans repères « monde ». |

### Sécurité et vie privée : autres vérifications (conformes)

* **Aucune vidéo ni image stockée** : la capture garde des trames de pose ; `camera.ts` n'échantillonne qu'une
  luminance 32 × 24 en mémoire (vérification de l'éclairage). Aucun `MediaRecorder`, `toDataURL` ou `toBlob` dans les
  volets ; `videoRetained: false` est exigé par les règles pour `assessments`. Les volets v2 n'appellent pas Gemini.
* **Règles Firestore** : lecture limitée au propriétaire ou au destinataire de `sharedWith` ; écriture par le
  propriétaire seulement ; `docId = ownerUid_id` ; `ownerUid` immuable ; `plans`, `studies` et `interventions` jamais
  partageables ; partage limité à un destinataire différent de soi, auteur du `rx` cité, pour un document qui concerne
  l'auteur. Aucune fuite entre patients ni entre cliniciens trouvée, aucune élévation de droits (le rôle n'est pas
  utilisé par les règles). Réserves : #9, #10. Mineur : `createdAt` n'est pas figé à la mise à jour, et un partage
  reste valide si le `rx` est supprimé ensuite.
* **Drapeau `gait` désactivé** : parité texte identique à la v1.15 sur 24 écrans ; entrées de navigation et routes
  masquées. Le magasin des dossiers est installé à l'import, mais sa synchronisation est bloquée par `enabled()`.
  Remarque : n'importe qui peut activer le drapeau par `?flags=gait`. Ce n'est pas une barrière de sécurité, les
  routes cliniques restant filtrées par rôle.

## 4. Parcours dans Chromium (captures d'écran)

Scripts et captures dans le dossier de travail de l'agent (hors dépôt) :
`/tmp/claude-0/-home-claude/49c87403-cb42-58c3-b262-64a797ad204c/scratchpad/shots/`. Les états avant correction sont
dans le sous-dossier `avant/`. Préfixes : `tel-` (390 × 844), `desk-` (1280 × 900) ; `clin-` (clinicien),
`pat-` (patient), `res-` (écrans de résultat).

Écrans couverts :

* `#/patients`, création de dossier (feuille), `#/patient/<id>` ;
* `#/marche/<id>` : formulaire, puis choix des vues ;
* `#/plan/<id>` : vide, puis brouillon généré ;
* `#/aides/<id>`, `#/prothese/<id>` ;
* `#/recherche`, puis étude créée depuis le gabarit « toxine botulique » : angle personnalisé hanche–genou–cheville
  en oscillation moyenne, enregistrement, inscription du patient ;
* `#/suivi/<id>`, `#/suivi`, `#/etude/<id>` avec exports CSV (1 050 o), JSON (34 ko) et PDF (6,9 ko) ;
* `#/dossier` (patient) ;
* `#/marche-res/<id>` (normal, pied tombant, prothèse), `#/marche-ab/<a>/<b>`, `#/prothese-res/<id>`,
  `#/prothese-liste/<id>` ;
* accès refusés : patient vers les routes du clinicien, évaluation d'un autre patient.

Résultat après correctifs :

* 0 erreur de console ou de page ;
* aucun débordement horizontal ;
* bandeau « Outil d'évaluation clinique — non homologué Santé Canada » sur tous les écrans v2 ;
* « à valider par le clinicien » sur les résultats, la prothèse et la recherche ;
* « estimation » sur les mesures frontales et les angles personnalisés ;
* clés brutes restantes : #20 ; cibles tactiles : #21.

## 5. Correctifs (branche `dev-v2-audit`, un commit par correctif, chacun avec son test)

`d10c3ff` débordement 390 px · `98adae6` marge A/B des indices de symétrie · `c8dd8ab` libellés lisibles ·
`6eed1ab` vue patient et rôle du profil · `99441bb` cycles ≥ 3 transmis au moteur · `87d469b` marge « — » ·
`ea91587` code mort · `1c7c9de` chronologie sans codes bruts. Nouveaux tests : `gait/css.test.ts`,
`gait/measurement-error.test.ts`, `gait/present-labels.test.ts`, `gait/patient-view.test.ts`,
`gait/cycles-config.test.ts`, `clinic/condition-summary.test.ts`.

Après rebasage sur `origin/dev-v2` (traductions) : `npm run check` vert — Vitest 83 fichiers / 612 tests, 0 erreur de dépendances (164 avertissements), build et `verify:dist` conformes.

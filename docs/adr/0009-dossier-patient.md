# ADR 0009 — Dossier patient : persistance, synchronisation et partage patient → clinicien

* Statut : proposée — 2026-11-23 (règles Firestore **non publiées**)
* Contexte : spec v2 §7, §8, §10.11 ; brief `docs/v2-features-brief.md` (volet « patients »)

## Contexte
Les volets v2 (marche, prothèses, traitement, recherche) écrivent leurs documents par `getRecordsDb()`
(`DatabasePort`, collections `patients`, `assessments`, `plans`, `studies`, `interventions`, `annotations`,
`followups`). Il faut : un fonctionnement hors ligne, une synchronisation pour un compte connecté, et la transmission
au clinicien des données d'un patient avec compte, avec création automatique du dossier chez le clinicien.

## Décision
### Persistance locale d'abord
* `services/db/local/records-kv.ts` : IndexedDB (`mobilis-v2`), repli localStorage, mémoire en test. Clés
  `mobilis.v2.<uid|local|anon>.<collection>.<id>` (une entrée par document), `…~<collection>.<propriétaire>.<id>`
  pour les documents partagés par un autre compte (lecture seule), `….​_meta` pour l'état de synchronisation.
* Une entrée garde le document et son état (`dirty`, `deleted` = suppression en attente, `synced`, `sharedWith`).
  Format de stockage versionné (`f: 1`) ; une valeur nue (format 0) est reprise comme document modifié.
* Migrations de schéma par collection (`local/record-schemas.ts`, chaîne 0 → 1 testée) ; un document d'une version
  plus récente que l'app est conservé tel quel et masqué des lectures.
* `routes.ts` du volet installe la base au démarrage (`installRecordsDb()` → `setRecordsDb()`), une façade stable qui
  suit le compte courant (`store.onUserChange`).

### Synchronisation (`services/db/sync/records-sync.ts`)
* Déclenchée à la connexion, au retour en ligne, à l'ouverture des écrans du dossier et 1,5 s après une écriture ;
  **seulement si le drapeau `gait` est actif** et pour un compte en ligne (compte local : appareil seulement).
* Conflit simple : `updatedAt` le plus récent gagne (égalité : version locale). Un document déjà envoyé puis absent en
  ligne a été supprimé ailleurs → supprimé localement ; une suppression locale est envoyée puis oubliée.
* Erreur réseau : rien n'est perdu, les modifications restent marquées et repartent plus tard.
* Firestore refuse les tableaux imbriqués (courbes `number[][]`) : encodage réversible `{ __arr: [...] }`.

### Modèle Firestore et droits
* Collections de **premier niveau** (`patients`, `assessments`, …), id Firestore `<ownerUid>_<id>` : pas de collision
  entre la fiche du patient (`id = uid`) et le dossier du clinicien pour ce patient (même `id`, autre propriétaire).
  Pas de `collectionGroup` : le SDK local (www/vendor/firebase.js) ne l'exporte pas.
* **Champ `sharedWith: [uidClinicien]` + `sharedVia: <code rx>`** (choisi plutôt qu'une sous-collection par
  clinicien) : le patient reste seul propriétaire et seul à écrire ; le clinicien lit par
  `where('sharedWith', 'array-contains', uid)`. Aucune écriture d'un compte dans l'espace d'un autre.
* Écriture : propriétaire seulement (`ownerUid == auth.uid`, id cohérent, `schemaVersion` entier ≥ 1, dates,
  `videoRetained == false` pour les évaluations). Lecture : propriétaire, ou destinataire du partage.
* Partage valide seulement si : un seul destinataire, différent de soi, **auteur du programme**
  `rx/{sharedVia}.by` (empêche d'imposer des données à un clinicien quelconque) ; collection `patients` (fiche dont
  `id = uid`), `assessments`, `annotations` ou `followups` ; document qui concerne l'auteur (`patientId = uid`).
  `plans`, `studies`, `interventions` : jamais partagés.

### Transmission patient → clinicien
* Lien : `profile.rxCode` du patient (programme importé) → `rx/{code}.by` = uid du clinicien auteur
  (`store.saveRx` écrit `by`). **Consentement** : le partage n'a lieu que si le patient a activé « Partager avec mon
  clinicien » (`profile.shareProgress`, même interrupteur que le suivi v1) — Loi 25. Retrait du consentement ou
  changement de programme : la synchronisation suivante renvoie les documents avec `sharedWith: []` et le clinicien ne
  les voit plus. Lien inconnu (hors ligne) : partage inchangé.
* Création automatique : à sa synchronisation, le clinicien lit les fiches et documents partagés ; s'il n'a pas de
  dossier `patients/<uidPatient>`, il en crée un **dans son espace** (même id, nom affiché, année de naissance, taille,
  sexe, côté, poids si fournis). La chronologie se relie par `patientId`.
* Le clinicien qui supprime ce dossier le voit recréé seulement si le patient transmet une donnée plus récente
  (mémo par appareil `_meta.dismissed`).

### Suppression (Loi 25)
* Patient : « Mon dossier » → supprimer ses données v2 (appareil + en ligne ; échec réseau → rien n'est effacé).
  Les boutons existants « Effacer l'appareil » et « Supprimer mes données en ligne » effacent aussi les données v2.
* Clinicien : suppression d'un dossier possédé + tout ce qu'il y a enregistré, retrait des études ; les données du
  patient restent dans le compte du patient.

## Cas à tester avec l'émulateur (`firebase emulators:exec`, non disponible dans l'environnement de l'agent)
Les tests Vitest (`src/services/db/sync/records-sync.test.ts`) exercent la logique avec un faux Firestore qui applique
les mêmes contrôles. À vérifier sur l'émulateur avant publication :
1. Propriétaire : créer/lire/modifier/supprimer `patients/{uid}_{id}` → permis ; `ownerUid` d'un autre → refusé.
2. Id incohérent (`docId != ownerUid + '_' + id`) → refusé ; `schemaVersion` absent ou non entier → refusé.
3. Changer `ownerUid` à la mise à jour → refusé ; modifier/supprimer le document d'un autre → refusé.
4. `assessments` avec `videoRetained: true` ou absent → refusé.
5. Partage vers l'auteur de `rx/{code}` → permis ; vers un autre uid, vers soi, deux destinataires, `sharedVia`
   absent ou programme inexistant → refusé.
6. Partage d'une évaluation dont `patientId != auth.uid` → refusé ; partage d'un `plans`/`studies`/`interventions` → refusé ;
   partage d'une fiche `patients` dont `id != auth.uid` → refusé.
7. Clinicien destinataire : `get` et requête `where('sharedWith','array-contains', uid)` → permis ; écriture → refusée.
8. Requête sans filtre, ou `where('ownerUid','==', autre)` → refusée ; utilisateur non connecté → tout refusé.
9. Après retrait (`sharedWith: []`), le clinicien ne peut plus lire le document.
10. Règles v1 (`users`, `rx`, `progress`) inchangées : tests existants du suivi partagé toujours valides.

## Conséquences
* Les autres volets n'ont rien à changer : `getRecordsDb()` devient persistant dès l'import de `features/index.ts`.
* Publication des règles : à faire par l'utilisateur après tests sur l'émulateur (`firebase deploy --only firestore:rules`).
* Limites : conflit au niveau du document (pas de fusion champ par champ) ; un dossier créé à la main puis un dossier
  créé automatiquement pour le même patient restent distincts (fusion manuelle à prévoir) ; le mémo « dossier supprimé »
  est par appareil.

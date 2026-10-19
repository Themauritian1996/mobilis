# Mobilis — réadaptation MSK guidée par caméra

Application web + APK Android qui filme le patient pendant ses exercices, analyse le mouvement en 2D **sur le téléphone** (MediaPipe, Google), corrige en direct à voix haute et adapte le programme chaque semaine.

> Outil d'aide à l'exécution d'exercices prescrits. Ne remplace pas l'évaluation d'un professionnel. Voir « Réglementaire » plus bas.

## En ligne

| Quoi | Où |
|---|---|
| Site web | https://themauritian1996.github.io/mobilis/ (GitHub Pages, publié à chaque envoi sur `main`) |
| APK Android | onglet **Actions → APK Android → dernière exécution → Artifacts** (ou une Release `v*`) |
| Comptes et données | Firebase `mobilis-6828b` : Google + courriel, Firestore à Montréal, règles « chaque patient voit seulement ses données » |
| Coach Gemini | clé personnelle entrée dans **Profil → Coach IA** (GitHub Pages n'a pas de serveur). Pour une clé cachée côté serveur, voir l'option Cloudflare plus bas. |

## Nouveautés 1.6

- **Contrôle « bon mouvement » (fiable, sur le téléphone)** : en continu, les angles du patient (tronc, épaule, coude, hanche, genou) sont comparés à ceux de la **démonstration** de l'exercice (cinématique du schéma, de l'image de départ à celle d'arrivée). Articulations qui doivent rester fixes : écart et mouvement parasite ; articulations qui doivent bouger : amplitude et zone. Exemple : flexion du biceps à la place du pendule de Codman → « Ce n'est pas le mouvement prévu. Penche le tronc vers l'avant… » puis « Garde le coude tendu ». Fonctionne aussi pour les exercices guidés quand la caméra miroir est active. Test : 43/43 exercices reconnus sans fausse alerte, biceps au lieu du pendule signalé 100 % du temps (`tests/movematch.test.mjs`).
- **Lignes de guidage sur la vidéo** : bleu = articulation qui doit bouger (angle affiché), rouge = à corriger, vert pointillé = position visée. Réglage dans Profil.
- **L'IA ne peut plus dire « excellent » si le mouvement ne correspond pas** ; elle reçoit le résultat du contrôle et n'est pas appelée tant que le mouvement est faux.
- **Résumé de série instantané** : répétitions, qualité, % de mouvement conforme, détail rép. par rép. (amplitude, durée, à corriger) et commentaire de l'app tout de suite ; le commentaire de l'IA le remplace s'il arrive en moins de 8 s (modèle rapide `gemini-flash-lite-latest`, sans réflexion, limite de temps).
- **Correctif** : les animations des démonstrations partaient parfois de la position d'arrivée (paramètres par défaut ignorés) ; elles montrent maintenant tout le mouvement.

## Nouveautés 1.5

- **Coach IA « précis » (par défaut)** : après chaque répétition, Gemini reçoit l'image clé du mouvement (point le plus avancé) avec le squelette dessiné (articulations fautives en rouge), les **mesures anatomiques** de la caméra (angle au sommet, % de l'amplitude visée, pire valeur de chaque contrôle vs sa limite, durée de la rép.) et une **liste fermée de corrections valides** pour cet exercice et ce plan (de côté : pas de valgus ; de face : pas de flexion du tronc ni de profondeur). Il répond en JSON ; l'app **rejette toute correction contredite par les mesures** (ex. « descends plus » alors que l'amplitude est atteinte) et prononce la consigne validée du programme. Maintien : toutes les 6 s ; exercices guidés : toutes les 8 s (posture, squelette si disponible).
- **Mode « conversation en direct »** (au choix dans Profil) : flux vidéo continu, maintenant avec images annotées et mesures envoyées à chaque point.
- **Aperçu de la séance** (bouton Commencer) : exercices, durée estimée, matériel, espace et position du téléphone, règle de douleur, consignes de sécurité, note du clinicien.
- **Réglages avant la séance** : séries, répétitions, maintien, repos entre les séries, passer un exercice aujourd'hui ; pour aujourd'hui ou « garder pour les prochaines séances » (indiqué dans le rapport au clinicien). **Minuterie de repos** entre les séries.

## Nouveautés 1.4

- **Coach IA en direct (Gemini)** : pendant la série, Gemini regarde la vidéo de la caméra (environ 1 image par seconde via l'API Live) et corrige à voix haute en une courte phrase toutes les ~7 s, en tenant compte des erreurs détectées par l'app. Le texte s'affiche dans une bulle ✦. Fonctionne aussi pour les exercices guidés (caméra en miroir).
- **On/off** : bouton ✦ pendant la séance (point vert = en direct), interrupteur sur l'écran de préparation et réglage dans Profil → Coach IA. Désactivé par défaut ; demande la clé Gemini personnelle.
- **Robuste** : si un modèle Live est refusé, l'app essaie le suivant (`CONFIG.geminiLiveModels`) ; si aucun ne répond, elle passe à une analyse d'image toutes les 8 s. Les sessions vidéo Live (limitées à 2 min) sont relancées automatiquement. Les consignes de l'app se taisent pendant que Gemini parle.
- **Vie privée** : les images vont à Google seulement quand le coach en direct est activé ; Mobilis n'en garde aucune.

## Nouveautés 1.3

- **Vidéo selfie en direct** : la caméra avant filme le patient, qui se voit en miroir avec le squelette et les corrections en couleur (rouge = articulation à corriger) pendant que la voix le guide. Pour les exercices guidés (mouvements trop fins pour l'analyse), la caméra avant sert de miroir.
- **Vidéo on/off** : icône œil pendant la séance, interrupteur sur l'écran de préparation et réglage par défaut dans Profil. Vidéo masquée = l'image disparaît, mais l'analyse et les corrections continuent.
- **Icône « Voir comment faire »** (toujours visible) : ouvre la démonstration animée de l'exercice, ses points clés et ses étapes, sans quitter la séance. La vignette du schéma ouvre aussi la démonstration.

## Nouveautés 1.2

- **Affichage mobile corrigé** : la page reçue par le patient (lien ou QR) s'affichait en tout petit sur Chrome mobile. La mise en page « ordinateur » ne s'active plus sur un téléphone, même en mode « site pour ordinateur », et aucun contenu ne déborde de l'écran.
- **Tester comme patient** (clinicien) : bouton **Tester** sur chaque programme et onglet **Vue patient**. Le clinicien voit exactement l'app du patient (caméra, voix, questions) ; rien n'est envoyé au patient. Bandeau « Mode test » pour revenir aux patients.
- **Retour du patient écrit ou dicté** : après chaque exercice, la question est posée à voix haute ; le patient répond au clavier ou avec **Dicter** (reconnaissance vocale du téléphone dans l'APK, du navigateur sur le web, sinon Gemini). Le coach répond au commentaire, et le clinicien le voit dans le suivi et le rapport.
- **6 langues** : français, anglais, espagnol, portugais, arabe (de droite à gauche) et chinois. Le clinicien choisit la langue du patient dans le programme ; écrans, consignes vocales, coach IA et diagnostic écrit suivent cette langue. Traductions : `i18n-src/` → `node scripts/build-lang.mjs`.

## Nouveautés 1.1

- **Départ sans jargon** : le patient écrit son diagnostic dans ses mots (reconnu automatiquement), sinon il répond à des questions simples par région. Les problèmes sont affichés avec un nom compréhensible (ex. « Douleur à l’épaule en levant le bras ») et le terme médical en petit.
- **Point de départ adapté** : durée du problème, exercices déjà commencés et tolérance → phase et niveau de départ.
- **Mode clinicien** : choisir région, problème, phase, exercices et niveaux, ajouter une note et le prochain rendez-vous, puis envoyer par **code à 6 caractères, QR ou lien**. Le patient reçoit le programme tout prêt. Le clinicien voit l’assiduité, la douleur et la qualité si le patient partage son suivi, et peut **ajuster** : le patient reçoit la mise à jour à la prochaine ouverture. Progression automatique ou gérée par le clinicien.
- **Calendrier de suivi** : séances faites / prévues / manquées, rendez-vous, jours d’exercices, rappels (notifications dans l’APK, fichier agenda sur le web).
- **Anatomie sur les schémas** (bouton « Anatomie ») : muscles, tendons, nerfs, fascia, articulations.
- **Journal de douleur**, **journée difficile** (programme allégé 2 jours), **prochaine étape** (ce qui manque pour changer de phase), **rapport pour le clinicien** (copier / partager), **ajuster mon programme**.
- **Design sobre** noir et blanc, vert = progrès, rouge = douleur ; thème auto / clair / sombre ; barre latérale sur ordinateur.
- **Connexion Google dans l’APK** : ouverture dans le navigateur du téléphone (page `auth.html`) puis retour automatique dans l’app.

## Ce que fait l'app

| Fonction | Détail |
|---|---|
| Comptes | Google ou courriel (Firebase). Sans configuration : mode local (données sur l'appareil). |
| Langues | Français / anglais, partout (interface, consignes vocales, coach IA). |
| Bibliothèque | 10 régions, 40 pathologies fréquentes en physiatrie, 61 exercices avec schéma cinétique animé, anatomie activable, points clés numérotés et étapes. |
| Analyse caméra | 34 exercices suivis en 2D. Chaque exercice est filmé **en alternance vue de côté (plan sagittal) / vue de face (plan frontal)** selon les séries. |
| Corrections en direct | Valgus du genou, tronc penché, cambrure, haussement d'épaules, bassin qui tombe, asymétrie, talon qui décolle, amplitude incomplète, vitesse… |
| Coach vocal | Consignes instantanées (voix de l'appareil, sans latence) + commentaire de fin de série par Gemini (texte, option voix Gemini, option image fixe). |
| Personnalisation | Niveau 1–5 par exercice (répétitions, maintien, amplitude visée), phases 1→3 selon les semaines **et** la douleur, règle de surveillance de la douleur (limite propre à chaque pathologie), check-in du lendemain. |
| Sécurité | Dépistage des drapeaux rouges à l'inscription, arrêt conseillé si douleur > limite. |
| Progrès | Graphiques hebdo (douleur, qualité, difficulté, assiduité), niveaux, historique, bilan IA de la semaine. |

## Structure

```
www/                    ← le site (aussi embarqué dans l'APK)
  js/data/exercises.js  ← exercices, schémas, critères de suivi  ✏️ à personnaliser
  js/data/pathologies.js← régions, pathologies, phases, limites de douleur  ✏️
  js/pose.js            ← vision 2D, métriques, compteur de répétitions
  js/program.js         ← règles de progression
  js/coach.js           ← voix et Gemini
  js/config.js          ← clés Firebase, adresse du coach  ✏️
functions/api/coach.js  ← fonction Cloudflare (garde la clé Gemini secrète)
.github/workflows/      ← compilation automatique de l'APK
tests/                  ← test du compteur (le bonhomme du schéma « fait » chaque exercice)
```

## Mise en ligne — étape par étape

### 1. GitHub
1. Crée un dépôt (ex. `mobilis`) sur github.com, privé si tu veux.
2. Envoie tout le contenu de ce dossier (glisser-déposer dans « Add file → Upload files », ou demande à Claude Code de le pousser).

### 2. (Option) Site sur Cloudflare Pages avec clé Gemini côté serveur
À faire seulement si tu veux remplacer GitHub Pages. Ensuite, dans `www/js/config.js`, mets `siteUrl` = ton adresse pages.dev et `coachEndpoint: '/api/coach'`.

1. dash.cloudflare.com → **Workers & Pages → Create → Pages → Connect to Git** → choisis le dépôt.
2. Réglages de build :
   - Build command : `bash scripts/fetch-model.sh`
   - Build output directory : `www`
3. **Settings → Variables and secrets** : ajoute `GEMINI_API_KEY` (clé de aistudio.google.com, type *Secret*). Facultatif : `GEMINI_MODEL` (défaut `gemini-flash-latest`), `GEMINI_TTS_MODEL`.
4. Redéploie. Ton site est à `https://<nom>.pages.dev`.

### 3. Comptes Google / courriel (Firebase, gratuit)
1. console.firebase.google.com → **Ajouter un projet**.
2. **Authentication → Méthode de connexion** : active *Google* et *Adresse e-mail/Mot de passe*.
3. **Authentication → Paramètres → Domaines autorisés** : ajoute `<nom>.pages.dev`.
4. **Firestore Database → Créer** (mode production), puis onglet *Règles* : colle le contenu de `firestore.rules`.
5. **Paramètres du projet → Vos applications → Web (</>)** : copie `apiKey`, `authDomain`, `projectId`, `appId` dans `www/js/config.js`.
6. Envoie la modification sur GitHub : Cloudflare et l'APK se mettent à jour.

### 4. APK Android
- Chaque envoi sur `main` compile l'APK : onglet **Actions** du dépôt → dernière exécution → **Artifacts → Mobilis-apk**.
- Pour une page de téléchargement publique : crée une étiquette `v1.0` (Releases → Draft a new release → tag `v1.0`). L'APK y sera joint.
- Dans `www/js/config.js`, `siteUrl` = adresse du site Cloudflare : l'APK l'utilise pour parler au coach Gemini.
- La connexion **par courriel** fonctionne directement dans l'APK.

### 5. (Facultatif) Connexion Google *dans l'APK*
Il faut une signature stable et le fichier Firebase Android :
1. Crée une clé de signature (une fois) : `keytool -genkey -v -keystore release.jks -alias mobilis -keyalg RSA -keysize 2048 -validity 10000`
2. Dans Firebase : **Ajouter une application Android**, package `ca.mobilis.app`, colle l'empreinte SHA-1 (`keytool -list -v -keystore release.jks`). Télécharge `google-services.json`.
3. Dépôt GitHub → **Settings → Secrets and variables → Actions** :
   - `GOOGLE_SERVICES_JSON` = contenu du fichier
   - `ANDROID_KEYSTORE_BASE64` = `base64 -w0 release.jks`
   - `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (`mobilis`), `ANDROID_KEY_PASSWORD`
4. Relance le workflow : l'APK sera signé avec la connexion Google native.

## Tester en local
```
npm install
npm test            # le compteur doit compter 5/5 sur tous les exercices suivis
npm run fetch-model # modèle de pose hors ligne
npm run serve       # http://localhost:3000 (la caméra exige https ou localhost)
```

## Personnaliser le contenu clinique
- **Langues** : après avoir modifié un texte FR/EN du contenu, lance `node scripts/i18n-dump.mjs` (liste anglaise de référence), ajoute les nouvelles lignes dans `i18n-src/<langue>.text.tsv`, puis `node scripts/build-lang.mjs` (il signale tout texte manquant).
- **Ajouter un exercice** : copie un bloc dans `exercises.js`. `fig.frames` = positions clés du bonhomme (angles des segments en degrés : 0 = haut, 90 = avant, 180 = bas). `track.planes.side/front` = métrique, amplitude de départ/fin, erreurs à surveiller.
- **Modifier un protocole** : dans `pathologies.js`, `phases` liste les exercices des semaines 1–2, 3–6 et 7+ ; `painMax` = douleur tolérée pendant l'exercice.
- **Règles de progression** : `program.js → adjustLevel` (monte après 2 séances faciles et propres, descend si douleur > limite, lendemain « pire », difficulté maximale ou qualité < 50 %).

## Limites connues (honnêtes)
- 2D, une caméra : les rotations (rotation externe, rotation thoracique) et les mouvements de la main sont estimés grossièrement ; 27 exercices fins sont donc en **mode guidé** (voix + minuterie, sans analyse).
- Vue de face : la flexion du genou est mesurée par la descente du bassin (la projection 2D de l'angle est peu fiable de face).
- La qualité dépend du cadrage, de l'éclairage et des vêtements. Prévoir des essais réels et l'ajustement des seuils (`from`, `to`, `max`) sur de vrais patients.
- Le premier lancement télécharge le modèle si l'APK n'a pas été compilé avec `fetch-model`.

## Réglementaire et vie privée (Québec / Canada)
- Positionné comme **outil d'aide à l'exécution d'exercices prescrits**. S'il prétend diagnostiquer ou ajuster un traitement de façon autonome, il pourrait être un logiciel dispositif médical (SaMD) selon Santé Canada.
- La vidéo ne quitte jamais le téléphone. Seules des métriques (et, si le patient l'active, une image fixe par série) sont envoyées à Gemini.
- Données de santé dans Firestore : la **Loi 25** s'applique (consentement, responsable de la protection des renseignements, évaluation des facteurs relatifs à la vie privée si commercialisé). Choisir une région Firestore au Canada (`northamerica-northeast1`, Montréal).

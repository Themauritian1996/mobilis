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

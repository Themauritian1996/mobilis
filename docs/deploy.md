# Hébergement privé de Mobilis (Firebase) — guide pas à pas

But : que Mobilis soit accessible **seulement par lien** (et non plus via un dépôt GitHub public), et que l'APK de test aille seulement à des testeurs choisis.

> Rien de ce qui suit n'est fait automatiquement. Les étapes marquées **TOI** sont à faire par toi. Tant que les secrets n'existent pas, les workflows concernés se **sautent** sans erreur.

## Ce qui est déjà prêt dans le dépôt

| Fichier | Rôle |
|---|---|
| `firebase.json`, `.firebaserc` | Hosting (dossier `dist`), réécriture vers `index.html`, en-têtes de cache et de sécurité, règles Firestore (`firestore.rules`, inchangées) |
| `.github/workflows/hosting-preview.yml` | À chaque envoi sur `dev-v2` / `dev-v2-*` : build puis **canal d'aperçu** (URL non devinable, expire après 30 jours) |
| `.github/workflows/hosting-live.yml` | Site **live** : lancement **manuel** seulement, depuis `main` |
| `.github/workflows/apk-distribution.yml` | APK de test (debug) envoyé au groupe de testeurs `testeurs` via Firebase App Distribution |

La politique de sécurité de contenu (CSP) est en mode **Report-Only** : elle signale les violations dans la console du navigateur sans rien bloquer. L'app utilise des scripts en ligne (`index.html`) et un service worker ; après quelques jours sans alerte (ouvre la console, onglet Console, sur l'aperçu), on pourra la passer en mode bloquant en renommant `Content-Security-Policy-Report-Only` en `Content-Security-Policy` dans `firebase.json`. Origines autorisées : Firebase/Google (`*.googleapis.com`, `*.firebaseapp.com`, `*.firebaseio.com`), Gemini (`generativelanguage.googleapis.com`, y compris le WebSocket du coach en direct), les modèles MediaPipe (`storage.googleapis.com`), et le relais IA éventuel (`*.pages.dev`, Cloudflare). Si ton relais est ailleurs, ajoute son adresse dans `connect-src`.

## Étape A (TOI) : créer le compte de service et le secret GitHub

Méthode la plus simple, dans un terminal sur ton ordinateur (Node.js installé) :

1. `npm install -g firebase-tools` puis `firebase login`.
2. Dans le dossier du dépôt : `firebase init hosting:github`. Réponds : projet `mobilis-6828b`, dépôt `Themauritian1996/mobilis`. **Refuse** que l'outil génère les workflows (ils existent déjà) ; il crée le compte de service et enregistre le secret dans GitHub.
3. Le secret doit s'appeler exactement `FIREBASE_SERVICE_ACCOUNT_MOBILIS_6828B`. Si l'outil lui donne un autre nom, ajoute-le toi-même (étape suivante).

Méthode manuelle (console Google Cloud) : console.cloud.google.com → projet `mobilis-6828b` → IAM et administration → Comptes de service → Créer. Rôles : **Administrateur Firebase Hosting** et **Utilisateur de compte de service** ; pour la distribution d'APK, ajoute **Administrateur Firebase App Distribution**. Ensuite : Clés → Ajouter une clé → JSON (le fichier se télécharge). Sur GitHub : dépôt → Settings → Secrets and variables → Actions → New repository secret → nom `FIREBASE_SERVICE_ACCOUNT_MOBILIS_6828B`, valeur = tout le contenu du fichier JSON. Supprime ensuite le fichier JSON de ton ordinateur. **Ne le mets jamais dans le dépôt.**

Pour que l'aperçu fonctionne, Firebase Hosting doit être activé : console Firebase → Hosting → Commencer.

## Étape B (TOI) : APK de test privé (facultatif)

1. Console Firebase → Paramètres du projet → Vos applications → Ajouter une application **Android**, nom de paquet `ca.mobilis.app`.
2. Copie l'« ID de l'application » (forme `1:123456789:android:abc...`) et crée le secret GitHub `FIREBASE_APP_ID_ANDROID`.
3. Console Firebase → App Distribution → Commencer → onglet Testeurs et groupes → crée le groupe **`testeurs`** et ajoute les courriels des testeurs. Ils recevront une invitation par courriel.
4. Le compte de service de l'étape A doit avoir le rôle App Distribution (voir plus haut).

Sans ces deux secrets, `apk-distribution.yml` se saute.

## Étape C (TOI) : domaines de connexion Google

Console Firebase → Authentication → Paramètres → Domaines autorisés : le domaine `mobilis-6828b.web.app` y est déjà. Les adresses d'aperçu (`mobilis-6828b--<canal>-xxxx.web.app`) ne le sont **pas** : la connexion Google peut y échouer. Pour la tester, ajoute l'adresse exacte de l'aperçu à cette liste, ou teste la connexion sur le site live.

## Ordre sûr pour rendre le dépôt GitHub privé

Ne saute pas d'étape : passer le dépôt en privé arrête GitHub Pages et rend les Releases (donc le lien APK public) inaccessibles.

1. **Vérifier l'aperçu** : pousse (ou relance) `dev-v2` ; dans Actions → « Aperçu Firebase Hosting », ouvre l'adresse affichée à la fin du job. Teste : ouverture, connexion, caméra, coach.
2. **Déployer le live** : fusionne ce qui doit l'être dans `main` (décision à toi), puis Actions → « Site live Firebase Hosting » → Run workflow, branche `main`. Vérifie `https://mobilis-6828b.web.app`.
3. **Mettre à jour les liens** : README (ligne « Site web »), `siteUrl` dans `src/core/config.ts` si utilisé pour les liens de partage, la base Notion « 🗂 Mes projets », et les liens déjà envoyés. Distribue l'APK par App Distribution plutôt que par Release publique.
4. **Seulement ensuite**, passer le dépôt en privé : Settings → General → Danger Zone → Change visibility → Private. GitHub Pages s'arrête ; les Releases deviennent privées ; les Actions gratuites sont limitées (2 000 minutes/mois en privé).

## Limites du palier gratuit Spark (Firebase)

- Hosting : 10 Go de stockage, environ 360 Mo/jour de transfert (≈ 10 Go/mois). Les modèles de pose et MediaPipe sont lourds : surveille la consommation si beaucoup d'utilisateurs. Le service worker les garde en cache après la première visite.
- Canaux d'aperçu : maximum 50 par projet ; expiration 30 jours (configurée).
- Firestore : 1 Go stocké, 50 000 lectures et 20 000 écritures par jour.
- Authentication : suffisant pour des usages cliniques modestes (les connexions par téléphone/SMS sont limitées ; Google ne l'est pas).
- App Distribution : gratuit.
- Pas de Cloud Functions sur Spark (le relais IA reste sur Cloudflare).

Les chiffres peuvent changer : vérifie firebase.google.com/pricing.

## La clé web Firebase est publique

La valeur `apiKey` de `src/core/config.ts` (config web Firebase) n'est **pas un secret** : elle identifie le projet et se retrouve dans toute app Firebase. La sécurité des données repose sur les **règles Firestore**, pas sur le secret de cette clé. Ne la déplace pas. Il est quand même recommandé de la **restreindre** (TOI) :

1. console.cloud.google.com → projet `mobilis-6828b` → API et services → Identifiants → clé « Browser key ».
2. Restrictions d'application : **Sites web (référents HTTP)** ; ajoute `https://mobilis-6828b.web.app/*`, `https://mobilis-6828b.firebaseapp.com/*`, `https://mobilis-6828b--*.web.app/*` et, tant que Pages est utilisé, `https://themauritian1996.github.io/*`. L'APK charge l'app depuis `https://localhost` (Capacitor) : ajoute `https://localhost/*` si la connexion échoue dans l'APK.
3. Restrictions d'API : limite aux API réellement utilisées (Identity Toolkit, Token Service, Cloud Firestore).
4. Si tu crées une clé distincte pour l'app Android, restreins-la à **Applications Android** : paquet `ca.mobilis.app` + empreinte SHA-1 de la signature.

Teste la connexion après chaque changement de restriction (la propagation prend quelques minutes).

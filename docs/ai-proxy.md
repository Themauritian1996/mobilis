# Relais IA (accès IA partagé avec tes patients)

But : permettre à tes patients d'utiliser le coach IA de Mobilis **sans saisir de clé**, sans que ta clé Gemini voyage jusqu'à leur téléphone. La clé reste dans un petit serveur gratuit (fonction Cloudflare Pages `functions/api/coach.js`) ; le programme ne transmet que l'adresse du relais et un jeton.

> La création du compte Cloudflare, la clé Gemini et les secrets sont des actions **que tu fais toi-même** (rien n'est créé automatiquement).

## Ce que le relais couvre

| Fonction de l'app | Par le relais ? |
|---|---|
| Commentaire de série, bilan hebdomadaire, réponse au commentaire | oui |
| Coach précis (analyse d'une image par répétition) | oui |
| Dictée par Gemini (transcription), voix Gemini (TTS) | oui |
| Conseil de placement / de position de départ sur image | oui |
| **Coach en direct par vidéo (Gemini Live, WebSocket)** | **non** : un WebSocket ne passe pas par cette fonction simple. Avec l'accès partagé par relais, l'app utilise automatiquement le **coach précis** à la place (le patient en est informé dans Profil). |

Le relais n'accepte que : les modèles `gemini-*-flash` / `flash-lite` / `*-tts` (liste modifiable), au plus 8 `contents`, 4,5 Mo par requête, 1 500 jetons de sortie, et seulement avec un **jeton valide**.

## Étape 1 : obtenir une clé Gemini
1. Va sur https://aistudio.google.com/apikey et crée une clé (de préférence une clé **dédiée à Mobilis**).
2. Dans Google Cloud (console.cloud.google.com → Facturation → Budgets et alertes) : crée un budget avec alerte ; dans API et services → Quotas : fixe un plafond de requêtes par jour.

## Étape 2 : déployer la fonction sur Cloudflare Pages (gratuit)
1. Crée un compte sur https://dash.cloudflare.com (gratuit).
2. Workers et Pages → Créer → Pages → **Se connecter à Git** → choisis le dépôt de Mobilis (ou **Téléversement direct** du dossier du projet).
3. Paramètres de compilation : commande de build vide, dossier de sortie `www`. Le dossier `functions/` à la racine est détecté automatiquement : l'adresse du relais sera `https://<ton-projet>.pages.dev/api/coach`.
4. Après le premier déploiement : Paramètres → Variables et secrets → ajoute (type **Secret**) :
   - `GEMINI_API_KEY` : ta clé Gemini ;
   - **un** des deux modes de jeton :
     - `PATIENT_TOKENS` : une liste de jetons séparés par des virgules, ex. `kine-2026-a,kine-2026-b` (le plus simple : un jeton par groupe de patients ; retire-en un pour couper l'accès) ;
     - ou `TOKEN_SECRET` : un long secret au hasard ; les jetons sont alors générés avec une date d'expiration (voir ci-dessous).
   - facultatif : `ALLOWED_MODELS` (liste exacte de modèles autorisés), `GEMINI_MODEL`.
5. Redéploie (Déploiements → Réessayer) pour que les secrets soient pris en compte.
6. Test : `curl -X POST https://<ton-projet>.pages.dev/api/coach -H "Content-Type: application/json" -d '{"kind":"gen"}'` doit répondre `401 jeton invalide`.

### Jetons avec expiration (mode `TOKEN_SECRET`)
Dans un terminal avec Node.js (remplace le secret et la date) :

```
S='ton-secret' node -e "const c=require('crypto');const e='2027-06-30';console.log(e+'.'+c.createHmac('sha256',process.env.S).update(e).digest('base64url').slice(0,32))"
```
Le jeton affiché (`2027-06-30.xxxxxxxx…`) cesse de fonctionner après cette date.

## Étape 3 : l'utiliser dans Mobilis
1. Mode clinicien → ouvre ou crée un programme → section **Partager mon accès IA avec mes patients** → active.
2. Choisis **Relais (recommandé)**, colle l'adresse `https://<ton-projet>.pages.dev/api/coach` et le jeton.
3. Fixe si tu veux une **date de fin** et le **plafond d'appels IA par jour et par patient** (défaut 40). Au plafond, le coach local prend le relais jusqu'au lendemain.
4. Enregistre et envoie le code au patient. À l'import (et à chaque mise à jour du programme, vérifiée à l'ouverture de l'app), le patient reçoit l'accès : Profil affiche « IA fournie par ton clinicien », il n'a rien à saisir. Sa propre clé personnelle, s'il en ajoute une, reste prioritaire.
5. **Retirer l'accès** : désactive le réglage dans le programme et enregistre (ou supprime le programme). Au prochain contrôle en ligne du patient, l'accès disparaît. Pour une coupure immédiate : retire le jeton de `PATIENT_TOKENS` / change `TOKEN_SECRET`.

## Mode « clé partagée » (déconseillé)
Sans serveur, tu peux mettre ta clé dans le programme. **Elle est alors lisible sur l'appareil de chaque patient** (et, sans compte, dans le lien). Obligatoire dans ce cas, dans Google Cloud (Identifiants → ta clé → Restrictions) :
- Restrictions d'application : **Sites web** `https://themauritian1996.github.io/*` **et** application **Android** (nom du paquet `ca.mobilis.app`, avec l'empreinte SHA-1 de l'APK) ;
- Restriction d'API : Generative Language API seulement ;
- quota quotidien bas et budget avec alerte.
Avec un compte Mobilis, le programme est enregistré sous un code (Firestore) et la clé n'apparaît **pas** dans l'URL ; sans compte, elle est incluse dans le lien (Mobilis t'avertit).
Dans ce mode, le coach en direct par vidéo reste disponible.

## Limites à connaître
- Le plafond quotidien est compté **sur l'appareil du patient** : il protège contre l'usage involontaire, pas contre un patient qui extrait le jeton. Le vrai garde-fou est le quota / budget Google et la possibilité de retirer le jeton.
- Cloudflare Pages gratuit : 100 000 requêtes par jour ; ajoute si besoin une règle de limitation de débit (Sécurité → WAF → Règles de limitation de débit) sur `/api/coach`.

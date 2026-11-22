# Politique de sécurité

## Signaler une vulnérabilité

**Ne pas ouvrir d'issue publique** pour une faille de sécurité ou une fuite de données.

Signaler par courriel au responsable du projet : **[courriel de sécurité à compléter]**. Indiquer :

- la description de la faille et son impact potentiel ;
- les étapes pour la reproduire ;
- la version ou la branche concernée (`main` v1.15, `dev-v2`) ;
- si des données de santé sont exposées (oui/non).

Objectifs de réponse (à confirmer par le responsable) : accusé de réception dans les 5 jours ouvrables, premier diagnostic dans les 15 jours ouvrables. Les divulgations sont coordonnées avec le signalant avant toute publication.

## Périmètre

- l'application web publiée et ses pages (`www/`) ;
- l'APK Android (paquet `ca.mobilis.app`) ;
- les règles de sécurité Firestore (`firestore.rules`) ;
- la fonction de relais IA (`functions/`) ;
- les pipelines de build et de publication (`.github/workflows/`).

## Secrets et identifiants

- **Aucun secret ne doit être versionné** : clé d'API Gemini, compte de service Firebase, jeton GitHub, mot de passe, clé de signature Android (fichier `.jks`), `google-services.json` privé.
- Les secrets de déploiement vivent dans les secrets GitHub Actions (par exemple `FIREBASE_SERVICE_ACCOUNT`) ou dans les variables de la plateforme d'hébergement.
- Les clés de configuration web Firebase (dans `www/js/config.js`) sont des identifiants publics de projet, et non des secrets. Leur protection repose sur les règles de sécurité Firestore et sur les restrictions de la clé dans Google Cloud (à configurer et à documenter).
- Si un secret est versionné par erreur : le révoquer immédiatement, puis signaler. Le retirer du fichier ne suffit pas, car il reste dans l'historique Git.

## Données de santé

- Mobilis traite des données de santé. Les exigences de la Loi 25 (Québec) s'appliquent. Voir `docs/privacy/`.
- La vidéo de l'utilisateur n'est pas conservée et n'est pas envoyée à un serveur par défaut.
- Ne jamais placer de donnée réelle de patient dans une issue, une demande de fusion, une capture d'écran, un journal ou un test. Utiliser des données fictives.

## Versions prises en charge

| Version | Statut |
|---|---|
| `dev-v2` (2.0.0-dev) | En développement ; corrections appliquées sur la branche. |
| `main` (1.15) | Statut de support à confirmer par le responsable. |

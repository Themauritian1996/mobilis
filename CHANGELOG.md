# Journal des modifications

Toutes les modifications notables de Mobilis sont consignées dans ce fichier.

Le format suit [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/) et le versionnement suit [SemVer](https://semver.org/lang/fr/).

## [2.0.0-dev.0] — en cours (branche `dev-v2`)

### Ajouté

- Architecture v2 en couches (TypeScript, ports et adaptateurs) préparée par la migration « strangler » ; voir `docs/architecture.md` et `docs/adr/`.
- Décisions d'architecture 0001 à 0008 et plan de migration en trois tranches (`docs/MIGRATION.md`).
- Spécification v2 (`docs/spec-v2.md`) : analyse de la marche, amputés et prothèses, plans de traitement, recherche malléable, hébergement et confidentialité.
- Documentation de compagnie : `LICENSE` (propriétaire), `NOTICE` (licences tierces), `CONTRIBUTING.md`, `SECURITY.md`, `CODEOWNERS`.
- Squelettes réglementaires (`docs/regulatory/`) et vie privée Loi 25 (`docs/privacy/`). Ces documents sont des brouillons et ne sont pas des avis juridiques ou réglementaires.
- Workflow d'intégration continue pour `dev-v2` (`.github/workflows/ci-v2.yml`) : lint, types, tests, construction web et APK de test, sans secret.

### Modifié

- Pré-cache du service worker étendu aux modules v2 ; contrat des exports v1.15 vérifié pour la parité.
- Version du paquet : `2.0.0-dev.0`.

## [1.15] — branche `main`

Version de référence. Fonctions principales :

- Suivi de la pose corporelle en 2D sur l'appareil (MediaPipe), avec comptage des répétitions et analyse du mouvement.
- Suivi de la main pour les exercices du poignet, de la main et du pouce.
- Coach vocal : consignes instantanées et commentaire de fin de série par Gemini, avec option de coach en direct.
- Mesure de l'amplitude articulaire, questionnaires (PROMs) et retour du patient écrit ou dicté.
- Programmes personnalisés par niveau, règle de surveillance de la douleur et check-in du lendemain.
- Espace clinicien : programmes partagés, suivi des patients, rapport PDF généré localement (jsPDF).
- Fonctionnement hors ligne et APK Android (Capacitor).
- Corrections d'audit : accès IA partagé par le clinicien, usage hors ligne, consentement à l'envoi d'images, règles Firestore de suppression.

# Décisions d'architecture (ADR)

Format : contexte → décision → conséquences. Une ADR acceptée n'est pas modifiée ; on la remplace par une nouvelle
(« Remplacée par 00NN »).

| N° | Titre | Statut |
|---|---|---|
| [0001](0001-typescript-vite.md) | TypeScript strict + Vite (+ Vitest) | Acceptée |
| [0002](0002-ports-adaptateurs.md) | Ports/adaptateurs ; Firebase isolé dans `services/*/firebase` | Acceptée |
| [0003](0003-donnees-cliniques-typees.md) | Données cliniques en fichiers typés, versionnés et sourcés | Acceptée |
| [0004](0004-schema-versionne.md) | Schéma de données versionné (`schemaVersion`) + migrations testées | Acceptée |
| [0005](0005-strangler.md) | Migration progressive « strangler » | Acceptée |
| [0006](0006-drapeaux.md) | Drapeaux de fonctionnalité (`gait` désactivé par défaut) | Acceptée |
| [0007](0007-aucune-video.md) | Aucune vidéo conservée ni envoyée | Acceptée |
| [0008](0008-tests-et-ci.md) | Stratégie de tests et CI de `dev-v2` | Acceptée |
| [0009](0009-dossier-patient.md) | Dossier patient : persistance locale, synchronisation, partage patient → clinicien | Proposée |

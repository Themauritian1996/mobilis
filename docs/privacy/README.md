# Vie privée — Mobilis (Loi 25, Québec)

> **Ce dossier n'est pas un avis juridique.** Les documents sont des brouillons et des gabarits. La conformité à la *Loi modernisant des dispositions législatives en matière de protection des renseignements personnels* (Loi 25, L.Q. 2021, c. 25) doit être validée par un avocat spécialisé en protection des renseignements personnels.

Statut : brouillon. Date : 2026-11-22.

## Contenu

| Document | Objet | Statut |
|---|---|---|
| [data-inventory.md](data-inventory.md) | Registre des renseignements personnels : catégories, lieux de stockage, finalités, durée | Premier inventaire, à valider |
| [efvp-template.md](efvp-template.md) | Gabarit d'évaluation des facteurs relatifs à la vie privée (EFVP) | Gabarit vide |
| [privacy-policy-draft.md](privacy-policy-draft.md) | Brouillon de politique de confidentialité | **À faire relire par un avocat** |

## Principes

1. **Minimisation.** Ne collecter que les renseignements nécessaires à la finalité déclarée.
2. **Pas de vidéo conservée.** L'analyse du mouvement se fait sur l'appareil. Aucune vidéo n'est conservée ni transmise par défaut (voir `docs/adr/0007-aucune-video.md`).
3. **Consentement explicite** pour tout envoi de données à un service d'IA générative (Gemini), avec possibilité de retrait.
4. **Hébergement au Canada.** Firestore dans la région `northamerica-northeast1` (Montréal). Tout transfert hors Québec est à évaluer dans l'EFVP.
5. **Accès restreint.** Chaque patient ne voit que ses données ; le clinicien ne voit que les programmes qui lui sont partagés.
6. **Responsable de la protection des renseignements personnels.** À désigner et à publier : [à compléter]. Le responsable actuel du projet est Christophe Ah-Yan.

## Obligations à vérifier

- Désignation du responsable de la protection des renseignements personnels et publication de son titre et de ses coordonnées.
- Politique de confidentialité accessible avant la collecte.
- Consentement libre, éclairé, donné à des fins précises et distinct pour chaque finalité sensible.
- EFVP avant tout projet d'acquisition, de développement ou de refonte de système qui touche des renseignements personnels, et avant tout transfert hors Québec.
- Incidents de confidentialité : registre, évaluation du risque de préjudice sérieux, avis à la Commission d'accès à l'information et aux personnes concernées lorsque requis.
- Droits des personnes : accès, rectification, retrait du consentement, portabilité (à évaluer selon la Loi 25), suppression.
- Décisions automatisées : information des personnes lorsque des renseignements servent à une décision fondée exclusivement sur un traitement automatisé. À évaluer pour les suggestions de plan de traitement.

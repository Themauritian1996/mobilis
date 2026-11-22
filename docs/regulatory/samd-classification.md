# Classification du logiciel (SaMD) — Santé Canada

> **Proposition de travail, non confirmée.** Ce document n'est pas un avis réglementaire. Toute classe, toute règle et toute obligation ci-dessous doit être vérifiée dans le texte officiel du *Règlement sur les instruments médicaux* (DORS/98-282, annexe 1, règles de classification) et confirmée par un conseiller réglementaire.

Statut : proposition. Date : 2026-11-22.

## 1. Cadre

- Au Canada, un logiciel est un instrument médical lorsqu'il est destiné à un usage médical (diagnostic, traitement, surveillance, etc.). La destination déclarée par le fabricant est déterminante.
- Les instruments sont classés de I (risque faible) à IV (risque élevé). Les classes II, III et IV exigent une licence d'instrument médical, et la classe I n'en exige pas, sous réserve de confirmation.
- Les règles de classification s'appuient sur le risque pour la personne et le type de décision que le logiciel soutient.

## 2. Hypothèse de travail (à confirmer)

Selon l'équipe, les fonctions de mesure ci-dessous relèveraient de la **surveillance d'un processus physiologique**. Le numéro de règle et la classe proposés sont des hypothèses à vérifier.

| Fonction | Hypothèse de classe | Règle à vérifier | Commentaire |
|---|---|---|---|
| Mesure d'amplitude articulaire par caméra (`rom.js`) | Classe II (hypothèse) | Règle 10(1) (surveillance d'un processus physiologique), à confirmer | Mesure sans contact, sans effet direct sur le patient. Le risque est une mesure erronée qui influence une décision clinique. |
| Analyse de la marche par caméra (`gait`) | Classe II (hypothèse) | Règle 10(1), à confirmer | Même logique. Plus de métriques, donc plus de risque de mauvaise interprétation. |
| Suggestions de causes et de traitements (moteur de règles, plans de traitement) | À évaluer, possiblement plus élevée | À déterminer | Une suggestion qui influence un traitement peut relever d'une classe supérieure. À évaluer séparément. |
| Coach IA : consignes vocales pendant l'exercice | À évaluer | À déterminer | Les consignes de sécurité (arrêt en cas de douleur) pourraient influencer la sécurité du patient. |
| Coach IA : reformulation de résultats | À évaluer | À déterminer | Dépend de l'influence sur une décision clinique. |
| Rapports PDF et suivi | À évaluer | À déterminer | Document pour le clinicien. Peut être classé avec la fonction qui produit les données. |
| Stockage, synchronisation, authentification | Non un instrument médical en soi | — | Logiciel de soutien. À confirmer dans le contexte de l'ensemble. |

## 3. Point d'attention : règle applicable aux logiciels

Les logiciels sont classés selon des règles particulières, qui tiennent compte de l'influence de l'information sur les décisions de diagnostic ou de traitement. **La règle applicable aux logiciels doit être vérifiée** : elle peut être plus sévère que la règle de surveillance pour les fonctions qui fournissent des suggestions de traitement. Ce point est à confirmer avant toute autre décision.

## 4. Questions au conseiller

1. La destination déclarée (voir `intended-use.md`) place-t-elle Mobilis dans le régime des instruments médicaux ?
2. Quelle règle et quelle classe pour chaque fonction du tableau ?
3. Si les fonctions sont séparées par drapeau, la classe de l'application est-elle celle de la fonction la plus élevée active ?
4. Quelles preuves faut-il produire : validation (voir `validation-plan.md`), système de qualité, documentation de cycle de vie (voir `software-lifecycle-iec62304.md`), gestion des risques (voir `risk-management-iso14971.md`) ?
5. Quel est le délai et le coût d'une licence pour la classe retenue ?

## 5. Décision

- Classe retenue : [à compléter, après avis].
- Voie choisie : [à compléter].
- Date et auteur du conseil : [à compléter].

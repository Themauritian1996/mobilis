# Sources des données cliniques — `domains/rehab/data`

Inventaire fait lors de la migration T1 (ADR 0003). Le code legacy ne cite **aucune référence bibliographique** pour ces
catalogues ; aucune n'a été ajoutée ni inventée. Tout est donc noté `to_verify`. Aucune valeur n'a été modifiée par la
migration.

| Fichier | Contenu | Source citée dans le code | Statut |
|---|---|---|---|
| `exercises.ts` | exercices (textes, doses de base, consignes, seuils de suivi caméra : `from`, `to`, `min`, `max`, `delta`, `checks`) | aucune | to_verify |
| `pathologies.ts` | régions, pathologies, phases d'exercices, `painMax`, signaux d'alerte, précautions | aucune (la définition des phases 1–3 et de `painMax` est un choix de conception décrit en en-tête) | to_verify |
| `triage.ts` | noms en langage simple, reconnaissance d'un diagnostic écrit, questions par région | aucune | to_verify |
| `substitutes.ts` | objets de maison de remplacement, charges visées (`TARGET_KG`, niveaux 1–5) | aucune ; l'en-tête précise que les charges sont « volontairement prudentes » et « dérivées de façon conservative » | to_verify |
| `anatomy.ts` | structures anatomiques affichées sur les schémas (muscles, tendons, nerfs, fascias, articulations) | aucune | to_verify |

## Points à vérifier en priorité

* `painMax` (douleur acceptable pendant l'exercice, 3 à 5 selon la pathologie) : seuils sans référence.
* Doses de base des exercices (niveau 3) et ajustements par niveau : sans référence ; le moteur de progression
  (hors périmètre de cette tranche) les adapte.
* Charges visées par niveau (`TARGET_KG`) et poids approximatifs des objets de remplacement : estimations prudentes, sans
  référence.
* Seuils de détection des erreurs de mouvement (`track.checks`, `max` / `min`) : valeurs de réglage de l'application,
  validées par simulation (tests legacy tracker / realism / partial), pas par une étude clinique.
* Structures anatomiques et décalages (`seg`, `t`, `off`, `w`) : représentation schématique, non à l'échelle ; les noms
  des structures sont à relire par un clinicien.
* Signaux d'alerte et consignes de sécurité : relecture clinique nécessaire avant tout passage en `verified`.

À faire : pour chaque entrée sourçable, retrouver la référence complète (auteurs, année, titre) avant de renseigner
`reference` et `status: 'verified'`. `docs/gait-literature/` n'est pas concerné (marche) et n'a pas été modifié.

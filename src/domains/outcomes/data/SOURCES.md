# Sources des données cliniques — `domains/outcomes/data`

Inventaire fait lors de la migration T1 (ADR 0003). Les sources déjà citées dans les commentaires du code legacy sont
reprises telles quelles ; **aucune référence n'a été ajoutée ni complétée**. Tout ce qui n'a pas de source précise dans le
code est noté `to_verify`. Aucune valeur n'a été modifiée par la migration.

## `proms.ts` — questionnaires et seuils de changement minimal (MCID)

* Statut général : **to_verify**. Aucun MCID du catalogue n'est accompagné d'une référence bibliographique dans le code ;
  les notes affichées au patient disent « indicatif » ou « valeur publiée » sans citer la publication.
* Droits d'auteur : le texte des questionnaires protégés (QuickDASH, KOOS-12, HOOS-12, SPADI, LEFS, ODI, NDI) n'est pas
  dans le code (structure et algorithme seulement). Les détenteurs cités dans le code : Roos & Lohmander (KOOS, HOOS).

| Instrument (`id`) | MCID (points) | Mention dans le code | Statut |
|---|---|---|---|
| `nprs` | 2 (ou 30 %) | « valeur courante de la littérature sur la douleur » (sans citation) | to_verify |
| `pgic` | niveau 2 | réponse « Mieux » ou « Beaucoup mieux » = amélioration importante selon le patient (sans citation) | to_verify |
| `sane` | 15 | « environ 15–20 points (seuil indicatif) » | to_verify |
| `sleep` | 2 | seuil indicatif (2 sur 10) | to_verify |
| `activities` | 2 | seuil indicatif (2 sur 10 en moyenne) | to_verify |
| questionnaires fonctionnels libres (`MFQ_MCID`) | 10 | « non validé : ordre de grandeur usuel » | to_verify |
| `quickdash` | 16 | « valeurs publiées 8–16 ; indicatif, à valider » | to_verify |
| `koos12` | 8 | « environ 8–10 points selon les études (indicatif) » | to_verify |
| `hoos12` | 8 | « environ 8–10 points (indicatif) » ; calcul identique à KOOS-12, « simplification à valider avec le détenteur » | to_verify |
| `spadi` | 10 | « environ 8–13 points (indicatif) » | to_verify |
| `lefs` | 9 | « valeur publiée » (sans citation) | to_verify |
| `odi` | 10 | « valeur publiée » (sans citation) | to_verify |
| `ndi` | 7,5 sur 100 (5/50) | indicatif | to_verify |

À faire : retrouver, pour chaque ligne, la publication d'origine (population, méthode d'ancrage, intervalle) et renseigner
`reference` / `status: 'verified'` seulement avec une référence complète.

## `protocols.ts` — protocoles post-opératoires par phases

Source citée dans l'en-tête du fichier (familles de protocoles publiés ; contenu général et prudent) :

* protocoles de centres universitaires d'orthopédie et de médecine du sport (style MGH / Brigham and Women's, Vanderbilt,
  Cleveland Clinic, Hospital for Special Surgery) ;
* guides de pratique clinique de l'APTA / JOSPT (LCA, hanche, genou), consensus ASSET (réparation de la coiffe, 2016),
  critères de retour au sport du consortium MOON (LCA) ;
* information aux patients de l'AAOS (OrthoInfo) et de la Société canadienne d'orthopédie ;
* revues Cochrane sur la réadaptation après PTG / PTH et fracture du radius distal.

Ce sont des familles de sources, pas des références précises : **chaque protocole est `to_verify`** (références
individuelles manquantes) — `acl`, `cuff_repair`, `tka`, `tha`, `bankart`, `achilles_repair`, `meniscus`,
`lumbar_surgery`, `distal_radius`, `carpal_release`. Sont aussi à rattacher à une source : les bornes de semaines de chaque
phase, les critères de progression, les précautions, les cibles d'amplitude (`romTargets`) et les doses.
Le chirurgien prime toujours sur ce catalogue (mention déjà présente dans le fichier).

## `romtests.ts` — tests d'amplitude

Source citée dans l'en-tête du fichier :

* AAOS : American Academy of Orthopaedic Surgeons (Greene & Heckman, *The Clinical Measurement of Joint Motion*, 1994) ;
* AMA : *Guides to the Evaluation of Permanent Impairment*, 5e éd. ;
* test de fente en charge (`an_df`) : « Bennell 1998 ; Konor 2012 » (références abrégées dans le code, sans titre ni revue).

Statut :

* valeurs `normal` (`ref`, `lo`, `hi`) : la source est nommée dans le champ `src` de chaque test (AAOS et/ou AMA) mais
  **les bornes `lo` / `hi` ne sont pas issues d'une source identifiée** : **to_verify** ;
* références AAOS 1994 et AMA 5e éd. : à compléter (pages, tableaux) avant de passer en `verified` ;
* `an_df` : références Bennell 1998 et Konor 2012 incomplètes (auteurs, titre, revue) : **to_verify** ;
* précisions annoncées dans les notes (± 10–15° ; facteur ≈ 0,79 de la longueur d'avant-bras ; profondeur 3D bruitée
  ± 15–20°) : mesures internes à Mobilis, **sans référence** : **to_verify** ;
* tests suggérés par région (`SUGGESTED`, `SUGGESTED_REGION`) : choix de produit, pas une donnée clinique sourcée.

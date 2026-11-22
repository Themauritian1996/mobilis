# Littérature – analyse de la marche (Mobilis v2)

Données cliniques sourcées pour les sections 4.5, 5, 6 et 7 de `docs/spec-v2.md`. Ces fichiers sont une **base de travail à valider par le clinicien**. Le code ne doit pas encore les lire : ils serviront à générer `data/gait-norms` et `data/gait-findings`.

| Fichier | Contenu | Entrées |
|---|---|---|
| `references.json` | Références (id, auteurs, année, titre, revue/éditeur, DOI/URL/ISBN, `status`) | 56 (42 `verified`, 7 `verified_secondary`, 7 `to_verify`) |
| `norms.json` | Normes adultes : 10 blocs spatio-temporels (vitesse, cadence, pas, appui/oscillation, double appui, largeur de base, MCID), 8 phases de Perry (timing), angles par phase (8) + 4 normes avec écart-type, 5 mesures frontales/tronc, 6 fiches de précision 2D | 41 blocs |
| `findings.json` | Défauts de marche : critères mesurables, causes, diagnostics différentiels, prise en charge, niveau de preuve, limites 2D | 18 |
| `prosthetic-findings.json` | Déviations de marche chez l'amputé (TT, TF ; désarticulation/Syme signalés `to_verify`), causes par catégorie, suggestions à discuter avec le prothésiste, signes de prothèse trop longue ou trop courte | 18 |
| `assistive-devices.json` | Ajustement de la canne, des béquilles axillaires, d'avant-bras et à plateforme, du déambulateur ; formules par la taille ; vérification de l'angle du coude par caméra | 5 aides |

## Méthode
- Recherche Web (novembre 2026) : PubMed/PMC, Europe PMC, Crossref, sites d'éditeurs, AAFP, AAPM&R, Physiopedia, SRALab.
- **Métadonnées vérifiées** sur Crossref ou Europe PMC pour chaque DOI marqué `verified`. Les valeurs numériques ont été lues dans le texte intégral (Oberg 1993/1994, Hollman 2011), dans l'abstract (Stenum 2021, Hii 2023) ou dans une copie du tableau (Bohannon 1997, OCR, recoupé avec l'abstract).
- Les valeurs reprises d'une **source secondaire** (compendium SRALab, tableau de l'Université de Toronto, Physiopedia, diaporamas de l'Université du Missouri) sont indiquées comme telles.
- Aucune valeur n'a été inventée. Quand rien n'a été trouvé, le champ est vide et porte `status: "to_verify"`.
- Les seuils de détection sont de trois types : `published`, `norm_relative` (moyenne ± 2 ET, choix de conception) et `proposed_heuristic` (proposition **non publiée**, à trancher).
- Conventions d'angle : flexion positive ; dorsiflexion positive ; cycle 0–100 % d'un contact initial au suivant (voir `norms.json > conventions`).
- La détection des événements doit suivre Zeni 2008 (`zeni2008`), et les proportions des segments Winter 2009 (`winter2009`). Ces deux références sont dans `references.json`.
- Le texte est en français, avec les termes anglais entre parenthèses ; les clés sont en anglais.

## Limites principales
1. **Précision 2D** (une seule caméra, sagittale, adultes sains). Erreur absolue moyenne : hanche 4,0°, genou 5,6°, cheville 7,4° ; pas 4,9 cm par pas (1,8 cm en moyenne par participant) ; temps 0,01–0,02 s ; vitesse < 0,10 m/s (Stenum 2021, OpenPose). MediaPipe est jugé moins précis à la cheville et à la hanche, et inverse parfois gauche et droite (Menychtas 2023, Hii 2023). Les erreurs sont probablement plus grandes chez les patients.
2. **Plan frontal non validé.** Aucune étude n'a été trouvée pour la chute pelvienne, l'inclinaison latérale du tronc, le FPPA ou la largeur de base mesurés à la marche avec une caméra. Ces mesures doivent s'afficher comme des « estimations ».
3. **Normes manquantes** : chute pelvienne et inclinaison du tronc à la marche ; FPPA à la marche (seulement au squat unipodal) ; largeur de base avant 70 ans ; ratio longueur de pas / taille ; courbes de Kadaba (non extraites).
4. Les **angles par phase de Perry** sont des valeurs de manuel sans écart-type, reprises de sources secondaires concordantes. Les seules normes angulaires avec écart-type viennent d'Oberg 1994 (électrogoniométrie, population suédoise, 1994).
5. Les **déviations prothétiques** reposent sur des sources secondaires (Physiopedia, diaporamas). L'*Atlas of Amputations*, Esquenazi 2014 et BACPAR n'ont pas été lus en texte intégral.
6. Aucune règle n'a été validée cliniquement. Le moteur doit présenter des **défauts probables avec niveau de confiance**, jamais des diagnostics.

## Éléments `to_verify`
**Références (7)** : `bowker1992`, `bacpar2020`, `bauer1991` (DOI et définition de la longueur), `beckwith1965`, `kumar1995` (auteurs, titre et formule de la canne), `webster2019` (titre et pages du chapitre), `rancho_oga2001`.

**Contenus** :
- `perry1995` : seuils 0,4 et 0,8 m/s post-AVC (cités de mémoire).
- `perera2006` : 0,05 et 0,10 m/s.
- `cesari2005` : seuil de 1 m/s.
- `simpson2016` : niveau de preuve A pour la spasticité du membre inférieur.
- `washabaugh2022` : erreurs chiffrées.
- `bohannon1997` : relire le tableau 4 original.
- `bohannon2011` : IC95 %.
- `studenski2011` : page de fin.
- `gailey2008` : liste des coauteurs.
- `oberg1994` : définition du « mi-appui » (≈ 15–20° contre ≈ 5° dans les manuels).
- `kadaba1990` : courbes.
- `smith2004` : existence et contenu de la 4e édition.

**Normes vides** : `pelvic_drop_gait`, `trunk_lateral_lean`, `trunk_sagittal_inclination`, `fppa_knee`, `step_length_height_normalized`, la flexion du genou en oscillation moyenne et la précision 2D dans le plan frontal.

**Prothèses** : déviations spécifiques à la désarticulation du genou et au Syme, et causes du *hip hiking* prothétique (extrapolées).

## 10 questions que le clinicien doit trancher
1. **Norme de vitesse par défaut** : Bohannon & Andrews 2011 (méta-analyse, sans ET), Bohannon 1997 (avec ET, n plus petit) ou Oberg 1993 ? Faut-il les deux affichages (« % de la norme » et « z-score ») ?
2. **Seuil d'anomalie** : moyenne ± 2 ET, ± 1,5 ET, ou un seuil clinique absolu (ex. 0,8 m/s) ? Le seuil doit-il différer selon le contexte (dépistage ou suivi) ?
3. **Convention de la hanche** : angle cuisse–verticale (Perry, plus robuste en 2D) ou cuisse–bassin (laboratoires 3D) pour l'affichage et les normes ?
4. **Seuils heuristiques des défauts** (`proposed_heuristic`) : accepter, modifier ou retirer chacun d'eux (ex. cheville < −5° en oscillation moyenne pour le pied tombant, asymétrie > 10 %, genou ≤ −5° pour le recurvatum) compte tenu de l'erreur 2D de la cheville (≈ 7°) et du genou (≈ 6°) ?
5. **Mesures frontales non validées** (chute pelvienne, tronc, FPPA, largeur de base) : les afficher comme « estimation », les masquer par défaut, ou les réserver au mode recherche ?
6. **Nombre minimal de cycles** et règle de concordance : par exemple ≥ 3 cycles valides par côté et un défaut présent dans ≥ 2/3 des cycles ? Faut-il une fréquence d'images minimale (30 ou 60 i/s) pour les défauts brefs (foot slap, impact en fin d'oscillation) ?
7. **Normes chez l'aîné** : utiliser Hollman 2011 à partir de 70 ans, et que faire entre 80 et 99 ans (Bohannon 2011 seulement) ? Faut-il ajouter des normes pédiatriques, hors périmètre actuel ?
8. **Formulation des recommandations** : quelles options (toxine botulique, chirurgie, orthèse) peuvent apparaître dans un rapport remis au patient, et lesquelles restent réservées au clinicien ?
9. **Aides techniques** : faut-il proposer des formules par la taille pour les béquilles axillaires (0,77 × taille ; taille − 40,6 cm), qui sont non vérifiées dans la source primaire, ou seulement les repères anatomiques et la vérification de l'angle du coude ? Quelle cible retenir : 20–30° ou 15–30° ?
10. **Prothèses** : quelles déviations sont assez fiables en 2D pour générer une alerte (asymétries temporelles, inclinaison du tronc, vaulting), et lesquelles doivent rester une liste d'observation au choix du clinicien (fouets médial et latéral, pistonnage, rotation du pied) ? Qui valide la liste des causes : le prothésiste partenaire ?

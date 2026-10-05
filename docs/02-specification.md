# 02 — Spécification fonctionnelle

> Statut : **brouillon v0.1**, à valider. Ce document décrit **quoi** construire, pas encore **comment** (voir `03-feuille-de-route.md` pour les choix techniques ouverts).

## 1. Glossaire

| Terme | Définition |
|---|---|
| **Thème** | Grand domaine de vie, affiché comme un onglet (ex. « Ma relation avec Dieu »). |
| **Projet** | Objectif durable au sein d'un thème (ex. « Lecture de la Bible »). |
| **Sous-projet** | Unité d'exécution datée et mesurable (ex. « Terminer le NT en octobre »). |
| **Fiche QQOQCCP** | Page d'information du sous-projet : Quoi, Pourquoi, Qui, Où, Quand, Comment, Combien. |
| **Tableau de suivi** | Grille de lignes (étapes/jours) × colonnes (Prévu, Accompli, Valeur, Commentaire). |
| **Mode de suivi** | Étapes, Récurrent, Quantitatif, Budget : détermine comment les lignes sont générées et totalisées. |
| **Activité** | Créneau de l'emploi du temps, rattaché à un sous-projet. |
| **Compte rendu** | Bilan rédigé sur une période (jour, semaine, mois). |
| **Document** | Rendu imprimable (gabarit LaTeX, ou équivalent) d'un sous-projet, exportable en PDF et signable. |
| **Ebenezer** | Archive des sous-projets terminés et signés. |

## 2. Modèle de données (conceptuel)

```
Theme 1───* Projet 1───* SousProjet 1───* LigneSuivi
                              │  1───1 Fiche (QQOQCCP)
                              │  1───* Document (versions / export PDF)
                              └──*  Activite (emploi du temps)
CompteRendu *───* SousProjet (références)
```

### Theme
| Champ | Type | Note |
|---|---|---|
| id | uuid | |
| nom | texte | « Ma relation avec Dieu » |
| icone | emoji/texte | |
| couleur | couleur | |
| intention | texte ? | verset ou phrase de motivation |
| ordre | entier | position de l'onglet |
| archive | booléen | |

### Projet
| Champ | Type | Note |
|---|---|---|
| id, themeId | uuid | |
| nom | texte | « Lecture de la Bible » |
| description | texte ? | |
| statut | `actif` / `en pause` / `terminé` | |

### SousProjet
| Champ | Type | Note |
|---|---|---|
| id, projetId | uuid | |
| titre | texte | |
| fiche | objet | `{ quoi, pourquoi, qui, ou, quand, comment, combien }` (texte libre) |
| debut, fin | date | période |
| modeSuivi | `etapes` / `recurrent` / `quantitatif` / `budget` | |
| regle | objet ? | paramètres de génération (voir §4) |
| unite | texte ? | « chapitres », « heures », « $ »… |
| cible | nombre ? | objectif total ou par période |
| statut | `brouillon` / `en cours` / `terminé` / `signé` | |
| gabaritId | id ? | gabarit de document utilisé |
| signature | objet ? | `{ image, date, lieu }` |

### LigneSuivi
| Champ | Type | Note |
|---|---|---|
| id, sousProjetId | uuid | |
| ordre | entier | |
| libelle | texte | « Matthieu 1–3 », « Lundi 6 oct. » |
| prevuDate | date ? | |
| prevuValeur | nombre/texte ? | « 3 chapitres », 2 h, 50 $ |
| accompli | booléen | la coche |
| accompliLe | horodatage ? | renseigné automatiquement à la coche |
| valeurRealisee | nombre ? | |
| commentaire | texte ? | |

### Activite (emploi du temps)
| Champ | Type | Note |
|---|---|---|
| id | uuid | |
| titre | texte | |
| heureDebut, heureFin | heure | |
| recurrence | `quotidien` / jours de semaine / date unique | |
| sousProjetId | uuid | **obligatoire** : toute activité sert un sous-projet |

### CompteRendu
| Champ | Type | Note |
|---|---|---|
| id | uuid | |
| periode | `jour` / `semaine` / `mois` + date | |
| texte | texte riche | |
| sousProjets | uuid[] | références |

## 3. Écrans

1. **Aujourd'hui** (accueil par défaut) : activités du jour dans l'ordre horaire, plus les lignes de suivi prévues aujourd'hui ou en retard. Un tap ouvre la ligne, un swipe ou tap coche.
2. **Thèmes** : onglets ou tuiles des thèmes, avec un anneau de progression par thème.
3. **Thème** : liste des projets et de leurs sous-projets actifs, avec leur progression.
4. **Sous-projet**, avec trois onglets :
   - **Suivi** : le tableau (cocher, valeur, commentaire) et l'indicateur de progression.
   - **Fiche** : QQOQCCP et paramètres (période, mode, cible).
   - **Document** : aperçu en direct, export PDF, signature.
5. **Emploi du temps** : semaine type, création d'activités rattachées à un sous-projet.
6. **Comptes rendus** : liste et éditeur, avec pré-remplissage à partir des coches de la période.
7. **Ebenezer** : chronologie des sous-projets signés, accès aux PDF.
8. **Réglages** : export/import des données (JSON), gabarits de documents, thème clair/sombre.

## 4. Règles de génération des lignes

| Mode | Paramètres | Résultat |
|---|---|---|
| Étapes | liste manuelle **ou** « N unités réparties sur la période » | Une ligne par étape, `prevuDate` réparties uniformément |
| Récurrent | fréquence (quotidien / jours choisis / hebdo) + `prevuValeur` par occurrence | Une ligne par occurrence entre `debut` et `fin` |
| Quantitatif | `cible` + période de mesure (jour/semaine) | Lignes ajoutées à la volée (séances) ; total comparé à la cible par période |
| Budget | `cible` (budget) | Lignes ajoutées à la volée (dépenses) ; prévu comparé au réel |

Les lignes générées restent **modifiables** (renommer, déplacer, supprimer, ajouter).

## 5. Histoires utilisateur — MVP (v1)

Le format est : *En tant que moi, je veux… afin de…*, suivi des **critères d'acceptation**.

**US-1. Gérer les thèmes.** Je veux créer, renommer, réordonner et archiver des thèmes afin d'organiser les domaines de ma vie.
- [ ] Un thème a un nom, une icône, une couleur et une intention optionnelle.
- [ ] Les thèmes s'affichent comme onglets ou tuiles dans l'ordre choisi.

**US-2. Gérer projets et sous-projets.** Je veux créer des projets dans un thème, et des sous-projets dans un projet.
- [ ] Navigation Thème → Projet → Sous-projet en 3 taps maximum.

**US-3. Remplir la fiche QQOQCCP.** Je veux définir mon sous-projet avec les 7 questions afin de savoir exactement de quoi il s'agit.
- [ ] Les 7 champs sont visibles et éditables ; la fiche s'affiche en lecture claire.

**US-4. Générer le tableau de suivi.** Je veux que l'app crée les lignes à partir du mode et de la période.
- [ ] Récurrent « 3 chapitres/jour » du 1er au 31 octobre donne 31 lignes datées.
- [ ] Étapes « 260 chapitres en 30 jours » donne 30 lignes d'environ 9 chapitres chacune.
- [ ] Les lignes sont modifiables après génération.

**US-5. Cocher, saisir, commenter.** Je veux cocher une ligne, saisir une valeur réalisée et un commentaire.
- [ ] La coche enregistre la date et l'heure ; on peut la décocher.
- [ ] La progression (%) se met à jour immédiatement.

**US-6. Voir le document en direct.** Je veux voir mon modèle de fiche de suivi se remplir au fur et à mesure.
- [ ] L'aperçu reflète la fiche et le tableau à jour.
- [ ] *Dépend du gabarit LaTeX fourni* (voir questions ouvertes).

**US-7. Exporter et signer.** Je veux exporter le document en PDF et le signer à la fin.
- [ ] Export PDF fidèle au gabarit.
- [ ] Signature dessinée au doigt, intégrée au PDF, avec date et lieu.
- [ ] Le sous-projet passe à « signé » et entre dans Ebenezer.

**US-8. Aujourd'hui.** Je veux voir sur un seul écran ce que je dois faire aujourd'hui.
- [ ] Liste des lignes prévues aujourd'hui (et en retard), regroupées par thème.

**US-9. Installer et utiliser hors ligne.** Je veux installer l'app sur mon téléphone et l'utiliser sans réseau.
- [ ] Installable (PWA), fonctionne en mode avion, données persistantes sur l'appareil.

**US-10. Sauvegarder.** Je veux exporter et importer toutes mes données afin de ne jamais les perdre.
- [ ] Export JSON complet ; import qui restaure à l'identique.

## 6. Après le MVP

- **v1.1 Emploi du temps** : activités récurrentes liées aux sous-projets, intégrées à « Aujourd'hui ».
- **v1.2 Comptes rendus** : bilans jour/semaine pré-remplis.
- **v1.3 Synchronisation** multi-appareils (compte et sauvegarde dans le nuage).
- **v2 Assistant IA** : création de sous-projets en langage naturel, résumés de comptes rendus.
- **v2 Redevabilité** : partage en lecture avec un mentor, co-signature.
- **Notifications** : rappels liés aux activités.

## 7. Exigences non fonctionnelles

- Mobile d'abord (écran de 360 px), utilisable d'une main.
- Hors ligne d'abord ; aucune perte de données à la fermeture.
- Interface en français ; dates au format canadien (AAAA-MM-JJ ou « 6 oct. 2026 »).
- Données personnelles : stockées localement par défaut ; aucune donnée envoyée à un tiers sans action explicite.
- Accessibilité : contraste suffisant, cibles tactiles de 44 px minimum, mode sombre.

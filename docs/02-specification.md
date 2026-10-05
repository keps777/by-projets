# 02 — Spécification fonctionnelle (v2)

> **Statut : v2.0 du 5 oct. 2026, à valider.** Elle remplace la v0.1. Elle décrit **quoi** construire ; le **comment** viendra dans `04-architecture.md`.
> Sources : les maquettes (https://claude.ai/artifact/5ZgqUjisYTEMRLL3w6d2F6, pages « Version 2 · Nuit » et « Jour »), `04-mes-projets.md` (les projets par défaut), `05-exigences-v2.md` (décisions successives) et `06-analyse-avant-developpement.md` (risques).
> Les mots **doit** et **ne doit pas** sont impératifs ; **peut** désigne une option.

## Comment lire cette spécification

Elle est **découpée en sections**, une par fichier dans `docs/spec/`. Une tâche de développement ne lit que les sections utiles (le numéro de section, par exemple « §5 », renvoie au fichier du même numéro). Les noms de fichiers ne changent pas.

| § | Section | Contenu | Lignes |
|---|---|---|---|
| 1 | [Principes](spec/01-principes.md) | Les 9 règles qui guident toutes les décisions | 12 |
| 2 | [Glossaire](spec/02-glossaire.md) | Rubrique, projet, sous-projet, métrique, tâche, occurrence, saisie… | 17 |
| 3 | [Modèle de données](spec/03-modele-de-donnees.md) | Tables, colonnes, relations | 24 |
| 4 | [Catalogue des métriques](spec/04-catalogue-des-metriques.md) | 12 types de métriques, unités de base, calculs automatiques, modèles par rubrique | 46 |
| 5 | [Règles de progression](spec/05-regles-de-progression.md) | Règle de trois mensuelle, trait « où je devrais être », moyennes, exemples chiffrés | 36 |
| 6 | [Cycle de vie d'un sous-projet](spec/06-cycle-de-vie-d-un-sous-projet.md) | États, validation, reprise du passé, document PDF (§6.1) | 37 |
| 7 | [Tâches, occurrences et récurrences](spec/07-taches-occurrences-et-recurrences.md) | Ajout d'une tâche, récurrences, occurrences, disponibilité | 33 |
| 8 | [La saisie unique](spec/08-la-saisie-unique.md) | Sources, correction manuelle, minuteur, Mode Focus | 19 |
| 9 | [Les rapports](spec/09-les-rapports.md) | Points, format à points-virgules, génération, export | 29 |
| 10 | [Notifications et rappels](spec/10-notifications-et-rappels.md) | Push, types, limite iPhone, fonctionnement serveur | 23 |
| 11 | [Authentification et vie privée](spec/11-authentification-et-vie-privee.md) | Connexion, règles d'accès, vie privée | 9 |
| 12 | [Écrans](spec/12-ecrans.md) | Inventaire écran ↔ planche de maquette | 23 |
| 13 | [Hors ligne et synchronisation](spec/13-hors-ligne-et-synchronisation.md) | Cache, file d'attente, conflits | 8 |
| 14 | [Exigences non fonctionnelles](spec/14-exigences-non-fonctionnelles.md) | Performance, accessibilité, fiabilité, tests | 12 |
| 15 | [Histoires utilisateur et critères d'acceptation](spec/15-histoires-utilisateur-et-criteres-d-acceptation.md) | US-01 à US-30 avec critères vérifiables | 130 |
| 16 | [Hors périmètre de la v1](spec/16-hors-perimetre-de-la-v1.md) | Ce qui n'est pas dans la v1 | 10 |
| 17 | [Décisions et questions ouvertes](spec/17-decisions-et-questions-ouvertes.md) | Décisions tranchées et questions ouvertes | 17 |
| 18 | [Le Carnet](spec/18-le-carnet.md) | Livre numéroté de toutes les notes, une page par jour, note libre, notes du Mode Focus | 30 |

## Quelle section lire selon la tâche

| Tâche | Sections |
|---|---|
| Calculs de progression, barres | §4, §5 |
| Le Fil, minuteur, saisie | §8, §7, §12 |
| Ajout de tâche, récurrence, report | §7, §3 |
| Sous-projets, métriques, modèles | §4, §6, §3 |
| Rapports et export | §9, §4 |
| Notifications, rappels | §10, §7 |
| Connexion, données, sécurité | §11, §3, §13 |
| Écrans à reproduire d'une maquette | §12 puis la planche indiquée dans `design/` |

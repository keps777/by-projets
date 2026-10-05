# 03 — Feuille de route : de la spécification au code

> Mise à jour du 5 oct. 2026.

## Où en est le projet ?

| # | Étape | Livrable | État |
|---|---|---|---|
| 0 | Idéation | Mémo vocal, carnet « Luther Life » | ✅ |
| 1 | Vision | `01-vision.md` | ✅ mis à jour |
| 2 | Spécification | `02-specification.md` (v2), `04`, `05`, `06` | 🟡 **rédigée, à valider par toi** |
| 2b | Maquettes | 54 planches (nuit, jour, version 1 archivée) | ✅ à valider |
| 3 | Conception technique | `07-architecture.md`, `08-methode-de-travail.md` | ✅ rédigée, à confirmer par l'essai T0 |
| 4 | Construction par tranches | Code, tests, déploiement | ⬜ |
| 5 | Usage réel et amélioration | Retours, v1.1 | ⬜ |

## Décisions techniques (à confirmer dans l'architecture)

| Sujet | Choix |
|---|---|
| Application | PWA installable, Svelte + TypeScript + Vite, nuit par défaut |
| Données | Supabase (PostgreSQL, authentification par e-mail et mot de passe, règles d'accès par ligne) |
| Hors ligne | Cache IndexedDB et file d'attente d'écritures |
| Rappels et rapport | Fonctions Supabase + tâche planifiée chaque minute ; Web Push |
| Notifications | Push uniquement, aucun e-mail |
| Hébergement | **Vercel** (app) + Supabase (données et fonctions) — décidé le 5 oct. 2026 |
| Tests | Fonctions de calcul testées à l'unité ; parcours clés en bout en bout |

## Ordre de construction

| Tranche | Contenu | Résultat |
|---|---|---|
| **T0** | Architecture, jetons de design, projet Supabase (schéma, règles d'accès), **essai de notification sur ton iPhone** | App installable qui t'envoie une notification de test |
| **T1** | Noyau de calcul avec tests : métriques, progression mensuelle, récurrence, disponibilité, format du rapport | Les règles de la spec sont prouvées par des tests |
| **T2** | Connexion, installation, Le Fil (blocs, minuteur, saisie, volet, report) | Je vis ma journée dans l'app |
| **T3** | Projets, sous-projets, modèles, ajout de tâche, reprise du passé | Je structure ma vie |
| **T4** | Rapports (jour, semaine, mois), export, archives des rapports | Mon rapport du soir |
| **T5** | Rappels et rapport automatique côté serveur, notifications | Elle me rappelle au bon moment |
| **T6** | Semaine, Mois, recherche, Mode Focus complet | Vue d'ensemble et retrouvailles |
| **T7** | Fiche, document PDF, signature, validation, Archive | Mon premier sous-projet signé |
| **T8** | Hors ligne complet, accessibilité, performance, sauvegardes, finitions | v1 solide |

Chaque tranche finit par une version **utilisable** sur ton téléphone. T2 est le premier moment où tu peux l'utiliser pour de vrai.

## Questions ouvertes

Voir `docs/spec/17-decisions-et-questions-ouvertes.md` et `06-analyse-avant-developpement.md`.

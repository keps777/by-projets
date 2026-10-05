# 08 — Méthode de travail : peu de tokens, beaucoup d'efficacité

> Principe central : **la mémoire du projet vit dans le dépôt, pas dans la conversation.** Une nouvelle session ne doit jamais avoir besoin de tout relire.

## 1. Les règles

| # | Règle | Effet |
|---|---|---|
| 1 | **`CLAUDE.md` court** (carte du dépôt, commandes, règles) lu au début de chaque session. | Orientation immédiate pour quelques centaines de tokens. |
| 2 | **Spécification découpée** en 17 sections (`docs/spec/`). Une tâche ne lit que ses sections (tableau dans `docs/02-specification.md`). | On lit 100 lignes au lieu de 460. |
| 3 | **Une tranche = une session.** On commence par : `CLAUDE.md`, `docs/journal.md`, les sections utiles. On finit par : tests verts, commit, entrée de journal. | Pas de contexte qui grossit pendant des heures. |
| 4 | **Journal de reprise** (`docs/journal.md`) : ce qui est fait, ce qui reste, les pièges trouvés. | La session suivante repart en une minute. |
| 5 | **Noyau de calcul en fonctions pures, petites, typées, testées.** Fichiers de moins de 200 lignes. | On lit les signatures et les tests, pas les implémentations. |
| 6 | **Les tests sont le contrat** : `npm run check` (types, lint, tests) affiche seulement les échecs. | On vérifie sans relire le code ni regarder des captures. |
| 7 | **Lecture ciblée** : chercher d'abord (Grep), puis lire la partie utile (position + longueur). Ne pas relire un fichier qu'on vient d'écrire. Couper les longues sorties. | Chaque tour coûte moins. |
| 8 | **Maquettes par planche**, jamais en bloc : on ouvre le fichier de l'écran (`design/maquettes-v2/NomEcran.dc.html`) indiqué par la spec §12. | Les maquettes pèsent 600 Ko ; une planche, 10 à 60 Ko. |
| 9 | **Jetons de design et composants partagés écrits une fois.** Un écran fait ~30 lignes. | Les styles répétés des maquettes disparaissent du code. |
| 10 | **Vérification visuelle en fin de tranche seulement** : une capture par écran clé avec Playwright. Pas de boucle « regarder, ajuster, regarder ». | Les captures coûtent cher. |

## 2. Faut-il lancer plusieurs agents en parallèle ?

Honnêtement : **le parallèle va plus vite, il ne coûte pas moins.** Chaque agent repart à froid et relit ce dont il a besoin. L'économie vient d'ailleurs :

| Cas | Verdict |
|---|---|
| **Recherche large** (« où est géré X ? », comparer des options) | **Oui, un agent à part** : il lit beaucoup, mais seul son résumé revient dans la session principale, qui reste légère. |
| **Écrans indépendants** (Mois, Recherche, Archive…) une fois les composants partagés prêts | **Oui, en parallèle**, chacun sur des fichiers différents, dans des branches séparées. Gain de temps. |
| **Relecture critique** en fin de tranche, avec une consigne précise | **Oui** : peu coûteux, évite des régressions qui coûteraient bien plus. |
| **Noyau de calcul, schéma SQL, règles d'accès** | **Non**, une seule session, séquentielle : tout est couplé, et les conflits coûtent plus que le parallèle ne rapporte. |

## 3. Quel modèle pour quoi ?

- **Modèle le plus fort** : architecture, schéma SQL et règles d'accès, noyau de calcul, récurrences, synchronisation, décisions difficiles.
- **Modèle plus léger** : portage d'un écran depuis sa maquette, textes, tests répétitifs, documents.

## 4. Définition de « terminé » pour une tranche

1. Les critères d'acceptation des histoires concernées (spec §15) sont couverts par des tests.
2. `npm run check` est vert ; l'intégration continue aussi.
3. L'app est déployée en aperçu sur Vercel et testée sur l'iPhone.
4. `docs/journal.md` est à jour ; la spec est corrigée si la réalité a changé.

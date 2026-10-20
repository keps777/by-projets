# §5 — Règles de progression

> Fait partie de la spécification v2. Index : [`../02-specification.md`](../02-specification.md)

**Base : le mois civil.** La barre d'un sous-projet, d'un projet et d'une rubrique montre l'avancement **du mois en cours** par rapport à ce qui était attendu **ce mois-là**.

**Définitions** pour un sous-projet S, une métrique M de S et un mois X :
1. **Fenêtre** = période commune à S et à X : de `max(début de S, 1er du mois)` à `min(fin de S, dernier jour du mois)`. `jours_fenêtre` = nombre de jours de la fenêtre, bornes incluses.
2. **Cible du mois** (règle de trois) :

| Période de la cible | Cible du mois |
|---|---|
| Au total (ex. 40 jours, 260 chapitres) | `cible × jours_fenêtre ÷ jours_totaux_de_S` |
| Par jour | `cible × jours_fenêtre` |
| Par semaine | `cible × jours_fenêtre ÷ 7` |
| Par mois | `cible × jours_fenêtre ÷ jours_du_mois` |

3. **Réalisé** = agrégation des valeurs saisies pour la clé de M, aux jours de la fenêtre.
4. **Progression** = `réalisé ÷ cible du mois`. On **affiche** au plus 100 %, mais la valeur réelle est conservée (pour le rapport et l'Archive).
5. **Où je devrais être aujourd'hui** (le trait sur la barre) = `cible du mois × jours_écoulés ÷ jours_fenêtre`, aujourd'hui compris. Pour ce qui se compte à l'unité (*fois*, *oui / non*), seules les **unités entières déjà échues** sont attendues (arrondi vers le bas, sauf le dernier jour) ; le trait, le texte (« 1 attendu ») et le retard concordent. Le trait d'un projet ou d'une rubrique est la **moyenne des traits** de ses sous-projets (leur fenêtre peut commencer en cours de mois). **Retard** = attendu − réalisé, jamais présenté comme un échec : « à rattraper à 9,1 ch. par jour » (= ce qui reste ÷ jours restants).
6. **Cas particuliers**
   - *Sens « moins = mieux »* (dépenses) : la barre se remplit de la même façon, mais dépasser 100 % est signalé, et rester sous le trait est bon.
   - *Agrégation « dernière valeur »* (poids, pourcentage) : progression = `(valeur de départ − valeur actuelle) ÷ (valeur de départ − cible)`.
   - *Heure* : progression = part des jours où l'heure respecte la cible.
   - *Sous-projet sans objectif* : affiche « à définir », exclu des moyennes.
   - *Période « au total » sans date de fin* : interdit (la fin est obligatoire).

**Agrégation**
- **Sous-projet** : sa progression est celle de ses **métriques pilotes** (choisies à la création ou dans la Fiche ; par défaut la première métrique qui a un objectif). **Plusieurs métriques peuvent piloter ensemble la barre** : la barre est la **moyenne** de leurs progressions (celles qui ont un objectif) ; le trait « où je devrais être », le retard et le graphique suivent la pilote principale (la première désignée) — **sauf quand toutes les pilotes sont des temps** : l'en-tête du Suivi (réalisé / objectif du mois, attendu, retard, rattrapage), le graphique, l'objectif et le réalisé de chaque jour portent alors sur le **total de tous les temps** (la barre reste la moyenne des progressions : un temps dépassé ne compense pas les autres). L'onglet Suivi montre la part de chaque pilote. Au moins une métrique pilote reste.
- **Projet** : moyenne simple des sous-projets qui ont une progression.
- **Rubrique** : moyenne simple de ses projets.

**Exemples vérifiables**
- *7 chapitres par jour*, du 1er au 31 octobre : cible du mois = 7 × 31 = **217** ; 23 lus → 10,6 % (affiché 11 %) ; au 5 octobre, attendu = 217 × 5 ÷ 31 = 35.
- *Étudier le Nouveau Testament*, 260 chapitres sur octobre : cible du mois = **260** ; au 5 octobre, attendu = 260 × 5 ÷ 31 = 42 ; objectif quotidien = 8,4.
- *Jeûne de 40 jours* du 15 octobre au 23 novembre : en octobre, cible = 40 × 17 ÷ 40 = **17** jours ; en novembre, 23.
- Un sous-projet de **7 jours** ou de **21 jours** suit la même règle, sur sa fenêtre.

## Retraite de 24 h (12 oct. 2026)

Depuis l'écran Projets, l'app propose une journée de rattrapage. **Besoin** = pour chaque métrique qui pilote un sous-projet en cours, le retard du mois (§ « où je devrais être ») converti en temps : temps tel quel ; chapitres 12 min ; pages 2 min ; personnes et âmes 15 min ; fois 30 min ; oui/non 15 min ; choix 30 min ; distance 6 min/km ; geste d'argent 10 min. Arrondi aux 5 minutes ; moins de 5 minutes, rien. Une même saisie (projet + clé) comptée par plusieurs sous-projets n'est rattrapée qu'une fois (le plus gros retard).

**Journée** (06 h → 06 h) : ouverture 06 h–06 h 30, plages de travail 06 h 30–12 h 30, 13 h 30–15 h 30, 16 h–19 h, 20 h–21 h 30 (repas 12 h 30 et 19 h, marche 15 h 30, bilan 21 h 30, nuit 22 h–05 h 30, clôture). Blocs de 90 min au plus, avec une pause de 10 min après un bloc d'au moins 1 h. Capacité de travail : 11 h ; au-delà, chaque besoin est réduit proportionnellement (15 min au minimum) et le manque est annoncé. Les thèmes sont placés dans l'ordre de l'écran Projets.

**Poser au Fil** : une tâche « ce jour seulement » par bloc de rattrapage (sous-projet lié, temps prévu et quantité rattrapée), plus l'ouverture et le bilan. Repas, pauses et nuit restent des repères, sans tâche.

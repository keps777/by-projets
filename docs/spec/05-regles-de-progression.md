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
5. **Où je devrais être aujourd'hui** (le trait sur la barre) = `cible du mois × jours_écoulés ÷ jours_fenêtre`, aujourd'hui compris. **Retard** = attendu − réalisé, jamais présenté comme un échec : « à rattraper à 9,1 ch. par jour » (= ce qui reste ÷ jours restants).
6. **Cas particuliers**
   - *Sens « moins = mieux »* (dépenses) : la barre se remplit de la même façon, mais dépasser 100 % est signalé, et rester sous le trait est bon.
   - *Agrégation « dernière valeur »* (poids, pourcentage) : progression = `(valeur de départ − valeur actuelle) ÷ (valeur de départ − cible)`.
   - *Heure* : progression = part des jours où l'heure respecte la cible.
   - *Sous-projet sans objectif* : affiche « à définir », exclu des moyennes.
   - *Période « au total » sans date de fin* : interdit (la fin est obligatoire).

**Agrégation**
- **Sous-projet** : sa progression est celle de ses **métriques pilotes** (choisies à la création ou dans la Fiche ; par défaut la première métrique qui a un objectif). **Plusieurs métriques peuvent piloter ensemble la barre** : la barre est la **moyenne** de leurs progressions (celles qui ont un objectif) ; le trait « où je devrais être », le retard et le graphique suivent la pilote principale (la première désignée). L'onglet Suivi montre la part de chaque pilote. Au moins une métrique pilote reste.
- **Projet** : moyenne simple des sous-projets qui ont une progression.
- **Rubrique** : moyenne simple de ses projets.

**Exemples vérifiables**
- *7 chapitres par jour*, du 1er au 31 octobre : cible du mois = 7 × 31 = **217** ; 23 lus → 10,6 % (affiché 11 %) ; au 5 octobre, attendu = 217 × 5 ÷ 31 = 35.
- *Étudier le Nouveau Testament*, 260 chapitres sur octobre : cible du mois = **260** ; au 5 octobre, attendu = 260 × 5 ÷ 31 = 42 ; objectif quotidien = 8,4.
- *Jeûne de 40 jours* du 15 octobre au 23 novembre : en octobre, cible = 40 × 17 ÷ 40 = **17** jours ; en novembre, 23.
- Un sous-projet de **7 jours** ou de **21 jours** suit la même règle, sur sa fenêtre.

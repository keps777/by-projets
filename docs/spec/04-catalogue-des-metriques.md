# §4 — Catalogue des métriques

> Fait partie de la spécification v2. Index : [`../02-specification.md`](../02-specification.md)

Chaque valeur est stockée dans une **unité de base** exacte et convertie seulement à l'affichage. C'est ce qui évite les erreurs d'arrondi et les ressaisies.

| Type | Exemples | Unité de base | Affichage | Agrégation par défaut |
|---|---|---|---|---|
| **Temps** | prière 2 h, lecture 45 min | secondes | `2h15`, `0h28`, `~0h28` si approximatif | somme |
| **Fois** | rencontre dynamique 3 fois par jour | entier | `2/3` | somme |
| **Nombre** | chapitres, pages, versets, personnes, âmes, séances, pièces, articles (unité libre) | décimal | `166/417 p.` | somme |
| **Montant** ($) | entrées, sorties, épargne, dons — l'objectif peut être **« x % d'un montant »** (15 % du salaire : on entre le pourcentage et le montant, l'objectif = montant × x ÷ 100) | centimes + devise | `1 380,00 $` | somme |
| **Oui / Non** | don fait, lever à l'heure | 0 ou 1 | coche | somme (jours « oui ») |
| **Choix** | jeûne **complet** ou **partiel** | valeur de l'option (Complet = 1, Partiel = 0,5, Aucun = 0) | libellé de l'option | somme des valeurs |
| **Distance** | course de 5 km | mètres | `5,0 km` | somme |
| **Poids** | 75 kg | grammes | `75,5 kg` | **dernière valeur** (c'est un état) |
| **Note /10** | énergie, humeur | entier 0 à 10 | `8/10` | moyenne |
| **Pourcentage** | avancement d'un livrable | 0 à 100 | `60 %` | dernière valeur |
| **Heure** | heure du lever | minutes depuis minuit | `05:10` | moyenne ; peut viser « plus tôt = mieux » |
| **Référence** | passages lus, livre et auteur | texte | `Mt 8–10` | aucune (texte) |

**Règles**
- Une métrique a : un **type**, un **nom**, une **unité**, un **objectif** (facultatif) avec sa **période** (par jour, par semaine, par mois, au total), un **sens** (plus = mieux ou moins = mieux ; ex. dépenses), et l'option **« dans le rapport »**.
- L'utilisateur peut ajouter autant de métriques qu'il veut à un sous-projet, et choisir ou taper l'unité (des unités rapides sont proposées pour le type Nombre).
- **Passages** : une saisie de passages (Mode Focus) remplit à la fois la **Référence** (texte) et le **Nombre de chapitres**, calculé à partir du nombre de chapitres de chaque livre. Le total reste modifiable à la main.
- **Calculs automatiques** (catalogue fermé en v1, formules libres plus tard) :

| Calcul | Formule |
|---|---|
| Solde | Entrées − Sorties |
| Reste du budget | Budget − Sorties, et reste par jour jusqu'à la fin de la période |
| Taux d'épargne | Épargne ÷ Entrées |
| Rythme | Valeur cumulée ÷ jours écoulés |
| Durée moyenne | Temps ÷ Fois |
| Allure | Temps ÷ Distance |
| Personnes par heure | Personnes ÷ Temps |
| Chiffre d'affaires par heure | Montant ÷ Temps |
| Reste à épargner | Objectif − Épargné |
| Écart à la cible | Valeur − Cible (ex. heure du lever − 05:00) |
| Jours de jeûne | Complets + 0,5 × Partiels |

- **Modèles proposés par rubrique** (copiés puis ajustables) :
  - *Relation avec Dieu* : lecture biblique, rencontre quotidienne, prière, mémorisation de versets, jeûne, don à Dieu.
  - *Service à Dieu* : évangélisation, suivi de disciple, dons.
  - *Travail et études* : livrable à rendre, étude ou cours, entrepreneuriat.
  - *Vie personnelle* : budget du mois, sport, poids et santé, épargne maison, rangement du logement, réveil et sommeil, garde-robe.
  - Tout peut aussi partir de zéro.

## Plusieurs temps dans un sous-projet (20 oct. 2026)

Un sous-projet peut suivre **plusieurs métriques de temps** (prière, évangélisation, travaux pratiques…). Plus de refus « liraient la même saisie » : dès qu'il y a deux temps, chacun reçoit sa **clé nommée** `temps:<nom>` (nom sans accents ni espaces : `temps:priere`). Deux temps de même nom restent refusés. Ajouter un deuxième temps dans la Fiche lui donne aussi une clé nommée ; le temps générique `temps` existant garde son sens (total).

**Le temps générique `temps` reste le total du temps passé** : blocs terminés, chronos et saisies l'alimentent toujours, et le rapport le lit. Les temps nommés se remplissent ainsi :
- **Chrono lancé depuis le sous-projet** : la fenêtre de fin de session demande « Compter ce temps pour » (un seul temps par session, le premier par défaut). La session s'écrit sur `temps` et sur le temps choisi.
- **Bloc de tâche** : si la tâche prévoit un temps nommé (mesure `temps:<nom>`), le bloc terminé lui donne le **temps réellement écoulé** (les autres mesures prennent la valeur prévue).
- **Saisie à la main d'un jour** : un temps nommé tapé s'ajoute aussi au `temps` du jour (sauf si on saisit soi-même le temps générique).

**Affichage** (onglet Suivi, au-dessus du reste) : « Temps · ce mois » liste chaque temps avec son total du mois (et son objectif s'il en a un), puis **Total de tous les temps** : la somme des temps nommés, ou, si le temps générique fait partie des métriques, sa valeur.

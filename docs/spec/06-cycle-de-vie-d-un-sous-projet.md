# §6 — Cycle de vie d'un sous-projet

> Fait partie de la spécification v2. Index : [`../02-specification.md`](../02-specification.md)

`brouillon → en cours → à valider → terminé → archivé`

1. **En cours** : à partir de la date de début.
2. **À valider** : dès que la date de fin est passée, ou quand la cible « au total » est atteinte. L'app propose « Valider ce sous-projet ? » (notification et carte). Rien ne se termine en silence.
3. **Validation** : écran récapitulatif (réalisé et cible, durée, note finale facultative). L'utilisateur confirme → **terminé**. Il peut ensuite **signer** le document (PDF) ; le sous-projet entre dans l'**Archive**.
4. Un sous-projet **sans fin** ne se termine qu'à la main.
5. On peut **mettre en pause** un sous-projet (il sort des moyennes) et **le rouvrir** depuis l'Archive.
6. Au changement de mois, aucune clôture : les barres repartent de zéro pour le nouveau mois ; les sous-projets continuent.

**Création en cours de route et reprise du passé**
- Les saisies appartiennent au **projet**, pas au sous-projet. Un sous-projet lit les saisies de son projet qui portent **la même clé de métrique**, aux dates de sa période.
- À la création, l'option **« Reprendre les saisies existantes »** (activée par défaut) compte les saisies déjà faites sur la période du sous-projet, y compris avant sa création. L'écran annonce ce qui sera repris (ex. « 5 jours : 23 chapitres, 2 h 30 »). Désactivée, le sous-projet commence à zéro à sa date de création.
- Une métrique dont la clé n'a encore jamais été saisie démarre à zéro ; elle apparaît dans le volet des prochaines occurrences.

### 6.1 Le document PDF

Un **format type unique** pour tous les sous-projets ; seuls les blocs et les colonnes s'adaptent au contenu.

| Zone | Contenu |
|---|---|
| **En-tête** | Nom de l'app, rubrique, projet (avec son code de rapport), période, état (en cours, terminé, signé). |
| **Titre** | Nom du sous-projet. |
| **Fiche** | Les 7 questions : quoi, pourquoi, qui, où, quand, comment, combien. |
| **Objectifs et résultats** | Une ligne par métrique : objectif, réalisé, pourcentage. |
| **Journal** | Un tableau jour par jour. **Les colonnes suivent les métriques du sous-projet** : lecture = chapitres, passages, temps ; finances = entrées, sorties, catégories ; sport = séances, distance, durée. |
| **Graphique** | Courbe ou barres du mois, avec le trait « où je devrais être ». |
| **Notes marquantes** | Les notes que l'utilisateur a choisi de garder. |
| **Bilan** | Texte final facultatif écrit à la validation. |
| **Signatures** | Utilisateur et, si désiré, une seconde personne ; date et lieu. |
| **Pied de page** | Numérotation, date de génération. |

- L'**aperçu** se met à jour à chaque saisie (« document vivant »). L'**export PDF** reprend exactement l'aperçu.
- Le PDF est généré **sur l'appareil**, aucune donnée ne quitte le téléphone pour le produire.
- La signature se dessine au doigt, puis s'intègre au PDF avec la date.

## Tâches proposées (7 oct. 2026)
Dans la Fiche, quand **aucune tâche ne nourrit le sous-projet** — ou que les tâches ne planifient pas assez de temps par semaine pour son objectif de temps — l'app **propose des tâches** : *tous les jours*, *du lundi au vendredi*, *3 fois par semaine*, avec la durée qui remplit l'objectif (ex. 2 h par semaine → 20 min × 7 jours) et, pour un objectif de pages ou de fois, la valeur prévue à chaque fois. Toucher une proposition ouvre « Nouvelle tâche » prérempli (projet, sous-projet nourri, titre, durée, récurrence, valeurs prévues). Seuls les objectifs cumulables (temps, fois, nombre, montant) donnent des propositions.


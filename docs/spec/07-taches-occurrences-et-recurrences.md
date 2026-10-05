# §7 — Tâches, occurrences et récurrences

> Fait partie de la spécification v2. Index : [`../02-specification.md`](../02-specification.md)

**Ajout d'une tâche** (bouton **+** du Fil), dans cet ordre :
1. **Quoi** : titre (ex. « Rencontre avec Christopher »).
2. **Projet associé** : interrupteur. Activé : choisir la rubrique, puis le projet. Désactivé : **rendez-vous / réunion sans projet** (gris dans Le Fil, rappel actif, aucune saisie chiffrée sauf le temps).
3. **Sous-projets alimentés** : un interrupteur par sous-projet du projet, avec les mesures de chacun.
4. **Ce que la tâche enregistre** : l'union des métriques des sous-projets activés (sans doublon), avec une **valeur prévue** par occurrence (ex. 1 rencontre, 45 min).
5. **Quand** : jour de début, **récurrence**, heure de début (par pas de 15 min), durée (15, 30, 45, 60, 90 min), **vérification de disponibilité** (§7.3).
6. **Rappel** : à l'heure, 5, 10 ou 15 minutes avant.

### 7.1 Récurrences
| Choix | Détail |
|---|---|
| **Ce jour seulement** | Une occurrence, à la date choisie. |
| **Tous les jours** | À partir du jour de début. |
| **Chaque semaine** | Un ou plusieurs jours parmi L M M J V S D, et on lit « *N fois par semaine* ». Raccourcis : Lun. – Ven., Week-end, Tous les jours. |
| **Chaque mois** | « Le 8 de chaque mois » ou « le 2ᵉ jeudi du mois ». |
| **Fin** | Sans fin · jusqu'à une date · après N fois. |

Le tout apparaît dans les vues Jour, Semaine et Mois.

### 7.2 Occurrences
- Stockage de la règle : fréquence, intervalle, jours de semaine, jour du mois ou rang du jour, fin, **fuseau**. L'heure locale est conservée (05:00 reste 05:00 à l'heure d'été).
- Les occurrences sont **matérialisées sur 90 jours glissants** (à chaque modification et chaque nuit). Les occurrences passées ne changent plus.
- **Modifier ou supprimer** : « cette occurrence », « celle-ci et les suivantes » ou « toute la série ».
- **Reporter** (volet d'un bloc) : choisir le jour et l'heure, régler le rappel ; l'occurrence devient une exception de la série.
- L'utilisateur peut **associer plus tard** à un projet une tâche sans projet.

### 7.3 Disponibilité
- Le créneau choisi est comparé à **toutes** les occurrences du jour. S'il est libre : « Créneau libre ».
- S'il est occupé : l'app nomme la tâche en conflit et propose le créneau libre **le plus proche après** et **le plus proche avant**, de même durée, au pas de 5 min, dans la même journée. L'utilisateur peut accepter une suggestion ou **garder l'heure** (chevauchement permis).
- Une journée de plus de 12 h planifiées déclenche une alerte douce (« journée très chargée »).

## Précisions issues de la construction (5 oct. 2026)
- « Celle-ci et les suivantes » termine la série la veille de l'occurrence choisie. « Toute la série » recrée les occurrences à venir (y compris celles supprimées une à une) ; les faites, en cours et reportées restent intactes.
- Une occurrence supprimée n'est jamais recréée par la matérialisation.
- Une saisie (§8) confirme le bloc ; un bloc jamais lancé prend la durée de **son occurrence** (pas celle de la tâche).

## Gestes du Fil et de l'ajout de tâche (5 oct. 2026)
- **Glisser la journée** vers la gauche (jour suivant) ou vers la droite (jour précédent) ; la journée glisse du côté d'où l'on vient.
- **Toucher un espace libre** de la journée ouvre l'ajout de tâche, avec le jour affiché et l'heure touchée **arrondie à la demi-heure inférieure** (toucher à 1 h 40 → 1 h 30).
- **Choisir l'heure d'un coup** : toucher l'heure (grand affichage) ouvre la roue de l'iPhone ; des raccourcis « Matin 8 h · Midi 12 h · Après-midi 15 h · Soir 18 h · Nuit 21 h » complètent −15 / +15.
- **Durée libre** : la durée d'une tâche n'est pas limitée aux durées courantes (15 min à 4 h en raccourcis). Elle se règle par −15 / +15 ou se tape (« 3h45 », « 1:30 », « 90 min », « 4 heures »), de 5 min à 24 h ; une durée qui dépasserait minuit fait commencer la tâche plus tôt. Les valeurs prévues par défaut suivent la durée.

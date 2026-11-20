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
- **Propositions de titre** : sous le champ « Quoi ? », des propositions apparaissent — les tâches déjà créées (les plus récentes d'abord, sans doublon, insensibles aux accents) et des titres génériques (« Rencontre avec… », « Rendez-vous », « Appel avec… »). Choisir une tâche déjà créée **reprend ses réglages** : projet, sous-projets alimentés, valeurs prévues, durée et rappels ; le jour, l'heure de début et la récurrence choisis restent. Choisir un titre générique remplit le champ.
- Modifier la durée d'une tâche (toute la série, ou une occurrence) redessine aussitôt son bloc sur Le Fil.

## Créer un projet ou un sous-projet depuis l'ajout de tâche (6 oct. 2026)
- Une tâche peut être **à l'origine** d'un projet ou d'un sous-projet : la liste des projets se termine par **« + Nouveau projet »** (nom seul, créé dans la rubrique choisie, puis sélectionné) et la liste des sous-projets par **« + Nouveau sous-projet »** (nom + **menu déroulant à choix multiples** des mesures : celles déjà utilisées dans les projets, puis toutes celles de l'app — temps, fois, nombre, montant, distance, poids, note, heure, passages, etc. ; au moins une ; démarre aujourd'hui, sans fin ni objectif).
- Le sous-projet créé est tout de suite alimenté par la tâche ; objectif, période et autres métriques s'affinent ensuite dans Projets (formulaire complet « Nouveau sous-projet »).
- **Valeur prévue d'une mesure de temps** (étape « Ce que cette tâche enregistre ») : deux **menus déroulants Heures (0–24) et Minutes (00–59)** remplacent le −/+ ; les autres mesures gardent − / +.

## Ajout de tâche simplifié (nov. 2026)

Le formulaire « Nouvelle tâche » doit rester **rapide** : peu de blocs, de vrais menus déroulants, rien qui oblige à défiler longtemps.

- **Projet associé** : après la rubrique (onglets : Relation avec Dieu, Service à Dieu, etc., toujours présents), la liste ne propose que les **projets en cours** : statut « actif » et au moins un sous-projet en cours ou à valider (un projet encore sans sous-projet compte comme en cours). Les projets en pause, archivés, ou dont tous les sous-projets sont terminés ou en pause n'apparaissent pas ; en modification, le projet déjà choisi reste affiché. « Nouveau projet » reste proposé en tête de liste.
- **Quand** (une seule carte compacte, trois menus) :
  1. **Jour** : menu (Aujourd'hui, Demain, puis les jours de la semaine avec leur date, « Autre date… » ouvre le sélecteur du système) ;
  2. **Heure et durée** : deux menus d'heure (heures, minutes par 5) et un menu de durée (de 5 min à 8 h, plus « Autre » si la tâche a une durée libre) ;
  3. **Répéter** : un menu — Une seule fois · Tous les jours · Du lundi au vendredi · Le week-end · Chaque semaine (choix des jours) · Chaque mois. Seul « Chaque semaine » affiche la rangée de jours ; seule une répétition affiche « Jusqu'à quand » (menu : Sans fin · Jusqu'à une date · Après N fois).
  La **vérification de disponibilité** (§7.3) reste, en une ligne qui propose les créneaux libres.
- **Rappel** : **exhaustif et en menu**. Une liste de rappels (pastilles avec ✕) et un menu « Ajouter un rappel » avec **tous** les délais : À l'heure, 5, 10, 15, 30, 45 min, 1 h, 2 h, 3 h, 1 jour, 2 jours, 1 semaine avant. Plusieurs rappels possibles ; le plus proche du début est celui de l'alarme. L'interrupteur Alarme reste.

## Le Fil · journée en deux parties : Prévu | Fait (nov. 2026)

La journée du calendrier (vue Calendrier · Jour) est **partagée en deux colonnes** côte à côte, sur la même échelle d'heures :
- **Prévu** (gauche) : tout ce qui est planifié, à l'heure prévue, comme avant (le glisser pour déplacer, les poignées, ▶ et la ligne « maintenant » restent ici). Un bloc fait y garde sa coche.
- **Fait** (droite) : ce qui a **réellement** été fait, à l'heure où cela a été fait. Quand on termine un bloc, il se pose ici, du début réel du minuteur à sa fin ; un bloc dont le minuteur tourne y apparaît en direct (sa fin suit « maintenant »). Un bloc coché sans minuteur prend son créneau prévu. Chaque bloc montre son réalisé (« 3/7 ch. », « 52 min »).
- En-têtes **Prévu · n** et **Fait · n · durée totale**.
- **Remplir ce qui a été fait** : toucher un espace libre de la colonne Fait ouvre « Ce que j'ai fait » (quoi, projet en cours, heure de début, durée). Le bloc créé est **déjà fait** : il n'apparaît que dans Fait (il n'était pas prévu) et alimente les sous-projets comme une saisie. Un bloc créé ainsi est reconnu à sa saisie, de source « rattrapage » (elle le reste après une correction). Il n'a aucun rappel. On peut aussi remplir un jour passé.
- Un bloc fait ou en cours s'ouvre comme les autres (volet du bloc). Les vues Tableau, Semaine et Mois ne changent pas.

## Horaire type dans Prévu (nov. 2026)

**Réglages · Horaire type** : l'application (ou le bouton « Poser mon horaire type ») crée, en une fois, les tâches récurrentes de la journée type (points de prière : communion, Bible, méditation, repos, préparation, travail, repas, évangélisation, projets personnels, temps libre, lecture), à leurs heures, chaque jour ou seulement certains jours. Elles apparaissent dans la colonne **Prévu** du Fil.
- Tâches **sans projet** et **sans rappel** (aucune notification de plus : on en ajoute une depuis « Modifier la tâche »).
- Les jours spéciaux remplacent le bloc habituel : le **vendredi** (nuit de prière 00 h–06 h, puis communion fraternelle et repos 06 h–12 h), le **mercredi** (FDL 21 h–00 h au lieu du temps libre et de la lecture), le **lundi** (logement propre 21 h–22 h et cuisine 21 h–23 h au lieu du temps libre), le **dimanche** (bilan des finances 21 h–22 h, temps libre 22 h–23 h). Pas de lecture le vendredi.
- **Idempotent** : un bloc dont le titre existe déjà comme tâche active n'est pas recréé. « Retirer l'horaire type » supprime ces séries (les blocs déjà faits sont gardés).
- Aussi posés, à une heure choisie faute d'heure dans les points de prière : **jeûne partiel du lundi** (00 h–18 h), **dons du mois et épargne** le 1er vendredi du mois (11 h–12 h), **lessive** le 2ᵉ et le dernier lundi du mois (19 h–21 h).
- **Pose automatique** : à la première ouverture sur un appareil (après la synchronisation), l'horaire type se pose tout seul ; il ne revient plus après « Retirer l'horaire type » sur cet appareil. « Poser mon horaire type » le repose à la demande.

# §15 — Histoires utilisateur et critères d'acceptation

> Fait partie de la spécification v2. Index : [`../02-specification.md`](../02-specification.md)

Format : *En tant que moi, je veux… afin de…*. Chaque critère est vérifiable.

**US-01 · Compte.** Je veux créer un compte et me connecter avec e-mail et mot de passe.
- La création demande prénom, e-mail et mot de passe de 12 caractères au moins ; le prénom devient le titre « {Prénom} Life ».
- Après connexion, mes projets par défaut (voir `04`) et mes modèles sont déjà présents.
- Aucune récupération de mot de passe par e-mail en v1 ; l'inscription se ferme une fois mon compte créé.

**US-02 · Installation.** Je veux ajouter l'app à l'écran d'accueil de mon iPhone.
- Un pas à pas en 4 étapes s'affiche au premier lancement.
- L'icône et le nom « {Prénom} Life » apparaissent sur l'écran d'accueil ; l'app s'ouvre en plein écran.

**US-03 · Notifications.** Je veux autoriser les notifications.
- La demande du système n'apparaît qu'après un appui sur « Autoriser les notifications ».
- Je choisis le délai par défaut (à l'heure, 5, 10 ou 15 min) et l'affichage des titres.
- Si j'ai refusé, un bandeau me l'indique dans les Réglages avec la marche à suivre.

**US-04 · Le Fil du jour.** Je veux voir ma journée sur 24 h.
- La ligne de l'heure descend en direct avec une pastille de l'heure ; l'écran s'ouvre sur « maintenant ».
- Chaque bloc a la couleur de sa rubrique, un cercle (vide) ou une coche (fait), et la progression du mois de son projet.
- Un bloc sans projet est gris.

**US-05 · Jours, semaine, mois.** Je veux changer de jour, de semaine et de mois.
- Toucher un jour du bandeau affiche ce jour ; les jours passés montrent ce qui a été fait, les jours futurs ce qui est prévu.
- La vue **Semaine** place chaque bloc à son heure dans 7 colonnes.
- La vue **Mois** montre, au choix, la charge (proportions par rubrique) ou l'accompli (intensité) ; toucher un jour ouvre ce jour.

**US-06 · Minuteur.** Je veux lancer, mettre en pause et terminer un bloc.
- ▶ sur un bloc : il se remplit de gauche à droite ; le temps est exact même app fermée (calcul par horodatage).
- Pause et reprise sont possibles depuis le bloc, la carte du bas, le volet et le Mode Focus.
- À la fin prévue : « As-tu terminé ? » avec Oui, Corriger le temps, Pas encore.

**US-07 · Saisir et corriger.** Je veux noter ce que j'ai fait, une seule fois, et le corriger au besoin.
- Le volet affiche chaque métrique avec « réalisé / prévu » et des boutons − et +.
- Après correction (ex. 20 min au lieu de 30), les barres de tous les sous-projets liés et le rapport changent immédiatement.

**US-08 · Mode Focus et passages.** Je veux saisir librement mes lectures.
- Je saisis livre, chapitre de début, chapitre de fin, autant de fois que nécessaire ; le total de chapitres se calcule et se compare à l'objectif.
- Le total et la référence alimentent les sous-projets de lecture et le rapport.

**US-09 · Ajouter une tâche.** Je veux ajouter une tâche liée à un projet.
- Le parcours suit §7 : titre → projet → sous-projets alimentés → valeurs prévues → quand → rappel.
- La récurrence propose ce jour seulement, tous les jours, chaque semaine (jours choisis, « N fois par semaine »), chaque mois (jour du mois ou rang du jour), avec une fin.
- La tâche apparaît dans les vues Jour, Semaine et Mois à toutes ses occurrences.

**US-10 · Rendez-vous sans projet.** Je veux ajouter une réunion qui n'alimente aucun projet.
- Désactiver « Associer à un projet » masque les sous-projets et les métriques.
- Le rendez-vous apparaît en gris, avec son rappel ; je peux l'associer à un projet plus tard.

**US-11 · Disponibilité.** Je veux savoir si un créneau est libre.
- Libre : message « Créneau libre ».
- Occupé : l'app nomme la tâche en conflit et propose le créneau libre le plus proche **après** et **avant**, de même durée.
- Je peux garder l'heure malgré le chevauchement.

**US-12 · Reporter.** Je veux déplacer un bloc.
- Je choisis le jour et l'heure, et le rappel (5, 10, 15 min avant) ; les mêmes vérifications de disponibilité s'appliquent.
- Seule l'occurrence concernée bouge ; la série reste intacte.

**US-13 · Modifier une série.** Je veux changer ou supprimer une tâche récurrente.
- Je choisis : cette occurrence, celle-ci et les suivantes, ou toute la série.
- Les rappels des occurrences touchées sont recalculés.

**US-14 · Rubriques et projets.** Je veux ajouter et retirer des rubriques, des projets et des sous-projets.
- Le mode Modifier permet chaque ajout et chaque retrait ; retirer demande une confirmation et conserve les saisies passées (archivées).
- Les projets par défaut sont ceux de `04`, sans le projet 24.

**US-15 · Nouveau sous-projet depuis un modèle.** Je veux créer un sous-projet en quelques touches.
- Les modèles de la rubrique sont proposés ; choisir un modèle remplit nom, période, métriques et calculs.
- Tout reste modifiable ; « Partir de zéro » est possible.

**US-16 · Métriques personnalisées.** Je veux choisir et régler mes métriques.
- Je peux ajouter les 12 types du §4, nommer la métrique, choisir ou taper l'unité, fixer l'objectif et sa période, choisir le sens, et décider si elle va dans le rapport.
- Pour le type Choix, les valeurs des options (ex. complet = 1, partiel = 0,5) sont modifiables.

**US-17 · Reprise du passé.** Je veux qu'un sous-projet créé plus tard compte ce qui a déjà été fait.
- L'écran annonce ce qui sera repris (ex. « 5 jours : 23 chapitres, 2 h 30 »).
- Activé : ces valeurs sont comptées sans ressaisie. Désactivé : le sous-projet commence à zéro.

**US-18 · Progression mensuelle.** Je veux voir où j'en suis ce mois-ci.
- Les barres suivent les règles du §5 ; les exemples chiffrés du §5 sont des tests d'acceptation (217 → 11 %, 260 → 42 attendus au 5 oct., 17 jours de jeûne en octobre).
- Le trait montre où je devrais être ; le retard s'énonce « à rattraper à X par jour ».

**US-19 · Valider un sous-projet.** Je veux clore un sous-projet.
- À la fin de la période ou quand la cible est atteinte, l'app propose de valider ; rien ne se termine seul.
- Après validation, le sous-projet est dans l'Archive, avec son PDF si je l'ai signé.

**US-20 · Fiche et document.** Je veux une fiche de suivi qui se remplit seule.
- La fiche contient les 7 questions (quoi, pourquoi, qui, où, quand, comment, combien).
- Le document aperçu se met à jour à chaque saisie ; je peux l'exporter en PDF et le signer au doigt.

**US-21 · Finances.** Je veux suivre entrées, sorties et épargne en dollars.
- Les montants sont exacts au cent ; le solde, le reste du budget et les sorties par catégorie se calculent seuls.
- Les mouvements saisis dans un bloc apparaissent dans le sous-projet sans ressaisie.

**US-22 · Rapport du jour.** Je veux un rapport chaque soir.
- Il est généré à l'heure choisie, même app fermée ; il suit le format du §9 (métriques séparées par des points-virgules).
- Une notification m'avertit qu'il est prêt.

**US-23 · Paramétrer les points.** Je veux choisir les points du rapport et leurs mesures.
- Je peux ajouter, retirer, réordonner les points, renommer leur code, choisir les métriques affichées.
- Le changement s'applique aux prochains rapports et à l'aperçu.

**US-24 · Exporter.** Je veux envoyer seulement certains points.
- Je choisis les points ou un préréglage ; l'aperçu montre le message exact ; Copier et Partager fonctionnent.
- Les préréglages sont enregistrables.

**US-25 · Récapitulatifs.** Je veux le bilan de la semaine et du mois.
- Les onglets Semaine et Mois totalisent chaque point (fait / attendu) et sont exportables.
- Les archives listent tous les rapports, avec recherche.

**US-26 · Rappels.** Je veux être prévenu avant chaque bloc.
- La notification arrive au délai choisi ; la toucher ouvre l'écran Action rapide (Lancer, Reporter).
- Un rappel ne part jamais deux fois ; reporter ou supprimer un bloc corrige son rappel.

**US-27 · Recherche.** Je veux retrouver n'importe quoi.
- Un champ unique cherche dans projets, sous-projets, tâches, saisies et notes, rapports ; il ignore les accents et la casse.
- Je peux filtrer par type et relancer une recherche récente.

**US-28 · Hors ligne.** Je veux utiliser l'app sans réseau.
- Je peux consulter, cocher, saisir, lancer le minuteur et reporter ; tout se synchronise au retour du réseau, sans doublon.
- L'état de synchronisation est visible.

**US-29 · Mes données.** Je veux garder le contrôle de mes données.
- Je peux exporter toutes mes données et supprimer mon compte.
- Aucun e-mail contenant mes données n'est jamais envoyé.

**US-30 · Apparence.** Je veux choisir nuit, jour ou automatique.
- Le choix s'applique à tous les écrans et se mémorise.

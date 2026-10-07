# §12 — Écrans

> Fait partie de la spécification v2. Index : [`../02-specification.md`](../02-specification.md)

| Écran | Planche des maquettes | Contenu et règles |
|---|---|---|
| **Connexion** | Connexion | Se connecter / Créer un compte (utilisé une seule fois), e-mail, mot de passe (afficher), prénom à la création. |
| **Installation** | Installer | 4 étapes à cocher pour ajouter l'app à l'écran d'accueil. |
| **Autorisation des notifications** | AutoriserNotifications | Aperçu, délai par défaut, titres visibles, bouton qui ouvre la demande du système. |
| **Le Fil** (accueil) | Main, FilLance, FilConfirmer, FilVolet, FilReporter | Titre « {Prénom} Life », recherche, notifications, **+**. Sélecteur **Jour · Semaine · Mois**. Bandeau des jours **cliquable**. Journée de 24 h avec **ligne de l'heure en direct** et pastille de l'heure. Blocs de la couleur de la rubrique, ▶ pour lancer, bloc plein et coche si fait, cercle vide sinon, progression du mois du projet sur chaque bloc. Carte du bas : « En ce moment » / « Ensuite » avec Lancer, Pause, Terminer ; **glisser la carte vers le haut** affiche les blocs **non faits** qui suivent (demain, les jours d'après…), **vers le bas** ceux d'avant (en retard, jours passés) ; un bloc marqué fait n'y apparaît jamais ; le rang « 2/5 » s'affiche à côté du titre : le 2e des 5 blocs non faits **du jour du bloc affiché**, « Lancer » seulement pour un bloc d'aujourd'hui. |
| **Volet d'un bloc** | FilVolet | Fil d'Ariane, minuteur, **valeurs réalisées corrigeables** (avec réalisé / prévu), Marquer comme fait, Reporter, Mode Focus, liste des **sous-projets alimentés** avec leur barre et le trait « où je devrais être ». |
| **Reporter** | FilReporter | Jour, heure, rappel, disponibilité, créneaux libres juste avant et après. |
| **Mode Focus** | Focus | Voir §8. |
| **Action rapide** | ActionRapide | Ouverte par une notification : compte à rebours, Lancer maintenant, Reporter, Voir le Fil. |
| **Semaine** | Semaine | Grille de 7 colonnes avec les blocs placés à leur heure (fait, prévu, non fait), ligne de l'heure, légende, « Remplis ma semaine ». Les récapitulatifs chiffrés sont dans **Rapports**. |
| **Mois** | Mois | Grille du mois. Couche **Charge** : barre de proportions par rubrique dans chaque jour. Couche **Accompli** : intensité selon le % fait. Statistiques du mois et progression par rubrique. Toucher un jour ouvre Le Fil de ce jour. |
| **Recherche** | Recherche | Projets, sous-projets, tâches, saisies et notes, rapports ; filtres ; recherches récentes ; insensible aux accents. |
| **Rapports** | Rapport, RapportSemaine, RapportMois, RapportExport, Archives | Voir §9. |
| **Projets** | Projets, ProjetsEdition | Progression du mois par rubrique, projets avec leurs sous-projets dépliables, **rubriques repliables par une flèche** (repli gardé sur l’appareil ; toujours dépliées en mode Modifier), mode **Modifier** (ajouter ou retirer projets, sous-projets, rubriques). |
| **Sous-projet** | SousProjet, SousProjetNT, SousProjetFiche, SousProjetDocument, SousProjetTemps, SousProjetFinances | Onglets **Suivi** (objectif et réalisé du jour, graphique du mois, retard et rattrapage), **Fiche** (7 questions, métriques, tâches liées, statut), **Document** (aperçu vivant, PDF, signature), **Temps** (à venir, historique). Exemple en dollars : solde, entrées, sorties, catégories, mouvements. |
| **Nouveau sous-projet** | NouveauSousProjet, NouveauSousProjetFinances | Modèles par rubrique, nom, période, **reprise du passé**, métriques éditables, calculs automatiques. |
| **Ajouter une tâche** | AjouterTache, AjouterTacheSansProjet | Voir §7. |
| **Archive** | Archive, ArchiveRapports | Onglets **Accomplis** (avec le verset 1 Samuel 7:12) et **Rapports**. |
| **Réglages** | Reglages | Prénom, nom dans le rapport, langue du rapport, points du rapport et mesures, exports enregistrés, notifications (appareil, titres visibles), quels rappels recevoir, apparence. |

## Feuilles (volets) : fermer et supprimer (6 oct. 2026)
Toute feuille qui monte du bas se ferme **facilement** : bouton ✕ toujours visible en haut à droite, glissement vers le bas (depuis le haut de la feuille ou, quand elle est tout en haut, depuis n'importe où), appui à côté, touche Échap. Le volet d'un bloc ajoute en bas **Fermer** et **Supprimer la tâche** (un seul bloc, celui-ci et les suivants, ou toute la série pour une tâche qui se répète). Un fond opaque couvre la barre d'état de l'iPhone pour que le contenu qui défile ne passe pas sous l'heure.

## Glisser un bloc, dupliquer une tâche (7 oct. 2026)
- **Glisser un bloc sur la journée** (Le Fil, Jour) : un **appui long** (≈ 0,4 s, léger retour haptique) soulève un bloc *prévu* ; on le fait glisser vers le haut ou le bas : **début et fin changent ensemble**, au pas de 5 min, la durée est gardée (journée de 24 h, même jour). Le bloc choisi montre deux **poignées** : celle du haut change le **début**, celle du bas la **fin** (durée minimale 15 min). Un toucher ailleurs les enlève. Près du haut ou du bas de la zone, la journée défile toute seule. À la souris, le glisser commence dès qu'on bouge. Un simple appui ouvre toujours le bloc. Un bloc fait, en cours ou en pause ne se déplace pas. Seule l'occurrence change (la série reste intacte) ; ses rappels et alarmes à venir sont recalculés.
- **Dupliquer une tâche** : bouton **Dupliquer la tâche** dans le volet d'un bloc. Le formulaire « Nouvelle tâche » s'ouvre prérempli (titre, projet, sous-projets alimentés, valeurs prévues, durée, rappels, alarme, récurrence), posé à la fin du bloc copié ; rien n'est créé tant qu'on ne touche pas « Ajouter au Fil ».


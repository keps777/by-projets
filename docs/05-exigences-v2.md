# 05 — Exigences issues des retours sur les maquettes (5 oct. 2026)

> Statut : **à intégrer dans `02-specification.md`** dès validation des maquettes v2.
> Maquettes : https://claude.ai/artifact/5ZgqUjisYTEMRLL3w6d2F6 (pages « Version 2 · Nuit » et « Version 2 · Jour »).

## Général
- **Titre de l'app = « {Prénom} Life »** (ex. « Luther Life ») ; le prénom se règle dans Réglages.
- **Mode nuit** (par défaut) et mode jour, plus un réglage « Auto ».
- Le libellé **« avec grâce » est retiré partout**.
- Les **25 projets du carnet** sont les projets par défaut ; on peut ajouter/retirer des projets, ajouter des **rubriques** et des **sous-projets**.
- **Notifications** : avant chaque bloc (5/10/15 min, bouton « Lancer »), rapport du soir, récap hebdo, récap mensuel.

## Le Fil (écran principal)
- Journée façon Apple Calendar, **24 h**, avec la **ligne rouge de l'heure** (pastille de l'heure dans la marge) ; l'écran s'ouvre sur « maintenant ».
- Chaque bloc a un bouton **▶ Lancer** : le bloc **se remplit de gauche à droite** au fil du temps ; **pause / reprise** possibles.
- À la fin du minuteur : **« As-tu terminé ? »** → Oui (le bloc devient plein, stylé, avec la **coche**) / Corriger le temps / Pas encore. Non fait = **cercle vide**.
- Chaque bloc montre la **progression du sous-projet** (barre + %).
- Volet d'un bloc : minuteur, **valeurs réalisées corrigeables à la main** (temps, nombre de fois, quantité) avec visuel réalisé/prévu, progression du sous-projet, Reporter, Mode Focus.
- **Reporter** : jour + heure, rappel avant (5/10/15 min). Vérifie la **disponibilité** ; si occupé, affiche la tâche qui occupe et propose **le créneau libre le plus proche après et avant** ; on peut aussi chevaucher.

## Mode Focus
- Minuteur avec pause / reprise / terminer.
- Saisie **libre des passages** : livre + chapitre de début + chapitre de fin, plusieurs entrées (ex. Matthieu 8–10, Luc 22) ; **total de chapitres calculé**.

## Rapport quotidien (« Report »)
- Généré **chaque fin de journée**, avec **récap par semaine et par mois**, et **archives** consultables.
- **Points paramétrables** (5, 10, 12…) ; pour chaque point, on choisit les mesures : **nombre de fois** (objectif), **quantité** (unité + objectif), **temps**, **détail** (passages, livre + auteur).
- Exemples : DDEWG = fois + temps (sessions détaillées) ; PA = temps ; BR = chapitres (+ temps, passages) ; CL = livre + pages (+ temps) ; PWO = temps.
- **Export** au format WhatsApp (`*gras*`, `_italique_`) en choisissant **quels points** exporter (préréglages : « Groupe de prière · 5 », « Mentor · 12 »…). Langue du rapport : English / Français.

Format de référence :

```
*Report · October 4, 2026 · Luther Kevin K.*

1. *DDEWG* : 2/3 · ~0h28 (0h12; ~0h16)
2. *PA* : ~2h15
3. *BR* : 0/7 ch
4. *CL* :
   • _L’agressivité spirituelle_ (ZTF) : 166/417 pages
5. *PWO* : 0h00
```

## Projets et sous-projets
- Les barres de progression sont **mensuelles** ; chaque projet a un **objectif chiffré**. Un projet à cheval sur deux mois (ex. 40 jours) est compté **au prorata du mois** en cours.
- Un trait sur chaque barre indique **où on devrait être aujourd'hui**.
- Le suivi d'un sous-projet n'est **pas une simple coche** : chaque jour, **objectif vs réalisé** (ex. 7 ch. visés : 0, 4, 9…), avec code couleur et graphique du mois.

## À confirmer
- Codes des points 6 à 12 (FAST, GTG, GTM, EV, SW, DM, BRO) : proposés, à valider.

## Décisions du 5 oct. 2026 (suite aux retours sur la v2)

### Plusieurs sous-projets par projet
- Un **projet** contient **0 à N sous-projets** (ex. « La lecture de la Bible » : « 7 chapitres par jour » et « Étudier le Nouveau Testament en octobre »).
- Le **% d'un projet = moyenne de ses sous-projets**. Un projet sans sous-projet affiche « à définir ».
- **Une saisie, plusieurs objectifs** : ce qui est noté dans un bloc (chapitres lus, temps, personnes rencontrées…) alimente **tous** les sous-projets du projet, sans double saisie.
- Dans le volet d'un bloc : la liste de tous les sous-projets alimentés, chacun avec sa barre et le trait « où je devrais être aujourd'hui ».
- Écran Sous-projet : sélecteur des sous-projets du projet ; chacun a son propre objectif quotidien dérivé (ex. 260 ch. en octobre = 8,4 ch./jour).
- Mode « Modifier » : ajouter/retirer un projet, un sous-projet, une rubrique.

### Données sur un serveur (Supabase)
- **Source de vérité = base Supabase** (PostgreSQL + authentification + règles d'accès par utilisateur). Un cache local permet de consulter et saisir hors ligne ; les saisies se synchronisent au retour du réseau.
- **Principe de `CLAUDE.md` modifié** : « données locales par défaut » est remplacé par « données sur le serveur, cache hors ligne ».
- Chaque utilisateur ne voit que ses données (règles d'accès au niveau des lignes). Titre de l'app = « {Prénom} Life ».

### Application web installée sur l'iPhone
- PWA ajoutée à l'écran d'accueil. Les notifications push fonctionnent sur iPhone (iOS 16.4 ou plus) **si l'app est installée sur l'écran d'accueil** et que l'autorisation est donnée dans l'app. Elles sont envoyées par un **serveur** (Web Push).
- **Plan B : e-mail de rappel** vers l'adresse de l'utilisateur (saisie dans Réglages), avec titre explicite, programmé **à l'heure, 5 min ou 10 min avant** le bloc. Même contenu que la notification, avec boutons « Lancer » et « Reporter ».
- Un minuteur ne peut pas s'afficher en direct sur l'écran verrouillé avec une app web.

### Envoi des rappels et des rapports (serveur)
- Une tâche planifiée du serveur (toutes les minutes) cherche les rappels à envoyer, puis envoie la notification push et/ou l'e-mail.
- Le **rapport du jour** est généré par le serveur à l'heure choisie (ex. 21:15), même app fermée, puis annoncé par notification.

### Modèle de données (esquisse)
`profiles` · `rubriques` · `projets` (rubrique_id) · `sous_projets` (projet_id, période, mesure, cible) · `blocs` (créneaux, récurrence, projet_id) · `saisies` (bloc, date, quantité, minutes, détail JSON ; **rattachée au projet**, lue par tous ses sous-projets) · `points_rapport` (code, projet, mesures activées, ordre) · `exports` (préréglages) · `rapports` (jour, texte) · `rappels` (bloc, canal, délai, état) · `abonnements_push`.

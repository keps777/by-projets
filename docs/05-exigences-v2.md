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
- **Pas d'e-mail de rappel** : la décision d'origine (plan B par e-mail) est abandonnée. Seule la gestion du compte (mot de passe) peut envoyer un e-mail, sans aucune donnée de l'app.
- Un minuteur ne peut pas s'afficher en direct sur l'écran verrouillé avec une app web.

### Envoi des rappels et des rapports (serveur)
- Une tâche planifiée du serveur (toutes les minutes) cherche les rappels à envoyer, puis envoie la notification push et/ou l'e-mail.
- Le **rapport du jour** est généré par le serveur à l'heure choisie (23:45 par défaut), même app fermée, puis annoncé par notification.

### Modèle de données (esquisse)
`profiles` · `rubriques` · `projets` (rubrique_id) · `sous_projets` (projet_id, période, mesure, cible) · `blocs` (créneaux, récurrence, projet_id) · `saisies` (bloc, date, quantité, minutes, détail JSON ; **rattachée au projet**, lue par tous ses sous-projets) · `points_rapport` (code, projet, mesures activées, ordre) · `exports` (préréglages) · `rapports` (jour, texte) · `rappels` (bloc, canal, délai, état) · `abonnements_push`.

## Décisions du 5 oct. 2026 (suite 2)

### Métriques personnalisables par sous-projet
- Chaque sous-projet a **N métriques** choisies parmi : **Nombre** (unité libre : pages, chapitres, personnes…), **Temps**, **Montant** ($), **Fois**, **Distance**, **Poids**, **Note /10**, **Référence** (texte : passages, livre et auteur).
- Par métrique : nom, unité, **objectif** et **période** (jour, semaine, mois, total), sens (**plus = mieux** ou **moins = mieux**), et **« dans le rapport »** (avec le code du point).
- **Calculs automatiques** : le solde = entrées − sorties ; le reste du budget ; le taux d'épargne ; l'allure ; la progression. Catalogue de calculs prédéfinis en v1.
- **Modèles proposés par rubrique** (lecture biblique, rencontre quotidienne, prière, mémorisation, jeûne ; évangélisation, suivi de disciple, dons ; livrable, étude, entrepreneuriat ; budget du mois, sport, poids, épargne maison, rangement, garde-robe), à ajuster en quelques touches ou à remplacer par « partir de zéro ».
- Exemple finances : entrées, sorties, épargne en **dollars** ; le solde, le reste du budget et les sorties par catégorie se calculent seuls.

### Une seule saisie, tout est alimenté
- On note **une fois** (dans le volet du bloc, le Mode Focus ou la tâche) ; la saisie est rattachée au **projet** et **tous** ses sous-projets la lisent selon leurs métriques. Le rapport lit ensuite les mêmes données.

### Ajouter une tâche depuis Le Fil (bouton +)
- Parcours : **Quoi** (titre, ex. « Rencontre avec Christopher ») → **Projet associé** → **sous-projets alimentés** (interrupteurs) → **ce que la tâche enregistre** (métriques proposées, valeur prévue) → **Quand** (récurrence : une fois, tous les jours, jours choisis, chaque semaine, chaque mois ; heure ; durée ; **vérification de disponibilité** avec créneaux libres juste avant et juste après) → **Rappel** (à l'heure, 5, 10 ou 15 min avant).

### Rappels
- **Notifications push uniquement** (décision du 5 oct. 2026 : aucun e-mail, pour protéger les données spirituelles et financières). La notification s'ouvre sur l'écran Action rapide (Lancer · Reporter) ; sur iPhone, une app web ne peut pas afficher de boutons d'action sur la notification.

### Rapport : toutes les métriques visibles, séparées par des points-virgules
Pour chaque point : fait / attendu ; référence ; temps fait / temps attendu. Exemples :
```
3. *BR* : 0/7 ch; réf. —; 0h00/0h45
4. *CL* :
   • _L’agressivité spirituelle_ (ZTF) : 166/417 p.; +24 p.; 0h35/0h30
```
Codes des points 6 à 12, **explicites et modifiables** dans Réglages : JEÛNE, DON-DIEU, DON-HOMME, EVANG, ÂMES, DISCIPLES, FRÈRES.

### Divers
- L'onglet **« Ebenezer » devient « Archive »** : projets accomplis (avec le verset de 1 Samuel 7:12) et rapports.
- Projet **24** retiré. Le thème 4 s'appelle **« Ma vie personnelle »**.
- Écrans de sous-projet ajoutés : **Fiche** (QQOQCCP, métriques, tâches liées), **Document** (aperçu vivant, PDF, signature), **Temps** (à venir, historique), **Finances**.


## Décisions du 5 oct. 2026 (suite 3)

La spécification détaillée est dans `02-specification.md` (v2). Points ajoutés : connexion par e-mail et mot de passe ; installation guidée et autorisation des notifications ; tâche sans projet ; récurrences complètes (jours choisis, mensuel, fin) ; métriques élargies (Oui/Non, Choix, Pourcentage, Heure) ; reprise du passé à la création d'un sous-projet ; vues Semaine et Mois ; recherche ; aucun jour de repos par défaut ; progression mensuelle par règle de trois ; valider un sous-projet à la fin.


## Décisions du 5 oct. 2026 (suite 4)

- **Rendez-vous** : pas d'import de calendrier ; ce sont des tâches sans projet.
- **Compte** : e-mail et mot de passe seulement ; ni confirmation d'adresse ni récupération de mot de passe pour l'instant ; **un seul utilisateur**, inscription fermée après la création du compte.
- **Document PDF** : un **format type** commun à tous les sous-projets, dont les blocs et colonnes s'adaptent au contenu (spec §6.1). Pas de reproduction à l'identique du modèle LaTeX.
- **Hébergement** : Vercel pour l'app ; architecture complète dans `07-architecture.md`.

# Journal de reprise

> Lire ce fichier en début de session (après `CLAUDE.md`). Ajouter une entrée en fin de session.

## 21 oct. 2026 — En-tête du Suivi : total des temps pilotes

- Quand tous les pilotes d'un sous-projet sont des temps, l'en-tête du Suivi montre le **total de tous** : réalisé et objectif du mois (ex. 1 h 43 / 6 h), attendu, retard et rattrapage, trait ; graphique et tableau des jours (objectif et réalisé du jour) sur le total. La barre et le pourcentage restent la moyenne des pilotes. `progressionPilotes` (noyau, testé) ; spec §5.

## 20 oct. 2026 (soir) — Corriger un jour depuis un sous-projet : correction locale

- Demande : modifier le temps d'un jour dans l'onglet Suivi ne doit pas changer le temps des autres sous-projets, métriques ou projets qui lisent la même saisie.
- Fait : colonne `saisies.sous_projet_id` (migration `20261020000100_saisies_locales`, appliquée à la base réelle) ; la correction du tableau des jours s'écrit en saisie **locale** (différence avec la saisie partagée), lue seulement par ce sous-projet (`valeursDuProjet(projet, sp)`, `contenuDuJour/saisirJour` avec `spId`) et ignorée par le rapport (app + `generer-rapports`). Les corrections faites depuis un bloc ou les Rapports restent partagées. Spec §8, tests de données.

## 20 oct. 2026 — Plusieurs temps dans un sous-projet

- Demande : « ça doit permettre tout » — trois métriques de temps (Prière, Post/Suivi/Évangélisation, Travaux pratiques) étaient refusées (même clé `temps`). Désormais : clés nommées `temps:<nom>` dès qu'il y a plusieurs temps (`cleTempsNomme`, `clesDesBrouillons`), toujours en plus du temps total `temps` que le rapport lit.
- Alimentation : chrono du sous-projet (choix du temps concerné), blocs de tâche (temps réel sur le temps nommé), saisie manuelle du jour (aussi ajoutée au total). Affichage : carte « Temps · ce mois » avec un total par temps et le total de tous (`temps-total.ts`, `TempsDetail.svelte`).
- Limites : la répartition « total par métrique » ne concerne que le temps (deux nombres de même unité partagent déjà la même saisie) ; une session compte pour un seul temps pour ne rien compter deux fois. Spec §4, tests unitaires, données et e2e.

## 12 oct. 2026 (nuit, suite) — Tableau en trois colonnes

- Retour de l'utilisateur : le Tableau devient **trois colonnes côte à côte (Prêt, En cours, Terminé)** de cartes courtes (nom coupé, heure, chrono). Toucher une carte ouvre le détail du bloc (volet existant) ; le chrono ▶ la passe en cours ; ■ puis « Oui, c'est fait » la passe en terminé ; glisser avance/recule. « Prêtes » et « À faire » fusionnent (le retard se voit à l'heure en orange). `tableau.ts`, `Tableau.svelte`, tests et e2e refaits ; spec §12 mise à jour.

## 12 oct. 2026 (nuit) — Vue Tableau du Fil, temps lancé depuis un sous-projet

- **Fil · Tableau** : bascule Calendrier/Tableau (boutons + glissement sur la zone entre Jour/Semaine/Mois et les dates), quatre colonnes (Prêtes, À faire, En cours, Terminées), cartes glissables (droite : lancer puis terminer ; gauche : remettre à faire) et boutons. Pur : `fil/tableau.ts` (colonnes, gestes) testé ; `remettreAFaire` dans `actions/blocs.ts`. Choix de vue gardé sur l'appareil. Colonnes empilées sur téléphone pour ne pas gêner le glissement horizontal ; 4 colonnes dès 720 px.
- **Sous-projet · Lancer un temps** : `ChronoSousProjet` réutilise `chronos` (clé `sp:<id>`), `VoletSession` (métriques du sous-projet) et `enregistrerSession`. Pastille sur l'onglet Projets.
- Spec §12, tests unitaires et e2e (boutons, glissement à la souris, persistance, chrono de sous-projet). Le glissement tactile n'est pas testé en e2e (même mécanisme pointeur que la carte « Ensuite »).

## 12 oct. 2026 (soir) — Retraite de 24 h

- Écran Projets : bouton **« Me proposer une retraite de 24 h »**. Il estime le temps pour rattraper, thème par thème, le retard du mois (temps tel quel ; chapitres 12 min, pages 2 min, fois 30 min, oui/non 15 min, gestes d'argent 10 min, km 6 min — estimations prudentes, arrondies aux 5 min), puis répartit ce temps dans une journée-type de 06 h à 06 h (ouverture, repas, marche, bilan, nuit de 7 h 30). Si le retard dépasse ce qu'une journée contient (11 h de travail), tout est réduit proportionnellement et le reste est annoncé.
- « **Poser au Fil** » crée une tâche « ce jour seulement » par bloc, liée à son sous-projet, avec le temps prévu et la quantité rattrapée (chapitres, pages…), plus l'ouverture et le bilan. Jour proposé : le prochain samedi.
- Noyau `core/retraite.ts` (tests), `screens/projets/{retraite.ts,VoletRetraite.svelte}`, spec §5 et §12, e2e.

## 12 oct. 2026 — Renommer un projet depuis la liste

- En mode **Modifier** de l'écran Projets, un crayon à côté de chaque rubrique, projet et sous-projet ouvre « Renommer » (le crayon du projet existait déjà dans l'écran d'un sous-projet). Spec §12 mise à jour.

## 11 oct. 2026 (nuit) — Finances du mois par défaut

- **Sous-projet par défaut** « Gestion de mes finances du mois » (projet « La gestion de mes finances ») : Entrées, Sorties, Épargne, sans date de fin (objectifs mensuels, donc il suit chaque mois), objectifs à définir dans la Fiche (par ex. épargne en « % d'un montant »). Créé une fois après la première synchronisation (`assurerFinancesDuMois`, identifiants déterministes, jamais recréé si on le supprime).
- **Saisie d'un mouvement** (Entrée / Sortie / Épargne) : nom, montant, **catégorie** pour les trois types, avec les catégories les plus évidentes (Salaire, Loyer, Alimentation, Transport, Dons et dîme, Factures, Santé…) ; les noms déjà saisis sont reproposés (les plus fréquents d'abord) et reprennent leur dernière catégorie et leur dernier montant. Nouvelle répartition « Entrées par catégorie ».
- Spec §6 et US-21 mises à jour ; tests de données et e2e.

## 11 oct. 2026 (soir) — Objectif « x % d'un montant »

- Une métrique **Montant** peut avoir pour objectif « x % d'un montant » (ex. 15 % de mon salaire) : on entre le pourcentage et le montant de référence, l'objectif se calcule (`cibleDePourcentage`) et s'affiche (« 15 % de 5000 $ = 750 $ »). Disponible à la création d'un sous-projet et dans la Fiche. La progression utilise la `cible` calculée, donc rien d'autre ne change.
- Migration `20261011000100_objectif_pourcentage` (colonnes `pourcentage`, `montant_reference`), appliquée à la base réelle et enregistrée. Spec §3 mise à jour, tests unitaires et e2e.

## 11 oct. 2026 — Trait « où je devrais être » recalibré

- **Constat** : pour ce qui se compte à l'unité (fois, oui/non), le trait donnait une fraction (« 1,4 attendu ») arrondie dans le texte alors que la barre restait entière → « tu es dans les temps » avec une barre qui paraissait en retard. Les marqueurs des projets/rubriques utilisaient la part du mois écoulée, sans tenir compte de la fenêtre du sous-projet ; le volet d'un bloc avait le même repli.
- **Fait** : fois / oui-non n'attendent que des unités entières échues (`floor`), trait, attendu, retard et texte concordent (« 1 attendu ») ; trait des projets et rubriques = moyenne des traits de leurs sous-projets ; plus de repli « mois » dans le volet d'un bloc (pas de trait si la métrique n'en a pas). Spec §5 mise à jour, tests ajoutés.
- **Fiche** : les 7 questions (Quoi, Pourquoi…) sont repliées par défaut, bouton Afficher/Masquer (« n/7 remplies »), choix gardé sur l'appareil.
- **Repartir d'un sous-projet déjà fait** (Nouveau sous-projet) : copie fiche, métriques, pilotes et, au choix, tâches, avec dates adaptées (`core/reprise.ts`, `reprendreTaches`). Spec §6, tests unitaires, données et e2e.

## 9 oct. 2026 — Historique importé

- 61 rapports (1ᵉʳ août → 2 oct.) importés : 143 saisies « rattrapage », 211 valeurs, 61 rapports envoyés, 7 livres sur CL. Analyseur testé dans `supabase/scripts/importer-historique/` (le texte brut de l'historique n'est pas gardé dans le dépôt). `retireLe` sur les livres ; « ch » pour les chapitres ; test « plus de chapitres que l'objectif ».

## 9 oct. 2026 — Catalogue de livres mis à jour

- Livres et pages des rapports d'août–octobre ajoutés au catalogue (`data/catalogue-livres.ts`) ; rapport : tous les livres en cours listés, « ✅ » à la fin d'un livre. Spec §9.
- Temps d'un minuteur corrigeable

- Le temps d'un bloc en cours ou en pause se corrige dans le volet (h/min/s, ±5 min) : `fixerEcoule` (core), `corrigerTempsEcoule`. Spec §8.

## 7 oct. 2026 — Alarmes, rapport à 23:45, livres (CL)

- Plusieurs métriques pilotent la barre (migration `20261007000400`, `progressionPilotes`) ; tâches proposées dans la Fiche (`propositions-taches.ts`) ; tâche d'un projet à livres : « Livre lu » (`ChoixLivre`).
- Objectif de temps d'une métrique en h/min (`ChampTemps`, sans secondes) ; objectif « heure » avec le sélecteur d'heure.
- Catalogue de livres : ZTF (`data/catalogue-livres.ts`) + tous les livres déjà ajoutés, proposés à la saisie du titre.
- Livres du point CL (`LivreSuivi`, `itemsDesLivres`, migration `20261007000300` appliquée, `generer-rapports` redéployée) ; temps en h/min/s (`ChampTemps`) dans la saisie du jour et le volet d'un bloc ; détail des séances hors export. Spec §9.


- Rapport du soir à 23:45 par défaut (migration `20261007000200` appliquée : profils restés à 21:15 → 23:45) ; fenêtre « Envoyer ton rapport ? » dans l'app (`InviteRapport`, `invitation.svelte.ts`) ; l'heure se règle dans Réglages › Notifications.


- Migration `20261007000100_alarme_calendrier` (appliquée) : `taches.alarme`, `profils.alarme_defaut`, `profils.jeton_calendrier`.
- Rappels insistants (`rappelsPlanifies`, `cleRappelAlarme`), écran d'alarme plein écran (`alarme/`, `ui/AlarmeEcran.svelte`), fonction `calendrier` (flux ICS, déployée). Spec §10.
- Fil : glisser un bloc (appui long, poignées début/fin, `ajusterOccurrence`) ; Dupliquer la tâche (`?copie=`). Spec §12.
- Fonctions redéployées : `calendrier`, `envoyer-rappels`, `materialiser-occurrences`.

## 6 oct. 2026 — Créer un projet ou un sous-projet depuis « Nouvelle tâche »

- `CreationRapide.svelte` : « + Nouveau projet » et « + Nouveau sous-projet » (nom + menu déroulant à choix multiples des mesures du catalogue `catalogue-metriques.ts`) dans `SectionProjet`; action `creerSousProjetRapide`; spec §7 mise à jour; test unitaire + e2e.
- Nouvelle tâche : valeur prévue d'un temps = menus Heures / Minutes.
- Fil : la carte du bas se glisse vers le haut (blocs non faits suivants, tous jours) ou le bas (précédents) — `blocsNonFaits()`.
- Projets/sous-projet : crayon pour renommer le projet et le sous-projet (`VoletRenommer`).
- Projets : flèche à droite du titre d’une rubrique pour la replier/déplier (gardé dans `localStorage`).
- Fin de session : temps modifiable (h/min/s) — voir spec §9.

## 5 oct. 2026 (nuit) — Supabase branché, Vercel relié

**Fait** (projet `by-projets`, ref `cmcadqeghkvlafwckfvu`, us-east-2)
- Base vide vérifiée ; les 7 migrations appliquées par la Management API (`POST /database/query`) et enregistrées dans `supabase_migrations.schema_migrations` (format CLI : `supabase db push` les voit comme appliquées). Aucune erreur, aucune correction.
- 16 tables, RLS activée et forcée ; 3 tâches `cron.job` actives. `postgres` a `BYPASSRLS` : `initialiser_compte` reste SECURITY DEFINER.
- Secrets des fonctions : VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (`https://by-projets.vercel.app`), CRON_SECRET (valeur jetée après usage).
- 3 fonctions déployées (`verify_jwt` = false) : 401 sans `x-cron-secret`, 200 avec (0 utilisateur, bilans à zéro). `npm:web-push@3.6.7` se charge dans le runtime : `push.ts` inchangé.
- Auth : confirmation d'e-mail désactivée (`mailer_autoconfirm`), mot de passe ≥ 12, inscriptions ouvertes, `site_url` = l'app. Aucun SMTP.
- Essais anonymes avec la clé publishable `sb_publishable_…` : lecture, écriture et RPC refusées (401 / 42501). Aucun compte créé.
- Vercel : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (clé publishable), `VITE_VAPID_PUBLIC_KEY` en production et preview.

**Reste à faire**
1. **Coffre (vault) pour pg_cron** — non fait (refusé par les permissions de la session : le secret aurait transité dans une requête SQL). À faire par l'utilisateur, voir `supabase/README.md` étape 6 (choisir une nouvelle valeur, la mettre à la fois dans le secret `CRON_SECRET` des fonctions et dans `cron_secret` du coffre). D'ici là, les rappels et le rapport du soir ne partent pas (`appeler_fonction` ne lève qu'un avertissement).
2. L'utilisateur crée SON compte dans l'app (le premier compte ferme les inscriptions côté base), autorise les notifications depuis l'icône d'écran d'accueil, puis désactive « Allow new users to sign up ».
3. Vérifier `net._http_response` (2xx) après l'étape 1, le rapport de 21 h 15 heure de Toronto et l'essai sur iPhone.

## 5 oct. 2026 (soir) — application complète en mode local, serveur écrit

**Fait**
- App Svelte 5 : noyau de calcul testé, couche de données (Dexie, file d'envoi, synchronisation), 19 écrans portés des maquettes, service worker (cache hors ligne, push, ouverture directe), tests Vitest et Playwright.
- Supabase : migrations, RLS, `initialiser_compte`, fonctions `envoyer-rappels`, `generer-rapports`, `materialiser-occurrences`, planification pg_cron, tests PGlite. **Jamais exécuté sur un vrai projet.**
- Déploiement Vercel automatique de la branche de travail : https://by-projets.vercel.app (mode local tant que les variables `VITE_*` manquent).

**Revue critique faite** : 9 défauts corrigés avec test (synchro bloquée par une contrainte d'unicité, lignes refusées, tirage manqué, blocs supprimés qui revenaient, suppression vs modification ancienne, inscription fermée par la base, heure d'été…). Migrations ajoutées : `0600_rappels_recus`, `0700_synchronisation_et_inscription` — à appliquer avant de déployer l'app avec Supabase.
Restent ouverts : lignes refusées sans écran de consultation ; signature seulement sur l'appareil ; « réf. » ou « ref. » dans le rapport anglais ; fenêtre de rattrapage du rapport après 22 h.

**Passe de fidélité aux maquettes (même jour)** : les maquettes sont rendues avec le moteur de Claude Design (dc-runtime) et comparées à l'app écran par écran, en nuit et en jour. Causes de l'effet « zoomé » corrigées : zoom automatique d'iOS sur les champs < 16 px (viewport `maximum-scale=1` et champs à 16 px), interligne 1,45 global (désormais `normal`), Bricolage sans taille optique (désormais `opsz.css`). Teintes exactes des rubriques dans `ui/couleurs.ts`. État vide du Fil (bloc fantôme + invitation). Transitions et retour tactile.
Outil de comparaison : voir la méthode dans ce journal ; relancer une passe à chaque nouvelle maquette.

**Gestes et rappels multiples** : glisser la journée du Fil, toucher un espace libre pour ajouter à l'heure touchée, choisir l'heure d'un coup (roue + raccourcis), plusieurs rappels par tâche. **Migration 0900 `rappels_multiples` à appliquer sur Supabase AVANT de redéployer les fonctions** (la fonction materialiser-occurrences lit la nouvelle colonne).

**Serveur à jour (5 oct., soir)** : migrations 0800 (secret pg_cron dans la base) et 0900 (rappels multiples) appliquées sur `by-projets` et enregistrées ; entrée de coffre `project_url` créée ; 3 fonctions redéployées ; secret de fonction `CRON_SECRET` supprimé ; pg_cron reçoit des 200 ; les fonctions répondent 401 sans le secret. Un compte existe déjà (le déclencheur `un_seul_compte` refuse tout autre). Reste : fermer « Allow new users to sign up » dans Supabase (Authentication), autoriser les notifications depuis l'icône d'écran d'accueil.

**Carnet (spec §18)** : table `notes` (migration 1000, appliquée sur by-projets), écran `/carnet` (une page par jour, glisser, sommaire, note libre, corriger/supprimer), bouton « Carnet » au Fil, notes du Mode Focus à la place de « Ce que Dieu me dit », notes de saisie reflétées, recherche. Numéros jamais renumérotés.

**Reste à faire (dans l'ordre)**
1. Brancher le vrai Supabase (voir `supabase/README.md`) : appliquer les migrations, déployer les 3 fonctions, secrets VAPID, variables Vercel `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_VAPID_PUBLIC_KEY`, fermer les inscriptions après la création du compte.
   - Blocage : le jeton `SUPABACE_ACCES_TOKEN` (sic) ne voit que le projet `le-chemin` (autre application, ne pas y toucher). Il faut un jeton qui voit le projet `by-projets`.
2. Vérifier sur un vrai projet : `postgres` a `BYPASSRLS` (sinon passer `initialiser_compte` en SECURITY INVOKER) ; `npm:web-push` dans les Edge Functions ; tâches `cron.job` ; rapport de 21 h 15 heure de Toronto.
3. Essai sur iPhone : installation, permission, notification, ouverture de `/action-rapide?occ=…`.

**Décisions prises pendant la construction**
- Synchronisation par ligne (pas par champ) ; identifiants déterministes pour occurrences, rappels, saisies, rapports (`rapport:<user>:<jour>` côté app et serveur).
- Une saisie confirme le bloc ; un bloc jamais lancé prend la durée de l'occurrence (pas celle de la tâche).
- Le PDF passe par la boîte d'impression du téléphone.

## 5 oct. 2026 — fin de la phase de spécification

**Fait**
- Vision, spécification v2 (17 sections dans `docs/spec/`), architecture (`07`), méthode (`08`).
- 54 planches de maquettes (nuit, jour, version 1 archivée) copiées dans `design/`.
- Décisions : Supabase + Vercel ; notifications push uniquement ; aucun e-mail ; un seul utilisateur ; connexion e-mail et mot de passe ; PDF au format type adaptatif ; pas de calendrier externe.

**Prochaine étape : T0** (voir `docs/03-feuille-de-route.md`)
1. L'utilisateur crée le projet Supabase (développement) et connecte le dépôt à Vercel ; il donne l'adresse Supabase et la clé publique (jamais la clé secrète).
2. Créer `app/` (Vite + Svelte + TypeScript + PWA), `supabase/` (migrations, règles d'accès), l'intégration continue.
3. Essai de notification push sur l'iPhone de l'utilisateur.
4. Rédiger `docs/spec/` → rien à changer sauf si l'essai révèle un écart.

**Pièges connus**
- iPhone : pas de boutons d'action sur les notifications d'app web ; la notification ouvre l'écran Action rapide.
- Les notifications exigent l'app ouverte depuis l'icône de l'écran d'accueil (iOS 16.4 ou plus).

## 20 nov. 2026 — Fil en deux parties, ajout de tâche simplifié

**Fait** (spec §7 et §12 mises à jour d'abord)
- **Le Fil · journée en deux colonnes** : « Prévu » (planifié, à l'heure prévue, glisser/poignées/▶ inchangés) et « Fait » (ce qui a réellement été fait, du début réel du minuteur à sa fin ; un minuteur qui tourne grandit en direct). En-têtes `Prévu · n` / `Fait · n · durée`. Toucher un espace libre de **Fait** ouvre « Ce que j'ai fait » (quoi, projet en cours, début, durée) : bloc déjà fait, sans rappel, reconnu à sa saisie de source `rattrapage` (conservée après correction), seulement dans Fait ; un jour passé peut être rempli. Fichiers : `Journee`, `BlocFait`, `VoletFait`, `data/actions/fait.ts`, `BlocVue.reelDebutMin / reelFinMin / apresCoup`.
- **Nouvelle tâche** : seuls les **projets en cours** sont proposés (actif + au moins un sous-projet en cours ou à valider, ou aucun sous-projet), « Nouveau projet » en tête ; **Quand** en une carte de menus (jour, heure, durée, répéter ; jours de la semaine et « Jusqu'à quand » seulement si utile) ; **Rappel** exhaustif : pastilles retirables + menu avec tous les délais (à l'heure → 7 jours avant), le plus proche reste le rappel de l'alarme.
- Tests : `fait.test.ts`, `formulaire-projets.test.ts`, ajouts à `tache.test.ts`, `e2e/fil-deux-parties.spec.ts`, e2e d'ajout de tâche réécrits pour les menus.

**À savoir**
- La retraite de 24 h existe déjà (écran Projets, « Me proposer une retraite de 24 h », §5) : rien à ajouter.
- Un bloc marqué fait garde sa coche dans Prévu et se pose aussi dans Fait ; les vues Tableau, Semaine et Mois sont inchangées.
- Question ouverte : poser l'horaire type des points de prière (00 h–24 h) comme tâches récurrentes dans Prévu ? Pas fait, en attente de confirmation.

**Horaire type (même jour)** : Réglages › Horaire type › « Poser mon horaire type » crée 20 tâches récurrentes (points de prière : prière, Bible, méditation, repos, préparation, travail, repas, évangélisation, projets, temps libre, lecture ; jours spéciaux vendredi, mercredi, lundi, dimanche), sans projet ni rappel, dans Prévu ; idempotent ; « Retirer l'horaire type » les supprime. Données : `data/horaire-type.ts`, actions : `data/actions/horaire.ts`. Posés aussi, à une heure choisie : jeûne du lundi, dons et épargne du 1er vendredi, lessive (2ᵉ et dernier lundi). Pose **automatique** à la première ouverture de chaque appareil (drapeau `luther-life:horaire-type`), jamais après un retrait ; les e2e partent avec ce drapeau à « retire ». Les titres de blocs passent sur deux lignes dans les colonnes étroites.

## 21 nov. 2026 — PDF de la journée

**Fait** (spec §9 mise à jour d'abord) : bouton **Exporter la journée en PDF** au Fil (icône à droite de Calendrier · Tableau). Il ouvre la boîte d'impression (même mécanique que le PDF du rapport, `rapports/pdf.ts`) sur une page A4 : **recap en haut** de l'avancement des projets en cours (barre et pourcentage par projet, sous-projets en cours dessous, moyenne générale), puis le **tableau « Créneau · Activité effectuée · Projets en cours impliqués »** à l'heure réelle des blocs faits (« 1h12–2h13 · 1h01 de Prière seule · Projet 3H… + Croisade… »), avec les **créneaux vides** (« 2h14–3h15 · vide · -- ») et, à la fin, **« Temps total de travail investi sur 24 h »**. Code : `screens/fil/pdf-journee.ts` (construction pure testée + page HTML), tests `pdf-journee*.test.ts`, e2e dans `fil-deux-parties.spec.ts`.
- Les e2e mettent de côté l'invitation du rapport (après 23 h 45 elle couvrait l'écran) via le stockage de départ de `playwright.config.ts`.
- Choix : un vide commence 1 min après le bloc précédent et finit 1 min avant le suivant (comme dans l'exemple) ; trous de moins de 5 min ignorés ; jour à venir non exportable.

## 21 nov. 2026 — Carnet riche (paragraphes, mise en forme, images, vidéos)

**Fait** (spec §18 mise à jour d'abord) : bouton **Note riche** à gauche du champ d'écriture du Carnet → éditeur plein écran (`EditeurRiche.svelte`) : style (paragraphe, titre, sous-titre, citation), gras, italique, souligné, listes, séparateur, lien, **image**, **vidéo**, annuler/rétablir ; Entrée = nouveau paragraphe ; le collage est nettoyé ; brouillon gardé à la fermeture d'une nouvelle note. Les notes riches s'affichent mises en forme dans le livre (toucher ou « Modifier » les rouvre) ; une note simple peut être « mise en forme ». Code : `screens/carnet/{riche.ts (nettoyage en liste blanche, texte brut, médias cités), hydrater.ts, riche.css, EditeurRiche.svelte}`, `data/media.svelte.ts` (images réduites à 1600 px, vidéos ≤ 50 Mo, IndexedDB `media`, envoi vers le bucket `carnet`), actions `ajouterNoteRiche` / `modifierNoteRiche`. `notes.contenu` = HTML nettoyé, `notes.texte` = texte brut équivalent (recherche, export).
- Tests : `riche.test.ts` (nettoyage, 14), `data/carnet-riche.test.ts`, `e2e/carnet-riche.spec.ts` (écrire, image, vidéo, rechargement, corriger, supprimer, brouillon, 320 px).
- **À faire côté serveur (une seule fois)** : appliquer `supabase/migrations/20261121000100_carnet_riche.sql` (colonne `notes.contenu` + bucket privé `carnet` + règles d'accès) dans l'éditeur SQL de Supabase. Le jeton d'accès de l'environnement (`SUPABASE_ACCES_TOKEN_BY_PROJETS`) est refusé (« Invalid access token ») : je n'ai pas pu l'appliquer moi-même. **Sans cette migration**, tout fonctionne sur l'appareil, mais la mise en forme et les médias ne se synchronisent pas : les notes partent en texte brut (la synchronisation détecte l'absence de la colonne, réessaie sans `contenu`, et renvoie les notes riches à chaque ouverture tant que la colonne manque) ; les envois de médias réessaient toutes les 10 min.

**PDF de la journée : vrai fichier + notes du jour (21 nov., suite)** : le bouton fabrique un vrai PDF avec jsPDF (chargé seulement à l'export ; `screens/fil/pdf-journee-fichier.ts`) et ouvre « Ma journée en PDF » : *Partager ou enregistrer* (feuille de partage, quand le fichier peut se partager), *Télécharger le PDF* (`Ma-journee-AAAA-MM-JJ.pdf`), *Ouvrir pour le lire*. La boîte d'impression ne sert plus que de secours. Le PDF contient maintenant la section **Notes du jour** (n°, provenance, titres, paragraphes, gras/italique/souligné, listes, citations, séparateurs, liens, images ; vidéo signalée). `riche.ts` expose `blocsDeNote`. Nouvelle dépendance : `jspdf`. Tests : `pdf-journee-fichier.test.ts` (PDF valide, plusieurs pages, texte ramené au latin), e2e du téléchargement avec contrôle du texte par `pdftotext`.

**Renommer une tâche qui se répète (21 nov., suite)** : en touchant « Enregistrer » sur une tâche récurrente, « Cette occurrence » ne change que l'heure, la durée et le rappel : un nouveau nom n'était donc jamais appliqué (symptôme « je n'arrive pas à modifier le nom »). Maintenant, si le formulaire change ce qui est commun à toute la série (nom, projet, sous-projets, mesures, répétition, alarme, rappels plus tôt), « Cette occurrence » n'est plus proposée et la fenêtre l'explique ; « Celle-ci et les suivantes » et « Toute la série » restent. Code : `changeLaSerie` (`edition.ts`, testé), `EcranTache.svelte` ; e2e `renommer une tâche qui se répète`.

## 22 nov. 2026 — PDF de la journée : nouvelle mise en page

**Fait** (spec §9 mise à jour d'abord) : le PDF **commence par le tableau de la journée**, avec à sa **droite les métriques du jour** de l'onglet Rapports (RDQD, PA… : code, mesure du jour, état Atteint / % / À reprendre, jauge, « n / m points atteints ») ; **dessous, le suivi des projets en cartes lisibles d'un coup d'œil** : bandeau de synthèse (anneau du pourcentage moyen, nombre de projets dans le rythme / en léger retard / en retard / atteints), puis par rubrique des cartes en deux colonnes — nom, **gros pourcentage**, jauge **verte / orange / rouge selon l'état** avec un **repère** « où je devrais être » (`traitProjet`), sous-projets en cours dessous. Les notes du jour restent en dernier. Code : `pdf-journee.ts` (`etatAvancement`, `etatMetrique`, `compterEtats`, `MetriqueJour`), `pdf-journee-fichier.ts` (tableau étroit à côté de l'encart puis pleine largeur, encart, anneau, cartes) ; la page HTML de secours suit le même ordre. Tests : états (écarts −2 / −15), PDF avec 45 métriques et 30 projets, e2e (ordre tableau → métriques → suivi → notes dans le texte du PDF).

**Heures réelles corrigeables (23 nov.)** : dans le volet d'un bloc fait, « Heures réelles » (début, fin) ; le temps passé suit. `corrigerHeuresReelles` (blocs.ts), testé + e2e.

**Livres : lecture et rédaction en pages sombres (24 nov.)** : liseuse fond noir par défaut (bouton ☀/☾ pour le papier), numéro de page en haut à gauche, titre de chapitre en capitales centré, texte justifié à retrait ; **glisser** (ou flèches) pour tourner les pages, d'un chapitre à l'autre ; en rédaction d'un chapitre, même page sombre et **outils masqués**, affichés par le **bouton flottant « Aa »** à droite.

**Correctifs livres (24 nov.)** : la table des matières n'était plus défilable (liste écrasée par la colonne flex : chapitres 8+ invisibles) ; la mise en forme (`contenu`) gardée sur l'appareil n'est plus écrasée par une ligne du serveur qui n'a pas la colonne ; le ramassage automatique des médias est supprimé (il pouvait effacer des images quand un `contenu` manquait) ; « Retrouver mes images » liste les images gardées sur l'appareil que plus aucune note ne cite.

**Livres : signature et lecture (24 nov.)** : à l'enregistrement d'un chapitre, fenêtre « Signature » : circonstance (facultative), lieu (facultatif), date (au moins l'année, bloquant) avec propositions tirées des saisies passées ; affichée en bas du chapitre à la lecture (« Durant la nuit de prière de CMCI PAT, Montréal, 21/08/26 »), rangée dans `source_label` (`livre:<id>|{c,l,d}`). Lecteur par transformation (fin de la coupure à droite) ; titres et gras toujours en gras à la lecture.

**Livres classés par thème (24 nov.)** : champ « Thème » (création et réglages), pastilles de filtre, étagères par thème (`themesDe`, `parTheme` dans livres.ts). Spec §18 mise à jour, e2e bibliotheque étendu.

**Pages et arborescence des livres (24 nov.)** : `arbre`, `parentDe`, `voisin`, `supprimerChapitre` (livres.ts) ; TOC repliable avec « + » par chapitre ; lecteur numéroté 1 / 1.1. Test unitaire livres-arbre + e2e étendu. Spec §18 mise à jour.

**Bible intégrée (25 nov.)** : écran /bible (Darby / Martin 1744 / KJV, textes dans app/public/bible, cache SW), navigateur AT/NT → livres → chapitres, soulignement 5 couleurs, copier, note vers le cahier « Notes pendant ma lecture biblique » (titre vide, note puis verset, lieu/date via VoletSignature). ▶ d'un bloc de lecture ouvre la Bible. Titre vide conservé par `nettoyer` (premier h1). PDF du jour : les pages de livres ne sont plus listées comme notes. Spec §18/§19, e2e bible.

**Mise à jour automatique de l'app (25 nov.)** : au retour au premier plan, une nouvelle version déjà téléchargée est activée et la page se recharge (avant : au prochain lancement complet).

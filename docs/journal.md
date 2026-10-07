# Journal de reprise

> Lire ce fichier en début de session (après `CLAUDE.md`). Ajouter une entrée en fin de session.

## 7 oct. 2026 — Alarmes

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

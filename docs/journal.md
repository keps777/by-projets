# Journal de reprise

> Lire ce fichier en début de session (après `CLAUDE.md`). Ajouter une entrée en fin de session.

## 5 oct. 2026 (nuit) — Supabase branché en partie

**Fait** (projet `by-projets`, ref `cmcadqeghkvlafwckfvu`, us-east-2)
- Base vide vérifiée, puis les 7 migrations appliquées par la Management API (`POST /database/query`) et enregistrées dans `supabase_migrations.schema_migrations` (format CLI : `supabase db push` les voit comme appliquées). Aucune erreur.
- 16 tables, RLS activée et forcée partout ; 3 tâches `cron.job` actives.
- `postgres` a `BYPASSRLS` : `initialiser_compte` reste SECURITY DEFINER, aucune migration de plus.

**Pas encore fait** (bloqué par les permissions de la session, pas par une erreur technique)
1. Secrets des fonctions (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, CRON_SECRET) : les clés générées ont été jetées, à régénérer.
2. Déploiement des 3 fonctions (`--no-verify-jwt`) ; vérifier `npm:web-push` dans le runtime.
3. Coffre (vault) : `project_url` et `cron_secret`. D'ici là, pg_cron tourne chaque minute et `appeler_fonction` ne lève qu'un avertissement (secrets absents).
4. Réglages Auth : confirmation d'e-mail désactivée, mot de passe ≥ 12, inscriptions ouvertes le temps de créer LE compte.
5. Variables Vercel `VITE_*` et redéploiement : **seulement après l'étape 4** (sinon l'app passe en mode serveur avec confirmation par e-mail).
6. Ensuite : l'utilisateur crée son compte, autorise les notifications depuis l'icône d'écran d'accueil, puis on ferme les inscriptions.

## 5 oct. 2026 (soir) — application complète en mode local, serveur écrit

**Fait**
- App Svelte 5 : noyau de calcul testé, couche de données (Dexie, file d'envoi, synchronisation), 19 écrans portés des maquettes, service worker (cache hors ligne, push, ouverture directe), tests Vitest et Playwright.
- Supabase : migrations, RLS, `initialiser_compte`, fonctions `envoyer-rappels`, `generer-rapports`, `materialiser-occurrences`, planification pg_cron, tests PGlite. **Jamais exécuté sur un vrai projet.**
- Déploiement Vercel automatique de la branche de travail : https://by-projets.vercel.app (mode local tant que les variables `VITE_*` manquent).

**Revue critique faite** : 9 défauts corrigés avec test (synchro bloquée par une contrainte d'unicité, lignes refusées, tirage manqué, blocs supprimés qui revenaient, suppression vs modification ancienne, inscription fermée par la base, heure d'été…). Migrations ajoutées : `0600_rappels_recus`, `0700_synchronisation_et_inscription` — à appliquer avant de déployer l'app avec Supabase.
Restent ouverts : lignes refusées sans écran de consultation ; signature seulement sur l'appareil ; « réf. » ou « ref. » dans le rapport anglais ; fenêtre de rattrapage du rapport après 22 h.

**Passe de fidélité aux maquettes (même jour)** : les maquettes sont rendues avec le moteur de Claude Design (dc-runtime) et comparées à l'app écran par écran, en nuit et en jour. Causes de l'effet « zoomé » corrigées : zoom automatique d'iOS sur les champs < 16 px (viewport `maximum-scale=1` et champs à 16 px), interligne 1,45 global (désormais `normal`), Bricolage sans taille optique (désormais `opsz.css`). Teintes exactes des rubriques dans `ui/couleurs.ts`. État vide du Fil (bloc fantôme + invitation). Transitions et retour tactile.
Outil de comparaison : voir la méthode dans ce journal ; relancer une passe à chaque nouvelle maquette.

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

# Journal de reprise

> Lire ce fichier en début de session (après `CLAUDE.md`). Ajouter une entrée en fin de session.

## 5 oct. 2026 (soir) — application complète en mode local, serveur écrit

**Fait**
- App Svelte 5 : noyau de calcul testé, couche de données (Dexie, file d'envoi, synchronisation), 19 écrans portés des maquettes, service worker (cache hors ligne, push, ouverture directe), tests Vitest et Playwright.
- Supabase : migrations, RLS, `initialiser_compte`, fonctions `envoyer-rappels`, `generer-rapports`, `materialiser-occurrences`, planification pg_cron, tests PGlite. **Jamais exécuté sur un vrai projet.**
- Déploiement Vercel automatique de la branche de travail : https://by-projets.vercel.app (mode local tant que les variables `VITE_*` manquent).

**Revue critique faite** : 9 défauts corrigés avec test (synchro bloquée par une contrainte d'unicité, lignes refusées, tirage manqué, blocs supprimés qui revenaient, suppression vs modification ancienne, inscription fermée par la base, heure d'été…). Migrations ajoutées : `0600_rappels_recus`, `0700_synchronisation_et_inscription` — à appliquer avant de déployer l'app avec Supabase.
Restent ouverts : lignes refusées sans écran de consultation ; signature seulement sur l'appareil ; « réf. » ou « ref. » dans le rapport anglais ; fenêtre de rattrapage du rapport après 22 h.

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

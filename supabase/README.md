# Supabase : mise en service

Tout le côté serveur de Luther Life : schéma PostgreSQL, règles d'accès, données de départ, fonctions serveur et
planification. Les tests tournent sans Supabase (PostgreSQL en mémoire avec PGlite) : `npm run check` à la racine.

## Contenu

| Chemin | Rôle |
|---|---|
| `migrations/20261005000100_schema.sql` | Les 16 tables du contrat `functions/_shared/core/lignes.ts`, contraintes, index, déclencheur `horodater` (`updated_at` imposé par le serveur, `user_id` immuable). |
| `migrations/20261005000200_acces.sql` | Règles d'accès par ligne (RLS activée et forcée) : `user_id = auth.uid()`, parent du même utilisateur, rien pour `anon`. |
| `migrations/20261005000300_initialiser_compte.sql` | `initialiser_compte(p_prenom)` : profil, 5 rubriques, 24 projets, 12 points de rapport, 3 préréglages. Idempotente. |
| `migrations/20261005000400_fonctions_serveur.sql` | `reserver_rappels`, `inserer_occurrences`, `inserer_rappels`, `annuler_rappels_taches` (clé de service uniquement). |
| `migrations/20261005000500_planification.sql` | pg_cron + pg_net : `envoyer-rappels` et `generer-rapports` chaque minute, `materialiser-occurrences` à 03:00 UTC. |
| `functions/envoyer-rappels/` | Envoie les notifications Web Push des rappels dus. |
| `functions/generer-rapports/` | Rapport du soir à l'heure locale de chaque profil, rappels « rapport prêt » et récapitulatifs. |
| `functions/materialiser-occurrences/` | Occurrences sur 90 jours glissants et leurs rappels ; annule ceux des tâches retirées. |
| `functions/_shared/` | Noyau de calcul (`core/`), client de service, envoi Web Push, outils HTTP. |
| `tests/` | Tests de la base (PGlite). Les tests de la logique des fonctions sont à côté de chaque fonction. |
| `scripts/generer-vapid.mjs` | Génère la paire de clés VAPID. |

Chaque fonction a un `index.ts` mince (Deno) ; la logique est dans `logique.ts` (sans API Deno, testée avec vitest),
l'accès à la base dans `depot.ts`.

## Mise en service pas à pas

Prérequis : la CLI Supabase (`npm i -g supabase` ou `brew install supabase/tap/supabase`), un projet créé sur
supabase.com. Ne jamais écrire une clé secrète dans le dépôt ni dans un chat.

1. **Relier le dépôt au projet**
   ```sh
   supabase login
   supabase link --project-ref <ref-du-projet>
   ```
2. **Appliquer les migrations** (d'abord sur le projet de développement, puis en production)
   ```sh
   supabase db push
   ```
3. **Créer les clés VAPID**
   ```sh
   node supabase/scripts/generer-vapid.mjs
   ```
   La clé publique va aussi dans l'app (variable publique côté Vercel).
4. **Enregistrer les secrets des fonctions** (`CRON_SECRET` : une longue valeur aléatoire, par exemple
   `openssl rand -base64 32`) :
   ```sh
   supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=https://<adresse-de-l-app> CRON_SECRET=...
   ```
   `SUPABASE_URL` et `SUPABASE_SERVICE_ROLE_KEY` sont fournis automatiquement aux fonctions.
   `VAPID_SUBJECT` est une adresse `https://…` (ou `mailto:…`, à éviter ici : pas d'adresse e-mail dans le dépôt).
5. **Déployer les fonctions**
   ```sh
   supabase functions deploy envoyer-rappels --no-verify-jwt
   supabase functions deploy generer-rapports --no-verify-jwt
   supabase functions deploy materialiser-occurrences --no-verify-jwt
   ```
   (`config.toml` les déclare déjà avec `verify_jwt = false` : elles vérifient elles-mêmes l'en-tête `x-cron-secret`.)
6. **Donner à pg_cron l'adresse du projet**, une seule fois, dans l'éditeur SQL du tableau de bord :
   ```sql
   select vault.create_secret('https://<ref-du-projet>.supabase.co', 'project_url');
   ```
   Le secret partagé `cron_secret` est créé **dans la base** par la migration `0800_planification_secret_interne`
   (sa valeur ne sort jamais de Postgres) ; les fonctions le lisent par `public.secret_cron()`. Le secret
   `CRON_SECRET` des fonctions n'est plus nécessaire (il ne sert que de repli si le coffre ne répond pas).
   Vérifier ensuite : `select * from cron.job;` puis, après une minute, `select * from net._http_response order by id desc limit 5;`.
   **État du projet `by-projets`** : étapes 1 à 5 et 7 faites ; celle-ci reste à faire. La valeur de `CRON_SECRET`
   posée à l'étape 4 n'a pas été conservée : en choisir une nouvelle, la remplacer dans Edge Functions → Secrets
   (`CRON_SECRET`), puis la mettre dans le coffre ci-dessus. Un 401 dans `net._http_response` = valeurs différentes.
7. **Réglages du tableau de bord** (Authentication) :
   - Sign In / Providers → Email : **Confirm email désactivé** (aucun e-mail envoyé).
   - **Longueur minimale du mot de passe : 12**.
   - Créer LE compte depuis l'app, puis **désactiver les inscriptions** (« Allow new users to sign up » = off).
   - Aucun modèle d'e-mail ni SMTP à configurer : pas de récupération de mot de passe en v1 (spec §11) ; en cas d'oubli,
     changer le mot de passe depuis Authentication → Users.
8. **Essai** : se connecter dans l'app (elle appelle `initialiser_compte`), autoriser les notifications, créer une tâche
   avec rappel, puis lancer à la main :
   ```sh
   curl -X POST https://<ref>.supabase.co/functions/v1/materialiser-occurrences -H "x-cron-secret: $CRON_SECRET" -d '{"jours": 7}'
   ```

## Contrats utiles à l'app

- **Notification** : la charge Web Push est un JSON `{ "titre", "corps", "url", "tag" }` ; `url` vaut
  `/action-rapide?occ=<id>`, `/rapports`, `/rapports?onglet=semaine|mois` ou `/projets` ; `tag` = clé unique du rappel.
- **Rapport** : `rapports.contenu` = `{ version: 1, entete: { type: 'jour', debut }, points: [{ point_id, code, libelle, mesures }] }`,
  directement utilisable par `formaterRapport` du noyau.
- **Abonnement push** : unique par (`user_id`, `endpoint`) ; pour se réabonner sur le même appareil, réutiliser la ligne
  (par exemple `id = uuidDeterministe(endpoint)`) et remettre `supprime_le` à nul.
- **Rappels serveur** : `id = idRappel(cle)` pour un bloc (`cle = cleRappelBloc(occurrence, délai)`) ; pour le rapport et les
  récapitulatifs, `id = uuidDeterministe('rappel:<user_id>:<cle>')` avec `cle = rapport:<jour>`, `recap_semaine:<lundi>`,
  `recap_mois:<AAAA-MM>` (mois résumé).
- **Réservation des rappels** : `reserver_rappels` passe aussitôt le rappel à `echec` (« envoi en cours »), puis
  `envoyer-rappels` le met à `envoye`, `echec` ou de nouveau `en_attente` (erreur passagère, 3 essais au plus). Un rappel
  ne part donc jamais deux fois.

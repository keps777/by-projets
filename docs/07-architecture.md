# 07 — Architecture technique

> Version du 5 oct. 2026. Elle découle de `02-specification.md`. Les choix marqués **(à valider en T0)** se confirment par un essai avant d'être figés.

## 1. Vue d'ensemble

```
iPhone (PWA installée)                 Vercel                       Supabase (cloud)
┌──────────────────────────┐      ┌───────────────┐      ┌───────────────────────────────────┐
│ Svelte + TypeScript      │ HTTPS│ Fichiers      │      │ PostgreSQL + règles d'accès (RLS) │
│ Cache local (IndexedDB)  │◄─────┤ statiques     │      │ Authentification (e-mail + mdp)   │
│ File d'attente d'écriture│      │ de l'app      │      │ Fonctions serveur (Edge Functions)│
│ Service worker (push)    │      └───────────────┘      │ Tâche planifiée (pg_cron, 1 min)  │
└───────────┬──────────────┘                              └───────────────▲───────────────────┘
            │ lecture / écriture (API Supabase, jeton de l'utilisateur)   │
            └─────────────────────────────────────────────────────────────┘
                          Web Push (VAPID) : serveur ──► service d'Apple ──► iPhone
```

Il n'y a **aucun serveur à gérer** : Vercel sert les fichiers de l'app, Supabase fait tout le reste.

## 2. Choix techniques

| Couche | Choix | Pourquoi |
|---|---|---|
| **Front-end** | **Svelte 5 + TypeScript + Vite**, application d'une seule page | Léger et rapide sur iPhone ; gabarits proches de ceux des maquettes ; peu de code à écrire (moins d'erreurs, moins de coût). |
| **Styles** | CSS natif avec **variables de design** (nuit / jour), sans bibliothèque d'interface | Les jetons des maquettes (couleurs, polices, espacements) sont écrits une fois. |
| **Polices** | Bricolage Grotesque, Geist, Geist Mono, Instrument Serif, **hébergées par l'app** | Marche hors ligne, plus rapide, aucun appel à Google. |
| **Installation et hors ligne** | PWA : manifeste, icônes, **service worker** (Workbox via `vite-plugin-pwa`) | Installable sur l'écran d'accueil ; l'app se charge sans réseau. |
| **Cache local** | **IndexedDB** via Dexie : 90 jours de blocs, projets, saisies récentes, rapports | Le Fil s'ouvre en moins d'une seconde, même hors ligne. |
| **Synchronisation** | File d'attente d'écritures locale ; identifiants créés sur l'appareil ; dernier enregistrement gagnant, champ par champ | Aucune perte, aucun doublon (spec §13). |
| **Back-end** | **Supabase** : API générée à partir de la base, pas de serveur maison | Solide, hébergé, gratuit pour démarrer. |
| **Base de données** | **PostgreSQL** (Supabase). Migrations SQL versionnées dans `supabase/migrations/`. Types TypeScript générés. | Une source de vérité ; le schéma est lisible et testable. |
| **Sécurité** | **Règles d'accès par ligne** (`user_id = auth.uid()`) sur chaque table | Même si l'app se trompe, la base refuse l'accès aux données d'autrui. |
| **Authentification** | Supabase Auth, **e-mail et mot de passe**, inscription fermée après création du compte, aucun e-mail envoyé | Spec §11. |
| **Fonctions serveur** | **Edge Functions** (TypeScript) | `envoyer-rappels`, `generer-rapports`, `materialiser-occurrences`. |
| **Planification** | **pg_cron** appelle les fonctions chaque minute (rappels, rapport) et chaque nuit (occurrences) | Rappels et rapport même app fermée. |
| **Notifications** | **Web Push** (VAPID) : l'app s'abonne ; la fonction `envoyer-rappels` envoie | Seul canal de rappel (spec §10). |
| **PDF du sous-projet** | Génération **sur l'appareil**, chargée à la demande (pdfmake ou pdf-lib) **(à valider en T7)** | Aucune donnée ne quitte le téléphone ; l'aperçu et le PDF utilisent le même gabarit. |
| **Hébergement** | **Vercel** pour l'app (déploiement automatique depuis GitHub, aperçu pour chaque branche) ; **Supabase** pour les données et les fonctions | Décidé le 5 oct. 2026. |
| **Tests** | **Vitest** (fonctions pures), **Playwright** (parcours clés sur navigateur mobile), tests SQL des règles d'accès | Les règles de la spec deviennent des tests. |
| **Intégration continue** | **GitHub Actions** : types, lint, tests, vérification des migrations | Rien n'arrive en production sans passer les tests. |

## 3. Organisation du dépôt

```
CLAUDE.md                     # carte du projet et règles de travail (court)
docs/                         # vision, spec (docs/spec/ par section), architecture, journal
design/maquettes-v2/          # sources des maquettes (référence, jamais modifiées)
app/                          # le front-end
  src/ui/                     # jetons de design, composants partagés (Bloc, Anneau, Barre, Volet…)
  src/screens/                # un dossier par écran
  src/data/                   # client Supabase, cache Dexie, file d'attente, synchronisation
  src/sw/                     # service worker, abonnement push
supabase/
  migrations/                 # schéma SQL, règles d'accès
  functions/_shared/core/     # LE NOYAU DE CALCUL (fonctions pures, partagées app + serveur)
  functions/<nom>/            # fonctions serveur
  seed/                       # projets par défaut, modèles
  tests/                      # tests des règles d'accès
.github/workflows/            # intégration continue
```

**Le noyau de calcul** (`supabase/functions/_shared/core/`) est le cœur : métriques et unités, progression mensuelle, récurrences, disponibilité, format du rapport, passages de la Bible. Ce sont des **fonctions pures** (pas de réseau, pas d'écran), donc faciles à tester. L'app et les fonctions serveur importent **le même code**, ce qui garantit que l'écran et le rapport du soir donnent les mêmes chiffres.

## 4. Trois parcours de bout en bout

**Saisie d'un bloc**
1. L'utilisateur lance le bloc : l'app écrit l'état dans le cache local (`demarree_a`) et dans la file d'attente.
2. À la fin, « As-tu terminé ? » : une `saisie` avec ses `saisie_valeurs` est créée localement. Les barres se recalculent aussitôt avec le noyau.
3. La file d'attente envoie la saisie à Supabase dès que le réseau le permet. Le serveur a le même résultat grâce au même noyau.

**Rappel d'un bloc**
1. Créer ou modifier une tâche écrit ses occurrences et un `rappel` par occurrence (`envoyer_a` = début − délai).
2. Chaque minute, `envoyer-rappels` prend les rappels dus (`etat = en_attente`, `envoyer_a <= maintenant`), les verrouille, envoie le Web Push, puis marque `envoye`. La clé unique empêche tout doublon.
3. Toucher la notification ouvre `/action-rapide?occ=…` (écran Action rapide).

**Rapport du soir**
1. Chaque minute, `generer-rapports` repère les utilisateurs dont l'heure locale est l'heure du rapport et qui n'ont pas encore de rapport pour le jour.
2. Il compose le contenu avec le noyau, l'enregistre dans `rapports` et crée le rappel « Ton rapport est prêt ».
3. L'app compose le texte final (préréglage, langue) à l'affichage.

## 5. Environnements, déploiement et secrets

| Élément | Règle |
|---|---|
| **Environnements** | `production` (Supabase + Vercel) et `développement` (second projet Supabase + aperçus Vercel). |
| **Déploiement du front** | Chaque branche poussée sur GitHub a une adresse d'aperçu Vercel ; la branche `main` déploie en production. |
| **Déploiement de la base** | Les migrations s'appliquent avec la CLI Supabase, d'abord en développement, puis en production. |
| **Variables publiques** (Vercel) | Adresse du projet Supabase, clé publique `anon`, clé publique VAPID. |
| **Secrets** (Supabase uniquement) | Clé privée VAPID et clé de service. **Jamais dans le dépôt, jamais dans le chat.** |
| **Fichiers à prévoir** | `vercel.json` (toutes les adresses renvoient vers `index.html`, `sw.js` jamais mis en cache), manifeste, icônes 192/512 et 180 (iPhone). |

## 6. Ce qu'il faut vérifier tôt (tranche T0)

| Risque | Essai |
|---|---|
| Notification push sur **ton** iPhone | Page minimale installée sur l'écran d'accueil → autorisation → notification de test envoyée par une fonction. Mesurer le délai. Confirmer l'absence de boutons d'action. |
| Accès de mon environnement à Supabase et Vercel | Déjà vérifié : les adresses répondent. Reste à tester avec tes clés. |
| Partage du noyau entre l'app et les fonctions | Importer `_shared/core` depuis une fonction et depuis l'app (alias Vite). |
| Stockage d'une PWA sur iOS | Vérifier que le cache survit à une semaine sans ouverture une fois l'app installée. |
| PDF sur iPhone | Générer un PDF d'essai avec le gabarit et l'enregistrer depuis le menu de partage. |

## 7. Ce que je ne choisis pas (volontairement)

Pas de bibliothèque d'interface, pas de gestionnaire d'état externe, pas d'ORM, pas de serveur maison, pas de temps réel. Moins de pièces, moins de code, moins de pannes, moins de tokens.

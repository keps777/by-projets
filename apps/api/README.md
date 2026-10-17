# apps/api — API NestJS + PostgreSQL

Socle de l'API AfriMove (ticket AM-017) : NestJS 11, PostgreSQL 16 via Prisma 7, authentification
par rôle, rôles stricts, journal d'audit et journal d'événements en ajout seul, chiffrement au repos,
configuration par variables d'environnement, OpenAPI.

Les modules métier (billets, colis, caisse, départs…) viendront se brancher sur ce socle ; tout le
code du socle est dans `src/socle/`. `src/main.ts`, `src/migrate.ts` et `src/seed.ts` sont les trois
points d'entrée (`dist/main.js` est ce que lance le Dockerfile).

## Démarrer

### Avec Docker (API + base)

```
docker compose up --build              # à la racine du dépôt
docker compose --profile seed run --rm seed   # comptes de démonstration (secrets affichés une fois)
```

La base est migrée avant le démarrage de l'API. Santé : <http://localhost:3000/health> ;
documentation : <http://localhost:3000/docs> (JSON : `/openapi.json`). Le simulateur de SMS écrit les
codes dans `docker compose logs api`. Les valeurs de `docker-compose.yml` portent le marqueur
`dev-seulement` : l'API refuse de démarrer en production avec elles.

### Sans Docker

```
cp apps/api/.env.example apps/api/.env       # puis adapter DATABASE_URL
pnpm --filter @afrimove/api run build        # prisma generate + nest build
node --env-file=apps/api/.env apps/api/dist/migrate.js
node --env-file=apps/api/.env apps/api/dist/seed.js
node --env-file=apps/api/.env apps/api/dist/main.js
```

## Scripts

| Script           | Rôle                                                                         |
| ---------------- | ---------------------------------------------------------------------------- |
| `build`          | `prisma generate` puis `nest build` → `dist/main.js`                         |
| `typecheck`      | `tsc --noEmit` (sources et tests)                                            |
| `lint`           | Prettier + ESLint                                                            |
| `test`           | Vitest : unitaires, rôles, HTTP (sans base de données)                       |
| `start:dev`      | `nest start --watch`                                                         |
| `db:migrate:dev` | `prisma migrate dev` : crée une migration après une modif de `schema.prisma` |

Le client Prisma est généré dans `src/socle/db/generated` (ignoré par git) : les scripts
`build`, `typecheck` et `test` le régénèrent. Il est compilé avec l'API, donc l'image Docker n'a pas
besoin du CLI Prisma.

### Tests contre un vrai PostgreSQL

`db.integration.test.ts` (migrations, déclencheurs « ajout seul », contraintes, chiffrement en base,
chaîne d'audit sous concurrence, connexions de bout en bout) est ignoré sans base :

```
createdb afrimove_test      # la base doit être JETABLE : son nom finit par _test, son schéma est vidé
DATABASE_URL_TEST=postgresql://user@localhost:5432/afrimove_test pnpm --filter @afrimove/api run test
```

(`TEST_DATABASE_URL`, l'ancien nom, est encore lu.) Les autres fichiers `*.integration.test.ts`
(numérotation, modules, reprise des données par les migrations) s'y exécutent aussi ; ils se
partagent la base l'un après l'autre. Voir `INTEGRATION.md` pour l'état de chaque module.

## Configuration

Tout vient de l'environnement ; `.env.example` liste chaque variable avec son rôle. Au démarrage,
`chargerConfig` valide l'ensemble et signale **toutes** les erreurs d'un coup (sans afficher de valeur).
En production, une valeur d'exemple (`dev-seulement`) ou `SMS_MOCK_LOG_CODES=true` empêche le démarrage.

| Variable                                                                               | Rôle                                                            |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `DATABASE_URL`                                                                         | PostgreSQL 16                                                   |
| `JWT_SECRET`, `JWT_TTL_SECONDS`                                                        | jetons d'accès HS256 (1 h par défaut)                           |
| `AUTH_PEPPER`                                                                          | poivre des PIN, mots de passe et codes SMS                      |
| `ENCRYPTION_KEY`, `ENCRYPTION_KEY_ID`, `ENCRYPTION_PREVIOUS_KEYS`                      | chiffrement AES-256-GCM et rotation                             |
| `BLIND_INDEX_KEY`                                                                      | index aveugle des téléphones (ne jamais changer sans réindexer) |
| `AUDIT_HMAC_KEY`                                                                       | chaîne d'empreintes du journal d'audit (ne jamais changer)      |
| `OTP_TTL_SECONDS`, `OTP_MAX_ESSAIS`, `OTP_MAX_DEMANDES_15MIN`                          | codes SMS                                                       |
| `SMS_DRIVER`, `SMS_MOCK_LOG_CODES`                                                     | fournisseur SMS (simulateur seul pour l'instant)                |
| `CORS_ORIGINS`, `TRUST_PROXY`, `OPENAPI_ENABLED`, `RATE_LIMIT_ENABLED`, `PORT`, `HOST` | réseau et exposition                                            |

Générer de vraies valeurs : `openssl rand -base64 48` (secrets texte), `openssl rand -base64 32` (clés).

## Authentification par rôle

| Rôle(s)                                                                              | Méthode                                            | Routes                                                                 |
| ------------------------------------------------------------------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------- |
| `voyageur`                                                                           | numéro + code SMS (compte créé à la 1re connexion) | `POST /auth/voyageur/code` → `POST /auth/voyageur/verification`        |
| `guichetier`, `convoyeur`, `chauffeur`, `vendeur`, `controleur`, `relais`, `livreur` | numéro + PIN à 6 chiffres                          | `POST /auth/guichet/connexion`                                         |
| `superviseur`, `patron`, `comptable`, `afrimove`                                     | mot de passe, puis code SMS                        | `POST /auth/direction/connexion` → `POST /auth/direction/verification` |

- Le jeton ne porte qu'**un rôle actif** (celui de la connexion). À chaque requête, le compte et son
  rôle sont relus en base : désactiver un compte ou retirer un rôle coupe l'accès immédiatement.
- PIN et mots de passe : **argon2id** avec un poivre serveur (un PIN n'a que 10^6 valeurs : sans
  poivre, une base volée se casserait en secondes). Politique : PIN sans suite ni chiffres identiques,
  mot de passe de 12 caractères minimum.
- 3 échecs bloquent le compte 15 minutes (423), comme `ESSAIS_PIN_MAX` / `BLOCAGE_PIN_MINUTES` du domaine.
- Codes SMS : 6 chiffres, 5 minutes, 5 essais, usage unique, 3 demandes par quart d'heure et par
  numéro ; seul leur HMAC est stocké. La réponse est la même pour un numéro connu ou inconnu.
- Les SMS passent par l'interface `SmsGateway` (`src/socle/sms`), aujourd'hui branchée sur un simulateur.
- `GET /me` renvoie le rôle actif et les habilitations.

## Rôles stricts

Le contrôle d'accès est **refusé par défaut** : une route doit déclarer `@Public()`, `@Authentifie()`,
`@Roles(...)` ou `@Vente(...)`, sinon elle répond 403 et le test d'inventaire (`roles.e2e.test.ts`)
échoue. Ce test parcourt toutes les routes de l'application, y compris celles ajoutées plus tard.

- **Un guichetier n'appelle aucune route patron** : tout `/patron/**` est limité à `patron` et
  `comptable` ; le test appelle chaque route `/patron/**` avec chaque rôle du terrain (403).
- **AfriMove ne vend jamais** : `@Vente()` n'accepte que `voyageur`, `guichetier`, `convoyeur`, `vendeur`,
  et la garde refuse AfriMove même si on l'ajoute par erreur à `@Roles`. En base, une contrainte
  interdit qu'un compte cumule `afrimove` avec l'un de ces rôles.
- Les refus sont écrits dans le journal d'audit (`acces.refuse`).

## Journaux en ajout seul

- `journal_audit` : qui, quoi, quand, résultat. Les valeurs sensibles (PIN, mots de passe, codes,
  jetons, numéros) sont masquées avant écriture. Chaque ligne porte le HMAC de la précédente :
  `GET /afrimove/journal-audit/verification` recalcule la chaîne et signale la première ligne falsifiée.
  Le patron lit le journal de sa compagnie (`GET /patron/journal-audit`).
- `evenement` : journal des événements métier du domaine (`Evenement`) ; l'identifiant est créé sur
  l'appareil, donc rejouer une synchronisation est sans effet (`EvenementsService.enregistrer`).
- Dans les deux cas, des **déclencheurs PostgreSQL** refusent `UPDATE`, `DELETE` et `TRUNCATE`
  (migration `ajout_seul_et_contraintes`), et un billet ou un colis ne s'efface pas et ne change jamais de numéro.

## Chiffrement au repos

`ChiffrementService` : AES-256-GCM, nonce aléatoire, contexte lié au chiffré (un chiffré copié dans
une autre colonne est refusé), identifiant de clé pour la rotation. Champs chiffrés : téléphone des
personnes, identité des passagers (`billet.passagerChiffre`), expéditeur et destinataire des colis.
Les colonnes `*Index` sont des index aveugles (HMAC) pour retrouver une ligne sans la déchiffrer.
Le code de retrait d'un colis n'est conservé que haché (domaine). Rotation : nouvelle clé dans
`ENCRYPTION_KEY` avec un nouvel `ENCRYPTION_KEY_ID`, ancienne dans `ENCRYPTION_PREVIOUS_KEYS`, puis
`rechiffrer` migre les lignes.

## Base de données

`prisma/schema.prisma` reprend les entités et les états de `@afrimove/domain` (un test vérifie que les
enums sont identiques). Les migrations sont dans `prisma/migrations` et **additives** (voir
`infra/README.md`, section E). `node dist/migrate.js` les applique sans le CLI Prisma, avec la même
table `_prisma_migrations` : c'est la valeur à donner à `DEV_MIGRATE_COMMAND`.

## Seed

`node dist/seed.js` crée une compagnie de démonstration (DEM), deux gares, un guichet et un compte par
rôle de gestion (guichetier, superviseur, patron, comptable, afrimove). Rejouable. Refusé en production.
Le point d'entrée du seed depuis les fixtures (AM-011) est `src/socle/db/seed-fixtures.ts`.

## Limites connues

- `@afrimove/domain` et `@afrimove/fixtures` sont du TypeScript non compilé (pas de `dist`, imports
  sans extension) : l'API n'importe donc le domaine qu'en **test** (`devDependencies`) et en recopie les
  listes. Pour l'utiliser à l'exécution, il faudra lui donner un vrai build.
- Pas de jeton de rafraîchissement ni de révocation individuelle (hors de ce ticket) : durée de vie courte.
- Le vrai fournisseur de SMS n'est pas branché (interface + simulateur).
- OpenAPI est généré depuis les contrôleurs et DTO de l'API ; `@afrimove/contrats` est encore vide.

# infra — CI/CD et environnement de dev (AM-018)

Ce dossier décrit comment une PR verte fusionnée dans `main` arrive en dev sans action manuelle, et comment revenir en arrière en moins de 15 minutes.

## Vue d'ensemble

```
PR  ──► CI (.github/workflows/ci.yml)
        lint · typecheck · test · build · banc de fidélité (si interface touchée)
        contrôle unique à rendre « requis » : ci-ok

main ─► CI verte ─► Déploiement dev (.github/workflows/deploy-dev.yml)
        1 images Docker web + api  ──► ghcr.io/<org>/<dépôt>/{web,api}:sha-1234567 et :dev
        2 accès SSH à l'hôte dev
        3 vérification de l'hôte + connexion au registre
        4 sauvegarde de la base (pg_dump)
        5 migrations (si DEV_MIGRATE_COMMAND est défini)
        6 bascule API puis web, chacune attend l'état « sain » et revient seule en arrière sinon
        7 purge du CDN (si le secret existe)
        8 contrôles de fumée sur les adresses publiques (retour arrière auto s'ils échouent)
        9 adresse de dev publiée (résumé du job + lien de l'environnement « dev »)
```

| Fichier | Rôle |
|---|---|
| `.github/workflows/ci.yml` | Intégration continue. |
| `.github/workflows/deploy-dev.yml` | Déploiement de `main` en dev, et retour arrière manuel. |
| `apps/web/Dockerfile` | Build Vite puis Nginx sans privilèges (port 8080). |
| `apps/api/Dockerfile` | Build Nest puis Node 22 alpine, utilisateur non root (port 3000). |
| `infra/docker/nginx-web.conf` | Nginx : repli SPA, cache des fichiers à empreinte, service worker jamais mis en cache, `/healthz`. |
| `infra/dev/compose.yaml` | PostgreSQL 16 + API + web sur l'hôte dev. |
| `infra/dev/ctl.sh` | Pilotage sur l'hôte : `preflight`, `backup`, `migrate`, `deploy`, `rollback`, `status`. |

Les images se construisent depuis la racine du dépôt :
`docker build -f apps/web/Dockerfile -t afrimove-web .` et `docker build -f apps/api/Dockerfile -t afrimove-api .`

### Tant que les apps sont des squelettes

Les Dockerfiles échouent volontairement avec un message clair si `apps/web/dist/index.html` ou `apps/api/dist/main.js` n'existe pas. Le workflow de déploiement ne construit une image que si l'app a son vrai point d'entrée (`apps/web/index.html` + `vite.config.*`, `apps/api/src/main.ts`) : avant cela il annonce « rien à déployer » et se termine en vert. De même, le banc de fidélité est ignoré (avec une notice) tant que le script `fidelite` de `tools/fidelite` est l'espace réservé d'AM-001, et devient bloquant dès la fusion d'AM-004.

## Mise en place (une seule fois, par Luther)

### 1. Hôte dev

Un serveur ou une VM Linux avec Docker Engine et le plugin Compose. Un utilisateur dédié (par exemple `deploy`) dans le groupe `docker`, avec la clé publique de déploiement dans `~/.ssh/authorized_keys`.

Devant l'hôte, un terminateur HTTPS / CDN (Caddy, Nginx, Cloudflare, etc.) qui envoie :

- l'adresse web de dev vers `127.0.0.1:8080` (variable `WEB_PORT` pour changer),
- l'adresse API de dev vers `127.0.0.1:3000` (variable `API_PORT`).

Les ports sont publiés sur `127.0.0.1` uniquement ; la base n'est jamais exposée.

### 2. Clé SSH de déploiement

```
ssh-keygen -t ed25519 -f afrimove-deploy -C "afrimove-ci" -N ""
ssh-keyscan -p 22 <hôte> > known_hosts_dev      # à vérifier contre l'empreinte réelle du serveur
```

La clé privée (`afrimove-deploy`) va dans le secret `DEV_SSH_PRIVATE_KEY`, le contenu de `known_hosts_dev` dans `DEV_SSH_KNOWN_HOSTS`. Le workflow refuse de se connecter à un hôte dont l'empreinte n'est pas dans ce fichier.

### 3. Secrets applicatifs sur l'hôte (hors dépôt, hors GitHub)

Créer `~/afrimove/secrets.env` sur l'hôte (`chmod 600`) :

```
POSTGRES_PASSWORD=<mot de passe long aléatoire>
DATABASE_URL=postgresql://afrimove:<même mot de passe>@db:5432/afrimove
# + les variables propres à l'API au fur et à mesure (JWT_SECRET, clés Mobile Money, …)
```

`ctl.sh preflight` vérifie que `POSTGRES_PASSWORD` et `DATABASE_URL` sont présents. Ce fichier est lu par la base et par l'API ; il n'est jamais copié dans une image ni versionné.

### 4. Secrets et variables GitHub

Dans **Settings → Environments → New environment : `dev`** (les secrets peuvent aussi être au niveau du dépôt).

Secrets (environnement `dev`) :

| Nom | Obligatoire | Contenu |
|---|---|---|
| `DEV_SSH_PRIVATE_KEY` | oui | Clé privée SSH de l'étape 2. |
| `DEV_SSH_KNOWN_HOSTS` | oui | Ligne(s) `known_hosts` de l'hôte dev. |
| `GHCR_PULL_TOKEN` | non | Jeton (PAT classique, portée `read:packages`) que l'hôte utilise pour tirer les images. Sans lui, le `GITHUB_TOKEN` du run est utilisé : suffisant pour déployer, mais l'hôte ne pourra pas retirer une image absente lors d'un retour arrière tardif. À créer si les images restent privées. |
| `DEV_CDN_PURGE_WEBHOOK_URL` | non | URL appelée en POST après le déploiement pour purger le CDN. Absente : étape ignorée. |

Variables (**Settings → Secrets and variables → Actions → Variables**, niveau dépôt) :

| Nom | Obligatoire | Exemple / rôle |
|---|---|---|
| `DEV_DEPLOY_ENABLED` | oui | `true` pour activer le déploiement. Tant qu'elle manque, seules les images sont construites. |
| `DEV_SSH_HOST` | oui | `dev.exemple.org` |
| `DEV_SSH_USER` | oui | `deploy` |
| `DEV_WEB_URL` | oui | `https://dev.afrimove.exemple.org` : publiée à chaque déploiement, utilisée pour les contrôles de fumée. |
| `DEV_API_URL` | conseillé | `https://api.dev.afrimove.exemple.org` : figée dans le bundle web (`VITE_API_URL`) et contrôlée en fin de déploiement. |
| `DEV_SSH_PORT` | non | `22` par défaut. |
| `DEV_DEPLOY_PATH` | non | `afrimove` par défaut (relatif au répertoire personnel de l'utilisateur SSH). |
| `DEV_API_HEALTH_PATH` | non | `/` par défaut ; mettre `/health` quand l'API l'expose. Tout code HTTP < 500 est accepté. |
| `DEV_MIGRATE_COMMAND` | non | Commande exécutée dans l'image API avant la bascule, par exemple `node dist/migrate.js`. Absente : pas de migration. |
| `GHCR_PULL_USER` | non | Compte lié à `GHCR_PULL_TOKEN` (défaut : l'auteur du run). |

### 5. Protection de branche

Sur `main` : exiger une PR, et rendre **`ci-ok`** obligatoire. C'est ce qui garantit qu'une PR fusionnée est verte ; le déploiement ne démarre de toute façon que si la CI de `main` est verte.

### 6. Visibilité des images

Les images apparaissent dans **Packages** de l'organisation après le premier run. Soit les laisser privées et créer `GHCR_PULL_TOKEN`, soit les passer en publiques (elles ne contiennent aucun secret).

## Prévisualisation par PR

Chaque PR dont le job `build` produit `apps/web/dist/index.html` joint ce build à l'exécution de la CI (artefact `apercu-web-<n° de PR>`, 14 jours). C'est une prévisualisation téléchargeable, pas une adresse publique : une adresse par PR demande un hébergeur de prévisualisation (à choisir, hors périmètre d'AM-018). Le rapport du banc de fidélité est joint de la même façon (`rapport-fidelite-…`).

## Retour arrière en moins de 15 minutes

Principe : chaque déploiement est une image immuable `…/web:sha-1234567` / `…/api:sha-1234567`. Revenir en arrière, c'est remettre l'ancien tag ; rien n'est reconstruit.

### A. Le plus rapide : sur l'hôte (1 à 2 minutes)

```
ssh deploy@<hôte>
cd ~/afrimove
./ctl.sh status        # versions en place et version précédente
./ctl.sh rollback      # web et api reviennent à la version précédente
```

Pour viser une version précise : `./ctl.sh rollback sha-1234567`. Relancer `./ctl.sh rollback` une seconde fois revient à la version qu'on vient de quitter.

`ctl.sh` attend que chaque conteneur soit « sain » avant de conclure. Les images précédentes restent sur l'hôte : aucun accès au registre n'est nécessaire.

### B. Sans accès SSH : depuis GitHub (3 à 5 minutes)

**Actions → Déploiement dev → Run workflow**, renseigner `rollback_tag` (par exemple `sha-1234567`, visible dans le résumé de l'ancien déploiement ou dans Packages). Le workflow saute la construction et la migration, et refait les étapes de bascule et de contrôle.

### C. Automatique

- Si un service ne devient pas sain après sa bascule, `ctl.sh deploy` remet seul la version précédente et le workflow échoue.
- Si les contrôles de fumée échouent après le déploiement, le workflow lance `ctl.sh rollback`.

### D. Après le retour arrière

1. Le web et l'API sont revenus : vérifier `DEV_WEB_URL` et purger le CDN si besoin (le service worker et `index.html` ne sont jamais mis en cache par Nginx).
2. Revert de la PR fautive dans `main` (ou correctif), sinon le prochain déploiement remet la version défaillante. Mettre le déploiement en pause si nécessaire : variable `DEV_DEPLOY_ENABLED` à `false`.

### E. Si la base est en cause (5 à 10 minutes selon sa taille)

Règle d'équipe pour tenir les 15 minutes : **les migrations sont additives** (on ajoute une colonne ou une table, on ne supprime et on ne renomme qu'une version plus tard, une fois le code ancien disparu). Ainsi l'ancienne version de l'API fonctionne sur le nouveau schéma, et le retour arrière A ou B suffit.

Si une migration a quand même abîmé les données, restaurer la sauvegarde prise juste avant le déploiement (les 7 dernières sont dans `~/afrimove/backups/`) :

```
cd ~/afrimove
docker compose stop api
docker compose exec -T db dropdb   -U afrimove --if-exists afrimove
docker compose exec -T db createdb -U afrimove afrimove
docker compose exec -T db pg_restore -U afrimove -d afrimove --no-owner < backups/dev-<horodatage>.dump
./ctl.sh rollback
```

Budget indicatif : décider 2 min · code `ctl.sh rollback` 2 min · restauration base 5–10 min · vérification 2 min.

## Points à connaître

- **Un seul hôte, pas de haute disponibilité.** C'est de l'environnement de dev ; l'API redémarre brièvement à chaque bascule.
- **Concurrence.** Un seul déploiement dev à la fois (`concurrency: deploy-dev`) ; un déploiement en attente est remplacé par le plus récent, un déploiement en cours n'est jamais interrompu.
- **L'URL de l'API est figée dans le bundle web** au moment de la construction (`VITE_API_URL`). Changer `DEV_API_URL` demande un nouveau déploiement de `main`.
- **Aucune donnée réelle en dev** : jeux de données de démonstration uniquement (`@afrimove/fixtures`).

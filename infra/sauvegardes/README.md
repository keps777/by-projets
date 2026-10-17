# Sauvegardes (AM-172)

Sauvegarde complète de la base chaque nuit à 2 h (heure de Douala), conservée 30 jours ; journal PostgreSQL (WAL) conservé 7 jours ; tout est chiffré avant de quitter le serveur et déposé chez **deux fournisseurs** (deux comptes, deux régions) ; restauration complète chronométrée, objectif **moins de 2 h**.

Le mode kiosque et l'effacement à distance des téléphones de guichet sont dans `apps/web/src/kiosque/README.md`.

## Ce qui est livré, exigence par exigence

| Exigence du ticket                    | Ce qui y répond                                                                                                                                                                                                                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sauvegarde complète chaque nuit à 2 h | `sauvegarder.sh complet` (pg_dump `-Fc`), lancé par `systemd/afrimove-sauvegarde.timer` (`02:00 Africa/Douala`, `Persistent=true`).                                                                                                        |
| Conservée 30 jours                    | `purger.sh` (appelé à la fin de chaque sauvegarde réussie), `RETENTION_COMPLET_JOURS=30`, garde-fou : les 3 plus récentes ne sont jamais supprimées.                                                                                       |
| Journal sur 7 jours                   | `archiver-wal.sh` (archive_command) + `expedier-journal.sh` (toutes les 5 min) + sauvegarde physique `sauvegarder.sh physique` (base de départ du rejeu). Rétention 7 jours.                                                               |
| Deux fournisseurs, deux régions       | Chaque fichier est déposé chez `FOURNISSEUR_A` **et** `FOURNISSEUR_B` (rclone) ; taille contrôlée après dépôt ; code de sortie 2 + alerte si un seul l'a reçu.                                                                             |
| Chiffrement au repos                  | [age](https://age-encryption.org) : le serveur ne détient que les clés **publiques**. Les clés privées sont tenues hors ligne par deux personnes. Rien ne part en clair (refus sans destinataire).                                         |
| Chiffrement en transit                | rclone parle HTTPS aux fournisseurs ; rien d'autre ne sort du serveur.                                                                                                                                                                     |
| PIN et codes hachés                   | Déjà fait par AM-017 (`apps/api/src/socle/auth/hachage.service.ts` : argon2id avec poivre pour les PIN et mots de passe, HMAC pour les codes SMS ; chiffrement AES-256-GCM des champs sensibles, `socle/chiffrement`). Rien à refaire ici. |
| Test de restauration documenté, < 2 h | `restaurer.sh` + rapport JSON chronométré + procédure ci-dessous.                                                                                                                                                                          |
| Alerte si une nuit est ratée          | `verifier.sh` (6 h et chaque heure) : sauvegarde de moins de 26 h chez chaque fournisseur, avec son empreinte ; journal de moins de 30 min (si `VERIFIER_JOURNAL=1`).                                                                      |

Tables PostgreSQL attendues : **aucune**. Ce dossier ne crée ni table ni migration ; il sauvegarde celles des autres. `VERIF_TABLES` (par exemple `personne,billet,journal_audit`, tables du schéma Prisma) liste celles qui doivent être lisibles après une restauration.

## Les scripts

| Script                                          | Rôle                                                                                                                                                     |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sauvegarder.sh [complet\|physique]`            | Dump (ou `pg_basebackup`), contrôle (`pg_restore --list`), chiffrement age, empreinte `.sha256`, dépôt chez A et B, purge. Sortie 0 / 2 (partielle) / 1. |
| `purger.sh`                                     | Rétention (30 j complet, 7 j physique et journal). Un fournisseur injoignable n'est pas purgé et fait sortir en erreur.                                  |
| `verifier.sh`                                   | Sonde de fraîcheur, alerte par webhook.                                                                                                                  |
| `archiver-wal.sh`                               | `archive_command` PostgreSQL : met le segment dans un dossier d'attente (POSIX sh, tourne dans le conteneur).                                            |
| `expedier-journal.sh`                           | Chiffre et envoie les segments du dossier d'attente chez A et B ; ne les retire qu'une fois chez les deux.                                               |
| `recuperer-wal.sh`                              | `restore_command` pour le rejeu à un instant précis.                                                                                                     |
| `restaurer.sh`                                  | Restauration complète chronométrée dans une base vide (ou `--jetable` pour le test sans risque).                                                         |
| `lib.sh`, `sauvegardes.env.exemple`, `systemd/` | Fonctions communes, configuration, unités et minuteries.                                                                                                 |

Chaque script lit `sauvegardes.env` (ou `$SAUVEGARDES_ENV`) ; une variable déjà exportée l'emporte sur le fichier.

## Mise en place sur l'hôte (une seule fois)

Prérequis : `bash` ≥ 4.4, coreutils GNU, `rclone`, `age`, `curl`, `sha256sum`, Docker Compose (comme `infra/dev`).

1. **Deux fournisseurs, deux régions.** Créer deux comptes distincts (par exemple un stockage S3 dans l'Union européenne et un autre chez un autre fournisseur en Afrique ou ailleurs), un bucket chacun. Activer le versionnement ou le verrouillage d'objets (protection contre un effacement par un attaquant ou une erreur), avec des identifiants limités à ce bucket. Les déclarer dans `/etc/afrimove/rclone.conf` (`chmod 600`) sous les noms `sauv-a` et `sauv-b`.
2. **Clés de chiffrement.** Sur un poste de confiance, jamais sur le serveur : `age-keygen -o cle-1.txt` et `age-keygen -o cle-2.txt`, pour deux personnes différentes. Garder les fichiers `cle-*.txt` hors ligne (coffre de mots de passe + copie papier ou clé USB). Mettre les deux **clés publiques** (`age1…`) dans `AGE_DESTINATAIRES`. Perdre toutes les clés privées rend toutes les sauvegardes illisibles : c'est le risque à surveiller.
3. **Scripts.** Copier ce dossier dans `/opt/afrimove/sauvegardes`, copier `sauvegardes.env.exemple` en `/etc/afrimove/sauvegardes.env` (`chmod 600`) et l'adapter (`FOURNISSEUR_*`, `AGE_DESTINATAIRES`, `PG_COMMANDE`, `ALERTE_URL`).
4. **Minuteries.** Copier `systemd/*` dans `/etc/systemd/system`, puis `systemctl enable --now afrimove-sauvegarde.timer afrimove-journal.timer afrimove-verification.timer`. Pour la sauvegarde physique, dupliquer `afrimove-sauvegarde.{service,timer}` en `afrimove-sauvegarde-physique.*` avec `sauvegarder.sh physique` et `02:30` (le fichier explique comment).
5. **Brancher l'archivage du journal** (demande une modification de `infra/dev/compose.yaml`, hors périmètre de ce ticket : à faire par le coordinateur). Dans le service `db` :

   ```yaml
   command:
     - postgres
     - -c
     - wal_level=replica
     - -c
     - archive_mode=on
     - -c
     - archive_timeout=300
     - -c
     - archive_command=/sauvegardes/archiver-wal.sh "%p" "%f"
   volumes:
     - pgdata:/var/lib/postgresql/data
     - /opt/afrimove/sauvegardes:/sauvegardes:ro
     - /var/lib/afrimove/sauvegardes/wal:/wal-spool
   ```

   Le dossier `/var/lib/afrimove/sauvegardes/wal` doit appartenir à l'utilisateur `postgres` du conteneur (uid 70 dans l'image alpine). Si le spool se remplit (fournisseurs injoignables), PostgreSQL conserve ses segments et son disque grossit : `verifier.sh` alerte avant.

6. **Premier passage à la main** : `SAUVEGARDES_ENV=/etc/afrimove/sauvegardes.env ./sauvegarder.sh complet`, puis `./verifier.sh`.

## Test de restauration (à faire avant la mise en production, puis chaque mois)

Critère du ticket : « restauration complète sur un serveur vide réussie et chronométrée ». À faire sur une vraie machine neuve, avec la clé privée d'une des deux personnes :

1. Noter l'heure de début (**T0**) au moment où l'on décide de restaurer.
2. Préparer le serveur vide : Docker + Compose, `infra/dev/compose.yaml` et `secrets.env`, `docker compose up -d db`, `rclone.conf`, ce dossier de scripts, `sauvegardes.env`. Noter l'heure (**T1**).
3. `./restaurer.sh --identite /chemin/cle-1.txt --rapport rapport.json` (la base `afrimove` existe, vide : elle est remplie ; sinon elle est créée). Sans option, le script prend la sauvegarde la plus récente chez A, vérifie l'empreinte, et bascule sur B si la copie de A est absente ou corrompue.
4. Vérifier que l'API démarre sur la base restaurée et qu'un écran répond. Noter l'heure de fin (**T2**).
5. Remplir le tableau :

   | Date        | T0 → T1 (préparer) | Restauration (`duree_secondes`) | Contrôle applicatif | Total T0 → T2 | < 2 h ? | Fournisseur | Fait par |
   | ----------- | ------------------ | ------------------------------- | ------------------- | ------------- | ------- | ----------- | -------- |
   | _à remplir_ |                    |                                 |                     |               |         |             |          |

Le rapport JSON donne `duree_secondes`, `objectif_secondes` (7 200), `respecte`, le fichier, le fournisseur, le nombre de tables. Le script sort en code 3 (et alerte) si la restauration réussit mais dépasse l'objectif.

**Test mensuel sans risque sur le serveur de production** : `./restaurer.sh --identite … --base afrimove_test_restauration --jetable` restaure dans une base à part puis la supprime. Il prouve que les sauvegardes sont lisibles et mesure la durée, mais pas la préparation d'un serveur neuf.

Quand le fichier grossira, la durée de `pg_restore` croîtra : relancer le test chronométré à chaque doublement de la taille de la base.

## Restauration à un instant précis (journal)

Sert à revenir, par exemple, une minute avant une fausse manipulation, dans la limite de 7 jours. Procédure (essayée en local avec PostgreSQL 16 non conteneurisé, voir « Ce qui est vérifié ») :

1. Choisir l'instant cible **T** (UTC) et la dernière sauvegarde physique **antérieure** à T chez A ou B.
2. Déchiffrer : `age -d -i cle.txt -o base.tar afrimove-<horodatage>.base.tar.age`, puis `tar -xf base.tar` donne `base.tar.gz` et `backup_manifest`. Le journal nécessaire à la cohérence est inclus (`-X fetch`).
3. Dans un dossier de données vide (droits 0700, propriétaire `postgres`) : `tar -xzf base.tar.gz -C <données>`.
4. Ajouter à `postgresql.auto.conf` : `restore_command = '/chemin/recuperer-wal.sh "%f" "%p"'` (avec `IDENTITE_AGE`, `SAUVEGARDES_ENV`, `RCLONE_CONFIG` dans l'environnement de PostgreSQL), `recovery_target_time = 'T'`, `recovery_target_action = 'promote'`, `archive_mode = off`. Créer le fichier vide `recovery.signal`.
5. Démarrer PostgreSQL : il rejoue le journal depuis les deux fournisseurs jusqu'à T, puis s'ouvre. Contrôler les données avant d'y brancher l'API.

L'instant T doit être postérieur à la fin de la sauvegarde physique choisie ; un T antérieur fait échouer le démarrage (« recovery ended before configured recovery target »). Cette procédure n'est pas chronométrée : elle n'est pas dans le critère des 2 heures.

## Ce qui est vérifié par les tests

`pnpm --filter @afrimove/sauvegardes test` lance les **vrais scripts** dans de vrais processus, avec de faux `rclone`, `curl` et PostgreSQL (`tests/stubs/`) :

- sauvegarde : noms datés en UTC, chiffrement (le clair n'apparaît jamais chez les fournisseurs ni dans le dossier de travail), empreinte exacte, refus sans clé, sauvegarde partielle (code 2 + alerte), échec total, dump vide ou illisible, fichier tronqué chez un fournisseur ;
- rétention : 30 jours pile gardés, 30 jours + 1 s supprimés, garde-fou des 3 plus récentes, journal et physique à 7 jours, fournisseur en panne ;
- fraîcheur : limites de 26 h et 30 min à la seconde près ;
- journal : copie sans fichier partiel, refus d'écraser, expédition vers les deux, réessai sans doublon ;
- restauration : octets identiques, chrono et rapport, retour sur B (A en panne, corrompu, empreinte illisible), refus d'écraser une base non vide, mauvaise clé, tables attendues, durée trop longue (code 3).

Avec les vrais outils (ignorés s'ils manquent) : `age` réel (chiffrement, mauvaise clé, deux destinataires, journal) ; et, avec `DATABASE_URL_TEST` (un serveur où l'on peut créer des bases), un vrai `pg_dump` / `pg_restore` : 2 000 voyageurs et billets sauvegardés chiffrés, restaurés dans une base inexistante, empreinte md5 des données identique, seconde restauration refusée.

## Ce qui n'est PAS vérifié (demande de l'infrastructure réelle)

- **Aucun stockage distant réel** : `rclone` est remplacé par des dossiers. Les noms de remotes, les droits, le versionnement, la région réelle des deux fournisseurs, les délais et coûts de sortie sont à valider à la mise en place.
- **Aucune restauration sur un serveur neuf chronométrée** (critère du ticket) : la durée réelle dépend de la taille de la base de production, du réseau vers les fournisseurs et de la machine. Les chronos relevés en local (quelques secondes pour 4 000 lignes) n'ont aucune valeur de preuve.
- **Docker** : `PG_COMMANDE="docker compose … exec -T db"` et la sauvegarde physique dans le conteneur n'ont pas été exécutés (pas de démon Docker ici). Le même code a tourné contre un PostgreSQL 16 local, pas dans l'image `postgres:16-alpine`.
- **systemd** : unités non chargées (`OnCalendar=… Africa/Douala` demande systemd ≥ 235 et la base de fuseaux horaires).
- **Archivage dans le conteneur** : `archiver-wal.sh` a tourné sous `sh` Linux, pas sous busybox Alpine ; la modification de `compose.yaml` n'est pas faite.
- **Rejeu à un instant précis** : essayé une fois à la main contre un PostgreSQL local (données avant la sauvegarde et avant T présentes, données après T absentes). Non rejoué dans le conteneur ni avec de vrais fournisseurs.
- **Sauvegarde pendant la charge**, taille réelle, durée de la sauvegarde nocturne : non mesurées.

## Décisions à confirmer

- « Journal sur 7 jours » est compris comme le **journal de transactions (WAL)** pour revenir à un instant précis. Si le ticket visait autre chose (journal d'audit applicatif), ce point est à reprendre.
- Deux sauvegardes quotidiennes (logique 30 jours + physique 7 jours) doublent le stockage ; la logique est celle qu'on restaure en cas de sinistre simple, la physique ne sert qu'au retour à un instant précis.
- Le dump transite en clair quelques secondes dans le dossier de travail du serveur (0700) pour être contrôlé avant chiffrement. Acceptable tant que le disque du serveur est chiffré ; sinon chiffrer à la volée et contrôler après coup.
- Rétention par fournisseur : pas de réplication entre A et B, chaque sauvegarde est écrite deux fois par le serveur. Un fournisseur en panne une nuit n'est pas rattrapé le lendemain (alerte seulement).
- Intégration (`pnpm-workspace.yaml`) : voir le rapport du ticket ; sans `infra/sauvegardes` dans le workspace, la CI ne lance pas ces tests.

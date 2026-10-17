# tests/recette — recette des critères de mise en service (AM-181)

Joue les six critères de mise en service contre la **vraie pile locale** : l'API NestJS (`API_STOCKAGE=postgres`)
sur un PostgreSQL local, `apps/web` construit en mode HTTP, un Chromium émulant un téléphone (390 × 844), le vrai
moteur de synchronisation et les vrais scripts de `infra/sauvegardes`. Le résultat commenté, avec ce qui n'a pas pu
être vérifié, est dans `docs/recette/proces-verbal.md`.

```
pnpm --filter @afrimove/recette recette      # la recette : échoue si la pile ne peut pas démarrer
pnpm --filter @afrimove/recette test         # idem, mais « non joué » (code 0) si PostgreSQL est absent
RECETTE_SANS_BUILD=1 ...                     # réutilise apps/api/dist et apps/web/dist déjà construits
RECETTE_SANS_WEB=1 ...                       # ne construit ni ne sert l'application web (les scénarios d'écran échouent)
```

## Ce que le lancement fait

1. recrée la base `afrimove_recette` (`drop database … with (force)`, puis `create`) ;
2. construit l'API, applique les migrations (`apps/api/src/migrate.ts`) et le seed (`seed.ts`), puis ajoute les
   données de recette (`support/semer-recette.cjs` : guichets 2 et 3, convoyeur, chauffeur, ligne Douala – Yaoundé,
   trois bus) ;
3. lance l'API puis `vite preview` sur des ports libres entre 5200 et 5999 ;
4. joue les fichiers de `scenarios/` l'un après l'autre (une seule base, un seul Chromium) ;
5. arrête les processus qu'il a lancés, chacun par son PID.

Variables : `RECETTE_PG` (serveur, défaut `postgresql://afri@localhost:5432`), `RECETTE_BASE` (le nom doit finir par
`_recette` ou `_test`), `RECETTE_API_URL` (API déjà lancée : rien n'est démarré), `RECETTE_PORT_API`,
`RECETTE_PORT_WEB`, `RECETTE_OBLIGATOIRE=1` (le « non joué » devient un échec). Chromium :
`PLAYWRIGHT_BROWSERS_PATH` (`/opt/pw-browsers`), pas de `playwright install`.

Prérequis : `psql`, `pg_dump`, `pg_restore`, `createdb`, `dropdb`, `age`, `age-keygen` (critère 5). Sans eux, le
critère 5 échoue en le disant ; `rclone` n'est pas requis (le faux `rclone` du dépôt joue les deux fournisseurs).

## Les scénarios

| Fichier                          | Critère | Ce qu'il joue                                                                                           |
| -------------------------------- | ------- | ------------------------------------------------------------------------------------------------------- |
| `critere-1-journee.test.ts`      | 1       | Une journée de gare : trois caisses, trois départs, quai, annulation par PIN, clôtures, rapport du soir |
| `critere-2-hors-ligne.test.ts`   | 2       | Trois téléphones (vrai moteur de sync) vendent 4 h hors ligne, puis synchronisent                       |
| `critere-3-double-scan.test.ts`  | 3       | Billet scanné deux fois : API, rejeu, deux téléphones, QR falsifié                                      |
| `critere-3-ecran-quai.test.ts`   | 3       | Le même refus, sur l'écran du quai de l'application                                                     |
| `critere-4-rapport-soir.test.ts` | 4       | Rapport du patron comparé, au franc près, à un décompte indépendant                                     |
| `critere-5-sauvegarde.test.ts`   | 5       | `sauvegarder.sh` puis `restaurer.sh` dans une base vide, tables comparées, API sur la base restaurée    |
| `critere-6-vente-45s.test.ts`    | 6       | Touches et temps d'une vente sur l'écran Vendre                                                         |
| `conformite-routes.test.ts`      | tous    | Chaque opération du client HTTP a-t-elle sa route dans l'API ? (liste figée des 58 écarts)              |

## Règles du banc

- **Anomalies connues** : un scénario qui décrit ce qui devrait marcher mais ne marche pas encore est écrit
  `it.fails("ANOMALIE Ax : …")`. Il passe tant que l'anomalie existe et devient rouge le jour où elle est corrigée :
  il faut alors retirer `.fails` (et mettre à jour le procès-verbal). Même principe pour la liste des routes absentes.
- **Horloge** : les téléphones ont une horloge simulée (journées passées), le serveur a la vraie. Chaque fichier a son
  jour (critère 1 : J-5, critère 2 : J-3, critère 4 : J-8, critère 5 : J-6) ; les critères 3 et 6 vendent « maintenant ».
  Ne pas lancer la recette à cheval sur minuit à Douala (UTC+1).
- **Clôture automatique** : l'API ferme toute caisse restée ouverte sur un jour passé, par un balayage d'une minute.
  Les fichiers qui ouvrent des caisses attendent d'être loin d'un balayage (`fenetreSansBalayage`, `support/api.ts`) ;
  l'attente peut donc aller jusqu'à une minute.
- **Codes SMS** : le superviseur et le patron se connectent par mot de passe puis code SMS ; le code est lu dans le
  journal de l'API (SMS simulés). La limite de 3 demandes par quart d'heure est relevée à 20 pour la recette seulement
  (`OTP_MAX_DEMANDES_15MIN`, `support/processus.ts`).
- **Touches** : même règle que `tests/parcours` (un appui sur un contrôle ; remplir un champ ne compte pas). Le temps
  « humain » du critère 6 est un **modèle** (barème dans le fichier), pas une mesure.

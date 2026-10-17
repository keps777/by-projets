# Rapport du soir (AM-171)

À 21 h (heure de Douala), le patron reçoit le bilan de sa journée : billets, colis, recette, cash et
mobile money, écarts de caisse gare par gare, départs fusionnés, soute pleine, ventes en route,
remplissage, annulations, ventes en ligne, signatures des superviseurs. Ce module **arrête** ce
rapport une fois par compagnie et par jour, puis le sert à l'application du patron
(`GET /patron/rapports/soir`) et à la passerelle WhatsApp (AM-167). Maquette :
`docs/maquettes-v3/RapportSoir.dc.html`. Contrat : `RapportSoir` de `@afrimove/contrats`
(`patron/rapport.ts`).

Le module est **autonome** : il ne dépend que du socle (configuration, audit, horloge). Tout le reste
passe par des ports (classes abstraites, `ports.ts`) avec une version en mémoire (`memoire.ts`). Ni
`app.module.ts` ni `prisma/schema.prisma` ne sont touchés : le branchement est décrit plus bas.

## Ce que fait le module

| Fichier                  | Rôle                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `calcul.ts`              | `construireRapport` : fonction pure des faits du jour. Aucun flottant sur les montants, au franc près.                   |
| `collecte.service.ts`    | Rassemble les faits par les ports ; une source complémentaire en panne n'empêche pas le rapport (voir « Mode dégradé »). |
| `rapport.service.ts`     | `generer` (idempotent), `pourLApp`, `pourEnvoi`, `genererPourToutes`. Audit `rapport.genere`.                            |
| `planificateur.ts`       | `tick()` toutes les 30 s : dès 21:00, arrête le rapport de chaque compagnie qui n'a pas encore le sien.                  |
| `rapport.controller.ts`  | `GET /patron/rapports/soir?jour=AAAA-MM-JJ`, rôle `patron`.                                                              |
| `source-whatsapp.ts`     | `SourceRapportSoirPourWhatsApp` : le rapport arrêté ici, lu par la passerelle WhatsApp.                                  |
| `ponts.ts`               | Adaptateurs construits sur les ports de la caisse, de la billetterie et de la numérotation.                              |
| `memoire.ts`, `testing/` | Adaptateurs en mémoire (avec `enPanne` pour simuler une panne) et jeu d'essai « planche » de la maquette.                |

### Route

`GET /patron/rapports/soir`, paramètre optionnel `jour` (`AAAA-MM-JJ`).

- Sans `jour` : le dernier rapport dû (celui d'aujourd'hui à partir de 21:00, celui d'hier avant).
- `403` : rôle autre que `patron` (le gardien de rôles refuse tout `/patron/**`), ou compte sans compagnie
  (`HORS_PERIMETRE`).
- `400 REQUETE_INVALIDE` : paramètre inconnu ou `jour` mal formé.
- `404 RAPPORT_PAS_ENCORE` : le jour demandé n'est pas encore arrêté (avant 21:00, ou jour futur).
- `404 RAPPORT_INTROUVABLE` : compagnie inconnue ou jour plus ancien que `RAPPORT_JOURS_HISTORIQUE`.
- Un rapport dû mais jamais arrêté (planificateur en retard, jour passé) est arrêté à la demande.

### Définitions et décisions de calcul

- **Jour** : de 00:00 à 24:00 heure de Douala (UTC+1, sans heure d'été), quel que soit le fuseau du serveur.
- **Vente de billet** : billet créé ce jour-là, ni `annule`, ni `reserve` (commande en ligne non payée), ni
  issu d'un report (`reporte_de_id` non nul : il remplace un billet déjà compté).
- **Montant d'un billet** : `prix + bagage` (l'argent entré pour ce billet). **Montant d'un colis** : `prix_total
  - complement_poids`.
- **Recette** = billets + colis. **Cash** = ventes réglées en `cash`. **Mobile money** = recette − cash (un
  mode non renseigné compte en mobile money, jamais en cash). `recette = cash + momo` toujours.
- **Variation** des billets : par rapport au nombre de billets de la veille (même définition), en % à une
  décimale ; `0` quand la veille est vide.
- **Écart d'une gare** : somme signée des écarts (compté − attendu) des caisses clôturées de la gare.
- **Remplissage moyen** : places occupées / places offertes, sur les départs qui ne sont ni annulés ni
  fusionnés. Un départ sous 60 % est signalé (le moins rempli) : « le 09:30 Alpha Voyages part à 38 % ».
- **Annulations** : nombre, montant rendu au client, `toutesAvecPin` (vrai s'il n'y en a aucune).
- **En ligne** : billets vendus par le canal `en_ligne` et leur part des ventes.
- **Signatures** : les superviseurs qui ont validé au moins une caisse de la gare, une fois par gare.
- **Gares** : celles du référentiel, rangées par nombre de billets décroissant puis par nom.
- **Remarques d'une gare** (max 10, la dernière devient « N autres remarques ») : caisses (clôturées, non
  validées, ouvertes, sans comptage), départs fusionnés, soute pleine, billets de cadence sans nom, trous de
  numérotation, incidents de sources.

### Mode dégradé et règle des 21 h

- Le rapport **part à l'heure même si une caisse n'est pas validée** : elle est signalée dans la gare
  (« guichet 4, caisse non validée (écart −1 000 F) »). Rien n'attend personne.
- Sources **essentielles** (si elles échouent, le rapport n'est pas arrêté, le planificateur réessaie au
  passage suivant, jusqu'à minuit) : référentiel des gares, billets du jour et de la veille.
- Sources **complémentaires** (colis, litiges, caisses, départs, annulations, numérotation, contrôles en
  route) : en cas de panne, le rapport part sans elles et une remarque « <source> : données indisponibles »
  est portée sur la première gare.
- **Un rapport par compagnie et par jour, figé** : une caisse validée ou un trou comblé après 21:00 ne change
  pas ce que le patron a reçu. Deux instances qui tournent en même temps ne produisent qu'un rapport
  (`INSERT … ON CONFLICT DO NOTHING`).

## Ports et adaptateurs

| Port                 | Ce qu'il lit                                   | Adaptateur fourni                       |
| -------------------- | ---------------------------------------------- | --------------------------------------- |
| `ReferentielRapport` | compagnies et gares                            | mémoire ; **SQL à brancher**            |
| `VentesBillets`      | billets créés dans le jour                     | mémoire ; **SQL à brancher**            |
| `DepartsDuJour`      | départs du jour, remplissage, fusions, soute   | mémoire ; **pont billetterie**          |
| `ActiviteColis`      | colis enregistrés, réclamations ouvertes       | mémoire ; **SQL à brancher**            |
| `CaissesDuJour`      | sessions de caisse du jour (écart, validation) | mémoire ; **pont caisse**               |
| `AnnulationsDuJour`  | annulations décidées dans le jour              | mémoire ; **SQL à brancher**            |
| `TrousNumerotation`  | trous de numérotation ouverts                  | mémoire ; **pont numérotation**         |
| `ControlesEnRoute`   | contrôles inopinés à bord                      | mémoire ; **SQL à brancher**            |
| `AssistantRapport`   | question suggérée et sa réponse (AM-109)       | `AssistantRapportAucun` (question vide) |
| `RapportsSoir`       | les rapports arrêtés (écriture)                | mémoire ; **SQL à brancher**            |

Un adaptateur en mémoire déclare `durable = false` : `RapportModule` **refuse de démarrer en production**
tant qu'un port y est resté (`VerificationRapport`).

## Tables PostgreSQL attendues

Le module n'écrit qu'une table. Tout le reste est lu dans les tables des autres modules (schéma Prisma
existant). Rien n'est migré ici : le coordinateur intègre.

### `rapport_soir` (nouvelle, en ajout seul)

```sql
CREATE TABLE rapport_soir (
  compagnie_id uuid        NOT NULL REFERENCES compagnie (id),
  jour         date        NOT NULL,            -- jour de Douala
  genere_a     timestamptz NOT NULL,            -- instant où le rapport a été arrêté
  rapport      jsonb       NOT NULL,            -- le contrat RapportSoir, tel qu'envoyé
  PRIMARY KEY (compagnie_id, jour)
);

-- Un rapport arrêté ne change plus : ni UPDATE ni DELETE.
CREATE FUNCTION rapport_soir_ajout_seul() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'rapport_soir est en ajout seul';
END $$;
CREATE TRIGGER rapport_soir_ajout_seul
  BEFORE UPDATE OR DELETE ON rapport_soir
  FOR EACH ROW EXECUTE FUNCTION rapport_soir_ajout_seul();
```

- `RapportsSoir.trouver(compagnieId, jour)` : `SELECT … WHERE compagnie_id = $1 AND jour = $2`.
- `RapportsSoir.creer(entree)` : `INSERT … ON CONFLICT (compagnie_id, jour) DO NOTHING RETURNING …` ; si rien
  n'est retourné, relire la ligne existante et répondre `nouveau: false`.

### Requêtes de lecture (jour `$2` de Douala, bornes `[$2 00:00+01, $2+1 00:00+01[`)

`$1` est l'identifiant de la compagnie. `:debut` et `:fin` sont les bornes du jour en `timestamptz`.

**`VentesBillets.duJour`** (table `billet`, un fait par billet, tous états confondus) :

```sql
SELECT b.id, b.numero, b.gare_id AS "gareId", b.canal::text AS canal,
       b.paiement ->> 'mode' AS mode,               -- cash | momo | orange_money | NULL
       b.prix + b.bagage AS montant, b.cree_a AS "venduA", b.etat::text AS etat,
       b.reporte_de_id AS "reporteDe",
       b.a_completer_au_quai AS "aCompleterAuQuai",
       (b.a_completer_au_quai AND b.passager_chiffre IS NULL) AS "sansNom",   -- à confirmer
       (b.embarque_a IS NOT NULL) AS embarque,
       (d.etat IN ('parti', 'arrive')) AS "departParti"
FROM billet b JOIN depart d ON d.id = b.depart_id
WHERE b.compagnie_id = $1 AND b.cree_a >= :debut AND b.cree_a < :fin;
```

Le `canal` doit être rendu avec les valeurs du rapport : `guichet`, `convoyeur`, `en_ligne`, `vendeur`
(l'enum `canal_vente` les porte déjà). Le port est aussi appelé pour la veille : même requête, bornes de la
veille (le rapport n'en compte que les ventes).

**`ActiviteColis.enregistresLe`** (table `colis`) :

```sql
SELECT id, numero, gare_origine_id AS "gareId",
       prix_total + complement_poids AS montant,
       paiement_moyen AS mode,                       -- à rapprocher de cash | momo | orange_money
       cree_a AS "creeA"
FROM colis
WHERE compagnie_id = $1 AND jour = :aammjj;          -- ou cree_a dans les bornes
```

**`ActiviteColis.litigesOuvertsLe`** : `SELECT count(*) FROM reclamation_colis WHERE compagnie_id = $1 AND
ouverte_a >= :debut AND ouverte_a < :fin`.

**`AnnulationsDuJour.duJour`** : les demandes décidées dans le jour, plus les annulations faites en ligne
par le voyageur :

```sql
SELECT b.id AS "billetId", b.numero, b.gare_id AS "gareId",
       coalesce(da.montant, 0) AS montant,           -- montant rendu (remboursement ou avoir)
       true AS "avecPin", da.decidee_a AS at
FROM demande_annulation da JOIN billet b ON b.id = da.billet_id
WHERE da.compagnie_id = $1 AND da.statut = 'decidee' AND da.decision IN ('rembourser', 'avoir')
  AND da.decidee_a >= :debut AND da.decidee_a < :fin;
```

Les annulations du voyageur en ligne (sans PIN, `avecPin = false`) viennent de l'historique du billet ou de
l'événement d'annulation ; ce lien n'existe pas encore dans le schéma (à brancher par le coordinateur). `reporter`
et `refuser` ne sont pas des annulations remboursées : à confirmer.

**`ControlesEnRoute.duJour`** : les événements `controle.cloture`, `controle.regularise` et
`controle.convoyeur_signale` de la table `evenement` du jour, regroupés par contrôle (`controleId`, lieu,
régularisations, ventes non enregistrées). La forme exacte de la charge de ces événements est celle du
module de contrôle en route (ticket voisin) : à aligner à l'intégration.

**`ReferentielRapport`** : `compagnie (id, nom)` et `gare (id, nom)` filtrées par `compagnie_id`, dans l'ordre
de rangement. Une compagnie par ligne de `compagnie` active.

**Ponts déjà fournis** (aucune requête à écrire) : `CaissesDuJourSessions` (`SessionsCaisse.deGare`),
`DepartsDuJourBilletterie` (`Catalogue`, `Billets`, `ColisDuDepart`), `TrousNumerotationControle`
(`ControleJourneeService.controler`).

## Intégration (coordinateur)

1. `AppModule` : importer `RapportModule.avecModulesExistants({ providers: [ … ] })` en donnant, pour
   `ReferentielRapport`, `VentesBillets`, `ActiviteColis`, `AnnulationsDuJour`, `ControlesEnRoute` et
   `RapportsSoir`, les adaptateurs PostgreSQL ci-dessus. Les trois ponts sont déjà inclus.
2. WhatsApp : dans `WhatsAppModule.avec({ imports: [RapportModule], providers: [{ provide: SourceRapportSoir,
useExisting: SourceRapportSoirPourWhatsApp }, { provide: AnnuaireRapport, useClass: … }] })`. L'annuaire
   des destinataires (le patron et les gérants) reste à fournir. Quand le planificateur de la passerelle passe à
   21:00, `rapport()` arrête le rapport s'il ne l'est pas encore : l'envoi ne dépend pas de l'ordre des
   planificateurs.
3. Assistant (AM-109) : fournir `AssistantRapport` ; sans lui, la question suggérée est vide.
4. Écran patron : `creerClientHttp` + `OP_RAPPORT_SOIR` de l'api-client appellent déjà cette route (vérifié
   par `rapport.e2e.test.ts` contre un vrai serveur HTTP).

### Variables d'environnement

| Variable                   | Défaut  | Rôle                                                                     |
| -------------------------- | ------- | ------------------------------------------------------------------------ |
| `RAPPORT_HEURE`            | `21:00` | Heure d'arrêt du rapport, heure de Douala.                               |
| `RAPPORT_PLANIFICATEUR_MS` | `30000` | Période du planificateur ; `0` le désactive (défaut en `NODE_ENV=test`). |
| `RAPPORT_JOURS_HISTORIQUE` | `31`    | Au-delà, un rapport jamais arrêté n'est plus produit à la demande.       |

## Points à confirmer avec le métier

- Définition de la vente (annulés, réservés et remplaçants de report exclus) et du montant (prix + bagage).
- Mobile money = recette − cash ; un mode de paiement absent compte en mobile money.
- Remplissage pondéré par les places ; seuil de signalement à 60 %.
- Montant d'une annulation = somme rendue au client ; `reporter` et `refuser` exclus.
- « Soute pleine » = autant de colis chargés que de places de soute du bus.
- Rapport figé à l'instant de sa génération (pas de mise à jour après 21 h).
- Le rôle comptable n'a pas accès à la route (réservée au patron).
- Les superviseurs signent avec le nom complet de leur gare.

## Tests

`pnpm --filter @afrimove/api test -- src/rapport` : `calcul.test.ts` (chiffres exacts de la maquette :
1 004 billets, 4 410 000 F dont 2 900 000 F de cash), `rapport.service.test.ts` (idempotence, jour dû, sources
en panne), `contrat.test.ts` (schéma zod du contrat, validation WhatsApp, intégration avec la passerelle),
`rapport.e2e.test.ts` (route, rôles, client HTTP réel), `ponts.test.ts`, `module.test.ts`, `temps.test.ts`.

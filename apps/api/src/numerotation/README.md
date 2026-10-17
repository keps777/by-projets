# Numérotation sans trou côté serveur et plages (AM-161)

Attribution des plages de numéros aux guichets et aux convoyeurs, contrôle de chaque numéro reçu,
détection des trous (alerte nominative pour le rapport du soir), compteur du jour, et numérotation
des ventes en ligne par le serveur (4001–9999).

Deux garanties :

- **Un numéro n'est jamais attribué deux fois.** Les plages d'une gare ne se recouvrent jamais
  (refusé à l'attribution, 409) et aucun appareil n'a de numéro au-delà de 4000 (réservé au serveur).
  Le registre ne garde un numéro qu'une fois par `(portée, jour, genre, numéro)` : un second événement
  avec le même numéro est signalé comme doublon, quel que soit l'appareil de la gare qui l'envoie.
- **Un trou est vu et nommé.** Entre le début de la plage et le plus grand numéro reçu, tout numéro
  manquant déclenche une alerte au nom du porteur de l'appareil.

Aucune dépendance au domaine ni aux contrats à l'exécution (paquets non compilés, API en CommonJS) :
les règles sont recopiées (voir `regles.ts` et `../sync/regles.ts`) et **`parite.test.ts` les compare
aux sources** (`@afrimove/domain`, `@afrimove/contrats`).

## Ce que le module fournit

| Élément                                                              | Rôle                                                                                                                                                                       |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PlagesService`                                                      | `attribuer`, `liberer`, `de`, `lister` : plan de numérotation ou plage explicite, sans chevauchement.                                                                      |
| `NumerotationService`                                                | `enregistrer` (doublon / hors plage), `trous`, `compteur`, `resume`, `resumeGare`, `prendreEnLigne` (numéros du serveur).                                                  |
| `ControleJourneeService`                                             | `controler(jour, périmètre)` : alertes `trou_dans_la_plage` nominatives, rejouables ; `lister`.                                                                            |
| `ControleNumerosServeur`, `AttributionPlagesServeur`                 | Remplacent `ControleNumerosMemoire` et `AttributionPlagesParRang` de la synchronisation (mêmes classes abstraites, `sync/ports.ts`).                                       |
| Ports : `PlagesAttribuees`, `RegistreNumeros`, `AlertesNumerotation` | Persistance. Versions en mémoire dans `memoire.ts` ; **versions PostgreSQL non écrites** (voir plus bas).                                                                  |
| `NumerotationModule`                                                 | Assemble le tout, exporte `ControleNumeros` et `AttributionPlages` sous les jetons de la synchronisation. Refuse de démarrer en production tant qu'un port est en mémoire. |

## Routes

| Route                                         | Rôles                                               | Rôle de la route                                                                                                                                             |
| --------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /numerotation/appareils/:id/plage?jour=` | guichetier, convoyeur, vendeur, superviseur, patron | Plage, compteur du jour (billets et colis : émis, dernier, prochain, restants, trous, hors plage) et `plageSansTrou`. Sa gare (sa compagnie pour le patron). |
| `PUT /numerotation/appareils/:id/plage`       | superviseur (sa gare), patron (gare à nommer)       | Attribue la plage : `{ genre, rang, nbConvoyeurs?, plage?, gareId?, titulaire? }`. 400 plage invalide, 409 chevauchement (nomme l'appareil en conflit).      |
| `DELETE /numerotation/appareils/:id/plage`    | superviseur, patron                                 | Libère la plage d'un appareil remplacé (204). Les numéros déjà émis restent pris.                                                                            |
| `GET /numerotation/compteurs?jour=&gareId=`   | superviseur, patron                                 | Compteurs de tous les appareils, totaux du jour, ventes en ligne.                                                                                            |
| `POST /numerotation/controles` `{ jour? }`    | superviseur, patron                                 | Contrôle de fin de journée ; rend les alertes ouvertes du périmètre. Rejouable.                                                                              |
| `GET /numerotation/alertes?jour=`             | superviseur, patron                                 | Alertes de numérotation ouvertes, pour le rapport du soir (`/(patron)/rapport`).                                                                             |

Le jour est un `AAMMJJ` en heure de Douala (défaut : aujourd'hui). Un compte sans gare (superviseur) ou
sans compagnie (patron) est refusé : jamais « tout ». Attributions et contrôles sont écrits au journal
d'audit (`numerotation.plage_attribuee`, `numerotation.plage_liberee`, `numerotation.controle`).

Les trois planches du ticket (`CadenceBillet`, `SuperviseurDebloquer`, `RapportSoir`) agrègent des
données d'autres tickets (billets, caisse, départs) : ces routes ne sont pas dans ce périmètre. Les
morceaux de numérotation qu'elles affichent sont prêts et suivent les schémas des contrats :
`recapitulatif.plageSansTrou` (CadenceBillet) = `ResumeAppareil.plageSansTrou` ; `enAttente.plage`
`{ debut, fin, trous }` (SuperviseurDebloquer) = `ResumeAppareil.plage` + `billets.trous`
(testé contre `SchemaSuperviseurAppareil`) ; le rapport du soir lit `GET /numerotation/alertes`.

## Brancher sur la synchronisation (hors périmètre : `apps/api/src/sync/**`)

`RejeuService` (AM-160) reçoit `ControleNumeros` et `AttributionPlages` par injection : il n'a pas à
changer. Dans `sync/sync.module.ts`, importer `NumerotationModule` et retirer les deux fournisseurs en
mémoire :

```ts
import { NumerotationModule } from "../numerotation/numerotation.module";

@Module({
  imports: [NumerotationModule],
  controllers: [SyncController],
  providers: [
    // … inchangés …
    // retirer : { provide: ControleNumeros, useClass: ControleNumerosMemoire },
    // retirer : { provide: AttributionPlages, useClass: AttributionPlagesParRang },
  ],
  exports: [
    // … inchangés, sauf ControleNumeros et AttributionPlages, remplacés par :
    NumerotationModule, // Nest ne réexporte pas un jeton importé : on réexporte le module
  ],
})
export class SyncModule {}
```

`NumerotationModule` n'a pas besoin d'être importé dans `AppModule` : `SyncModule` l'importe, ses
routes `/numerotation/**` sont montées une fois. `testing/app-numerotation-test.ts` contient
`SyncAvecNumerotation`, le `SyncModule` ainsi modifié, et `sync.numerotation.test.ts` fait passer de
vrais lots signés par `POST /sync/evenements` : plage de l'attribution (pas celle de la fiche),
doublon entre deux guichets de la gare, hors plage, rejeu, trou puis alerte refermée.

Le garde-fou de la synchronisation (`VerificationStockageSync`) lit `ControleNumerosServeur.durable`,
vrai seulement quand le registre et les plages sont durables.

**Ordre de préférence de la plage d'un appareil** (`AttributionPlagesServeur.plageDe`) : attribution
de l'administration (`PUT …/plage`) > `AppareilSync.plage` > plan de numérotation (genre et rang de
la fiche). Un appareil jamais attribué fonctionne donc, mais n'est comparé qu'à lui-même (pas de
doublon entre appareils) et le contrôle de fin de journée ne le voit pas : **attribuer chaque appareil
à l'enrôlement** (AM-093, AM-120 : `PlagesService.attribuer`).

## Numéros en ligne (4001–9999)

`NumerotationService.prendreEnLigne({ gareId, compagnieId, genre, at, reference })` rend le plus petit
numéro libre de la plage du serveur pour la gare, le jour (Douala) et le genre. **Idempotent par
`reference`** (l'identifiant du billet ou du colis) : un réessai après erreur réseau rend le même
numéro. Épuisement : `NumerosEnLigneEpuises`. Pour qu'une vente qui échoue ne laisse pas de trou, le
module qui vend en ligne doit écrire le billet **dans la même transaction** que la prise du numéro
(une annulation après coup garde son numéro, comme au guichet). Le contrôle de fin de journée vérifie
aussi cette plage.

## Contrôle de fin de journée

`POST /numerotation/controles` (ou `ControleJourneeService.controler`) à lancer après les
synchronisations du soir (le rapport de 21 h). Pour chaque plage attribuée et chaque genre, il
compare les numéros reçus à la plage. Un trou crée une alerte `trou_dans_la_plage` (même forme que
`AlerteSync`) : `auteurId` = le titulaire, `details` = jour, genre, plage, `numerosManquants`,
`dernierRecu`, `titulaire`, `message`. L'identifiant est déterministe : relancer met à jour l'alerte
(elle garde sa date de création), un trou comblé par une synchronisation tardive la referme, un
appareil libéré aussi. Seuls les numéros **avant** le plus grand numéro reçu comptent : un numéro
manquant en fin de plage ne se voit pas côté serveur (c'est le rôle du blocage de l'appareil, AM-160).
Aucun planificateur n'est fourni ici.

## Tables PostgreSQL à créer (hors périmètre : `apps/api/prisma/**`)

Les adaptateurs PostgreSQL ne sont pas écrits (la migration d'AM-017 n'a pas ces tables). Ils doivent
garder les mêmes garanties que la mémoire :

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Plages confiées aux appareils. Un appareil remplacé garde sa ligne (liberee_a renseigné).
CREATE TABLE plage_attribuee (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  appareil_id    text        NOT NULL,
  genre          text        NOT NULL CHECK (genre IN ('guichet', 'convoyeur')),
  rang           integer,
  nb_convoyeurs  integer,
  plage_debut    integer     NOT NULL CHECK (plage_debut BETWEEN 1 AND 9999),
  plage_fin      integer     NOT NULL CHECK (plage_fin BETWEEN plage_debut AND 4000),
  compagnie_id   uuid,
  gare_id        uuid,
  portee         text        NOT NULL,            -- 'gare:<compagnie>:<gare>' ou 'appareil:<id>'
  titulaire_id   uuid,
  titulaire_nom  text,
  attribuee_a    timestamptz NOT NULL,
  attribuee_par  uuid,
  liberee_a      timestamptz
);
CREATE UNIQUE INDEX plage_attribuee_appareil ON plage_attribuee (appareil_id) WHERE liberee_a IS NULL;
-- « Un numéro ne peut jamais être attribué deux fois » : deux plages en cours d'une même portée ne se recouvrent pas.
ALTER TABLE plage_attribuee ADD CONSTRAINT plage_attribuee_sans_chevauchement
  EXCLUDE USING gist (portee WITH =, int4range(plage_debut, plage_fin, '[]') WITH &&)
  WHERE (liberee_a IS NULL);

-- Registre des numéros reçus (déjà annoncé par le README de la synchronisation sous le nom numero_vu).
CREATE TABLE numero_vu (
  portee       text        NOT NULL,
  jour         char(6)     NOT NULL,              -- AAMMJJ, Douala
  genre        text        NOT NULL CHECK (genre IN ('billet', 'colis')),
  numero       integer     NOT NULL CHECK (numero BETWEEN 1 AND 9999),
  appareil_id  text        NOT NULL,              -- 'serveur-en-ligne' pour les ventes en ligne
  evenement_id text        NOT NULL,
  gare_id      uuid,
  compagnie_id uuid,
  recu_a       timestamptz NOT NULL,
  PRIMARY KEY (portee, jour, genre, numero)       -- l'index unique est la garantie
);
CREATE INDEX numero_vu_jour ON numero_vu (jour);
CREATE UNIQUE INDEX numero_vu_reference_serveur ON numero_vu (portee, jour, genre, evenement_id)
  WHERE appareil_id = 'serveur-en-ligne';
```

- `RegistreNumeros.reserver` : `INSERT … ON CONFLICT (portee, jour, genre, numero) DO NOTHING`, puis,
  si rien n'a été inséré, lire `evenement_id` de la ligne en place (même id = `rejeu`, sinon `doublon`).
- `RegistreNumeros.prendreSuivant` : dans une transaction, `pg_advisory_xact_lock(hashtext(portee || jour || genre))`,
  chercher la référence (`numero_vu_reference_serveur`), sinon insérer `COALESCE(MAX(numero) + 1, debut)`
  (refus au-delà de `fin`). Le verrou et le billet sont dans la même transaction pour ne pas laisser de trou.
- `PlagesAttribuees.attribuer` : dans une transaction, libérer la ligne en cours de l'appareil puis
  insérer la nouvelle ; la violation de la contrainte d'exclusion devient `{ ok: false, enConflitAvec }`
  (relire la ligne en conflit).
- `AlertesNumerotation` : la table `alerte_sync` d'AM-160 convient (mêmes colonnes, `id` unique pour
  l'upsert, type `trou_dans_la_plage`) ; filtrer le jour sur `details->>'jour'`.

## Limites et décisions à confirmer

- **Convoyeurs hors de leur gare.** Le plan donne 3001–3999 partagé par gare. Un convoyeur qui vend
  dans une autre gare imprime `AGENCE-GARE_DE_VENTE-AAMMJJ-NNNN` avec son NNNN : il peut croiser un
  convoyeur de cette gare. L'unicité est contrôlée par gare **d'attribution**, comme le plan. Si les
  convoyeurs vendent vraiment hors de leur gare, il faut des plages disjointes par compagnie.
- **Ré-attribution en cours de journée** : les numéros déjà émis dans l'ancienne plage et qui arrivent
  après le changement sont signalés « hors plage » (c'est voulu), mais restent au registre.
- **Un numéro hors plage entre au registre** : s'il tombe dans la plage d'un autre appareil de la gare,
  celui-ci sera signalé en doublon quand il sortira ce numéro. Les deux alertes nomment l'événement
  d'origine.

## Tests

`pnpm --filter @afrimove/api run test` : `numerotation.service.test.ts` (doublons, hors plage,
simultanéité, trous, compteur, numéros en ligne : ordre, idempotence, 100 ventes simultanées,
épuisement), `plages.service.test.ts` (plan du domaine, jamais de chevauchement pour 1 à 12
convoyeurs, secours, plage du serveur interdite), `controle-journee.test.ts` (alerte nominative,
rejeu, trou comblé, périmètre, secours), `numerotation.e2e.test.ts` (HTTP : rôles, périmètre, 400/403/404/409,
audit), `sync.numerotation.test.ts` (vrais lots signés avec `SyncAvecNumerotation`), `parite.test.ts`
(règles recopiées = domaine, plages = contrats).

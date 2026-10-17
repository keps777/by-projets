# Contrats colis et partenaires (AM-014)

Schémas zod et types des échanges d'API pour l'envoi de colis, les points relais, la livraison moto,
les inscriptions relais et livreur, l'inter-agences et le vendeur ambulant. Ce dossier est pur : il
ne dépend que de `zod` et de `@afrimove/domain`. Les opérations, les canaux, les hooks React et le
mock correspondants sont dans `packages/api-client/src/colis/`.

```ts
import { colis } from "@afrimove/contrats"; // schémas et types
import { colis as api } from "@afrimove/api-client"; // opérations, hooks, mock
```

## Conventions

- **Montants** : entiers en FCFA (`z.int()`), jamais de décimale. Un solde peut être négatif
  (`SchemaFcfa`), un prix ou un gain non (`SchemaFcfaPositif`).
- **Heures** : chaînes ISO exprimées en `Africa/Douala`, décalage `+01:00` (`SchemaIsoDouala`).
  Une date sans heure (le dernier voyage d'un client du vendeur) est à minuit.
- **Téléphones** : complets (`+237699401822`) pour l'expéditeur et le destinataire ; masqués
  (`6 71 …`) pour tout partenaire.
- **Photos** : une `SchemaRefPhoto` est la référence d'une photo déjà téléversée ; le téléversement
  n'est pas dans ce périmètre.

## Règle de sécurité : le code de retrait

Le code de retrait (6 chiffres) apparaît **uniquement** dans les réponses destinées à l'expéditeur
et au destinataire :

| Réponse             | Contrat                   | Code ? |
| ------------------- | ------------------------- | ------ |
| Colis créé et payé  | `SchemaColisCree`         | oui    |
| Colis (code, suivi) | `SchemaColisProprietaire` | oui    |
| Livraison en cours  | `SchemaLivraisonColis`    | oui    |
| Tout le reste       | schémas `strictObject`    | non    |

Tout ce qui part au guichet, à un point relais, à un livreur ou à une compagnie partenaire
(`SchemaColisPartenaire`, `SchemaEspaceRelais`, `SchemaMissionLivraison`, `SchemaInterAgences`,
`SchemaTransfertEnregistre`…) est déclaré en `z.strictObject` : un champ en trop (`codeRetrait`,
`codeRetraitHache`, `code`…) fait échouer la validation de la réponse (`ErreurValidation`) au lieu
d'être supprimé en silence. Le seul signe du code côté partenaire est `codeRequis: true` (« remise
contre code + pièce »). Le partenaire envoie le code que le client lui donne dans la **requête** de
remise (`SchemaRemiseColisRelais`, `SchemaRemiseColisLivreur`) ; le serveur le compare au haché du
domaine (`verifierCodeRetrait`), compte les essais (3, puis le colis est bloqué) et ne répète jamais
le code dans une erreur.

`fuitesCodeRetrait(valeur, codes?)` (`securite.ts`) cherche une fuite dans n'importe quelle valeur
JSON : champs interdits, et chiffres du code dans un texte. Les tests de l'api-client l'appliquent à
chaque réponse partenaire de chaque planche.

**Guichet** : les écrans guichet colis (AM-073 `GuichetColis`, AM-074 `Depot`) sont dans un autre
périmètre. Ils doivent réutiliser `SchemaColisPartenaire` pour tout colis qu'ils affichent, et ne
jamais élargir ce schéma.

## Écran → hooks

Les hooks sont exportés par `@afrimove/api-client` (`colis.useColis`, …). Chaque ligne donne la
planche, la route, les hooks de lecture (L), d'écriture (E) ou de temps réel (T), et le contrat de
réponse. Une écriture recharge les lectures qu'elle rend périmées.

| Planche                        | Route                                               | Hooks                                                                                                                                                                                                                                           | Contrats                                                                                                                                                                |
| ------------------------------ | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ColisEnvoi` (13)              | `/(voyageur)/colis`                                 | L `useOptionsEnvoiColis` · L `useDevisColis` · E `useEstimerPhotoColis` · E `useCreerColis`                                                                                                                                                     | `SchemaOptionsEnvoiColis`, `SchemaDevisColis`, `SchemaEstimationPhoto`, `SchemaColisCree`                                                                               |
| `ColisCode` (14)               | `/(voyageur)/colis/[colisId]`                       | L `useColis` · E `useEnvoyerCodeColis` · E `useReclamerColis` · E `useChangerModeColis` · T `useSuiviColisEnDirect`                                                                                                                             | `SchemaColisProprietaire`, `SchemaAccuseEnvoiCode`, `SchemaReclamationOuverte`, `SchemaModeChange`, `SchemaMessageSuiviColis`                                           |
| `Relais` (15)                  | `/(voyageur)/colis/[colisId]/relais`                | L `useRelaisProches` · E `useChoisirRelais`                                                                                                                                                                                                     | `SchemaRelaisProches`, `SchemaRelaisChoisi`                                                                                                                             |
| `Livraison` (16)               | `/(voyageur)/colis/[colisId]/livraison`             | L `useLivraisonColis` · E `usePartagerSuiviLivraison` · E `useChangerAdresseLivraison` · T `usePositionLivreur`                                                                                                                                 | `SchemaLivraisonColis`, `SchemaSuiviPartage`, `SchemaAdresseChangee`, `SchemaPositionLivreur`                                                                           |
| `RelaisApp` (38)               | `/(relais)/accueil`                                 | L `useEspaceRelais` · L `useColisRelais` · E `useRecevoirColisRelais` · E `useRemettreColisRelais`                                                                                                                                              | `SchemaEspaceRelais`, `SchemaColisPartenaire`, `SchemaColisRecuRelais`, `SchemaColisRemisRelais`                                                                        |
| `Livreur` (39)                 | `/(livreur)/accueil`                                | L `useEspaceLivreur` · T `useMissionsEnDirect` · E `useDisponibiliteLivreur` · E `useAccepterMission` · E `usePasserMission` · E `useRemettreColisLivreur` · E `useSignalerAbsenceLivreur` · E `useRetirerGainsLivreur` · E `useInviterLivreur` | `SchemaEspaceLivreur`, `SchemaMissionLivraison`, `SchemaMessageMissions`, `SchemaMissionAcceptee`, `SchemaColisLivre`, `SchemaAbsenceEnregistree`, `SchemaRetraitGains` |
| `RelaisDevenir` (22b)          | `/(voyageur)/moi/devenir-relais`                    | L `useProgrammeRelais`                                                                                                                                                                                                                          | `SchemaProgrammeRelais`                                                                                                                                                 |
| `RelaisInscription` (22c)      | `/(voyageur)/moi/devenir-relais/fiche`              | L `useFormulaireRelais` · E `useEnregistrerBrouillonRelais` · E `useEnvoyerFicheRelais`                                                                                                                                                         | `SchemaFormulaireRelais`, `SchemaFicheRelais`, `SchemaDemandeDeposee`                                                                                                   |
| `RelaisVerification` (22d)     | `/(voyageur)/moi/devenir-relais/suivi`              | L `useSuiviDemandeRelais`                                                                                                                                                                                                                       | `SchemaSuiviDemande` (`type: "relais"`)                                                                                                                                 |
| `LivreurDevenir` (23b)         | `/(voyageur)/moi/devenir-livreur`                   | L `useProgrammeLivreur` · E `useDeposerDemandeLivreur`                                                                                                                                                                                          | `SchemaProgrammeLivreur`, `SchemaDemandeLivreur`, `SchemaDemandeDeposee`                                                                                                |
| `LivreurVerification` (23c)    | `/(voyageur)/moi/devenir-livreur/suivi`             | L `useSuiviDemandeLivreur`                                                                                                                                                                                                                      | `SchemaSuiviDemande` (`type: "livreur"`)                                                                                                                                |
| `InterAgences` (37)            | `/(patron)/inter-agences`                           | L `useInterAgences` · L `useReglementInterAgences` · E `useContesterReglement` · E `useScannerTransfertColis` · E `useInviterCompagnie`                                                                                                         | `SchemaInterAgences`, `SchemaReglementHebdo`, `SchemaContestationEnregistree`, `SchemaTransfertEnregistre`                                                              |
| `InterAgencesConvention` (37b) | `/(patron)/inter-agences/convention/[conventionId]` | L `useConventionInterAgences`                                                                                                                                                                                                                   | `SchemaConvention`                                                                                                                                                      |
| `Vendeur` (41)                 | `/(vendeur)/accueil`                                | L `useEspaceVendeur` · L `useDepartsVendeur` · L `useClientsVendeur` · E `useVendreBilletVendeur`                                                                                                                                               | `SchemaEspaceVendeur`, `SchemaDepartsVendeur`, `SchemaClientsVendeur`, `SchemaBilletVendu`                                                                              |

Les planches 22b à 23c et 37b ne figurent pas dans la liste `ecrans` du ticket AM-014, mais sa
description couvre « inscriptions relais et livreur » et la convention inter-agences : leurs hooks
sont ici, et leurs tickets d'écran (AM-141 à AM-146, AM-133) les consomment. Les routes viennent de
`PLANCHES` dans `@afrimove/fixtures`.

### Parcours « envoyer un colis »

1. `useOptionsEnvoiColis()` : destinataire suggéré, départs, modes (gare, relais +300 F, moto dès
   1 000 F), assurance (2 %, minimum 500 F, plafond 500 000 F).
2. `useEstimerPhotoColis()` à la prise de photo, puis `useDevisColis({ departId, mode, valeurAssuree })`
   à chaque changement de mode ou de valeur : le total est la somme exacte des lignes du domaine.
3. `useCreerColis()` (« Payer et obtenir le code ») : la réponse porte `colis.retrait.code`, pour
   l'expéditeur seul.
4. `ColisCode` : `useColis(colisId)`, `useEnvoyerCodeColis()` (accusé sans le code),
   `useChangerModeColis()` pour « Faire livrer chez elle » (puis `Livraison`) ou « Déposer en
   relais » (puis `Relais`).

## Mock : `installerMockColis`

Exporté par `packages/api-client/src/colis/` (donc par `@afrimove/api-client`, `colis.installerMockColis`).

```ts
import { colis } from "@afrimove/api-client";
import { ecrans } from "@afrimove/fixtures";

const source: SourceScenarios = {
  noms: () => Object.keys(ecrans),
  instantInitial: (nom) => ecrans[nom].maintenant, // l'horloge du client suit la planche
  charger(nom) {
    const scenario = { nom, operations: [], flux: [] }; // ScenarioEnConstruction
    colis.installerMockColis(scenario, ecrans[nom]); // domaine colis et partenaires
    // installerMockAgence(scenario, ecrans[nom]); … les autres domaines
    return scenario; // un Scenario valide
  },
};
```

Contrat pour le composeur central :

- **Entrée** : `scenario` est un `ScenarioEnConstruction` (`{ nom, operations: ImplementationMock[],
flux: FluxMock[] }`) que le composeur crée vide et passe à chaque `installerMock<Domaine>`.
  `donneesScenario` est le scénario de planche de `@afrimove/fixtures` tel quel (`ecrans[nom]`).
- **Effet** : ajoute à `scenario.operations` et `scenario.flux` les implémentations de la planche
  (`PLANCHES_COLIS` : `ColisEnvoi`, `ColisCode`, `Relais`, `Livraison`, `RelaisApp`, `Livreur`,
  `RelaisDevenir`, `RelaisInscription`, `RelaisVerification`, `LivreurDevenir`,
  `LivreurVerification`, `InterAgences`, `InterAgencesConvention`, `Vendeur`). Une autre planche est
  ignorée : l'appel ne fait rien et renvoie `false` (`true` sinon). Deux appels pour la même
  planche ajouteraient deux fois les mêmes opérations : un appel par planche et par `charger`.
- **État** : les données muables (colis créés, essais de code, mission, bilans, places) vivent dans
  la fermeture installée. Appeler `installerMockColis` dans `charger`, donc une fois par client, suffit
  à garder un état propre à chaque client.
- **Horloge** : les lectures reflètent l'heure de la planche (`donnees.maintenant`) ; les écritures
  horodatent avec `ctx.horloge`. `instantInitial: (nom) => ecrans[nom].maintenant` aligne les deux.
  Sans cela, seuls les horodatages des écritures et le délai de 30 s des missions suivent l'heure
  réelle.
- **Dépendances** : le mock ne lit que ce que lui passe `donneesScenario` (importé en type seulement
  depuis `@afrimove/fixtures`) et `@afrimove/domain` (machines d'états, `verifierCodeRetrait`,
  tarifs). Il n'importe aucune valeur de `@afrimove/fixtures`.
- **Sécurité** : toute opération destinée à un partenaire est installée avec un garde-fou qui refuse
  une réponse portant un champ de code de retrait, en plus de la validation `strictObject`.

### Ce que fait le mock, planche par planche

- `ColisEnvoi` : devis du domaine (`devisColis`), création d'un colis (numéro de la plage en ligne
  4001–9999, code et haché émis par `emettreCodeRetrait`), relecture par `useColis`.
- `ColisCode`, `Livraison` : le colis de Maman ; code `482913`. Un `colisId` inconnu répond 404
  (`colis_introuvable`) ; l'identifiant du scénario est `ecrans.ColisCode.donnees.retrait._colisId`.
- `RelaisApp` : remise via `remettreColis` du domaine ; code faux → 422 `code_invalide` avec
  `details.essaisRestants` ; trois essais faux → 423 `code_bloque`, y compris avec le bon code ensuite.
  Après une remise : 6 colis en garde, 8 600 F de gain, 43 remis dans la semaine.
- `Livreur` : proposition valable 30 s à partir du premier appel du client (410 `mission_expiree`
  ensuite), acceptation (`mettre_en_livraison`), remise contre code (`livrer`), retrait de gains dès
  5 000 F (422 `seuil_non_atteint` sinon).
- `InterAgences` : règlement du lundi 08:00 (solde net 12 300 F), contestation possible jusqu'au
  dimanche 20:00, scans de transfert (`remis_a` garde la responsabilité au cédant, `recu` la donne au
  preneur).
- `Vendeur` : départs de demain, vente au nom du voisin, places et bilan mis à jour.

## Tests

```sh
pnpm --filter @afrimove/contrats run test
pnpm --filter @afrimove/api-client run test
```

- `colis.test.ts` (ici) : formats, entiers FCFA, ISO Douala, strictesse des schémas partenaire,
  `fuitesCodeRetrait`.
- `packages/api-client/src/colis/planches.test.tsx` : un bloc par planche ; les hooks de la planche
  renvoient les données du scénario.
- `packages/api-client/src/colis/securite.test.ts` : le code n'apparaît dans aucune réponse partenaire
  (ni son haché ni son sel), ni dans un message temps réel, ni dans une erreur ; chaque opération
  déclarée est classée « propriétaire » ou balayée, donc une opération ajoutée sans choix fait
  échouer le test.

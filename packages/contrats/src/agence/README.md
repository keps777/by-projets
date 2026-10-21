# Contrats de l'agence (AM-015)

Guichet, caisse, quai, bus, supervision : les schémas zod (et leurs types) de tout ce que les
écrans de l'agence lisent et écrivent. Ce dossier est **pur** : aucun accès réseau, aucune
horloge, aucun état. Les opérations, les hooks React et le mock vivent dans
`packages/api-client/src/agence/` ; ils sont écrits au-dessus de ces schémas.

Import : `import { agence as c } from "@afrimove/contrats"`, puis `c.SchemaVenteContexte`, `c.VenteContexte`, `c.lireEvenementAgence`…

## Fichiers

| Fichier          | Contenu                                                                     |
| ---------------- | --------------------------------------------------------------------------- |
| `commun.ts`      | Briques partagées : identifiants, FCFA, heures Douala, paiement, synchro    |
| `evenements.ts`  | `definirEvenement`, enveloppe commune, accusé de réception                  |
| `registre.ts`    | `EVENEMENTS_AGENCE` (34 types), `lireEvenementAgence(brut)`                 |
| `guichet.ts`     | Accueil du guichet                                                          |
| `vente.ts`       | Vente classique, vente à la cadence, billet de cadence                      |
| `colis.ts`       | Enregistrement d'un colis, dépôt d'un colis prépayé                         |
| `impression.ts`  | État de l'imprimante, demande d'impression                                  |
| `quai.ts`        | Embarquement, scan, saisie du code, cadence du quai, messages temps réel    |
| `bus.ts`         | Convoyeur, chauffeur, contrôleur inopiné                                    |
| `caisse.ts`      | Session de caisse : ouverture, comptage, clôture                            |
| `supervision.ts` | Gare, clôture à valider, annulation, équipe, appareils, messages temps réel |
| `journal.ts`     | Journal signé                                                               |

## Règles communes

- **Montants** : entiers FCFA (`SchemaFcfa`, `SchemaFcfaPositif`), jamais de décimales.
- **Heures** : ISO 8601 avec le décalage de Douala, `2027-01-05T08:30:00.000+01:00`
  (`SchemaIsoDouala`). Les durées sont en minutes ou en secondes, le nom du champ le dit.
- **Téléphones** : format international `+2376…` (`SchemaTelephone`).
- **Le PIN ne voyage jamais.** Une action de supervision porte une `ValidationSuperviseur`
  (`superviseurId` + signature + heure), produite sur l'appareil après saisie du PIN. Un PIN
  provisoire part par SMS ; la lecture ne montre que `pin: "ok" | "a_renouveler" | "bloque"`.

## Les écritures sont des événements (compatibles hors ligne, AM-160)

Toute écriture de l'agence est un **événement** : une enveloppe commune + des `donnees` propres au
type. Le registre (`EVENEMENTS_AGENCE`) liste les 34 types ; `lireEvenementAgence(brut)` valide
un événement quelconque et renvoie `{ ok: true, type, evenement }` ou `{ ok: false, erreur, details? }`.

Enveloppe (`EvenementAgence`, un schéma complet par type) :

| Champ         | Règle                                                                               |
| ------------- | ----------------------------------------------------------------------------------- |
| `id`          | **UUID créé sur l'appareil**, avant tout envoi. C'est la clé d'idempotence.         |
| `type`        | Un des 34 types (`billet.vendu`, `quai.scanne`, `caisse.cloturee`, …).              |
| `at`          | Heure de l'appareil au moment du geste, ISO Douala.                                 |
| `appareilId`  | L'appareil qui a créé l'événement.                                                  |
| `auteurId`    | La personne connectée (PIN saisi au début de session).                              |
| `cible`       | `{ type, id }` : le billet, le colis, la session de caisse… concernés.              |
| `numeroPlage` | Entier pris dans la **plage de l'appareil** pour les types numérotés, sinon `null`. |
| `donnees`     | Propres au type (validées par son schéma).                                          |

- **Numéro de plage.** Chaque guichet reçoit une plage disjointe (guichet 2 : 1001 à 1999, voir
  `plageGuichet` dans `@afrimove/domain`). Les cinq types numérotés (`TYPES_EVENEMENT_NUMEROTES`)
  consomment un numéro, un par un, sans trou : `billet.vendu`, `billet.vendu_cadence`,
  `colis.enregistre`, `controle.regularise`, `route.billet_vendu`. Le numéro de document affiché
  (`ALP-DLA-270105-1001`, `C-DLA-270105-1001`) est calculé par le domaine à partir de ce numéro ;
  deux appareils hors ligne ne peuvent donc jamais produire le même billet. Les billets ont leur
  compteur, les colis le leur, dans la même plage ; ils repartent à zéro le lendemain.
- **Idempotence.** Rejouer un événement (même `id`) ne refait rien : le serveur répond
  `statut: "deja_recu"` dans l'accusé (`SchemaAccuse`), avec la même réponse métier.
- **Création sur l'appareil.** Côté client, `creerAppareilAgence(...)` (`api-client`) fabrique
  l'enveloppe ; aucun hook n'accepte un `id` ou un `numeroPlage` de l'extérieur.
- **Refus métier.** Siège pris : 409 `SIEGE_PRIS` ; paiement incohérent : 422 `PAIEMENT_INVALIDE` ;
  action sans superviseur : 403 `SUPERVISEUR_REQUIS` ; transition d'état interdite : 409
  `TRANSITION_INTERDITE` ; ressource inconnue : 404.

## Écran → hooks

Les noms de planche sont ceux de `@afrimove/fixtures` (`ecrans`). Tous les hooks sont exportés par
`@afrimove/api-client` (`agence`). Les hooks de lecture sont des requêtes TanStack
(`useRequete`) ; les hooks d'écriture renvoient une mutation dont `mutate(donnees)` reçoit les
**données** de l'événement (l'enveloppe est créée par l'appareil, voir plus haut) et rechargent
ensuite les lectures de l'agence.

| Planche (n°)                 | Lecture                                              | Écritures                                                                                     | Temps réel      |
| ---------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------- |
| `Guichet` (18)               | `useGuichetAccueil`                                  |                                                                                               |                 |
| `Vente` (19)                 | `useVenteContexte`, `useImpressionEtat`              | `useVendreBillet`, `useImprimer`                                                              |                 |
| `Cadence` (20)               | `useCadenceEtat`, `useImpressionEtat`                | `useVendreBilletCadence`, `useAjouterTelephoneBillet`, `useDemanderAnnulation`, `useImprimer` |                 |
| `CadenceBillet` (20b)        | `useCadenceBillet(billetId)`                         | `useAjouterTelephoneBillet`, `useDemanderAnnulation`, `useImprimer`                           |                 |
| `CadenceQuai` (20c)          | `useQuaiCadence`                                     | `useScannerAuQuai`, `useCompleterBillet`                                                      |                 |
| `GuichetColis` (21)          | `useColisFormulaire`, `useImpressionEtat`            | `useEnregistrerColis`, `useImprimer`                                                          |                 |
| `Depot` (22)                 | `useColisDepot(code)`                                | `useAccepterDepotColis`, `useImprimer`                                                        |                 |
| `Quai` (23)                  | `useQuaiEmbarquement`                                | `useScannerAuQuai`, `useSaisirCodeBillet`, `useLibererSiege`, `useEnvoyerListeAuChauffeur`    | `useQuaiDirect` |
| `Convoyeur` (24)             | `useConvoyeurEtat`                                   | `useVendreEnRoute`, `useScannerEnRoute`, `useDechargerColis`                                  |                 |
| `Chauffeur` (25)             | `useChauffeurFeuille`                                | `useAjouterDepense`, `useDeclarerIncident`, `useDeclarerRetard`, `useArriveeArret`            |                 |
| `Controleur` (26)            | `useControleInopine`                                 | `useVerifierSiege`, `useRegulariserVoyageur`, `useSignalerConvoyeur`, `useCloreControle`      |                 |
| `Caisse` (27)                | `useCaisseSession`                                   | `useOuvrirCaisse`, `useCompterCaisse`, `useCloturerCaisse`                                    |                 |
| `Superviseur` (28)           | `useSuperviseurGare`, `useJournal`                   |                                                                                               | `useGareDirect` |
| `SuperviseurValider` (28b)   | `useSuperviseurCloture(sessionId)`                   | `useValiderCloture`, `useRefuserCloture`                                                      |                 |
| `SuperviseurVoir` (28c)      | `useSuperviseurAnnulation(demandeId)`                | `useDeciderAnnulation`                                                                        |                 |
| `SuperviseurEquipe` (28d)    | `useSuperviseurEquipe`, `useJournal({ personneId })` | `useRenouvelerPin`, `useChangerAffectation`, `useDesactiverCompte`, `useDebloquerPersonne`    |                 |
| `SuperviseurDebloquer` (28e) | `useSuperviseurAppareil(appareilId)`                 | `useDebloquerAppareil`                                                                        |                 |

`useAppareilAgence()` donne l'appareil courant (`FournisseurAppareilAgence` ; sans fournisseur,
le mock fournit l'appareil de démonstration : guichet 2 de Douala, Joseph). Les hooks d'écriture
sont tous construits par `useEcritureAgence(ECRITURES.<nom>)`.

## Le mock : `installerMockAgence(scenario, donneesScenario)`

Rend chaque planche affichable sans backend. Les réponses sont **déduites des fixtures**
(`@afrimove/fixtures`, textes de maquette lus par regex) : les hooks de lecture renvoient donc
exactement ce que la planche affiche. Les écritures mutent un état local à la planche
(la vente retire un siège, avance la séquence, vide le brouillon ; la clôture validée ne peut
plus être validée…), de sorte qu'un parcours se rejoue de bout en bout.

Contrat, pour le composeur central de scénarios :

```ts
import { installerMockAgence } from "@afrimove/api-client";
import { ecrans } from "@afrimove/fixtures";

const source: SourceScenarios = {
  noms: () => Object.keys(ecrans),
  instantInitial: (nom) => ecrans[nom].maintenant,
  charger: (nom) => {
    const scenario = { nom, operations: [], flux: [] }; // neuf à chaque appel
    installerMockAgence(scenario, ecrans[nom]); // puis les installateurs des autres domaines
    return scenario;
  },
};
```

- À appeler **à chaque** `charger(nom)` sur un **scénario neuf** : l'état mutable des écritures
  vit dans des fermetures créées par l'appel, et chaque client doit repartir de l'état de la planche.
- Renvoie `true` si la planche est de l'agence (`estPlancheAgence`) et installe alors ses
  opérations (`scenario.operations`) et ses canaux (`scenario.flux`) ; renvoie `false`, sans rien
  toucher, pour une planche d'un autre domaine. Le composeur peut donc appeler tous les domaines.
- Une opération du même nom déjà présente dans `scenario.operations` est remplacée.
- Ne lit que `donneesScenario` : pas d'horloge propre (le temps vient de l'horloge du client mock),
  pas de réseau, pas d'état global.
- Les 17 planches : `PLANCHES_AGENCE`. Un test par planche (`planches.test.tsx`) vérifie que les
  hooks renvoient les données du scénario ; `ecritures.test.tsx` et `appareil.test.tsx` couvrent
  les événements (UUID, plage, idempotence, refus métier).
- Les lectures qui prennent un paramètre (`useCadenceBillet`, `useColisDepot`,
  `useSuperviseurCloture`, `useSuperviseurAnnulation`, `useSuperviseurAppareil`) répondent 404 si
  l'identifiant n'est pas celui du scénario ; les identifiants des demandes sont calculés par
  `idDemandeAnnulation` / `idDemandeCloture`.

## Points douteux

- **Plan de siège de la vente** : le plan vient de la liste d'états de la planche (libre, pris,
  proposé…) ; les numéros de siège sont attribués dans l'ordre, ce qui peut différer du plan réel du
  bus.
- **Statut `deja_recu`** : le mock ne garde les UUID vus que pendant la vie du scénario ; le vrai
  serveur devra les garder durablement (AM-160).
- **Enveloppe des événements** : les champs `cible` et `numeroPlage` sont posés par l'appareil ;
  si AM-160 retient une autre forme de file d'envoi, seul `evenements.ts` et `appareil.tsx`
  sont à adapter, pas les schémas métier.
- **Numéro des colis** : `numeroColis` du domaine produit `C-DLA-AAMMJJ-NNNN` (sans l'agence),
  alors que les fixtures du dépôt affichent `C-ALP-DLA-…` ; le mock rend le numéro des fixtures
  pour la lecture et celui du domaine pour les nouveaux colis.
- **Heure de déblocage 4 h** : calculée par `debloquerTemporairement` du domaine (arrondie),
  pas à la minute près.

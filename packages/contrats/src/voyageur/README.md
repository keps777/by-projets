# Contrats voyageur (AM-013)

Schémas zod et types de l'app voyageur : compte, départs, billets, paiements, covoiturage, services. Ce dossier est pur (zod et rien d'autre). Les opérations (`definirOperation`), les canaux temps réel (`definirCanal`), les hooks React et l'adaptateur mock sont dans `packages/api-client/src/voyageur/`.

```ts
import { voyageur } from "@afrimove/contrats"; // schémas et types : voyageur.Commande, voyageur.SchemaCommande…
import { voyageur as api } from "@afrimove/api-client"; // opérations, canaux, hooks, mock
```

## Conventions

- **Montants** : entiers en FCFA (`SchemaFcfa`, `SchemaFcfaPositif`). Un montant décimal est refusé. La seule exception est la conversion en devise étrangère (`SchemaConversion`) : unité mineure entière (1290 = 12,90 $ CA), toujours `approximatif`.
- **Heures** : chaînes ISO 8601 avec le décalage `+01:00` d'Africa/Douala (`SchemaIsoDouala`, ex. `2027-01-05T08:00:00.000+01:00`). Une heure en UTC (`Z`), sans fuseau ou à un autre décalage est refusée. Les jours calendaires sont `AAAA-MM-JJ` (`SchemaJour`), les heures du jour d'un trajet régulier `HH:MM`. Le serveur et le mock calculent tous les « dans N min » : l'écran affiche la différence avec `maintenant` de la réponse.
- **Téléphones** : format international sans espace (`+237691221008`).
- **Identifiants** : opaques (`SchemaId`).
- **Noms** : `Schema<Nom>` (zod) et `<Nom>` (type) ; les opérations sont `OP_<NOM>`, les canaux `CANAL_<NOM>`, les hooks `use<Nom>`.

## Fichiers

| Fichier           | Contenu                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| `commun.ts`       | FCFA, ISO Douala, téléphone, classe, ville, devis, conversion, moyens de paiement                      |
| `compte.ts`       | connexion par code, profil, fidélité, parrainage, proches, historique                                  |
| `departs.ts`      | recherche (entre villes, même ville), filtres, détail d'un départ, plan de sièges et blocage, commande |
| `billets.ts`      | commande, paiement (MoMo, Orange Money, carte, lien pour un proche), billet, annulation et report      |
| `suivi.ts`        | bus en direct, prévenir un proche, réseau, monter en route, course moto ou taxi                        |
| `groupe.ts`       | groupe, bus entier, cagnotte                                                                           |
| `covoit.ts`       | recherche, réservation, publication, demandes de passagers, trajet régulier en ville                   |
| `sansInternet.ts` | aperçu USSD et WhatsApp                                                                                |

## Écran → hooks

Tous les hooks sont exportés par `@afrimove/api-client` (`voyageur.useXxx`). Les lectures `useXxx(params, options?)` renvoient un résultat TanStack Query (`data`, `isPending`, `error`) ; les écritures `useXxx()` renvoient une mutation (`mutate`, `mutateAsync`, `data`, `isPending`, `error`) et rafraîchissent les lectures qu'elles modifient. Les montants et les heures arrivent déjà au bon format : l'écran ne fait que les mettre en forme (« 7 500 F », « 08:00 »).

| Planche (route)                                           | Hooks                                                                                                                                                                                                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Connexion` (`/connexion`)                                | `useDemanderCode` (SMS, WhatsApp ou USSD), `useVerifierCode` (renvoie la session et le profil)                                                                                                                                             |
| `Main` · accueil (`/(voyageur)/voyager`)                  | `useProfil` (salutation), `useRechercheDeparts({ depart, arrivee, jour?, filtres? })` : départs, covoiturage, totaux du réseau, notification de colis, position détectée                                                                   |
| `MainVille` · même ville (`/(voyageur)/voyager/ville`)    | `useProfil`, `useRechercheVille({ ville, depart?, arrivee?, quand?, types? })` : ville détectée, itinéraire, offres covoiturage, moto-taxi et bus de ville                                                                                 |
| `MainFiltres` · filtres (`/(voyageur)/voyager/filtres`)   | `useOptionsFiltres` (classes, compagnies, préférées, options), `useEnregistrerFiltres` (mémorisé pour le trajet), `useDefinirPreferee` (étoile d'une compagnie)                                                                            |
| `SiegePay` (`/(voyageur)/depart/[departId]`)              | `useDetailDepart`, `usePlanSiegesTempsReel` (ou `usePlanSieges`), `useBloquerSiege` (15 min), `useDevis` (frais et code promo), `useMoyensPaiement`, `useProfil` (voyageur), `useCreerCommande` (`pour: "moi" \| "proche" \| "plusieurs"`) |
| `Paiement` (`/(voyageur)/paiement/[commandeId]`)          | `useCommande`, `useMoyensPaiement`, `usePayerCommande` (MoMo push, Orange Money, carte), `useStatutPaiement` (relève toutes les 3 s) ou `useStatutPaiementEnDirect` (temps réel), `useLienProche` (« demander à un proche de payer »)      |
| `Pass` · billet (`/(voyageur)/billet/[billetId]`)         | `useBillet` (QR, code à 4 chiffres, moto proposée), `useApercuAnnulation` (gratuite, retenue, remboursement), `useAnnulerBillet`, `useReporterBillet`                                                                                      |
| `Direct` (`/(voyageur)/billet/[billetId]/direct`)         | `useSuiviBus` (arrivée estimée, étapes), `usePositionBus` (temps réel), `useProches`, `usePrevenirProche`                                                                                                                                  |
| `Reseau` (`/(voyageur)/reseau`)                           | `useReseau({ filtre? })` : compagnies, bus en route, lignes et prochains départs                                                                                                                                                           |
| `Covoit` (`/(voyageur)/covoit`)                           | `useRechercheCovoit({ depart, arrivee, filtres?, prixMax? })`, `useReserverCovoit` (renvoie la commande à payer dans `Paiement`)                                                                                                           |
| `CovoitVille` (`/(voyageur)/covoit/ville`)                | `useRechercheVille`, `useTrajetRegulier`, `useDefinirTrajetRegulier`                                                                                                                                                                       |
| `CovoitConducteur` (`/(voyageur)/covoit/conducteur`)      | `useMesTrajetsCovoit` (résumé, trajets publiés, demandes), `useProposerADemande`, `usePublierTrajet`                                                                                                                                       |
| `Conducteur` (`/(voyageur)/covoit/proposer`)              | `useFormulairePublication` (valeurs par défaut, prix conseillé, options), `usePublierTrajet`                                                                                                                                               |
| `Course` (`/(voyageur)/course`)                           | `usePropositionCourse({ billetId })`, `useReserverCourse`                                                                                                                                                                                  |
| `Arret` · monter en route (`/(voyageur)/monter-en-route`) | `useOffresMonteeEnRoute` (bus qui passent, prix au prorata), `useReserverMontee` (renvoie la commande à payer)                                                                                                                             |
| `Groupe` (`/(voyageur)/groupe`)                           | `useGroupe`, `useCreerGroupe` (groupe, bus entier, cagnotte), `useInviterGroupe` (liens de paiement), `useDevisBus` (bus de 30), `useCreerCommande` (payer ma part ou tout le groupe)                                                      |
| `USSD` · sans internet (`/(voyageur)/sans-internet`)      | `useApercuSansInternet`                                                                                                                                                                                                                    |
| `Moi` (`/(voyageur)/moi`)                                 | `useProfil`, `useFidelite`, `useParrainage`, `useProches`, `useAjouterProche`, `useHistorique` (voyages et colis)                                                                                                                          |
| `Proche` (`/(voyageur)/proche`)                           | `useProches`, `useRechercheDeparts`, `useDetailDepart`, `useDevis`, `useCreerCommande({ pour: "proche", procheId, devise: "CAD" })` : la commande porte la `conversion` en devise                                                          |

Hors de ce ticket : les planches colis (`ColisEnvoi`, `ColisCode`, `Relais`, `Livraison`, AM-014) et « devenir relais / livreur » (`RelaisDevenir`… `LivreurVerification`, tickets partenaires) n'ont pas de hooks ici. L'accueil n'en expose que la notification du colis (`notificationColis`) ; les raccourcis et les textes fixes (« Langue · FR », « Mes reçus »…) restent dans l'écran.

### Temps réel

- `usePlanSiegesTempsReel({ departId })` renvoie `{ plan, etat, erreur }` : l'instantané de la requête, puis les messages du canal (`CANAL_PLAN_SIEGES`) qui grisent un siège pris par un autre voyageur. Les messages plus anciens que la vue sont ignorés (`versionPlan`).
- `usePositionBus({ billetId })` et `useStatutPaiementEnDirect({ paiementId })` renvoient `{ dernier, etat, erreur }` (c'est `useFlux`).

## Mock : `installerMockVoyageur(scenario, donneesScenario)`

Le mock rend chaque planche voyageur affichable sans backend : les réponses sont relues dans le scénario de la planche, au-dessus du monde commun de `@afrimove/fixtures`, puis validées par les schémas ci-dessus comme le serait une réponse HTTP.

```ts
import { voyageur } from "@afrimove/api-client";
import { ecrans, type NomPlanche } from "@afrimove/fixtures";

voyageur.installerMockVoyageur("Pass", ecrans.Pass); // → Scenario { nom, operations, flux }
```

### Contrat

- **Entrée** : `scenario` est le nom de la planche (la clé de `ecrans`) ; `donneesScenario` est l'objet `ecrans[scenario]` (un `Ecran` : `planche`, `horloge`, `maintenant`, `donnees`, `entites`). Le type d'entrée est structurel (`EcranSource`) : le client ne dépend pas de l'implémentation des fixtures à l'exécution (ses `import type` ne servent qu'à relire les `donnees` sans `any`).
- **Sortie** : un `Scenario` de `@afrimove/api-client` (`nom`, `operations` : `implementer(OP_…)`, `flux` : `simulerFlux(CANAL_…)`), à renvoyer tel quel de `SourceScenarios.charger` ou à fusionner avec ceux des autres domaines.
- **État neuf à chaque appel** : sièges bloqués, compteurs de commandes, brouillons et préférences vivent dans la fermeture. `SourceScenarios.charger` est appelé une fois par client : appelez l'installateur dans `charger`, pas au chargement du module.
- **Erreurs** : `ErreurScenarioInconnu` si `scenario` n'est pas une planche voyageur (`estPlancheVoyageur(nom)`, liste dans `PLANCHES_VOYAGEUR`) ; `Error` si `donneesScenario.planche !== scenario`.
- **Pas d'aléa, pas d'horloge système** : les identifiants viennent de compteurs (`cmd-1`, `pay-1`), les instants de `donneesScenario.maintenant` (donné au client par `instantInitial`) et de l'horloge injectée du client. Tout est donc déterministe avec `creerHorlogeManuelle`.
- **Chaque planche ne sert que ses opérations** : une opération d'une autre planche répond `ErreurNonImplementee`. Un composeur central concatène donc les `operations` et les `flux` de chaque domaine pour la planche demandée (pas de doublon d'opération entre domaines).

### Composeur central

```ts
import { voyageur } from "@afrimove/api-client";
import type { SourceScenarios } from "@afrimove/api-client";
import { ecrans, type NomPlanche } from "@afrimove/fixtures";

export const sourceDesFixtures: SourceScenarios = {
  noms: () => Object.keys(ecrans),
  instantInitial: (nom) => ecrans[nom as NomPlanche].maintenant,
  charger(nom) {
    const ecran = ecrans[nom as NomPlanche];
    const parties = [
      voyageur.estPlancheVoyageur(nom) ? voyageur.installerMockVoyageur(nom, ecran) : undefined,
      // colis.installerMockColis(...), agence…, patron… : même forme
    ].filter((p) => p !== undefined);
    return {
      nom,
      operations: parties.flatMap((p) => p.operations),
      flux: parties.flatMap((p) => p.flux ?? []),
    };
  },
};
```

### Ce que répond le mock

- Les valeurs de la planche sont reprises telles quelles : prix, places, noms, heures. Les textes d'écran sont décomposés en champs (« 9 places » → `placesLibres: 9`, « 3 min » → `departA`, `departDansMinutes: 3`), les heures sont ramenées au jour de la planche en ISO Douala.
- La recherche ne tient compte que des filtres simples (classe, compagnies, prix maximum, type d'offre, filtre du réseau, filtres du covoiturage) ; la ville, la date et la position ne changent pas la liste de la planche.
- Les identifiants de commande, de paiement, de groupe et de billet demandés dans l'URL sont renvoyés tels quels (`useCommande({ commandeId: "x" })` répond la commande de la planche) : les routes de test n'ont pas besoin d'un identifiant précis.
- Quelques comportements vivants, pour que l'écran ne soit pas figé : bloquer un autre siège libère le premier et refuse un siège pris (409) ; un autre voyageur prend le siège 3 de `SiegePay` après 30 s ; la confirmation MoMo de `Paiement` arrive après 5 s ; la position du bus de `Direct` avance toutes les 5 s ; `Pass` annule avec la décision du domaine (`decisionAnnulation`, règles par défaut) ; les proches, trajets publiés, demandes et trajet régulier se modifient.

## Tests

```sh
pnpm --filter @afrimove/contrats run test
pnpm --filter @afrimove/api-client run test
```

`packages/api-client/src/voyageur/planches.test.tsx` contient un test par planche voyageur : il monte les hooks de la planche sur son scénario et vérifie les données (prix, heures ISO, places, états). `installer.test.ts` vérifie le contrat de `installerMockVoyageur` (planche inconnue, état neuf, toutes les opérations et tous les canaux servis).

## À trancher

- `Groupe` et `Proche` écrivent « sam. 10 janv. » alors que le 10 janvier 2027 est un dimanche : le mock suit la date (`2027-01-10`). `Conducteur` et `CovoitConducteur` disent « sam. » sans date : le mock prend le prochain samedi (`2027-01-09`).
- L'accueil montre un covoiturage de Samuel à 5 000 F (08:45) et la planche `Covoit` le même conducteur à 4 000 F (08:30) : chaque scénario garde sa valeur.
- `Pass` affiche « gratuit jusqu'à 07:00 » à 07:38 : l'aperçu d'annulation du mock applique les règles du domaine (50 % retenus pour un billet VIP après le délai).
- `Groupe` écrit « sièges 11 à 17 réservés ensemble » pour 6 voyageurs, mais la grille ne liste que six numéros (11, 12, 13, 15, 16, 17 ; le 14 est pris) : le mock renvoie les six.

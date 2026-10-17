# @afrimove/sync

Moteur hors ligne et synchronisation des apps agence (AM-160). C'est la pièce qui permet au guichet de
vendre sans réseau : chaque geste devient un **événement** écrit d'abord sur l'appareil, puis rejoué
sur le serveur dans l'ordre.

Le serveur correspondant est `apps/api/src/sync` (voir son README pour le protocole et la base).

## Principes

- **PWA web**, pas d'application native. Base locale **IndexedDB via Dexie**.
- **Journal d'événements en ajout seul** : on n'efface jamais un geste, on en ajoute un autre.
- **Les identifiants naissent sur l'appareil** : UUID de l'événement, numéro de billet pris dans la plage
  de l'appareil. Le billet est imprimable avant tout aller-retour réseau.
- **Rien n'est acquitté avant la réponse du serveur.** Si l'application est tuée en plein envoi, le lot
  repart tel quel et le serveur répond `deja_recu`.
- **Chaque événement est signé** par l'appareil (ECDSA P-256, clé non exportable gardée dans IndexedDB).
  Le serveur ne détient aucun secret d'appareil, seulement la clé publique.

## Ce que le paquet fournit

| Besoin                     | API                                                                                                                                                                                      |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Écrire un geste hors ligne | `MoteurSync.enregistrer(definition, donnees)` : UUID, heure de Douala, numéro de plage, file locale, signature, en **une** transaction (pas de trou de numéro possible).                 |
| Envoyer la file            | `synchroniser()` : lots dans l'ordre, relance exponentielle, verrou Web Locks (une seule synchro à la fois).                                                                             |
| Indicateur                 | `etat()` / `instantane()` / `abonner()` : `SYNC` ou `HORS LIGNE`, événements en attente, rejetés, minutes hors ligne.                                                                    |
| Blocage après 12 h         | Verrou persistant ; levé par un octroi serveur (superviseur) ou `debloquerAvecPin(superviseurId, pin)` (4 h, 3 essais faux = saisie bloquée 15 min).                                     |
| Plages                     | `repartirPlages`, `verifierPlagesDisjointes` ; le serveur renvoie la plage à chaque synchro.                                                                                             |
| Sièges hors ligne          | Chaque appareil ne vend que sa **part** de sièges (`definirPartsHorsLigne`, `siegesVendablesHorsLigne`).                                                                                 |
| Conflit                    | Premier horodatage gagne ; l'autre billet arrive en `conflits()` (« à replacer »).                                                                                                       |
| Background Sync            | `demanderSynchroArrierePlan`, `brancherSynchroServiceWorker` (Chrome/Edge ; ailleurs, synchro à l'ouverture, au retour du réseau et par relance).                                        |
| React                      | `@afrimove/sync/react` : `FournisseurSync`, `useIndicateurSync`, `useEtatSync`, `useSynchroniser`, `useEnregistrerEvenement`, `useBlocageAppareil`, `useConflits`, `useSiegesHorsLigne`. |
| Tests                      | `@afrimove/sync/testing` : `ServeurFactice` (pannes programmables), `HorlogeManuelle`, `indexedDbFactice` (fake-indexeddb). Hors du bundle de l'application.                             |

## Brancher une app agence

```tsx
import { MoteurSync, creerTransportHttp } from "@afrimove/sync";
import { FournisseurSync, useIndicateurSync, useEnregistrerEvenement } from "@afrimove/sync/react";
import { agence } from "@afrimove/contrats";

const moteur = await MoteurSync.ouvrir({
  appareilId, // fiche appareil créée par l'administration
  auteurId, // la personne connectée
  agence: "ALP",
  gare: "DLA",
  plage: plageGuichet(2), // provisoire : le serveur envoie la bonne
  transport: creerTransportHttp({ urlBase: "/api", obtenirJeton: () => session.jeton }),
});
await moteur.enroler(); // première installation seulement : enregistre la clé publique

<FournisseurSync moteur={moteur}>
  <App />
</FournisseurSync>;

// dans un composant
const vente = useEnregistrerEvenement(agence.EVENEMENT_BILLET_VENDU);
vente.mutate(donnees); // vente.data.numero : à imprimer tout de suite
const { libelle } = useIndicateurSync(); // "SYNC" | "HORS LIGNE"
```

## Règles et garanties

- **Numéros sans trou** : le compteur est lu, avancé et écrit avec l'événement dans la même transaction
  Dexie ; au démarrage, les compteurs sont recalés sur la file (un compteur perdu ne fait reprendre
  aucun numéro).
- **12 h hors ligne** (`LIMITE_HORS_LIGNE_HEURES` du domaine) : les ventes sont refusées
  (`AppareilBloque`), la synchronisation reste permise. Le blocage tombe quand un superviseur a
  débloqué l'appareil **et** que la file est entièrement partie.
- **Conflit de siège** : le serveur rejoue les opérations d'un siège par heure du geste ; le résultat ne
  dépend pas de l'ordre d'arrivée. Le billet perdant reste au journal avec son numéro.
- **Ventes hors ligne avec siège** : uniquement dans la part du plan de sièges de l'appareil
  (`SiegeHorsPart`, `PartInconnue`, `SiegeDejaVendu`). En ligne, le serveur arbitre.
- **Lots** : 25 événements par défaut ; sur un refus 413 le lot est réduit de moitié, sans compter
  d'échec.
- **Erreurs de transport** : `reseau` / `serveur` sont relancées avec un délai croissant ;
  `authentification` (401) et `refus` (autre 4xx) ne le sont pas, une personne doit intervenir. La file ne
  bouge pas.

## Limites connues

- Background Sync n'existe pas sur Safari ni Firefox ; le service worker n'a pas la session de l'agent :
  l'application doit lui confier le jeton (par exemple dans IndexedDB). Non vérifié sur un vrai
  navigateur (les tests tournent avec `fake-indexeddb` et jsdom).
- Les vérificateurs de PIN superviseur (PBKDF2) tiennent contre un curieux, pas contre une attaque
  hors ligne sur un téléphone volé : 6 chiffres = 10^6 valeurs. D'où les 3 essais, les 15 minutes de
  blocage et les 4 h d'octroi seulement.
- Le journal local est purgé à la demande (`purger`), jamais automatiquement.

## Scripts

`pnpm --filter @afrimove/sync run typecheck | test | lint | build`

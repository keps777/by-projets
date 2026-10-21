# @afrimove/domain

Domaine partagé d'AfriMove : entités, machines d'états, numérotation sans trou, tarifs et règles.
TypeScript pur : aucune dépendance (ni React, ni Nest, ni Prisma, ni zod). Utilise seulement `Date`,
`TextEncoder` et Web Crypto, disponibles dans les navigateurs et Node 22.

```ts
import { ... } from "@afrimove/domain";
```

## Conventions

- **Montants** : entiers en FCFA (`Fcfa = number`). Les pourcentages sont calculés sur des entiers
  (`pourcentage`, `arrondirAuMultiple`) ; un montant non entier lève une `RangeError`.
- **Heures** : chaînes ISO exprimées en `Africa/Douala`, décalage fixe `+01:00` (pas d'heure d'été) :
  `versIsoDouala(x)` → `2027-01-05T05:30:00.000+01:00`. Les dates des numéros (`AAMMJJ`) et le minuit
  de la clôture automatique sont ceux de Douala, pas ceux d'UTC.
- **Rien ne s'efface** : les opérations renvoient une nouvelle entité et ajoutent une entrée à
  `historique`. Une annulation est un événement ; le numéro est conservé.

## Machines d'états (`etats/`)

| Machine   | États                                                                                                                            |
| --------- | -------------------------------------------------------------------------------------------------------------------------------- |
| billet    | réservé → payé → embarqué → voyagé ; annulé, non présenté, reporté (jamais de retour après embarqué)                              |
| colis     | enregistré → chargé → en route → déchargé → disponible → remis ; en relais, en livraison, livré, non retiré, retourné, perdu, litige |
| départ    | programmé → en vente → embarquement → parti → arrivé ; annulé, retardé, fusionné                                                  |
| session   | ouverte → clôturée → validée (refus du superviseur : clôturée → ouverte)                                                          |

```ts
etatSuivant(MACHINE_BILLET, "embarque", "annuler"); // lève TransitionInterdite
peutAppliquer(MACHINE_COLIS, "disponible", "remettre"); // true
actionsPossibles(MACHINE_DEPART, "en_vente"); // ["ouvrir_embarquement", "annuler", ...]
```

`operations.ts` applique ces machines aux entités : `appliquerBillet`, `annulerBillet` (PIN
superviseur obligatoire hors vente en ligne, renvoie aussi l'événement et la décision de
remboursement), `appliquerColis`, `remettreColis` (vérifie le code de retrait haché),
`appliquerDepart`, `fusionnerDepart`, `ouvrirSession`, `cloturerSession`, `refuserCloture`,
`validerSession`.

## Numérotation (`numerotation.ts`)

```
billet  AGENCE-GARE-AAMMJJ-NNNN      ALP-DLA-270105-0232
colis   C-GARE-AAMMJJ-NNNN           C-DLA-270105-0017
départ  AGENCE-LIGNE-AAMMJJ-HHMM     ALP-DLAYDE-270105-0530
session K-GARE-AAMMJJ-GUICHET-N      K-DLA-270105-2-1
```

Chaque appareil a sa plage de NNNN, consommée dans l'ordre : guichet 1 `0001–0999`, guichet 2
`1001–1999`, guichet 3 `2001–2999`, convoyeurs `3001–3999` (partagé entre eux avec `plageConvoyeur`),
ventes en ligne `4001–9999`. Le compteur repart à la plage entière chaque jour.

```ts
const g = new GenerateurNumeros({ agence: "ALP", gare: "DLA", plage: plageGuichet(2) });
g.prochainBillet(new Date()); // { numero: "ALP-DLA-270105-1001", sequence: 1001 }
localStorageOuSqlite.save(g.exporter()); // à restaurer avec { etat } après un redémarrage hors ligne
```

Une plage vide (999 ventes dans la journée) lève `PlageEpuisee`. Côté serveur,
`analyserSequences(sequences, plage)` renvoie `{ trous, doublons, horsPlage }`.

## Codes (`codes.ts`)

Code billet à 4 chiffres (`genererCodeBillet`, `genererCodeBilletUnique`), code de retrait à 6 chiffres
(`emettreCodeRetrait` → `{ code, hache, sel }`, `verifierCodeRetrait`). L'aléa est injecté
(`aleaCrypto()` en production). Un code à 6 chiffres haché reste devinable hors ligne : le serveur doit
aussi limiter les essais.

## Tarifs (`tarifs.ts`) et règles (`regles.ts`)

```ts
devisColis({ port: 1500, canal: "app", mode: "gare", valeurAssuree: 25_000 }); // total 2 200
primeAssurance(25_001); // { valeurAssuree: 25001, prime: 501 }
repartitionLivraison(1000); // { livreur: 700, afrimove: 300 }
prixProrata({ arrets, prixTrajetComplet: 4000, depuisArretId, versArretId });
decisionAnnulation({ etat, prix, classe, heureDepart, maintenant }); // gratuite / retenue / remboursement
evaluerEcart(attendu, compte, tolerance); // exact | dans_tolerance | hors_tolerance
statutAppareil({ derniereSyncA, maintenant }); // bloque = hors ligne strictement > 12 h
```

## Tests

`pnpm --filter @afrimove/domain test` (Vitest) : produit cartésien état × action de chaque machine,
formules de prix, règles, et simulation de 10 000 ventes hors ligne sur 3 guichets (aucun doublon,
aucun trou).

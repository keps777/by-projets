# AfriMove

Tout le transport interurbain dans une seule application : voyageur (bus, covoiturage, moto, colis, proches), agents de gare (guichet, quai, chauffeur, convoyeur, contrôleur), superviseur, patron, siège web, partenaires (point relais, livreur, conducteur covoiturage, vendeur ambulant). PWA Svelte 5 + TypeScript + Vite, thème nuit en verre dépoli, avec des vues 3D (panorama des départs, plan du bus, billet holographique, cartes en relief).

> État : application complète construite à partir des ~95 maquettes « AfriMove V5 », avec un **backend simulé** : un seul « monde » (compagnies, départs, billets, colis, équipes) dans `localStorage`, partagé par toutes les applications.

## Démarrer
```bash
npm install
npm run dev        # http://localhost:5173
npm run check      # svelte-check + tests unitaires
npm run build && npm run preview   # PWA de production
npm run e2e        # parcours Playwright (Chromium)
```
Entrée de démonstration : `/entree` (choisir une personne ; PIN affiché), `/parcours` (tous les parcours de bout en bout), ou « Entrer directement comme Aïcha ». SMS de démonstration : `4821`. Rejouer une journée : `?maintenant=2026-11-03T07:30`.

## Les applications
| Qui | Où |
|---|---|
| Voyageur (Aïcha) | `/` panorama des départs, `/siege`, `/paiement`, `/pass`, `/direct`, `/covoit`, `/colis/envoi`, `/moi`… |
| Guichet (Fatou, PIN 4821) | `/guichet`, `/vente`, `/cadence`, `/caisse`, `/depot` |
| Terrain | `/quai`, `/chauffeur`, `/convoyeur`, `/controleur` |
| Superviseur (Abdou, PIN 1357) | `/superviseur`, `/rapport-soir` |
| Patron (Luther, PIN 0001) | `/patron`, `/assistant`, `/modules`, `/financement`, `/inter-agences` |
| Siège (web) | `/siege/analyses`, `/siege/comptable`, `/siege/config`, `/siege/controle`, `/parcours` |
| Partenaires | `/relais/app`, `/livreur`, `/conducteur`, `/vendeur` |

## Règles métier clés
* Billet scellé par HMAC-SHA256 (`src/core/sceau.ts`) : vérifiable hors ligne, un scan le consomme (déjà scanné / faux sceau / annulé refusés).
* Annulation : 10 % de frais jusqu'à 2 h avant le départ, rien après, remboursement intégral si la compagnie annule.
* Caisse du guichet : comptage par coupure, écart toléré ≤ 1 000 F, au-delà le superviseur valide avec son PIN.
* Panorama : départs rangés en 8 tranches de 3 h, tri heure/prix/places/confort ; prix dynamique optionnel (patron).

Voir `CONTRIBUER.md` (contrat d'architecture), `docs/architecture.md`, `docs/ecarts-maquettes.md`.

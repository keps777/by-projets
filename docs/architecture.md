# Architecture

```
core (pur, testé) → domain (types, transactions du monde) → data (store, seed, horloge) → ui (kit) → apps/<nom>
```
* **Monde** (`src/domain/types.ts`) : compagnies, gares, bus, lignes, départs (≈ 30 par jour sur 15 jours), billets, paiements, covoiturages, colis, personnes (13 rôles), caisses, litiges, notifications, événements, paramètres (modules, règles, tarifs). Persisté dans `localStorage` (`afrimove.v1`).
* **Transactions partagées** (`src/domain/actions.ts`) : `reserver`/`regler`/`annulerBillet`/`scannerBillet`, `ouvrirCaisse`/`fermerCaisse`/`validerCaisse`, `creerColis`/`avancerColis`, `annoncerRetard`/`annulerDepart`, `notifier`/`consigner`. Une vente au guichet apparaît donc au quai, dans la caisse, chez le patron et dans l'app de la voyageuse.
* **Simulation** (`src/domain/simulation.ts`) : à chaque tick, les départs passent à embarquement/parti/arrivé selon l'horloge et le bus avance.
* **Rôles** : `connecter(personneId)` ; les routes déclarent `roles` ; le patron passe partout ; session de 15 min d'inactivité.
* **Sceau des billets** : HMAC-SHA256 tronqué (clé de démonstration embarquée). En production : signature à clé publique, clé privée côté serveur.
* **Migration prévue** : base relationnelle (billets, paiements, départs, caisses) avec règles d'accès par rôle, paiements MoMo/OM réels via les API opérateurs, SMS/WhatsApp, notifications push. Le store devient un cache hors ligne.

# Architecture

```
core (pur, testé) → data (store, seed, paie) → ui (kit) → screens / portals
```
* **Store** (`src/data/store.svelte.ts`) : un objet `app` réactif (`$state`) persisté dans `localStorage` (`assureme.v1`). Les fonctionnalités gardent leur état dans `app.tranches.<cle>` ; les deux faces (membre et portail partenaire) lisent la même tranche, ce qui garde hôpital/école/concession cohérents avec l'app du membre.
* **Moteur de paie** (`src/data/paie.ts`) : chaque fonctionnalité qui prélève enregistre un fournisseur (`fournirPrelevements`). Au jour de paie, le salaire est versé puis les lignes passent dans l'ordre Pass → crédits → coffres ; solde insuffisant = report sans pénalité. Les paies manquées sont rattrapées au démarrage.
* **Routeur** (`src/router.svelte.ts`) : History API ; routes déclarées dans `routes.ts` de chaque dossier (`import.meta.glob`). Cadres : `membre` (mobile, barre d'onglets), `portail` (web clair), `plein`.
* **Backend simulé** : OTP SMS (123456), notifications push, WebAuthn en repli, QR de démonstration, caméra de scan via `BarcodeDetector` avec repli saisie. Aucune donnée ne quitte le navigateur.
* **Migration prévue** : `supabase/schema.sql` (RLS par membre, `creer_credit_si_autorise` applique les 33 % côté serveur). Le store devient un cache hors ligne, les actions des appels de fonctions serveur.

## Sécurité
Code à 6 chiffres haché PBKDF2 (sel aléatoire), jamais stocké en clair. Verrou 3 essais / 15 min. Session 5 min. Export CSV : cellules neutralisées contre l'injection de formules. Pas de secret dans le dépôt.

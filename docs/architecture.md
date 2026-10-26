# Architecture

- **Un monde, un état** (`src/domain/types.ts`) réactif (`$state`) dans `src/data/store.svelte.ts`, persisté en `localStorage` (codec colonnes). `etatInitial()` (seed) rejoue le lundi 12 octobre 2026.
- **Transactions** dans `src/domain/*.ts` (fonctions qui mutent le monde ; la même transaction sert tous les écrans) ; **calculs purs** dans `src/core/` (testés).
- **Tranches** : l'état propre à une fonctionnalité (brouillons, préférences d'écran) vit dans `app.tranches[cle]` via `tranche(cle, defaut)`.
- **Routeur** History API (`src/router.svelte.ts`), routes déclarées par dossier ; garde d'accès dans `App.svelte` (public / compte / admin).
- **Deux faces** : `data-face="jour"|"nuit"` redéfinit les variables CSS ; un écran choisit sa face via `<Ecran face=…>`.
- **PC** : même composants, media query ≥ 900 px (contenu centré ≤ 1120 px, navigation en haut).
- **Hors ligne** : service worker (vite-plugin-pwa), données locales.

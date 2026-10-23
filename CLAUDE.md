# CLAUDE.md

Projet **AssureMe** : PWA mobile + portails partenaires (Svelte 5 runes, TypeScript, Vite). Backend simulé en `localStorage`.

## Langue et règles
- **Français** partout (interface, docs, commentaires, commits). Aucun e-mail dans l'app (SMS et notifications seulement). Ne jamais committer de secret.
- Commande de vérification unique : `npm run check` (doit être verte avant tout commit). `npm run e2e` pour les parcours.
- Lire `CONTRIBUER.md` avant d'ajouter une fonctionnalité : dossier propre `src/screens/<nom>/` ou `src/portals/<nom>/`, `routes.ts` auto-découvert, tranche d'état propre, prélèvements via `fournirPrelevements`.
- Toute règle de calcul vit dans `src/core/` (pure, testée), jamais dans un composant.
- Règle des 33 % : toujours via `decider()` avec `totalMensualites()`.

## Carte
`src/core` calcul · `src/data` store, seed, moteur de paie · `src/ui` kit · `src/screens` membre · `src/portals` partenaires · `supabase/schema.sql` schéma cible · `docs/` architecture, écarts des maquettes, journal.

## Pièges connus
- L'état est réécrit dans `localStorage` à `pagehide` : en test, injecter l'état avec `addInitScript`.
- Ne jamais créer une tranche dans un `$derived` (Svelte lève `state_unsafe_mutation`) : lire `app.tranches.<cle>` sans la créer.
- En dev, `node_modules` lié hors du dépôt provoque des 403 sur les polices (sans effet).

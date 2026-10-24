# CLAUDE.md

Projet **AfriMove** : PWA Svelte 5 (runes) + TypeScript + Vite regroupant toutes les applications du transport interurbain. Backend simulé en `localStorage`.

## Langue et règles
- **Français** partout (interface, docs, commentaires, commits). Pas d'e-mail dans l'app (SMS, WhatsApp et notifications simulés). Pas de secret dans le dépôt.
- Vérification : `npm run check` (svelte-check + vitest) doit être vert avant tout commit ; `npm run e2e` pour les parcours.
- Lire `CONTRIBUER.md` avant d'ajouter un écran : un dossier `src/apps/<nom>/` avec `routes.ts` auto-découvert, les transactions du monde passent par `src/domain/actions.ts`, la logique de calcul vit dans `src/core/` (pure, testée).
- Horloge : toujours `maintenant()` / `aujourdhui()` (`?maintenant=` rejoue une journée).

## Pièges
- Ne jamais créer une tranche (`tranche()`) dans un `$derived` : créer dans une action/`demarrage.ts`, lire `app.tranches.<cle>`.
- L'état est réécrit dans `localStorage` à `pagehide` : en test, injecter l'état avec `addInitScript`.
- Les classes de `src/ui/afri.css` (`.ring .pad .tile .toast .ch`…) sont globales : préfixer ou renommer les classes locales qui portent le même nom.
- Le serveur de dev renvoie 403 sur les polices si `node_modules` est un lien symbolique : utiliser `vite build` + `vite preview`.

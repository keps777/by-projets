# Contribuer à NexG-TT : le contrat d'architecture

Application **Svelte 5 (runes) + TypeScript + Vite**, PWA, **backend simulé** dans le navigateur : un seul « monde » (`src/domain/types.ts`) persisté en `localStorage`. Français partout (interface, commentaires, messages de commit). Aucune clé secrète, aucun paiement réel : **mode démo** (bandeau « MODE DÉMO — aucun paiement réel »).

## Commandes
`npm run check` (types + tests unitaires) · `npm run build` · `npm run e2e` (Playwright sur l'application construite, 390 × 844 ; `NX_PORT=4xxx` pour éviter un serveur déjà occupé) · `npm run dev`.
**Avant tout commit : `npm run check` vert + vos tests e2e verts.** Ne jamais committer `node_modules`, `dist`, `test-results`.

## Carte du dépôt
- `src/domain/types.ts` — le monde : comptes, vols, droits de voyage, chaîne de détention, offres, drops, ordres, intentions, bagages, écritures, notifications. **Fichier partagé : ne le modifiez pas sans l'annoncer** ; ajoutez plutôt votre état dans une *tranche*.
- `src/domain/compte.ts` — session et comptes (connecter, créer, notifier…). `src/domain/actions.ts` — transactions du marché (phase 2+).
- `src/core/` — fonctions **pures**, testées (`argent.ts` formats et écarts signés, `regles.ts` commission, plafond, échéance J-1). Moins de 200 lignes par fichier.
- `src/data/` — `store.svelte.ts` (`app`, `tranche()`, `reinitialiser()`), `seed.ts` (monde de démonstration, lundi 12 octobre 2026), `horloge.ts` (`?maintenant=2026-12-13T10:00`), `codec.ts`.
- `src/ui/` — kit : `nexg.css` (jetons, deux faces), `Ecran.svelte` (cadre), `NavBas`, `Icone`, `Logo`, `Champ`, `Feuille`, `toast.svelte.ts`.
- `src/apps/<nom>/` — **un dossier par fonctionnalité** : ses écrans `.svelte`, son `routes.ts` (export par défaut `Route[]`), ses `actions.ts`/`etat.ts`, ses tests. Le routeur découvre `src/apps/*/routes.ts` tout seul.
- `design/` — maquettes de référence (lecture seule) ; `docs/ecrans.md` — quelle planche pour quel écran.
- `e2e/` — tests de bout en bout ; `e2e/aide.ts` : `ouvrir(page, chemin, { connecte: 'ACC-0412' })`, `lireEtat(page)`, `sansDebordement(page)`.

## Règles d'écran
1. **Fidélité aux maquettes** : mêmes textes (accents et espaces insécables compris), mêmes ordres de blocs, mêmes couleurs (variables de `nexg.css`), mêmes tailles. Lire la source `.dc.html` de la planche, pas seulement le digest.
2. **Responsive** : un seul composant par écran, mobile d'abord (390 px) ; la variante PC (`Web…`) s'obtient par media query ≥ 900 px dans le même composant (`Ecran` centre déjà le contenu et passe la navigation en haut). Ne jamais déborder horizontalement à 320 px.
3. **Cadre** : `<Ecran titre=… face="jour"|"nuit" onglet=…>` ; sans `onglet`, c'est un écran « plein » (retour + titre). Les formulaires utilisent `Champ` ; les fenêtres `Feuille`.
4. **Accessibilité** : vrais `<button>`/`<a href>`/`<input>`+`<label>`, cibles ≥ 44 px, focus visible, erreurs annoncées (`role="alert"`) avec **icône + texte**, un écart de prix porte toujours un signe (`+`/`−`/`▲`/`▼`). Respecter `prefers-reduced-motion`.
5. **Principes produit** (design system) : le jaune signale une action ou une échéance, jamais une décoration · on dit « prix équivalent », jamais gain garanti · tout ce qui est définitif est annoncé avant · le voyageur est nommé le plus tard possible · chaque écran a ses états (chargement, vide, erreur).
6. **État** : ne jamais créer une tranche dans un `$derived` (`tranche()` renvoie alors une valeur non enregistrée) ; écrire dans une action. Pas de `localStorage` direct hors du store. Montants en dollars canadiens via `core/argent.ts`.
7. **Routes** : chemins en français, `acces: 'public'` pour les écrans d'accès, `'compte'` (défaut) sinon. `src/liens.test.ts` vérifie l'unicité des chemins.
8. **Hypothèses et règles provisoires** des maquettes : constantes nommées dans `core/regles.ts`, jamais en dur dans un écran.

## Fichiers partagés (ne pas modifier sans nécessité)
`src/ui/*`, `src/domain/*`, `src/data/*`, `src/core/*` existants, `src/App.svelte`, `src/router.svelte.ts`, `e2e/aide.ts`, `package.json`. Si vous devez y toucher (ajout d'une icône dans `Icone.svelte`, d'une classe dans `nexg.css`), faites-le en **ajout minimal**, signalez-le dans votre rapport.

## Git
Une branche `nx/<nom>` par agent dans un worktree `/home/user/nx-<nom>` ; commits en français ; ne pas pousser ; la fusion est faite par le coordinateur.

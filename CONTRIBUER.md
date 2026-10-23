# Contrat d'architecture (à lire avant de coder une fonctionnalité)

AssureMe est une PWA Svelte 5 (runes) + TypeScript. **Français partout** (UI, commentaires, messages de commit). Backend **simulé** : tout vit dans `localStorage` via un magasin unique.

## Couches
```
src/core/      logique pure, testée (credit, auth, score, sante, epargne, ecole, logement, energie, diaspora, commerce, protection, prelevement, dates, money)
src/data/      store.svelte.ts (état + persistance), types.ts, seed.ts (démo « Aïcha » / compte vierge), paie.ts (moteur de paie)
src/ui/        kit : Ecran, Carte, Bouton, Champ, Jauge, Pastille, Ligne, Feuille, Icone, BarreOnglets, toast
src/screens/<fonctionnalité>/   écrans membre (mobile, nuit)
src/portals/<partenaire>/       portails web des partenaires (clair, cadre 'portail')
```

## Ajouter une fonctionnalité
1. **Dossier à soi** : `src/screens/<nom>/` (ou `src/portals/<nom>/`). Ne modifier **aucun fichier partagé** (`ui/`, `data/store`, `data/types`, `data/seed`, `router`, `App.svelte`, `core/*` existants) : à la place, créer ses propres fichiers. Une nouvelle fonction pure va dans `src/core/<nom>.ts` (nouveau fichier) avec son `.test.ts`.
2. **Routes** : `src/screens/<nom>/routes.ts` exporte par défaut un `Route[]` (voir `router.svelte.ts`). Chargement paresseux : `composant: () => import('./Ecran.svelte')`. Les routes sont découvertes automatiquement. Chaque écran reçoit `params` en prop.
3. **État** : une **tranche** à soi, `tranche('sante', () => ({...defaut}))` (dans `src/screens/<nom>/etat.ts`, typée). Elle est persistée avec le reste. Les deux côtés (membre + portail partenaire) lisent/écrivent la même tranche : c'est ainsi que l'hôpital émet une facture que le membre voit.
4. **Actions** : fonctions dans `src/screens/<nom>/actions.ts` qui modifient `app` / la tranche. Pour l'argent : `mouvement({...})` (met à jour le solde), `notifier({...})`. Toute règle de calcul est dans `core/` (pure, testée), jamais dans un composant.
5. **Paie** : si la fonctionnalité prélève sur salaire (crédit, coffre, Pass…), créer `src/screens/<nom>/demarrage.ts` qui appelle `fournirPrelevements('<nom>', (paie) => [...lignes avec appliquer()])` (voir `data/paie.ts`). Ce fichier est importé au démarrage.
6. **Règle des 33 %** : avant d'accorder un crédit, appeler `decider()` (`core/credit.ts`) avec `totalMensualites()` (`data/store`) ; les crédits accordés vont dans `app.credits`.
7. **Tests** : logique pure → `vitest` ; commande unique `npm run check` (svelte-check + vitest) doit passer avant tout commit.

## Chemins fixes (liens entre fonctionnalités)
`/` accueil · `/profil` · `/coffres` · `/score` · `/sante` · `/ecole` · `/logement` · `/auto` · `/diaspora` · `/commerce` · `/protection` · `/energie` · `/pay/scan` · `/pay/facture` · `/prelevement` · `/bienvenue` · `/connexion` · `/piliers`
Portails : `/portail/hopital` · `/portail/ecole` · `/portail/concession` · `/portail/entreprise` · `/portail/pilotage`
Un écran protégé déclare `garde: 'connecte'` ; un portail partenaire `cadre: 'portail'` (thème clair, pleine largeur) ; un écran d'onboarding/scan `cadre: 'plein'` ; un écran avec barre d'onglets `onglet: 'accueil'|'coffres'|'score'|'profil'`.

## Maquettes (lecture seule)
Sources : `.dc.html` (templates `x-dc` avec `{{trous}}`, `sc-for`/`sc-if`, classe `DCLogic` avec `setState`/`renderVals`). Résumés texte : voir le dossier indiqué dans la consigne. Reproduire : mise en page, libellés, états, données d'exemple (persona Aïcha Ndiba, 520 000 net, paie le 28). **Pas de copie du code des maquettes.**

## Écarts connus des maquettes
* La mention « 31 % / 231 700 sous les 33 % » est arithmétiquement fausse (44,6 %). Règle retenue : **somme de toutes les mensualités de crédit ≤ 33 % du net**.
* Mensualités calculées avec les vraies formules d'annuité (`core/credit.ts`), pas les chiffres arrondis des maquettes.

## Intégration (règles apprises à la fusion des fonctionnalités)
* **Lecture sans écriture** : un aperçu (accueil, calendrier de paie, portails) lit l'état depuis un `$derived`, où Svelte interdit d'écrire. `tranche()` rend alors la valeur par défaut sans la créer ; préférer tout de même une fonction de lecture (`lirePaiements`, `lireAuth`, `coffres()`…). Un fournisseur de prélèvements ne crée jamais de tranche.
* **Prélèvements** : `fournirPrelevements()` est appelé **à l'import** du `demarrage.ts` (jamais dans la fonction exportée) pour que le rattrapage des paies du socle les voie. Un crédit n'est prélevé que par **un** fournisseur (les crédits `c-pay-…` étalés depuis l'accueil le sont par l'accueil, pas par la santé).
* **Une seule voie pour le score** : `ajouterPoints(motif, points, signal, now?)` de `screens/score/actions.ts` (courbe, journal des événements, changement de niveau).
* **Une seule facture santé** : la tranche `sante` fait foi (portail clinique, écran Santé, paiements). L'accueil la lit via `facturesDeSante()` et, une fois payée ou étalée, la marque réglée dans la tranche santé.
* **Coffres** : les autres fonctionnalités lisent `epargneDuGenre('Voiture' | 'Rentrée'…)` et prennent un apport avec `prendreDansCoffres()` / `rendreAuxCoffres()` (`screens/coffres/actions.ts`), sans copie du solde.
* **Pass** : `tarifPassMembre()` (`screens/auth/tarif.ts`) combine le prix du Pass et `partEmployeurDuPass` du portail entreprise (le code employeur de l'inscription sert de repli).
* **Horloge** : toujours `maintenant()` (`data/horloge.ts`), jamais `Date.now()` ni `new Date()` pour une date métier. `?maintenant=2026-11-28T10:00` est gardé pour l'onglet (`sessionStorage`) ; `?maintenant=` revient à l'heure réelle. Le seed démo en dépend (prochaine paie le 28, facture des Palmiers émise l'avant-veille).
* **Plafond de 33 %** : il vise les crédits (et le loyer), pas le Pass ni les coffres (voir `repartition()` de `core/calendrier-paie.ts`).

## Tests
* `npm run check` : svelte-check + vitest (dont `src/liens.test.ts` : tout lien interne écrit dans le code doit pointer vers une route déclarée, chaque route a un titre et un import paresseux).
* `npm run e2e` : Playwright (Chromium préinstallé dans `/opt/pw-browsers` si présent), 390 × 844, sur le build servi par `vite preview` (port 4180). Les parcours sont dans `e2e/*.spec.ts`, les aides dans `e2e/aide.ts` (compte démo, horloge, pavé, `patcherEtat` pour modifier l'état enregistré avant un rechargement : l'état est réécrit à `pagehide`, il ne suffit pas de modifier le `localStorage` de la page).

# Contrat d'architecture AfriMove (à lire avant de coder un écran)

AfriMove : une PWA Svelte 5 (runes) + TypeScript qui contient **toutes les applications** du transport interurbain : voyageur, agents de gare (guichet, quai, chauffeur, convoyeur, contrôleur), superviseur, patron, siège (web), partenaires (relais, livreur, conducteur covoiturage, vendeur ambulant). **Français partout** (UI, commentaires, commits). Backend **simulé** : un seul « monde » en `localStorage`.

## Couches
```
src/core/     logique pure testée : sceau (HMAC billets), sieges, tarif+remboursement, tranches (panorama 3 h), colis, caisse, retard, qr, csv, dates, money
src/domain/   types.ts (modèle), actions.ts (TRANSACTIONS PARTAGÉES), simulation.ts (le monde avance seul), acces.ts (rôles → accueil)
src/data/     store.svelte.ts (état + persistance + tranches), seed.ts (monde de démo), horloge.ts (?maintenant=…)
src/ui/       afri.css (classes des maquettes), Mobile, Dock, Icone, Qr, Squelette, toast
src/apps/<nom>/   un dossier par application/fonctionnalité : routes.ts + écrans .svelte (+ etat.ts, actions.ts, demarrage.ts, tests)
```

## Règles d'or
1. **Tout changement du monde passe par `src/domain/actions.ts`** (`reserver`, `regler`, `annulerBillet`, `scannerBillet`, `ouvrirCaisse`, `fermerCaisse`, `validerCaisse`, `creerColis`, `avancerColis`, `annoncerRetard`, `annulerDepart`, `notifier`, `consigner`…). Un billet vendu au guichet doit apparaître au quai, dans la caisse, chez le patron et chez la voyageuse. Si une transaction manque, **ajoute-la dans ton propre fichier** `src/apps/<nom>/actions.ts` en t'appuyant sur `app.monde` et sur ces primitives (ne modifie pas `domain/actions.ts` sauf bug avéré : signale-le dans ton rapport).
2. **Aucun fichier partagé modifié** : `ui/*`, `data/*`, `domain/*`, `core/*` existants, `router`, `App.svelte`, `main.ts`, `package.json`. Besoin d'une icône : SVG en ligne dans ton dossier. Besoin d'une règle de calcul : nouveau fichier `src/core/<nom>.ts` + test.
3. **Routes** : `src/apps/<nom>/routes.ts` exporte par défaut un `Route[]` (voir `router.svelte.ts`), `composant: () => import('./X.svelte')` paresseux, `titre` obligatoire, `roles` (absent = public), `cadre` : `mobile` (défaut, 390 px sombre), `plein` (mobile sans dock), `web` (siège). Les routes sont auto-découvertes.
4. **Styles** : les écrans reprennent les **mêmes classes que les maquettes** (`.scr .hd .bd .gl .b .b.p .pl .row .col .ttl .lab .mut .tile .bento .ch .sw …`, voir `src/ui/afri.css`) ; le composant `Mobile` produit `.scr/.hd/.bd`. Styles propres à un écran : `<style>` du composant. Polices : Unbounded (titres), Sora (texte), Geist Mono (chiffres).
5. **État propre** : `tranche('<nom>', () => ({...}))` (`data/store.svelte.ts`) pour ce qui n'appartient à aucune entité du monde ; jamais dans un `$derived` (Svelte lève `state_unsafe_mutation`) : créer en script/action, lire `app.tranches.<cle>` sans la créer.
6. **Lecture/écriture du monde** : `app.monde.*` est réactif ; lis-le dans des `$derived`, modifie-le seulement dans des actions.
7. **Horloge** : toujours `maintenant()` / `aujourdhui()` (`data/horloge.ts`), jamais `Date.now()` métier (les tests rejouent avec `?maintenant=2026-11-03T07:30`).
8. **Rôles** : `connecter(personneId)` ; l'app protège les routes via `roles`. Comptes de démo : voir `domain/acces.ts` et `data/seed.ts` (Aïcha = `p-aicha`, Fatou guichet PIN 4821, Abdou superviseur PIN 1357, Luther patron PIN 0001…). Les écrans lisent la personne de la session par `personneCourante()`.
9. **Maquettes** (lecture seule) : résumés dans `…/scratchpad/outline-am/<Nom>.dc.txt` (libellés + logique), sources HTML dans `…/scratchpad/artifact-files/2e601d14-7702-4487-b6eb-20a8bd6f2630/project/<Nom>.dc.html` (greppe, ne lis pas en bloc). Reproduire : disposition, libellés, états, données de la persona. Ne pas copier le code `x-dc` ; écrire de vrais composants Svelte accessibles (≥44 px, labels, aria).
10. **Qualité** : `npm run check` (svelte-check + vitest) et `npx vite build` verts avant tout commit ; tests vitest pour la logique ; un parcours Playwright par application (Chromium préinstallé, `executablePath`, `vite build` + `vite preview` ; injecter l'état avec `addInitScript`).

## Chemins fixes (liens entre applications)
Voyageur : `/splash` `/tuto` `/connexion` `/connexion/code` `/` (accueil panorama) `/filtres` `/ville` `/voix` `/orbe` `/destination` `/calendrier` `/siege` `/paiement` `/paiement/attente` `/paiement/refus` `/pass` `/pass/hors-ligne` `/pass/annule` `/groupe` `/proche` `/direct` `/direct/ilot` `/direct/retard` `/reseau` `/course` `/arret` `/covoit` `/covoit/ville` `/covoit/conduire` `/ussd` `/colis/envoi` `/colis/suivi` `/relais` `/livraison` `/notifications` `/litige` `/moi` `/moi/fidelite` `/moi/proches` `/reglages` `/autorisations` `/relais/devenir` `/relais/inscription` `/livreur/devenir` `/erreur` `/maintenance`.
Agences : `/guichet` `/vente` `/vente/ticket` `/cadence` `/cadence/billet` `/cadence/quai` `/guichet/colis` `/depot` `/caisse` `/quai` `/quai/ok` `/quai/refus` `/convoyeur` `/chauffeur` `/chauffeur/arret` `/controleur` `/superviseur` `/superviseur/voir` `/superviseur/valider` `/superviseur/equipe` `/superviseur/debloquer` `/rapport-soir`.
Patron : `/patron` `/patron/equipe` `/patron/gare` `/patron/personne` `/assistant` `/assistant/reponse` `/modules` `/financement` `/financement/demande` `/inter-agences` `/inter-agences/convention`.
Siège (web) : `/siege/analyses` `/siege/analyses/ligne` `/siege/analyses/bus` `/siege/comptable` `/siege/comptable/rapprochement` `/siege/config` `/siege/config/ligne` `/siege/config/personne` `/siege/controle` `/siege/controle/sante` `/parcours`.
Partenaires : `/relais/app` `/livreur` `/conducteur` `/vendeur`. Entrée de démo : `/entree`.
Paramètres de requête pour passer un contexte : `?depart=<id>` (départ choisi), `?billet=<id>`, `?colis=<id>`, `?paiement=<id>`, `?jour=AAAA-MM-JJ`.

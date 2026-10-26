# Journal

## Socle (26 oct. 2026)
Branche `DevNetGTT` (orpheline), dépôt cible `keps777/nexg-tt`. Maquettes importées dans `design/` (82 planches mobiles + 78 du zip, dont les variantes PC et l'administration). Socle : types du monde, seed (Alex T., vols AE 812/816, NO 905…), `core/argent` + `core/regles` (commission 12,5 % / 10 % Pass, plafond = prix équivalent neuf, échéance J-1), comptes/session, kit UI (deux faces), routeur, e2e. **Phase 1 : écrans d'accès**, puis le recto.

## Phase 1 — Accès, version mobile (26 oct. 2026)
Trois agents en parallèle (`nx/entree`, `nx/acces`, `nx/profil`), fusionnés. 12 écrans mobiles de la série 4 : `/ouverture` (panneau à palettes), `/langue`, `/promesses`, `/inscription` (consentements, Apple/Google en démo), `/code` (code de démonstration 482915, 3 essais, renvoi 30 s), `/connexion` (clé d'accès simulée), `/profil`, `/partage`, `/bienvenue-notifications`, `/carte`, `/identite`, `/pret`. Parcours complet testé de bout en bout (`e2e/parcours.spec.ts`). **Variantes PC non faites** (consigne : mobile d'abord) ; elles restent à faire (planches `Web…`).
Points à retenir : l'inscription exige la case des conditions ; `compte.partage` a 3 clés pour 4 interrupteurs (le rappel J-1 est dans la tranche `profil`) ; `App.svelte` réinstancie brièvement l'ancien écran au changement de route (ne pas rediriger dans un `onMount` sans tester `location.pathname`).
Suite : phase 2, le recto (accueil double face, radar, recherche, résultats, offre, paiement, confirmation).

## Phase 2 — Accueil double face, radar, reventes de la semaine (agent `nx/accueil`)
`src/apps/voyager/` : `/` (compte) et `/explorer` (public, version réduite) partagent `Accueil.svelte` ; face mémorisée dans `session.face` (`nx-dawn` pour Voyager, `nx-flap` pour Mes actifs, fondu si mouvement réduit). `/radar` (radar polaire, étiquettes sans recouvrement, curseur de budget, liste alternative) et `/revente` (pile Passer / Je le prends + liste triable) sont publics. Calculs purs testés : `radar.ts`, `reventes.ts`, `portefeuille.ts`, `tendances.ts`, `accueil.ts`, `format.ts`. L'accueil provisoire est supprimé ; `/indices` tient la place « Bientôt » dans `_socle/routes.ts` (à retirer par le verso).
À savoir : `core/argent.ts` produit des espaces ordinaires (pas insécables) malgré la constante `NBSP` : l'accueil les convertit à l'affichage (`format.nb`). Les e2e qui touchent les drops recalent les instants sur l'heure de Montréal (le processus de test peut être dans un autre fuseau).

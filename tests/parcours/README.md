# tests/parcours — parcours en 3 touches (AM-180)

Rejoue dans un vrai Chromium (téléphone émulé 390 × 844, tactile) les parcours de la carte
`docs/maquettes-v3/Parcours.dc.html`, en comptant les touches depuis l'accueil du rôle, contre l'application
`apps/web` en mode démo (mocks).

```
pnpm --filter @afrimove/parcours test            # construit apps/web, lance « vite preview » sur un port libre 5200-5999
PARCOURS_APP_URL=http://localhost:5xxx pnpm --filter @afrimove/parcours test   # application déjà lancée
PARCOURS_SANS_BUILD=1 ...                        # réutilise apps/web/dist
PARCOURS_ECARTS=1 ...                            # joue les écarts connus comme des tests ordinaires (ils échouent)
```

Chromium : `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, sinon `$PLAYWRIGHT_BROWSERS_PATH/chromium` (`/opt/pw-browsers`).

## Règle de comptage

- L'accueil du rôle est ouvert, le compteur part de zéro.
- Une touche = un appui sur un contrôle de l'écran (lien, bouton, siège, interrupteur, zone photo).
- Un code tapé sur le clavier numérique de l'application (PIN) = **une** touche, comme la carte (« 3 · PIN du
  superviseur ») ; le banc vérifie aussi les appuis bruts (un par chiffre) contre ses étapes déclarées.
- Remplir un champ texte ne compte pas (« Photo + qui + où, 1 écran »).
- Le banc laisse l'écran se poser avant chaque appui (le DOM ne bouge plus depuis 250 ms) : une personne regarde
  l'écran avant de toucher.

## Écarts connus

`ecartConnu()` (support/contexte.ts) écrit le scénario attendu et le joue avec `it.fails` : il passe tant que
l'écart existe et casse le jour où l'application est corrigée (retirer alors la marque). Liste et détails dans le
rapport du ticket AM-180.

Écarts restants (le lien « bandeau colis » et « Groupe · bus entier » sont corrigés et jouent comme des tests ordinaires) :

- Cadence : le 2e billet coûte 2 touches (« Billet suivant » après chaque vente) — décision de conception.
- Modules : l'interrupteur demande le PIN du patron (3 touches au lieu de 2) — décision de conception.
- Livreur moto : « Accepter » ouvre la vue du client, sans action « remettre » (code + photo) pour le livreur.

## Fichiers

- `scenarios/voyageur.test.ts`, `guichet.test.ts`, `exploitation.test.ts` : les 16 fonctions de la règle.
- `scenarios/autres.test.ts` : les autres cases chiffrées de la carte (monter en route, réseau, vendeur, dépôt…).
- `scenarios/carte.test.ts` : chaque case de la carte ouvre son écran.
- `support/` : serveur (globalSetup), téléphone et compteur de touches.

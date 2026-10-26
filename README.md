# NexG-TT

*Next Generation Travel Ticket* — le billet devient un droit de voyage : on l'achète (neuf, revente, drop, agence), on le garde ou on le revend à prix encadré, on nomme le voyageur à la fin (J-1).

PWA **Svelte 5 + TypeScript + Vite**, backend simulé dans le navigateur (`localStorage`). **Mode démo** : aucun paiement réel, données et compagnies fictives.

```bash
npm install
npm run dev        # http://localhost:5173
npm run check      # types + tests unitaires
npm run e2e        # tests de bout en bout (Playwright, Chromium)
```

Démonstration : « lundi 12 octobre 2026 » (Alex T., `ACC-0412`) ; `?maintenant=2026-12-13T10:00` rejoue une autre date. Code de vérification de démonstration : `482915`.

État : **phase 1 — accès (mobile)** faite : ouverture, langue, promesses, inscription, code, clé d’accès, profil, partage, notifications, carte, identité, espace prêt. Ensuite : le recto (Voyager), puis le verso (Mes actifs) ; variantes PC en dernier. Voir `docs/ecrans.md`.

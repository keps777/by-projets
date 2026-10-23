# Journal

## 2026-10-22/23 · Construction initiale (branche devOnassureMe)
- Socle : noyau de calcul pur testé, store, routeur, kit UI, moteur de paie avec rattrapage.
- 9 fonctionnalités développées en parallèle sur des branches `feat/*` (auth, accueil, santé, école, logement, auto, coffres+score, services, entreprise), puis `feat/pilotage` et `feat/integration` (coutures + 33 e2e), toutes fusionnées.
- État : `npm run check` vert (456 tests), `npm run e2e` 33/33, build PWA OK.
- À faire ensuite : brancher un vrai backend (voir supabase/schema.sql), vrais SMS/push, vraie caméra QR, textes réglementaires à compléter ([ÉTABLISSEMENT AGRÉÉ COBAC], [ASSUREUR AGRÉÉ CIMA]), arbitrages listés dans docs/ecarts-maquettes.md.
- Restes connus : diaspora non liée à la vraie facture santé ; coffre « Projet maison » du logement absent de la tranche coffres ; mensualités école/auto/solaire sans points de score ; case d'accord du contrat auto partiellement masquée par le pied collant ; contrôles de la face cachée de la carte score encore focalisables.

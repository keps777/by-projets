# Journal

## 2026-10-24 · Construction initiale (branche DevAfriMove)
- Socle : domaine (monde simulé, 13 rôles), transactions partagées, sceau des billets, kit visuel 3D verre dépoli.
- 10 applications développées en parallèle (entrée, voyager, règlement, route/covoit, colis, guichet, terrain, superviseur, patron, siège) puis une passe d'intégration (coutures, e2e, liens, stockage).
- État : `npm run check` vert (537 tests), `npm run e2e` 112/112, build PWA OK, 99 routes.
- À faire ensuite : vrai backend (API, base, paiements MoMo/OM, SMS/WhatsApp, push), scan caméra réel, thème clair, traduction complète en/pcm, écran de notifications des agents.

## Dock à quatre onglets et direct en fenêtre
- Dock : **Voyager · Covoit | orbe | Billets · Moi** (plus d'onglet Direct). `/direct`, `/direct/ilot`, `/direct/retard` restent des liens profonds, rattachés à « Billets ».
- « Suivre ce bus » (page Billets) ouvre le contenu de Direct dans une grande fenêtre (`DirectFeuille`), sans quitter la page.
- Covoiturage fusionné : sélecteur Voyageur | Conducteur, profil conducteur obligatoire (`/moi/conducteur`), véhicule 3D, démo vivante.

## Covoit : bouton flottant ; orbe : carrousel de personnages
- Covoiturage : plus de sélecteur Voyageur | Conducteur en en-tête (il faisait doublon). Le bouton flottant « Je conduis » / « Je voyage » reste toujours visible et ouvre un petit choix **Passager | Conducteur** ; le balayage horizontal et la mémorisation du mode sont conservés.
- Orbe : le groupe « Changer de personnage » devient un carrousel de tous les personnages (voyageur, conducteur, guichet, quai, chauffeur, convoyeur, contrôleur, superviseur, patron, comptable, relais, livreur, vendeur, tous les parcours).
- Édition : `VITE_EDITION=particulier` à la construction masque le carrousel (application grand public) ; par défaut `agence` (démonstration). Voir `src/core/edition.ts`.

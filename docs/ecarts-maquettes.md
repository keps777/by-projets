# Écarts et choix par rapport aux maquettes AfriMove V5

Les chiffres des maquettes sont des exemples arrondis ; l'application les **recalcule sur le monde simulé** (départs, billets, caisses). Principaux choix :

| Sujet | Maquette | Choix |
|---|---|---|
| Prix | 7 500 F (BX VIP), frais de service 500 F | Prix du départ (7 000 Classique / 7 500 VIP), frais « offerts » ; prix dynamique du patron **désactivé par défaut** (le panorama et le paiement utilisent le même `prixDuDepart`) |
| Persona | « Aïcha Nguemo », 1 650 pts, « Maman » | Aïcha Ndiba (`p-aicha`), 1 480 pts, proches Marie et Paul |
| Panorama | 16 départs, 4 lignes max par tranche | 14 bus + 5 covoiturages demain, 3 lignes puis « + N autres » |
| Capacités | 40 / 70 places | 50 Classique, 30 VIP (`capacite` du départ) |
| Arrêts en route | listes contradictoires (convoyeur / chauffeur) | une seule liste : Mbankomo, Boumnyebel, Pouma, Edéa, Yassa |
| Remboursement | 10 % jusqu'à 2 h avant | idem ; intégral si la compagnie annule |
| Caisse | écart toléré 1 000 F (caisse) / 2 000 F (rapport) | tolérance 1 000 F, au-delà validation du superviseur ; > 2 000 F transmis au patron |
| Parcours | 19 | 20 |
| Alpha–Oméga | convention avec « Oméga » | partenaires = les 4 autres compagnies du monde |
| Trésorerie 18,4 M, 41 bus, 87 % | chiffres figés | calculés ; tuile « Financement » au lieu de la trésorerie |
| Thème clair | proposé | mémorisé mais non implémenté (l'app reste sombre) |

À arbitrer : codec de stockage `localStorage` (format colonnes, lossless), superviseur limité à sa compagnie, scan caméra non testé (aucune caméra dans l'environnement), paiements MoMo/OM/SMS/WhatsApp simulés.

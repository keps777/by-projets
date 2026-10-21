# Kit UI transport (AM-007)

Composants React 19 + CSS modules, couleurs et polices par variables `--am-*` de `@afrimove/design`
(l'application charge `@afrimove/design/tokens.css` et `fonts.css` une fois). Tout s'importe depuis
`@afrimove/ui`.

| Composant           | Maquette             | Usage                                                                                                                                                                                                  |
| ------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `LigneDepart`       | Main                 | `<LigneDepart heure="08:00" compagnie="Bêta Express" classe="VIP" classePremium placesLibres={9} remplissage={0.7} prix={7500} href="..." />` ; `variante="covoiturage"` avec `conducteur` et `detail` |
| `VoletsDestination` | Main, Systeme        | `<VoletsDestination code="DLA" libelle="Douala" />` ; les lames basculent quand le code change                                                                                                         |
| `PlanSieges`        | SiegePay, Controleur | mode choix : `nombre`, `pris`, `toi`, `selection` / `onSelectionChange`, `max`, `disposition`, `chauffeur` ; mode `controle` : `scannes`, `sansBillet`, `colonnes`, `onSiege`                          |
| `FriseArrets`       | Direct               | liste d'arrêts `passe`, `en-cours` (pulse), `prochain`, avec `montees` pour une montée en route                                                                                                        |
| `FriseColis`        | ColisCode            | `etapeCourante` de 0 à 4 et `details` par étape                                                                                                                                                        |
| `CartePersonne`     | Covoit, Course       | avatar à initiales, vérifié, note, nombre de trajets                                                                                                                                                   |
| `CodeQr`            | Pass                 | QR en SVG (bibliothèque `qrcode`), `valeur`, `taille`, `libelle`                                                                                                                                       |
| `GrosCode`          | Pass, ColisCode      | 4 ou 6 chiffres, jamais sous 28 px                                                                                                                                                                     |
| `CarteBillet`       | Pass                 | souche DLA / YDE, départ, date, siège, classe, QR et code                                                                                                                                              |
| `DemoTransport`     | toutes               | page de démo pour le banc                                                                                                                                                                              |

Accessibilité : chaque siège porte `aria-label="Siège 7, libre"` (états libre, pris, choisi, à toi ;
en contrôle : billet scanné, occupé sans billet, libre). L'animation des volets et la pulsation des
frises s'arrêtent quand le système demande de réduire les animations (`prefers-reduced-motion`), et
la propriété `anime={false}` la coupe aussi.

Tests : `pnpm --filter @afrimove/ui run test`.

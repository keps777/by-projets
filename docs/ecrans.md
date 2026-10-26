# Écrans de NexG-TT : maquette → route → phase

Les maquettes sont dans `design/` (sources `.dc.html` de Claude Design ; le texte de chaque planche est dans `design/digest/`). Le **texte visible** d'une planche se lit vite avec `design/digest/<série>-<n°>.txt` ; la **mise en page exacte** (couleurs, tailles, espacements) se lit dans la source `design/mobile-<k>/<n°>.dc.html` (chercher les `style="…"` du bloc `<x-dc>`). Les variantes PC portent le préfixe `Web…` dans `design/maquettes/` (zip « Ce que chacun y gagne », 78 planches).

Face **jour** (recto · Voyager, ciel `#EEF3F8`) pour l'accès, l'accueil et le voyage ; face **nuit** (verso · Mes actifs, `#0D0E11`) pour le portefeuille, le marché et l'administration.

## Phase 1 — Accès (pages de connexion)  ·  `src/apps/entree`, `src/apps/acces`, `src/apps/profil`
| Écran | Mobile | PC (`design/maquettes/`) | Route | Dossier |
|---|---|---|---|---|
| Lancement : le panneau qui tourne | `mobile-4/00` | `WebOuverture`, `Ouverture` | `/ouverture` | entree |
| Langue et région | `mobile-4/01` | `WebLangue`, `Langue` | `/langue` | entree |
| Trois promesses (carrousel) | `mobile-4/02` | `WebPromesse`, `Promesse` | `/promesses` | entree |
| Créer un compte (courriel ou téléphone) | `mobile-4/03` | `WebInscription`, `Inscription` | `/inscription` | acces |
| Code de vérification | `mobile-4/04` | `WebCode`, `Code` | `/code` | acces |
| Bon retour · clé d'accès | `mobile-4/05` | `WebConnexion`, `Connexion` | `/connexion` | acces |
| Étape 2 · faisons connaissance | `mobile-4/06` | `WebProfil`, `Profil` | `/profil` | profil |
| Étape 3 · vos choix de partage | `mobile-4/07` | `WebConfidentialite`, `Confidentialite` | `/partage` | profil |
| Étape 4 · notifications en contexte | `mobile-4/08` | `WebNotifications`, `Notifications` | `/bienvenue-notifications` | profil |
| Carte de paiement, facultative | `mobile-4/09` | `WebCarte`, `CartePlusTard` | `/carte` | profil |
| Identité, facultative | `mobile-4/10` | `WebIdentite`, `Identite` | `/identite` | profil |
| Votre espace est prêt | `mobile-4/11` | `WebPret`, `Pret` | `/pret` | profil |

Parcours : `/ouverture` → `/langue` → `/promesses` → `/inscription` → `/code` → `/profil` (2/4) → `/partage` (3/4) → `/bienvenue-notifications` (4/4) → `/pret` → `/` (accueil). `/carte` et `/identite` sont aussi des détours (`?retour=…`) que les achats et rereventes emprunteront. `/connexion` : le retour d'un compte existant (clé d'accès simulée, repli par code).

## Phase 2 — Recto · Voyager (jour)
Accueil double face (`mobile-3/00`), radar (`mobile-3/01`), billets qui cherchent un voyageur (`mobile-3/02`), rechercher (`03`), résultats neuf/revente/agences (`04`), détail de l'offre (`05`), paiement démo (`06`), confirmation (`07`), vitrine agence (`08`), mon voyage J-63 (`09`), nommer le voyageur (`10`), prêt à voyager (`11`), bagages (`12`–`14`), versions web (`15`–`22`), intentions d'achat (`23`–`27`).

## Phase 3 — Verso · Mes actifs (nuit)
`mobile-2/00`–`37` : accueil Mes actifs, cours et carnet d'ordres, ordre à cours limité, indices, vendre ou attendre, solde et grand livre, portefeuille, droit de voyage, revendre, échéances, import, compte, drops, alertes, Pass, soute, transferts (`21`–`26`), notifications (`27`–`28`), aide (`29`–`30`), administration (`31`–`34`), intentions (`35`–`37`).

## Fondations
`mobile-5/00` manifeste, `01` billet qui se retourne, `02` cycle de vie, `03` design system (couleurs, typographies, composants, principes) — voir `src/ui/nexg.css`.

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

## Phase 2 — Recto · Voyager (jour) — mobile d'abord
Planches : `design/mobile-3/NN.dc.html` (texte : `design/digest/m3-NN.txt`) ; rendu : équivalent de `design/maquettes/` (Main, VoyageRadar, Spontane, Recherche, Resultats, Offre, Paiement, Confirmation, Agence, Voyage, Finaliser, Embarquement, Bagages, BagageAcheter, BagageTransfert, + intentions : voir digests m3-23…27).

| Écran | Planche | Route | Agent |
|---|---|---|---|
| Accueil double face (Voyager ⇄ Mes actifs) | m3-00 (+ `mobile-2/00` face nuit) | `/` (et `/explorer` sans compte) | accueil |
| Explorer — radar des destinations | m3-01 | `/radar` | accueil |
| Ces billets cherchent un voyageur | m3-02 | `/revente` | accueil |
| Rechercher | m3-03 | `/rechercher` | recherche |
| Résultats — neuf, revente, agences | m3-04 | `/resultats?de=YUL&vers=CDG&jour=2026-12-18&n=1` | recherche |
| Détail de l'offre | m3-05 | `/offre/:offreId` (ex. `revente:d-r816`, `neuf:v-ae816`) | recherche |
| Vitrine agence partenaire | m3-08 | `/agence/:agenceId` | recherche |
| Paiement (démo) | m3-06 | `/paiement/:offreId` | achat |
| Confirmation | m3-07 | `/confirmation/:droitId` | achat |
| Mon voyage — J-63 | m3-09 | `/voyage/:droitId` | achat |
| Nommer le voyageur (J-1) | m3-10 | `/nommer/:droitId` | achat |
| Prêt à voyager | m3-11 | `/pret-a-voyager/:droitId` | achat |
| Mes bagages — étiquettes et franchise | m3-12 | `/bagages` | bagages |
| Ajouter des bagages (même vol) | m3-13 | `/bagages/ajouter?droit=:droitId` | bagages |
| Bagage transféré | m3-14 | `/bagages/transfere` | bagages |
| Publier une intention d'achat | m3-23 | `/intention/nouvelle` | bagages |
| Réserver les fonds | m3-24 | `/intention/fonds` | bagages |
| Mes intentions et propositions | m3-25 | `/intentions` | bagages |
| Une proposition reçue | m3-26 | `/intentions/:id/proposition/:pid` | bagages |
| Accord conclu | m3-27 | `/intentions/:id/accord` | bagages |

Les planches Web (`m3-15…22`) sont reportées. **Routes du verso réservées** (page « Bientôt » tient la place, voir `apps/_socle/routes.ts`) : `/portefeuille`, `/droit/:id`, `/cours/:id`, `/revendre/:id`, `/transferer/:id`, `/echeances`, `/solde`, `/drops`, `/pass`, `/compte`, `/notifications`, `/alertes`, `/aide`. Les écrans du recto y renvoient par de simples liens.

## Phase 3 — Verso · Mes actifs (nuit) — mobile d'abord
Planches : `design/mobile-2/NN.dc.html` (texte : `design/digest/m2-NN.txt`) ; rendu : équivalent de `design/maquettes/`. L'administration (`mobile-2/31`–`34`, console PC) est reportée avec les variantes PC.

| Écran | Planche | Route | Agent |
|---|---|---|---|
| Portefeuille | m2-06 | `/portefeuille` | portefeuille |
| Mon droit de voyage (billet recto/verso) | m2-07 | `/droit/:droitId` | portefeuille |
| Calendrier des échéances | m2-09 | `/echeances` | portefeuille |
| Importer un billet externe | m2-10 | `/importer` | portefeuille |
| Indices NexG | m2-03 | `/indices` | portefeuille |
| Cours du vol et carnet d'ordres | m2-01 | `/cours/:volId` | marche |
| Ordre à cours limité | m2-02 | `/ordre/:volId` | marche |
| Vendre ou attendre (liquidité) | m2-04 | `/liquidite/:droitId` | marche |
| Revendre | m2-08 | `/revendre/:droitId` | marche |
| Tableau des intentions d'achat | m2-35 | `/marche-intentions` | marche |
| Proposer mon billet / issue | m2-36, m2-37 | `/marche-intentions/proposer/:intentionId`, `/marche-intentions/issue/:intentionId` | marche |
| Solde et grand livre | m2-05 | `/solde` | compte |
| Compte | m2-11 | `/compte` | compte |
| Pass NexG (abonnement) | m2-15 | `/pass` (public) | compte |
| Alertes | m2-14 | `/alertes` | compte |
| Centre de notifications | m2-27 | `/notifications` | compte |
| Préférences de notifications | m2-28 | `/notifications/preferences` | compte |
| Aide / Contacter l'assistance | m2-29, m2-30 | `/aide`, `/aide/contact` | compte |
| Drop membres en direct / épuisé | m2-12, m2-13 | `/drops` | transferts |
| Transférer : choisir le proche | m2-21 | `/transferer/:droitId` | transferts |
| Proche sans compte / confirmer / échéance proche / fait / erreur | m2-22…26 | `/transferer/:droitId/sans-compte`, `/confirmer`, `/echeance`, `/fait`, `/erreur` | transferts |
| Soute du vol | m2-16 | `/soute/:volId` | soute |
| Revendre mon bagage inutilisé | m2-17 | `/bagages/vendre` | soute |
| Chercher un bagage sur ce vol | m2-18 | `/bagages/demande` | soute |

Les écrans réservés pas encore construits sont listés dans `src/apps/_socle/reservees.ts` (page « Bientôt ») ; **ne touche pas à ce fichier** : déclarer sa route dans son dossier suffit à remplacer la page « Bientôt ».

## Phase 4 — Variantes PC et administration

Tous les écrans de l'application ont une variante PC (≥ 900 px, planches `Web…`) dans le même composant ; routes inchangées. La console d'administration est réservée au PC (`acces: 'admin'`, MFA simulée, entrée `/admin` : « Entrer comme adm-01 (démo) »).

| Écran | Route | Dossier |
|---|---|---|
| Entrée de la console | `/admin` | admin |
| Registre des droits (gel / dégel) | `/admin/droits` | admin |
| Chaîne de détention d'un droit | `/admin/droits/:id` | admin |
| Drops et agences | `/admin/drops` | admin |
| Journal d'audit | `/admin/audit` | admin |


## Fondations
`mobile-5/00` manifeste, `01` billet qui se retourne, `02` cycle de vie, `03` design system (couleurs, typographies, composants, principes) — voir `src/ui/nexg.css`.

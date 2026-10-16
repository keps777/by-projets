# AfriMove · tickets de développement tirés des maquettes V3

Version 2 (web d'abord) · 16 octobre 2026 · 121 tickets · 619 points · 17 épiques · 77 planches couvertes · livraison complète visée le **20 novembre 2026**.

Source unique : l'artefact « AfriMove — Maquettes v3 » (claude.ai/artifact/XzM5PNfm9ied8AkgJS4CGh), copié dans `/mnt/project-files/afrimove/maquettes-v3/`. Contexte métier : `afrimove-projet.html`. Version machine de ce fichier : `tickets.json` (liste de tickets) et `epiques.json`.

## 1. Choix d'architecture (décision de Luther du 16 octobre : web d'abord, boutiques ensuite)

- **Stack** : monorepo TypeScript (pnpm + Turborepo). Une seule **application web installable (PWA : React + TypeScript + Vite)** pour tous les rôles, utilisable sur téléphone et ordinateur (les maquettes disent « ce téléphone, même app » et « l'app passe en mode relais ») ; la salle de contrôle est la route `/controle` de cette même app ; **NestJS + PostgreSQL** pour l'API. Le même code sera emballé avec Capacitor pour le Play Store et l'App Store quand Luther aura les licences (AM-184). Le détail des choix est dans le document « AfriMove · Architecture technique ».
- **Routes** : la notation `/(role)/ecran` désigne un groupe de routes (dossier, absent de l'URL) et `[param]` un segment dynamique ; chaque planche a son fichier `apps/web/src/routes/<route>.tsx` et son dossier `apps/web/src/ecrans/<Planche>/`.
- **Fidélité « exactement comme les maquettes »** : chaque écran est comparé au pixel à sa planche par un banc automatique (AM-004), seuil 3 % de pixels différents, dans le navigateur à 390×844 (1280×900 pour la salle de contrôle).
- **Données de démo** : un scénario par planche qui reproduit exactement les valeurs affichées, au-dessus d'un monde commun. Les contradictions entre planches (section 6) ne sont pas corrigées en silence.
- **Contrats d'abord** : les écrans parlent à un client d'API typé avec un adaptateur mock ; le backend implémente les mêmes contrats. Écrans et backend avancent donc en parallèle.
- **Échéance** : tout livré et déployé en dev pour le 20 novembre 2026. Les vagues ci-dessous se chevauchent pour tenir cette date ; P0 = socle du jour J, P1 = nécessaire au lancement, P2 = livré masquable.

## 2. Règles pour les agents qui travaillent en parallèle

- Un ticket = un périmètre de fichiers (champ `perimetre`). Un agent ne modifie rien hors de son périmètre ; s'il lui manque quelque chose d'un autre périmètre, il le note dans sa PR et ouvre un ticket, il ne le fait pas lui-même.
- Les composants partagés ne sont modifiés que par les tickets du kit UI (AM-005 à AM-008). Un écran qui a besoin d'une variante la crée localement dans `apps/web/src/ecrans/<Planche>/` et le signale.
- Les routes existent toutes dès AM-009 (écrans vides) : un ticket d'écran ne touche que son fichier de route et son dossier d'écran, jamais un `layout.tsx`.
- Un ticket ne démarre que quand toutes ses `dependances` sont au moins « En test local » ; un ticket d'écran peut démarrer dès que le kit, la coquille et son contrat sont fusionnés, sans attendre le backend.
- Branche `am-XXX-titre-court`, une PR par ticket, CI verte + rapport du banc joint, puis fusion : le déploiement en dev est automatique (AM-018).
- Colonnes du tableau : Prêt → En cours → En test local (PR ouverte, banc et tests passés en local) → Déployé en dev (fusionné et visible en dev = terminé).
- Marque : jamais « révolution, disruption, digitaliser, plateforme, écosystème, solution innovante, fini les arnaques » dans un texte de l'app ; on vouvoie dans l'app sauf où la maquette tutoie (la maquette fait foi).

## 3. Vagues et calendrier

| Vague | Contenu | Fenêtre | Tickets | Points |
|---|---|---|---|---|
| 0 | Fondations | 17 → 24 oct. | 18 | 89 |
| 1 | Socle agence (jour J) | 24 oct. → 4 nov. | 35 | 199 |
| 2 | Voyageur, colis, paiements | 27 oct. → 7 nov. | 17 | 93 |
| 3 | Patron, comptable, salle de contrôle | 3 → 12 nov. | 16 | 77 |
| 4 | Covoit, partenaires, financement, USSD | 3 → 13 nov. | 30 | 137 |
| 5 | Qualité et mise en service | 13 → 20 nov. | 5 | 24 |

Chemin critique : AM-001 → AM-010 → AM-011 → AM-017 → AM-160 → AM-164 → AM-114 → AM-110, soit 58 points. Tout le reste peut tourner en parallèle autour. Une estimation est en points (1 point ≈ une demi-journée d'un agent) ; 619 points en 5 semaines suppose une douzaine d'agents en parallèle en vagues 1 à 4.

## 4. Épiques

| Épique | Titre | Tickets | Points |
|---|---|---|---|
| E00 | Fondations | 18 | 89 |
| E01 | Première ouverture et compte | 4 | 11 |
| E02 | Voyageur · acheter un billet | 7 | 41 |
| E03 | Voyageur · en route et services | 7 | 32 |
| E04 | Covoiturage | 5 | 24 |
| E05 | Colis côté voyageur | 4 | 16 |
| E06 | Guichet | 7 | 39 |
| E07 | Quai et bus | 5 | 26 |
| E08 | Supervision et rapport du soir | 7 | 35 |
| E09 | Patron | 10 | 47 |
| E10 | Comptable | 5 | 24 |
| E11 | Réglages et modules | 7 | 29 |
| E12 | Financement et inter-agences | 6 | 30 |
| E13 | Partenaires | 10 | 39 |
| E14 | Salle de contrôle web | 1 | 8 |
| E15 | Socle technique : hors ligne, paiements, messages | 13 | 102 |
| E16 | Qualité et lancement | 5 | 27 |

## 5. Planche → route → ticket

| Planche | Titre dans les maquettes | Route | Ticket(s) |
|---|---|---|---|
| Splash | 0a · Première ouverture · logo, jingle, langue | `/bienvenue` | AM-020 |
| Connexion | 0b · Connexion · numéro + code SMS · WhatsApp · USSD | `/connexion` | AM-021 |
| Tuto | 0c · Tutoriel · 3 écrans · tout en 3 touches | `/tutoriel` | AM-022 |
| Main | 1 · Accueil — départs en direct (1 touche vers tout) | `/(voyageur)/voyager` | AM-030, AM-183 |
| SiegePay | 2 · Siège + paiement en un écran (touche 2 → 3) | `/(voyageur)/depart/[departId]` | AM-033 |
| Pass | 3 · Billet · QR · code 4 chiffres | `/(voyageur)/billet/[billetId]` | AM-035 |
| Direct | 4 · Mon bus en direct · prévenir un proche | `/(voyageur)/billet/[billetId]/direct` | AM-040, AM-183 |
| Reseau | 5 · Le réseau en direct · toutes les compagnies | `/(voyageur)/reseau` | AM-036 |
| Covoit | 6 · Covoiturage · interurbain et en ville | `/(voyageur)/covoit` | AM-050 |
| Paiement | 7 · Paiement · MoMo · OM · carte · depuis l'étranger | `/(voyageur)/paiement/[commandeId]` | AM-034 |
| Course | 8 · Moto ou taxi vers la gare | `/(voyageur)/course` | AM-042 |
| MainVille | 1b · Accueil · mode « dans la même ville » (ville détectée, départ, arrivée) | `/(voyageur)/voyager/ville` | AM-032 |
| CovoitVille | 6b · Covoiturage · en ville · passager | `/(voyageur)/covoit/ville` | AM-051 |
| CovoitConducteur | 6c · Covoiturage · je conduis (proposer mon trajet) | `/(voyageur)/covoit/conducteur` | AM-183, AM-052 |
| MainFiltres | 1c · Accueil · filtre déroulant : classe, compagnies (une, plusieurs, toutes), préférées | `/(voyageur)/voyager/filtres` | AM-031 |
| Arret | 9 · Monter en route · arrêts | `/(voyageur)/monter-en-route` | AM-041 |
| Groupe | 10 · Groupe · bus entier · cagnotte | `/(voyageur)/groupe` | AM-183, AM-043 |
| USSD | 11 · USSD *123# et WhatsApp · téléphone simple | `/(voyageur)/sans-internet` | AM-045 |
| Moi | 12 · Moi · fidélité · parrainage · proches · historique | `/(voyageur)/moi` | AM-183, AM-046 |
| ColisEnvoi | 13 · Envoyer un colis · scan + formulaire en un écran | `/(voyageur)/colis` | AM-060 |
| ColisCode | 14 · Colis · code · suivi · photo | `/(voyageur)/colis/[colisId]` | AM-061, AM-183 |
| Relais | 15 · Points relais · carte | `/(voyageur)/colis/[colisId]/relais` | AM-062 |
| Livraison | 16 · Livraison moto en cours | `/(voyageur)/colis/[colisId]/livraison` | AM-183, AM-063 |
| Proche | 17 · Payer le voyage d'un proche · depuis l'étranger | `/(voyageur)/proche` | AM-044 |
| Guichet | 18 · Guichet — accueil de l'agent (tout à 1 touche) | `/(guichet)/accueil` | AM-070 |
| Vente | 19 · Vente en un écran · siège · voyageur · paiement · imprimer | `/(guichet)/vendre` | AM-071, AM-183 |
| Cadence | 20 · Mode cadence (5 h) · 2 touches par billet | `/(guichet)/cadence` | AM-072, AM-183 |
| CadenceBillet | 20b · Cadence · la suite : billet imprimé, numéro, siège, caisse, SMS | `/(guichet)/cadence/vendu` | AM-072 |
| CadenceQuai | 20c · Cadence · au quai : scan, nom et pièce complétés, embarquement | `/(quai)/completer` | AM-081 |
| GuichetColis | 21 · Colis au guichet · étiquette | `/(guichet)/colis` | AM-073 |
| Depot | 22 · Dépôt d'un colis prépayé · code | `/(guichet)/depot` | AM-074 |
| Quai | 23 · Quai · scan · comptage · soute | `/(quai)/embarquement` | AM-080 |
| Convoyeur | 24 · Convoyeur · vente en route | `/(bus)/convoyeur` | AM-082, AM-183 |
| Chauffeur | 25 · Chauffeur · feuille de route · incidents | `/(bus)/chauffeur` | AM-083, AM-183 |
| Controleur | 26 · Contrôleur inopiné | `/(controle)/inopine` | AM-084 |
| Caisse | 27 · Caisse · ouverture · fermeture · écart | `/(guichet)/caisse` | AM-076 |
| Superviseur | 28 · Superviseur de gare · PIN · annulations | `/(superviseur)/gare` | AM-090 |
| SuperviseurValider | 28b · Superviseur · valider une clôture avec le PIN | `/(superviseur)/cloture/[sessionId]` | AM-091 |
| SuperviseurVoir | 28c · Superviseur · voir et décider une annulation avec le PIN | `/(superviseur)/annulation/[demandeId]` | AM-092 |
| SuperviseurEquipe | 28d · Superviseur · équipe, PIN, comptes | `/(superviseur)/equipe` | AM-093, AM-183 |
| SuperviseurDebloquer | 28e · Superviseur · débloquer un guichet hors ligne depuis 12 h | `/(superviseur)/debloquer/[appareilId]` | AM-094 |
| RapportSoir | 29 · Rapport du soir · WhatsApp 21 h | `/(patron)/rapport` | AM-095 |
| Patron | 30 · Patron — accueil (tout à 1 touche) | `/(patron)/aujourdhui` | AM-100 |
| Assistant | 31 · L'assistant du patron | `/(patron)/assistant` | AM-104 |
| Analyses | 32 · Analyses · semaine · lignes · bus | `/(patron)/analyses` | AM-106 |
| Comptable | 33 · Comptable · exports · rapprochement | `/(patron)/comptable` | AM-110 |
| Config | 34 · Configuration · lignes · tarifs · équipe | `/(patron)/reglages` | AM-120 |
| Modules | 35 · Modules · activer ou masquer (les 12) | `/(patron)/reglages/modules` | AM-125 |
| Financement | 36 · Financement · avance · crédit matériel · salaires | `/(patron)/financement` | AM-130 |
| InterAgences | 37 · Colis entre compagnies · correspondance | `/(patron)/inter-agences` | AM-132 |
| RelaisApp | 38 · App du point relais | `/(relais)/accueil` | AM-140 |
| Livreur | 39 · App du livreur moto | `/(livreur)/accueil` | AM-183, AM-144 |
| Conducteur | 40 · Conducteur covoiturage | `/(voyageur)/covoit/proposer` | AM-053 |
| Vendeur | 41 · Vendeur ambulant · commission | `/(vendeur)/accueil` | AM-147 |
| Controle | 42 · Salle de contrôle (web) | `/controle` | AM-150 |
| Parcours | 43 · Parcours en 3 touches — chaque case ouvre son écran | `(spécification des tests de parcours)` | AM-009, AM-180 |
| Systeme | 44 · Système v3 · polices · couleurs · composants | `(référence du design system)` | AM-003, AM-005, AM-007 |
| AssistantReponse | 31b · L’assistant répond · pourquoi Bafoussam baisse | `/(patron)/assistant/reponse` | AM-105 |
| AnalysesLigne | 32b · Analyses · une ligne en détail | `/(patron)/analyses/ligne/[ligneId]` | AM-107 |
| AnalysesBus | 32c · Analyses · un bus en détail | `/(patron)/analyses/bus/[busId]` | AM-108 |
| ConfigLigne | 34b · Configuration · modifier une ligne | `/(patron)/reglages/ligne/[ligneId]` | AM-121 |
| ComptableRapprochement | 33b · Comptable · 4 transactions MoMo sans correspondance | `/(patron)/comptable/rapprochement` | AM-111 |
| ComptableApercu | 33c · Comptable · aperçu d’un export (pop-up) | `/(patron)/comptable/apercu/[exportId]` | AM-112 |
| ComptableCloture | 33d · Comptable · décembre clôturé · envoyé au cabinet | `/(patron)/comptable/cloture` | AM-113 |
| FinancementDemande | 36b · Financement · dossier envoyé · suivi | `/(patron)/financement/demande/[dossierId]` | AM-131 |
| InterAgencesConvention | 37b · Convention Alpha – Oméga | `/(patron)/inter-agences/convention/[conventionId]` | AM-133 |
| PatronEquipe | 30b · Patron · mes gares, mes gens | `/(patron)/gares` | AM-101 |
| PatronGare | 30c · Patron · une gare en détail | `/(patron)/gares/[gareId]` | AM-102 |
| PatronPersonne | 30d · Patron · une personne de l’équipe | `/(patron)/personnes/[personneId]` | AM-103 |
| ConfigEquipeListe | 34c · Réglages · la liste de l’équipe (pop-up, filtre par rôle) | `/(patron)/reglages/equipe` | AM-122 |
| ConfigPersonne | 34d · Réglages · modifier ou ajouter une personne | `/(patron)/reglages/personne/[personneId]` | AM-123 |
| ConfigRegles | 34e · Réglages · modifier une règle | `/(patron)/reglages/regles` | AM-124 |
| RelaisDevenir | 22b · Devenir point de relais · programme ouvert (app voyageur) | `/(voyageur)/moi/devenir-relais` | AM-141 |
| RelaisInscription | 22c · Devenir point de relais · la fiche en 3 min | `/(voyageur)/moi/devenir-relais/fiche` | AM-142 |
| RelaisVerification | 22d · Devenir point de relais · vérification · activation | `/(voyageur)/moi/devenir-relais/suivi` | AM-143 |
| LivreurDevenir | 23b · Devenir livreur · programme ouvert · particularités | `/(voyageur)/moi/devenir-livreur` | AM-145 |
| LivreurVerification | 23c · Devenir livreur · vérification · première course | `/(voyageur)/moi/devenir-livreur/suivi` | AM-146 |

## 6. Incohérences relevées entre les planches (à trancher)

- Billet d'Aïcha (siège 7, CNI 4471) : `BEX-DLA-270105-0142` chez Bêta Express sur le billet, `ALP-DLA-270105-0142` chez Alpha au quai.
- Mode cadence : la planche 20 dit « 2 touches par billet », la carte des parcours et le document disent 1. Choix par défaut : 1 touche en cash, 2 en MoMo.
- Tolérance d'écart : 1 000 F (Caisse, Réglages) contre ± 500 (fiche de Joseph).
- Prix Douala → Yaoundé classique : 4 000 (Réglages, Accueil) contre 5 000 dans l'aperçu des exports.
- Journal des ventes de décembre : 31 404 lignes (Comptable, Aperçu) contre 6 802 (Clôture), pour le même total de 28 414 000.
- Factures AfriMove : « abonnement + … » dans la clôture alors que le modèle est sans abonnement.
- Bus LT 412 AB : 40 places au quai, 36 sièges au contrôle, 30 places (27/30) dans la gare du patron ; LT 207 AB « Coaster 30 places ».
- Superviseurs : Mvan = Tchinda (rapport, salle de contrôle) ou O. Essomba (mes gares) ; Bafoussam = Fosso (rapport) ou T. Kamga (mes gares, aussi guichetier).
- Rapport du soir d'Alpha : la question « pourquoi le 09:30 Oméga part si vide ? » est répondue comme si le patron était Oméga.
- Gare d'Akwa à 14 h : 491 billets (superviseur), 291 (salle de contrôle), 318 (gare du patron) ; caisse 1 412 500 contre 1 412 000.
- Joseph « depuis le 5 janv. 2027 » mais son journal d'écarts est daté de décembre.
- Nombre d'écrans annoncé : 47, 51 ou 68 selon les textes ; le canevas contient 77 planches.

Ces écarts ne bloquent aucun ticket : chaque écran reproduit sa planche, et les vraies valeurs viendront de la base.

## 7. Contrôle de couverture

Vérifié le 16 octobre sur la version en ligne de l'artefact Maquettes v3 : 77 planches dans le canevas, 77 fichiers, toutes couvertes par au moins un ticket. 75 planches ont un ticket d'écran dédié ; Parcours sert de spécification aux tests des 3 touches (AM-180) et Système de référence au design system (AM-003, AM-005 à AM-008). Tous les liens entre planches mènent à une planche existante. Les boutons qui n'ont pas de planche sont regroupés dans AM-183.

## 8. Tickets

### Vague 0 · Fondations (17 → 24 oct.)

#### AM-001 · Monorepo et outillage

**Épique** E00 Fondations · **Type** fondation · **Priorité** P0 · **Estimation** 3 pts · **Échéance** 17 → 24 oct.  
**Dépend de** rien  
**Périmètre** `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.eslintrc*`, `.prettierrc`, `apps/*/package.json`, `packages/*/package.json`, `README.md`

Créer le monorepo TypeScript qui accueillera toutes les apps. pnpm workspaces + Turborepo, TypeScript strict, ESLint, Prettier, Vitest, conventions de commit. Dossiers : apps/web (React + Vite, application web installable pour tous les rôles, salle de contrôle comprise), apps/api (NestJS), packages/design, packages/ui, packages/domain, packages/fixtures, packages/contrats, packages/api-client, tools/fidelite, docs/.

Critères d'acceptation :
- [ ] `pnpm i && pnpm build && pnpm lint && pnpm test` passent à vide sur une machine neuve
- [ ] Chaque app et package existe avec un fichier d'entrée minimal et un README d'une ligne
- [ ] Alias d'import `@afrimove/<package>` résolus dans les deux apps
- [ ] Le README racine explique comment lancer chaque app et la règle d'or : un ticket = un périmètre de fichiers

Tâches :
- Mettre en place le périmètre décrit
- Écrire les tests
- Documenter l'usage dans le README du package
- Ouvrir la PR avec captures ou sortie de tests

#### AM-002 · Maquettes V3 et index dans le dépôt

**Épique** E00 Fondations · **Type** fondation · **Priorité** P0 · **Estimation** 1 pts · **Échéance** 17 → 24 oct.  
**Dépend de** AM-001  
**Planches** (toutes)  
**Périmètre** `docs/maquettes-v3/**`, `docs/tickets.*`

Copier les 77 planches de l'artefact « AfriMove — Maquettes v3 » (claude.ai/artifact/XzM5PNfm9ied8AkgJS4CGh, copie dans /mnt/project-files/afrimove/maquettes-v3/) dans docs/maquettes-v3/, avec canvas.json, les polices et un index docs/maquettes-v3/INDEX.md : planche → titre → route de l'app → ticket. Ce dossier est la source de vérité visuelle ; personne ne le modifie sans décision de Luther.

Critères d'acceptation :
- [ ] Les 77 fichiers .dc.html et canvas.json sont dans docs/maquettes-v3/ à l'identique (sha256 vérifiés)
- [ ] INDEX.md liste les 77 planches avec leur route et leur ticket, généré depuis tickets.json
- [ ] Chaque planche s'ouvre seule dans un navigateur (support.js minimal fourni pour l'affichage hors canevas)
- [ ] Le fichier tickets.md/tickets.json est aussi versionné dans docs/

Tâches :
- Mettre en place le périmètre décrit
- Écrire les tests
- Documenter l'usage dans le README du package
- Ouvrir la PR avec captures ou sortie de tests

#### AM-003 · Design tokens v3 et polices

**Épique** E00 Fondations · **Type** fondation · **Priorité** P0 · **Estimation** 2 pts · **Échéance** 17 → 24 oct.  
**Dépend de** AM-001  
**Planches** Systeme · **Route** `(référence du design system)`  
**Périmètre** `packages/design/**`

Package @afrimove/design : les 12 couleurs (Nuit #0B1019, Surface #141B28, Surface 2 #1B2435, Trait #273247, Craie #F4F0E8, Craie 2 #B5BDCB, Gris #7F8A9E, Orange #FF6A1F, Ambre #FFB547, Vert #43E39B, Rouge #FF5C5C, Bleu #6FA8FF, Profond #050810) plus les teintes d'état vues dans les maquettes (fond vert assistant #0E2A1E / bord #1E5A40, fond rouge #2A0F0F), les trois familles (Bricolage Grotesque 500/700/800 titres, Instrument Sans 400–700 texte, Geist Mono 500/700 chiffres et codes) chargées en @font-face depuis des fichiers woff2 locaux (préchargées, mises en cache par le service worker) avec replis Arial Black / Arial / Courier New, l'échelle typographique relevée dans les maquettes (10/11/12/13/14/15/18/20/28 px et plus, interlettrage des étiquettes mono .12–.14em majuscules), les rayons (12, 14, 16, 18, 22, 999), espacements, et l'animation « pulse » (opacité 1 → .35, 1,6 s, infinie).

Critères d'acceptation :
- [ ] Toutes les valeurs sont extraites des maquettes (aucune inventée) ; un test compare la palette à Systeme.dc.html
- [ ] Tailles minimales respectées : 14 px texte courant, 18 px montant, 28 px code de retrait
- [ ] Les trois polices s'affichent sur Chrome Android, Safari iOS et les navigateurs d'ordinateur
- [ ] Exports en variables CSS (`--am-*`) et en objets TypeScript typés

Tâches :
- Mettre en place le périmètre décrit
- Écrire les tests
- Documenter l'usage dans le README du package
- Ouvrir la PR avec captures ou sortie de tests

#### AM-004 · Banc de fidélité visuelle maquette ↔ app

**Épique** E00 Fondations · **Type** fondation · **Priorité** P0 · **Estimation** 5 pts · **Échéance** 17 → 24 oct.  
**Dépend de** AM-001, AM-002, AM-003  
**Planches** (toutes)  
**Périmètre** `tools/fidelite/**`

Outil tools/fidelite : Playwright capture la planche docs/maquettes-v3/<X>.dc.html à 390×844 (1280×900 pour la salle de contrôle) et l'écran correspondant de l'app servi par apps/web avec les données de démonstration, puis calcule la différence pixel (pixelmatch) et produit un rapport HTML côte à côte. Commande : `pnpm fidelite <Planche>` et `pnpm fidelite --all`. C'est l'outil qui prouve que « l'interface ressemble exactement à la maquette ».

Critères d'acceptation :
- [ ] `pnpm fidelite Main` produit maquette.png, app.png, diff.png et un pourcentage de différence
- [ ] Seuil par défaut : différence ≤ 3 % des pixels, configurable par planche avec justification écrite
- [ ] Le badge « TOUCHE n » et l'heure sont gérés (flag conception actif, horloge figée au 05/01/2027 07:38)
- [ ] Tourne en CI sur chaque PR qui touche apps/web ou packages/ui et attache le rapport

Tâches :
- Mettre en place le périmètre décrit
- Écrire les tests
- Documenter l'usage dans le README du package
- Ouvrir la PR avec captures ou sortie de tests

#### AM-005 · Kit UI · base (écran, en-tête, boutons, puces, onglets, pastilles)

**Épique** E00 Fondations · **Type** fondation · **Priorité** P0 · **Estimation** 5 pts · **Échéance** 17 → 24 oct.  
**Dépend de** AM-003  
**Planches** Systeme, Main, Guichet, Patron · **Route** `(référence du design system), /(voyageur)/voyager, /(guichet)/accueil, /(patron)/aujourdhui`  
**Périmètre** `packages/ui/src/base/**`

Composants React de base dans @afrimove/ui (CSS modules + variables du design), copiés au pixel des maquettes : Écran 390 fond nuit ; En-tête avec bouton retour rond 44 px (fond Surface, bord Trait) + titre Bricolage 18/800 + sous-titre 12 Craie 2 + élément à droite ; Bouton principal orange en bas de l'écran (libellé 15/700, sous-libellé « touche n · … », prix à droite en mono) et variante verte (assistant) ; Bouton secondaire (carte Surface, bord Trait) ; Carte d'action (les actions secondaires sont des cartes, jamais des menus) ; Puce/filtre ; Sélecteur 2 segments (Entre villes / Dans la même ville, Passager / Je conduis, avec mention « glisse pour changer ») ; Badge « TOUCHE n » (affiché seulement si le flag conception est actif) ; Pastille d'état (DIRECT avec point vert qui pulse, HORS LIGNE, BLOQUÉ, INOPINÉ, EN COURS, ACTIVE, VÉRIFIÉ, À SURVEILLER, BROUILLON, MODIFIER, SYNC, CADENCE) ; Barre d'onglets du bas (4 ou 5 entrées, fond Profond) ; Étiquette mono majuscule (titres de section ambre).

Critères d'acceptation :
- [ ] Chaque composant a une page de démonstration (route /dev/kit) qui reproduit son apparence dans Systeme.dc.html
- [ ] Règle des couleurs : en direct = vert qui pulse, en attente = ambre, bloquant = rouge
- [ ] Cibles tactiles ≥ 44 px, aria-label obligatoire sur les boutons icônes
- [ ] Aucun composant ne dépend d'un écran ; tests de rendu pour chacun

Tâches :
- Mettre en place le périmètre décrit
- Écrire les tests
- Documenter l'usage dans le README du package
- Ouvrir la PR avec captures ou sortie de tests

#### AM-006 · Kit UI · formulaires (champs, sélecteurs, PIN, codes, compteurs)

**Épique** E00 Fondations · **Type** fondation · **Priorité** P0 · **Estimation** 5 pts · **Échéance** 17 → 24 oct.  
**Dépend de** AM-003  
**Planches** Vente, SuperviseurValider, Connexion, Caisse, ConfigPersonne · **Route** `/(guichet)/vendre, /(superviseur)/cloture/[sessionId], /connexion, /(guichet)/caisse, /(patron)/reglages/personne/[personneId]`  
**Périmètre** `packages/ui/src/formulaires/**`

Composants de saisie : Champ libellé + valeur (style des maquettes, pas de bordure Material) ; Sélecteur déroulant stylé nuit ; Case à cocher et ligne cochable ; Interrupteur (Modules, Config) ; Stepper − / + (Groupe, Convoyeur) ; Clavier PIN 3×4 avec empreinte et effacer, 6 points, gestion des 3 essais puis blocage 15 min (callback) ; Saisie de code à cases (OTP 4 et 6 chiffres, auto-remplissage SMS) ; Compteur de coupures (10 000 × 48, 5 000 × 36… avec total) ; Champ de recherche.

Critères d'acceptation :
- [ ] Rendu identique aux maquettes Vente, Connexion, SuperviseurValider, Caisse, ConfigPersonne sur le banc de fidélité (page de démo)
- [ ] Clavier PIN : ne stocke jamais le PIN en clair, renvoie la saisie à l'appelant, gère l'empreinte via WebAuthn quand le navigateur le propose, sinon PIN seul
- [ ] Champs utilisables au clavier physique et lecteur d'écran (label associé)

Tâches :
- Mettre en place le périmètre décrit
- Écrire les tests
- Documenter l'usage dans le README du package
- Ouvrir la PR avec captures ou sortie de tests

#### AM-007 · Kit UI · transport (départs, volets, sièges, frises, QR, codes)

**Épique** E00 Fondations · **Type** fondation · **Priorité** P0 · **Estimation** 8 pts · **Échéance** 17 → 24 oct.  
**Dépend de** AM-003  
**Planches** Main, SiegePay, Pass, Direct, ColisCode, Controleur, Systeme · **Route** `/(voyageur)/voyager, /(voyageur)/depart/[departId], /(voyageur)/billet/[billetId], /(voyageur)/billet/[billetId]/direct, /(voyageur)/colis/[colisId], /(controle)/inopine, (référence du design system)`  
**Périmètre** `packages/ui/src/transport/**`

Composants métier transport : Ligne de départ (heure Geist, compagnie, classe, places réelles, prix ambre, « plus que 3 » en rouge, variante covoiturage avec avatar) ; Volets de destination à lames type panneau de gare (DLA → YDE, animation de rotation des lettres, comme le logo) ; Plan de sièges configurable (2+2, rangées, chauffeur, états pris / libre / toi / choisi, 16 à 40 places, mode contrôle : scanné / occupé sans billet / libre) ; Frise d'arrêts verticale (passé, en cours qui pulse, prochain, montée) ; Frise de suivi colis 5 étapes ; Carte personne vérifiée (avatar initiales, ★, nombre de trajets) ; QR code (SVG, bibliothèque qrcode) ; Gros code mono (4 ou 6 chiffres, ≥ 28 px) ; Carte billet (souche avec DLA/YDE, départ, date, siège, classe).

Critères d'acceptation :
- [ ] Chaque composant reproduit sa version dans les maquettes citées (page de démo passée au banc)
- [ ] Plan de sièges : aria-label « Siège 7, libre » comme dans la maquette, sélection au toucher
- [ ] Volets : animation désactivable (réduction des animations du système)

Tâches :
- Mettre en place le périmètre décrit
- Écrire les tests
- Documenter l'usage dans le README du package
- Ouvrir la PR avec captures ou sortie de tests

#### AM-009 · Application web : coquille, routes par rôle, PWA, i18n

**Épique** E00 Fondations · **Type** fondation · **Priorité** P0 · **Estimation** 5 pts · **Échéance** 17 → 24 oct.  
**Dépend de** AM-005  
**Planches** Main, Guichet, Superviseur, Patron, Parcours · **Route** `/(voyageur)/voyager, /(guichet)/accueil, /(superviseur)/gare, /(patron)/aujourdhui, (spécification des tests de parcours)`  
**Périmètre** `apps/web/src/app.tsx`, `apps/web/src/routes/**/layout.tsx`, `apps/web/src/coquille/**`, `apps/web/src/i18n/**`, `apps/web/public/manifest.webmanifest`, `apps/web/src/sw.ts`

Une seule application web installable (React 19 + TypeScript + Vite, React Router) qui contient tous les espaces, sur téléphone comme sur ordinateur, comme le disent les maquettes (« ce téléphone, même app », « l'app passe en mode relais »). Groupes de routes : (voyageur), (guichet), (quai), (bus), (controle), (superviseur), (patron), (relais), (livreur), (vendeur), plus /controle (salle de contrôle, 1280 px). Barres d'onglets reprises des maquettes : voyageur Voyager · Colis · Covoit · Moi ; guichet Guichet · Vendre · Colis · Quai · Caisse ; superviseur Gare · Caisses · Quais · Patron ; patron Aujourd'hui · Analyses · Gares · Réglages. Garde de rôle (un compte agent ne voit que son espace), sélecteur de rôle réservé au mode démo, flag « conception » (badge TOUCHE), i18n FR / EN / Pidgin (clés, FR rempli), manifeste PWA et service worker Workbox (coquille, polices et icônes en cache, bandeau « nouvelle version prête »), cadre 390 px centré sur ordinateur sauf /controle qui est fluide, horloge injectable.

Critères d'acceptation :
- [ ] Toutes les routes de la table « planche → route » existent avec un écran vide titré, pour que les tickets d'écran ne touchent que leur propre fichier
- [ ] Les 4 barres d'onglets sont identiques aux maquettes au banc
- [ ] Un module masqué retire ses routes et entrées (branché sur AM-126 quand il existe, mock avant)
- [ ] `pnpm --filter web dev` sert l'app pour le banc ; Lighthouse : installable, la coquille s'ouvre sans réseau
- [ ] La route /controle existe, vide, aux couleurs et polices v3, avec la connexion patron en mock

Tâches :
- Mettre en place le périmètre décrit
- Écrire les tests
- Documenter l'usage dans le README du package
- Ouvrir la PR avec captures ou sortie de tests

#### AM-010 · Domaine partagé : entités, états, numérotation, tarifs, règles

**Épique** E00 Fondations · **Type** fondation · **Priorité** P0 · **Estimation** 8 pts · **Échéance** 17 → 24 oct.  
**Dépend de** AM-001  
**Planches** Pass, CadenceBillet, Caisse, ColisEnvoi · **Route** `/(voyageur)/billet/[billetId], /(guichet)/cadence/vendu, /(guichet)/caisse, /(voyageur)/colis`  
**Périmètre** `packages/domain/**`

Package @afrimove/domain, pur TypeScript sans dépendance UI. Entités : Compagnie, Gare, Guichet, Ligne, Arrêt, Départ, Bus, Plan de sièges, Billet, Colis, Session de caisse, Personne et rôles, Module, Appareil, Événement. Machines d'états du document projet : billet réservé → payé → embarqué → voyagé (annulé, non présenté, reporté ; jamais de retour après embarqué) ; colis enregistré → chargé → en route → déchargé → disponible → remis (en relais, en livraison, livré, non retiré J+7, retourné, perdu, litige) ; départ programmé → en vente → embarquement → parti → arrivé (annulé, retardé, fusionné) ; session ouverte → clôturée → validée (clôture auto à minuit). Numérotation sans trou : billet AGENCE-GARE-AAMMJJ-NNNN, colis C-…, départ AGENCE-LIGNE-AAMMJJ-HHMM, session K-GARE-AAMMJJ-GUICHET-N, plages guichet 1 : 0001–0999, guichet 2 : 1001–1999, convoyeurs 3xxx ; code billet 4 chiffres ; code de retrait 6 chiffres haché. Tarifs : 75 F / billet et 150 F / colis (agence), 250 F de frais voyageur en ligne, 200 F colis app, assurance 2 % min 500 plafond 500 000, relais 300 dont 200, livraison dès 1 000 dont 70 %, covoit 250 F / place, prorata des arrêts. Règles : annulation, tolérance d'écart, blocage hors ligne > 12 h.

Critères d'acceptation :
- [ ] Tests unitaires couvrant chaque transition interdite et chaque formule de prix du document projet
- [ ] Un billet annulé garde son numéro ; rien ne s'efface (une annulation est un événement)
- [ ] Générateur de numéros testé sur 10 000 ventes hors ligne réparties sur 3 guichets : aucun doublon, aucun trou
- [ ] Aucune dépendance à React, Nest ou Prisma

Tâches :
- Mettre en place le périmètre décrit
- Écrire les tests
- Documenter l'usage dans le README du package
- Ouvrir la PR avec captures ou sortie de tests

#### AM-011 · Données de démonstration des maquettes

**Épique** E00 Fondations · **Type** fondation · **Priorité** P0 · **Estimation** 5 pts · **Échéance** 17 → 24 oct.  
**Dépend de** AM-010  
**Planches** (toutes)  
**Périmètre** `packages/fixtures/**`

Package @afrimove/fixtures : tout l'univers des maquettes (Alpha Voyages, Bêta Express, Oméga Transports, Général Express, Touristique Express ; gares Akwa, Mvan, Bafoussam ; Aïcha Ngo, Maman Thérèse, Joseph M., Marie T., Pauline N., Mme Essono, M. Kamga, Alain B., Mbarga, Samuel E., Éric T., Mama Fotso, Nadège… ; bus LT 412 AB, LT 118 AB, LT 207 AB…), horloge figée au mardi 5 janvier 2027. Choix par défaut : un scénario par planche (fixtures/ecrans/<Planche>.ts) qui renvoie exactement les valeurs affichées dans la maquette, au-dessus d'un monde commun cohérent. Ainsi chaque écran peut être comparé au pixel, même là où deux maquettes se contredisent (liste des incohérences dans tickets.md, à trancher par Luther).

Critères d'acceptation :
- [ ] Chaque planche a son scénario et le banc de fidélité l'utilise
- [ ] Les objets passent la validation des schémas du domaine (AM-010)
- [ ] Les incohérences entre maquettes sont listées dans packages/fixtures/INCOHERENCES.md, sans être corrigées en silence

Tâches :
- Mettre en place le périmètre décrit
- Écrire les tests
- Documenter l'usage dans le README du package
- Ouvrir la PR avec captures ou sortie de tests

#### AM-012 · Client d'API : infrastructure mock / HTTP

**Épique** E00 Fondations · **Type** fondation · **Priorité** P0 · **Estimation** 3 pts · **Échéance** 17 → 24 oct.  
**Dépend de** AM-010  
**Périmètre** `packages/api-client/src/infra/**`

Package @afrimove/api-client : deux adaptateurs derrière la même interface, mock (lit @afrimove/fixtures, latence simulée, scénarios par planche) et HTTP (vers apps/api), choisis par variable d'environnement ; TanStack Query, gestion d'erreurs, horloge injectable, temps réel (WebSocket) simulé en mock. Les écrans n'importent jamais fetch ni les fixtures directement.

Critères d'acceptation :
- [ ] Un écran peut basculer de mock à HTTP sans changer une ligne de son code
- [ ] Le scénario de planche est sélectionnable par paramètre d'URL (pour le banc)
- [ ] Tests de l'adaptateur mock et d'un appel HTTP factice

Tâches :
- Mettre en place le périmètre décrit
- Écrire les tests
- Documenter l'usage dans le README du package
- Ouvrir la PR avec captures ou sortie de tests

#### AM-013 · Contrats d'API · voyageur (compte, départs, billets, paiements, covoit, services)

**Épique** E00 Fondations · **Type** fondation · **Priorité** P0 · **Estimation** 5 pts · **Échéance** 17 → 24 oct.  
**Dépend de** AM-012, AM-011  
**Planches** Main, SiegePay, Pass, Paiement, Covoit, Moi · **Route** `/(voyageur)/voyager, /(voyageur)/depart/[departId], /(voyageur)/billet/[billetId], /(voyageur)/paiement/[commandeId], /(voyageur)/covoit, /(voyageur)/moi`  
**Périmètre** `packages/contrats/src/voyageur/**`, `packages/api-client/src/voyageur/**`

Schémas zod + hooks pour : connexion OTP, profil, proches, fidélité et parrainage ; recherche de départs (entre villes, même ville, filtres classe / compagnies / préférées), plan de sièges temps réel, blocage de siège 15 min, commande, paiement (MoMo push, Orange Money, carte, lien pour un proche), billet, report / annulation ; position du bus, prévenir un proche ; réseau en direct ; monter en route ; course moto/taxi ; groupe et cagnotte ; covoiturage (recherche, réservation, publication, demandes). Adaptateur mock branché sur les scénarios des planches voyageur.

Critères d'acceptation :
- [ ] Chaque écran voyageur a les hooks dont il a besoin, documentés dans contrats/voyageur/README.md
- [ ] Les montants sont des entiers en FCFA, les heures en ISO avec fuseau Africa/Douala
- [ ] Mock complet : toutes les planches voyageur s'affichent sans backend

Tâches :
- Mettre en place le périmètre décrit
- Écrire les tests
- Documenter l'usage dans le README du package
- Ouvrir la PR avec captures ou sortie de tests

#### AM-014 · Contrats d'API · colis et partenaires

**Épique** E00 Fondations · **Type** fondation · **Priorité** P0 · **Estimation** 3 pts · **Échéance** 17 → 24 oct.  
**Dépend de** AM-012, AM-011  
**Planches** ColisEnvoi, ColisCode, RelaisApp, Livreur, InterAgences, Vendeur · **Route** `/(voyageur)/colis, /(voyageur)/colis/[colisId], /(relais)/accueil, /(livreur)/accueil, /(patron)/inter-agences, /(vendeur)/accueil`  
**Périmètre** `packages/contrats/src/colis/**`, `packages/api-client/src/colis/**`

Schémas + hooks : création de colis (photo, destinataire, valeur, mode gare / relais / moto, assurance), suivi, envoi du code, réclamation ; points relais (recherche, choix, réception, remise code + pièce, garde 7 jours) ; livraison (mission, acceptation 30 s, remise, preuve photo) ; inscriptions relais et livreur ; inter-agences (tronçons, scans de transfert, règlement hebdo, convention) ; vendeur ambulant.

Critères d'acceptation :
- [ ] Mock complet : toutes les planches colis et partenaires s'affichent sans backend
- [ ] Le code de retrait n'apparaît dans aucune réponse destinée au guichet, au relais ou au livreur (seulement à l'expéditeur et au destinataire)

Tâches :
- Mettre en place le périmètre décrit
- Écrire les tests
- Documenter l'usage dans le README du package
- Ouvrir la PR avec captures ou sortie de tests

#### AM-015 · Contrats d'API · agence (guichet, caisse, quai, bus, supervision)

**Épique** E00 Fondations · **Type** fondation · **Priorité** P0 · **Estimation** 5 pts · **Échéance** 17 → 24 oct.  
**Dépend de** AM-012, AM-011  
**Planches** Guichet, Vente, Caisse, Quai, Superviseur · **Route** `/(guichet)/accueil, /(guichet)/vendre, /(guichet)/caisse, /(quai)/embarquement, /(superviseur)/gare`  
**Périmètre** `packages/contrats/src/agence/**`, `packages/api-client/src/agence/**`

Schémas + hooks : session de caisse (ouvrir, compter, clôturer), vente guichet et cadence, colis guichet et dépôt prépayé, impression, quai (scan, code 4 chiffres, compléter un billet de cadence, libérer, liste au chauffeur), convoyeur (vente en route, scans), chauffeur (feuille de route, dépenses, incident, retard), contrôle inopiné, superviseur (demandes, validation PIN, annulations, équipe, PIN provisoire, déblocage d'appareil), journal signé. Toutes ces écritures sont des événements compatibles avec le moteur hors ligne (AM-160).

Critères d'acceptation :
- [ ] Mock complet : toutes les planches agence s'affichent sans backend
- [ ] Chaque écriture porte un identifiant d'événement créé sur l'appareil (UUID + numéro de plage)

Tâches :
- Mettre en place le périmètre décrit
- Écrire les tests
- Documenter l'usage dans le README du package
- Ouvrir la PR avec captures ou sortie de tests

#### AM-017 · API backend : socle NestJS, PostgreSQL, authentification, rôles, journal

**Épique** E00 Fondations · **Type** fondation · **Priorité** P0 · **Estimation** 8 pts · **Échéance** 17 → 24 oct.  
**Dépend de** AM-010, AM-011  
**Périmètre** `apps/api/src/socle/**`, `apps/api/prisma/**`, `docker-compose.yml`

apps/api : NestJS + PostgreSQL (Prisma), schéma initial issu du domaine, migrations, seed depuis les fixtures, authentification par rôle (voyageur : numéro + OTP ; guichetier : PIN 6 chiffres haché ; superviseur, patron, AfriMove : mot de passe + SMS), rôles stricts (AfriMove ne vend jamais), journal d'audit en ajout seul, chiffrement au repos des champs sensibles, OpenAPI généré depuis les contrats.

Critères d'acceptation :
- [ ] `docker compose up` lance API + base, `pnpm --filter api test` passe
- [ ] Aucun secret dans le code ; configuration par variables d'environnement
- [ ] Un guichetier ne peut appeler aucune route patron (tests de rôles)

Tâches :
- Mettre en place le périmètre décrit
- Écrire les tests
- Documenter l'usage dans le README du package
- Ouvrir la PR avec captures ou sortie de tests

#### AM-018 · CI/CD et environnement de dev

**Épique** E00 Fondations · **Type** fondation · **Priorité** P0 · **Estimation** 5 pts · **Échéance** 17 → 24 oct.  
**Dépend de** AM-001  
**Périmètre** `.github/workflows/**`, `infra/**`, `apps/web/Dockerfile`, `apps/api/Dockerfile`

GitHub Actions : lint, typecheck, tests, banc de fidélité sur les écrans touchés ; déploiement automatique de main vers l'environnement « dev » (API + base, application web servie en HTTPS derrière un CDN) ; c'est la colonne « Déployé en dev » du tableau. Prévisualisation de l'application web par PR.

Critères d'acceptation :
- [ ] Une PR verte fusionnée apparaît en dev sans action manuelle
- [ ] L'adresse de l'application web de dev est publiée à chaque déploiement
- [ ] Retour arrière en moins de 15 minutes documenté

Tâches :
- Mettre en place le périmètre décrit
- Écrire les tests
- Documenter l'usage dans le README du package
- Ouvrir la PR avec captures ou sortie de tests

#### AM-008 · Kit UI · données (tuiles, graphiques, listes, pop-up, aperçus)

**Épique** E00 Fondations · **Type** fondation · **Priorité** P1 · **Estimation** 8 pts · **Échéance** 17 → 24 oct.  
**Dépend de** AM-003  
**Planches** Patron, Analyses, AnalysesBus, ComptableApercu, GuichetColis, RapportSoir, USSD, Controle · **Route** `/(patron)/aujourdhui, /(patron)/analyses, /(patron)/analyses/bus/[busId], /(patron)/comptable/apercu/[exportId], /(guichet)/colis, /(patron)/rapport, /(voyageur)/sans-internet, /controle`  
**Périmètre** `packages/ui/src/donnees/**`

Composants de données : Tuile KPI (étiquette mono, valeur Bricolage, sous-ligne, couleur d'état) ; Histogramme en barres (7 jours, 8 semaines, heures ; barre mise en avant ambre ou rouge) ; Barre de remplissage (vert / ambre / rouge selon seuil) ; Liste glissable à hauteur fixe avec dégradé bas et mention « n · glisser » ; Ligne d'alerte (texte + heure + couleur) ; Bandeau assistant (fond #0E2A1E) ; Tableau à colonnes fixes ; Feuille modale / pop-up par-dessus un écran assombri ; Aperçu de billet thermique 58 mm ; Aperçu d'étiquette colis 58 × 40 mm ; Bulle de conversation WhatsApp ; Écran de téléphone USSD simulé.

Critères d'acceptation :
- [ ] Pages de démo passées au banc contre les zones correspondantes des maquettes citées
- [ ] Graphiques en SVG natif, sans bibliothèque de graphiques lourde
- [ ] Mêmes composants à 1280 px pour la salle de contrôle (variante large, pas de second kit)

Tâches :
- Mettre en place le périmètre décrit
- Écrire les tests
- Documenter l'usage dans le README du package
- Ouvrir la PR avec captures ou sortie de tests

#### AM-016 · Contrats d'API · patron (rapport, analyses, assistant, comptable, réglages, modules, financement)

**Épique** E00 Fondations · **Type** fondation · **Priorité** P1 · **Estimation** 5 pts · **Échéance** 17 → 24 oct.  
**Dépend de** AM-012, AM-011  
**Planches** Patron, Analyses, Comptable, Config, Modules, Controle · **Route** `/(patron)/aujourdhui, /(patron)/analyses, /(patron)/comptable, /(patron)/reglages, /(patron)/reglages/modules, /controle`  
**Périmètre** `packages/contrats/src/patron/**`, `packages/api-client/src/patron/**`

Schémas + hooks : tableau du jour en direct, gares et équipe, fiche personne, alertes, rapport du soir, analyses (période, lignes, bus), assistant (insights, question libre, simulation), comptable (rapprochement, exports, aperçu, clôture), réglages (lignes, départs, tarifs, arrêts, plan de sièges, personnes, règles, comptes MoMo), modules, financement, salle de contrôle.

Critères d'acceptation :
- [ ] Mock complet : toutes les planches patron et la salle de contrôle s'affichent sans backend
- [ ] Toute modification de réglage exige une signature PIN dans le contrat

Tâches :
- Mettre en place le périmètre décrit
- Écrire les tests
- Documenter l'usage dans le README du package
- Ouvrir la PR avec captures ou sortie de tests

### Vague 1 · Socle agence (jour J) (24 oct. → 4 nov.)

#### AM-070 · Accueil guichet : tout à 1 touche

**Épique** E06 Guichet · **Type** ecran · **Priorité** P0 · **Estimation** 5 pts · **Échéance** 24 oct. → 4 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-008, AM-015, AM-160  
**Planches** Guichet · **Route** `/(guichet)/accueil`  
**Périmètre** `apps/web/src/routes/(guichet)/accueil.tsx`, `apps/web/src/ecrans/Guichet/**`

En-tête agence · gare, guichet, agent, heure d'ouverture de caisse, pastille SYNC ; 3 tuiles (billets ce matin, colis dont à charger, en caisse et écart) ; actions : Vendre un billet (grande carte), Enregistrer un colis, Dépôt prépayé, Quai · embarquer (avec compteur), Ma caisse, Mode cadence, Appeler le superviseur ; information du prochain départ ; barre d'onglets guichet.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Guichet` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Les tuiles se mettent à jour à chaque vente, même hors ligne
- [ ] La pastille passe de SYNC (vert qui pulse) à HORS LIGNE (ambre) selon l'état du moteur de synchronisation
- [ ] Navigation identique à la maquette : « Vendre un billet départ · siège · nom · encaisser · imprimer : 3 touches » → Vente (/(guichet)/vendre) ; « Enregistrer un colis photo, étiquette, SMS » → GuichetColis (/(guichet)/colis) ; « Dépôt prépayé scanner le code du client » → Depot (/(guichet)/depot) ; « Quai · embarquer 08:30 Yaoundé · 31/40 scannés » → Quai (/(quai)/embarquement) ; « Ma caisse fermer, compter, écart » → Caisse (/(guichet)/caisse) ; « Mode cadence · file de 40 » → Cadence (/(guichet)/cadence) ; « Appeler le superviseur » → Superviseur (/(superviseur)/gare) ; « Guichet » → reste sur l'écran (action sur place) ; « Vendre » → Vente (/(guichet)/vendre) ; « Colis » → GuichetColis (/(guichet)/colis) ; « Quai » → Quai (/(quai)/embarquement) ; « Caisse » → Caisse (/(guichet)/caisse)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Guichet.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-071 · Vendre un billet en un écran (touche 2 → 3)

**Épique** E06 Guichet · **Type** ecran · **Priorité** P0 · **Estimation** 8 pts · **Échéance** 24 oct. → 4 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-006, AM-007, AM-015, AM-160, AM-075  
**Planches** Vente · **Route** `/(guichet)/vendre`  
**Périmètre** `apps/web/src/routes/(guichet)/vendre.tsx`, `apps/web/src/ecrans/Vente/**`

Numéro du billet affiché d'avance ; 3 prochains départs en boutons + « + 11 » ; siège attribué automatiquement (modifiable sur le plan) ; Nom, Téléphone, Pièce (4 derniers) ; « Client connu ↓ » ; + bagage ; paiement Cash avec rendu calculé, MoMo push au client, Orange Money référence ; récapitulatif reçu / billet / SMS ; bouton « Encaisser et imprimer » ; bouton d'annulation (PIN superviseur).

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Vente` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Le badge « TOUCHE n » n'apparaît que si le flag conception est actif (absent en production)
- [ ] Une vente complète se fait en moins de 45 secondes par un guichetier formé (chronométré en test)
- [ ] Fonctionne hors ligne : numéro pris dans la plage du guichet, siège pris dans la part hors ligne du guichet
- [ ] Encaisser imprime le billet 58 mm et envoie le SMS en 2 s
- [ ] Annuler exige le PIN du superviseur ; le billet garde son numéro
- [ ] Navigation identique à la maquette : « Retour au guichet » → Guichet (/(guichet)/accueil) ; « Encaisser et imprimer touche 3 · billet + SMS en 2 s 4 000 » → Guichet (/(guichet)/accueil) ; « Annuler avec le PIN du superviseur » → Superviseur (/(superviseur)/gare)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Vente.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-072 · Mode cadence (5 h) et écran « vendu »

**Épique** E06 Guichet · **Type** ecran · **Priorité** P0 · **Estimation** 5 pts · **Échéance** 24 oct. → 4 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-008, AM-015, AM-160, AM-075  
**Planches** Cadence, CadenceBillet · **Route** `/(guichet)/cadence, /(guichet)/cadence/vendu`  
**Périmètre** `apps/web/src/routes/(guichet)/cadence.tsx`, `apps/web/src/ecrans/Cadence/**`, `apps/web/src/routes/(guichet)/cadence/vendu.tsx`, `apps/web/src/ecrans/CadenceBillet/**`

Mode de vente ultra-rapide : pastille CADENCE + heure, départ en cours et places restantes, dernier billet et son temps, prix suivant, siège suivant ; deux gros boutons CASH (1 touche, imprime) et MOMO (push puis confirmé) ; × 2 places, + numéro, Autre départ ; compteur « Vendus en cadence » et état hors ligne / sync. Après la touche : écran « Vendu · 1,8 s » avec la liste de ce que l'app a fait (numéroté sans trou, siège bloqué, imprimé, caisse, SMS ou non, synchro), aperçu du billet « nom à compléter au quai », explication de ce qu'il manque, « + numéro · envoyer le SMS », « Annuler · PIN superviseur », « Billet suivant ».

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Cadence` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Banc de fidélité : `pnpm fidelite CadenceBillet` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] 1 touche par billet en cash ; le nom et la pièce ne sont jamais saisis au guichet en cadence
- [ ] Un billet de cadence apparaît « cadence, sans nom » dans la liste du départ et dans le rapport du soir tant qu'il n'est pas complété au quai
- [ ] Si le réglage « numéro obligatoire en cadence » est actif, la touche + numéro devient obligatoire
- [ ] Navigation identique à la maquette : « Quitter la cadence » → Guichet (/(guichet)/accueil) ; « CASH touche 1 · imprime + SMS si numéro » → reste sur l'écran (action sur place) ; « MOMO touche 1 · push touche 2 · confirmé » → reste sur l'écran (action sur place) ; « Retour à la cadence » → reste sur l'écran (action sur place) ; « Annuler · PIN superviseur » → Superviseur (/(superviseur)/gare) ; « Voir la suite au quai » → CadenceQuai (/(quai)/completer) ; « Billet suivant siège 20 · 4 000 » → reste sur l'écran (action sur place)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Cadence.dc.html et relever chaque élément
- Lire la maquette docs/maquettes-v3/CadenceBillet.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

> Note : La maquette titre « 2 touches par billet » alors que la règle dit 1 touche : 1 touche en cash, 2 en MoMo (push + confirmation). À confirmer par Luther.

#### AM-073 · Enregistrer un colis au guichet, étiquette

**Épique** E06 Guichet · **Type** ecran · **Priorité** P0 · **Estimation** 5 pts · **Échéance** 24 oct. → 4 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-006, AM-008, AM-015, AM-160, AM-075  
**Planches** GuichetColis · **Route** `/(guichet)/colis`  
**Périmètre** `apps/web/src/routes/(guichet)/colis.tsx`, `apps/web/src/ecrans/GuichetColis/**`

Numéro de colis affiché ; Photo prise ✓ reprendre ; Expéditeur · tél., Destinataire · tél., Contenu, Poids, Valeur ; départs avec remplissage de soute ; « Autre ville via une autre compagnie » ; aperçu de l'étiquette 58 × 40 mm (DLA → BAF, destinataire et 4 derniers chiffres, numéro, « pas de code ici ») ; Cash · MoMo · Assurance ; bouton « Encaisser · imprimer l'étiquette ».

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite GuichetColis` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Le badge « TOUCHE n » n'apparaît que si le flag conception est actif (absent en production)
- [ ] L'étiquette ne porte jamais le code de retrait
- [ ] Le code de retrait part par SMS au destinataire seul à l'encaissement
- [ ] Fonctionne hors ligne
- [ ] Navigation identique à la maquette : « Retour au guichet » → Guichet (/(guichet)/accueil) ; « Autre ville via une autre compagnie » → InterAgences (/(patron)/inter-agences) ; « Encaisser · imprimer l'étiquette touche 3 · code de retrait envoyé au destinataire seul 2 » → Guichet (/(guichet)/accueil)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/GuichetColis.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-074 · Dépôt d'un colis prépayé

**Épique** E06 Guichet · **Type** ecran · **Priorité** P0 · **Estimation** 3 pts · **Échéance** 24 oct. → 4 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-006, AM-015, AM-160, AM-075  
**Planches** Depot · **Route** `/(guichet)/depot`  
**Périmètre** `apps/web/src/routes/(guichet)/depot.tsx`, `apps/web/src/ecrans/Depot/**`

Scanner le code du client ou le taper ; fiche trouvée (payé dans l'app, de, pour, déclaré, départ) ; « Vérifier le poids » (conforme ou complément) ; « Photo au dépôt » ; « Rien à encaisser » ; bouton « Accepter · imprimer l'étiquette ».

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Depot` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Poids supérieur de plus de 1 kg : l'app propose un complément payé par MoMo par le client
- [ ] Le dépôt fait passer le colis à l'état « enregistré » et déclenche l'étape « Déposé » du suivi
- [ ] Navigation identique à la maquette : « Retour au guichet » → Guichet (/(guichet)/accueil) ; « Accepter · imprimer l'étiquette » → Quai (/(quai)/embarquement)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Depot.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-075 · Impression thermique Bluetooth 58 mm (billet et étiquette colis)

**Épique** E06 Guichet · **Type** integration · **Priorité** P0 · **Estimation** 8 pts · **Échéance** 24 oct. → 4 nov.  
**Dépend de** AM-004, AM-009, AM-015, AM-010  
**Périmètre** `apps/web/src/impression/**`, `packages/impression/**`

Pilote d'impression ESC/POS par Web Bluetooth (Chrome Android, téléphones de guichet) pour l'imprimante unique du réseau : appairage, état « imprimante OK », file d'impression hors ligne, réimpression. Gabarits : billet (logo monochrome, compagnie, ligne et heure en gros, siège, nom, QR 3 cm, code 4 chiffres très gros, numéro, « Présentez-vous 20 min avant ») et étiquette colis 58 × 40 (code-barres, DLA → BAF en gros, destinataire et 4 derniers chiffres, numéro, jamais le code de retrait). Repris des aperçus de CadenceBillet et GuichetColis.

Critères d'acceptation :
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Impression d'un billet en moins de 2 s après la touche
- [ ] Une impression ratée reste en file et se relance seule quand l'imprimante revient
- [ ] Le gabarit imprimé correspond à l'aperçu affiché à l'écran
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Pilote ESC/POS via Web Bluetooth (Chrome Android) et appairage
- Gabarits billet et étiquette
- File d'impression hors ligne
- Tests sur l'imprimante réelle

> Note : Le modèle exact d'imprimante est à fixer (≈ 45 000 FCFA, 58 mm Bluetooth). Web Bluetooth n'existe pas sur Safari iOS : les guichets tournent sur Android ; la version emballée (AM-184) passera par un greffon natif avec le même gabarit.

#### AM-076 · Ma caisse : ouverture, comptage, écart, clôture

**Épique** E06 Guichet · **Type** ecran · **Priorité** P0 · **Estimation** 5 pts · **Échéance** 24 oct. → 4 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-006, AM-015, AM-164  
**Planches** Caisse · **Route** `/(guichet)/caisse`  
**Périmètre** `apps/web/src/routes/(guichet)/caisse.tsx`, `apps/web/src/ecrans/Caisse/**`

Session K-… avec fond de caisse ; « Ce que l'app a compté » (billets cash, colis cash, fond, annulations validées, MoMo à part) et cash attendu ; « Ce que je compte » par coupures (10 000, 5 000, 2 000, 1 000, 500, pièces) ou total tapé ; écart avec la tolérance de l'agence et l'historique ; bouton « Clôturer · faire valider par le superviseur ».

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Caisse` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Le badge « TOUCHE n » n'apparaît que si le flag conception est actif (absent en production)
- [ ] L'écart est calculé en direct et coloré (vert dans la tolérance, rouge au-delà)
- [ ] La clôture envoie une demande au superviseur ; la session passe « clôturée » puis « validée » avec son PIN
- [ ] Une session non clôturée se ferme seule à minuit avec alerte
- [ ] Navigation identique à la maquette : « Retour au guichet » → Guichet (/(guichet)/accueil) ; « Clôturer · faire valider par le superviseur touche 3 · il met son PIN, l'écart est tracé, » → Superviseur (/(superviseur)/gare)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Caisse.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-080 · Quai : scan à l'embarquement, comptage, soute

**Épique** E07 Quai et bus · **Type** ecran · **Priorité** P0 · **Estimation** 8 pts · **Échéance** 24 oct. → 4 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-008, AM-015, AM-160, AM-162  
**Planches** Quai · **Route** `/(quai)/embarquement`  
**Périmètre** `apps/web/src/routes/(quai)/embarquement.tsx`, `apps/web/src/ecrans/Quai/**`

Quai et départ, bus, chauffeur, convoyeur ; scan continu par la caméra (QR) ou « code 4 chiffres » ; dernier scan (OK · monte, nom, siège, numéro, pièce, bagage) ; compteurs Embarqués / Soute / Refusés / En route ; liste « Pas encore montés » avec appeler et libérer ; boutons « Vendre les places restantes » et « Départ · liste au chauffeur ».

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Quai` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Un billet déjà scanné est refusé avec l'heure du premier scan
- [ ] Le scan fonctionne hors ligne avec la liste du départ téléchargée
- [ ] « Libérer » remet le siège en vente après l'heure limite
- [ ] Navigation identique à la maquette : « Retour au guichet » → Guichet (/(guichet)/accueil) ; « Vendre les 9 restantes » → Convoyeur (/(bus)/convoyeur) ; « Départ · liste au chauffeur » → Chauffeur (/(bus)/chauffeur)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Quai.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-081 · Quai : compléter un billet de cadence

**Épique** E07 Quai et bus · **Type** ecran · **Priorité** P0 · **Estimation** 3 pts · **Échéance** 24 oct. → 4 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-006, AM-015, AM-080, AM-072  
**Planches** CadenceQuai · **Route** `/(quai)/completer`  
**Périmètre** `apps/web/src/routes/(quai)/completer.tsx`, `apps/web/src/ecrans/CadenceQuai/**`

Scan d'un billet de cadence sans nom : rappel de la vente, champs Nom, Pièce (4 derniers), Téléphone facultatif ; compteur embarqués (nominatifs / cadence complétés) ; liste des billets de cadence encore sans nom ; bouton « Embarquer · le billet devient nominatif · scan suivant ».

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite CadenceQuai` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Sans nom, pas d'embarquement
- [ ] Un billet de cadence jamais complété au départ apparaît « vendu, non embarqué, sans nom » au rapport du soir
- [ ] Navigation identique à la maquette : « Retour » → CadenceBillet (/(guichet)/cadence/vendu) ; « Vue du quai » → Quai (/(quai)/embarquement) ; « Embarquer · siège 19 le billet devient nominatif · scan suivant » → reste sur l'écran (action sur place)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/CadenceQuai.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-082 · Convoyeur : vente en route

**Épique** E07 Quai et bus · **Type** ecran · **Priorité** P0 · **Estimation** 5 pts · **Échéance** 24 oct. → 4 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-006, AM-015, AM-160  
**Planches** Convoyeur · **Route** `/(bus)/convoyeur`  
**Périmètre** `apps/web/src/routes/(bus)/convoyeur.tsx`, `apps/web/src/ecrans/Convoyeur/**`

Pastille HORS LIGNE, bus et trajet ; tuiles À bord / Libres / En route ; vente en route en 1 touche (stepper de places, siège, prix au prorata fixé par l'agence, nom et téléphone facultatifs) ; CASH et MOMO ; « Scanner à Pouma », « Colis à décharger », « Incident », liste nominative à montrer en cas de contrôle.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Convoyeur` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Billets numérotés hors ligne dans la plage convoyeur 3xxx
- [ ] Chaque vente en route enregistre l'heure et la position GPS, visibles par le patron le soir
- [ ] Navigation identique à la maquette : « Retour au quai » → Quai (/(quai)/embarquement) ; « CASH 4 500 touche 2 · billet par SMS » → reste sur l'écran (action sur place) ; « MOMO push · confirmé à bord » → reste sur l'écran (action sur place) ; « Scanner à Pouma » → Quai (/(quai)/embarquement) ; « Incident · panne » → Chauffeur (/(bus)/chauffeur) ; « montrer » → Controleur (/(controle)/inopine)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Convoyeur.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-083 · Chauffeur : feuille de route, dépenses, incidents

**Épique** E07 Quai et bus · **Type** ecran · **Priorité** P0 · **Estimation** 5 pts · **Échéance** 24 oct. → 4 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-006, AM-015, AM-170  
**Planches** Chauffeur · **Route** `/(bus)/chauffeur`  
**Périmètre** `apps/web/src/routes/(bus)/chauffeur.tsx`, `apps/web/src/ecrans/Chauffeur/**`

Trajet en cours (départ, à bord, colis, prochain arrêt, vitesse et limite), dépenses du trajet avec photo du justificatif, « Incident · panne » en 1 touche (gare et voyageurs prévenus), « Retard · 20 min » (SMS automatique aux voyageurs), ma semaine (paie le vendredi), bouton « Arrivé à Pouma · ouvrir les portes ».

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Chauffeur` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Incident et retard en 1 touche, avec notification immédiate à la gare et aux voyageurs
- [ ] Une dépense sans photo n'est pas remboursable
- [ ] Navigation identique à la maquette : « Retour » → Quai (/(quai)/embarquement) ; « Arrivé à Pouma · ouvrir les portes » → Convoyeur (/(bus)/convoyeur)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Chauffeur.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-090 · Accueil du superviseur de gare

**Épique** E08 Supervision et rapport du soir · **Type** ecran · **Priorité** P0 · **Estimation** 5 pts · **Échéance** 24 oct. → 4 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-008, AM-015, AM-164  
**Planches** Superviseur · **Route** `/(superviseur)/gare`  
**Périmètre** `apps/web/src/routes/(superviseur)/gare.tsx`, `apps/web/src/ecrans/Superviseur/**`

En-tête (gare, guichets, quais, heure, sync) ; « 2 demandes attendent ton PIN » (clôture, annulation) avec Valider · PIN / Voir · PIN ; état des 3 guichets ; départs de l'après-midi avec remplissage et fusion proposée ; raccourcis Contrôle, Équipe · PIN, Débloquer 12 h, Rapport 21 h ; barre d'onglets Gare · Caisses · Quais · Patron.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Superviseur` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Les demandes arrivent en temps réel
- [ ] La fusion de deux départs sous 40 % est proposée, jamais faite sans validation
- [ ] Navigation identique à la maquette : « Valider · PIN » → SuperviseurValider (/(superviseur)/cloture/[sessionId]) ; « Voir · PIN » → SuperviseurVoir (/(superviseur)/annulation/[demandeId]) ; « 14:30 Yaoundé · quai 3 · LT 207 AB 38/40 » → Quai (/(quai)/embarquement) ; « 15:00 Bafoussam · quai 1 · LT 118 AB 19/40 » → Quai (/(quai)/embarquement) ; « 16:00 Yaoundé · quai 3 · fusion proposée avec 16:30 9/40 » → Quai (/(quai)/embarquement) ; « Contrôle » → Controleur (/(controle)/inopine) ; « Équipe · PIN » → SuperviseurEquipe (/(superviseur)/equipe) ; « Débloquer 12 h » → SuperviseurDebloquer (/(superviseur)/debloquer/[appareilId]) ; « Rapport 21 h » → RapportSoir (/(patron)/rapport) ; « Gare » → reste sur l'écran (action sur place) ; « Caisses » → Caisse (/(guichet)/caisse) ; « Quais » → Quai (/(quai)/embarquement) ; « Patron » → Patron (/(patron)/aujourdhui)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Superviseur.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-091 · Valider une clôture de caisse avec le PIN

**Épique** E08 Supervision et rapport du soir · **Type** ecran · **Priorité** P0 · **Estimation** 5 pts · **Échéance** 24 oct. → 4 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-006, AM-015, AM-164  
**Planches** SuperviseurValider · **Route** `/(superviseur)/cloture/[sessionId]`  
**Périmètre** `apps/web/src/routes/(superviseur)/cloture/[sessionId].tsx`, `apps/web/src/ecrans/SuperviseurValider/**`

Attendu / Compté / Écart ; détail de la session ; tolérance ; historique de l'agent (écarts sur 10 jours) ; billets de cadence sans numéro ; commentaire du superviseur visible par le patron ; clavier PIN 6 chiffres avec empreinte ; « Refuser · recompter » et « Valider · écart signé ».

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite SuperviseurValider` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] 3 essais faux puis blocage 15 min et alerte au patron
- [ ] La validation horodatée et signée part dans le rapport de 21 h
- [ ] Navigation identique à la maquette : « Retour » → Superviseur (/(superviseur)/gare) ; « Refuser · recompter » → Caisse (/(guichet)/caisse) ; « Valider · écart − 1 000 signé Essono · caisse fermée » → RapportSoir (/(patron)/rapport)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/SuperviseurValider.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-092 · Décider une annulation avec le PIN

**Épique** E08 Supervision et rapport du soir · **Type** ecran · **Priorité** P0 · **Estimation** 5 pts · **Échéance** 24 oct. → 4 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-006, AM-015, AM-164, AM-162  
**Planches** SuperviseurVoir · **Route** `/(superviseur)/annulation/[demandeId]`  
**Périmètre** `apps/web/src/routes/(superviseur)/annulation/[demandeId].tsx`, `apps/web/src/ecrans/SuperviseurVoir/**`

Demande (guichet, agent, depuis combien de temps) ; billet et montant ; départ, voyageur, vente, motif ; « Ce que l'app a vérifié » (pas scanné, délai, fréquence des annulations de l'agent, client présent) ; choix Rembourser · Reporter à demain · Avoir ; clavier PIN ; Refuser / Annuler · rembourser.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite SuperviseurVoir` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] L'annulation garde le numéro, passe à l'état « annulé », n'est pas facturée par AfriMove et apparaît nominativement au rapport du soir
- [ ] Le siège est libéré immédiatement
- [ ] Navigation identique à la maquette : « Retour » → Superviseur (/(superviseur)/gare) ; « Refuser » → Superviseur (/(superviseur)/gare) ; « Annuler · rembourser 4 000 siège 9 libéré · signé Essono » → Superviseur (/(superviseur)/gare)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/SuperviseurVoir.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-093 · Équipe de la gare, PIN et comptes

**Épique** E08 Supervision et rapport du soir · **Type** ecran · **Priorité** P0 · **Estimation** 5 pts · **Échéance** 24 oct. → 4 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-006, AM-015, AM-164  
**Planches** SuperviseurEquipe · **Route** `/(superviseur)/equipe`  
**Périmètre** `apps/web/src/routes/(superviseur)/equipe.tsx`, `apps/web/src/ecrans/SuperviseurEquipe/**`

Liste des personnes en service (rôle, poste, état du PIN, alertes), détail d'une personne avec actions : Renouveler le PIN (provisoire par SMS valable 1 h), Changer de guichet ou de rôle, Voir son journal, Désactiver le compte, Débloquer ; « Mon propre PIN ».

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite SuperviseurEquipe` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Un PIN n'est jamais affiché, même au superviseur
- [ ] Chaque action est signée par le PIN du superviseur et visible par le patron
- [ ] Navigation identique à la maquette : « Retour » → Superviseur (/(superviseur)/gare) ; « Annuler » → Superviseur (/(superviseur)/gare) ; « Renouveler · mon PIN SMS provisoire à Joseph · tracé » → SuperviseurValider (/(superviseur)/cloture/[sessionId])
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/SuperviseurEquipe.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-094 · Débloquer un appareil hors ligne depuis 12 h

**Épique** E08 Supervision et rapport du soir · **Type** ecran · **Priorité** P0 · **Estimation** 5 pts · **Échéance** 24 oct. → 4 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-015, AM-160  
**Planches** SuperviseurDebloquer · **Route** `/(superviseur)/debloquer/[appareilId]`  
**Périmètre** `apps/web/src/routes/(superviseur)/debloquer/[appareilId].tsx`, `apps/web/src/ecrans/SuperviseurDebloquer/**`

Pastille BLOQUÉ ; rappel de la règle ; ventes et colis en attente, cash non rapproché, plage sans trou ; diagnostic automatique (routeur, SIM, téléphone) ; trois options dans l'ordre (synchroniser via mon téléphone, débloquer 4 h avec mon PIN, basculer sur le téléphone de secours) ; rappel envoyé au support.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite SuperviseurDebloquer` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Rien n'est perdu : les ventes locales sont envoyées dès la synchronisation
- [ ] Le déblocage est tracé et le patron est prévenu
- [ ] Navigation identique à la maquette : « Retour » → Superviseur (/(superviseur)/gare) ; « Plus tard » → Superviseur (/(superviseur)/gare) ; « Synchroniser · mon PIN puis le guichet 3 revend » → SuperviseurValider (/(superviseur)/cloture/[sessionId])
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/SuperviseurDebloquer.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-095 · Rapport du soir : message WhatsApp 21 h et vue dans l'app

**Épique** E08 Supervision et rapport du soir · **Type** ecran · **Priorité** P0 · **Estimation** 5 pts · **Échéance** 24 oct. → 4 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-008, AM-016, AM-171  
**Planches** RapportSoir · **Route** `/(patron)/rapport`  
**Périmètre** `apps/web/src/routes/(patron)/rapport.tsx`, `apps/web/src/ecrans/RapportSoir/**`

Le message WhatsApp de 21 h tel que le patron le reçoit (compte vérifié AfriMove · Alpha Voyages) : rapport du jour (billets, colis, recette cash / MoMo), ligne par gare (billets, caisses clôturées, écarts, départs fusionnés, soute), en route, contrôles, remplissage, annulations, en ligne ; « Ouvrir le détail dans l'app » ; signatures des superviseurs ; question / réponse de l'assistant. Dans l'app, la même vue.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite RapportSoir` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Le texte du message est généré par AM-171 ; cet écran l'affiche à l'identique dans l'app
- [ ] Lire le rapport du soir = 0 touche (il arrive seul)
- [ ] Navigation identique à la maquette : « Retour » → Patron (/(patron)/aujourdhui) ; « Ouvrir le détail dans l'app » → Analyses (/(patron)/analyses) ; « Voir → » → Assistant (/(patron)/assistant) ; « Ouvrir l'assistant » → Assistant (/(patron)/assistant)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/RapportSoir.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-100 · Accueil du patron : tout à 1 touche

**Épique** E09 Patron · **Type** ecran · **Priorité** P0 · **Estimation** 5 pts · **Échéance** 24 oct. → 4 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-008, AM-016, AM-126  
**Planches** Patron · **Route** `/(patron)/aujourdhui`  
**Périmètre** `apps/web/src/routes/(patron)/aujourdhui.tsx`, `apps/web/src/ecrans/Patron/**`

Compagnie, patron, gares et bus, heure ; chiffres du jour en direct contre la semaine dernière (recette, billets, colis, remplissage, écart total) ; carte « L'assistant a 2 choses à te dire » ; 9 tuiles (Analyses, Mes gares mes gens, Rapports, Comptable, Financement, Entre compagnies, Réglages, Modules, Salle de contrôle) ; alertes glissables avec heure ; barre d'onglets patron.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Patron` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Chaque alerte ouvre l'écran qui permet d'agir (aucun bouton sans destination)
- [ ] Un module masqué retire sa tuile
- [ ] Navigation identique à la maquette : « L'assistant a 2 choses à te dire Le 09:30 Oméga te prend 40 clients · Guichet 2 : 3 écarts » → Assistant (/(patron)/assistant) ; « Analyses semaine · lignes · bus » → Analyses (/(patron)/analyses) ; « Mes gares, mes gens caisses · quais · 23 pers. » → PatronEquipe (/(patron)/gares) ; « Rapports chaque soir · 21 h » → RapportSoir (/(patron)/rapport) ; « Comptable exports · rapprochement » → Comptable (/(patron)/comptable) ; « Financement avance · crédit · paie » → Financement (/(patron)/financement) ; « Entre compagnies colis en correspondance · Oméga » → InterAgences (/(patron)/inter-agences) ; « Réglages lignes · tarifs · équipe · règles » → Config (/(patron)/reglages) ; « Modules activer · masquer · les 12 » → Modules (/(patron)/reglages/modules) ; « Salle de contrôle sur ordinateur · tout en direct » → Controle (/controle) ; « Guichet 2 Akwa · écart − 1 000 · 3 e en 10 jours 14:00 » → PatronGare (/(patron)/gares/[gareId]) ; « 6 colis Oméga en correspondance chez toi · à régler lundi 12:30 » → InterAgences (/(patron)/inter-agences) ; « Guichet 3 Akwa · Pauline N. bloquée · 3 PIN faux 09:40 » → PatronEquipe (/(patron)/gares) ; « LT 207 AB · 2 e panne en 10 jours · révision conseillée hier » → AnalysesBus (/(patron)/analyses/bus/[busId]) ; « 4 transactions MoMo sans correspondance · 16 000 hier » → Comptable (/(patron)/comptable) ; « Avance 6 M · dossier AV-2027-0041 en analyse hier » → FinancementDemande (/(patron)/financement/demande/[dossierId]) ; « Aujourd'hui » → reste sur l'écran (action sur place) ; « Analyses » → Analyses (/(patron)/analyses) ; « Gares » → PatronEquipe (/(patron)/gares) ; « Réglages » → Config (/(patron)/reglages)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Patron.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-120 · Réglages : lignes, tarifs, équipe, règles

**Épique** E11 Réglages et modules · **Type** ecran · **Priorité** P0 · **Estimation** 5 pts · **Échéance** 24 oct. → 4 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-006, AM-016  
**Planches** Config · **Route** `/(patron)/reglages`  
**Périmètre** `apps/web/src/routes/(patron)/reglages.tsx`, `apps/web/src/ecrans/Config/**`

Lignes et tarifs (avec changement proposé par l'assistant) ; équipe avec filtres par rôle et liste glissable ; « Voir la liste » ; règles (annulation, tolérance, numéro obligatoire en cadence, frais pris en charge, comptes MoMo) ; mention de traçabilité ; accès Modules.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Config` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Chaque changement est daté, signé et visible dans le rapport du soir
- [ ] Navigation identique à la maquette : « Retour » → Patron (/(patron)/aujourdhui) ; « Modules » → Modules (/(patron)/reglages/modules) ; « + ligne » → ConfigLigne (/(patron)/reglages/ligne/[ligneId]) ; « Douala → Yaoundé 8 départs · classique 4 000 · VIP 5 500 · bagage 1 000 10:00 → 09:15 prop » → ConfigLigne (/(patron)/reglages/ligne/[ligneId]) ; « Douala → Bafoussam 5 départs · 3 500 · arrêts Bafang, Mbouda modifier » → ConfigLigne (/(patron)/reglages/ligne/[ligneId]) ; « Yaoundé → Bafoussam 3 départs · 4 500 · prix en route au prorata modifier » → ConfigLigne (/(patron)/reglages/ligne/[ligneId]) ; « + personne » → ConfigPersonne (/(patron)/reglages/personne/[personneId]) ; « 9 guichetiers » → reste sur l'écran (action sur place) ; « 3 superviseurs » → reste sur l'écran (action sur place) ; « 7 convoyeurs » → reste sur l'écran (action sur place) ; « 4 chauffeurs » → reste sur l'écran (action sur place) ; « JM Joseph M. · Akwa · guichet 2 PIN à renouveler · 3 écarts modifier » → PatronPersonne (/(patron)/personnes/[personneId]) ; « MT Marie T. · Akwa · guichet 1 1 204 billets · 0 écart modifier » → PatronPersonne (/(patron)/personnes/[personneId]) ; « PN Pauline N. · Akwa · guichet 3 bloquée · 3 PIN faux modifier » → PatronPersonne (/(patron)/personnes/[personneId]) ; « DT D. Tchinda · Mvan · guichet 1 612 billets · 0 écart modifier » → PatronPersonne (/(patron)/personnes/[personneId]) ; « SA S. Atangana · Mvan · guichet 2 388 billets · 1 écart modifier » → PatronPersonne (/(patron)/personnes/[personneId]) ; « TK T. Kamga · Bafoussam · guichet 1 hors ligne 40 min modifier » → PatronPersonne (/(patron)/personnes/[personneId]) ; « BN B. Ngo · Akwa · nuit 210 billets · 0 écart modifier » → PatronPersonne (/(patron)/personnes/[personneId]) ; « CE C. Ebolo · Mvan · nuit 96 billets · 0 écart modifier » → PatronPersonne (/(patron)/personnes/[personneId]) ; « LF L. Fouda · remplaçant 3 jours ce mois modifier » → PatronPersonne (/(patron)/personnes/[personneId]) ; « Voir la liste » → ConfigEquipeListe (/(patron)/reglages/equipe) ; « Annulation gratuite jusqu'à 1 h avant · puis selon classe modifier » → ConfigRegles (/(patron)/reglages/regles) ; « Tolérance d'écart de caisse · 1 000 F modifier » → ConfigRegles (/(patron)/reglages/regles) ; « Comptes MoMo de l'agence · MTN ···· 02 · OM ···· 77 modifier » → ConfigRegles (/(patron)/reglages/regles)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Config.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-121 · Modifier une ligne : départs, tarifs, arrêts, sièges

**Épique** E11 Réglages et modules · **Type** ecran · **Priorité** P0 · **Estimation** 5 pts · **Échéance** 24 oct. → 4 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-006, AM-016  
**Planches** ConfigLigne · **Route** `/(patron)/reglages/ligne/[ligneId]`  
**Périmètre** `apps/web/src/routes/(patron)/reglages/ligne/[ligneId].tsx`, `apps/web/src/ecrans/ConfigLigne/**`

Pastille BROUILLON ; départs modifiables (heure, classe, bus, prix, origine du changement) et + départ ; tarifs classique, VIP, bagage ; arrêts avec prix au prorata et montée autorisée, + arrêt ; plan de sièges ; interrupteurs vente en ligne et fusion automatique ; Annuler / « Publier dès lundi ».

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite ConfigLigne` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Rien ne change pour les guichets et l'app tant que ce n'est pas publié
- [ ] La publication met à jour guichets et app à la date choisie, tracée
- [ ] Navigation identique à la maquette : « Retour aux réglages » → Config (/(patron)/reglages) ; « + départ » → reste sur l'écran (action sur place) ; « + arrêt » → reste sur l'écran (action sur place) ; « Modifier » → SiegePay (/(voyageur)/depart/[departId]) ; « Annuler » → Config (/(patron)/reglages) ; « Publier dès lundi 2 changements · guichets et app à jour · tracé » → Config (/(patron)/reglages)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/ConfigLigne.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-123 · Modifier ou ajouter une personne

**Épique** E11 Réglages et modules · **Type** ecran · **Priorité** P0 · **Estimation** 5 pts · **Échéance** 24 oct. → 4 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-006, AM-016  
**Planches** ConfigPersonne · **Route** `/(patron)/reglages/personne/[personneId]`  
**Périmètre** `apps/web/src/routes/(patron)/reglages/personne/[personneId].tsx`, `apps/web/src/ecrans/ConfigPersonne/**`

Pastille MODIFIER ; Nom, Téléphone, Opérateur, Rôle, Gare, Guichet, Salaire ; permissions par défaut du rôle (interrupteurs) ; Nouveau PIN provisoire, Voir sa fiche ; Désactiver ; « Enregistrer · mon PIN ».

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite ConfigPersonne` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Une nouvelle personne reçoit par SMS son PIN provisoire et le lien de l'app
- [ ] Les permissions par défaut suivent le rôle ; une exception est tracée
- [ ] Navigation identique à la maquette : « Retour » → ConfigEquipeListe (/(patron)/reglages/equipe) ; « Nouveau PIN provisoire SMS · valable 1 h » → SuperviseurEquipe (/(superviseur)/equipe) ; « Voir sa fiche · 90 jours billets, écarts, journal » → PatronPersonne (/(patron)/personnes/[personneId]) ; « Désactiver le compte immédiat · tracé » → ConfigEquipeListe (/(patron)/reglages/equipe) ; « Enregistrer · mon PIN daté, signé, visible au rapport du soir » → ConfigEquipeListe (/(patron)/reglages/equipe)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/ConfigPersonne.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-124 · Modifier une règle de l'agence

**Épique** E11 Réglages et modules · **Type** ecran · **Priorité** P0 · **Estimation** 3 pts · **Échéance** 24 oct. → 4 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-006, AM-016  
**Planches** ConfigRegles · **Route** `/(patron)/reglages/regles`  
**Périmètre** `apps/web/src/routes/(patron)/reglages/regles.tsx`, `apps/web/src/ecrans/ConfigRegles/**`

Annulation (gratuite jusqu'à, retenue ensuite), caisse (tolérance, au-delà), comptes MoMo marchands avec règles de changement, historique, « Enregistrer · mon PIN · 3 gares ».

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite ConfigRegles` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Changer un compte MoMo exige le PIN et un SMS de confirmation à l'ancien numéro
- [ ] Chaque règle garde son historique (qui, quand, ancienne et nouvelle valeur)
- [ ] Navigation identique à la maquette : « Retour » → Config (/(patron)/reglages) ; « Annuler » → Config (/(patron)/reglages) ; « Enregistrer · mon PIN appliqué dès maintenant · 3 gares » → Config (/(patron)/reglages)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/ConfigRegles.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-125 · Les 12 modules : activer ou masquer

**Épique** E11 Réglages et modules · **Type** ecran · **Priorité** P0 · **Estimation** 3 pts · **Échéance** 24 oct. → 4 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-006, AM-016, AM-126  
**Planches** Modules · **Route** `/(patron)/reglages/modules`  
**Périmètre** `apps/web/src/routes/(patron)/reglages/modules.tsx`, `apps/web/src/ecrans/Modules/**`

Liste des 12 modules avec état et interrupteur (Guichet et caisse toujours actif), condition affichée (partenaire, nombre de relais, livreurs…), mention « Un module masqué disparaît… sans rien perdre » et compteur actifs.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Modules` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Activer ou masquer un module = 2 touches depuis l'accueil patron
- [ ] Le changement s'applique par gare ou par ville
- [ ] Navigation identique à la maquette : « Retour aux réglages » → Config (/(patron)/reglages)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Modules.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-126 · Moteur des modules (activation par agence, gare et ville)

**Épique** E11 Réglages et modules · **Type** backend · **Priorité** P0 · **Estimation** 5 pts · **Échéance** 24 oct. → 4 nov.  
**Dépend de** AM-017, AM-016  
**Planches** Modules · **Route** `/(patron)/reglages/modules`  
**Périmètre** `apps/api/src/modules/**`, `packages/api-client/src/modules/**`

Les 12 modules activables ou masquables sans développeur, par agence, gare et ville ; API + hook `useModule()` dans le client ; un module masqué disparaît de toutes les apps (pas de bouton grisé, pas de « bientôt »), sans perte de données.

Critères d'acceptation :
- [ ] Masquer un module retire ses entrées dans l'app voyageur, guichet et patron au prochain rafraîchissement
- [ ] Guichet et caisse ne peut pas être masqué
- [ ] Chaque changement est tracé

Tâches :
- Modèle de données et migrations
- Services et règles métier
- Routes conformes aux contrats
- Tests unitaires et d'intégration
- Brancher les écrans concernés sur l'adaptateur HTTP et vérifier

#### AM-160 · Moteur hors ligne et synchronisation

**Épique** E15 Socle technique : hors ligne, paiements, messages · **Type** backend · **Priorité** P0 · **Estimation** 13 pts · **Échéance** 24 oct. → 4 nov.  
**Dépend de** AM-010, AM-017, AM-015  
**Planches** Guichet, Convoyeur, SuperviseurDebloquer, CadenceBillet · **Route** `/(guichet)/accueil, /(bus)/convoyeur, /(superviseur)/debloquer/[appareilId], /(guichet)/cadence/vendu`  
**Périmètre** `packages/sync/**`, `apps/api/src/sync/**`

Chaque action est un événement horodaté et signé par l'appareil, écrit dans une base locale (SQLite) puis envoyé ; le serveur rejoue dans l'ordre ; identifiants créés sur l'appareil (UUID + numéro de plage) ; hors ligne, un guichet ne vend que dans sa part du plan de sièges ; conflit : le premier horodatage gagne, le second billet passe « à replacer » avec alerte ; appareil hors ligne > 12 h bloqué jusqu'au PIN superviseur ; indicateur SYNC / HORS LIGNE pour toutes les apps agence ; synchronisation par partage de connexion.

Critères d'acceptation :
- [ ] 4 heures de vente hors ligne sur 3 guichets puis synchronisation : aucun doublon, aucun trou
- [ ] Aucune perte de vente si l'app est tuée pendant l'envoi
- [ ] Blocage après 12 h et déblocage par PIN testés

Tâches :
- Modèle de données et migrations
- Services et règles métier
- Routes conformes aux contrats
- Tests unitaires et d'intégration
- Brancher les écrans concernés sur l'adaptateur HTTP et vérifier

#### AM-161 · Numérotation sans trou côté serveur et plages

**Épique** E15 Socle technique : hors ligne, paiements, messages · **Type** backend · **Priorité** P0 · **Estimation** 5 pts · **Échéance** 24 oct. → 4 nov.  
**Dépend de** AM-160  
**Planches** CadenceBillet, SuperviseurDebloquer, RapportSoir · **Route** `/(guichet)/cadence/vendu, /(superviseur)/debloquer/[appareilId], /(patron)/rapport`  
**Périmètre** `apps/api/src/numerotation/**`

Attribution des plages par guichet et convoyeur, vérification des numéros reçus, détection des trous (alerte dans le rapport du soir), compteur du jour.

Critères d'acceptation :
- [ ] Un trou dans une plage déclenche une alerte nominative
- [ ] Un numéro ne peut jamais être attribué deux fois

Tâches :
- Modèle de données et migrations
- Services et règles métier
- Routes conformes aux contrats
- Tests unitaires et d'intégration
- Brancher les écrans concernés sur l'adaptateur HTTP et vérifier

#### AM-162 · Backend billetterie : départs, sièges, billets, scan

**Épique** E15 Socle technique : hors ligne, paiements, messages · **Type** backend · **Priorité** P0 · **Estimation** 8 pts · **Échéance** 24 oct. → 4 nov.  
**Dépend de** AM-017, AM-013, AM-015, AM-160  
**Planches** Main, SiegePay, Pass, Vente, Quai · **Route** `/(voyageur)/voyager, /(voyageur)/depart/[departId], /(voyageur)/billet/[billetId], /(guichet)/vendre, /(quai)/embarquement`  
**Périmètre** `apps/api/src/billetterie/**`

Lignes, départs et états, inventaire des sièges en temps réel (WebSocket) partagé entre guichets, app, convoyeurs et vendeurs ; blocage de siège 15 min ; émission du billet nominatif avec code 4 chiffres et QR signé ; annulation, report, non présenté ; scan au quai (refus du double scan) ; fusion de départs ; prix au prorata des arrêts ; recherche multi-compagnies avec filtres.

Critères d'acceptation :
- [ ] Un siège ne peut pas être vendu deux fois en ligne
- [ ] Billet scanné deux fois : refusé
- [ ] Le QR ne peut pas être forgé (signature vérifiée hors ligne)

Tâches :
- Modèle de données et migrations
- Services et règles métier
- Routes conformes aux contrats
- Tests unitaires et d'intégration
- Brancher les écrans concernés sur l'adaptateur HTTP et vérifier

#### AM-163 · Backend colis

**Épique** E15 Socle technique : hors ligne, paiements, messages · **Type** backend · **Priorité** P0 · **Estimation** 8 pts · **Échéance** 24 oct. → 4 nov.  
**Dépend de** AM-017, AM-014, AM-160  
**Planches** ColisEnvoi, ColisCode, GuichetColis, Depot · **Route** `/(voyageur)/colis, /(voyageur)/colis/[colisId], /(guichet)/colis, /(guichet)/depot`  
**Périmètre** `apps/api/src/colis/**`

Enregistrement (guichet et app prépayée), photos stockées puis supprimées à 90 jours, code de retrait 6 chiffres aléatoire et haché envoyé au destinataire seul, états et scans (chargement, déchargement, relais, livraison, remise), assurance via l'assureur partenaire, complément de poids, réclamations et indemnisation.

Critères d'acceptation :
- [ ] Le code de retrait n'est jamais stocké en clair ni imprimé
- [ ] Chaque scan fait avancer l'état et notifie l'expéditeur

Tâches :
- Modèle de données et migrations
- Services et règles métier
- Routes conformes aux contrats
- Tests unitaires et d'intégration
- Brancher les écrans concernés sur l'adaptateur HTTP et vérifier

#### AM-164 · Backend caisse et supervision

**Épique** E15 Socle technique : hors ligne, paiements, messages · **Type** backend · **Priorité** P0 · **Estimation** 8 pts · **Échéance** 24 oct. → 4 nov.  
**Dépend de** AM-017, AM-015, AM-160  
**Planches** Caisse, Superviseur, SuperviseurValider, SuperviseurVoir, SuperviseurEquipe · **Route** `/(guichet)/caisse, /(superviseur)/gare, /(superviseur)/cloture/[sessionId], /(superviseur)/annulation/[demandeId], /(superviseur)/equipe`  
**Périmètre** `apps/api/src/caisse/**`, `apps/api/src/supervision/**`

Sessions de caisse (ouverture, clôture, validation PIN, clôture automatique à minuit), calcul du cash attendu, écart et tolérance, demandes d'annulation et décision PIN, gestion des PIN (hachés, provisoires 1 h par SMS, 3 essais puis blocage 15 min et alerte patron), comptes et rôles, journal signé.

Critères d'acceptation :
- [ ] Écart calculé au franc près
- [ ] Aucune annulation sans PIN superviseur
- [ ] Un PIN n'est jamais lisible

Tâches :
- Modèle de données et migrations
- Services et règles métier
- Routes conformes aux contrats
- Tests unitaires et d'intégration
- Brancher les écrans concernés sur l'adaptateur HTTP et vérifier

#### AM-166 · Passerelle SMS

**Épique** E15 Socle technique : hors ligne, paiements, messages · **Type** integration · **Priorité** P0 · **Estimation** 5 pts · **Échéance** 24 oct. → 4 nov.  
**Dépend de** AM-017  
**Périmètre** `apps/api/src/sms/**`

Agrégateur SMS avec l'expéditeur « AfriMove », gabarits (billet avec QR lien et code, code de retrait, alertes proche, retard, PIN provisoire), suivi du coût (12 F / SMS), envoi à la demande pour le billet guichet.

Critères d'acceptation :
- [ ] Délai d'envoi médian < 5 s
- [ ] Coût par type de SMS visible dans l'administration

Tâches :
- Compte et accès sandbox du fournisseur
- Client et webhooks
- Tests en sandbox
- Mode dégradé et journalisation
- Brancher les écrans concernés

#### AM-167 · WhatsApp Business : notifications et rapport

**Épique** E15 Socle technique : hors ligne, paiements, messages · **Type** integration · **Priorité** P0 · **Estimation** 5 pts · **Échéance** 24 oct. → 4 nov.  
**Dépend de** AM-017  
**Planches** RapportSoir · **Route** `/(patron)/rapport`  
**Périmètre** `apps/api/src/whatsapp/**`

Compte WhatsApp Business vérifié, gabarits approuvés (rapport du soir, billet, colis, alertes), envoi et réception, réponse en 2 min affichée.

Critères d'acceptation :
- [ ] Le rapport de 21 h part par WhatsApp au patron et aux superviseurs

Tâches :
- Compte et accès sandbox du fournisseur
- Client et webhooks
- Tests en sandbox
- Mode dégradé et journalisation
- Brancher les écrans concernés

#### AM-171 · Génération du rapport du soir (21 h)

**Épique** E08 Supervision et rapport du soir · **Type** backend · **Priorité** P0 · **Estimation** 5 pts · **Échéance** 24 oct. → 4 nov.  
**Dépend de** AM-164, AM-162, AM-163, AM-167, AM-161  
**Planches** RapportSoir · **Route** `/(patron)/rapport`  
**Périmètre** `apps/api/src/rapport/**`

À 21 h : agrégats du jour par gare, écarts validés, départs fusionnés, ventes en route, contrôles, remplissage, annulations, ventes en ligne, trous de numérotation, billets de cadence sans nom ; signature des superviseurs ; envoi WhatsApp au patron et aux superviseurs ; disponible dans l'app.

Critères d'acceptation :
- [ ] Rapport exact au centime près contre la base
- [ ] Part à 21:00 même si une caisse n'est pas validée (signalée)

Tâches :
- Modèle de données et migrations
- Services et règles métier
- Routes conformes aux contrats
- Tests unitaires et d'intégration
- Brancher les écrans concernés sur l'adaptateur HTTP et vérifier

#### AM-172 · Sécurité, mode kiosque et sauvegardes

**Épique** E15 Socle technique : hors ligne, paiements, messages · **Type** backend · **Priorité** P0 · **Estimation** 8 pts · **Échéance** 24 oct. → 4 nov.  
**Dépend de** AM-017, AM-018  
**Périmètre** `infra/sauvegardes/**`, `apps/web/src/kiosque/**`

Chiffrement en transit et au repos, PIN et codes hachés, téléphones de guichet Android en mode kiosque (Android Enterprise, Chrome plein écran), effaçables à distance en moins de 10 minutes ; sauvegarde complète chaque nuit à 2 h conservée 30 jours, journal sur 7 jours, deux fournisseurs dans deux régions, test de restauration documenté (< 2 h).

Critères d'acceptation :
- [ ] Restauration complète sur un serveur vide réussie et chronométrée
- [ ] Effacement à distance testé sur un appareil

Tâches :
- Modèle de données et migrations
- Services et règles métier
- Routes conformes aux contrats
- Tests unitaires et d'intégration
- Brancher les écrans concernés sur l'adaptateur HTTP et vérifier

#### AM-084 · Contrôleur inopiné

**Épique** E07 Quai et bus · **Type** ecran · **Priorité** P1 · **Estimation** 5 pts · **Échéance** 24 oct. → 4 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-007, AM-015, AM-162  
**Planches** Controleur · **Route** `/(controle)/inopine`  
**Périmètre** `apps/web/src/routes/(controle)/inopine.tsx`, `apps/web/src/ecrans/Controleur/**`

Pastille INOPINÉ ; Liste / Comptés / Écart ; plan siège par siège (scanné, occupé sans billet, libre) ; fiche du siège en anomalie avec explication ; « Régulariser · billet 4 000 », « Signaler le convoyeur », « Clore le contrôle · envoyer au patron ».

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Controleur` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Le compteur de têtes se saisit en touchant les sièges
- [ ] Le rapport de contrôle part au patron et apparaît dans le rapport du soir
- [ ] Navigation identique à la maquette : « Retour » → Superviseur (/(superviseur)/gare) ; « Clore le contrôle · envoyer au patron » → RapportSoir (/(patron)/rapport)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Controleur.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-170 · Suivi GPS en temps réel des bus et livreurs

**Épique** E15 Socle technique : hors ligne, paiements, messages · **Type** backend · **Priorité** P1 · **Estimation** 8 pts · **Échéance** 24 oct. → 4 nov.  
**Dépend de** AM-017, AM-015  
**Planches** Direct, Arret, Chauffeur, Livraison, Controle · **Route** `/(voyageur)/billet/[billetId]/direct, /(voyageur)/monter-en-route, /(bus)/chauffeur, /(voyageur)/colis/[colisId]/livraison, /controle`  
**Périmètre** `apps/api/src/gps/**`

Le téléphone du convoyeur ou du chauffeur envoie sa position toutes les 30 s ; heure d'arrivée estimée, retard, arrêts ; alerte d'arrêt anormal (bus arrêté après Edéa) ; SMS au proche 15 min avant l'arrivée ; position des livreurs.

Critères d'acceptation :
- [ ] Position mise à jour toutes les 30 s dans l'app voyageur et la salle de contrôle
- [ ] Alerte si un bus est arrêté plus de 10 min hors arrêt

Tâches :
- Modèle de données et migrations
- Services et règles métier
- Routes conformes aux contrats
- Tests unitaires et d'intégration
- Brancher les écrans concernés sur l'adaptateur HTTP et vérifier

### Vague 2 · Voyageur, colis, paiements (27 oct. → 7 nov.)

#### AM-020 · Écran de première ouverture : logo à volets, jingle, langue

**Épique** E01 Première ouverture et compte · **Type** ecran · **Priorité** P1 · **Estimation** 3 pts · **Échéance** 27 oct. → 7 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-013  
**Planches** Splash · **Route** `/bienvenue`  
**Périmètre** `apps/web/src/routes/bienvenue.tsx`, `apps/web/src/ecrans/Splash/**`

Premier écran au tout premier lancement. Logo piste E animé (tuile nuit, deux lames, A ambre sans barre, animation des volets), signature « A · comme Avance », slogan « Où que tu sois, on te trouve. », lecteur du jingle de 10 s (fichier audio de la maquette), choix de langue FR / EN / Pidgin en haut, bouton principal « Commencer · 30 secondes » et lien « J'ai déjà un compte », mention « Billets, colis et covoiturage · … · marche aussi sans internet ».

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Splash` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Le jingle ne démarre qu'au toucher (pas de lecture automatique imposée) et se coupe en quittant l'écran
- [ ] La langue choisie s'applique immédiatement et est mémorisée
- [ ] Cet écran n'apparaît qu'au premier lancement ; ensuite l'app ouvre l'accueil du rôle
- [ ] Navigation identique à la maquette : « Commencer · 30 secondes » → Connexion (/connexion) ; « J'ai déjà un compte » → Connexion (/connexion)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Splash.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

> Note : Le nombre de compagnies affiché (« 5 compagnies partenaires ») vient de l'API, pas du texte.

#### AM-021 · Connexion par numéro + code SMS (WhatsApp, USSD)

**Épique** E01 Première ouverture et compte · **Type** ecran · **Priorité** P1 · **Estimation** 3 pts · **Échéance** 27 oct. → 7 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-006, AM-013, AM-023  
**Planches** Connexion · **Route** `/connexion`  
**Périmètre** `apps/web/src/routes/connexion.tsx`, `apps/web/src/ecrans/Connexion/**`

Étape 1 sur 2 : « Ton numéro, c'est ton compte. » Champ téléphone +237, puis étape 2 : code reçu par SMS en 4 cases qui se remplit seul (WebOTP), compte à rebours « renvoyer dans 0:42 », bouton « Continuer », alternatives « Par WhatsApp » et « Sans internet · *123# », mentions légales.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Connexion` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Le code se remplit automatiquement à la réception du SMS (WebOTP sur Chrome Android, Safari iOS)
- [ ] Renvoi possible seulement à la fin du compte à rebours ; 5 essais max puis attente
- [ ] « Par WhatsApp » envoie le code par WhatsApp ; « Sans internet » ouvre l'écran USSD
- [ ] Aucun mot de passe ; le compte est créé au premier code valide
- [ ] Navigation identique à la maquette : « Retour » → Splash (/bienvenue) ; « Continuer » → Tuto (/tutoriel) ; « Sans internet · *123# » → USSD (/(voyageur)/sans-internet)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Connexion.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-023 · Backend authentification voyageur : OTP SMS et WhatsApp

**Épique** E01 Première ouverture et compte · **Type** backend · **Priorité** P1 · **Estimation** 3 pts · **Échéance** 27 oct. → 7 nov.  
**Dépend de** AM-017, AM-013, AM-166  
**Planches** Connexion · **Route** `/connexion`  
**Périmètre** `apps/api/src/auth-voyageur/**`

Envoi et vérification du code (SMS via la passerelle, WhatsApp en alternative), compte = numéro, session, limitation des essais et des envois, format compatible WebOTP (`@` + domaine + `#` + code) pour l'auto-remplissage.

Critères d'acceptation :
- [ ] 5 essais max puis attente ; 1 envoi par 40 s
- [ ] Le code n'est jamais journalisé en clair
- [ ] Les écrans Connexion fonctionnent avec l'adaptateur HTTP

Tâches :
- Modèle de données et migrations
- Services et règles métier
- Routes conformes aux contrats
- Tests unitaires et d'intégration
- Brancher les écrans concernés sur l'adaptateur HTTP et vérifier

#### AM-030 · Accueil voyageur : départs en direct, tout à 1 touche

**Épique** E02 Voyageur · acheter un billet · **Type** ecran · **Priorité** P1 · **Estimation** 8 pts · **Échéance** 27 oct. → 7 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-007, AM-013, AM-126  
**Planches** Main · **Route** `/(voyageur)/voyager`  
**Périmètre** `apps/web/src/routes/(voyageur)/voyager.tsx`, `apps/web/src/ecrans/Main/**`

L'écran le plus important de l'app voyageur. En-tête AfriMove + « Bonjour Aïcha » + pastille DIRECT qui pulse ; sélecteur « Entre villes / Dans la même ville » ; volets de destination DLA ⇄ YDE avec bouton inverser ; position détectée « Tu es à Douala · Akwa → Yaoundé Mvan » ; sélecteur de date « Auj. » ; résumé du filtre « Toutes classes · 5 compagnies · 2 préférées » ; onglets Tout · Bus · Covoit ; liste des départs à places réelles (bus et covoiturages mélangés, triés par heure, préférées d'abord) ; lien « 14 bus et 6 covoiturages aujourd'hui · voir tout » ; 6 cartes raccourcis (Envoyer un colis, Payer pour un proche, Groupe · bus entier, Moto vers la gare, Monter en route, Sans internet) ; bandeau de notification colis ; barre d'onglets voyageur.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Main` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Les places affichées se mettent à jour en temps réel sans recharger l'écran
- [ ] Toucher une ville ouvre le choix de ville ; inverser échange départ et arrivée avec l'animation des volets
- [ ] Un module masqué (colis, covoit, moto, USSD…) retire sa carte et ses départs sans laisser de trou ni de bouton grisé
- [ ] Toucher un départ de bus ouvre Siège + paiement, un covoiturage ouvre Covoiturage : c'est la touche 1 du parcours d'achat
- [ ] Navigation identique à la maquette : « Dans la même ville » → MainVille (/(voyageur)/voyager/ville) ; « Toutes classes · 5 compagnies 2 préférées » → MainFiltres (/(voyageur)/voyager/filtres) ; « 08:00 Bêta Express VIP 9 places 7 500 » → SiegePay (/(voyageur)/depart/[departId]) ; « 08:30 Alpha Voyages Classique 18 places 4 000 » → SiegePay (/(voyageur)/depart/[departId]) ; « 09:30 Oméga Transports Classique plus que 3 3 800 » → SiegePay (/(voyageur)/depart/[departId]) ; « 08:45 Covoiturage Samuel · vérifié Bonapriso · 2 places · Toyota 5 000 » → Covoit (/(voyageur)/covoit) ; « 14 bus et 6 covoiturages aujourd'hui · voir tout » → Reseau (/(voyageur)/reseau) ; « Envoyer un colis » → ColisEnvoi (/(voyageur)/colis) ; « Payer pour un proche » → Proche (/(voyageur)/proche) ; « Groupe · bus entier » → Groupe (/(voyageur)/groupe) ; « Moto vers la gare » → Course (/(voyageur)/course) ; « Monter en route » → Arret (/(voyageur)/monter-en-route) ; « Sans internet » → USSD (/(voyageur)/sans-internet) ; « Ton colis pour Maman est arrivé à Bafoussam Code de retrait envoyé · voir la photo » → ColisCode (/(voyageur)/colis/[colisId]) ; « Voyager » → reste sur l'écran (action sur place) ; « Colis » → ColisEnvoi (/(voyageur)/colis) ; « Covoit » → Covoit (/(voyageur)/covoit) ; « Moi » → Moi (/(voyageur)/moi)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Main.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-031 · Filtre déroulant des départs : classe, compagnies, préférées

**Épique** E02 Voyageur · acheter un billet · **Type** ecran · **Priorité** P1 · **Estimation** 5 pts · **Échéance** 27 oct. → 7 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-006, AM-013, AM-030  
**Planches** MainFiltres · **Route** `/(voyageur)/voyager/filtres`  
**Périmètre** `apps/web/src/routes/(voyageur)/voyager/filtres.tsx`, `apps/web/src/ecrans/MainFiltres/**`

Panneau qui se déroule sous le résumé du filtre de l'accueil : Classe (Toutes · VIP · clim · Classique) ; Compagnies avec cases à cocher (Toutes, puis chaque compagnie avec son nombre de départs) et étoile pour ajouter / retirer des préférées ; « Aussi » : Covoiturage, Matin seulement, Places côte à côte, ≤ 5 000 F ; « Effacer » et bouton « Voir les 14 départs » avec le nombre recalculé.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite MainFiltres` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Le compteur du bouton se recalcule à chaque changement
- [ ] Les préférées s'affichent toujours en premier dans la liste des départs
- [ ] Le filtre est mémorisé par trajet (Douala → Yaoundé) sur l'appareil
- [ ] Navigation identique à la maquette : « Dans la même ville » → MainVille (/(voyageur)/voyager/ville) ; « Filtrer les départs » → Main (/(voyageur)/voyager) ; « Voir les 14 départs » → Main (/(voyageur)/voyager) ; « Voyager » → Main (/(voyageur)/voyager) ; « Colis » → ColisEnvoi (/(voyageur)/colis) ; « Covoit » → Covoit (/(voyageur)/covoit) ; « Moi » → Moi (/(voyageur)/moi)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/MainFiltres.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

> Note : Implémenté comme un panneau de l'accueil (même route avec état ouvert), pas comme une page séparée.

#### AM-033 · Siège + paiement en un écran (touche 2)

**Épique** E02 Voyageur · acheter un billet · **Type** ecran · **Priorité** P1 · **Estimation** 8 pts · **Échéance** 27 oct. → 7 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-006, AM-007, AM-013, AM-030  
**Planches** SiegePay · **Route** `/(voyageur)/depart/[departId]`  
**Périmètre** `apps/web/src/routes/(voyageur)/depart/[departId].tsx`, `apps/web/src/ecrans/SiegePay/**`

Un seul écran pour choisir la place et payer : rappel du départ (Bêta Express · VIP, trajet, heure, durée), choix « Pour moi / Pour un proche / À plusieurs », plan des sièges en temps réel (pris, libre, toi) avec légende et description du siège choisi (« côté fenêtre · près de la porte »), voyageur prérempli (nom, numéro, « modifier »), mode de paiement MTN MoMo · Orange Money · Carte, récapitulatif (billet + frais de service AfriMove sur une ligne à part, code promo JOURJ qui les offre), bouton principal « Payer et recevoir le billet · touche 3 » avec le prix, mention « L'argent du billet va à Bêta Express. AfriMove ne le garde pas. »

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite SiegePay` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Le badge « TOUCHE n » n'apparaît que si le flag conception est actif (absent en production)
- [ ] Toucher un siège libre le bloque 15 min pour l'utilisateur ; un siège pris par un autre entre-temps est signalé sans perdre la saisie
- [ ] Les frais de service (250 F) sont toujours sur une ligne à part, jamais ajoutés au prix du billet
- [ ] Payer déclenche la confirmation MoMo sur le téléphone puis ouvre le billet ; échec ou délai expiré : message clair et siège relâché
- [ ] « Pour un proche » et « À plusieurs » mènent aux écrans Proche et Groupe
- [ ] Navigation identique à la maquette : « Retour aux départs » → Main (/(voyageur)/voyager) ; « Pour un proche » → Proche (/(voyageur)/proche) ; « À plusieurs » → Groupe (/(voyageur)/groupe) ; « modifier » → Moi (/(voyageur)/moi) ; « Payer et recevoir le billet touche 3 · confirmation MoMo sur ton téléphone 7 500 F » → Pass (/(voyageur)/billet/[billetId])
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/SiegePay.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-034 · Écran de paiement générique (MoMo, Orange Money, carte, un proche)

**Épique** E02 Voyageur · acheter un billet · **Type** ecran · **Priorité** P1 · **Estimation** 5 pts · **Échéance** 27 oct. → 7 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-006, AM-013, AM-165  
**Planches** Paiement · **Route** `/(voyageur)/paiement/[commandeId]`  
**Périmètre** `apps/web/src/routes/(voyageur)/paiement/[commandeId].tsx`, `apps/web/src/ecrans/Paiement/**`

Écran de paiement réutilisé par le covoiturage, le groupe, la ville et la moto : objet payé, montant à payer en grand, détail (trajet + frais de service), choix MTN Mobile Money (numéro, « tu confirmes sur ton téléphone »), Orange Money (#150#), Carte bancaire (aussi depuis l'étranger), « Demander à un proche de payer » (lien), mention de l'établissement agréé, bouton « Payer 4 250 F ».

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Paiement` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Le badge « TOUCHE n » n'apparaît que si le flag conception est actif (absent en production)
- [ ] Le même composant sert tous les types de commande (paramètre commandeId)
- [ ] « Demander à un proche » génère un lien de paiement partageable ; le billet arrive quand le proche a payé
- [ ] Paiement réussi → billet par SMS en 10 s et ouverture du billet ou de la réservation
- [ ] Navigation identique à la maquette : « Retour » → Covoit (/(voyageur)/covoit) ; « Demander à un proche de payer il reçoit un lien, tu reçois le billet » → Proche (/(voyageur)/proche) ; « Payer 4 250 F confirmation MoMo · billet par SMS en 10 s » → Pass (/(voyageur)/billet/[billetId])
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Paiement.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-035 · Mon billet : QR, code 4 chiffres

**Épique** E02 Voyageur · acheter un billet · **Type** ecran · **Priorité** P1 · **Estimation** 5 pts · **Échéance** 27 oct. → 7 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-007, AM-013  
**Planches** Pass · **Route** `/(voyageur)/billet/[billetId]`  
**Périmètre** `apps/web/src/routes/(voyageur)/billet/[billetId].tsx`, `apps/web/src/ecrans/Pass/**`

Billet après paiement : pastille « Payé · billet envoyé par SMS », bouton partager, compagnie et numéro de billet, souche DLA → YDE avec durée, départ / date / siège / classe, QR code et « Code sans scanner 7341 », nom et 4 derniers chiffres de la pièce, « Au quai 20 min avant, avec ta pièce. », cartes : Suivre mon bus et prévenir un proche, Moto vers la gare (heure et prix calculés), Reporter ou annuler (gratuit jusqu'à …), + colis.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Pass` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Le billet reste affichable sans réseau (cache local chiffré)
- [ ] La limite d'annulation gratuite est calculée depuis la règle de la compagnie
- [ ] Partager envoie un lien ou une image du billet par WhatsApp
- [ ] Navigation identique à la maquette : « Retour à l'accueil » → Main (/(voyageur)/voyager) ; « Suivre mon bus et prévenir un proche » → Direct (/(voyageur)/billet/[billetId]/direct) ; « Moto vers la gare part à 07:10 · 700 F » → Course (/(voyageur)/course) ; « Reporter ou annuler · gratuit jusqu'à 07:00 » → Moi (/(voyageur)/moi) ; « + colis » → ColisEnvoi (/(voyageur)/colis) ; « Voyager » → Main (/(voyageur)/voyager) ; « Colis » → ColisEnvoi (/(voyageur)/colis) ; « Covoit » → Covoit (/(voyageur)/covoit) ; « Moi » → Moi (/(voyageur)/moi)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Pass.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-040 · Mon bus en direct et prévenir un proche

**Épique** E03 Voyageur · en route et services · **Type** ecran · **Priorité** P1 · **Estimation** 5 pts · **Échéance** 27 oct. → 7 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-007, AM-013, AM-170  
**Planches** Direct · **Route** `/(voyageur)/billet/[billetId]/direct`  
**Périmètre** `apps/web/src/routes/(voyageur)/billet/[billetId]/direct.tsx`, `apps/web/src/ecrans/Direct/**`

Suivi du bus : pastille EN DIRECT, arrivée estimée et retard, compagnie, siège, immatriculation ; carte « Prévenir Maman quand j'arrive · 1 touche · SMS 15 min avant » ; frise des arrêts (parti, arrêt, prochain arrêt, montée en route avec places) ; boutons Chauffeur, Signaler, Mon colis.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Direct` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Position et heure estimée mises à jour toutes les 30 s
- [ ] « Prévenir » programme un SMS au proche 15 min avant l'arrivée, en 1 touche
- [ ] « Signaler » ouvre un signalement rapide (retard, conduite, incident) transmis à la gare
- [ ] Navigation identique à la maquette : « Retour au billet » → Pass (/(voyageur)/billet/[billetId]) ; « Prévenir Maman quand j'arrive 1 touche · elle reçoit un SMS 15 min avant Mvan » → Moi (/(voyageur)/moi) ; « Boumnyebel · 4 places montent ici 10:40 » → Arret (/(voyageur)/monter-en-route) ; « Mon colis » → ColisCode (/(voyageur)/colis/[colisId]) ; « Voyager » → Main (/(voyageur)/voyager) ; « Colis » → ColisEnvoi (/(voyageur)/colis) ; « Covoit » → Covoit (/(voyageur)/covoit) ; « Moi » → Moi (/(voyageur)/moi)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Direct.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-044 · Payer le voyage d'un proche, depuis l'étranger

**Épique** E03 Voyageur · en route et services · **Type** ecran · **Priorité** P1 · **Estimation** 5 pts · **Échéance** 27 oct. → 7 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-006, AM-007, AM-013  
**Planches** Proche · **Route** `/(voyageur)/proche`  
**Périmètre** `apps/web/src/routes/(voyageur)/proche.tsx`, `apps/web/src/ecrans/Proche/**`

Choix du proche (Maman, Paul, + nouveau numéro), trajet et date, départs avec siège choisi pour lui, paiement par carte avec conversion affichée (≈ 12,90 $ CA), option « Me prévenir quand elle monte et quand elle arrive », bouton « Payer · Maman reçoit son billet ».

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Proche` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Le badge « TOUCHE n » n'apparaît que si le flag conception est actif (absent en production)
- [ ] Le proche reçoit le billet par SMS (QR + code 4 chiffres), sans smartphone ni internet
- [ ] Le montant converti est indicatif et le débit se fait en FCFA par l'agrégateur
- [ ] Navigation identique à la maquette : « Retour » → Main (/(voyageur)/voyager) ; « Payer · Maman reçoit son billet touche 3 · SMS avec QR et code 4 chiffres 5 750 F » → Pass (/(voyageur)/billet/[billetId])
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Proche.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-060 · Envoyer un colis : photo + formulaire en un écran

**Épique** E05 Colis côté voyageur · **Type** ecran · **Priorité** P1 · **Estimation** 5 pts · **Échéance** 27 oct. → 7 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-006, AM-014  
**Planches** ColisEnvoi · **Route** `/(voyageur)/colis`  
**Périmètre** `apps/web/src/routes/(voyageur)/colis.tsx`, `apps/web/src/ecrans/ColisEnvoi/**`

Un écran : photo du colis (taille estimée), Pour qui, Où, Contenu déclaré, Valeur, « Comment ça part » (prochain départ en gare, relais +300, moto +1 000), assurance (2 % de la valeur, min 500, assureur partenaire), bouton « Payer et obtenir le code » avec le total, détail du prix et interdits.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite ColisEnvoi` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Le badge « TOUCHE n » n'apparaît que si le flag conception est actif (absent en production)
- [ ] La photo est prise avec la caméra dans l'écran, sans quitter le formulaire
- [ ] Le prix total = port + 200 F de frais + assurance éventuelle + option, chaque ligne détaillée
- [ ] Après paiement : code de retrait envoyé au destinataire seul, ouverture du suivi
- [ ] Navigation identique à la maquette : « Retour » → Main (/(voyageur)/voyager) ; « relais Remis chez un commerçant près de chez elle · 7 h–20 h +300 » → Relais (/(voyageur)/colis/[colisId]/relais) ; « moto Livré à sa porte par un livreur vérifié, photo à la remise +1 000 » → Livraison (/(voyageur)/colis/[colisId]/livraison) ; « Payer et obtenir le code touche 3 · tu déposes au guichet, l'étiquette est prête 2 200 F » → ColisCode (/(voyageur)/colis/[colisId])
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/ColisEnvoi.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-061 · Suivi du colis : code de retrait, étapes, photo

**Épique** E05 Colis côté voyageur · **Type** ecran · **Priorité** P1 · **Estimation** 5 pts · **Échéance** 27 oct. → 7 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-007, AM-014  
**Planches** ColisCode · **Route** `/(voyageur)/colis/[colisId]`  
**Périmètre** `apps/web/src/routes/(voyageur)/colis/[colisId].tsx`, `apps/web/src/ecrans/ColisCode/**`

Code de retrait 6 chiffres en très grand (visible par l'expéditeur, « à donner à Maman seulement »), photo au dépôt, « Envoyer le code », frise Déposé · Chargé · En route · Disponible · Remis avec heures, cartes « Faire livrer chez elle » et « Déposer en relais », réclamation en 1 touche.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite ColisCode` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Les étapes se mettent à jour à chaque scan (guichet, convoyeur, relais, livreur)
- [ ] Le code n'apparaît jamais ailleurs que chez l'expéditeur et le destinataire
- [ ] Navigation identique à la maquette : « Retour » → Main (/(voyageur)/voyager) ; « Faire livrer chez elle moto · 1 000 F · dès l'arrivée » → Livraison (/(voyageur)/colis/[colisId]/livraison) ; « Déposer en relais près de chez elle · 300 F » → Relais (/(voyageur)/colis/[colisId]/relais) ; « Voyager » → Main (/(voyageur)/voyager) ; « Colis » → ColisEnvoi (/(voyageur)/colis) ; « Covoit » → Covoit (/(voyageur)/covoit) ; « Moi » → Moi (/(voyageur)/moi)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/ColisCode.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-165 · Paiements : agrégateur MTN MoMo, Orange Money, cartes

**Épique** E15 Socle technique : hors ligne, paiements, messages · **Type** integration · **Priorité** P1 · **Estimation** 13 pts · **Échéance** 27 oct. → 7 nov.  
**Dépend de** AM-017, AM-013  
**Planches** SiegePay, Paiement, Proche, Vente · **Route** `/(voyageur)/depart/[departId], /(voyageur)/paiement/[commandeId], /(voyageur)/proche, /(guichet)/vendre`  
**Périmètre** `apps/api/src/paiements/**`

Intégration de l'agrégateur agréé : push MoMo, Orange Money, cartes (y compris étrangères), webhooks idempotents, reversement du prix à la compagnie et des frais à AfriMove sur des lignes séparées, liens de paiement pour un proche, remboursements, références opérateur conservées pour le rapprochement. Mode dégradé si l'agrégateur n'est pas prêt : réservation puis paiement au guichet ou MoMo marchand de l'agence.

Critères d'acceptation :
- [ ] Un paiement reçu deux fois ne crée qu'un billet
- [ ] AfriMove ne détient jamais le prix du billet
- [ ] Mode dégradé activable par réglage

Tâches :
- Compte et accès sandbox du fournisseur
- Client et webhooks
- Tests en sandbox
- Mode dégradé et journalisation
- Brancher les écrans concernés

#### AM-183 · Sous-écrans sans planche : feuilles, sélecteurs et fiches à dessiner dans le style v3

**Épique** E16 Qualité et lancement · **Type** ecran · **Priorité** P1 · **Estimation** 8 pts · **Échéance** 27 oct. → 7 nov.  
**Dépend de** AM-005, AM-006, AM-007, AM-009  
**Planches** Main, Direct, Moi, CovoitConducteur, Groupe, ColisCode, Livraison, Vente, Cadence, Chauffeur, Convoyeur, SuperviseurEquipe, Livreur · **Route** `/(voyageur)/voyager, /(voyageur)/billet/[billetId]/direct, /(voyageur)/moi, /(voyageur)/covoit/conducteur, /(voyageur)/groupe, /(voyageur)/colis/[colisId], /(voyageur)/colis/[colisId]/livraison, /(guichet)/vendre, /(guichet)/cadence, /(bus)/chauffeur, /(bus)/convoyeur, /(superviseur)/equipe, /(livreur)/accueil`  
**Périmètre** `apps/web/src/feuilles/**`

Les maquettes V3 ont des boutons qui ouvrent quelque chose sans que la planche existe. Ce ticket les conçoit tous d'un coup, en feuilles du bas ou pop-ups avec les composants du kit, pour qu'aucun bouton ne mène nulle part : choix de la ville et du jour (Accueil, « Changer de ville »), Signaler un problème et Appeler le chauffeur (Mon bus en direct), Réglages du compte (icône de Moi), Gérer un trajet publié (Je conduis), Devis pour louer un bus de 30 (Groupe), Réclamation colis en 1 touche (Suivi du colis), Changer l'adresse (Livraison), Client connu (Vente), Autre départ et + numéro (Cadence), Ajouter une dépense avec photo (Chauffeur), Colis à décharger (Convoyeur), Journal d'une personne (Superviseur · équipe), Retirer mes gains (Livreur).

Critères d'acceptation :
- [ ] Chaque sous-écran est validé par Luther sur capture avant fusion, puisqu'il n'a pas de planche
- [ ] Style v3 strict : fond nuit, action principale orange en bas, cartes plutôt que menus, aucun emoji
- [ ] La règle des 3 touches reste respectée pour la fonction concernée
- [ ] Chaque bouton listé ouvre son sous-écran ; aucun bouton sans destination dans l'app

Tâches :
- Lister chaque bouton sans planche et son contenu attendu
- Dessiner chaque feuille avec le kit v3
- Faire valider les captures par Luther
- Brancher chaque bouton sur sa feuille
- Tests de rendu et de navigation

#### AM-022 · Tutoriel en 3 écrans

**Épique** E01 Première ouverture et compte · **Type** ecran · **Priorité** P2 · **Estimation** 2 pts · **Échéance** 27 oct. → 7 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-007, AM-013  
**Planches** Tuto · **Route** `/tutoriel`  
**Périmètre** `apps/web/src/routes/tutoriel.tsx`, `apps/web/src/ecrans/Tuto/**`

Trois écrans glissables : « Ton billet, ton nom, ta place. » (mini-parcours 1 départ · 2 siège · 3 payer), « Ton colis suivi jusqu'au bout », « Tes proches savent quand tu arrives ». Indicateur 1 / 3, boutons « Passer » et « Suivant ».

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Tuto` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Balayage horizontal entre les 3 écrans, « Passer » mène à l'accueil voyageur
- [ ] Affiché une seule fois après la première connexion
- [ ] Navigation identique à la maquette : « Passer » → Main (/(voyageur)/voyager) ; « Suivant » → Main (/(voyageur)/voyager)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Tuto.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-036 · Le réseau en direct : toutes les compagnies

**Épique** E02 Voyageur · acheter un billet · **Type** ecran · **Priorité** P2 · **Estimation** 5 pts · **Échéance** 27 oct. → 7 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-007, AM-013  
**Planches** Reseau · **Route** `/(voyageur)/reseau`  
**Périmètre** `apps/web/src/routes/(voyageur)/reseau.tsx`, `apps/web/src/ecrans/Reseau/**`

Vue d'ensemble : nombre de compagnies, bus en route, départs à venir ; filtres Toutes · Bêta · Alpha · Oméga · VIP · Nuit ; lignes avec prochains départs et prix « dès … », ligne en correspondance (« Yaoundé → Bamenda via Bafoussam, un seul billet »), ligne sans bus comblée par le covoiturage.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Reseau` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Toucher une ligne ouvre Siège + paiement du prochain départ, ou Covoiturage pour une ligne covoit
- [ ] Mises à jour en direct (pastille horaire)
- [ ] Navigation identique à la maquette : « Retour à l'accueil » → Main (/(voyageur)/voyager) ; « Douala → Yaoundé 3 compagnies · 08:00 Bêta VIP · 08:30 Alpha · 09:30 Oméga dès 3 800 » → SiegePay (/(voyageur)/depart/[departId]) ; « Douala → Bafoussam 2 compagnies · 08:15 Alpha · 10:00 Oméga dès 3 500 » → SiegePay (/(voyageur)/depart/[departId]) ; « Yaoundé → Bamenda via Bafoussam correspondance 25 min · un seul billet dès 7 000 » → SiegePay (/(voyageur)/depart/[departId]) ; « Douala → Kribi covoiturage aucun bus avant 14 h · 2 voitures partent ce matin 4 000 » → Covoit (/(voyageur)/covoit) ; « Voyager » → Main (/(voyageur)/voyager) ; « Colis » → ColisEnvoi (/(voyageur)/colis) ; « Covoit » → Covoit (/(voyageur)/covoit) ; « Moi » → Moi (/(voyageur)/moi)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Reseau.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-046 · Moi : fidélité, parrainage, proches, historique

**Épique** E03 Voyageur · en route et services · **Type** ecran · **Priorité** P2 · **Estimation** 5 pts · **Échéance** 27 oct. → 7 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-007, AM-013  
**Planches** Moi · **Route** `/(voyageur)/moi`  
**Périmètre** `apps/web/src/routes/(voyageur)/moi.tsx`, `apps/web/src/ecrans/Moi/**`

Profil (initiales, nom, numéro, CNI vérifiée), réglages, fidélité (points = francs), parrainage AMI, mes proches avec achat en 1 touche, historique voyages et colis avec état, cartes « Deviens point de relais » et « Deviens livreur », Langue, Mes reçus, Aide WhatsApp, barre d'onglets.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Moi` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Un module masqué (relais, livraison, fidélité) retire sa carte
- [ ] Toucher un élément d'historique ouvre le billet ou le suivi du colis
- [ ] Navigation identique à la maquette : « + ajouter » → Proche (/(voyageur)/proche) ; « MA Maman · Bafoussam 6 99 … · prévenue à chaque arrivée Lui payer un billet » → Proche (/(voyageur)/proche) ; « KK Kevin · Montréal paie mes voyages par carte lui demander » → Proche (/(voyageur)/proche) ; « Douala → Yaoundé · mar. 5 janv. · 08:00 Bêta Express VIP · siège 7 · 7 500 F à venir » → Pass (/(voyageur)/billet/[billetId]) ; « Colis pour Maman · Bafoussam C-ALP-DLA-270103-0017 · 2 kg · 1 500 F à retirer » → ColisCode (/(voyageur)/colis/[colisId]) ; « Yaoundé → Douala · 28 déc. Alpha · 4 000 F · reçu disponible voyagé » → Pass (/(voyageur)/billet/[billetId]) ; « Une boutique ? Deviens point de relais 200 F par colis remis · 3 min » → RelaisDevenir (/(voyageur)/moi/devenir-relais) ; « Une moto ? Deviens livreur 700 F la course · tu choisis tes heures » → LivreurDevenir (/(voyageur)/moi/devenir-livreur) ; « Langue · FR » → reste sur l'écran (action sur place) ; « Mes reçus » → Pass (/(voyageur)/billet/[billetId]) ; « Aide · WhatsApp » → USSD (/(voyageur)/sans-internet) ; « Voyager » → Main (/(voyageur)/voyager) ; « Colis » → ColisEnvoi (/(voyageur)/colis) ; « Covoit » → Covoit (/(voyageur)/covoit) ; « Moi » → reste sur l'écran (action sur place)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Moi.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

### Vague 3 · Patron, comptable, salle de contrôle (3 → 12 nov.)

#### AM-101 · Mes gares, mes gens

**Épique** E09 Patron · **Type** ecran · **Priorité** P1 · **Estimation** 5 pts · **Échéance** 3 → 12 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-008, AM-016  
**Planches** PatronEquipe · **Route** `/(patron)/gares`  
**Périmètre** `apps/web/src/routes/(patron)/gares.tsx`, `apps/web/src/ecrans/PatronEquipe/**`

3 gares (superviseur, guichets, quais, recette, sync, écart) ; compteurs par rôle ; liste des 23 personnes glissable avec état ; « Le plus régulier », « À voir cette semaine », « Paie du mois » ; « + personne · + gare » et « Payer les 23 salaires ».

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite PatronEquipe` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Toucher une gare ouvre la gare, toucher une personne ouvre sa fiche
- [ ] Navigation identique à la maquette : « Retour » → Patron (/(patron)/aujourdhui) ; « Akwa · Mme Essono 3 guichets · 2 quais 1 412 000 3 / 3 sync · écart − 1 000 » → PatronGare (/(patron)/gares/[gareId]) ; « Mvan · Yaoundé · O. Essomba 2 guichets · 1 quai 948 000 2 / 2 sync · écart 0 » → PatronGare (/(patron)/gares/[gareId]) ; « Bafoussam · T. Kamga 1 guichet · 1 quai 386 000 hors ligne 40 min » → PatronGare (/(patron)/gares/[gareId]) ; « JM Joseph M. · guichetier · Akwa guichet 2 3 écarts · PIN à renouveler en service » → PatronPersonne (/(patron)/personnes/[personneId]) ; « MT Marie T. · guichetière · Akwa guichet 1 1 204 billets · 0 écart en service » → PatronPersonne (/(patron)/personnes/[personneId]) ; « ES Mme Essono · superviseure · Akwa 2 validations en attente en service » → PatronPersonne (/(patron)/personnes/[personneId]) ; « AB Alain B. · convoyeur · LT 412 AB 52 colis scannés · 0 litige à bord » → PatronPersonne (/(patron)/personnes/[personneId]) ; « PN Pauline N. · guichetière · Akwa guichet 3 bloquée · 3 PIN faux 09:40 bloquée » → PatronPersonne (/(patron)/personnes/[personneId]) ; « NB M. Nana · chauffeur · LT 207 AB 2 pannes · 1 retard repos » → PatronPersonne (/(patron)/personnes/[personneId]) ; « KF K. Fotso · chauffeur · LT 118 AB 8 trajets · à l’heure en route » → PatronPersonne (/(patron)/personnes/[personneId]) ; « OE O. Essomba · superviseur · Mvan rapport 21 h envoyé 4 / 4 en service » → PatronPersonne (/(patron)/personnes/[personneId]) ; « DT D. Tchinda · guichetier · Mvan guichet 1 612 billets · 0 écart en service » → PatronPersonne (/(patron)/personnes/[personneId]) ; « RM R. Mballa · chauffeur · LT 148 AB visite technique en cours indisponible » → PatronPersonne (/(patron)/personnes/[personneId]) ; « + personne · + gare » → Config (/(patron)/reglages) ; « Payer les 23 salaires le 30 · par MoMo · 1 touche » → Financement (/(patron)/financement)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/PatronEquipe.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-102 · Une gare en détail

**Épique** E09 Patron · **Type** ecran · **Priorité** P1 · **Estimation** 5 pts · **Échéance** 3 → 12 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-008, AM-016  
**Planches** PatronGare · **Route** `/(patron)/gares/[gareId]`  
**Périmètre** `apps/web/src/routes/(patron)/gares/[gareId].tsx`, `apps/web/src/ecrans/PatronGare/**`

Tuiles caisse, billets, colis, écart ; guichets (agent, billets, colis, écart, état, sync) ; quais et prochains départs ; journal de la gare du jour ; mention « Tu vois tout, tu ne touches pas la caisse » ; rapport d'hier et caisse en direct.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite PatronGare` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Le patron ne peut valider aucune caisse : les validations restent au superviseur
- [ ] Navigation identique à la maquette : « Retour » → PatronEquipe (/(patron)/gares) ; « MT Guichet 1 · Marie T. 142 billets · 38 colis · 0 écart 612 000 sync 14:01 » → PatronPersonne (/(patron)/personnes/[personneId]) ; « JM Guichet 2 · Joseph M. 121 billets · 31 colis · écart − 1 000 · clôture attend PIN 694 5 » → PatronPersonne (/(patron)/personnes/[personneId]) ; « PN Guichet 3 · Pauline N. 55 billets · 27 colis · bloquée depuis 09:40 105 500 bloqué » → PatronPersonne (/(patron)/personnes/[personneId]) ; « 16:00 · Douala → Yaoundé · LT 412 AB Mbarga · Alain B. · 27 / 30 · embarquement 15:30 3 li » → Quai (/(quai)/embarquement) ; « 17:00 · Douala → Bafoussam · LT 118 AB Fotso · 18 / 30 · 09:30 Oméga en face 12 libres » → Quai (/(quai)/embarquement) ; « Rapport 21 h d’hier » → RapportSoir (/(patron)/rapport) ; « Caisse en direct 1 412 000 · 3 guichets · live » → Caisse (/(guichet)/caisse)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/PatronGare.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-103 · Une personne de l'équipe

**Épique** E09 Patron · **Type** ecran · **Priorité** P1 · **Estimation** 5 pts · **Échéance** 3 → 12 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-008, AM-016  
**Planches** PatronPersonne · **Route** `/(patron)/personnes/[personneId]`  
**Périmètre** `apps/web/src/routes/(patron)/personnes/[personneId].tsx`, `apps/web/src/ecrans/PatronPersonne/**`

Fiche (rôle, poste, depuis, téléphone, salaire, superviseur, en service) ; tuiles billets, colis, annulations, écarts ; graphique des écarts sur 10 jours avec tolérance ; analyse en clair ; journal des derniers écarts ; actions Changer de guichet, Demander un nouveau PIN, Désactiver, En parler à l'assistant.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite PatronPersonne` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Le texte d'analyse vient de l'assistant (AM-109)
- [ ] Navigation identique à la maquette : « Retour » → PatronEquipe (/(patron)/gares) ; « Changer de guichet / gare dès demain · superviseure prévenue » → PatronGare (/(patron)/gares/[gareId]) ; « Demander un nouveau PIN la superviseure l'envoie par SMS » → SuperviseurEquipe (/(superviseur)/equipe) ; « Désactiver le compte immédiat · tracé » → PatronEquipe (/(patron)/gares) ; « En parler à l'assistant que faire avec Joseph ? » → Assistant (/(patron)/assistant)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/PatronPersonne.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

> Note : La maquette affiche une tolérance de ± 500 alors que les réglages disent 1 000 : à trancher.

#### AM-104 · L'assistant du patron

**Épique** E09 Patron · **Type** ecran · **Priorité** P1 · **Estimation** 5 pts · **Échéance** 3 → 12 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-008, AM-016, AM-109  
**Planches** Assistant · **Route** `/(patron)/assistant`  
**Périmètre** `apps/web/src/routes/(patron)/assistant.tsx`, `apps/web/src/ecrans/Assistant/**`

Deux cartes : « Argent qui fuit » (constat, montant, explication, actions Contrôle inopiné / Numéro obligatoire en cadence) et « Argent à gagner » (simulation chiffrée avant / après, action « Décaler le 10:00 à 09:15 dès lundi ») ; questions suggérées ; saisie texte et vocal.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Assistant` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Chaque action ouvre l'écran de réglage prérempli, jamais une modification directe
- [ ] Les données des autres compagnies ne sont utilisées qu'anonymisées et agrégées
- [ ] Navigation identique à la maquette : « Retour » → Patron (/(patron)/aujourdhui) ; « Contrôle inopiné mardi » → Controleur (/(controle)/inopine) ; « Numéro obligatoire en cadence » → Config (/(patron)/reglages) ; « Décaler le 10:00 à 09:15 dès lundi » → Config (/(patron)/reglages) ; « Pourquoi Bafoussam baisse ? » → AssistantReponse (/(patron)/assistant/reponse) ; « Quel bus coûte le plus ? » → AssistantReponse (/(patron)/assistant/reponse) ; « Prévision de samedi » → AssistantReponse (/(patron)/assistant/reponse) ; « Parler » → AssistantReponse (/(patron)/assistant/reponse)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Assistant.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-105 · L'assistant répond à une question

**Épique** E09 Patron · **Type** ecran · **Priorité** P1 · **Estimation** 3 pts · **Échéance** 3 → 12 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-008, AM-016, AM-109  
**Planches** AssistantReponse · **Route** `/(patron)/assistant/reponse`  
**Périmètre** `apps/web/src/routes/(patron)/assistant/reponse.tsx`, `apps/web/src/ecrans/AssistantReponse/**`

Question posée, réponse en 4 s sur 30 jours de chiffres : constat, causes numérotées, actions (Ajouter un départ mardi 17:00, Voir la ligne), sources, question de suivi et simulation comparée.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite AssistantReponse` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Les sources sont toujours citées en bas de la réponse
- [ ] Navigation identique à la maquette : « Retour » → Assistant (/(patron)/assistant) ; « Ajouter un départ mardi 17:00 » → ConfigLigne (/(patron)/reglages/ligne/[ligneId]) ; « Voir la ligne en détail » → AnalysesLigne (/(patron)/analyses/ligne/[ligneId]) ; « Parler » → reste sur l'écran (action sur place)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/AssistantReponse.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-106 · Analyses : semaine, lignes, bus

**Épique** E09 Patron · **Type** ecran · **Priorité** P1 · **Estimation** 5 pts · **Échéance** 3 → 12 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-008, AM-016, AM-109  
**Planches** Analyses · **Route** `/(patron)/analyses`  
**Périmètre** `apps/web/src/routes/(patron)/analyses.tsx`, `apps/web/src/ecrans/Analyses/**`

Période (Semaine, Mois, Trimestre, Année) ; recette par jour en barres avec commentaire ; liste glissable des lignes (remplissage, recette) ; liste glissable des bus (net, alerte) ; Exporter Excel, Demander à l'assistant.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Analyses` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Changer la période recalcule tous les blocs
- [ ] Toucher une ligne ou un bus ouvre son détail
- [ ] Navigation identique à la maquette : « Retour » → Patron (/(patron)/aujourdhui) ; « Douala → Yaoundé 91 % · 14,2 M » → AnalysesLigne (/(patron)/analyses/ligne/[ligneId]) ; « Douala → Bafoussam 78 % · 8,1 M » → AnalysesLigne (/(patron)/analyses/ligne/[ligneId]) ; « Yaoundé → Bafoussam 61 % · 4,0 M » → AnalysesLigne (/(patron)/analyses/ligne/[ligneId]) ; « Douala → Bamenda 83 % · 3,6 M » → AnalysesLigne (/(patron)/analyses/ligne/[ligneId]) ; « Yaoundé → Douala 88 % · 12,9 M » → AnalysesLigne (/(patron)/analyses/ligne/[ligneId]) ; « Bafoussam → Douala 74 % · 6,2 M » → AnalysesLigne (/(patron)/analyses/ligne/[ligneId]) ; « Colis · toutes lignes 2 104 · 2,1 M » → AnalysesLigne (/(patron)/analyses/ligne/[ligneId]) ; « LT 412 AB · Mbarga 9 trajets + 2,8 M 0 incident » → AnalysesBus (/(patron)/analyses/bus/[busId]) ; « LT 118 AB · Fotso 8 trajets + 2,1 M carburant + 12 % » → AnalysesBus (/(patron)/analyses/bus/[busId]) ; « LT 207 AB · Nana 5 trajets + 0,6 M 2 pannes » → AnalysesBus (/(patron)/analyses/bus/[busId]) ; « LT 330 AB · Essomba 8 trajets + 1,9 M 0 incident » → AnalysesBus (/(patron)/analyses/bus/[busId]) ; « LT 095 AB · Tchinda 7 trajets + 1,7 M pneus à changer » → AnalysesBus (/(patron)/analyses/bus/[busId]) ; « LT 261 AB · Abena 6 trajets + 1,2 M 1 retard > 30 min » → AnalysesBus (/(patron)/analyses/bus/[busId]) ; « LT 148 AB · Mballa 4 trajets + 0,4 M visite technique » → AnalysesBus (/(patron)/analyses/bus/[busId]) ; « Exporter Excel » → Comptable (/(patron)/comptable) ; « Demander à l'assistant » → Assistant (/(patron)/assistant)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Analyses.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-107 · Analyse d'une ligne

**Épique** E09 Patron · **Type** ecran · **Priorité** P1 · **Estimation** 3 pts · **Échéance** 3 → 12 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-008, AM-016, AM-109  
**Planches** AnalysesLigne · **Route** `/(patron)/analyses/ligne/[ligneId]`  
**Périmètre** `apps/web/src/routes/(patron)/analyses/ligne/[ligneId].tsx`, `apps/web/src/ecrans/AnalysesLigne/**`

Tuiles recette, billets, remplissage (cible), colis ; remplissage par départ (touche pour modifier) ; par jour de la semaine ; vendus en ligne ; en route ; « Pourquoi ça baisse ? » et « Modifier la ligne ».

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite AnalysesLigne` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Toucher un départ ouvre le réglage de la ligne sur ce départ
- [ ] Navigation identique à la maquette : « Retour aux analyses » → Analyses (/(patron)/analyses) ; « 06:00 classique · 3 500 · LT 118 AB 94 % » → ConfigLigne (/(patron)/reglages/ligne/[ligneId]) ; « 08:15 classique · 3 500 · soute colis 88 % » → ConfigLigne (/(patron)/reglages/ligne/[ligneId]) ; « 10:00 classique · 3 500 · Oméga 09:30 à 3 000 55 % » → ConfigLigne (/(patron)/reglages/ligne/[ligneId]) ; « 13:00 classique · 3 500 76 % » → ConfigLigne (/(patron)/reglages/ligne/[ligneId]) ; « 16:30 VIP · 5 000 · clim 81 % » → ConfigLigne (/(patron)/reglages/ligne/[ligneId]) ; « Pourquoi ça baisse ? » → AssistantReponse (/(patron)/assistant/reponse) ; « Modifier la ligne » → ConfigLigne (/(patron)/reglages/ligne/[ligneId])
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/AnalysesLigne.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-108 · Analyse d'un bus

**Épique** E09 Patron · **Type** ecran · **Priorité** P1 · **Estimation** 3 pts · **Échéance** 3 → 12 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-008, AM-016, AM-109  
**Planches** AnalysesBus · **Route** `/(patron)/analyses/bus/[busId]`  
**Périmètre** `apps/web/src/routes/(patron)/analyses/bus/[busId].tsx`, `apps/web/src/ecrans/AnalysesBus/**`

Pastille À SURVEILLER ; recette, dépenses, net ; net par semaine sur 8 semaines ; trajet par trajet avec incidents ; avis de l'assistant ; « Toute la flotte » et « Demander à l'assistant ».

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite AnalysesBus` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Les dépenses viennent des justificatifs du chauffeur (AM-083)
- [ ] Navigation identique à la maquette : « Retour » → Analyses (/(patron)/analyses) ; « Toute la flotte » → Analyses (/(patron)/analyses) ; « Demander à l'assistant révision lundi · qui remplace ? » → Assistant (/(patron)/assistant)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/AnalysesBus.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-109 · Analyses et moteur de l'assistant du patron

**Épique** E09 Patron · **Type** backend · **Priorité** P1 · **Estimation** 8 pts · **Échéance** 3 → 12 nov.  
**Dépend de** AM-017, AM-016, AM-162, AM-164  
**Planches** Assistant, AssistantReponse, Analyses, AnalysesLigne, AnalysesBus, PatronPersonne · **Route** `/(patron)/assistant, /(patron)/assistant/reponse, /(patron)/analyses, /(patron)/analyses/ligne/[ligneId], /(patron)/analyses/bus/[busId], /(patron)/personnes/[personneId]`  
**Périmètre** `apps/api/src/analyses/**`, `apps/api/src/assistant/**`

Agrégats (recette, remplissage, par ligne, bus, jour, heure, période), règles de détection (écarts répétés d'un agent, pannes répétées, concurrent moins cher sur un créneau, creux d'un jour, billets de cadence sans nom), simulation d'horaire et de prix, réponses en langage naturel sur les chiffres de l'agence via l'API Claude, avec sources citées.

Critères d'acceptation :
- [ ] Chaque constat cite ses données sources
- [ ] Les données des autres compagnies ne sortent qu'agrégées et anonymes
- [ ] Réponse en moins de 5 s sur 30 jours de données

Tâches :
- Modèle de données et migrations
- Services et règles métier
- Routes conformes aux contrats
- Tests unitaires et d'intégration
- Brancher les écrans concernés sur l'adaptateur HTTP et vérifier

#### AM-110 · Comptable : exports et rapprochement

**Épique** E10 Comptable · **Type** ecran · **Priorité** P1 · **Estimation** 5 pts · **Échéance** 3 → 12 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-008, AM-016, AM-114  
**Planches** Comptable · **Route** `/(patron)/comptable`  
**Périmètre** `apps/web/src/routes/(patron)/comptable.tsx`, `apps/web/src/ecrans/Comptable/**`

Mois ; rapprochement MoMo (ventes enregistrées, reçu sur le compte marchand, sans correspondance) ; 5 exports à colonnes fixes avec Aperçu (journal des ventes, journal de caisse, annulations, écritures SYSCOHADA, factures AfriMove) ; envoi automatique au cabinet le 2 ; « Clôturer décembre · tout envoyer ».

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Comptable` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Le pourcentage rapproché est calculé sur les références opérateur
- [ ] Navigation identique à la maquette : « Retour » → Patron (/(patron)/aujourdhui) ; « Voir les 4 lignes · références opérateur » → ComptableRapprochement (/(patron)/comptable/rapprochement) ; « Journal des ventes une ligne par billet et par colis · 31 404 lignes Aperçu ⤓ » → ComptableApercu (/(patron)/comptable/apercu/[exportId]) ; « Journal de caisse une ligne par session · écarts · validations PIN Aperçu ⤓ » → ComptableApercu (/(patron)/comptable/apercu/[exportId]) ; « Annulations et remboursements motif · qui a validé · 142 lignes Aperçu ⤓ » → ComptableApercu (/(patron)/comptable/apercu/[exportId]) ; « Écritures SYSCOHADA ventes, caisse, banque, TVA · prêt pour le cabinet Aperçu ⤓ » → ComptableApercu (/(patron)/comptable/apercu/[exportId]) ; « Factures AfriMove 4 factures hebdo · 75 F / billet · 150 F / colis · payées Aperçu à jour » → ComptableApercu (/(patron)/comptable/apercu/[exportId]) ; « Clôturer décembre · tout envoyer » → ComptableCloture (/(patron)/comptable/cloture)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Comptable.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-111 · Transactions MoMo sans correspondance

**Épique** E10 Comptable · **Type** ecran · **Priorité** P1 · **Estimation** 5 pts · **Échéance** 3 → 12 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-008, AM-016, AM-114  
**Planches** ComptableRapprochement · **Route** `/(patron)/comptable/rapprochement`  
**Périmètre** `apps/web/src/routes/(patron)/comptable/rapprochement.tsx`, `apps/web/src/ecrans/ComptableRapprochement/**`

Pour chaque transaction : référence opérateur, date, numéro masqué, montant, cause probable proposée par l'app et action (Rembourser, Rattacher, Demander) ; total à traiter ; explication des actions ; « Appliquer les 4 · mon PIN ».

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite ComptableRapprochement` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Rien n'est clôturé tant qu'une ligne reste ouverte
- [ ] Chaque décision est tracée 7 ans et transmise au cabinet
- [ ] Navigation identique à la maquette : « Retour » → Comptable (/(patron)/comptable) ; « Rembourser » → ComptableCloture (/(patron)/comptable/cloture) ; « Rattacher » → ComptableCloture (/(patron)/comptable/cloture) ; « Demander » → ComptableCloture (/(patron)/comptable/cloture) ; « Plus tard » → Comptable (/(patron)/comptable) ; « Appliquer les 4 · mon PIN 2 remboursements · 1 rattachement · 1 réclamation » → ComptableCloture (/(patron)/comptable/cloture)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/ComptableRapprochement.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-112 · Aperçu d'un export (pop-up)

**Épique** E10 Comptable · **Type** ecran · **Priorité** P1 · **Estimation** 3 pts · **Échéance** 3 → 12 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-008, AM-016, AM-114  
**Planches** ComptableApercu · **Route** `/(patron)/comptable/apercu/[exportId]`  
**Périmètre** `apps/web/src/routes/(patron)/comptable/apercu/[exportId].tsx`, `apps/web/src/ecrans/ComptableApercu/**`

Pop-up par-dessus l'écran comptable : nom, nombre de lignes et colonnes, taille ; onglets Ventes · Par jour · Par guichet · Totaux ; tableau des 10 premières lignes glissable ; total ; rappels (colonnes fixes, un onglet par vue, empreinte signée) ; Fermer, Télécharger, Envoyer au cabinet.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite ComptableApercu` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Le fichier téléchargé est exactement celui prévisualisé
- [ ] Navigation identique à la maquette : « Fermer » → Comptable (/(patron)/comptable) ; « Télécharger » → Comptable (/(patron)/comptable) ; « Envoyer au cabinet » → ComptableCloture (/(patron)/comptable/cloture)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/ComptableApercu.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-113 · Mois clôturé et envoyé au cabinet

**Épique** E10 Comptable · **Type** ecran · **Priorité** P1 · **Estimation** 3 pts · **Échéance** 3 → 12 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-008, AM-016, AM-114  
**Planches** ComptableCloture · **Route** `/(patron)/comptable/cloture`  
**Périmètre** `apps/web/src/routes/(patron)/comptable/cloture.tsx`, `apps/web/src/ecrans/ComptableCloture/**`

Confirmation de clôture signée par PIN, total encaissé (cash, MoMo, écart), mois verrouillé, liste des fichiers envoyés au cabinet avec taille et format, aperçu des 3 premières lignes du CSV.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite ComptableCloture` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Un mois clôturé n'accepte plus aucune modification, seulement des écritures du mois suivant
- [ ] Navigation identique à la maquette : « Retour » → Comptable (/(patron)/comptable) ; « Revoir les exports » → Comptable (/(patron)/comptable) ; « Retour au tableau de bord » → Patron (/(patron)/aujourdhui)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/ComptableCloture.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

> Note : La maquette mentionne « abonnement + … » dans les factures alors que le modèle est sans abonnement : à retirer.

#### AM-114 · Backend exports comptables et rapprochement MoMo

**Épique** E10 Comptable · **Type** backend · **Priorité** P1 · **Estimation** 8 pts · **Échéance** 3 → 12 nov.  
**Dépend de** AM-017, AM-016, AM-164, AM-165  
**Planches** Comptable, ComptableRapprochement, ComptableApercu, ComptableCloture · **Route** `/(patron)/comptable, /(patron)/comptable/rapprochement, /(patron)/comptable/apercu/[exportId], /(patron)/comptable/cloture`  
**Périmètre** `apps/api/src/comptable/**`

Exports à colonnes fixes (XLSX, CSV, PDF) : journal des ventes, journal de caisse, annulations et remboursements, écritures SYSCOHADA (706, 571, 462, 622), factures AfriMove hebdomadaires (75 F / billet, 150 F / colis) ; empreinte signée dans le fichier ; envoi automatique au cabinet le 2 du mois ; rapprochement avec les relevés opérateurs, causes probables, actions rembourser / rattacher / réclamer ; verrouillage du mois.

Critères d'acceptation :
- [ ] Mêmes colonnes chaque mois
- [ ] Un mois verrouillé refuse toute écriture
- [ ] Le total des exports égale le total encaissé au franc près

Tâches :
- Modèle de données et migrations
- Services et règles métier
- Routes conformes aux contrats
- Tests unitaires et d'intégration
- Brancher les écrans concernés sur l'adaptateur HTTP et vérifier

#### AM-122 · Liste de l'équipe (pop-up, filtre par rôle)

**Épique** E11 Réglages et modules · **Type** ecran · **Priorité** P1 · **Estimation** 3 pts · **Échéance** 3 → 12 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-006, AM-016  
**Planches** ConfigEquipeListe · **Route** `/(patron)/reglages/equipe`  
**Périmètre** `apps/web/src/routes/(patron)/reglages/equipe.tsx`, `apps/web/src/ecrans/ConfigEquipeListe/**`

Pop-up sur les réglages : filtres par rôle, recherche, liste glissable des personnes avec état, total, Fermer et « Ajouter une personne ».

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite ConfigEquipeListe` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Le filtre et la recherche se combinent
- [ ] Navigation identique à la maquette : « Retour » → Config (/(patron)/reglages) ; « Fermer » → Config (/(patron)/reglages) ; « 9 guichetiers » → reste sur l'écran (action sur place) ; « 3 superviseurs » → reste sur l'écran (action sur place) ; « 7 convoyeurs » → reste sur l'écran (action sur place) ; « 4 chauffeurs » → reste sur l'écran (action sur place) ; « JM Joseph M. · Akwa · guichet 2 PIN à renouveler · 3 écarts modifier » → ConfigPersonne (/(patron)/reglages/personne/[personneId]) ; « MT Marie T. · Akwa · guichet 1 1 204 billets · 0 écart modifier » → ConfigPersonne (/(patron)/reglages/personne/[personneId]) ; « PN Pauline N. · Akwa · guichet 3 bloquée · 3 PIN faux modifier » → ConfigPersonne (/(patron)/reglages/personne/[personneId]) ; « DT D. Tchinda · Mvan · guichet 1 612 billets · 0 écart modifier » → ConfigPersonne (/(patron)/reglages/personne/[personneId]) ; « SA S. Atangana · Mvan · guichet 2 388 billets · 1 écart modifier » → ConfigPersonne (/(patron)/reglages/personne/[personneId]) ; « TK T. Kamga · Bafoussam · guichet 1 hors ligne 40 min modifier » → ConfigPersonne (/(patron)/reglages/personne/[personneId]) ; « BN B. Ngo · Akwa · nuit 210 billets · 0 écart modifier » → ConfigPersonne (/(patron)/reglages/personne/[personneId]) ; « CE C. Ebolo · Mvan · nuit 96 billets · 0 écart modifier » → ConfigPersonne (/(patron)/reglages/personne/[personneId]) ; « LF L. Fouda · remplaçant 3 jours ce mois modifier » → ConfigPersonne (/(patron)/reglages/personne/[personneId]) ; « Ajouter une personne » → ConfigPersonne (/(patron)/reglages/personne/[personneId])
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/ConfigEquipeListe.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-150 · Salle de contrôle (route /controle, 1280 px)

**Épique** E14 Salle de contrôle web · **Type** ecran · **Priorité** P1 · **Estimation** 8 pts · **Échéance** 3 → 12 nov.  
**Dépend de** AM-004, AM-009, AM-008, AM-016  
**Planches** Controle · **Route** `/controle`  
**Périmètre** `apps/web/src/routes/controle.tsx`, `apps/web/src/ecrans/Controle/**`

Route /controle de l'application web, mise en page 1280 px fluide jusqu'au téléphone : onglets Direct · Analyses · Comptable · Réglages · Modules ; pastille EN DIRECT ; 5 KPI (recette, billets, colis, remplissage, écarts) ; bus en route (position GPS 30 s) ; tableau des gares (billets, colis, cash attendu, écart, prochain départ, superviseur) ; « À traiter » ; ventes par heure avec prévision ; encadré rapport du soir.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Controle` à 1280×900 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Rendu au banc à 1280 × 900, et sans défilement horizontal à 390 px
- [ ] Toutes les valeurs se mettent à jour en direct
- [ ] Navigation identique à la maquette : « Direct » → reste sur l'écran (action sur place) ; « Analyses » → Analyses (/(patron)/analyses) ; « Comptable » → Comptable (/(patron)/comptable) ; « Réglages » → Config (/(patron)/reglages) ; « Modules » → Modules (/(patron)/reglages/modules) ; « Douala Akwa » → Superviseur (/(superviseur)/gare) ; « Yaoundé Mvan » → Superviseur (/(superviseur)/gare) ; « Bafoussam » → Superviseur (/(superviseur)/gare) ; « Clôture guichet 2 Akwa · écart − 1 000 · attend le PIN d'Essono 14:00 » → Superviseur (/(superviseur)/gare) ; « LT 207 AB arrêté 12 min après Edéa · 36 à bord · chauffeur Nana injoignable 13:53 » → Chauffeur (/(bus)/chauffeur) ; « 6 colis Oméga en correspondance à Bafoussam · scan « reçu » manquant 13:40 » → InterAgences (/(patron)/inter-agences) ; « L'assistant propose de décaler le 10:00 à 09:15 · + 1,5 M / mois 12:10 » → Assistant (/(patron)/assistant) ; « Voir le rapport d'hier » → RapportSoir (/(patron)/rapport)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Controle.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

### Vague 4 · Covoit, partenaires, financement, USSD (3 → 13 nov.)

#### AM-032 · Accueil mode « dans la même ville »

**Épique** E02 Voyageur · acheter un billet · **Type** ecran · **Priorité** P2 · **Estimation** 5 pts · **Échéance** 3 → 13 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-006, AM-007, AM-013, AM-030  
**Planches** MainVille · **Route** `/(voyageur)/voyager/ville`  
**Périmètre** `apps/web/src/routes/(voyageur)/voyager/ville.tsx`, `apps/web/src/ecrans/MainVille/**`

Variante de l'accueil quand « Dans la même ville » est choisi : ville détectée par la position (Douala) avec « Changer de ville », champs Départ (ma position) et Arrivée avec inverser, moments Maintenant · Dans 1 h · Chaque matin 07:00, filtres Tout · Moto · Covoit · Bus, résultats mélangés (covoiturage dans 3 min, moto-taxi, bus de ville Socatur, covoiturage régulier), cartes « Colis en ville » et « Je conduis ».

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite MainVille` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] La ville est détectée par la position, avec repli sur la dernière ville choisie si la permission est refusée
- [ ] « Chaque matin 07:00 » enregistre un trajet régulier proposé à 06:40 les jours ouvrés
- [ ] Toucher un résultat ouvre l'écran Paiement correspondant
- [ ] Navigation identique à la maquette : « Entre villes » → Main (/(voyageur)/voyager) ; « 3 min Covoiturage Clarisse · vérifiée Hyundai · 3 places · passe par Bonanjo · 25 min 700 » → Paiement (/(voyageur)/paiement/[commandeId]) ; « 5 min Moto-taxi Paul · casque fourni vient te chercher · 18 min de trajet 500 » → Paiement (/(voyageur)/paiement/[commandeId]) ; « 07:50 Bus de ville ligne 3 · Socatur arrêt Marché central · 40 min · 12 places 250 » → Paiement (/(voyageur)/paiement/[commandeId]) ; « 08:00 Covoiturage Jean-Marc · régulier chaque matin · Toyota · 2 places · 4,8 ★ 600 » → Paiement (/(voyageur)/paiement/[commandeId]) ; « Colis en ville moto · dès 1 000 F » → ColisEnvoi (/(voyageur)/colis) ; « Je conduis proposer mon trajet » → CovoitConducteur (/(voyageur)/covoit/conducteur) ; « Voyager » → Main (/(voyageur)/voyager) ; « Colis » → ColisEnvoi (/(voyageur)/colis) ; « Covoit » → Covoit (/(voyageur)/covoit) ; « Moi » → Moi (/(voyageur)/moi)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/MainVille.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-041 · Monter en route : bus qui passent avec des places

**Épique** E03 Voyageur · en route et services · **Type** ecran · **Priorité** P2 · **Estimation** 5 pts · **Échéance** 3 → 13 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-007, AM-013, AM-170  
**Planches** Arret · **Route** `/(voyageur)/monter-en-route`  
**Périmètre** `apps/web/src/routes/(voyageur)/monter-en-route.tsx`, `apps/web/src/ecrans/Arret/**`

« Tu es à Pouma » : frise de la ligne avec ta position, point de montée précis, liste des bus qui passent (heure, dans combien de temps, compagnie, places, arrivée, prix au prorata).

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Arret` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Le prix au prorata vient du réglage de la ligne (arrêts) de la compagnie
- [ ] Payer bloque la place ; le bus sait qu'il doit s'arrêter (apparaît dans « En route » au quai et chez le convoyeur)
- [ ] Navigation identique à la maquette : « Retour » → Main (/(voyageur)/voyager) ; « 10:05 dans 14 min Bêta Express VIP · 3 places parti de Douala 08:04 · arrive Yaoundé 11:35 » → SiegePay (/(voyageur)/depart/[departId]) ; « 10:40 dans 49 min Alpha Voyages · 7 places classique · arrive Yaoundé 12:20 2 500 prorata » → SiegePay (/(voyageur)/depart/[departId]) ; « 11:10 dans 1 h 19 Oméga Transports · 1 place classique · arrive Yaoundé 12:50 2 400 prorat » → SiegePay (/(voyageur)/depart/[departId]) ; « Voyager » → Main (/(voyageur)/voyager) ; « Colis » → ColisEnvoi (/(voyageur)/colis) ; « Covoit » → Covoit (/(voyageur)/covoit) ; « Moi » → Moi (/(voyageur)/moi)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Arret.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-042 · Moto ou taxi vers la gare

**Épique** E03 Voyageur · en route et services · **Type** ecran · **Priorité** P2 · **Estimation** 5 pts · **Échéance** 3 → 13 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-007, AM-013, AM-148  
**Planches** Course · **Route** `/(voyageur)/course`  
**Périmètre** `apps/web/src/routes/(voyageur)/course.tsx`, `apps/web/src/ecrans/Course/**`

Calcul de l'heure de départ pour être au quai 20 min avant, choix Moto · Taxi · Avec 2 valises, conducteur proposé (vérifié, ★, casque), récapitulatif (heure de prise en charge, arrivée au quai, prix payé avec le billet), bouton « Réserver la moto pour 07:10 », rappel et annulation gratuite.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Course` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] L'heure de départ tient compte du trajet estimé et du départ du bus
- [ ] Un seul paiement avec le billet quand la course est réservée depuis le billet
- [ ] Navigation identique à la maquette : « Retour au billet » → Pass (/(voyageur)/billet/[billetId]) ; « Réserver la moto pour 07:10 » → Pass (/(voyageur)/billet/[billetId])
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Course.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-043 · Voyager en groupe, bus entier, cagnotte

**Épique** E03 Voyageur · en route et services · **Type** ecran · **Priorité** P2 · **Estimation** 5 pts · **Échéance** 3 → 13 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-006, AM-007, AM-013  
**Planches** Groupe · **Route** `/(voyageur)/groupe`  
**Périmètre** `apps/web/src/routes/(voyageur)/groupe.tsx`, `apps/web/src/ecrans/Groupe/**`

Trois modes (Groupe 2 à 12, Bus entier, Cagnotte), départ choisi, stepper du nombre de voyageurs, sièges côte à côte réservés ensemble 15 min, « Qui paie quoi » avec statut par personne, partage WhatsApp, devis pour louer un bus de 30, bouton « Payer ma part · ou tout payer ».

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Groupe` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Les sièges sont bloqués ensemble 15 min ; chaque billet part au numéro de chaque voyageur
- [ ] Le lien de cagnotte permet à chacun de payer sa part depuis son téléphone
- [ ] Navigation identique à la maquette : « Retour » → Main (/(voyageur)/voyager) ; « Payer ma part · 3 500 F ou tout payer pour le groupe : 21 000 F » → Paiement (/(voyageur)/paiement/[commandeId])
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Groupe.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-045 · Sans internet : explication USSD *123# et WhatsApp

**Épique** E03 Voyageur · en route et services · **Type** ecran · **Priorité** P2 · **Estimation** 2 pts · **Échéance** 3 → 13 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-008, AM-013  
**Planches** USSD · **Route** `/(voyageur)/sans-internet`  
**Périmètre** `apps/web/src/routes/(voyageur)/sans-internet.tsx`, `apps/web/src/ecrans/USSD/**`

Écran d'explication dans l'app : téléphone simulé avec le menu USSD *123# (3 réponses = un billet), conversation WhatsApp exemple (« billet » → choix → paiement → billet), mention du vocal accepté, liens « Voir le billet reçu » et « Acheter pour quelqu'un ».

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite USSD` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Les menus affichés sont ceux réellement servis par AM-169 et AM-168 (même texte)
- [ ] Navigation identique à la maquette : « Retour » → Main (/(voyageur)/voyager) ; « Voir le billet reçu » → Pass (/(voyageur)/billet/[billetId]) ; « Acheter pour quelqu'un » → Proche (/(voyageur)/proche)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/USSD.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

> Note : Les canaux USSD et WhatsApp eux-mêmes sont dans les tickets AM-168 et AM-169.

#### AM-050 · Covoiturage entre villes, passager

**Épique** E04 Covoiturage · **Type** ecran · **Priorité** P2 · **Estimation** 5 pts · **Échéance** 3 → 13 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-007, AM-013, AM-054  
**Planches** Covoit · **Route** `/(voyageur)/covoit`  
**Périmètre** `apps/web/src/routes/(voyageur)/covoit.tsx`, `apps/web/src/ecrans/Covoit/**`

Deux sélecteurs : Entre villes / En ville (glisse pour changer), puis Je suis passager / Je conduis ; trajet Douala → Kribi avec inverser ; filtres Tous · Clim · Femmes · Grand bagage · ≤ 4 000 ; carte détaillée du premier conducteur (vérifié, ★, voiture, plaque, places, départ et arrivée précis) et cartes compactes des suivants ; mentions de confiance.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Covoit` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Le bouton « Proposer mon trajet » n'existe pas en mode passager
- [ ] Toucher un conducteur ouvre Paiement (touche 2)
- [ ] Navigation identique à la maquette : « En ville · Douala » → CovoitVille (/(voyageur)/covoit/ville) ; « Je conduis » → CovoitConducteur (/(voyageur)/covoit/conducteur) ; « SA Samuel E. · vérifié · 4,9 ★ · 112 trajets Toyota Corolla grise · LT 882 CE · clim · 2 p » → Paiement (/(voyageur)/paiement/[commandeId]) ; « MN Marthe N. · vérifiée · 4,7 ★ 10:00 · Akwa · Hyundai · 3 places · femmes bienvenues 3 50 » → Paiement (/(voyageur)/paiement/[commandeId]) ; « DK Didier K. · vérifié · 4,6 ★ 14:00 · Bonamoussadi · pick-up · 4 places · grand bagage OK » → Paiement (/(voyageur)/paiement/[commandeId]) ; « Voyager » → Main (/(voyageur)/voyager) ; « Colis » → ColisEnvoi (/(voyageur)/colis) ; « Covoit » → reste sur l'écran (action sur place) ; « Moi » → Moi (/(voyageur)/moi)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Covoit.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-051 · Covoiturage en ville, passager

**Épique** E04 Covoiturage · **Type** ecran · **Priorité** P2 · **Estimation** 3 pts · **Échéance** 3 → 13 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-007, AM-013, AM-054  
**Planches** CovoitVille · **Route** `/(voyageur)/covoit/ville`  
**Périmètre** `apps/web/src/routes/(voyageur)/covoit/ville.tsx`, `apps/web/src/ecrans/CovoitVille/**`

Mode « En ville · Douala » : ville détectée, départ (ma position) et arrivée, liste « Partent maintenant », carte « Mon trajet du matin » (proposition à 06:40 chaque jour ouvré), mentions prix fixés et position partagée.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite CovoitVille` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Prix fixés à l'avance, jamais négociés
- [ ] La position est partagée avec un proche pendant le trajet si l'utilisateur l'active
- [ ] Navigation identique à la maquette : « Entre villes » → Covoit (/(voyageur)/covoit) ; « Je conduis » → CovoitConducteur (/(voyageur)/covoit/conducteur) ; « CL Clarisse · dans 3 min · vérifiée · 4,9 ★ Hyundai · 3 places · passe par Bonanjo · 25 mi » → Paiement (/(voyageur)/paiement/[commandeId]) ; « JM Jean-Marc · 08:00 · régulier · 4,8 ★ chaque matin · Toyota · 2 places · dépose au pont » → Paiement (/(voyageur)/paiement/[commandeId]) ; « PA Paul · moto-taxi · 5 min · casque fourni vient te chercher · 18 min · bagage à main seu » → Paiement (/(voyageur)/paiement/[commandeId]) ; « Voyager » → Main (/(voyageur)/voyager) ; « Colis » → ColisEnvoi (/(voyageur)/colis) ; « Covoit » → Covoit (/(voyageur)/covoit) ; « Moi » → Moi (/(voyageur)/moi)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/CovoitVille.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-052 · Covoiturage : je conduis (mes trajets, demandes, gains)

**Épique** E04 Covoiturage · **Type** ecran · **Priorité** P2 · **Estimation** 5 pts · **Échéance** 3 → 13 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-007, AM-013, AM-054  
**Planches** CovoitConducteur · **Route** `/(voyageur)/covoit/conducteur`  
**Périmètre** `apps/web/src/routes/(voyageur)/covoit/conducteur.tsx`, `apps/web/src/ecrans/CovoitConducteur/**`

Mode conducteur : chiffres (semaine reçue par MoMo, trajets, pièces OK), mes trajets publiés avec réservations et bouton Gérer, passagers qui cherchent une voiture sur mes trajets avec « Proposer 08:30 », mention de paiement, bouton principal « Proposer mon trajet ».

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite CovoitConducteur` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] « Proposer mon trajet » n'apparaît qu'en mode conducteur
- [ ] Un utilisateur non vérifié voit le parcours de vérification avant de publier
- [ ] Navigation identique à la maquette : « En ville · Douala » → CovoitVille (/(voyageur)/covoit/ville) ; « Je suis passager » → Covoit (/(voyageur)/covoit) ; « Proposer mon trajet touche 1 · trajet, places, prix · publié en 10 s » → Conducteur (/(voyageur)/covoit/proposer)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/CovoitConducteur.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-053 · Proposer mon trajet (publication)

**Épique** E04 Covoiturage · **Type** ecran · **Priorité** P2 · **Estimation** 3 pts · **Échéance** 3 → 13 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-006, AM-013, AM-054  
**Planches** Conducteur · **Route** `/(voyageur)/covoit/proposer`  
**Périmètre** `apps/web/src/routes/(voyageur)/covoit/proposer.tsx`, `apps/web/src/ecrans/Conducteur/**`

Formulaire : trajet et date, point de départ, arrivée, places 1 · 2 · 3, prix par place avec prix conseillé (partage de frais), options Clim · Bagage moyen · Femmes seulement · Trajet régulier, rappel de vérification, bouton « Publier le trajet » avec le total.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Conducteur` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Le prix est limité à la fourchette conseillée (partage de frais, pas de bénéfice)
- [ ] Le trajet est visible dans l'app voyageur en 10 s
- [ ] Navigation identique à la maquette : « Retour » → Covoit (/(voyageur)/covoit) ; « Publier le trajet touche 2 · visible dans l'app voyageur en 10 s 2 × 4 000 » → Covoit (/(voyageur)/covoit)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Conducteur.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-054 · Backend covoiturage

**Épique** E04 Covoiturage · **Type** backend · **Priorité** P2 · **Estimation** 8 pts · **Échéance** 3 → 13 nov.  
**Dépend de** AM-017, AM-013, AM-165  
**Planches** Covoit, CovoitVille, CovoitConducteur, Conducteur · **Route** `/(voyageur)/covoit, /(voyageur)/covoit/ville, /(voyageur)/covoit/conducteur, /(voyageur)/covoit/proposer`  
**Périmètre** `apps/api/src/covoiturage/**`

Trajets entre villes et en ville, trajets réguliers, réservations, demandes de passagers, vérification des conducteurs (pièce, permis, carte grise, voiture), notes, paiement libéré au conducteur à l'arrivée (confirmation du passager ou 2 h après l'heure prévue), 250 F de frais par place, annulation et remboursement.

Critères d'acceptation :
- [ ] Un conducteur non vérifié ne peut pas publier
- [ ] Le paiement n'est libéré qu'à l'arrivée
- [ ] Les 4 écrans covoiturage fonctionnent avec l'adaptateur HTTP

Tâches :
- Modèle de données et migrations
- Services et règles métier
- Routes conformes aux contrats
- Tests unitaires et d'intégration
- Brancher les écrans concernés sur l'adaptateur HTTP et vérifier

#### AM-062 · Points relais près du destinataire

**Épique** E05 Colis côté voyageur · **Type** ecran · **Priorité** P2 · **Estimation** 3 pts · **Échéance** 3 → 13 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-014, AM-148  
**Planches** Relais · **Route** `/(voyageur)/colis/[colisId]/relais`  
**Périmètre** `apps/web/src/routes/(voyageur)/colis/[colisId]/relais.tsx`, `apps/web/src/ecrans/Relais/**`

Liste des 3 relais les plus proches (nom, ouvert / ferme bientôt, distance, horaires, note, particularités), carte « Ta boutique ici ? Deviens point de relais », bouton « Choisir Mama Fotso · prévenir Maman ».

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Relais` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Le relais choisi est enregistré sur le colis et le destinataire est prévenu par SMS
- [ ] Navigation identique à la maquette : « Retour » → ColisCode (/(voyageur)/colis/[colisId]) ; « 1 Boutique Mama Fotso · ouvert 350 m de chez Maman · 7 h–20 h · lun.–sam. · 4,9 ★ · 212 co » → ColisCode (/(voyageur)/colis/[colisId]) ; « 2 Pharmacie du Marché · ouvert 900 m · 7 h 30–22 h · 7 j/7 · 4,8 ★ · frigo pour médicament » → ColisCode (/(voyageur)/colis/[colisId]) ; « 3 Call-box Tonton Paul · ferme à 19 h 1,2 km · 6 h–19 h · 4,6 ★ · petit colis seulement +3 » → ColisCode (/(voyageur)/colis/[colisId]) ; « Ta boutique ici ? Deviens point de relais · 200 F par colis Le relais scanne à la réceptio » → RelaisDevenir (/(voyageur)/moi/devenir-relais) ; « Choisir Mama Fotso · prévenir Maman 300 F » → ColisCode (/(voyageur)/colis/[colisId])
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Relais.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-063 · Livraison moto en cours

**Épique** E05 Colis côté voyageur · **Type** ecran · **Priorité** P2 · **Estimation** 3 pts · **Échéance** 3 → 13 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-007, AM-014, AM-148, AM-170  
**Planches** Livraison · **Route** `/(voyageur)/colis/[colisId]/livraison`  
**Périmètre** `apps/web/src/routes/(voyageur)/colis/[colisId]/livraison.tsx`, `apps/web/src/ecrans/Livraison/**`

Pastille EN LIVRAISON, heure d'arrivée, livreur (vérifié, n° de gilet, appeler), règle de remise (code + pièce, photo du colis), partager le suivi, changer l'adresse, carte devenir livreur, récapitulatif du prix.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Livraison` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Position du livreur en direct
- [ ] Absent : 10 min d'attente puis dépôt au relais le plus proche, avec notification
- [ ] Navigation identique à la maquette : « Retour » → ColisCode (/(voyageur)/colis/[colisId]) ; « Tu as une moto ? Deviens livreur AfriMove 700 F la course · tu choisis tes heures et ta zo » → LivreurDevenir (/(voyageur)/moi/devenir-livreur)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Livraison.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-130 · Financement : avance, crédit matériel, paie

**Épique** E12 Financement et inter-agences · **Type** ecran · **Priorité** P2 · **Estimation** 3 pts · **Échéance** 3 → 13 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-006, AM-016, AM-134  
**Planches** Financement · **Route** `/(patron)/financement`  
**Périmètre** `apps/web/src/routes/(patron)/financement.tsx`, `apps/web/src/ecrans/Financement/**`

Avance sur recettes (éligible, plafond, montant, remboursement par % des ventes MoMo, durée, coût [x %]) ; crédit matériel ; paie des équipages ; paiement en 2 fois pour les voyageurs ; « Demander 6 M » ; mention module masqué.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Financement` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Le nom du partenaire et le coût restent des emplacements [entre crochets] tant que la convention n'est pas signée
- [ ] Navigation identique à la maquette : « Retour » → Patron (/(patron)/aujourdhui) ; « Demander 6 M · dossier envoyé en 1 touche » → FinancementDemande (/(patron)/financement/demande/[dossierId])
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Financement.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-131 · Dossier de financement envoyé : suivi

**Épique** E12 Financement et inter-agences · **Type** ecran · **Priorité** P2 · **Estimation** 3 pts · **Échéance** 3 → 13 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-007, AM-016, AM-134  
**Planches** FinancementDemande · **Route** `/(patron)/financement/demande/[dossierId]`  
**Périmètre** `apps/web/src/routes/(patron)/financement/demande/[dossierId].tsx`, `apps/web/src/ecrans/FinancementDemande/**`

Pastille EN COURS ; montant et conditions ; pièces jointes automatiques ; frise de suivi (envoyé, analyse, versement) ; mention « AfriMove ne prête pas » ; Retirer la demande.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite FinancementDemande` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] La demande peut être retirée tant qu'elle n'est pas versée
- [ ] Navigation identique à la maquette : « Retour » → Financement (/(patron)/financement) ; « Retirer la demande » → Financement (/(patron)/financement) ; « Retour au tableau de bord je te préviens dès la réponse » → Patron (/(patron)/aujourdhui)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/FinancementDemande.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-132 · Colis entre compagnies, correspondance

**Épique** E12 Financement et inter-agences · **Type** ecran · **Priorité** P2 · **Estimation** 5 pts · **Échéance** 3 → 13 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-008, AM-016, AM-135  
**Planches** InterAgences · **Route** `/(patron)/inter-agences`  
**Périmètre** `apps/web/src/routes/(patron)/inter-agences.tsx`, `apps/web/src/ecrans/InterAgences/**`

Exemple de colis en deux tronçons (compagnie, départ, bus, part de chacun) ; explication du scan de transfert ; règlement de la semaine (dû, à devoir, solde net lundi) ; billets voyageurs en correspondance ; Convention, Ajouter une compagnie.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite InterAgences` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] La responsabilité passe au scan « remis » / « reçu »
- [ ] Navigation identique à la maquette : « Retour » → Patron (/(patron)/aujourdhui) ; « Convention Oméga · voir » → InterAgencesConvention (/(patron)/inter-agences/convention/[conventionId]) ; « Ajouter une compagnie » → Reseau (/(voyageur)/reseau)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/InterAgences.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-133 · Convention entre deux compagnies

**Épique** E12 Financement et inter-agences · **Type** ecran · **Priorité** P2 · **Estimation** 3 pts · **Échéance** 3 → 13 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-008, AM-016, AM-135  
**Planches** InterAgencesConvention · **Route** `/(patron)/inter-agences/convention/[conventionId]`  
**Périmètre** `apps/web/src/routes/(patron)/inter-agences/convention/[conventionId].tsx`, `apps/web/src/ecrans/InterAgencesConvention/**`

Pastille ACTIVE ; tableau des tronçons et parts ; les 5 règles ; signatures PIN des deux patrons ; chiffres du trimestre ; historique des règlements.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite InterAgencesConvention` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Chaque compagnie voit le colis, jamais les ventes de l'autre
- [ ] Navigation identique à la maquette : « Retour » → InterAgences (/(patron)/inter-agences) ; « Historique · règlements » → Comptable (/(patron)/comptable) ; « Retour · entre compagnies » → InterAgences (/(patron)/inter-agences)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/InterAgencesConvention.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-134 · Backend financement, crédit et paie

**Épique** E12 Financement et inter-agences · **Type** backend · **Priorité** P2 · **Estimation** 8 pts · **Échéance** 3 → 13 nov.  
**Dépend de** AM-017, AM-016, AM-165  
**Planches** Financement, FinancementDemande, PatronEquipe · **Route** `/(patron)/financement, /(patron)/financement/demande/[dossierId], /(patron)/gares`  
**Périmètre** `apps/api/src/financement/**`

Dossier automatique (90 jours de ventes certifiées, relevés MoMo rapprochés, pièces de l'agence, mandat de prélèvement), envoi au partenaire financier, suivi, prélèvement d'un pourcentage des ventes MoMo, crédit matériel, paie des équipages par MoMo, paiement en 2 fois pour les voyageurs (option par agence).

Critères d'acceptation :
- [ ] AfriMove ne détient jamais les fonds : versements et prélèvements passent par l'établissement partenaire
- [ ] La demande est retirable tant qu'elle n'est pas versée

Tâches :
- Modèle de données et migrations
- Services et règles métier
- Routes conformes aux contrats
- Tests unitaires et d'intégration
- Brancher les écrans concernés sur l'adaptateur HTTP et vérifier

#### AM-135 · Backend inter-agences

**Épique** E12 Financement et inter-agences · **Type** backend · **Priorité** P2 · **Estimation** 8 pts · **Échéance** 3 → 13 nov.  
**Dépend de** AM-017, AM-014, AM-163  
**Planches** InterAgences, InterAgencesConvention · **Route** `/(patron)/inter-agences, /(patron)/inter-agences/convention/[conventionId]`  
**Périmètre** `apps/api/src/inter-agences/**`

Conventions signées par PIN des deux patrons, colis et billets en plusieurs tronçons avec un seul numéro, transfert de responsabilité au scan, parts par tronçon, règlement hebdomadaire le lundi 08:00 (solde net par MoMo), contestation jusqu'au dimanche 20:00, correspondance garantie et replacement.

Critères d'acceptation :
- [ ] Aucune compagnie ne voit les ventes de l'autre
- [ ] Solde net calculé uniquement à partir des scans

Tâches :
- Modèle de données et migrations
- Services et règles métier
- Routes conformes aux contrats
- Tests unitaires et d'intégration
- Brancher les écrans concernés sur l'adaptateur HTTP et vérifier

#### AM-140 · App du point relais

**Épique** E13 Partenaires · **Type** ecran · **Priorité** P2 · **Estimation** 5 pts · **Échéance** 3 → 13 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-006, AM-014, AM-148  
**Planches** RelaisApp · **Route** `/(relais)/accueil`  
**Périmètre** `apps/web/src/routes/(relais)/accueil.tsx`, `apps/web/src/ecrans/RelaisApp/**`

En-tête boutique ; En garde / Arrivent / Semaine ; Remettre (code + pièce, touche 1) et Recevoir (scanner l'étiquette) ; remise en cours avec saisie du code et vérification de pièce ; liste des colis en garde (jours, rappel) ; « Colis remis · photo · + 200 F ».

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite RelaisApp` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Jamais de photo de la pièce, seulement du colis remis
- [ ] Repris à J+7 automatiquement
- [ ] Navigation identique à la maquette : « + inscrire une boutique » → RelaisDevenir (/(voyageur)/moi/devenir-relais) ; « Remettre code + pièce · touche 1 » → reste sur l'écran (action sur place) ; « Recevoir scanner l'étiquette » → reste sur l'écran (action sur place)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/RelaisApp.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-141 · Devenir point de relais : présentation

**Épique** E13 Partenaires · **Type** ecran · **Priorité** P2 · **Estimation** 3 pts · **Échéance** 3 → 13 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-014  
**Planches** RelaisDevenir · **Route** `/(voyageur)/moi/devenir-relais`  
**Périmètre** `apps/web/src/routes/(voyageur)/moi/devenir-relais.tsx`, `apps/web/src/ecrans/RelaisDevenir/**`

Pastille 200 F / COLIS ; explication ; chiffres ; ce qu'il faut ; les 3 étapes ; mention sans exclusivité ; « Je m'inscris ».

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite RelaisDevenir` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Navigation identique à la maquette : « Retour » → Moi (/(voyageur)/moi) ; « Plus tard » → Moi (/(voyageur)/moi) ; « Je m'inscris · 3 min fiche · agent sous 72 h · kit » → RelaisInscription (/(voyageur)/moi/devenir-relais/fiche)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/RelaisDevenir.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-142 · Devenir point de relais : la fiche en 3 min

**Épique** E13 Partenaires · **Type** ecran · **Priorité** P2 · **Estimation** 3 pts · **Échéance** 3 → 13 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-006, AM-014, AM-148  
**Planches** RelaisInscription · **Route** `/(voyageur)/moi/devenir-relais/fiche`  
**Périmètre** `apps/web/src/routes/(voyageur)/moi/devenir-relais/fiche.tsx`, `apps/web/src/ecrans/RelaisInscription/**`

Nom, type, horaires, position détectée, taille des colis, MoMo, photo de la façade, CNI déjà vérifiée, engagements, « Envoyer ma fiche » et brouillon gardé.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite RelaisInscription` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Le brouillon est conservé si l'utilisateur quitte
- [ ] Navigation identique à la maquette : « Retour » → RelaisDevenir (/(voyageur)/moi/devenir-relais) ; « Plus tard brouillon gardé » → Moi (/(voyageur)/moi) ; « Envoyer ma fiche un agent te rappelle sous 72 h » → RelaisVerification (/(voyageur)/moi/devenir-relais/suivi)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/RelaisInscription.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-143 · Devenir point de relais : vérification et activation

**Épique** E13 Partenaires · **Type** ecran · **Priorité** P2 · **Estimation** 3 pts · **Échéance** 3 → 13 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-007, AM-014, AM-148  
**Planches** RelaisVerification · **Route** `/(voyageur)/moi/devenir-relais/suivi`  
**Périmètre** `apps/web/src/routes/(voyageur)/moi/devenir-relais/suivi.tsx`, `apps/web/src/ecrans/RelaisVerification/**`

Fiche envoyée, dossier R-…, frise de suivi en direct, code relais réservé, démo de l'app relais, description de la visite, Modifier ma fiche.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite RelaisVerification` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Navigation identique à la maquette : « Retour » → Moi (/(voyageur)/moi) ; « En attendant Essayer l'app relais · démo recevoir · remettre · payé lundi → » → RelaisApp (/(relais)/accueil) ; « Modifier ma fiche » → RelaisInscription (/(voyageur)/moi/devenir-relais/fiche) ; « Retour à mon espace je te préviens par SMS jeudi » → Moi (/(voyageur)/moi)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/RelaisVerification.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-144 · App du livreur

**Épique** E13 Partenaires · **Type** ecran · **Priorité** P2 · **Estimation** 5 pts · **Échéance** 3 → 13 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-008, AM-014, AM-148  
**Planches** Livreur · **Route** `/(livreur)/accueil`  
**Périmètre** `apps/web/src/routes/(livreur)/accueil.tsx`, `apps/web/src/ecrans/Livreur/**`

Disponible / indisponible ; nouvelle mission avec compte à rebours de 30 s, trajet, poids, distance, gain, Passer / Accepter ; les 3 règles ; gains du jour et de la semaine ; pièces à jour ; Retirer mes gains (dès 5 000 F).

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Livreur` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Sans réponse en 30 s, la mission passe au livreur suivant
- [ ] Navigation identique à la maquette : « + inviter un livreur » → LivreurDevenir (/(voyageur)/moi/devenir-livreur) ; « Accepter · touche 1 » → Livraison (/(voyageur)/colis/[colisId]/livraison)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Livreur.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-145 · Devenir livreur : programme et particularités

**Épique** E13 Partenaires · **Type** ecran · **Priorité** P2 · **Estimation** 3 pts · **Échéance** 3 → 13 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-006, AM-014, AM-148  
**Planches** LivreurDevenir · **Route** `/(voyageur)/moi/devenir-livreur`  
**Périmètre** `apps/web/src/routes/(voyageur)/moi/devenir-livreur.tsx`, `apps/web/src/ecrans/LivreurDevenir/**`

Pastille 700 F / COURSE ; chiffres ; moyen (moto, vélo, à pied, tricycle) ; zone, heures, charge, MoMo ; pièces (CNI, permis, assurance si moto) ; les 3 règles ; « Je m'inscris ».

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite LivreurDevenir` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Permis et assurance demandés seulement pour la moto
- [ ] Navigation identique à la maquette : « Retour » → Moi (/(voyageur)/moi) ; « Plus tard » → Moi (/(voyageur)/moi) ; « Je m'inscris pièces · 10 min de formation · 1re course » → LivreurVerification (/(voyageur)/moi/devenir-livreur/suivi)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/LivreurDevenir.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-146 · Devenir livreur : vérification et première course

**Épique** E13 Partenaires · **Type** ecran · **Priorité** P2 · **Estimation** 3 pts · **Échéance** 3 → 13 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-007, AM-014, AM-148  
**Planches** LivreurVerification · **Route** `/(voyageur)/moi/devenir-livreur/suivi`  
**Périmètre** `apps/web/src/routes/(voyageur)/moi/devenir-livreur/suivi.tsx`, `apps/web/src/ecrans/LivreurVerification/**`

Pastille EN COURS ; frise (fiche, pièces, formation vidéo + quiz, activation) ; badge réservé ; démo de l'app livreur ; première soirée racontée ; particularités modifiables.

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite LivreurVerification` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Navigation identique à la maquette : « Retour » → Moi (/(voyageur)/moi) ; « En attendant Essayer l'app livreur · démo mission · accepter · payé le soir → » → Livreur (/(livreur)/accueil) ; « Modifier ma fiche » → LivreurDevenir (/(voyageur)/moi/devenir-livreur) ; « Retour à mon espace je te préviens dès l’activation » → Moi (/(voyageur)/moi)
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/LivreurVerification.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-147 · App du vendeur ambulant

**Épique** E13 Partenaires · **Type** ecran · **Priorité** P2 · **Estimation** 3 pts · **Échéance** 3 → 13 nov.  
**Dépend de** AM-004, AM-009, AM-005, AM-007, AM-014, AM-149  
**Planches** Vendeur · **Route** `/(vendeur)/accueil`  
**Périmètre** `apps/web/src/routes/(vendeur)/accueil.tsx`, `apps/web/src/ecrans/Vendeur/**`

Vendeur agréé (quartier, compagnies, numéro) ; vendre à un voisin en 3 touches avec commission ; chiffres du mois ; mes clients à revendre en 1 touche ; règle « tu ne gardes jamais d'argent ».

Critères d'acceptation :
- [ ] Banc de fidélité : `pnpm fidelite Vendeur` à 390×844 avec le scénario de démo de la planche, différence ≤ 3 % des pixels (rapport joint à la PR)
- [ ] Textes, montants, couleurs, polices, tailles et espacements repris de la maquette, rien d'inventé ; icônes SVG de la maquette, aucun emoji, aucun bouton grisé ni « bientôt »
- [ ] Le billet est au nom du voisin ; le vendeur paie l'agence par MoMo dans la minute
- [ ] Navigation identique à la maquette : « 08:30 Alpha Voyages · 18 places le voisin paie cash, je paie MoMo, il reçoit le SMS 4 000 » → SiegePay (/(voyageur)/depart/[departId]) ; « 08:00 Bêta Express VIP · 9 places commission 150 F 7 500 » → SiegePay (/(voyageur)/depart/[departId]) ; « Mme Ebogo · Yaoundé chaque vendredi · 6 70 … vendredi 08:30 ? » → SiegePay (/(voyageur)/depart/[departId]) ; « Pasteur Nkou · Bafoussam · 6 94 … dernier : 28 déc. » → SiegePay (/(voyageur)/depart/[departId]) ; « Vendre un billet à un voisin » → SiegePay (/(voyageur)/depart/[departId])
- [ ] Données via @afrimove/api-client uniquement (mock par défaut) ; états chargement, vide et erreur dans le style nuit sans casser la mise en page
- [ ] Cibles tactiles ≥ 44 px, aria-label repris de la maquette ; tests de rendu (Vitest + Testing Library)

Tâches :
- Lire la maquette docs/maquettes-v3/Vendeur.dc.html et relever chaque élément
- Construire l'écran avec les composants du kit (aucun composant partagé modifié ici)
- Brancher les hooks de l'api-client et le scénario de démo
- Implémenter les comportements et la navigation
- Passer le banc de fidélité jusqu'au seuil
- Tests de rendu et d'interaction, PR avec captures maquette / app

#### AM-148 · Backend points relais et livraison moto

**Épique** E13 Partenaires · **Type** backend · **Priorité** P2 · **Estimation** 8 pts · **Échéance** 3 → 13 nov.  
**Dépend de** AM-017, AM-014, AM-163  
**Planches** RelaisApp, Livreur, Relais, Livraison, RelaisInscription, LivreurDevenir · **Route** `/(relais)/accueil, /(livreur)/accueil, /(voyageur)/colis/[colisId]/relais, /(voyageur)/colis/[colisId]/livraison, /(voyageur)/moi/devenir-relais/fiche, /(voyageur)/moi/devenir-livreur`  
**Périmètre** `apps/api/src/relais/**`, `apps/api/src/livraison/**`

Inscriptions relais et livreurs, vérification par un agent, codes R-… et L-…, recherche des relais proches, réception et remise contre code + pièce, garde 7 jours puis retour, missions de livraison proposées 30 s par livreur selon zone, heures et charge, preuve photo, rémunération automatique (relais le lundi, livreur le soir).

Critères d'acceptation :
- [ ] Jamais de remise sans code valide
- [ ] Mission non acceptée en 30 s : livreur suivant

Tâches :
- Modèle de données et migrations
- Services et règles métier
- Routes conformes aux contrats
- Tests unitaires et d'intégration
- Brancher les écrans concernés sur l'adaptateur HTTP et vérifier

#### AM-149 · Backend vendeurs ambulants

**Épique** E13 Partenaires · **Type** backend · **Priorité** P2 · **Estimation** 3 pts · **Échéance** 3 → 13 nov.  
**Dépend de** AM-017, AM-014, AM-162  
**Planches** Vendeur · **Route** `/(vendeur)/accueil`  
**Périmètre** `apps/api/src/vendeurs/**`

Agrément par les agences, vente au nom du voisin, paiement MoMo de l'agence par le vendeur dans la minute, commissions (100 F, 150 F VIP) versées le lundi.

Critères d'acceptation :
- [ ] Le vendeur ne détient jamais l'argent du billet au-delà du paiement immédiat

Tâches :
- Modèle de données et migrations
- Services et règles métier
- Routes conformes aux contrats
- Tests unitaires et d'intégration
- Brancher les écrans concernés sur l'adaptateur HTTP et vérifier

#### AM-168 · Achat conversationnel sur WhatsApp

**Épique** E15 Socle technique : hors ligne, paiements, messages · **Type** integration · **Priorité** P2 · **Estimation** 8 pts · **Échéance** 3 → 13 nov.  
**Dépend de** AM-167, AM-162, AM-165  
**Planches** USSD · **Route** `/(voyageur)/sans-internet`  
**Périmètre** `apps/api/src/whatsapp-achat/**`

« billet Douala Yaoundé demain matin » → 3 départs → choix → siège → paiement MoMo → billet ; messages vocaux compris ; français, anglais, pidgin ; mêmes prix et mêmes règles que l'app.

Critères d'acceptation :
- [ ] Un billet complet en 3 réponses
- [ ] Texte identique à la conversation de la maquette USSD

Tâches :
- Compte et accès sandbox du fournisseur
- Client et webhooks
- Tests en sandbox
- Mode dégradé et journalisation
- Brancher les écrans concernés

#### AM-169 · USSD *123#

**Épique** E15 Socle technique : hors ligne, paiements, messages · **Type** integration · **Priorité** P2 · **Estimation** 8 pts · **Échéance** 3 → 13 nov.  
**Dépend de** AM-162, AM-165  
**Planches** USSD · **Route** `/(voyageur)/sans-internet`  
**Périmètre** `apps/api/src/ussd/**`

Menu USSD (Billet, Mon billet, Colis, Suivre bus, Proche, Aide), achat en 3 réponses, paiement MoMo, SMS du billet ; connecteurs MTN et Orange.

Critères d'acceptation :
- [ ] Texte du menu identique à la maquette
- [ ] Fonctionne sur un téléphone à touches

Tâches :
- Compte et accès sandbox du fournisseur
- Client et webhooks
- Tests en sandbox
- Mode dégradé et journalisation
- Brancher les écrans concernés

### Vague 5 · Qualité et mise en service (13 → 20 nov.)

#### AM-181 · Recette des critères de mise en service

**Épique** E16 Qualité et lancement · **Type** qualite · **Priorité** P0 · **Estimation** 8 pts · **Échéance** 13 → 20 nov.  
**Dépend de** AM-160, AM-161, AM-162, AM-164, AM-171, AM-172  
**Périmètre** `tests/recette/**`

Scénarios automatisés et procès-verbal pour les critères du document projet (fixés au 20 décembre, à tenir désormais au 20 novembre) : journée complète de gare sans intervention, 4 h de vente hors ligne puis synchronisation sans doublon ni trou, billet scanné deux fois refusé, rapport du soir exact au centime, sauvegarde restaurée sur serveur vide, guichetier formé en 2 h qui vend en moins de 45 s.

Critères d'acceptation :
- [ ] Les 6 critères passent et le procès-verbal est signé

Tâches :
- Écrire les scénarios
- Exécuter et corriger ou ouvrir des tickets
- Publier le rapport

#### AM-180 · Tests des parcours en 3 touches

**Épique** E16 Qualité et lancement · **Type** qualite · **Priorité** P1 · **Estimation** 5 pts · **Échéance** 13 → 20 nov.  
**Dépend de** AM-009  
**Planches** Parcours · **Route** `(spécification des tests de parcours)`  
**Périmètre** `tests/parcours/**`

Tests de bout en bout (Playwright, téléphone émulé 390×844) qui rejouent chaque parcours de la carte des parcours et comptent les touches depuis l'accueil du rôle : acheter un billet 3, vendre au guichet 3, proche 3, cadence 1, colis 3, colis guichet 3, suivre son colis 1, scanner au quai 1, covoit 3, fermer sa caisse 3, groupe 3, incident 1, moto 2, rapport 0, USSD 3, module 2.

Critères d'acceptation :
- [ ] Les 16 fonctions du tableau respectent leur nombre de touches
- [ ] Chaque case de la carte des parcours ouvre bien son écran

Tâches :
- Écrire les scénarios
- Exécuter et corriger ou ouvrir des tickets
- Publier le rapport

#### AM-182 · Revue de fidélité des 77 planches

**Épique** E16 Qualité et lancement · **Type** qualite · **Priorité** P1 · **Estimation** 3 pts · **Échéance** 13 → 20 nov.  
**Dépend de** AM-004  
**Planches** (toutes)  
**Périmètre** `docs/fidelite/**`

Passer `pnpm fidelite --all`, corriger ou ouvrir un ticket pour chaque écran au-dessus du seuil, publier le rapport.

Critères d'acceptation :
- [ ] Toutes les planches sous le seuil, ou écart justifié et accepté par Luther

Tâches :
- Écrire les scénarios
- Exécuter et corriger ou ouvrir des tickets
- Publier le rapport

#### AM-174 · Traductions anglais et pidgin

**Épique** E16 Qualité et lancement · **Type** qualite · **Priorité** P2 · **Estimation** 3 pts · **Échéance** 13 → 20 nov.  
**Dépend de** AM-009  
**Planches** Splash · **Route** `/bienvenue`  
**Périmètre** `apps/web/src/i18n/en/**`, `apps/web/src/i18n/pcm/**`

Remplir les clés EN et Pidgin de toutes les chaînes (le français est la référence des maquettes), relecture par un locuteur.

Critères d'acceptation :
- [ ] Aucune clé manquante en EN et Pidgin
- [ ] Le français reste identique aux maquettes

Tâches :
- Écrire les scénarios
- Exécuter et corriger ou ouvrir des tickets
- Publier le rapport

#### AM-184 · Emballage Capacitor pour le Play Store et l'App Store

**Épique** E15 Socle technique : hors ligne, paiements, messages · **Type** fondation · **Priorité** P2 · **Estimation** 5 pts · **Échéance** 13 → 20 nov.  
**Dépend de** AM-009, AM-018, AM-075  
**Périmètre** `apps/web/android/**`, `apps/web/ios/**`, `apps/web/capacitor.config.ts`, `.github/workflows/boutiques.yml`

Préparer le passage en boutiques sans réécriture : projet Capacitor dans apps/web (dossiers android/ et ios/) qui embarque le même build web, greffons natifs seulement là où le navigateur ne suffit pas (imprimante Bluetooth, notifications push), icônes et écran de lancement v3, build Android signé en CI, fiche de boutique préparée (captures, textes). La publication elle-même attend les licences Play Store et Apple Developer (tickets administratifs de Luther).

Critères d'acceptation :
- [ ] `pnpm --filter web cap:android` produit un AAB signé qui lance l'app et passe le banc de fidélité sur Main
- [ ] Le projet iOS se compile une fois sur une machine macOS avec Xcode, procédure documentée
- [ ] Un seul build web : aucune différence de code entre la version navigateur et la version emballée
- [ ] L'impression Bluetooth fonctionne dans la version emballée via le greffon natif, avec le même gabarit (AM-075)

Tâches :
- Mettre en place le périmètre décrit
- Écrire les tests
- Documenter l'usage dans le README du package
- Ouvrir la PR avec captures ou sortie de tests

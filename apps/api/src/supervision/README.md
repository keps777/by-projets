# Supervision de la gare (AM-164)

Backend du superviseur : accueil de la gare, validation ou refus des clôtures de caisse, demandes
d'annulation et décision, équipe et PIN. **Aucune action sans le PIN du superviseur.**

Module Nest autonome : `SupervisionModule` (importe `CaisseModule`). Branché dans `AppModule`
; ses cinq ports ont une version mémoire et une version PostgreSQL (`postgres.ts`), choisies par
`API_STOCKAGE` (`apps/api/INTEGRATION.md`).

## Routes et contrat

Chemins et noms d'opérations de `packages/api-client/src/agence/operations.ts` ; schémas de
`@afrimove/contrats` (`agence`). Tout est réservé au rôle **superviseur** de la gare (jamais « toutes
les gares » : un autre `gareId` donne 403 `GARE_AUTRE`), sauf la demande d'annulation.

| Opération                           | Route                                                              | Rôles                          |
| ----------------------------------- | ------------------------------------------------------------------ | ------------------------------ |
| `agence.superviseur.gare`           | `GET  /agence/superviseur/gare`                                    | superviseur                    |
| `agence.superviseur.cloture`        | `GET  /agence/superviseur/clotures/:sessionId`                     | superviseur                    |
| `agence.superviseur.annulation`     | `GET  /agence/superviseur/annulations/:demandeId`                  | superviseur                    |
| `agence.superviseur.equipe`         | `GET  /agence/superviseur/equipe` (`?personneId=` : fiche ouverte) | superviseur                    |
| `agence.annulation.demandee`        | `POST /agence/annulations`                                         | guichetier, convoyeur, vendeur |
| `agence.annulation.decidee`         | `POST /agence/superviseur/annulations`                             | superviseur                    |
| `agence.caisse.validee`             | `POST /agence/superviseur/validations`                             | superviseur                    |
| `agence.caisse.refusee`             | `POST /agence/superviseur/refus`                                   | superviseur                    |
| `agence.equipe.pin_renouvele`       | `POST /agence/superviseur/equipe/pin`                              | superviseur                    |
| `agence.equipe.affectation_changee` | `POST /agence/superviseur/equipe/affectation`                      | superviseur                    |
| `agence.equipe.compte_desactive`    | `POST /agence/superviseur/equipe/desactivation`                    | superviseur                    |
| `agence.equipe.personne_debloquee`  | `POST /agence/superviseur/equipe/deblocage`                        | superviseur                    |
| **en plus du contrat**              | `POST /agence/superviseur/pin`                                     | superviseur                    |

Les écritures sont des événements (enveloppe, idempotence par UUID et erreurs : voir
`../caisse/README.md`).

## Le PIN du superviseur (décision à confirmer)

Le contrat dit « le PIN ne quitte jamais l'appareil, l'appareil signe l'événement », alors que le
ticket demande de **vérifier le PIN via le module comptes du socle**. Compromis retenu, sans changer
le contrat :

1. Le superviseur tape son PIN. L'app envoie `POST /agence/superviseur/pin` avec
   `{ pin, evenement }` : `evenement` est l'événement exactement tel qu'il sera envoyé, avec
   `donnees.validePar = { superviseurId, methode: "pin" }` (sans signature).
2. Le serveur vérifie le PIN contre `personne.pinHache` (argon2id + poivre, `HachageService`), avec les
   règles de la connexion : **3 PIN faux** → compte bloqué **15 minutes** (423 `PIN_BLOQUE`, patron
   alerté) ; 401 `PIN_INCORRECT` avec `essaisRestants` ; un PIN juste remet le compteur à zéro ;
   409 `PIN_NON_DEFINI` ; 409 `PIN_PROVISOIRE_EXPIRE`. Le PIN n'est écrit nulle part.
3. Il renvoie une **preuve** `signature` (72 hexadécimaux : l'heure en secondes puis HMAC-SHA256 du
   contenu de l'événement, clé dérivée du poivre) valable **10 minutes**, liée à cet événement
   exact (identifiant, heure, auteur, cible, données : changer le montant ou la décision après avoir
   mis son PIN invalide la preuve).
4. L'app place la signature dans `validePar.signature` et envoie l'événement. Chaque écriture de
   supervision vérifie la preuve (`ValidationSuperviseurService`) : absente, inventée, expirée,
   d'un autre événement ou d'un autre superviseur → 403 (`PREUVE_PIN_INVALIDE`,
   `SUPERVISEUR_INCOHERENT`), et le refus est écrit dans l'audit.

La méthode « empreinte » est refusée (403 `METHODE_NON_PRISE_EN_CHARGE`) : le serveur ne peut pas la
vérifier. L'écran peut donc proposer l'empreinte seulement comme raccourci local qui déverrouille la
saisie, jamais comme preuve.

## Règles métier

- **Demande d'annulation** : un guichetier ne peut pas annuler seul. Une seule demande en attente par
  billet (409 `DEMANDE_EXISTANTE`) ; billet embarqué, voyagé ou déjà annulé : 409
  `BILLET_NON_ANNULABLE`.
- **Décision** (`rembourser`, `reporter`, `avoir`, `refuser`) : la demande est réservée d'abord
  (compare-et-échange), puis le billet change d'état via `RegistreBillets` (machine d'états du
  domaine : jamais après l'embarquement ; sinon 409 `TRANSITION_INTERDITE` et la demande est
  rouverte). Le billet **garde son numéro**, son siège est libéré tout de suite. Montants : report et
  refus = 0 (422 `MONTANT_NON_NUL`) ; remboursement et avoir ≤ prix (422 `MONTANT_TROP_ELEVE`).
  Une deuxième décision : 409 `DEJA_DECIDEE`.
- **Remboursement cash** : il sort de la caisse du guichetier qui a fait la demande (annulation
  validée, retranchée du cash attendu), une seule fois même si l'événement est rejoué.
- **Valider** une clôture : `ecart` signé = écart de la clôture (422 `ECART_DIFFERENT`) ; on ne valide
  pas sa propre caisse (403 `AUTO_VALIDATION`) ; hors tolérance → alerte au patron.
- **Refuser · recompter** : la session redevient `ouverte` (`reouverteA`, historique des refus) ; le
  guichetier recompte et clôture à nouveau ; minuit la ferme si besoin.
- **Équipe** : PIN provisoire de 6 chiffres (tirage cryptographique, politique du socle) valable
  1 h, envoyé **par SMS uniquement** (jamais dans une réponse, le journal ou l'audit), haché argon2id,
  lève aussi un blocage ; SMS en échec → 502 `SMS_ECHEC`. Changer d'affectation (guichet de la gare,
  rôle ; jamais « superviseur » : 403 `ROLE_INTERDIT`). Désactiver un compte (immédiat : le jeton déjà
  émis cesse de fonctionner ; jamais soi-même ni un autre superviseur ; patron alerté). Débloquer une
  personne bloquée (409 `COMPTE_NON_BLOQUE` sinon). Les superviseurs sont gérés par le patron
  (403 `ROLE_PROTEGE`).
- Alerte d'équipe « N écarts en 10 jours » à partir de 3 clôtures à écart non nul.

## Ports (classes abstraites) et adaptateurs

Comme pour la caisse, le module refuse de démarrer en production avec un port en mémoire.

| Port                 | Rôle                                                                                 | Mémoire                     | PostgreSQL                   |
| -------------------- | ------------------------------------------------------------------------------------ | --------------------------- | ---------------------------- |
| `RegistreBillets`    | lire un billet ; `appliquer` (annuler ou reporter) en compare-et-échange             | `RegistreBilletsMemoire`    | `RegistreBilletsPrisma`      |
| `DemandesAnnulation` | demandes : `creer`, `decider` (CAS), `rouvrir`                                       | `DemandesAnnulationMemoire` | `DemandesAnnulationPrisma`   |
| `SourceGare`         | gare, guichets, départs de l'après-midi, cadence sans nom, statistiques d'annulation | `SourceGareMemoire`         | `SourceGarePrisma` (dérivée) |
| `EquipeGare`         | annuaire de l'équipe, changer d'affectation, désactiver                              | `EquipeMemoire`             | `EquipeGarePrisma`           |
| `PinsEquipe`         | état du PIN provisoire ; écrit le haché dans le compte                               | `PinsEquipeMemoire`         | `PinsEquipePrisma`           |

Les comptes (PIN haché, échecs, blocage) sont lus et écrits par `PersonnesRepository` du socle.

## Tables PostgreSQL

Les tables existent (migrations `…000200`, `…000300`). Ce que fait l'adaptateur :

- `RegistreBilletsPrisma.appliquer` lit le billet `FOR UPDATE`, écrit `UPDATE billet … WHERE id AND etat =
<lu>`, libère le siège (`siege_depart`) et avance `depart.versionPlan` dans la même transaction, puis
  trace l'historique ; le numéro n'est jamais modifié. Un billet sans nom de voyageur s'affiche « Voyageur
  sans nom ».
- `DemandesAnnulationPrisma` : `decider` est un `UPDATE … WHERE demandeId AND statut = 'en_attente'` (dix
  décisions simultanées, une seule passe) ; l'index unique partiel garde une demande en attente par billet.
- `SourceGarePrisma` **dérive** la vue de la gare des tables, sans table dédiée : quais = plus grand quai
  des départs du jour ; synchronisés = appareils non retirés dont la dernière synchronisation date de moins
  de 15 minutes ; après-midi = départs non annulés à partir de 12 h à Douala ; `fusionProposeeAvec` toujours
  `null` ; statistiques d'annulation = demandes faites par l'agent sur 10 jours, moyenne par guichet.
- `EquipeGarePrisma` dérive la situation du jour : chauffeur ou convoyeur « à bord » si son départ est
  parti, « en service » s'il est au quai ; guichetier « en service » avec une caisse ouverte ; contrôleur
  et superviseur « en service » s'ils se sont connectés aujourd'hui. Billets = ceux de la personne sur 90
  jours. La désactivation écrit `personne.actif = false`.
- `PinsEquipePrisma` écrit `personne.pinHache` et `personne.pinProvisoireJusqua` (le PIN n'est jamais en
  clair en base).

Description d'origine des colonnes, gardée comme référence de leur sens (noms indicatifs) :

- **`demande_annulation`** : `demande_id` PK (UUID appareil), `billet_id`, `gare_id`, `compagnie_id`,
  `demandeur_id`, `guichet_rang`, `motif`, `demande_a`, `statut` (`en_attente|decidee`), `decision`
  NULL, `montant` NULL, `decidee_a` NULL, `decidee_par_id` NULL, `evenement_demande_id`,
  `evenement_decision_id` NULL. Index unique partiel : une seule `en_attente` par `billet_id`.
  `decider` = `UPDATE … WHERE demande_id=? AND statut='en_attente'`.
- **Billets** : `RegistreBillets.appliquer` fait `UPDATE billet SET etat=… WHERE id=? AND etat IN
(états permis)` et libère le siège dans la même transaction ; le numéro n'est jamais modifié.
- **Personne** : colonnes à ajouter si absentes : `pin_provisoire_jusqua timestamptz NULL` (lue par
  `PinsEquipe.lire`) ; `PinsEquipe.definirProvisoire` écrit `pin_hache` et `pin_provisoire_jusqua` ;
  `EquipeGare.desactiver` écrit `actif = false` ; l'affectation (guichet, rôle) ajoute un
  `guichet_id` NULL sur l'appartenance à l'équipe.
- Mouvements de caisse : voir `annulation_caisse` dans `../caisse/README.md`.

## À brancher par le coordinateur

1. Fait : `SupervisionModule` est dans `AppModule` et ses cinq ports ont leur adaptateur PostgreSQL.
2. **La connexion doit refuser un PIN provisoire expiré** (`pin_provisoire_jusqua` dépassé) et imposer
   le changement à la première connexion : ce code est dans le socle, pas dans ce ticket.
3. `ComptesService.creer` ne range pas de PIN pour un superviseur (il se connecte par mot de passe +
   SMS) : prévoir de définir son PIN de supervision (`pin_hache`) à la création ou via le patron.
4. Appareils (liste, déblocage, WebSocket de la gare) : hors de ce ticket.

## Limites connues

- « Client présent » et « pièce vue » ne remontent pas dans la demande : renvoyés à `false`.
- L'empreinte (WebAuthn) n'est pas vérifiable côté serveur : `empreinteDisponible: false`.
- Le détail de la gare (guichets, départs, synchro) vient de `SourceGare`, dérivé des tables en
  PostgreSQL (voir plus haut), à alimenter en mémoire par les tests.

## Tests

`pin.e2e.test.ts`, `annulations.e2e.test.ts`, `clotures.e2e.test.ts`, `equipe.e2e.test.ts` (API
complète en mémoire, réponses relues avec les schémas du contrat), `parite.test.ts` (lecteurs
d'événements comparés au contrat), `unitaires.test.ts` (preuve du PIN, PIN provisoire). Harnais :
`testing/app-supervision-test.ts`.

Sur PostgreSQL (ignorés sans `DATABASE_URL_TEST`) : `postgres.integration.test.ts` passe la suite de
contrat `testing/contrat-ports.ts` sur la mémoire et sur PostgreSQL, vérifie les garanties de la base
(décision unique, siège libéré dans la transaction, vue de la gare et de l'équipe dérivée des tables) et
l'API de bout en bout (validation avec PIN, remboursement en espèces, équipe).

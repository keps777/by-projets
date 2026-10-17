# Financement, crédit et paie (AM-134)

Module Nest `FinancementModule` : le dossier d'**avance sur recettes** (90 jours de ventes certifiées, relevés
MoMo rapprochés, pièces de l'agence, mandat de prélèvement signé par le PIN) envoyé à l'établissement
partenaire, son suivi, son **retrait tant qu'il n'est pas versé**, le **prélèvement** d'un pourcentage des
ventes MoMo, l'offre de **crédit matériel**, la **paie des équipages** par MoMo et le **paiement du billet en
2 fois** (option par agence). Écrans servis : Financement et FinancementDemande (la paie est aussi proposée
depuis PatronEquipe).

**AfriMove ne détient jamais les fonds.** Le partenaire décide seul et verse sur le compte de l'agence ;
le prélèvement part du compte marchand MoMo de l'agence **directement vers le partenaire** (AfriMove donne
l'ordre, `PartenaireFinancier.prelever`) ; la paie part du compte de l'agence vers chaque salarié
(`VersementsPaie`). Aucune table du module ne porte un solde d'AfriMove.

Le module est autonome : tous ses accès extérieurs sont des **ports** (classes abstraites, `ports.ts`) avec une
version **en mémoire** (`memoire.ts`). Il n'est **pas** dans `AppModule` et n'a **pas** d'adaptateur PostgreSQL :
l'intégration est faite par le coordinateur (voir « Brancher le module »).

## Brancher le module

À faire par le coordinateur (le brief interdit de toucher `app.module.ts` et `prisma/schema.prisma`) :

1. Ajouter `FinancementModule` aux `imports` de `AppModule`. Le module fournit lui-même `VerificateurSignature`
   (importé de `../modules/signature`, le même contrôle de PIN que les modules : 3 essais, 15 minutes de blocage).
2. Créer les tables (voir « Tables PostgreSQL ») et fournir les adaptateurs à la place des versions en mémoire :
   `DossiersFinancement`, `Prelevements`, `LotsPaie`, `ReglagesFinancement`, `ConventionsFinancement`,
   `OffresCredit`. Les numéros MoMo des salariés (`ligne_paie.telephone`) sont chiffrés par `ChiffrementService`.
3. Brancher les ports sans table :
   - `PartenaireFinancier` : l'adaptateur de l'établissement choisi (envoi du dossier et des pièces, retrait,
     état, ordre de prélèvement, authentification de ses appels). **Aucun partenaire n'est choisi** : seul
     `PartenaireSimule` existe ;
   - `VersementsPaie` : envoi d'argent MoMo / Orange Money depuis le compte marchand de l'agence (AM-165) ;
   - `DonneesAgence` : ventes certifiées sur 90 jours (billetterie et colis), relevés MoMo rapprochés
     (rapprochement comptable, AM-114), pièces de l'agence (inscription), compte marchand MoMo, prix du billet VIP ;
   - `SalairesAgence` : salaires du mois calculés sur les trajets et les primes (module équipe).
4. Appeler `PrelevementsService.enregistrerVenteMomo({ agenceId, venteId, montant, at })` à chaque vente
   encaissée en MoMo par la billetterie (paiement confirmé), avec un identifiant de vente stable.
5. Appeler `DeuxFoisService.plan(agenceId, prix)` depuis la billetterie pour savoir si l'agence propose le
   paiement en 2 fois et combien demander à chaque fois (voir « Paiement en 2 fois »).
6. Créer l'application avec `rawBody: true` (déjà fait par `main.ts`) : la route du partenaire signe le corps exact.
7. Poser `@ModuleRequis("financement")` sur `FinancementController` si l'agence doit pouvoir masquer le module
   (`financement` est éteint par défaut dans le catalogue). Non fait ici pour que le module reste autonome.

En production, `VerificationPortsFinancement` **refuse de démarrer** tant qu'un port est en mémoire ou simulé
(`durable === false`) et nomme les ports concernés.

## Routes

Noms d'opérations et schémas de `@afrimove/contrats` (patron, `financement.ts` et `reglages.ts`) et de
`@afrimove/api-client` (`patron/operations.ts`). `parite.test.ts` pilote l'API avec les définitions du client.
Toutes sont réservées au rôle `patron` ; une écriture porte `signature` (PIN) et entre au journal d'audit.

| Route                                                  | Opération                     | Réponse              |
| ------------------------------------------------------ | ----------------------------- | -------------------- |
| `GET /patron/financement`                              | `patron.financement.offre`    | `OffreFinancement`   |
| `GET /patron/financement/demandes/:dossierId`          | `patron.financement.dossier`  | `DossierFinancement` |
| `POST /patron/financement/demandes` (201)              | `patron.financement.demander` | `AvanceDemandee`     |
| `POST /patron/financement/demandes/:dossierId/retrait` | `patron.financement.retirer`  | `DemandeRetiree`     |
| `POST /patron/paie`                                    | `patron.paie.lancer`          | `PaieLancee`         |

Routes **ajoutées**, absentes des contrats (à confirmer ou à déplacer dans les contrats) :

| Route                                         | Rôle   | Usage                                                                   |
| --------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| `PUT /patron/financement/billet-en-deux-fois` | patron | active ou coupe le paiement en 2 fois ; corps `{ actif, signature }`    |
| `POST /financement/partenaire/notifications`  | public | appel du partenaire (accusé, versement, refus), authentifié par le port |

Corps d'erreur : `{ statusCode, code, message, details? }`. Codes repris du mock du client : `PIN_REQUIS` (401),
`PIN_INCORRECT` (403), `DOSSIER_INCONNU` (404), `DOSSIER_NON_RETIRABLE` (409), `AU_DESSUS_DU_PLAFOND` (422),
`COMMANDE_INVALIDE` (422). Codes ajoutés : `PIN_BLOQUE` (423), `PIN_NON_DEFINI` (409), `SIGNATURE_PERIMEE`
(422), `AGENCE_REQUISE` (403), `DEMANDE_EN_COURS`, `CONVENTION_NON_SIGNEE`, `NON_ELIGIBLE` (avec `details.raisons`),
`COMPTE_MARCHAND_ABSENT`, `PAIE_DEJA_LANCEE`, `NOTIFICATION_INCOHERENTE`, `CONFLIT` (409), `EN_DESSOUS_DU_MINIMUM`,
`MOIS_INVALIDE`, `AUCUN_SALAIRE` (422), `PARTENAIRE_INDISPONIBLE` (503), `REFERENCE_INCONNUE` (404),
`SIGNATURE_INVALIDE` (401) et `NOTIFICATION_ILLISIBLE` (400) pour la route du partenaire.

## Règles appliquées

- **Une avance à la fois par agence.** Un dossier est « ouvert » tant qu'il est envoyé, en analyse, ou versé et
  pas encore remboursé : l'unicité est une contrainte du port (`ajouter` renvoie `demande_en_cours`), pas une
  lecture suivie d'une écriture. Une demande refusée ne consomme pas de numéro (`AV-AAAA-NNNN`).
- **Éligibilité** (`regles.ts`) : convention signée, 90 jours d'historique, ventes MoMo, relevés rapprochés à
  95 % au moins, registre de commerce et carte contribuable valides, plafond d'au moins 100 000 F. `NON_ELIGIBLE`
  nomme les raisons. Plafond = 10 jours de ventes moyens (total des 90 jours divisé par 9) arrondi à 100 000 F
  inférieur ; montant proposé = la moitié ; durée estimée = montant / (8 % des ventes MoMo moyennes d'une semaine).
- **Dossier automatique** : quatre pièces fabriquées par AfriMove (ventes certifiées, relevés rapprochés,
  registre, mandat) figées à l'envoi. Le mandat n'autorise que le prélèvement de 8 % sur le compte marchand MoMo
  de l'agence ; il est signé par le PIN et révoqué à solde zéro.
- **Envoi au partenaire** : le dossier est enregistré avant l'appel ; sans accusé il reste « envoyé » et
  `TachesFinancement.rejouerTransmissions` le renvoie (idempotent par numéro de dossier). Avec accusé il passe à
  « en analyse ».
- **Retrait** : permis en « envoyé » et « en analyse ». Le partenaire est prévenu **d'abord** ; le dossier n'est
  marqué retiré qu'après sa réponse. S'il a déjà versé ou refusé, le dossier prend cette issue et le retrait est
  refusé (`DOSSIER_NON_RETIRABLE`) ; s'il ne répond pas, rien ne change (503) et le patron réessaie. Un dossier que
  le partenaire n'a jamais reçu est retiré sans l'appeler et ne sera jamais envoyé. Rejouer le retrait d'un
  dossier déjà retiré répond la même chose.
- **Réponses du partenaire** : accusé, versement (coût total fixé par lui, montant versé éventuellement
  inférieur au montant demandé, jamais supérieur) et refus. Rejouer une notification ne change rien et n'envoie
  pas deux SMS ; une notification qui contredit l'état du dossier répond 409 et est tracée au journal. Si une
  notification se perd, `interrogerPartenaire` demande l'état au partenaire.
- **Prélèvement** (`PrelevementsService`) : démarre au premier billet MoMo **après** le versement, prend
  `floor(vente × 8 %)`, ne dépasse jamais ce qui reste dû (montant versé + coût), ne compte jamais deux fois la
  même vente (clé `prelevement:<venteId>`), sans réponse du partenaire reste « en attente » et est rejoué avec la
  même clé, refus définitif : la réservation disparaît. La dette soldée (prélèvements **exécutés** égaux au dû)
  révoque le mandat et prévient le patron ; l'agence peut alors redemander.
- **Paie** (`PaieService`) : un lot par agence et par mois (mois en cours ou précédent), salaires figés au premier
  lancement, un versement par salarié avec une clé stable `paie:<agence>:<mois>:<personne>:<essai>` que
  l'opérateur dédoublonne. Panne de l'opérateur : ligne « en attente », rejouée avec la même clé. Refus
  définitif : ligne « refusée » ; relancer la paie rejoue les lignes refusées avec un nouvel essai (et reprend
  un compte MoMo ajouté depuis) sans repayer les autres. Tout versé : `PAIE_DEJA_LANCEE`.
- **Paiement en 2 fois** (`DeuxFoisService`, `decouperEnDeuxFois`) : option par agence, coupée par défaut. La
  réservation vaut la moitié du billet arrondie à 500 F au-dessus, la veille le reste (7 500 donne 4 000 puis
  3 500). Les deux parts vont à la compagnie comme tout paiement de billet.
- **Signature** : PIN vérifié avant toute écriture ; chaque demande, acceptée ou refusée, entre au journal
  (`financement.demander`, `financement.retirer`, `paie.lancer`, `financement.billet_en_deux_fois`,
  `financement.notification`) sans PIN, sans numéro MoMo et sans salaire individuel.
- **Isolement** : un dossier d'une autre agence répond 404, comme un dossier inexistant.
- **Validation** : l'API ne peut pas importer zod à l'exécution ; `validation.ts` relit les corps à la main
  (champ inconnu refusé, comme `z.strictObject`) et `validation.test.ts` les compare aux schémas des contrats.
- **Temps** : toutes les heures affichées et les bornes (mois, « aujourd'hui », « hier ») sont celles de Douala.

## Tables PostgreSQL

À créer par le coordinateur dans `prisma/schema.prisma`, avec les index et contraintes ci-dessous (ce sont eux
qui garantissent les propriétés que les ports en mémoire simulent).

**`dossier_financement`** (`DossierStocke`)

| Colonne                                                    | Type                   | Remarque                                                             |
| ---------------------------------------------------------- | ---------------------- | -------------------------------------------------------------------- |
| `id`                                                       | text, clé              | `AV-2027-0041`                                                       |
| `version`                                                  | int                    | concurrence optimiste : `UPDATE … WHERE id AND version`              |
| `agence_id`                                                | uuid                   | `compagnie.id`                                                       |
| `demande_par`                                              | uuid                   | `personne.id` du patron                                              |
| `montant`                                                  | int                    | FCFA ; devient le montant versé si le partenaire en verse moins      |
| `statut`                                                   | text                   | `envoye`, `en_analyse`, `verse`, `refuse`, `retire`                  |
| `partenaire`                                               | text, nul              | nom au moment de la demande                                          |
| `reference_partenaire`                                     | text, nul              | **unique** quand non nul ; donnée à l'accusé                         |
| `conditions`                                               | jsonb                  | `remboursementPctVentesMomo`, `dureeEstimeeSemaines`, `coutTotalPct` |
| `envoye_a`, `reponse_avant`                                | timestamptz            |                                                                      |
| `accuse_a`, `decision_a`, `verse_a`, `retire_a`            | timestamptz, nuls      |                                                                      |
| `motif_refus`                                              | text, nul              | jamais montré au patron                                              |
| `pieces`                                                   | jsonb                  | les 4 pièces figées à l'envoi                                        |
| `mandat_pourcentage`, `mandat_signe_a`, `mandat_signe_par` | int, timestamptz, uuid |                                                                      |
| `mandat_compte_marchand_id`, `mandat_operateur`            | text                   | référence du compte, jamais le numéro                                |
| `mandat_actif`                                             | bool                   | faux une fois la dette soldée                                        |
| `reste_du`                                                 | int, nul               | montant versé + coût, fixé au versement                              |
| `rembourse_a`                                              | timestamptz, nul       |                                                                      |

Index **unique partiel** sur `agence_id WHERE statut IN ('envoye','en_analyse') OR (statut = 'verse' AND mandat_actif)` :
une seule avance ouverte par agence (`ajouter` renvoie `demande_en_cours`) ; la clé primaire donne `numero_pris`.
Index `(statut)` pour `nonTransmis` (`statut = 'envoye' AND accuse_a IS NULL`) et `enAnalyse`.
`aPrelever` : `statut = 'verse' AND mandat_actif`.

**`compteur_avance`** : `annee` (clé), `valeur` (int). `prochainNumero` fait
`INSERT … ON CONFLICT (annee) DO UPDATE SET valeur = compteur_avance.valeur + 1 RETURNING valeur`, atomique.

**`prelevement_avance`** (`Prelevement`) : `cle` (clé primaire, l'idempotence), `dossier_id` (FK), `agence_id`,
`vente_id` (**unique**), `montant_vente`, `montant` (int, > 0), `at`, `etat` (`en_attente`, `execute`),
`reference` (nulle jusqu'à l'exécution). **`reserver` doit être atomique** : une transaction qui verrouille la
ligne du dossier (`SELECT … FOR UPDATE`), calcule `SUM(montant)` des prélèvements du dossier, répond `solde_nul`
si le total dû est atteint, `existe` si la clé est déjà là (`INSERT … ON CONFLICT (cle) DO NOTHING`), sinon insère
`min(souhaite, dû − déjà réservé)`. Sans ce verrou, deux ventes simultanées pourraient dépasser ce qui est dû.
`annuler(cle)` supprime une ligne `en_attente` ; `totalExecute` = `SUM(montant) WHERE etat = 'execute'`.

**`lot_paie`** (`LotPaie`) : `id`, `agence_id`, `mois` (`AAAA-MM`), `lance_par`, `lance_a`, `total`.
**Unique `(agence_id, mois)`** : `creer` renvoie `false` si le lot existe (deux touches simultanées).

**`ligne_paie`** (`LignePaie`) : `lot_id` (FK) + `personne_id` (clé composite), `nom`, `montant` (int, > 0),
`operateur` (nul), `telephone` (**chiffré**, nul), `etat` (`en_attente`, `verse`, `refuse`), `tentative` (int,
0 au départ), `reference` (nulle), `motif` (nul). `marquerLigne` = `UPDATE … WHERE lot_id AND personne_id AND
(etat = $depuisEtat)` ; `incomplets` = lots ayant une ligne `en_attente`.

**`reglage_financement`** : `agence_id` (clé), `billet_en_deux_fois` (bool, faux par défaut), `jour_de_paie` (text,
`vendredi` par défaut).

**`convention_financement`** : `agence_id` (clé), `partenaire` (text), `signee_a` (timestamptz, nul tant que la
convention n'est pas signée). Écrite par un agent AfriMove (aucune route ici).

**`offre_credit_materiel`** : `agence_id` (clé), `description`, `montant_total`, `mensualites`,
`montant_mensualite`. Écrite par le partenaire ou un agent AfriMove (aucune route ici).

## Décisions à confirmer

- **Seuils d'éligibilité et montants** : aucun ne vient de la maquette, ce sont des valeurs de départ
  (`regles.ts`) : 90 jours d'historique, relevés rapprochés à 95 %, avance minimale 100 000 F, plafond de 10 jours
  de ventes moyens, montant proposé = la moitié du plafond, pas de 100 000 F, remboursement de 8 %, réponse sous 24 h.
  La maquette est incohérente avec elle-même (12 M de plafond « = 10 jours de ventes » mais 36,2 M de ventes sur
  90 jours) : l'API suit la règle « 10 jours de ventes moyens ».
- **Coupure du billet en 2 fois** : moitié arrondie à 500 F au-dessus (7 500 donne 4 000 puis 3 500). Le jour de la
  deuxième part est « la veille du départ » (planche) ; la relance du voyageur et la libération du siège s'il ne
  paie pas ne sont **pas** traitées ici (billetterie).
- **Jour de la paie** : la planche Financement dit « versés par MoMo le vendredi », PatronEquipe « Payer les 23
  salaires le 30 ». L'API verse **au moment de la touche** (`versementA` = l'instant du lancement) ; le jour est un
  simple réglage d'affichage (`jourDeVersement`, « vendredi » par défaut). Le mois de paie est le mois en cours ou
  le précédent.
- **Retrait chez le partenaire d'abord** : en cas de panne du partenaire le retrait échoue (503) plutôt que d'être
  enregistré localement, pour ne pas perdre un versement parti en même temps.
- **Montant versé inférieur au montant demandé** : accepté (le dossier prend le montant versé) ; supérieur : refusé.
- **Coût du partenaire** : il s'ajoute au montant versé pour fixer ce qui est dû (`montant × (1 + coût %)`).
- **Remboursement anticipé** et **révocation du mandat par le patron** : non prévus (le mandat ne se révoque qu'à
  solde zéro, comme la planche). Aucune route de remboursement.
- **Crédit matériel** : lecture seule. Le prélèvement mensuel du crédit sur les ventes et son acceptation par le
  patron ne sont pas implémentés (aucune opération dans les contrats).

## Champs et opérations manquants relevés dans les écrans

Les contrats n'ont **pas** été modifiés (hors périmètre) ; l'API respecte les schémas actuels. À trancher :

1. **Identifiant du dossier en cours** : `OffreFinancement.avance` ne porte pas l'identifiant du dossier ouvert.
   Quand `statut` vaut `en_cours`, l'écran Financement ne sait pas ouvrir FinancementDemande (il n'a l'identifiant
   qu'à la création) ; l'accueil du patron (alerte « Avance 6 M · dossier AV-… ») est dans le même cas. Proposition :
   `avance.dossierId: string | null`.
2. **`useLancerPaie`** : l'opération et le hook existent, mais aucun écran ne les appelle (la carte « Paie des
   équipages » est une simple information ; PatronEquipe renvoie vers Financement « où la paie se signe »).
   `PaieLancee` ne dit pas combien de salaires sont en attente ou refusés (l'API peut répondre 200 avec des lignes
   en attente) : ajouter `nbVerses` / `nbEnAttente` / `nbRefuses`. `PaieLancee.total` est nullable dans le contrat,
   jamais nul ici.
3. **Activation du paiement en 2 fois** : `OffreFinancement.billetEnDeuxFois` est en lecture seule. Route ajoutée
   `PUT /patron/financement/billet-en-deux-fois` (voir plus haut) à reprendre dans les contrats.
4. **Détails de suivi** : `EtapeSuivi.detail` est une phrase déjà écrite, relative à l'heure de lecture
   (« aujourd'hui 10:04 · accusé reçu du partenaire »). Les écrans ne peuvent ni la traduire (en, pcm) ni la
   mettre en forme. Proposition : des champs structurés (`accuseRecu`, `at`, `reponseAvant`, `versement.at`, issue).
5. **Pas d'offre de crédit** : `creditMateriel` n'est pas nullable ; sans offre du partenaire l'API répond des
   zéros (`description: ""`, `mensualites: 1`). Proposition : `creditMateriel: … | null`, et une opération pour
   accepter le crédit.
6. **Éligibilité** : `avance.statut = "non_eligible"` sans raison. L'API connaît les raisons (`NON_ELIGIBLE`
   les renvoie en détails) ; proposer `avance.raisons`.
7. **Remboursement** : aucun champ pour le reste dû, le montant déjà prélevé ni l'état « remboursé » ;
   `StatutDossier` n'a pas de valeur « soldé » (un dossier soldé reste `verse`). Le motif de refus n'a pas de champ.

## Textes inventés (absents des maquettes)

- Frise de suivi (`contenu.ts`) : « accordée aujourd'hui 16:00 », « Versement sur ton compte aujourd'hui 16:00 · 8 %
  de chaque billet MoMo prélevé pour rembourser », « refusée par le partenaire … », « Versement annulé · aucun
  prélèvement ne sera fait », « demande retirée … », « le partenaire n'a pas encore accusé réception »,
  « le partenaire décide seul · sa réponse est attendue ».
- SMS au patron : « AfriMove : ton avance de 6 000 000 FCFA (dossier AV-…) est versée sur ton compte. Le 8 % de tes
  billets MoMo est prélevé pour rembourser. », « AfriMove : le partenaire a refusé ta demande d'avance (dossier
  AV-…). Tu peux en faire une nouvelle. », « AfriMove : ton avance (dossier AV-…) est remboursée en totalité. Le
  prélèvement s'arrête. ».
- Messages d'erreur : voir `erreurs.ts` et les services (`CONVENTION_NON_SIGNEE`, `COMPTE_MARCHAND_ABSENT`,
  `MOIS_INVALIDE`, `AUCUN_SALAIRE`, `PAIE_DEJA_LANCEE`…). Libellé du versement : « Salaire AAAA-MM ».

## Reste à faire

- Adaptateurs PostgreSQL des ports ci-dessus, tables et migrations Prisma (coordinateur).
- Un adaptateur `PartenaireFinancier` réel (aucun établissement n'est choisi) : format de ses appels, sa
  signature, la génération des pièces PDF et CSV à partir des données du dossier (`DossierTransmis.pieces` ne
  porte aujourd'hui que le nom, le détail et le format).
- `VersementsPaie` (AM-165), `DonneesAgence`, `SalairesAgence`.
- Appeler `PrelevementsService.enregistrerVenteMomo` depuis la billetterie et `DeuxFoisService.plan` depuis les
  paiements ; verrou d'instance pour `TachesFinancement` si l'API tourne sur plusieurs processus.
- Brancher les écrans sur l'adaptateur HTTP : les chemins, corps et réponses sont ceux de `operations.ts`
  (`parite.test.ts`) ; l'adaptateur HTTP lui-même n'a pas été lancé contre cette API ici.

# Exports comptables et rapprochement MoMo (AM-114)

Module Nest `ComptableModule` : pour le patron et son comptable, cinq exports à colonnes fixes
(journal des ventes, journal de caisse, annulations et remboursements, écritures SYSCOHADA, factures
AfriMove) en XLSX, CSV et PDF signés d'une empreinte ; le rapprochement des paiements MoMo avec les relevés des
opérateurs (cause probable de chaque transaction sans vente, action proposée) ; la clôture du mois, signée par
le PIN, qui fige les fichiers et verrouille le mois ; l'envoi au cabinet comptable (le 2 du mois et à la
clôture).

Le module est autonome : tous ses accès extérieurs sont des **ports** (classes abstraites, `ports.ts`) avec une
version **en mémoire** (`memoire.ts`). Il n'est **pas** dans `AppModule` et n'a **pas** d'adaptateur
PostgreSQL : l'intégration est faite par le coordinateur (voir « Brancher le module »).

## Brancher le module

À faire par le coordinateur (le brief interdit de toucher `app.module.ts` et `prisma/schema.prisma`) :

1. Ajouter `ComptableModule` aux `imports` de `AppModule`.
2. Écrire les adaptateurs PostgreSQL des ports (voir « Tables PostgreSQL ») et les fournir à la place des
   versions en mémoire.
3. Brancher les ports sans table :
   - `ActionsRapprochement.rembourser` : remboursement MoMo ou Orange Money vers le numéro qui a payé
     (opération de paiements, AM-165), **idempotent par `cle`** ; le numéro n'est jamais passé au module,
     l'adaptateur le retrouve par la référence de l'opérateur. Il lève `ActionRefusee` si l'opérateur refuse pour
     de bon, toute autre erreur veut dire « résultat inconnu » (la tâche de fond rejoue avec la même clé) ;
   - `ActionsRapprochement.rattacher` : écrit la référence de l'opérateur sur le colis ou le billet ;
   - `ActionsRapprochement.reclamer` : réclamation auprès de l'opérateur (réponse sous 72 h) ;
   - `MessagerieCabinet` : envoi du courriel avec pièces jointes (aucune passerelle de courriel n'existe dans
     l'API), idempotent par `cle`, qui rend l'accusé de réception s'il est déjà connu ;
   - `RelevesOperateur` : l'import des relevés MTN et Orange du compte marchand (aucun ticket ne le décrit) ;
   - `FaitsRapprochement` : requêtes de recherche de la cause probable (voir le port) ;
   - `FacturesPayees` : paiement des factures hebdomadaires (module de facturation, hors ticket).
4. Les autres modules qui écrivent des ventes, sessions de caisse, annulations ou paiements doivent appeler
   `VerrouillageMois.exigerOuvert(compagnieId, instant)` avant d'écrire (exporté par `ComptableModule`) :
   « un mois verrouillé refuse toute écriture » n'est tenu que si **toutes** les écritures datées d'un mois
   clôturé passent par là. Une écriture tardive s'inscrit au début du premier mois ouvert
   (`premierInstantOuvert`). Caisse, billetterie, synchronisation hors ligne et paiements sont concernés.
5. Les tâches de fond (`TachesComptable`) démarrent seules hors tests, toutes les 15 minutes : reprise des
   remboursements, rattachements et réclamations dont le résultat était inconnu, reprise des envois au cabinet
   non confirmés, envoi automatique du mois écoulé. Chacune est idempotente (clé par opération, clé par envoi) :
   plusieurs instances ne paient ni n'envoient deux fois, mais un verrou d'instance
   (`pg_advisory_lock`) évitera du travail en double.
6. Réglages des agences : aucune route ne modifie `ParametresComptables` (adresse du cabinet, envoi automatique,
   jours d'envoi et de clôture). Les écrans de réglages sont hors de ce ticket.

En production, `VerificationPortsComptable` **refuse de démarrer** tant qu'un port est en mémoire ou simulé
(`durable === false`) et nomme les ports concernés.

## Routes

Les noms d'opérations et les schémas sont ceux de `@afrimove/contrats` (`patron`, fichier `comptable.ts`) et de
`@afrimove/api-client` (`patron/operations.ts`). Les réponses sont validées avec les schémas zod dans les tests.
Lectures : patron et comptable. Écritures : patron seul, signées par son PIN (6 chiffres, `commandeSignee`).

| Route                                            | Rôles             | Opération                                  |
| ------------------------------------------------ | ----------------- | ------------------------------------------ |
| `GET /patron/comptable`                          | patron, comptable | `patron.comptable.synthese`                |
| `GET /patron/comptable/exports/:exportId/apercu` | patron, comptable | `patron.comptable.apercu`                  |
| `GET /patron/comptable/rapprochement`            | patron, comptable | `patron.comptable.rapprochement`           |
| `POST /patron/comptable/rapprochement/decisions` | patron            | `patron.comptable.rapprochement.appliquer` |
| `GET /patron/comptable/cloture`                  | patron, comptable | `patron.comptable.cloture`                 |
| `POST /patron/comptable/clotures`                | patron            | `patron.comptable.cloturer`                |

Route **ajoutée**, absente des contrats (le point signalé par l'écran ComptableApercu) :

| Route                                             | Rôles             | Usage                                   |
| ------------------------------------------------- | ----------------- | --------------------------------------- |
| `GET /patron/comptable/exports/:exportId/fichier` | patron, comptable | télécharger les vrais octets du fichier |

Paramètre **ajouté**, absent des contrats : `onglet` sur l'aperçu (`?onglet=par_jour`), pour afficher un autre
onglet du classeur ; par défaut, le premier. Le téléchargement rend le type MIME du format, le nom
`journal-ventes-2026-12.xlsx`, l'empreinte dans `X-Empreinte-AfriMove` et `Content-Disposition: attachment`.

Paramètre `mois` (`AAAA-MM`) facultatif sur les lectures : sans lui, le mois précédent tant qu'il n'est pas
clôturé, puis le mois en cours. Mois mal écrit : 400 `REQUETE_INVALIDE`. Mois futur ou avant 2020 : 404
`MOIS_INDISPONIBLE`.

Corps d'erreur : `{ statusCode, code, message }`. Codes : 401 `PIN_REQUIS`, 403 `PIN_INCORRECT`,
409 `PIN_NON_DEFINI`, 422 `SIGNATURE_PERIMEE`, 423 `PIN_BLOQUE` (signature, module `modules`) ; 403
`AGENCE_REQUISE` ; 404 `EXPORT_INCONNU`, `ONGLET_INCONNU`, `MOIS_INDISPONIBLE`, `TRANSACTION_INCONNUE` ;
409 `DECISION_DEJA_PRISE`, `MOIS_DEJA_CLOTURE`, `RAPPROCHEMENT_OUVERT`, `MOIS_EN_COURS`, `MOIS_VERROUILLE`
(pour les autres modules) ; 422 `COMMANDE_INVALIDE`, `CIBLE_INTROUVABLE`, `ACTION_REFUSEE`,
`CABINET_NON_RENSEIGNE`.

## Règles appliquées

- **Heure de Douala** (UTC+1, sans heure d'été) : les mois, les jours, les semaines et les heures affichées.
  Les instants échangés sont des ISO `+01:00`.
- **Montants** : entiers de FCFA, jamais de décimale. Le total d'un export est la somme de ses lignes, et le
  total encaissé du journal des ventes est celui de la clôture, au franc près (même fonction `encaisse`).
- **Encaissé du mois** : les billets et colis vendus dans le mois et non annulés, par moyen de paiement (espèces,
  mobile money MTN et Orange, carte). Une vente annulée reste dans le journal, marquée `ANNULÉ`, et ne compte
  pas. Une annulation décidée après la fin du mois ne change pas ce mois.
- **Colonnes fixes** : `COLONNES` (`tableaux.ts`) est la seule définition ; un test les épingle et vérifie
  qu'un mois vide, un mois plein et un autre mois ont les mêmes en-têtes. Les cellules de texte qui commencent par `=`,
  `+`, `-`, `@`, une tabulation ou un retour chariot sont neutralisées (injection de formules) ; un nombre négatif reste un nombre.
- **Empreinte** : HMAC-SHA-256 du contenu du tableau (colonnes et lignes de chaque onglet), de l'agence, du mois,
  de l'export et de l'instant de génération, avec la clé du journal d'audit (`AUDIT_HMAC_KEY`) et un préfixe
  propre. Elle est écrite dans le fichier (dernière ligne du CSV, onglet « Empreinte » et propriétés du XLSX,
  informations et pied de page du PDF). Seul AfriMove peut la recalculer ; toute retouche change le contenu
  signé. Les fichiers sont déterministes : mêmes données, mêmes octets (pas de date de la machine dans le zip).
- **Rapprochement** : une ligne du relevé est rapprochée si une vente de l'agence porte sa référence. Les
  autres sont « sans correspondance » ; la cause probable se devine dans cet ordre : doublon de paiement (même
  numéro, même montant, au plus 10 minutes avant) ; paiement arrivé après l'expiration du siège (15 minutes,
  dans l'heure qui suit) ; colis payé à l'arrivée sans scan de dépôt (même numéro, même montant) ; inconnue.
  Le numéro du payeur est masqué dès l'entrée (`6 77 •• •• 41`), jamais conservé ni renvoyé.
- **Taux de rapprochement** : lignes rapprochées sur lignes du relevé, une décimale (1 916 lignes dont 4 sans
  vente : 99,8 %). Sans relevé, 100 % seulement s'il n'y a aucune vente mobile à rapprocher.
- **Décisions** : rembourser, rattacher (seulement s'il existe un colis ou billet suggéré), demander. Tout le lot
  est contrôlé avant le premier effet. Une décision est **définitive** : la rejouer à l'identique ne fait rien
  de plus, en changer est refusé (409). Elle est enregistrée avant son effet ; l'effet est idempotent par clé
  (`rapprochement:<agence>:<référence>:<action>`). Refus définitif de l'opérateur : la décision est retirée, la
  ligne redevient ouverte, le refus est tracé (422). Résultat inconnu (réseau) : la décision reste
  « en attente », la ligne reste ouverte, la tâche de fond rejoue.
- **Écart MoMo** : reçu marchand moins le MoMo enregistré (annulations comprises : l'opérateur a reçu l'argent)
  moins le montant des lignes déjà traitées. Il tombe à zéro quand les lignes sans correspondance sont traitées.
- **Clôture** : refusée tant qu'une ligne du rapprochement reste ouverte (409), tant que le mois n'est pas écoulé
  (409), si le mois est déjà clos (409, même avec deux demandes simultanées : une seule gagne), ou si l'envoi est
  demandé sans adresse de cabinet (422). Elle génère et fige les cinq fichiers (octets et tableau compressé), note
  le rapprochement, l'encaissé et les décisions, écrit le journal d'audit (empreintes des cinq fichiers, jamais le
  PIN), puis envoie au cabinet si demandé. Un mois clos se relit toujours dans la clôture : rien n'est recalculé,
  même si une vente tardive arrive ensuite. L'envoi qui échoue ne défait pas la clôture ; la tâche de fond le
  reprend.
- **Aperçu et téléchargement** : l'aperçu montre les dix premières lignes d'un onglet, le total de lignes et le
  total en FCFA. Le fichier généré pour l'aperçu est mémorisé ; un téléchargement dans les 10 minutes rend ces
  mêmes octets (« exactement celui prévisualisé »), au-delà il est régénéré. Mois clos : toujours le fichier figé.
  Le téléchargement est tracé (`comptable.export.telecharger`), sans contenu.
- **Envoi automatique** : le jour réglé (le 2) et les deux jours suivants (rattrapage si l'API était arrêtée),
  une fois par agence et par mois (clé `auto:<agence>:<mois>`), pour le mois écoulé. Fichiers définitifs si le
  mois est déjà clos, sinon générés à l'instant et annoncés « provisoires ». Rien si la clôture a déjà tout
  envoyé, si l'envoi automatique est désactivé ou si aucune adresse n'est renseignée.
- **Écritures SYSCOHADA** : une pièce de ventes par jour (`VE-AAMMJJ`) : débit 571 caisse (espèces) et 462
  opérateurs (mobile money et carte), crédit 706 ventes ; une pièce par remboursement d'une vente d'un mois
  antérieur (`AN-<numéro>`), débit 706 et crédit 571 ou 462, écrite dans le mois du remboursement ; une pièce
  par facture hebdomadaire (`FA-AAMMJJ`, au dimanche), débit 622 frais AfriMove et crédit 462. Chaque pièce est
  équilibrée.
- **Factures AfriMove** : une par semaine (lundi à dimanche), à 75 F par billet et 150 F par colis non annulé
  (les tarifs de `@afrimove/domain`). La facture du dimanche appartient au mois du dimanche, même si sa première
  journée est en fin de mois précédent. Une semaine non terminée n'est pas facturée.
- **Isolation** : tout est filtré par l'agence du compte ; un compte sans agence reçoit 403.

## Tables PostgreSQL

À créer par le coordinateur dans `prisma/schema.prisma`. Ces tables sont **nouvelles** (écritures du module) ;
les lectures s'appuient sur les tables des autres modules (dernier paragraphe).

**`parametres_comptables`** (`ParametresComptables`) : `compagnie_id` (clé), `nom_agence`, `email_cabinet`
(nul, **chiffré** avec `ChiffrementService` : c'est une donnée personnelle du cabinet), `envoi_automatique`
(bool), `jour_envoi` (int, 2), `jour_cloture` (int, 5).

**`cloture_mois`** (`Cloture`) : clé primaire `(compagnie_id, mois)`, ce qui rend de deux clôtures simultanées une
seule gagnante. `mois` (`AAAA-MM`), `cloture_a` (timestamptz), `par_id`, `par_nom`, `journal_id` (ligne du
journal d'audit qui a signé), `encaisse` (jsonb : total, cash, momo, carte, écart), `rapprochement` (jsonb :
taux, ventes mobiles, reçu marchand, sans correspondance), `lignes` (jsonb : les transactions et leur décision au
moment de la clôture), `exports` (jsonb : description, lignes, statut, format, taille, pages des cinq exports),
`apercu_journal` (text[]), `destinataire` (nul, chiffré), `envoi_demande` (bool), `envoi_recu_a` (nul).
Index `(envoi_demande, envoi_recu_a)` pour `envoisEnAttente`.

**`export_fichier`** (`FichierFige`) : clé primaire `(compagnie_id, mois, export_id)`, clé étrangère vers
`cloture_mois`. `format`, `nom`, `nom_fichier`, `type_mime`, `contenu` (bytea, les octets du fichier tels qu'envoyés),
`tableau_gz` (bytea, le tableau JSON compressé de l'aperçu), `empreinte` (text, 64 hex), `genere_a`, `colonnes`,
`lignes` (nul), `pages` (nul). **Insérés dans la même transaction que `cloture_mois`** (`verrouiller` est tout
ou rien). Trigger ou règle `BEFORE UPDATE OR DELETE` qui refuse la modification d'un fichier figé : le fichier
d'un mois clos ne change plus.

**`apercu_fichier`** (`FichiersApercus`) : clé primaire `(compagnie_id, mois, export_id)`, mêmes colonnes que
`export_fichier` sans `tableau_gz`. Un `upsert` à chaque aperçu ; sert au téléchargement qui le suit (10
minutes). Purge possible au-delà de 24 heures.

**`decision_rapprochement`** (`DecisionRapprochement`) : clé primaire `(compagnie_id, mois, reference)`, la
référence de l'opérateur ; la clé unique rend la décision définitive. `action` (`rembourser`, `rattacher`,
`demander`), `cible` (nul), `montant`, `operateur`, `telephone_masque` (jamais le numéro en clair), `cause`,
`explication`, `decide_a`, `par_id`, `par_nom`, `journal_id`, `methode` (`pin`, `empreinte`), `execution`
(`en_attente`, `faite`), `reference_execution` (nul). Index `(execution, decide_a)` pour `enAttente`.
**`enregistrer` doit refuser un mois clos dans la même transaction** : `SELECT 1 FROM cloture_mois WHERE … FOR
SHARE`, puis `INSERT … ON CONFLICT DO NOTHING`. Sans ce verrou, une décision pourrait entrer pendant que le mois
se clôture. Conserver 7 ans.

**`envoi_cabinet`** (`EnvoiCabinet`) : `cle` (clé primaire : `cloture:<agence>:<mois>` ou `auto:<agence>:<mois>`,
l'idempotence ; `enregistrer` = `INSERT … ON CONFLICT DO NOTHING`, vrai si une ligne a été insérée),
`compagnie_id`, `mois`, `nature` (`cloture`, `automatique`), `definitif` (bool), `destinataire` (chiffré),
`envoye_a`, `recu_a` (nul). Index `(compagnie_id, envoye_a desc)`.

**`releve_operateur_ligne`** (`RelevesOperateur`) : à alimenter par l'import des relevés MTN et Orange du
compte marchand. `compagnie_id`, `reference` (l'identifiant de la transaction chez l'opérateur), `recue_a`,
`telephone` (**chiffré**), `operateur` (`mtn`, `orange`), `montant`, `importe_a`. Clé unique
`(compagnie_id, reference)`. Index `(compagnie_id, recue_a)`.

**Lectures sur les tables des autres modules** (aucune table à créer) :

- `VentesComptables` : `billet` (numéro, vendu à, ligne, départ, siège, classe, prix, moyen de paiement,
  guichet, agent, session, annulé à) et `colis` (idem), plus la référence de l'opérateur du `paiement`.
  Index conseillé `(compagnie_id, vendu_a)`. `referencesConnues` cherche sur `paiement.reference_operateur`.
- `SessionsComptables` : `session_caisse`. `AnnulationsComptables` : `demande_annulation` décidée.
- `FaitsRapprochement` : `paiement` en ligne (expirés à 15 minutes), `colis` payés à l'arrivée sans scan de
  dépôt, ventes autour d'un numéro. Les numéros de téléphone étant chiffrés, prévoir une colonne d'empreinte de
  recherche (HMAC du numéro) plutôt qu'un déchiffrement de masse.
- `FacturesPayees` : paiements des factures hebdomadaires d'AfriMove (module de facturation).

## Décisions à confirmer

- **Cartes bancaires** : leur encaissement est écrit au compte 462 (opérateurs), comme le mobile money, et
  compté dans le total mais ni dans « cash » ni dans « momo » de la clôture. Si le cabinet veut un compte
  d'agrégateur distinct, c'est un changement dans `compteDeEncaissement` (`regles.ts`).
- **Jour de clôture (le 5)** : il n'est qu'indicatif (affiché dans la synthèse). Le patron peut clôturer dès que
  le mois est écoulé. À confirmer : bloquer avant le 5 ?
- **Clôture refusée** s'il reste une ligne ouverte, y compris une ligne dont le remboursement est « en
  attente » (résultat inconnu de l'opérateur).
- **Décision définitive** : rembourser ne se reprend pas ; une erreur de choix (par exemple « demander » au
  lieu de « rembourser ») ne se corrige pas dans l'application.
- **Remboursement d'une vente d'un mois clos** : écrit dans le mois du remboursement, le mois clos n'est jamais
  rouvert.
- **Facture partielle** : la facture de la semaine à cheval sur deux mois est dans le mois du dimanche ; la
  première facture de décembre contient donc les ventes du lundi 30 novembre.
- **Envoi automatique** : fichiers provisoires envoyés le 2 (sans clôture), puis définitifs à la clôture si le
  patron demande l'envoi. Le cabinet peut donc recevoir deux jeux pour un même mois.
- **Aperçu** : l'aperçu montre `derniere = 1` quand le tableau est vide (le contrat exige un entier positif).
- **Textes inventés** (absents des maquettes) : objet et corps du courriel au cabinet (`cabinet.service.ts`),
  noms de fichiers (`journal-ventes-AAAA-MM.xlsx`…), en-têtes de colonnes des cinq exports (`COLONNES`),
  libellés des onglets (`tableaux.ts`), libellés des écritures et texte du PDF des factures, onglet
  « Empreinte », messages d'erreur de l'API, actions d'audit (`comptable.rapprochement.appliquer`,
  `comptable.cloturer`, `comptable.export.telecharger`). Les explications des causes (« Probable : … ») sont
  celles de la planche.

## Écarts avec les écrans (à reporter au coordinateur)

- **ComptableApercu** : le contrat n'a pas d'opération de téléchargement du vrai fichier (l'écran génère un CSV
  tronqué côté client) ni de paramètre d'onglet dans `ParamsApercuExport`. Ce module ajoute
  `GET …/exports/:exportId/fichier` et `?onglet=`. Pour les utiliser, `packages/contrats` et
  `packages/api-client` doivent ajouter une opération `patron.comptable.fichier` et le champ `onglet`.
- **ComptableCloture** : le nombre de transactions traitées n'est pas dans `ClotureMois` ; l'écran ne peut pas
  l'afficher. Le module le sait (`lignes` de la clôture) mais ne peut pas l'ajouter à la réponse sans changer
  le contrat strict.

## Reste à faire

- Adaptateurs PostgreSQL des ports ci-dessus, tables et migrations Prisma (coordinateur).
- Import des relevés MTN et Orange (`RelevesOperateur`), passerelle de courriel (`MessagerieCabinet`),
  remboursement MoMo (`ActionsRapprochement`, AM-165), module de facturation (`FacturesPayees`).
- Brancher `VerrouillageMois` dans caisse, billetterie, synchronisation hors ligne et paiements.
- Routes de réglages de l'agence (adresse du cabinet, jour d'envoi, envoi automatique) et de saisie du
  paiement des factures.
- Verrou d'instance pour les tâches de fond si l'API tourne sur plusieurs processus.

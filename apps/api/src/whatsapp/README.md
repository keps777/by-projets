# Passerelle WhatsApp Business (AM-167)

Notifications WhatsApp d'AfriMove et rapport du soir du patron : gabarits en français approuvés à
l'avance par WhatsApp, file compatible BullMQ, reprise sur échec, repli par SMS, accusés de
livraison (webhook signé), état du compte (« compte vérifié · répond en 2 min ») et envoi du
rapport à 21 h (heure de Douala) au patron et aux superviseurs.

Construit sur le modèle de `apps/api/src/sms` (AM-166), qui n'est pas modifié. Le module est
**autonome** : il n'importe aucun module métier, seulement les services globaux du socle
(configuration, chiffrement, audit, horloge). Tout ce qui vient du reste de la plateforme passe par
des ports (classes abstraites) livrés avec une version en mémoire.

**Aucun accès réseau pendant le développement** : le fournisseur de référence est un simulateur
programmable, et le client `FournisseurWhatsAppHttp` (forme de l'API Cloud de Meta) parle par un
`TransportHttp` remplaçable. Les formats de l'API Meta, les codes d'erreur et la signature sont
écrits de mémoire de la documentation : **rien n'a été vérifié contre un compte réel ni un sandbox**
(voir « Limites »).

## Chemin d'un message

```
module métier ──► PasserelleWhatsAppService.envoyer ──► JournalWhatsApp (message, jamais de contenu)
 (billet, colis,    valide le gabarit et les variables,   FileEnvoiWhatsApp (numéro et contenu chiffrés)
  alertes, rapport) limites, idempotence                       │
                                                               ▼
                    TravailleurWhatsApp ──► traiter() ──► FournisseurWhatsApp ──► WhatsApp
                                                               │ accepté : « envoyé »
                      webhook signé ──► ReceptionWhatsAppService : « remis », « lu », « non remis »
                                                               │ échec définitif ou « non remis »
                                                               ▼
                                         SecoursWhatsAppService ──► SecoursSms (passerelle SMS)
```

Le rapport de 21 h : `PlanificateurRapportSoir.tick()` (toutes les 30 s) ──► `RapportSoirWhatsAppService.envoyerRapport`
──► un message par destinataire (patron + superviseurs), clé `rapport:<compagnie>:<jour>:<personne>`.

## Ce que le module fournit

| Élément                                                  | Rôle                                                                                                                                                                                               |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PasserelleWhatsAppService`                              | `envoyer(demande)` (tous les modules), `repondre` (texte libre, fenêtre de 24 h), `annuler`, `obtenir`, `etat`, `traiter` (un essai d'envoi).                                                      |
| `gabarits.ts`                                            | Un gabarit par type : `rapport_soir`, `billet`, `colis`, `alerte_proche`, `alerte_retard`. Variables validées une à une, texte du corps à soumettre à WhatsApp mot pour mot (`GABARITS[…].corps`). |
| `rapport.ts`                                             | `RapportSoirEntree` (copie du contrat `RapportSoir`), mise en forme en 15 variables (milliers, signe moins, « 4,41 M F »), texte de repli court.                                                   |
| `FournisseurWhatsApp` (port)                             | `envoyer`, `lireWebhook`, `verifierAbonnement`, `etatCompte`. Adaptateurs : `FournisseurWhatsAppSimule` (programmable), `FournisseurWhatsAppHttp` (Cloud API, `TransportHttp` remplaçable).        |
| `DisjoncteurWhatsApp`                                    | Après 3 échecs d'affilée, WhatsApp est coupé 30 s puis retesté par un appel unique ; les messages restent en file.                                                                                 |
| `FileEnvoiWhatsApp` (port)                               | Forme de BullMQ (`add`, `Worker`, `Job`). `FileEnvoiMemoire` : jobId idempotent, délai, priorité, attente exponentielle, concurrence.                                                              |
| `JournalWhatsApp` (port)                                 | Messages, essais, messages reçus. `JournalWhatsAppMemoire` et `JournalWhatsAppPrisma` (`postgres.ts`), choisis par `API_STOCKAGE`.                                                                 |
| `SecoursWhatsAppService`, `SecoursSms` (port)            | Repli par SMS : réservé une seule fois par message, clé d'idempotence `whatsapp-secours:<id>`.                                                                                                     |
| `ReceptionWhatsAppService`                               | Accusés (signature HMAC, désordre et doublons tolérés, jamais de retour en arrière) et messages reçus ; vérification d'abonnement du webhook.                                                      |
| `CompteWhatsAppService`                                  | `GET /whatsapp/compte` : nom, vérifié ou non, délai de réponse **mesuré** (médiane sur 7 jours).                                                                                                   |
| `RapportSoirWhatsAppService`, `PlanificateurRapportSoir` | Envoi et suivi du rapport du soir ; planificateur de 21 h, idempotent par personne et par jour.                                                                                                    |
| `SourceRapportSoir`, `AnnuaireRapport` (ports)           | Les données du rapport et ses destinataires (module patron, annuaire de l'équipe).                                                                                                                 |
| `GestionnaireEntrants` (port)                            | Reçoit les questions des destinataires (assistant) ; il répond avec `PasserelleWhatsAppService.repondre`.                                                                                          |
| `WhatsAppController`                                     | Routes ci-dessous.                                                                                                                                                                                 |
| `WhatsAppModule`                                         | Assemble tout. `WhatsAppModule.avec({ imports, providers })` remplace les adaptateurs en mémoire. Refuse de démarrer en production tant qu'un adaptateur est en mémoire, simulé ou non branché.    |

## Statuts de livraison

`en_file` → `envoye` (accepté par WhatsApp) → `remis` (sur le téléphone) → `lu`.
`en_file` | `envoye` → `non_remis` (accusé d'échec : numéro sans WhatsApp, téléphone injoignable).
`en_file` → `en_reprise` (un essai a échoué, le suivant est programmé) → … → `echec`.
`expire` (le message n'a plus de sens), `annule`.

Un accusé ne fait jamais reculer un message : `remis` et `lu` ne sont pas défaits par un échec
tardif, et l'ordre d'arrivée des accusés n'a pas d'importance (`lu` avant `remis` donne `lu`).

## Reprise sur échec et repli par SMS

- **Entre les essais** : 4 essais, attente 5 s, 10 s, 20 s (`WHATSAPP_TENTATIVES_MAX`,
  `WHATSAPP_REPRISE_MS`). Un refus définitif (numéro sans WhatsApp, gabarit refusé) n'est pas réessayé.
- **Repli par SMS** : si le message finit en `echec` ou en `non_remis`, le texte de repli (stocké
  **chiffré**, effacé dès que le message est remis) part par SMS. Billet, colis et alertes utilisent
  les gabarits de la passerelle SMS ; le rapport du soir n'en a pas (texte court, 300 caractères
  au plus). Le repli est réservé une seule fois (`reserverSecours`) et porte la clé
  `whatsapp-secours:<id>` : ni deux SMS, ni course entre un échec et un accusé.
- **Pas de double envoi** : la référence envoyée à WhatsApp est l'identifiant du message
  (`biz_opaque_callback_data`).
- **Mode dégradé** : `GET /whatsapp/etat` rend `normal`, `secours` (circuit ouvert, les SMS prennent le
  relais) ou `indisponible`.

## Fenêtre de 24 h

WhatsApp n'autorise un texte libre que dans les 24 heures qui suivent un message reçu de la
personne. `repondre` le vérifie (messages reçus au journal) et lève `FenetreFermee` sinon ; hors
fenêtre, seuls les gabarits sont permis.

## Routes

| Route                             | Rôles                                                            | Rôle de la route                                                                                                                                                                                              |
| --------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /whatsapp/compte`            | patron, superviseur, afrimove                                    | `{ nom, detail, verifie, delaiReponseMedianMs, … }` : le nom et la ligne « compte vérifié · répond en 2 min » de la conversation (écran Rapport du soir).                                                     |
| `GET /whatsapp/etat`              | afrimove                                                         | Gabarits soumis et approuvés, mode normal ou repli, circuit, file.                                                                                                                                            |
| `GET /whatsapp/rapports/:jour`    | patron, superviseur (leur compagnie), afrimove (`?compagnieId=`) | Suivi du rapport du jour (`AAAA-MM-JJ`) : un état par destinataire (envoyé, remis, lu, repli SMS).                                                                                                            |
| `POST /whatsapp/rapports/envoyer` | afrimove                                                         | Relance l'envoi du rapport d'une compagnie `{ compagnieId, jour? }` (202). Idempotent. 404 sans rapport, 409 sans destinataire.                                                                               |
| `GET /whatsapp/messages/:id`      | patron, superviseur (leur compagnie), afrimove                   | Statut, repli, essais d'un message. Le numéro est masqué, le contenu n'est jamais conservé ; sinon 404.                                                                                                       |
| `GET /whatsapp/webhooks`          | publique                                                         | Vérification d'abonnement de Meta (`hub.mode`, `hub.verify_token`, `hub.challenge`) : rend le `challenge`, 403 si le jeton est faux.                                                                          |
| `POST /whatsapp/webhooks`         | publique, authentifiée par signature                             | Accusés et messages reçus. `x-hub-signature-256: sha256=<HMAC-SHA-256 hex du corps exact>` avec le secret de l'application. Pas d'horodatage : le rejeu est sans effet (statuts monotones, doublons ignorés). |

## Rapport du soir

- **Heure** : 21:00 à Douala (UTC+1, sans heure d'été), `WHATSAPP_RAPPORT_HEURE`. Une compagnie est servie
  une fois par jour ; `tick()` peut tourner à tout moment, plusieurs fois, sur plusieurs instances.
- **Validité** : un rapport non parti 6 h après l'heure prévue n'est plus envoyé (`WHATSAPP_RAPPORT_VALIDITE_H`).
- **Contenu** : le gabarit `afrimove_rapport_soir` (15 variables) reprend la planche RapportSoir :
  billets et variation, colis, litiges, recette (cash et MoMo), gares, en route, remplissage,
  annulations, ventes en ligne, signatures. Un rapport trop long perd d'abord le détail des gares
  (« + N autres gares »). Bouton : « Ouvrir le détail dans l'app » vers
  `https://afrimove.app/patron/rapport?jour=AAAA-MM-JJ`.
- **« Répond en N min »** : calculé, pas déclaré. Pour chaque message reçu, le délai jusqu'à la première
  réponse en texte libre (`reponse`) ; le gabarit envoyé par le système ne compte pas. Médiane sur
  7 jours, mise en cache 5 minutes ; sans mesure, la ligne dit seulement « compte vérifié ».

## Intégration (coordinateur : `app.module.ts`, `main.ts`, Prisma)

1. **`AppModule`** : importer `WhatsAppModule.avec({ imports: […], providers: […] })` avec les
   adaptateurs ci-dessous.
2. **`main.ts`** : `NestFactory.create(AppModule, { rawBody: true, … })`. Sans le corps brut, le webhook
   répond 401 (il ne peut pas vérifier la signature) et journalise l'erreur.
3. **Adaptateurs de production** (le journal est sur PostgreSQL ; les autres ports sont prêts, leurs
   versions durables sont à écrire) :
   - `JournalWhatsApp` : **fait**. `WhatsAppModule` le monte lui-même selon `API_STOCKAGE`
     (`postgres` en production ou si la variable le demande, mémoire sinon). La migration
     `20261017000760_whatsapp` crée les trois tables ci-dessous ; rien à brancher dans `avec(…)` ;
   - `{ provide: FileEnvoiWhatsApp, useClass: … }` sur BullMQ + Redis : `queue.add(nom, donnees, options)` et
     `new Worker(nom, processeur, { concurrency })` reprennent les signatures du port (correspondance en
     tête de `file.ts`). **Une file distincte de celle des SMS** (autre nom). `removeOnComplete` et
     `removeOnFail` courts : la charge utile est chiffrée mais inutile une fois envoyée ;
   - `{ provide: SecoursSms, useClass: … }` : adaptateur sur `PasserelleSmsService.envoyer`. Correspondance :
     `billet` → `billet`, `colis` → `code_retrait`, `alerte_proche` → `alerte_proche`, `alerte_retard` →
     `retard` (mêmes variables, dates en chaîne ISO) ; `rapport_soir` → `systeme` avec `demande.texte`
     (validité conseillée : 5 minutes) ; `branche` vaut `true` ; `cle` = `demande.cle` ;
   - `{ provide: SourceRapportSoir, useClass: … }` : compagnies à servir et rapport du jour, au format
     `RapportSoirEntree` (identique au contrat `RapportSoir` du package de contrats, parité testée) ;
   - `{ provide: AnnuaireRapport, useClass: … }` : patron et superviseurs de la compagnie, numéro déchiffré ;
   - `{ provide: GestionnaireEntrants, useClass: … }` : l'assistant, qui répond avec `repondre`.
     Chaque adaptateur durable ou réel doit déclarer `durable: true` / `reel: true` / `branche: true`, sinon
     le démarrage en production échoue en les nommant tous.
4. **Variables d'environnement** :
   - connexion : `WHATSAPP_FOURNISSEUR=http`, `WHATSAPP_API_URL` (`https://graph.facebook.com/v21.0`),
     `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_WABA_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`
     (16 caractères au moins pour les secrets, valeurs d'exemple refusées en production) ;
   - réglages : `WHATSAPP_LANGUE` (`fr`), `WHATSAPP_TENTATIVES_MAX` (4), `WHATSAPP_REPRISE_MS` (5000),
     `WHATSAPP_CONCURRENCE` (5), `WHATSAPP_SONDAGE_MS`, `WHATSAPP_DELAI_FOURNISSEUR_MS` (10000),
     `WHATSAPP_DISJONCTEUR_SEUIL` (3), `WHATSAPP_DISJONCTEUR_OUVERTURE_MS` (30000),
     `WHATSAPP_LIMITE_DEMANDEUR_HEURE` (60), `WHATSAPP_LIMITE_DESTINATAIRE_HEURE` (10),
     `WHATSAPP_SECOURS_SMS` (`true`), `WHATSAPP_RAPPORT_HEURE` (`21:00`), `WHATSAPP_RAPPORT_VALIDITE_H` (6),
     `WHATSAPP_PLANIFICATEUR_MS` (30000), `WHATSAPP_DELAI_REPONSE_JOURS` (7), `WHATSAPP_MOCK_LOG_CONTENU`
     (simulateur seulement, interdit en production).
     La liste complète et les règles de production sont dans `config.ts` ; le démarrage échoue en listant
     toutes les erreurs.
5. **Compte et gabarits chez Meta** (documentation, à faire par un humain) : créer l'application et le compte
   WhatsApp Business, enregistrer le numéro, générer un jeton système permanent, déclarer le webhook
   `GET/POST /whatsapp/webhooks` avec `WHATSAPP_VERIFY_TOKEN` et abonner le champ `messages`, puis soumettre
   les cinq gabarits (catégorie _utility_, langue `fr`) avec le texte de `GABARITS[…].corps` et leur bouton :
   `afrimove_rapport_soir` (bouton URL « Ouvrir le détail dans l'app » → `https://afrimove.app/patron/rapport?jour={{1}}`),
   `afrimove_billet` (bouton « Ouvrir mon billet » → `https://afrimove.app/b/{{1}}`), `afrimove_colis_retrait`,
   `afrimove_alerte_proche`, `afrimove_alerte_retard`. `GET /whatsapp/etat` montre ceux qui sont approuvés.
6. **Écrans** (tâche « brancher les écrans concernés », hors périmètre ici) : `/(patron)/rapport` (en-tête
   `GET /whatsapp/compte`, suivi `GET /whatsapp/rapports/:jour`), bouton « Envoyer le billet sur WhatsApp ».

Les autres modules appellent `PasserelleWhatsAppService.envoyer({ type, variables, destinataire, cle?, reference?, compagnieId?, envoyerA?, secours? })` :
la `cle` rend l'appel idempotent (ex. `billet:<billetId>`), `envoyerA` programme une alerte, `annuler(id)` la retire.

## Tables PostgreSQL (migration `20261017000760_whatsapp`)

Colonnes en camelCase, comme le reste du schéma Prisma (`apps/api/prisma/schema.prisma`, bloc « LOT A »).

| Table              | Contenu                                                                                            | Garanties de la base                                                                                                                                                                                                                  |
| ------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `whatsapp_message` | Un message : type, clé d'idempotence, numéro chiffré + index aveugle + masque, statut, repli SMS   | `cle` unique (qui crée : `INSERT … ON CONFLICT DO NOTHING`), `idFournisseur` unique (plusieurs NULL permis), type, statut et repli en listes fermées, compteurs positifs, référence complète (type et identifiant, ou aucun des deux) |
| `whatsapp_essai`   | Un appel à WhatsApp : numéro d'essai, durée, résultat, code court                                  | **Ajout seul** (UPDATE, DELETE et TRUNCATE refusés par déclencheur), résultat connu, `numero >= 1`, durée positive, clé étrangère vers le message (un message avec des essais ne se supprime pas)                                     |
| `whatsapp_entrant` | Un message reçu : index aveugle de l'expéditeur, instant de réception, instant et délai de réponse | `idFournisseur` unique (un webhook rejoué est ignoré), `repondueA` et `delaiReponseMs` vont ensemble, délai positif                                                                                                                   |

Index utiles : `whatsapp_message (compagnieId, creeA DESC)`, `(referenceType, referenceId)`,
`(demandeurId, creeA)`, `(destinataireIndex, creeA)` ; partiel `whatsapp_message (creeA) WHERE secoursChiffre IS NOT NULL`
(nettoyage du texte de repli) ; `whatsapp_entrant (expediteurIndex, recuA DESC)`, partiels
`(recuA) WHERE delaiReponseMs IS NOT NULL` (mesure) et `(expediteurIndex, recuA) WHERE repondueA IS NULL` (réponse
du compte).

Comment `JournalWhatsAppPrisma` tient les promesses du port (une seule instruction SQL à chaque fois,
donc sûr avec plusieurs instances de l'API) :

- `creer` : `createMany({ skipDuplicates })` (`ON CONFLICT DO NOTHING`), puis relecture par clé. Un seul des
  appels simultanés crée le message (`cree: true`) ; les autres reçoivent le premier, intact.
- `modifier(id, modifs, seulementSi)` : `UPDATE … WHERE id = $1 AND statut IN (…)` ; zéro ligne = `null`.
  C'est ce qui garde les statuts cohérents quand un accusé et un réessai se croisent. Un identifiant du
  fournisseur déjà pris par un autre message est refusé par la base (erreur, pas de `null`).
- `reserverSecours(id)` : `UPDATE … SET secours = 'en_cours' WHERE id = $1 AND secours = 'aucun'` : le
  repli par SMS n'est réservé qu'une fois, même depuis deux instances.
- `effacerSecoursAvant(date)` : met `secoursChiffre` à `NULL` pour les messages créés strictement avant la
  date (le texte de repli est effacé 48 h après la création même sans accusé).
- `enregistrerEntrant` : `ON CONFLICT DO NOTHING` sur `idFournisseur` ; `false` = doublon de webhook.
- `marquerReponse` : un `UPDATE … WHERE id = (SELECT … ORDER BY recuA LIMIT 1 FOR UPDATE SKIP LOCKED)` marque
  le plus ancien message reçu de ce numéro, sans réponse, reçu depuis moins de la fenêtre (24 h). Des
  réponses simultanées passent chacune au message suivant : aucun n'est marqué deux fois.
- `delaisReponse(depuis)` : les délais des messages répondus reçus depuis la date.
- Le contenu des messages n'est **jamais** stocké dans ces tables (aucune colonne n'existe pour lui, testé).

## Confidentialité

Un rapport porte les chiffres d'activité de la compagnie, un billet ou un colis un code : le contenu
n'existe que **chiffré** (AES-GCM, contexte lié à l'identifiant du message) dans la charge utile de la
file, avec le numéro. Le journal garde le numéro chiffré, son index aveugle et une version masquée
(`+237 ••••• 345`) ; le texte de repli n'est conservé, chiffré, que le temps d'attendre l'accusé. Les
journaux techniques et l'audit ne contiennent ni numéro, ni contenu, ni code (testé). Le simulateur
n'écrit le contenu que si `WHATSAPP_MOCK_LOG_CONTENU=true`, interdit en production. Les messages reçus ne
sont pas conservés : seul de quoi mesurer le délai de réponse reste au journal.

## Limites et décisions à confirmer

- **Formats Meta non vérifiés.** Forme des requêtes (gabarit avec variables numérotées, bouton URL,
  `biz_opaque_callback_data`), des webhooks, signature `x-hub-signature-256`, classement des codes
  d'erreur (131026 = numéro sans WhatsApp, etc.) : écrits d'après la documentation connue, jamais
  essayés contre un sandbox. `fournisseur-http.ts` est le seul endroit à ajuster.
- **Approbation des gabarits.** Meta peut refuser ou reclasser un gabarit (catégorie _marketing_, facturée
  plus cher) ; les textes sont à soumettre tels quels et à valider côté marque.
- **Doublon possible** si la réponse de l'API est perdue : l'API Cloud ne dédoublonne pas, un réessai peut
  envoyer deux fois le message. De même, un accusé « remis » tardif après un repli par SMS donne deux
  messages à la personne.
- **Chiffres du rapport par SMS.** En repli, le rapport part en clair par SMS (chiffres de recette). À
  confirmer avec le patron, ou désactiver le repli pour ce type (`secours: false`).
- **Pas de gabarit SMS pour le rapport** : l'adaptateur de la passerelle SMS passe par le type `systeme`.
- **Coût des conversations WhatsApp** (facturées par Meta) : non suivi ici, contrairement au coût des SMS.
- **Domaine `https://afrimove.app`** : liens du billet et du bouton du rapport, à confirmer.
- **Questions des destinataires** : le module reçoit et compte les messages, mais l'assistant qui répond
  n'est qu'un port (`GestionnaireEntrants`).
- **Disjoncteur par processus** : chaque instance de l'API apprend seule l'état de WhatsApp.
- **La file reste en mémoire** : `FileEnvoiMemoire` perd les envois en attente au redémarrage (le
  message reste au journal en `en_file`). Le journal est durable ; la file BullMQ + Redis est à brancher
  (`FileEnvoiWhatsApp`, étape 3). Le démarrage en production refuse toujours une file en mémoire.
- **Purge des messages reçus et du journal** : aucune purge n'est planifiée ; `whatsapp_entrant` grossit
  d'une ligne par message reçu. La mesure du délai ne lit que les derniers jours (`WHATSAPP_DELAI_REPONSE_JOURS`).
- **Les essais ne se purgent pas** (ajout seul) ; une purge par ancienneté demanderait une migration qui
  assouplit le déclencheur.
- **Délais mesurés** (envoi, remise) et « répond en N min » : mesure en place et testée avec le simulateur,
  non vérifiée sur un vrai compte.

## Tests

`pnpm --filter @afrimove/api run test` — `rapport.test.ts` (mise en forme, parité avec le contrat
`RapportSoir`), `gabarits.test.ts` (textes exacts, validation), `fournisseurs.test.ts` (simulateur, client
HTTP, signatures, abonnement), `file-memoire.test.ts` (comportement BullMQ), `passerelle.service.test.ts`
(envoi, idempotence, limites, reprises, circuit, repli, fenêtre de 24 h, confidentialité),
`reception.service.test.ts` (accusés, désordre, doublons, messages reçus), `rapport-soir.service.test.ts`
(envoi, planificateur de 21 h, idempotence), `compte.service.test.ts` (délai médian mesuré, état),
`config.test.ts`, `whatsapp.module.test.ts` (garde-fou de production), `whatsapp.e2e.test.ts` (HTTP : rôles,
périmètre, webhook signé avec corps brut, vérification d'abonnement, audit).
Le montage sans Nest (`testing/montage.ts`) fait avancer l'horloge : aucun test n'attend en vrai.

**Contre PostgreSQL** : `postgres.integration.test.ts` rejoue le contrat du journal
(`testing/contrat-journal.ts`) sur la mémoire (toujours) et sur la base (si `DATABASE_URL_TEST` est
définie : l'URL d'une base vide, dont le schéma est recréé à chaque exécution), puis ce que seule la base
garantit : deux instances (deux connexions) qui créent le même message, réservent le même repli,
changent le même statut, reçoivent le même webhook ou répondent en même temps ; essais en ajout seul ;
listes fermées ; aucune colonne de contenu ; choix par `API_STOCKAGE` ; et la passerelle de bout en bout
(relance du rapport, accusés signés, repli par SMS, message reçu rejoué, délai de réponse) sur un journal
en base.

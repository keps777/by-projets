# Achat conversationnel sur WhatsApp (AM-168)

Acheter un billet en écrivant (ou en parlant) à AfriMove sur WhatsApp : « Billet Douala Yaoundé demain
matin » → 3 départs → « 2 » → « Oui » → paiement MoMo → billet dans la conversation. En français, en
anglais et en pidgin du Cameroun ; par écrit ou par message vocal.

Module Nest autonome : `WhatsAppAchatModule`. Il s'appuie sur la billetterie (AM-162) et les paiements
(AM-165) par leurs services exportés, sans les modifier, comme l'USSD (AM-169) : mêmes départs, même
ordre, mêmes prix, mêmes règles de siège et de paiement. Il se branche sur la passerelle WhatsApp
(AM-167) par deux points d'entrée seulement : il fournit le `GestionnaireEntrants` que la passerelle
appelle pour chaque message reçu, et il répond avec `PasserelleWhatsAppService.repondre`.

Les trois messages de la planche « USSD » (`docs/maquettes-v3/USSD.dc.html`, fixtures
`packages/fixtures/src/ecrans/USSD.ts`, conversation WhatsApp) sont repris **mot pour mot en
français** et comparés au fixture, ligne à ligne, par `textes.test.ts`. Le reste des textes, et tout
l'anglais et le pidgin, est écrit ici faute de maquette (voir « Textes inventés »).

**Aucun accès réseau, aucun compte WhatsApp Business ni service de reconnaissance vocale pendant le
développement** : la passerelle est celle de l'AM-167 en mode simulé, et la transcription des vocaux
n'a pas d'adaptateur réel (voir « Ce qui n'a pas pu être vérifié »).

## Un billet complet en 3 réponses

```
Aïcha   Billet Douala Yaoundé demain matin
AfriMove 3 départs demain :                          ◄── liste de la planche
         1 · 08:00 Bêta VIP 7 500
         2 · 08:30 Alpha 4 000
         3 · 09:30 Oméga 3 800
         Réponds 1, 2 ou 3.
Aïcha   2                                            ◄── réponse 1 : le départ (siège retenu 15 min)
AfriMove Alpha 08:30, siège 5 fenêtre. 4 000 F par MoMo ?
         Oui · Changer de siège
Aïcha   Oui                                          ◄── réponse 2 : le paiement
AfriMove Demande de paiement envoyée sur ton téléphone. Valide avec ton code secret : …
         (Aïcha valide sur son téléphone, l'agrégateur confirme)
AfriMove ✓ Payé. Billet ALP-DLA-261102-0001, code 5582. Bon voyage, Aïcha.   ◄── le billet
```

Le paiement est asynchrone : la conversation se termine dès que la demande MoMo est partie. La
confirmation arrive aux paiements par le webhook de l'agrégateur, le billet est émis
(`CommandesService.confirmerPaiement`), puis `SuiviAchatsWhatsAppService` l'envoie dans la conversation.

```
Meta ──► POST /whatsapp/webhooks (signé, AM-167) ──► GestionnaireEntrantsAchat
                                                          │ équipe ? ──► assistant (GESTIONNAIRE_SUIVANT)
                                                          ▼
                                              ConversationAchatService    état chiffré (ConversationsAchat)
                                               │         │         │
                              comprehension.ts │         │         │ JournalisationAchat (numéro masqué, aucun texte)
                       (villes, jour, moment,  │  AchatWhatsAppService
                        rang, oui/non, langue) │   départs, siège, commande (billetterie)
                                               │   paiement MoMo (paiements)
                                               ▼
                              MessagerieAchat ──► PasserelleWhatsAppService.repondre (AM-167)

webhook de l'agrégateur ─► paiements ─► billet émis ─► SuiviAchatsWhatsAppService ─► billet dans la conversation
```

### Ce que le voyageur peut écrire

| Message                                                           | Effet                                                                                                                                                                                                   |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| « Billet Douala Yaoundé demain matin », « ticket … », « bilet … » | Liste des 3 prochains départs du trajet. Jour : aujourd'hui, demain, après-demain (sans jour : aujourd'hui s'il reste un départ, sinon demain). Moment : matin, après-midi, soir, nuit. Heure : « 8h ». |
| « Billet Yaoundé », « je veux aller à Yaoundé »                   | Une seule ville : c'est l'arrivée, le départ est le dernier trajet du voyageur (sinon `WHATSAPP_ACHAT_TRAJET_DEFAUT`). La liste rappelle le trajet.                                                     |
| « 2 », « le 2 », « deux », « Alpha », « 9h30 »                    | Choix du départ (rang, compagnie ou heure, si le choix est sans ambiguïté).                                                                                                                             |
| « Oui », « OK », « d'accord », « yes »                            | Paye. Le moyen est celui du numéro (Orange Money ou MTN MoMo), débité sur le numéro qui écrit ; un autre numéro est demandé s'il n'est ni MTN ni Orange.                                                |
| « Changer de siège »                                              | Liste les sièges libres ; un numéro retient le nouveau siège (l'ancien est rendu).                                                                                                                      |
| « Non », « annuler », « laisse tomber »                           | Libère la place retenue.                                                                                                                                                                                |
| « français », « english », « pidgin »                             | Change la langue de la conversation (elle suit aussi les mots du voyageur).                                                                                                                             |
| Un vocal                                                          | Transcrit, redit au voyageur (« J'ai compris : « … ». »), puis traité comme un message écrit.                                                                                                           |
| Bonjour, aide                                                     | Message d'aide.                                                                                                                                                                                         |

Rien n'est deviné : une ville inconnue (« billet pour Garoua »), une date qu'on ne sait pas lire
(« vendredi », « le 12/11 ») ou une même ville deux fois sont dites au voyageur, jamais remplacées par un
autre trajet ou un autre jour.

## Garanties

- **Prix payé = prix affiché.** La planche annonce « 4 000 F par MoMo » : la commande est créée avec le
  code promotionnel `WHATSAPP` (type `frais_offerts`, les 250 F de frais de service sont offerts) et
  le total est comparé au prix du départ avant d'aller plus loin. Sans le code, aucun achat n'est fait,
  aucune place n'est retenue, l'erreur est dans les logs (code `CODE_PROMO_INVALIDE`).
- **Pas de double paiement.** Deux « Oui » ne font qu'un paiement ; le voyageur ne peut ni annuler un
  paiement parti ni en lancer un second sur le même départ (`CommandesService.creer` remplace la
  commande en attente du voyageur sur ce départ).
- **Une place n'est jamais perdue en silence.** Coupure avant « Oui », conversation échue, paiement
  refusé ou resté sans réponse, place reprise : la commande est annulée, la place rendue, et le
  voyageur en est prévenu une fois (clé d'idempotence par commande).
- **Un message à la fois par voyageur.** Les messages d'un même numéro passent l'un après l'autre
  (`Serialiseur`) ; des voyageurs différents se traitent en parallèle (5 voyageurs sur le même départ :
  5 sièges distincts).
- **Un appel rejoué par WhatsApp ne répond qu'une fois** (clé d'envoi `achat-wa:<id du message reçu>`).
- **Le webhook ne tombe jamais** : une erreur d'envoi ou de traitement est journalisée sans texte ni
  numéro (`reponse_non_envoyee`, `erreur`).
- **Mode dégradé** (paiements indisponibles) : aucune place n'est retenue, on renvoie à la gare.
- **Fenêtre de 24 h** : le texte libre n'est permis que 24 h après le message du voyageur. Le billet
  payé très tard part par le gabarit approuvé « billet » (repli par SMS de l'AM-167). Les autres messages
  (paiement échoué) n'ont pas de repli : l'envoi est abandonné sans réessai.
- **Durée de la conversation = durée de la place** : 15 minutes (`WHATSAPP_ACHAT_SESSION_TTL_MIN`).
  « Oui » après ce délai : « Le délai est dépassé, ta place est libérée ».

## Confidentialité

- L'état de la conversation (trajet, départs proposés, siège, numéro MoMo éventuel) n'est stocké que
  **chiffré** (`ChiffrementService.chiffrerJson`, contexte `whatsapp-achat.conversation:<cle>`), sous une
  clé qui est l'index aveugle du numéro : ni le numéro ni le trajet ne sont lisibles dans le stockage.
- Le **journal** garde le numéro **masqué** (`+237 ••••• 008`), une empreinte de 12 caractères de la
  conversation et des codes d'événement : **jamais le texte d'un message, jamais la transcription d'un
  vocal, jamais le numéro**. Les logs techniques non plus.
- **L'audio et sa transcription ne sont pas conservés** : le texte transcrit sert à la demande puis est
  oublié ; il est redit au voyageur, et c'est tout.
- Le numéro du destinataire du billet est chiffré dans `whatsapp_achat` (contexte
  `whatsapp-achat.achat:<commandeId>`).
- Le compte du voyageur est retrouvé ou créé d'après son numéro WhatsApp (authentifié par le webhook
  signé), sans nom et avec le seul rôle voyageur.

## Ports et adaptateurs

Toute dépendance qui n'est ni la billetterie, ni les paiements, ni la passerelle passe par un port
(classe abstraite) ; `memoire.ts` en donne des versions en mémoire, `WhatsAppAchatModule` refuse de
démarrer en production tant qu'un port de stockage est en mémoire (`durable = false`) ou que l'envoi
n'est pas branché sur la passerelle.

| Port                   | Rôle                                                                                        | Par défaut (mémoire)               | À brancher en production                                           |
| ---------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------ |
| `ConversationsAchat`   | État chiffré des conversations, avec échéance                                               | `ConversationsMemoire`             | Redis (`SET … PX`) ou table `whatsapp_achat_conversation`          |
| `JournalAchatWhatsApp` | Journal technique sans texte                                                                | `JournalAchatMemoire`              | Table `whatsapp_achat_journal`                                     |
| `AchatsWhatsApp`       | Achats à suivre jusqu'au billet                                                             | `AchatsMemoire`                    | Table `whatsapp_achat`                                             |
| `ComptesAchat`         | Voyageur d'un numéro WhatsApp                                                               | `ComptesAchatComptes` (réel)       | _(déjà réel : `ComptesService` et `PersonnesRepository` du socle)_ |
| `MessagerieAchat`      | Envoi des messages                                                                          | `MessagerieAchatPasserelle` (réel) | _(déjà réel : `PasserelleWhatsAppService.repondre`)_               |
| `TranscriptionVocale`  | Transcrit un vocal (français, anglais, pidgin)                                              | `TranscriptionAucune`              | **À écrire** : un service de reconnaissance vocale à choisir       |
| `ReconnaissanceEquipe` | Numéros du patron et des superviseurs, dont les messages vont à l'assistant du rapport      | `EquipeAucune`                     | Annuaire des personnes                                             |
| `GESTIONNAIRE_SUIVANT` | _(facultatif)_ L'assistant du rapport du soir, pour les messages qui ne parlent pas d'achat | aucun                              | Le `GestionnaireEntrants` de l'assistant                           |

Les adaptateurs durables déclarent `durable = true`, la transcription réelle `branchee = true`.

## Intégration (coordinateur : `app.module.ts`, `main.ts`, Prisma)

1. **`AppModule`** : monter l'achat **et** la passerelle, avec **le même objet de module** :

   ```ts
   const achat = WhatsAppAchatModule.avec({
     imports: [
       /* modules qui fournissent Redis, Prisma, l'annuaire… */
     ],
     providers: [
       { provide: ConversationsAchat, useClass: ConversationsRedis },
       { provide: JournalAchatWhatsApp, useClass: JournalAchatPostgres },
       { provide: AchatsWhatsApp, useClass: AchatsPostgres },
       { provide: ReconnaissanceEquipe, useClass: EquipeAnnuaire },
       { provide: TranscriptionVocale, useClass: TranscriptionXxx }, // quand le service est choisi
       { provide: GESTIONNAIRE_SUIVANT, useClass: AssistantRapportSoir }, // facultatif
     ],
   });

   @Module({
     imports: [
       // …
       achat,
       WhatsAppModule.avec({
         imports: [achat], // le même objet : une seule instance du module d'achat
         providers: [
           // à la place de l'assistant : l'achat reçoit tout, et passe à l'assistant (GESTIONNAIRE_SUIVANT)
           // ce qui ne le concerne pas
           { provide: GestionnaireEntrants, useExisting: GestionnaireEntrantsAchat },
           // … adaptateurs de production de l'AM-167 (journal, file BullMQ, secours SMS, rapport du soir)
         ],
       }),
     ],
   })
   export class AppModule {}
   ```

   Sans `GESTIONNAIRE_SUIVANT`, un message qui ne parle ni de billet ni de salutation (« Pourquoi le 09:30
   part si vide ? ») reçoit la phrase d'orientation. L'assistant de l'AM-167 reçoit toujours les
   messages de l'équipe, même quand ils parlent de billets.

2. **`main.ts`** : `NestFactory.create(AppModule, { rawBody: true, … })` (déjà demandé par l'AM-167).
3. **Créer le code promotionnel `WHATSAPP`** de type `frais_offerts` (table des promotions), valable
   toujours, sans plafond d'usage : c'est lui qui rend le prix payé égal au prix affiché. Un autre nom se
   règle par `WHATSAPP_ACHAT_CODE_SANS_FRAIS`.
4. **Chez Meta** : le gabarit `afrimove_billet` de l'AM-167 doit être approuvé (repli du billet quand la
   fenêtre de 24 h est fermée). Le champ `messages` du webhook doit inclure les messages vocaux.
5. **Écrans** : la tâche « brancher les écrans » de l'AM-168 (aperçu de la conversation) n'est pas faite
   ici : l'aperçu WhatsApp est déjà dans `apps/web/src/ecrans/USSD`, hors du périmètre de ce module.

## Variables d'environnement

Validées d'un coup au démarrage (la liste des erreurs est complète). La connexion à WhatsApp reste dans
les variables `WHATSAPP_*` de l'AM-167.

| Variable                          | Défaut                    | Rôle                                                                                      |
| --------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------- |
| `WHATSAPP_ACHAT_LANGUE_DEFAUT`    | `fr`                      | Langue de la première réponse sans indice (`fr`, `en`, `pcm`)                             |
| `WHATSAPP_ACHAT_SESSION_TTL_MIN`  | `15`                      | Durée d'une conversation sans réponse (2 à 120) ; la place retenue dure 15 minutes        |
| `WHATSAPP_ACHAT_TRAJET_DEFAUT`    | `DLA>YDE`                 | Trajet proposé à qui n'a jamais voyagé et n'a nommé qu'une ville                          |
| `WHATSAPP_ACHAT_NOMBRE_DEPARTS`   | `3`                       | Départs listés (1 à 5)                                                                    |
| `WHATSAPP_ACHAT_SIEGES_PROPOSES`  | `8`                       | Sièges montrés pour « Changer de siège » (2 à 12)                                         |
| `WHATSAPP_ACHAT_CODE_SANS_FRAIS`  | `WHATSAPP`                | Code promotionnel `frais_offerts` appliqué aux commandes                                  |
| `WHATSAPP_ACHAT_BASE_LIEN_BILLET` | `https://afrimove.app/b/` | Début de l'adresse du billet (gabarit « billet »), https, terminée par « / »              |
| `WHATSAPP_ACHAT_BALAYAGE_MS`      | `3000`                    | Intervalle du suivi (billets, échecs, places abandonnées, purge) ; `0` = aucune minuterie |
| `WHATSAPP_ACHAT_ABANDON_MARGE_S`  | `60`                      | Délai après la session avant de libérer une réservation sans paiement                     |
| `WHATSAPP_ACHAT_ERREURS_MAX`      | `3`                       | Réponses incomprises de suite avant de fermer la conversation (et rendre la place)        |
| `WHATSAPP_ACHAT_VOCAL`            | `true`                    | Lire les messages vocaux (si une transcription est branchée)                              |
| `WHATSAPP_ACHAT_DELAI_VOCAL_MS`   | `8000`                    | Durée maximale de la transcription d'un vocal                                             |
| `WHATSAPP_ACHAT_VILLES`           | _(six villes)_            | Villes en plus : `Garoua=GAR,Maroua=MAR`. Un code connu reçoit un alias de plus           |

Villes reconnues par défaut (codes de la billetterie) : Douala `DLA`, Yaoundé `YDE`, Bafoussam `BAF`,
Bamenda `BAM`, Kribi `KRI`, Ngaoundéré `NGA`. Une ville sans gare dans le catalogue donne « Aucun
départ ».

## Tables PostgreSQL attendues (hors périmètre : `apps/api/prisma/**`)

```sql
-- Conversations en cours. Si Redis est préféré : SET cle charge PX <ttl>, même contenu.
CREATE TABLE whatsapp_achat_conversation (
  cle       text        PRIMARY KEY,   -- index aveugle du numéro (contexte « whatsapp-achat.conversation »)
  expire_a  timestamptz NOT NULL,      -- lire : WHERE cle = $1 AND expire_a > $2 ; purger : DELETE … WHERE expire_a <= $1
  charge    text        NOT NULL       -- EtatConversation en JSON chiffré (contexte « whatsapp-achat.conversation:<cle> »)
);
CREATE INDEX whatsapp_achat_conversation_expire ON whatsapp_achat_conversation (expire_a);

-- Journal technique : aucun texte de message, aucune transcription, aucun numéro.
CREATE TABLE whatsapp_achat_journal (
  id               uuid        PRIMARY KEY,
  at               timestamptz NOT NULL,
  numero_masque    text,                -- « +237 ••••• 008 »
  conversation_ref text,                -- 12 premiers caractères d'une empreinte, jamais le numéro
  evenement        text        NOT NULL CHECK (evenement IN (
    'message','demande_comprise','departs_proposes','aucun_depart','ville_inconnue','achat_reserve',
    'siege_change','paiement_demande','paiement_refuse','paiement_echoue','place_reprise','mode_degrade',
    'achat_annule','achat_abandonne','billet_envoye','billet_envoi_echec','vocal_transcrit','vocal_echec',
    'hors_sujet','reponse_non_comprise','reponse_non_envoyee','erreur')),
  etape            text,                -- sans_conversation, departs, confirmation, choix_siege, numero_momo, paiement
  langue           text CHECK (langue IN ('fr','en','pcm')),
  source           text CHECK (source IN ('texte','vocal')),
  code             text,                -- code court (MODE_DEGRADE, SIEGE_PRIS…), jamais un texte
  duree_ms         integer
);
CREATE INDEX whatsapp_achat_journal_date      ON whatsapp_achat_journal (at DESC);
CREATE INDEX whatsapp_achat_journal_evenement ON whatsapp_achat_journal (evenement, at DESC);

-- Achats à suivre jusqu'au billet (une ligne par commande).
CREATE TABLE whatsapp_achat (
  commande_id          uuid        PRIMARY KEY,   -- commande de la billetterie
  voyageur_id          uuid        NOT NULL,
  etat                 text        NOT NULL CHECK (etat IN ('reservee','paiement_demande','terminee','abandonnee','echouee')),
  langue               text        NOT NULL CHECK (langue IN ('fr','en','pcm')),
  destinataire_chiffre text        NOT NULL,      -- numéro qui recevra le billet (« whatsapp-achat.achat:<commande_id> »)
  cree_a               timestamptz NOT NULL
);
CREATE INDEX whatsapp_achat_etat ON whatsapp_achat (etat, cree_a);
```

- `AchatsWhatsApp.transitionner(commandeId, de, vers)` : `UPDATE … SET etat = $3 WHERE commande_id = $1 AND etat = ANY($2) RETURNING *` ;
  zéro ligne = `null`. C'est ce qui garantit un seul traitement par achat, même avec plusieurs instances.
- `AchatsWhatsApp.enEtat(etats, limite)` : `WHERE etat = ANY($1) ORDER BY cree_a LIMIT $2`.
- `ConversationsAchat.lire` ne renvoie rien passé l'échéance, même si la ligne n'est pas encore purgée.

## Textes inventés

Sont repris de la planche, mot pour mot : la liste des départs, la proposition de siège et de paiement
(`Alpha 08:30, siège 7 fenêtre. 4 000 F par MoMo ?` / `Oui · Changer de siège`), et le billet payé
(`✓ Payé. Billet …, code …. Bon voyage, Aïcha.`).

**Tout le reste est inventé** : l'aide et la salutation, les erreurs, la liste des sièges libres, la
demande du numéro MoMo, les annonces de paiement refusé ou de place reprise, l'écho des vocaux
(« J'ai compris : « … » »), et **tout l'anglais et tout le pidgin**. L'anglais et le pidgin sont écrits
sans locuteur de référence : ils sont à faire relire (le pidgin surtout : `tumara`, `fo`, `di`, `don`,
`Ansa`). Le catalogue complet est dans `textes.ts` ; `textesInventes()` en donne la liste, utilisée pour
le rapport de livraison.

## Limites et décisions à confirmer

- **« Zéro frais ».** La planche annonce 4 000 F pour un départ à 4 000 F : le module fait offrir les
  250 F de frais de service par le code `WHATSAPP` (la planche USSD dit « zéro frais en plus » aussi).
  C'est un coût pour AfriMove sur chaque billet vendu ainsi : à confirmer, ou à remplacer par un prix
  affiché « frais compris » côté billetterie.
- **Siège par défaut.** La planche propose « siège 7 fenêtre » : le plus petit siège **fenêtre** libre est
  retenu, sinon le plus petit siège libre. Avec les colonnes du plan actuel (4), le siège 7 est un
  _couloir_ : l'exemple de la planche et le plan de la billetterie ne coïncident pas ; les tests
  vérifient le texte en remplaçant le numéro et l'emplacement.
- **Trajet habituel.** Une seule ville nommée : le départ est celui du dernier billet du voyageur, sinon
  `WHATSAPP_ACHAT_TRAJET_DEFAUT`. À confirmer avec le produit.
- **Filtres du voyageur.** Les filtres enregistrés dans l'application (classe, compagnies préférées…)
  s'appliquent aussi sur WhatsApp, pour un classement identique.
- **Anti-abus.** Chaque conversation retient une place 15 minutes, et un numéro peut recommencer
  autant de fois qu'il veut. `CommandesService.creer` remplace la commande en attente du même voyageur sur
  le même départ, ce qui limite les retenues, mais il n'y a pas de plafond de réservations par numéro et
  par heure : à décider (le webhook est signé, mais n'importe quel numéro WhatsApp peut écrire).
- **Un billet, pour soi.** Non faits : « Acheter pour quelqu'un » (action de la planche), plusieurs
  billets par conversation, « Mon billet » (renvoyer un billet déjà acheté), l'achat d'un colis.
- **Dates.** Seuls aujourd'hui, demain et après-demain se lisent ; un jour de la semaine ou une date
  est dit au voyageur comme non lu.
- **Langue.** Elle suit les mots du voyageur ; un chiffre ou « OK » garde la langue de la conversation. Le
  pidgin se reconnaît à quelques mots propres (`wan`, `dey`, `abeg`, `tumara`, `bilet`, `how far`…) :
  un pidgin sans ces mots sera pris pour de l'anglais.
- **Plusieurs achats en parallèle.** Une nouvelle demande pendant une proposition remplace la précédente
  (sa place est rendue) ; pendant un paiement parti, elle est refusée jusqu'à son issue.

## Ce qui n'a pas pu être vérifié

- **Messages vocaux de bout en bout.** Le lecteur de webhook de l'AM-167 (`whatsapp/fournisseur.ts`) ne
  retient que le texte : l'identifiant du média audio n'est pas transmis à `EntrantRecu`. Tant que ce
  module n'est pas complété (hors du périmètre de ce ticket), un vocal reçoit le message d'excuse. La
  logique du vocal (transcription, écho, langue, délai, panne, aucune conservation) est testée avec une
  transcription en mémoire et un `EntrantAchat` portant `idMedia`. **Il faut aussi choisir et écrire un
  adaptateur `TranscriptionVocale`** (téléchargement du média chez Meta puis reconnaissance du français,
  de l'anglais et du pidgin, ce dernier étant mal couvert par les services courants).
- **Meta réel.** Les formats d'échange avec l'API WhatsApp sont ceux de l'AM-167, écrits de mémoire et non
  vérifiés ; le texte libre dans la fenêtre de 24 h et le gabarit « billet » n'ont pas été essayés avec un
  vrai compte.
- **Agrégateur réel.** Le paiement MoMo est celui de l'AM-165, testé avec l'agrégateur simulé.
- **Stockage durable.** Les versions PostgreSQL ou Redis des ports ne sont pas écrites ; seules les
  versions en mémoire sont testées. Les tables ci-dessus sont une proposition.
- **Charge.** Le traitement en série par numéro est local à un processus : deux instances peuvent traiter
  deux messages du même numéro en même temps (rare ; le second « Oui » est sans effet grâce aux
  transitions d'état et à la commande unique, mais l'ordre des réponses n'est pas garanti).

## Tests

Tests Vitest dans ce dossier, sur l'application complète (billetterie et paiements réels, agrégateur
simulé, passerelle WhatsApp simulée, webhook signé) :

- `conversation.e2e.test.ts` : la conversation de la planche en 3 réponses (liste, proposition et billet
  comparés au fixture), la compréhension des demandes, les trois langues, le changement de siège, les
  abandons et les erreurs, le paiement (refusé, échoué, place reprise, mode dégradé, code absent, billet
  renvoyé), les vocaux, l'équipe, la concurrence (5 voyageurs, deux messages simultanés) et la
  confidentialité (rien en clair dans le stockage, le journal ou les logs) ;
- `comprehension.test.ts`, `langues.test.ts` : lecture des demandes, rangs, sièges, oui/non, langues ;
- `textes.test.ts` : textes de la planche mot pour mot, même structure dans les trois langues ;
- `config.test.ts` : variables d'environnement et villes ;
- `module.test.ts` : garde-fou de production, repli vers le gabarit « billet », aiguillage de
  `GestionnaireEntrantsAchat`, adaptateurs en mémoire.

`testing/app-achat-test.ts` est le banc réutilisable : application complète, trois compagnies, départs de
demain, `telephone(app, numéro).dire(texte)`, transcription en mémoire.

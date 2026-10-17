# Assistant du patron (AM-109)

Module Nest `AssistantModule` : **insights** (argent qui fuit, argent à gagner, questions suggérées), **questions
libres en français**, **simulations** d'horaire et de prix, et **application d'une proposition sur signature
PIN**. Écrans servis : Assistant et Réponse de l'assistant du patron.

Les chiffres viennent tous de `AnalysesService` (`../analyses/README.md`) : le module de langage (Claude) ne
fait que **reformuler** des phrases que l'API a déjà calculées, et chaque nombre de son texte est vérifié (voir
« Modèle de langage »). Sans modèle (pas de clé, panne, lenteur, refus), les **règles de l'API** écrivent la
réponse seules : c'est la réponse de référence.

Le module est autonome : ses accès extérieurs sont des **ports** (`ports.ts`) avec une version **en mémoire**
(`memoire.ts`). Il n'est **pas** dans `AppModule` et n'a **pas** d'adaptateur PostgreSQL.

## Brancher le module

À faire par le coordinateur (le brief interdit de toucher `app.module.ts` et `prisma/schema.prisma`) :

1. Ajouter **un seul** `AnalysesModule` (global) puis `AssistantModule` (ou `AssistantModule.avec({ imports,
providers })`) aux `imports` de `AppModule`. `PersonnesRepository`, `HachageService` et `AuditService` sont
   déjà globaux (socle) : `AssistantModule` fournit lui-même `VerificateurSignature` et son `Horloge`.
2. Écrire les adaptateurs PostgreSQL de `ConversationsAssistant` et `PropositionsAssistant` (tables ci-dessous).
3. Écrire l'adaptateur de production de **`AppliquerActions`** : c'est lui qui change vraiment un réglage. Il
   appelle le planning (décaler ou ajouter un départ) et la caisse (contrôle inopiné, numéro obligatoire en
   cadence), qui sont d'**autres tickets**. Il doit être idempotent par `action.id` et lever une
   `HttpException` `{ statusCode, code, message }` quand l'application n'est plus possible (départ supprimé,
   règle déjà posée) ; l'API la renvoie en 502 `APPLICATION_IMPOSSIBLE` et libère la proposition.
4. Fournir au module rapport la question du soir : dans `RapportModule`,
   `{ provide: AssistantRapport, useExisting: AssistantRapportMoteur }` (à la place de `AssistantRapportAucun`).
   Le test `assistant-rapport.test.ts` vérifie la compatibilité de forme avec le port du rapport.
5. Variables d'environnement (ci-dessous). `ANTHROPIC_API_KEY` vient d'un secret, jamais du dépôt.

`VerificationAssistant` **refuse de démarrer en production** tant que `ConversationsAssistant`,
`PropositionsAssistant` ou `AppliquerActions` est en mémoire. Sans clé Anthropic il démarre et **avertit** :
l'assistant répond alors avec les seules règles.

## Routes

Noms d'opérations et schémas de `@afrimove/contrats` (`patron/assistant.ts`) et de `@afrimove/api-client`
(`patron/operations.ts`). Toutes sont réservées au patron (`@Roles("patron")`), sans cache, et ne lisent que la
compagnie du jeton (403 `HORS_PERIMETRE` sans compagnie).

| Route                                 | Opération                       | Contrat de réponse      |
| ------------------------------------- | ------------------------------- | ----------------------- |
| `GET /patron/assistant/insights`      | `patron.assistant.insights`     | `InsightsAssistant`     |
| `GET /patron/assistant/conversation`  | `patron.assistant.conversation` | `ConversationAssistant` |
| `POST /patron/assistant/questions`    | `patron.assistant.question`     | `ReponseAssistant`      |
| `POST /patron/assistant/simulations`  | `patron.assistant.simuler`      | `ResultatSimulation`    |
| `POST /patron/assistant/propositions` | `patron.assistant.appliquer`    | `PropositionAppliquee`  |

Les `POST` répondent 200 (ce sont des requêtes, pas des créations de ressource à l'adresse demandée).

Erreurs `{ statusCode, code, message }` :

| Statut | Code                                                                   | Cas                                                                                       |
| ------ | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 400    | `REQUETE_INVALIDE`                                                     | question vide ou de plus de 500 caractères, champ en trop, simulation mal formée          |
| 401    | `PIN_REQUIS`                                                           | application sans signature                                                                |
| 403    | `PIN_INCORRECT`                                                        | mauvais PIN (le refus est tracé sans le PIN)                                              |
| 404    | `PROPOSITION_INCONNUE`                                                 | proposition inconnue **ou d'une autre compagnie**                                         |
| 404    | `DEPART_INTROUVABLE`                                                   | simulation sur un départ hors de la compagnie                                             |
| 409    | `PROPOSITION_DEJA_APPLIQUEE`                                           | deux clics, ou second essai                                                               |
| 409    | `PIN_NON_DEFINI`                                                       | le compte n'a pas de PIN                                                                  |
| 410    | `PROPOSITION_PERIMEE`                                                  | plus de 7 jours (`ASSISTANT_PEREMPTION_JOURS`)                                            |
| 422    | `COMMANDE_INVALIDE`                                                    | corps d'application invalide (identifiant absent ou trop long, champ en trop)             |
| 422    | `ACTION_NON_APPLICABLE`                                                | « Voir la ligne » ouvre un écran : rien à appliquer, proposition non consommée            |
| 422    | `SIGNATURE_PERIMEE`                                                    | heure de l'appareil trop éloignée du serveur                                              |
| 422    | `HORAIRE_EN_CONFLIT`, `DONNEES_INSUFFISANTES`, `SIMULATION_SANS_EFFET` | simulation impossible                                                                     |
| 423    | `PIN_BLOQUE`                                                           | trop d'essais                                                                             |
| 429    | `TROP_DE_QUESTIONS`                                                    | plus de 10 questions par minute et par patron (`ASSISTANT_QUESTIONS_PAR_MINUTE`)          |
| 502    | `APPLICATION_IMPOSSIBLE`                                               | le réglage n'a pas pu être posé ; rien n'est tracé comme réussi, le patron peut réessayer |
| 503    | `SOURCE_INDISPONIBLE`                                                  | départs illisibles, ou propositions impossibles à noter : **aucune réponse inventée**     |

## Ce que fait l'assistant

Intentions reconnues par les règles (`interpretation.ts`), avec le contexte de la question d'avant (une question
« et si… » comprend de quel départ on parlait) : `pourquoi_ligne` (pourquoi une ligne baisse), `cout_bus`,
`prevision_jour` (prévision = moyenne des mêmes jours de la semaine, au moins 2 observés), `et_si_prix`
(simulation en langage libre), `ou_part_argent`. Une question que les règles ne reconnaissent pas peut être rangée
par le modèle dans un **choix fermé** (une des intentions, une ligne de la liste, une heure, un jour, un prix) :
le choix est **revalidé** (une ligne inconnue ou le jour 12 donne « inconnue »). Une question ambiguë (plusieurs
lignes) ou inconnue reçoit une réponse **figée**, jamais confiée au modèle.

Chaque réponse porte ses actions (enregistrées comme propositions) et ses **sources** (« Sources : … Jamais les
chiffres d'une autre compagnie. »). Les sources sont `null` seulement quand rien n'a été lu (question inconnue).

Seuils du moteur : comparaison sur 14 jours (`DEUX_SEMAINES`), un concurrent compte s'il publie le créneau
depuis au moins 7 jours, les colis sont cités à partir de ±3 %, 5 points au plus par réponse.

### Contournements des limites du contrat

- **`ligneId` dans les actions** : « Voir la ligne » et « Ajouter un départ » portent `ligneId` (contrat
  `ActionAssistant.ligneId`, optionnel) ; l'écran l'utilise, et ne retombe sur le nom complet de la ligne
  (« Douala → Bafoussam », écrit dans le résumé) que si l'action n'en porte pas.
- **Points déjà numérotés** (« 1. … ») : l'écran les affiche tels quels ; la vérification renumérote.
- **Options de simulation** : l'écran écrit « {gain} / mois à {libelle} » : les libellés sont « 09:15 » ou « 3 500 F ».
- `passagersPourEquilibrer` et `base` ne sont pas dans `SimulationHoraire` du contrat : retirés des réponses.

## Modèle de langage

`ModeleLangage` (port) : `ModeleAucun` (règles seules) ou `ModeleClaude`, qui appelle l'API Messages d'Anthropic
par `fetch` derrière `TransportClaude` (classe abstraite, remplaçable en test). **Aucune dépendance ajoutée** :
pas de SDK (réseau coupé pour le ticket) ; le SDK officiel est préférable ensuite, il n'a qu'à remplacer
`TransportFetch`.

- Requête : `POST {url}/v1/messages`, en-têtes `x-api-key` et `anthropic-version: 2023-06-01`, corps
  `{ model, max_tokens: 2000, system, messages: [{ role: "user", content }], output_config: { effort } }`. Pas de
  `temperature`, pas de pré-remplissage. On lit les blocs de type `text` ; `stop_reason` `refusal` ou
  `max_tokens` donne `null` (retour aux règles).
- **Ce qui part vers le modèle** : la question et les faits, **pseudonymisés** (`pseudonymes.ts`) : noms d'agents
  et de chauffeurs remplacés (« Agent 1 », « Chauffeur 2 »), téléphones et courriels masqués dans la question. Jamais un billet,
  un voyageur, ni un chiffre d'une autre compagnie. Les noms reviennent dans la réponse après vérification.
- **Vérification de la réponse** (`redaction.ts`) : forme (résumé, points), longueur, aucune adresse web ni
  balise, chaque nombre doit venir des faits ou de la question, les mots obligatoires (nom complet de la ligne)
  doivent être là. Un seul écart : le texte des règles part à la place. La réponse note quelle rédaction a servi
  (`redaction: "regles" | "modele"` dans l'échange stocké).
- **Délai** : `ASSISTANT_DELAI_MS` (3,5 s par défaut) ; au-delà, les règles répondent (le budget total est de 5 s).

## Signature PIN

L'application d'une proposition change un réglage : signature PIN obligatoire (`VerificateurSignature`, module
`modules`). Ordre : validation du corps, signature présente (401 avant toute vérification), proposition connue
de **cette compagnie**, non périmée, applicable, **vérification du PIN**, **réservation atomique**
(`PropositionsAssistant.reserver`), application, confirmation, journal d'audit `assistant.proposition.appliquer`
(`journalId` rendu = ligne d'audit). Le journal ne contient ni le PIN, ni la question, ni la réponse. Un refus
est tracé avec sa cause seulement. Si l'application échoue, la réservation est libérée.

## Variables d'environnement

| Variable                         | Défaut                                         | Rôle                                                                   |
| -------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------- |
| `ANTHROPIC_API_KEY`              | aucune                                         | clé de l'API ; obligatoire avec `claude` ; jamais journalisée          |
| `ASSISTANT_MODELE_LANGAGE`       | `claude` si une clé est donnée, sinon `regles` | `claude` ou `regles` (mode dégradé complet)                            |
| `ASSISTANT_MODELE`               | `claude-sonnet-5-5`                            | identifiant du modèle (Sonnet : rapide et peu coûteux pour reformuler) |
| `ASSISTANT_URL_API`              | `https://api.anthropic.com`                    | https obligatoire (ou localhost pour les essais)                       |
| `ASSISTANT_EFFORT`               | `low`                                          | `low`, `medium`, `high`, ou vide pour ne rien envoyer                  |
| `ASSISTANT_DELAI_MS`             | `3500`                                         | de 500 à 30 000                                                        |
| `ASSISTANT_PEREMPTION_JOURS`     | `7`                                            | de 1 à 30                                                              |
| `ASSISTANT_QUESTIONS_PAR_MINUTE` | `10`                                           | de 1 à 60, par patron                                                  |
| `ASSISTANT_ECHANGES_GARDES`      | `50`                                           | de 1 à 200 échanges rendus par `/conversation`                         |

Une valeur invalide fait échouer le démarrage avec toutes les erreurs d'un coup. Voir aussi les deux variables des
analyses (`ANALYSES_NOMMER_CONCURRENTS`, `ANALYSES_SEUIL_ANONYMAT`).

## Tables PostgreSQL

À créer par le coordinateur dans `prisma/schema.prisma`. Les faits (billets, départs, caisse…) sont lus par les
ports des analyses : l'assistant n'ajoute que ces deux tables.

**`assistant_echange`** (`EchangeStocke`), ajout seul

| Colonne          | Type        | Remarque                                                                                              |
| ---------------- | ----------- | ----------------------------------------------------------------------------------------------------- |
| `id`             | uuid, clé   |                                                                                                       |
| `compagnie_id`   | uuid        |                                                                                                       |
| `utilisateur_id` | uuid        | le patron : la mémoire est celle d'un patron, pas de la compagnie                                     |
| `intention`      | text        | `pourquoi_ligne`, `cout_bus`, `prevision_jour`, `et_si_prix`, `ou_part_argent`, `ambigue`, `inconnue` |
| `redaction`      | text        | `regles` ou `modele`                                                                                  |
| `reponse`        | jsonb       | la `ReponseAssistant` rendue (question comprise)                                                      |
| `contexte`       | jsonb       | `{ ligneId, departId }` : de quoi comprendre « et si… »                                               |
| `cree_le`        | timestamptz |                                                                                                       |

Index `(compagnie_id, utilisateur_id, cree_le desc)` pour `derniers`. Pas de téléphone ni de nom de voyageur ;
la question est du texte libre du patron : à purger après 90 jours (à confirmer).

**`assistant_proposition`** (`PropositionStockee`)

| Colonne                     | Type                                 | Remarque                                                                                                                              |
| --------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `compagnie_id`, `action_id` | uuid/text, **clé primaire composée** | `action_id` est l'identifiant déterministe de l'action (« decaler_depart:… »)                                                         |
| `action`                    | jsonb                                | l'`ActionProposee` complète (type, libellé, **paramètres**) : l'application utilise ces paramètres, jamais ceux d'un corps de requête |
| `proposee_le`, `expire_le`  | timestamptz                          |                                                                                                                                       |
| `appliquee_par`             | uuid, nul                            | renseigné par `reserver`                                                                                                              |
| `appliquee_a`               | timestamptz, nul                     |                                                                                                                                       |
| `journal_id`                | uuid, nul                            | ligne du journal d'audit, posée par `confirmer`                                                                                       |
| `effet_a`                   | timestamptz, nul                     | quand le réglage prend effet                                                                                                          |

- **`proposer`** : `INSERT … ON CONFLICT (compagnie_id, action_id) DO UPDATE SET action, proposee_le, expire_le,
appliquee_* = NULL WHERE assistant_proposition.appliquee_par IS NULL OR assistant_proposition.expire_le <= $proposeeLe`.
  Une proposition **appliquée et encore valable** reste telle quelle.
- **`reserver`** (atomique) : `UPDATE … SET appliquee_par = $par, appliquee_a = $a WHERE compagnie_id = $1 AND
action_id = $2 AND appliquee_par IS NULL`, vrai si une ligne a changé. C'est ce qui empêche d'appliquer deux fois.
- **`liberer`** : remet `appliquee_par`, `appliquee_a` à NULL tant que `journal_id IS NULL`.
- Index `(compagnie_id, expire_le)` pour le ménage des propositions périmées.

## Décisions à confirmer

- **Modèle par défaut** `claude-sonnet-5-5` (latence et coût) plutôt qu'un modèle plus puissant, **effort `low`**,
  délai de 3,5 s : tout se règle par variable d'environnement.
- **Élasticité du prix −0,8** (les analyses) : une baisse de prix n'est jamais présentée comme rentable sur une
  hypothèse optimiste.
- Limite de **10 questions par minute** et par patron ; propositions valables **7 jours** ; une proposition
  **appliquée** n'est pas réappliquable avant sa péremption même si l'assistant la repropose.
- **Fenêtre de 30 jours** ; prévision d'un jour = moyenne des mêmes jours de la semaine ; « ajouter un départ »
  duplique le départ le plus rempli de la ligne la veille du creux (le jour presque plein).
- Nommer les concurrents (réglable) ; n'envoyer au modèle que des faits pseudonymisés.
- `AnalysesModule` rendu **global** pour que l'assistant le voie sans second import.

## Textes inventés (non fournis par les maquettes)

Toutes les phrases du moteur (`moteur.ts`, `interpretation.ts`), en particulier : « Je ne sais pas répondre à cette
question avec tes chiffres. » et ses exemples, « Plusieurs lignes correspondent : … », « De quel départ
parles-tu ? Donne la ligne et l'heure, … », la phrase des sources (« Sources : … Jamais les chiffres d'une autre
compagnie. »), la question du rapport du soir (« Pourquoi le {heure} part si vide ? ») et sa réponse, les libellés
d'options (« 09:15 », « 3 500 F ») et les messages d'erreur du tableau ci-dessus. À relire par le produit.

## Reste à faire

- Adaptateurs PostgreSQL des deux ports et des cinq ports des analyses ; `AppliquerActions` de production
  (planning et caisse, autres tickets).
- Appel réel à l'API Claude **non vérifié** (pas de réseau ni de clé dans ce ticket) : `ModeleClaude` est testé
  avec un faux `TransportClaude` (forme de la requête, lecture de la réponse, refus, délai) et `TransportFetch`
  seulement sur l'échec de connexion ; un essai réel avec une vraie clé reste à faire. Remplacer `fetch` par le SDK officiel.
- Le graphique de 14 jours (`graphique: { valeurs, joursEnEcart }`, optionnel) accompagne la réponse « pourquoi cette
  ligne baisse » : remplissage de la ligne jour par jour, les jours du creux repéré en écart. Il est stocké avec
  l'échange (`reponse` en jsonb, aucune colonne en plus).
- Purge des anciens échanges, et limite de débit partagée entre instances (aujourd'hui en mémoire du processus).

# Synchronisation côté serveur (AM-160)

Réception des événements des appareils d'agence (`@afrimove/sync`), idempotente par UUID, rejouée dans
l'ordre, avec détection des conflits de sièges. Aucune dépendance au domaine ni aux contrats à
l'exécution (paquets non compilés, API en CommonJS) : les règles sont recopiées dans `regles.ts`,
`temps.ts`, `signature.ts` et **`parite.test.ts` les compare aux sources**.

## Routes

| Route                         | Rôles                                                              | Rôle de la route                                                                                                                              |
| ----------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /sync/evenements`       | guichetier, convoyeur, chauffeur, vendeur, contrôleur, superviseur | Reçoit un lot `{ appareilId, envoyeA, evenements: [{ ordre, evenement, signature }] }` (100 maximum). Un lot vide sert de prise de nouvelles. |
| `PUT /sync/appareils/:id/cle` | idem                                                               | Enregistre la clé publique (JWK ECDSA P-256) de l'appareil. Une clé déjà posée ne se remplace que par un superviseur.                         |
| `GET /sync/alertes`           | superviseur (sa gare), patron (sa compagnie)                       | Billets « à replacer », numéros en double ou hors plage, files avec un trou, horloge en avance…                                               |

Réponse du `POST` : `{ serveurA, resultats[], appareil: { derniereSyncA, plage, partsHorsLigne, octroi, verificateursPin }, conflits[] }`.
Chaque événement est acquitté seul : `accepte`, `deja_recu` ou `rejete` (`signature_invalide`,
`auteur_incoherent`, `appareil_incoherent`, `role_non_autorise`, `type_inconnu`, `enveloppe_invalide`,
`donnees_invalides`). **Un événement refusé n'arrête pas le lot.** Un lot illisible ou trop gros : 400.
Un appareil inconnu : 404 ; sans clé : 409 ; d'une autre gare : 403.

## Ce que fait le rejeu (`RejeuService`)

1. valide l'enveloppe ; un UUID déjà au journal répond `deja_recu` sans rien refaire ;
2. contrôle l'auteur (le compte connecté), la signature de l'appareil, le rôle ;
3. applique les effets, tous idempotents : numéro (contrôle de la plage), siège pris ou libéré,
   conflit, déblocage ;
4. écrit au journal **en dernier** : c'est le point de validation. Si le serveur tombe avant, le rejeu
   refait les effets sans conséquence.

Une vente déjà imprimée n'est **jamais refusée pour un motif métier** : numéro en double, hors plage,
siège déjà pris produisent une alerte nominative (qui, quel billet, quel siège), jamais une perte.

**Conflit de siège** : le premier horodatage gagne. Les opérations d'un siège sont rejouées par heure du
geste à chaque arrivée (égalité : appareil puis id d'événement), donc le résultat ne dépend pas de
l'ordre de synchronisation. Le billet perdant reçoit un événement serveur `billet.a_replacer`
(UUID déterministe), reste au journal avec son numéro, et l'appareil le reçoit dans `conflits`
(pendant 72 h, sans état de lecture côté serveur). Une libération arrivée en retard mais datée d'avant
lève le conflit (`conflit_leve`).

**Déblocage** : un `appareil.debloque` écrit par un superviseur de la même gare pose un octroi
(`synchroniser`, `debloquer_4h`, `telephone_secours`) que l'appareil lit à sa prochaine synchro
(valable 24 h). Écrit par l'appareil lui-même (PIN contrôlé sans réseau), il est journalisé et
signalé (`deblocage_sur_place`) : le serveur ne peut pas le vérifier.

## Ports (ce qu'AM-161 et la base remplacent)

Tout passe par des classes abstraites (`ports.ts`) ; `memoire.ts` en donne des versions en mémoire pour
les tests. `SyncModule` **refuse de démarrer en production** tant qu'un port est en mémoire.

| Port                                                        | À fournir                                                                                                |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `AppareilsSync`, `JournalSync`, `SiegesSync`, `AlertesSync` | adaptateurs PostgreSQL (tables ci-dessous)                                                               |
| `ProvisionnementSync`                                       | parts de sièges hors ligne par appareil, vérificateurs de PIN des superviseurs de la gare                |
| `ControleNumeros` (**AM-161**)                              | `enregistrer(entree)` : doublon / hors plage ; `trous(appareilId, jour, genre, plage)`                   |
| `AttributionPlages` (**AM-161**)                            | `plageDe(appareil)` : la plage attribuée (par défaut : celle du rang, `plageGuichet` / `plageConvoyeur`) |

AM-161 branche sa numérotation en remplaçant `ControleNumeros` et `AttributionPlages` dans le module :
`RejeuService` n'a pas à changer. `ControleNumeros.trous` est prêt pour l'alerte « numéro manquant » en
fin de journée.

## Tables PostgreSQL à créer (hors périmètre : `apps/api/prisma/**`)

- `appareil_sync` : `id`, `cle_publique` (jsonb), `genre`, `rang`, `nb_convoyeurs`, `plage_debut`,
  `plage_fin`, `gare_id`, `compagnie_id`, `derniere_sync_a`, `dernier_ordre`, `octroi` (jsonb), `retire`.
- `journal_evenement` : `seq` (identité), `id` (uuid, **unique**), `type`, `at`, `appareil_id`,
  `auteur_id`, `cible_type`, `cible_id`, `numero_plage`, `donnees` (jsonb), `recu_a`, `ordre_appareil`,
  `origine`. Ajout seul : pas d'`UPDATE`, pas de `DELETE`.
- `siege_operation` : `(depart_id, siege, evenement_id)` unique, `billet_id`, `kind`, `at`, `appareil_id`,
  `auteur_id` ; `siege_billet` : `billet_id` → `(depart_id, siege)`.
- `siege_conflit` : `evenement_id` (clé), `billet_id`, `depart_id`, `siege`, `gagnant_billet_id`,
  `appareil_id`, `auteur_id`, `detecte_a`.
- `alerte_sync` : `id`, `type`, `gravite`, `cree_a`, `appareil_id`, `auteur_id`, `evenement_id`,
  `gare_id`, `compagnie_id`, `details` (jsonb), `resolue_a`.
- `numero_vu` (AM-161) : `(appareil_id, jour, genre, numero_plage)` unique → `evenement_id`.

L'index unique sur `journal_evenement.id` est ce qui rend la réception idempotente quand deux requêtes
du même lot se croisent : `ajouter` doit répondre `null` sur conflit, comme la version en mémoire.

## À faire pour brancher le module (hors périmètre)

- importer `SyncModule` dans `AppModule` (`apps/api/src/socle/app.module.ts`) ;
- écrire les adaptateurs PostgreSQL et la migration ;
- créer l'administration des appareils (`AppareilsSync.declarer` : AM-093, AM-120) ;
- si les lots grossissent : le corps JSON est plafonné par Express (100 ko par défaut) ; le moteur
  réduit son lot de moitié sur un 413, mais `configurerApp` peut relever la limite pour cette route.

## Tests

`pnpm --filter @afrimove/api run test` : `parite.test.ts` (règles recopiées = règles sources, signature
appareil → serveur), `protocole.test.ts`, `sieges.test.ts`, `sync.e2e.test.ts` (HTTP, rôles, idempotence,
rejets partiels, conflits, déblocage, alertes), `sync.integration.test.ts` (3 appareils réels, 4 h hors
ligne, puis synchronisation sans doublon ni trou ; réponse perdue ; siège vendu deux fois ; blocage 12 h
puis déblocage par un superviseur). Le montage de test est `testing/app-sync-test.ts` (il importe
`SyncModule` à côté de `AppModule`, sans toucher au socle de test).

# Mode kiosque et effacement à distance (AM-172)

Les téléphones de guichet sont des Android gérés (Android Enterprise) qui n'ouvrent qu'une chose : Chrome, en plein écran, sur l'application. Ils doivent pouvoir être **effacés à distance en moins de 10 minutes**. Les sauvegardes sont dans `infra/sauvegardes/README.md`.

Deux protections, qui se complètent :

| Niveau             | Qui agit                                                                | Ce que ça efface                                                                                                                                              | Délai                                                                           | Dépend de                                                                     |
| ------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **1. Appareil**    | Gestion des appareils Android Enterprise (commande de l'administrateur) | Tout le téléphone (retour aux réglages d'usine)                                                                                                               | Secondes à quelques minutes si l'appareil est en ligne ; à sa reconnexion sinon | Un compte Android Enterprise, le service de notification de Google, le réseau |
| **2. Application** | Ce dossier (`SurveillantKiosque`)                                       | Les données de l'application : stockage local, base hors ligne (événements non synchronisés, clé de signature de l'appareil), caches, service worker, cookies | Au plus 30 s après l'ordre, application ouverte et en ligne                     | Un serveur qui émet l'ordre (**à écrire**, voir plus bas)                     |

Le niveau 1 est la garantie du ticket. Le niveau 2 agit sans service tiers et laisse l'écran « Appareil effacé » verrouillé.

## Politique de l'appareil (niveau 1)

`android-enterprise/politique-guichet.json` est une ressource `Policy` de l'API Android Management. Elle fait de Chrome l'application kiosque (`installType: KIOSK`, tâche verrouillée, lanceur personnalisé), coupe la navigation système, la barre d'état et les réglages, interdit la réinitialisation par l'utilisateur, le mode sans échec, le débogage, l'USB, l'ajout de compte, l'installation et la désinstallation d'applications, les captures d'écran, et limite Chrome à `https://app.afrimove.exemple.org` (application) et `https://api.afrimove.exemple.org` (API). L'adresse de démarrage porte `?kiosque=1` : l'application s'en sert pour savoir qu'elle tourne en kiosque.

À faire avant de l'appliquer : remplacer les deux adresses `exemple.org` par les vraies (`DEV_WEB_URL` et `DEV_API_URL` en dev) ; décider du Bluetooth et de l'appareil photo (laissés actifs : imprimante de tickets, lecture de codes) ; l'importer : `PATCH https://androidmanagement.googleapis.com/v1/enterprises/<entreprise>/policies/guichet-kiosque`.

### Effacer un appareil (le critère « testé sur un appareil »)

Console Android Management ou API : `DELETE https://androidmanagement.googleapis.com/v1/enterprises/<entreprise>/devices/<appareil>` (avec `wipeDataFlags` et `wipeReasonMessage` si besoin). L'appareil est remis aux réglages d'usine ; il disparaît de la liste. Pour retirer seulement le contrôle de l'entreprise sans effacer, c'est une autre commande : ne pas confondre.

**Protocole de test (à faire sur un vrai téléphone, avant la mise en production)** :

1. Enrôler un téléphone de test avec la politique, vérifier : pas de barre de navigation, pas de réglages, Chrome en plein écran sur l'accueil du guichet, impossible d'ouvrir un autre site.
2. Ouvrir l'application, se connecter, enregistrer une vente hors ligne (donnée locale à effacer).
3. Lancer le chronomètre, émettre la commande d'effacement. Arrêter le chronomètre quand le téléphone redémarre sur l'assistant de configuration.
4. Noter : durée (**objectif < 10 min**), appareil en ligne, réseau (Wi-Fi ou mobile), puis recommencer avec l'appareil hors ligne puis remis en ligne (la durée part de la reconnexion).

| Date        | Appareil / Android | Réseau | Durée de l'effacement | < 10 min ? | Données locales effacées ? | Fait par |
| ----------- | ------------------ | ------ | --------------------- | ---------- | -------------------------- | -------- |
| _à remplir_ |                    |        |                       |            |                            |          |

## Code de l'application (niveau 2)

À placer **autour** de l'application, au-dessus du moteur de synchronisation (non fait ici : `app.tsx` et les layouts sont hors périmètre) :

```tsx
import { FournisseurKiosque, creerCanalHttp } from "@/kiosque";

const canal = creerCanalHttp({ urlBase: "/api", entetes: () => entetesAppareil() });

<FournisseurKiosque
  appareilId={appareilId}
  canal={canal}
  avantEffacement={synchroniser}
  delaiAvantEffacementMs={15_000}
>
  <App />
</FournisseurKiosque>;
```

- Il consulte le serveur toutes les 30 s (et tout de suite au démarrage), ne lève jamais d'erreur hors ligne.
- Un ordre `effacer` : l'écran « Appareil effacé » remplace l'application (elle est démontée, donc la base hors ligne est fermée), les données sont effacées, **la langue et le drapeau kiosque sont conservés**, un repère `afrimove.kiosque.efface` reste, et l'accusé de réception part au serveur.
- Le repère est écrit **avant** l'effacement : si l'application est tuée en route, l'effacement est terminé au démarrage suivant, avant que l'application ne s'ouvre. Un repère abîmé verrouille l'appareil au lieu de le rendre.
- Un appareil effacé reste verrouillé tant que `leverVerrouEffacement()` n'est pas appelé : c'est le futur parcours de remise en service par un superviseur (à écrire).
- Un effacement incomplet (une étape a échoué) est dit au serveur (`complet: false`), repris une fois, et l'écran demande de ne plus utiliser l'appareil.
- `avantEffacement` est une dernière chance facultative (par exemple lancer une synchronisation), bornée par `delaiAvantEffacementMs` (0 par défaut : rien). Sans elle, les ventes hors ligne non synchronisées sont **perdues** : voir « Décisions ».
- `detecterModeKiosque()` : `?kiosque=1` (mémorisé), sinon mémorisé, sinon `display-mode: fullscreen`. En mode kiosque, `appliquerVerrouKiosque()` bloque le menu contextuel et redemande le plein écran au toucher ; ce n'est qu'un confort, la vraie contrainte est la politique.

### Routes que le serveur devra offrir (n'existent pas, absentes de `@afrimove/contrats`)

| Route                                                    | Rôle                                                                                                                                                                                                                                               |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /appareils/:id/commande`                            | `200 { commande: { id, type: "effacer", emiseA, secretAcquittement } \| null }` ou `204`. Authentifiée par l'appareil (en-têtes fournis par `entetes`).                                                                                            |
| `POST /appareils/:id/commandes/:commandeId/acquittement` | Corps : `{ effaceA, complet, etapes[] }`. Authentifiée par `Authorization: Bearer <secretAcquittement>` (secret à usage unique donné avec l'ordre : après l'effacement l'appareil n'a plus ni session ni clé). Idempotente (`409`/`410` acceptés). |

Côté serveur il faut aussi : une action « effacer cet appareil » réservée à un administrateur, qui crée l'ordre, et une trace dans le journal d'audit ; `appareil` existe déjà dans le schéma Prisma (`apps/api/prisma/schema.prisma`) mais sans état « effacé » ni table d'ordres (par exemple `commande_appareil` : `id`, `appareil_id`, `type`, `emise_a`, `emise_par`, `secret_acquittement_haché`, `acquittee_a`, `rapport` jsonb). Hors périmètre de ce ticket (`apps/api` n'y figure pas) : à ouvrir en ticket.

## Ce qui est vérifié, ce qui ne l'est pas

Vérifié par les tests Vitest (`pnpm --filter @afrimove/web test`, 73 tests dans ce dossier) : toutes les étapes d'effacement et leurs échecs ; le déroulé complet d'un ordre (langue conservée, repère écrit avant l'effacement, accusé, reprise après redémarrage, effacement interrompu, incomplet, délai d'attente borné de la dernière chance) ; l'adaptateur HTTP (URL, en-têtes, secret, statuts) ; la validation des ordres ; l'écran de verrouillage (rien n'est monté sur un appareil effacé, pas d'alerte pendant l'effacement) ; la détection du mode et le verrou ; la cohérence du fichier de politique avec le code.

**Non vérifié (demande un appareil et des comptes réels)** : tout le niveau 1 — la politique Android Enterprise n'a pas été appliquée à un téléphone et ses noms de champs n'ont pas été validés contre l'API (à faire à l'import) ; le comportement de Chrome en kiosque (plein écran, blocage des URL, `display-mode`) ; la durée de l'effacement à distance de l'appareil (critère « testé sur un appareil » du ticket : protocole ci-dessus) ; le comportement réel d'IndexedDB (jsdom n'en a pas : les tests utilisent un faux) ; l'effacement face à une base Dexie ouverte dans Chrome ; l'absence totale de serveur pour le niveau 2.

## Décisions à confirmer

- **Ventes hors ligne non synchronisées** : sur un ordre d'effacement elles disparaissent (c'est le but sur un appareil volé). Faut-il tenter une synchronisation avant (`avantEffacement`, 15 s par exemple) ? Par défaut non.
- **Appareil hors ligne pendant des jours** : aucun effacement automatique par absence de contact (les guichets ruraux peuvent rester hors ligne longtemps ; le moteur de synchronisation bloque déjà les ventes après 12 h).
- **Bluetooth et appareil photo** laissés actifs dans la politique (imprimante, lecture de codes).
- **Textes inventés** (absents des maquettes) : voir `textes.ts`.

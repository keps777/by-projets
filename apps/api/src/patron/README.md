# Espace du patron : tableau du jour, gares, équipe, réglages, salle de contrôle (écart A1 de la recette)

Module Nest `PatronModule` : les 20 routes `/patron/*` que l'application du patron appelait et que l'API ne
servait pas (404 au procès-verbal de la recette, écart A1). Les noms d'opérations sont ceux de
`packages/api-client/src/patron/operations.ts`, les formes celles de `@afrimove/contrats` (`patron.*`, aucun
changement de contrat).

Principe : **rien de nouveau comme source de chiffres**. Les lectures agrègent par leurs ports les modules qui
existent déjà ; seules les données qui n'avaient aucune table (réglages d'une ligne, d'une personne, règles de
l'agence, comptes mobile money par opérateur) en ont une, créée par les migrations du lot Da.

## Routes

Toutes sont réservées au rôle `patron` (`@Roles("patron")`, 401 sans jeton, 403 pour un autre rôle) et ne
sortent jamais de la compagnie du jeton (un identifiant d'une autre compagnie donne 404).

| Méthode et chemin                                     | Opération (client)                       | Lit ou écrit                                                                                      |
| ----------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `GET /patron/aujourdhui`                              | `patron.aujourdhui.tableau`              | Billets, colis, recette, litiges, caisses, départs, remplissage du jour ; comparaison à la veille |
| `GET /patron/alertes`                                 | `patron.aujourdhui.alertes`              | Alertes de la caisse et de la supervision (48 h), comptes bloqués, bus arrêtés, pannes            |
| `GET /patron/gares`                                   | `patron.gares.lister`                    | Une carte par gare (chiffres du jour, équipe, appareils)                                          |
| `GET /patron/gares/{id}`                              | `patron.gares.detail`                    | Une gare : guichets, quais, départs, journal signé                                                |
| `GET /patron/equipe`                                  | `patron.equipe.lister`                   | L'équipe active, filtres `role`, `recherche`, `gareId`                                            |
| `GET /patron/personnes/{id}`                          | `patron.personnes.fiche`                 | Fiche d'une personne : activité sur 90 jours, écarts de caisse                                    |
| `GET /patron/controle`                                | `patron.controle.salle`                  | Salle de contrôle : bus en route, arrêts, pannes, propositions de l'assistant, colis en transit   |
| `GET /patron/reglages`                                | `patron.reglages.accueil`                | Lignes, effectifs, règles en résumé                                                               |
| `GET /patron/reglages/lignes/{id}`                    | `patron.reglages.ligne`                  | Une ligne éditable (tarifs, arrêts, départs, plan, options, brouillon)                            |
| `PUT /patron/reglages/lignes/{id}`                    | `patron.reglages.ligne.modifier`         | `ligne`, `arret`, `ligne_horaire`, `ligne_reglage` (signé par PIN)                                |
| `POST /patron/reglages/lignes`                        | `patron.reglages.ligne.creer`            | Nouvelle ligne entre deux gares (201, signé)                                                      |
| `GET /patron/reglages/personnes/{id}`                 | `patron.reglages.personne`               | Une personne éditable                                                                             |
| `PUT /patron/reglages/personnes/{id}`                 | `patron.reglages.personne.modifier`      | `personne`, `personne_reglage` (signé)                                                            |
| `POST /patron/reglages/personnes`                     | `patron.reglages.personne.creer`         | Compte, réglages, PIN provisoire par SMS (201, signé)                                             |
| `POST /patron/reglages/personnes/{id}/desactivation`  | `patron.reglages.personne.desactiver`    | Désactive le compte, coupe ses jetons (signé)                                                     |
| `POST /patron/reglages/personnes/{id}/pin-provisoire` | `patron.reglages.personne.pinProvisoire` | Nouveau PIN provisoire par SMS (signé)                                                            |
| `GET /patron/reglages/regles`                         | `patron.reglages.regles`                 | Règles de l'agence                                                                                |
| `PUT /patron/reglages/regles`                         | `patron.reglages.regles.enregistrer`     | `regles_compagnie` et `compagnie.toleranceEcartCaisse` d'un seul tenant (signé)                   |
| `POST /patron/reglages/comptes-momo/confirmation`     | `patron.reglages.compteMomo.confirmer`   | Envoie un code SMS sur l'ancien numéro (`confirmation_compte_momo`) (signé)                       |
| `PUT /patron/reglages/comptes-momo`                   | `patron.reglages.compteMomo.changer`     | Change le compte (`compte_momo_agence`) avec le code (signé)                                      |

## Écritures : signature, trace, aucun secret

Chaque écriture suit le même chemin : `lireSignature` (401 `PIN_REQUIS`), validation stricte du corps (422
`COMMANDE_INVALIDE`, champ inconnu refusé), `VerificateurSignature` (403 `PIN_INCORRECT`, 423 `PIN_BLOQUE`
après 3 essais, 409 `PIN_NON_DEFINI`, 422 `SIGNATURE_PERIMEE`, 401 `COMPTE_INACTIF`), application, puis ligne
du journal d'audit (réussite **et** refus). Le journal masque les clés `pin*`, `code*`, `telephone`, `numero` :
les détails n'écrivent jamais un PIN, un code SMS ni un numéro en clair. Les réponses n'en contiennent pas non
plus (numéros masqués `6 77 •• •• 02`).

## Ports (`ports.ts`) et adaptateurs

| Port                 | Mémoire (`memoire.ts`)      | PostgreSQL (`postgres.ts`) | Lit                                                                                                    |
| -------------------- | --------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------ |
| `ReferentielPatron`  | `ReferentielPatronMemoire`  | `ReferentielPatronPrisma`  | `compagnie`, `gare`, `guichet`, `appareil_sync`, `bus`                                                 |
| `ExploitationPatron` | `ExploitationPatronMemoire` | `ExploitationPatronPrisma` | `depart`, positions et pannes, `assistant_proposition`, colis en correspondance, journal               |
| `AlertesEcrites`     | `AlertesEcritesMemoire`     | `AlertesEcritesPrisma`     | `alerte_patron` (écrite par la caisse et la supervision)                                               |
| `EquipePatron`       | `EquipePatronMemoire`       | `EquipePatronPrisma`       | `personne`, `personne_reglage`, billets et colis par auteur, sessions de caisse                        |
| `LignesPatron`       | `LignesPatronMemoire`       | `LignesPatronPrisma`       | `ligne`, `arret`, `ligne_horaire`, `ligne_reglage` (verrou de ligne `FOR UPDATE`)                      |
| `ReglesPatron`       | `ReglesPatronMemoire`       | `ReglesPatronPrisma`       | `regles_compagnie`, `compagnie.toleranceEcartCaisse`, `compte_momo_agence`, `confirmation_compte_momo` |

Les chiffres du jour (`jour.service.ts`, `FaitsDuJourService`) viennent des ports du rapport du soir
(`VentesBillets`, `ActiviteColis`, `CaissesDuJour`, `DepartsDuJour`, exportés par `RapportModule`), de la caisse
(`SessionsCaisse`, `CaisseService.vue`), de la supervision (`SourceGare`, `DemandesAnnulation`, `PinsEquipe`) et
de l'assistant (`AssistantService.insights`). Un tableau du jour est donc égal, au franc près, au rapport du soir.
Une source en panne donne un 503 net, jamais un chiffre inventé.

`PatronModule.avec({ imports: [rapport] })` est monté par `AppModule` (comme les autres modules qui lisent le
rapport). `VerificationPatron` **refuse de démarrer en production** tant qu'un des six ports est en mémoire.

## Tables (migrations `20261018001000_lot_da_reglages_patron` et `20261018001010_lot_da_garanties`)

`ligne_reglage` (plan de sièges, options, brouillon daté), `ligne_horaire` (départs récurrents),
`personne_reglage` (opérateur, salaire, jour de paie, droits), `regles_compagnie`, `compte_momo_agence` (un
compte par opérateur, ancien numéro gardé jusqu'à minuit), `confirmation_compte_momo` (code haché, 3 essais).
Additives : aucune table existante n'est modifiée. Les garde-fous SQL (clés étrangères en cascade, formats
d'heure et de disposition, valeurs permises, bornes) reprennent ceux des contrats.

## Variable d'environnement

`PATRON_BALAYAGE_MS` (300000 par défaut, 0 en test ou pour désactiver) : fréquence à laquelle
`PlanificateurLignes` met en vigueur les modifications de ligne « dès lundi » dont le jour est venu. Sans lui,
la modification est aussi appliquée à la prochaine lecture de la ligne (balayage paresseux).

## Règles provisoires à confirmer (métier)

Valeurs choisies faute de spécification ; elles sont toutes dans `calculs.ts` et `reglages.service.ts`.

- Règles par défaut d'une agence sans règle enregistrée : annulation gratuite jusqu'à 1 h avant, retenue selon
  la classe (25 % classique, 50 % VIP), tolérance de caisse 1 000 F (celle de la caisse), au-delà : PIN du
  superviseur et du patron, numéro de téléphone non obligatoire, frais de service 250 F non pris en charge.
- Bornes : tolérance d'écart au plus 50 000 F, frais de service au plus 5 000 F, programmation d'une
  modification de ligne au plus 90 jours à l'avance.
- Une modification « dès lundi » reste en brouillon (`brouillon.modifications` = nombre de sections changées).
- La liste des départs d'une ligne **remplace** son horaire récurrent (`ligne_horaire`). Deux départs de même
  heure et de même classe sur des jours qui se recouvrent : 422 `DEPART_EN_DOUBLE`. Ce ne sont pas des départs
  datés (`depart`) : leur création reste hors de ce lot.
- Plan de sièges cohérent si |capacité − rangées × sièges par rangée| ≤ sièges par rangée.
- Ligne neuve : 100 km par tronçon, plan 2+2, code = codes des deux gares concaténés (`DLAYDE`), 409
  `LIGNE_EXISTANTE` si le couple de gares a déjà une ligne.
- Nouvelle personne : PIN provisoire valable 1 h envoyé par SMS ; si le SMS échoue, le compte reste créé et la
  réponse dit `pinProvisoireEnvoye: false` ; superviseur et comptable n'ont pas de mot de passe initial
  (parcours de première connexion non spécifié) ; guichet « 1 » à « 9 » seulement (pas de « nuit »), gare
  obligatoire pour un guichetier ou un superviseur.
- Une caisse ouverte empêche de changer l'affectation de son guichetier (409 `PERSONNE_EN_SERVICE`). La
  désactivation est immédiate et n'est pas bloquée par une caisse ouverte. On ne se désactive pas soi-même
  (403 `AUTO_DESACTIVATION`).
- Compte mobile money : code à 6 chiffres valable 10 minutes, 3 essais, une demande par minute (429), envoyé sur
  l'ancien numéro (sur le téléphone du patron pour un premier réglage) ; l'ancien compte reste valable jusqu'à
  minuit à Douala.
- Lectures : alertes sur 48 h, appareil « synchronisé » si annoncé depuis moins de 15 min, fiche d'une personne
  sur 90 jours, courbe d'écarts sur 10 jours, colis et litiges attribués par l'auteur de l'historique du colis.

## Textes inventés à relire

SMS du PIN provisoire (« AfriMove : votre PIN provisoire est … Il est valable 1 h. »), SMS du code mobile money
(« AfriMove : code … pour changer le compte … Valable 10 minutes. »), alerte « bloqué après 3 PIN faux »,
messages d'erreur des écritures, libellés « Modification programmée », « Pas encore de vente aujourd'hui. »,
phrases de lecture des écarts de caisse et des ventes par heure.

## Limites connues

- Seule la **tolérance d'écart de caisse** est consommée par un autre module (la caisse la lit dans
  `compagnie.toleranceEcartCaisse`). Les règles d'annulation, de frais de service et de cadence sont **enregistrées
  et relues** mais ni la billetterie ni les annulations ne les lisent encore : aucun port de lecture n'est branché.
- `compte_momo_agence` n'est pas lu par les paiements (ils gardent leurs comptes de reversement) ;
  `compte_momo_compagnie` des inter-agences n'est pas utilisé (autre contexte de chiffrement, mono-opérateur).
- Aucune route ne permet au patron de définir **son propre PIN de signature** : sur une base neuve, ses écritures
  répondent 409 `PIN_NON_DEFINI` tant qu'un PIN n'est pas posé (le seed de développement n'en pose pas au patron).
- `GET /patron/direct` (canal temps réel du client) n'est pas servi.
- La création des départs datés, des bus et des appareils n'est pas dans ce lot.

## Tests

- `calculs.test.ts`, `validation.test.ts` (les lecteurs stricts s'accordent avec les schémas des contrats),
  `patron.module.test.ts` (configuration, garde de production, balayage) : toujours.
- `patron.e2e.test.ts` : l'API entière en mémoire, accès par rôle, formes (schémas des contrats), chiffres,
  cloisonnement, signature PIN, chaque écriture et son audit.
- `postgres.integration.test.ts` : l'API entière sur PostgreSQL (`DATABASE_URL_TEST`, base finissant par `_test`),
  tables du lot, garde-fous SQL, la caisse lit la nouvelle tolérance, compte désactivé, courses simultanées.
- Recette : `tests/recette/scenarios/critere-1-journee.test.ts` (écrans du patron sur la vraie pile).

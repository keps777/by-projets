import { Body, Controller, Get, HttpCode, Post, Query } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { SchemaObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import { Roles, UtilisateurCourant, Vente, type Utilisateur } from "../socle/auth/decorateurs";
import { corps, ou400 } from "../billetterie/http";
import { lireIdOptionnel, type Requete } from "../billetterie/requetes";
import { ChauffeurService } from "./chauffeur.service";
import { ControleService } from "./controle.service";
import { ConvoyeurService } from "./convoyeur.service";
import {
  lireChauffeurArrivee,
  lireChauffeurDepense,
  lireChauffeurIncident,
  lireChauffeurRetard,
  lireControleCloture,
  lireControleConvoyeurSignale,
  lireControleRegularise,
  lireControleSiegeVerifie,
  lireRouteBilletVendu,
  lireRouteScanne,
} from "./schemas";

const CORPS_EVENEMENT: SchemaObject = {
  type: "object",
  required: ["id", "type", "at", "appareilId", "auteurId", "cible", "numeroPlage", "donnees"],
};

const ERREURS = "Refus métier : `{ code, message, details }`";

/**
 * Le bord : convoyeur, chauffeur, contrôleur. Chemins et noms d'opérations de
 * `packages/api-client/src/agence/operations.ts` :
 *
 * | Opération                     | Route                                  |
 * | ----------------------------- | -------------------------------------- |
 * | `agence.bus.convoyeur`        | `GET  /agence/bus/convoyeur`           |
 * | `agence.bus.chauffeur`        | `GET  /agence/bus/chauffeur`           |
 * | `agence.route.billet_vendu`   | `POST /agence/bus/ventes`              |
 * | `agence.route.scanne`         | `POST /agence/bus/scans`               |
 * | `agence.chauffeur.depense`    | `POST /agence/bus/depenses`            |
 * | `agence.chauffeur.incident`   | `POST /agence/bus/incidents`           |
 * | `agence.chauffeur.retard`     | `POST /agence/bus/retards`             |
 * | `agence.chauffeur.arrivee_arret` | `POST /agence/bus/arrivees`         |
 * | `agence.controle.inopine`     | `GET  /agence/controle/inopine`        |
 * | `agence.controle.siege_verifie` | `POST /agence/controle/sieges`       |
 * | `agence.controle.regularise`  | `POST /agence/controle/regularisations` |
 * | `agence.controle.convoyeur_signale` | `POST /agence/controle/signalements` |
 * | `agence.controle.cloture`     | `POST /agence/controle/clotures`       |
 *
 * (`POST /agence/bus/dechargements` est servie par le module colis.) Les écritures sont des événements
 * envoyés tels quels ; l'identifiant d'événement est la clé d'idempotence : un événement rejoué renvoie la
 * même réponse avec `accuse.statut = "deja_recu"` et ne refait rien.
 */
@ApiTags("Bord : convoyeur, chauffeur, contrôle")
@Controller("agence")
export class BordController {
  constructor(
    private readonly convoyeur: ConvoyeurService,
    private readonly chauffeur: ChauffeurService,
    private readonly controle: ControleService,
  ) {}

  /* ------------------------------------------------------------------ convoyeur */

  @Roles("convoyeur")
  @Get("bus/convoyeur")
  @ApiOperation({
    summary: "Feuille du convoyeur : scans, places libres, ventes en route, colis à décharger",
    description:
      "`departId` (facultatif) choisit le départ ; sinon le bus en route du convoyeur, puis l'embarquement en cours.",
  })
  @ApiResponse({ status: 403, description: `AUTRE_EQUIPAGE. ${ERREURS}` })
  @ApiResponse({ status: 404, description: `AUCUN_DEPART, DEPART_INCONNU. ${ERREURS}` })
  @ApiResponse({ status: 409, description: `EQUIPAGE_INCOMPLET. ${ERREURS}` })
  etatConvoyeur(@Query() requete: Requete, @UtilisateurCourant() u: Utilisateur) {
    return this.convoyeur.etat(
      u,
      ou400(() => lireIdOptionnel(requete, "departId")),
    );
  }

  @Vente("convoyeur")
  @Post("bus/ventes")
  @HttpCode(200)
  @ApiOperation({
    summary: "`route.billet_vendu` : une place vendue en route, numérotée dans la plage 3001–3999",
  })
  @ApiBody({ schema: CORPS_EVENEMENT })
  @ApiResponse({ status: 409, description: `SIEGE_PRIS, DEPART_HORS_ROUTE. ${ERREURS}` })
  @ApiResponse({
    status: 422,
    description: `PAIEMENT_INVALIDE, PRIX_INCOHERENT, NUMERO_HORS_PLAGE, ARRET_INCONNU. ${ERREURS}`,
  })
  vendre(@Body() brut: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.convoyeur.vendre(u, corps(lireRouteBilletVendu, brut));
  }

  @Roles("convoyeur")
  @Post("bus/scans")
  @HttpCode(200)
  @ApiOperation({
    summary: "`route.scanne` : un voyageur monte à un arrêt, le convoyeur scanne son QR",
    description:
      "Le QR est vérifié par sa signature. Un billet déjà à bord est reconnu sans rien changer ; un billet " +
      "inconnu, annulé ou d'un autre départ est refusé.",
  })
  @ApiBody({ schema: CORPS_EVENEMENT })
  @ApiResponse({ status: 404, description: `BILLET_INCONNU. ${ERREURS}` })
  @ApiResponse({ status: 409, description: `AUTRE_DEPART, BILLET_ANNULE. ${ERREURS}` })
  scanner(@Body() brut: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.convoyeur.scanner(u, corps(lireRouteScanne, brut));
  }

  /* ------------------------------------------------------------------ chauffeur */

  @Roles("chauffeur")
  @Get("bus/chauffeur")
  @ApiOperation({
    summary: "Feuille de route du chauffeur : trajet, dépenses, incidents, semaine",
    description:
      "`departId` (facultatif) choisit le départ ; sinon le bus en route du chauffeur, puis l'embarquement en cours.",
  })
  @ApiResponse({ status: 403, description: `AUTRE_EQUIPAGE. ${ERREURS}` })
  @ApiResponse({ status: 404, description: `AUCUN_DEPART, DEPART_INCONNU. ${ERREURS}` })
  @ApiResponse({ status: 409, description: `EQUIPAGE_INCOMPLET. ${ERREURS}` })
  feuilleChauffeur(@Query() requete: Requete, @UtilisateurCourant() u: Utilisateur) {
    return this.chauffeur.feuille(
      u,
      ou400(() => lireIdOptionnel(requete, "departId")),
    );
  }

  @Roles("chauffeur")
  @Post("bus/depenses")
  @HttpCode(200)
  @ApiOperation({ summary: "`chauffeur.depense` : une dépense du trajet avec son justificatif" })
  @ApiBody({ schema: CORPS_EVENEMENT })
  depense(@Body() brut: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.chauffeur.depense(u, corps(lireChauffeurDepense, brut));
  }

  @Roles("chauffeur")
  @Post("bus/incidents")
  @HttpCode(200)
  @ApiOperation({
    summary: "`chauffeur.incident` : en une touche, la gare et les voyageurs sont prévenus",
  })
  @ApiBody({ schema: CORPS_EVENEMENT })
  incident(@Body() brut: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.chauffeur.incident(u, corps(lireChauffeurIncident, brut));
  }

  @Roles("chauffeur")
  @Post("bus/retards")
  @HttpCode(200)
  @ApiOperation({
    summary: "`chauffeur.retard` : un SMS automatique part à tous les voyageurs à bord",
  })
  @ApiBody({ schema: CORPS_EVENEMENT })
  retard(@Body() brut: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.chauffeur.retard(u, corps(lireChauffeurRetard, brut));
  }

  @Roles("chauffeur")
  @Post("bus/arrivees")
  @HttpCode(200)
  @ApiOperation({
    summary: "`chauffeur.arrivee_arret` : le bus est arrivé à un arrêt, les portes s'ouvrent",
  })
  @ApiBody({ schema: CORPS_EVENEMENT })
  arrivee(@Body() brut: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.chauffeur.arrivee(u, corps(lireChauffeurArrivee, brut));
  }

  /* ------------------------------------------------------------------ contrôle inopiné */

  @Roles("controleur")
  @Get("controle/inopine")
  @ApiOperation({
    summary: "Le contrôle inopiné à bord : comptes, plan des sièges, voyageur sans billet",
    description:
      "Sans `controleId`, le contrôle ouvert du contrôleur ; s'il n'en a pas, un contrôle s'ouvre sur le " +
      "bus en route (`departId` choisit le bus). `controleId` relit un contrôle précis, clos compris.",
  })
  @ApiResponse({ status: 404, description: `AUCUN_DEPART, CONTROLE_INCONNU. ${ERREURS}` })
  inopine(@Query() requete: Requete, @UtilisateurCourant() u: Utilisateur) {
    return this.controle.lire(
      u,
      ou400(() => lireIdOptionnel(requete, "controleId")),
      ou400(() => lireIdOptionnel(requete, "departId")),
    );
  }

  @Roles("controleur")
  @Post("controle/sieges")
  @HttpCode(200)
  @ApiOperation({ summary: "`controle.siege_verifie` : le constat d'un siège" })
  @ApiBody({ schema: CORPS_EVENEMENT })
  @ApiResponse({ status: 409, description: `CONTROLE_CLOS. ${ERREURS}` })
  siege(@Body() brut: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.controle.siegeVerifie(u, corps(lireControleSiegeVerifie, brut));
  }

  @Roles("controleur")
  @Post("controle/regularisations")
  @HttpCode(200)
  @ApiOperation({
    summary: "`controle.regularise` : un voyageur sans billet est régularisé, un billet est vendu",
  })
  @ApiBody({ schema: CORPS_EVENEMENT })
  @ApiResponse({ status: 409, description: `SIEGE_PRIS, CONTROLE_CLOS. ${ERREURS}` })
  regulariser(@Body() brut: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.controle.regulariser(u, corps(lireControleRegularise, brut));
  }

  @Roles("controleur")
  @Post("controle/signalements")
  @HttpCode(200)
  @ApiOperation({
    summary:
      "`controle.convoyeur_signale` : une vente en route que le convoyeur n'a pas enregistrée",
  })
  @ApiBody({ schema: CORPS_EVENEMENT })
  signaler(@Body() brut: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.controle.signaler(u, corps(lireControleConvoyeurSignale, brut));
  }

  @Roles("controleur")
  @Post("controle/clotures")
  @HttpCode(200)
  @ApiOperation({
    summary: "`controle.cloture` : les comptes sont figés, le constat part au patron",
  })
  @ApiBody({ schema: CORPS_EVENEMENT })
  @ApiResponse({ status: 409, description: `CONTROLE_CLOS. ${ERREURS}` })
  cloturer(@Body() brut: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.controle.cloturer(u, corps(lireControleCloture, brut));
  }
}

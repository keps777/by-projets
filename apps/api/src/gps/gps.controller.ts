import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Roles, UtilisateurCourant, type Utilisateur } from "../socle/auth/decorateurs";
import { ControleBusService } from "./controle.service";
import { SuiviLivraisonService } from "./livraison.service";
import { MonteeService } from "./montee.service";
import { lireDemandeMontee, lireLotPositions, lirePrevenirProche } from "./schemas";
import { SuiviBusService } from "./suivi.service";
import { corps, ou400 } from "./validation";

type Requete = Record<string, unknown>;

/**
 * Réception des positions : le téléphone du chauffeur ou du convoyeur (bus) et celui du livreur
 * envoient leur position toutes les 30 s, par lots quand le réseau manque.
 */
@ApiTags("Suivi GPS : appareils")
@Controller("gps")
export class PositionsController {
  constructor(
    private readonly bus: SuiviBusService,
    private readonly livraisons: SuiviLivraisonService,
  ) {}

  @Roles("chauffeur", "convoyeur")
  @Post("bus/:departId/positions")
  @HttpCode(200)
  @ApiOperation({
    summary: "Envoyer les positions du bus (toutes les 30 s)",
    description:
      "Corps : `{ positions: [{ instant, latitude, longitude, precisionM?, vitesseKmh? }] }` " +
      "(1 à 100). Réservé à l'équipage du départ. Un lot renvoyé ne change rien. Réponse : " +
      "`{ acceptees, doublons, rejetees: [{ rang, motif }], serveurA }`.",
  })
  @ApiBody({ schema: { type: "object", required: ["positions"] } })
  @ApiResponse({ status: 409, description: "DEPART_NON_EN_ROUTE" })
  positionsBus(
    @Param("departId") departId: string,
    @Body() brut: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ) {
    return this.bus.enregistrerPositions(u, departId, corps(lireLotPositions, brut).positions);
  }

  @Roles("chauffeur", "convoyeur", "superviseur", "patron")
  @Get("bus/:departId")
  @ApiOperation({
    summary: "État du bus : dernière position, vitesse, prochain arrêt, retard, alerte",
    description:
      "Pour l'équipage du départ, le superviseur et le patron de la compagnie. Alimente " +
      "`gps`, `vitesse` et `prochain arrêt` de la feuille de route du chauffeur.",
  })
  etatBus(@Param("departId") departId: string, @UtilisateurCourant() u: Utilisateur) {
    return this.bus.etatDuBus(u, departId);
  }

  @Roles("livreur")
  @Post("livraisons/:colisId/positions")
  @HttpCode(200)
  @ApiOperation({
    summary: "Envoyer la position du livreur pendant la livraison",
    description: "Même corps et même réponse que pour le bus. Réservé au livreur de la mission.",
  })
  @ApiBody({ schema: { type: "object", required: ["positions"] } })
  positionsLivreur(
    @Param("colisId") colisId: string,
    @Body() brut: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ) {
    return this.livraisons.enregistrerPositions(
      u,
      colisId,
      corps(lireLotPositions, brut).positions,
    );
  }
}

/**
 * Côté voyageur : « Mon bus en direct » (le canal temps réel est
 * `WS /voyageur/billets/:billetId/direct/position`), prévenir un proche, monter en route. Les
 * chemins sont ceux du client d'API (`packages/api-client/src/voyageur/operationsServices.ts`).
 */
@ApiTags("Suivi GPS : voyageur")
@Controller("voyageur")
export class VoyageurGpsController {
  constructor(
    private readonly bus: SuiviBusService,
    private readonly montee: MonteeService,
  ) {}

  @Roles("voyageur")
  @Get("billets/:billetId/direct")
  @ApiOperation({ summary: "Mon bus en direct : arrivée estimée, retard, étapes" })
  @ApiResponse({ status: 404, description: "BILLET_INCONNU (ou billet d'un autre voyageur)" })
  suivi(@Param("billetId") billetId: string, @UtilisateurCourant() u: Utilisateur) {
    return this.bus.suivi(u, billetId);
  }

  @Roles("voyageur")
  @Put("billets/:billetId/prevenir")
  @HttpCode(200)
  @ApiOperation({
    summary: "Prévenir un proche par SMS avant l'arrivée",
    description:
      "Corps : `{ procheId, minutesAvantArrivee? }` (15 par défaut, 1 à 120). Le SMS part " +
      "quand l'arrivée estimée est dans ce délai ; un seul SMS par billet et par proche.",
  })
  @ApiBody({ schema: { type: "object", required: ["procheId"] } })
  prevenir(
    @Param("billetId") billetId: string,
    @Body() brut: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ) {
    const { procheId, minutesAvantArrivee } = corps(lirePrevenirProche, brut);
    return this.bus.prevenir(u, billetId, procheId, minutesAvantArrivee);
  }

  @Roles("voyageur")
  @Delete("billets/:billetId/prevenir/:procheId")
  @ApiOperation({ summary: "Ne plus prévenir ce proche (tant que le SMS n'est pas parti)" })
  nePlusPrevenir(
    @Param("billetId") billetId: string,
    @Param("procheId") procheId: string,
    @UtilisateurCourant() u: Utilisateur,
  ) {
    return this.bus.nePlusPrevenir(u, billetId, procheId);
  }

  @Roles("voyageur")
  @Get("monter-en-route")
  @ApiOperation({
    summary: "Monter en route : les bus qui passent à l'arrêt, avec places libres et prix",
    description: "Paramètres : `arretId`, ou `lat` et `lng` (position GPS du voyageur).",
  })
  offresMontee(@Query() requete: Requete) {
    return this.montee.offresMontee(ou400(() => lireDemandeMontee(requete)));
  }
}

/** Salle de contrôle : les bus de la compagnie sur la carte (`WS …/bus/direct` pour le direct). */
@ApiTags("Suivi GPS : salle de contrôle")
@Controller("patron/controle")
export class ControleGpsController {
  constructor(private readonly controle: ControleBusService) {}

  @Roles("patron", "superviseur")
  @Get("bus")
  @ApiOperation({
    summary: "Bus en route de la compagnie, dernière position, alertes d'arrêt anormal",
    description:
      "Réponse : `{ instant, busEnRoute, bus[], alerte, aTraiter[] }`. `alerte` et `aTraiter` " +
      "ont la forme de la salle de contrôle (`carte.alerte`, `aTraiter`).",
  })
  carte(@UtilisateurCourant() u: Utilisateur) {
    return this.controle.carte(this.controle.compagnieDe(u));
  }
}

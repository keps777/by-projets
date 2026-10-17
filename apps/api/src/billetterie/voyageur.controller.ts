import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Roles, UtilisateurCourant, type Utilisateur } from "../socle/auth/decorateurs";
import { BilletsService } from "./billets.service";
import { CommandesService } from "./commandes.service";
import { DepartsService } from "./departs.service";
import { corps, ou400 } from "./http";
import {
  lireDemandeDevis,
  lireOptionsFiltres,
  lirePrixPartiel,
  lireRechercheDeparts,
  lireSiege,
  type Requete,
} from "./requetes";
import {
  lireAnnulerBillet,
  lireCreerCommande,
  lireDefinirPreferee,
  lireEnregistrerFiltres,
  lireReporterBillet,
} from "./schemas";
import { billetVoyageur } from "./vues";

/**
 * Billetterie côté voyageur : recherche multi-compagnies, plan des sièges, blocage de 15 minutes,
 * devis et commande, billet nominatif, annulation et report. Les chemins sont ceux du client d'API
 * (`packages/api-client/src/voyageur/operations.ts`) ; chaque réponse suit un schéma de
 * `@afrimove/contrats` (`voyageur`).
 */
@ApiTags("Billetterie : voyageur")
@Controller("voyageur")
export class VoyageurController {
  constructor(
    private readonly departs: DepartsService,
    private readonly commandes: CommandesService,
    private readonly billets: BilletsService,
  ) {}

  /* ------------------------------------------------------------------ recherche */

  @Roles("voyageur")
  @Get("departs")
  @ApiOperation({
    summary: "Départs d'un trajet, toutes compagnies, avec filtres",
    description:
      "Paramètres : `depart`, `arrivee` (codes de ville), `jour` (AAAA-MM-JJ, aujourd'hui par " +
      "défaut), `classe`, `compagnies` (liste séparée par des virgules), `preferees`, `covoit`, " +
      "`matin`, `coteACote`, `prixMax`. Sans filtre dans l'URL, les filtres mémorisés servent.",
  })
  @ApiResponse({ status: 404, description: "Ville inconnue" })
  rechercher(@Query() requete: Requete, @UtilisateurCourant() u: Utilisateur) {
    return this.departs.rechercher(
      u.id,
      ou400(() => lireRechercheDeparts(requete)),
    );
  }

  @Roles("voyageur")
  @Get("departs/filtres")
  @ApiOperation({ summary: "Écran des filtres : compagnies du trajet, classes, options" })
  optionsFiltres(@Query() requete: Requete, @UtilisateurCourant() u: Utilisateur) {
    return this.departs.optionsFiltres(
      u.id,
      ou400(() => lireOptionsFiltres(requete)),
    );
  }

  @Roles("voyageur")
  @Put("departs/filtres")
  @HttpCode(200)
  @ApiOperation({ summary: "Mémoriser les filtres d'un trajet" })
  @ApiBody({ schema: { type: "object", required: ["depart", "arrivee", "filtres"] } })
  enregistrerFiltres(@Body() brut: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.departs.enregistrerFiltres(u.id, corps(lireEnregistrerFiltres, brut));
  }

  @Roles("voyageur")
  @Put("compagnies/:compagnieId/preferee")
  @HttpCode(200)
  @ApiOperation({ summary: "Marquer ou démarquer une compagnie préférée" })
  @ApiBody({ schema: { type: "object", required: ["preferee"] } })
  definirPreferee(
    @Param("compagnieId") compagnieId: string,
    @Body() brut: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ) {
    const { preferee } = corps(lireDefinirPreferee, brut);
    return this.departs.definirPreferee(u.id, compagnieId, preferee);
  }

  /* ------------------------------------------------------------------ un départ et ses sièges */

  @Roles("voyageur")
  @Get("departs/:departId")
  @ApiOperation({ summary: "Détail d'un départ" })
  detail(@Param("departId") departId: string) {
    return this.departs.detail(departId);
  }

  @Roles("voyageur")
  @Get("departs/:departId/prix")
  @ApiOperation({
    summary: "Prix d'un trajet partiel (montée en route), au prorata des kilomètres",
    description: "Paramètres : `depuis` et `vers` (identifiants d'arrêts de la ligne).",
  })
  prixPartiel(@Param("departId") departId: string, @Query() requete: Requete) {
    const { depuis, vers } = ou400(() => lirePrixPartiel(requete));
    return this.departs.prixPartiel(departId, depuis, vers);
  }

  @Roles("voyageur")
  @Get("departs/:departId/sieges")
  @ApiOperation({ summary: "Plan des sièges en temps réel (instantané)" })
  plan(@Param("departId") departId: string, @UtilisateurCourant() u: Utilisateur) {
    return this.departs.plan(departId, u.id);
  }

  @Roles("voyageur")
  @Post("departs/:departId/sieges/:siege/blocage")
  @HttpCode(200)
  @ApiOperation({
    summary: "Bloquer un siège 15 minutes",
    description:
      "Un siège pris par un autre voyageur renvoie 409 `SIEGE_PRIS`. Choisir un autre siège libère le précédent.",
  })
  @ApiResponse({ status: 409, description: "SIEGE_PRIS" })
  bloquer(
    @Param("departId") departId: string,
    @Param("siege") siege: string,
    @UtilisateurCourant() u: Utilisateur,
  ) {
    return this.departs.bloquerSiege(
      departId,
      ou400(() => lireSiege(siege)),
      u.id,
    );
  }

  /* ------------------------------------------------------------------ devis et commande */

  @Roles("voyageur")
  @Get("commandes/devis")
  @ApiOperation({ summary: "Devis : billet + frais de service de 250 F, code promotionnel" })
  devis(@Query() requete: Requete) {
    return this.commandes.devis(ou400(() => lireDemandeDevis(requete)));
  }

  @Roles("voyageur")
  @Post("commandes")
  @HttpCode(201)
  @ApiOperation({
    summary: "Créer une commande : les sièges sont retenus 15 minutes en attendant le paiement",
  })
  @ApiBody({ schema: { type: "object", required: ["departId", "sieges", "pour"] } })
  creerCommande(@Body() brut: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.commandes.creer(u, corps(lireCreerCommande, brut));
  }

  @Roles("voyageur")
  @Get("commandes/:commandeId")
  @ApiOperation({ summary: "Une commande du voyageur (expirée si le délai est passé)" })
  commande(@Param("commandeId") commandeId: string, @UtilisateurCourant() u: Utilisateur) {
    return this.commandes.obtenir(commandeId, u.id);
  }

  /* ------------------------------------------------------------------ billet */

  @Roles("voyageur")
  @Get("billets/:billetId")
  @ApiOperation({ summary: "Mon billet : QR signé, code à 4 chiffres, état" })
  billet(@Param("billetId") billetId: string, @UtilisateurCourant() u: Utilisateur) {
    return this.billets.vueVoyageur(billetId, u.id);
  }

  @Roles("voyageur")
  @Get("billets/:billetId/annulation")
  @ApiOperation({ summary: "Ce que rapporterait l'annulation (retenue, remboursement)" })
  apercuAnnulation(@Param("billetId") billetId: string, @UtilisateurCourant() u: Utilisateur) {
    return this.billets.apercuAnnulation(billetId, u.id);
  }

  @Roles("voyageur")
  @Post("billets/:billetId/annulation")
  @HttpCode(200)
  @ApiOperation({
    summary: "Annuler mon billet",
    description:
      "Gratuit jusqu'à 60 minutes avant le départ, avec retenue ensuite. Refusé après l'embarquement.",
  })
  @ApiBody({ schema: { type: "object", properties: { motif: { type: "string" } } } })
  annuler(
    @Param("billetId") billetId: string,
    @Body() brut: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ) {
    const { motif } = corps(lireAnnulerBillet, brut ?? {});
    return this.billets.annulerParVoyageur(billetId, u.id, motif);
  }

  @Roles("voyageur")
  @Post("billets/:billetId/report")
  @HttpCode(200)
  @ApiOperation({ summary: "Reporter mon billet sur un autre départ de la même ligne, sans frais" })
  @ApiBody({ schema: { type: "object", required: ["departCibleId"] } })
  async reporter(
    @Param("billetId") billetId: string,
    @Body() brut: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ) {
    const { departCibleId } = corps(lireReporterBillet, brut);
    const { ancien, nouveau, dc } = await this.billets.reporter(billetId, departCibleId, u.id);
    return {
      ancienBilletId: ancien.id,
      billet: billetVoyageur(nouveau, await this.billets.passager(nouveau), dc),
    };
  }
}

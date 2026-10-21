import { Body, Controller, Get, Header, HttpCode, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Roles, UtilisateurCourant, type Utilisateur } from "../socle/auth/decorateurs";
import { AppareilsService } from "./appareils.service";
import type { AppareilReponse, DeclarationReponse, EffacementReponse } from "./appareils.service";
import { BusService } from "./bus.service";
import { invalide, lireCommande } from "./commande";
import { DepartsService, type DepartReponse, type GenerationReponse } from "./departs.service";
import { LignesService, type LigneCatalogue } from "./lignes.service";
import type { BusAdmin, GareAdmin } from "./modeles";
import { jourValide } from "./regles";
import { changerEquipage, creerBus, creerDepart, genererDeparts, modifierBus } from "./schemas";

/**
 * Administration de l'agence (AM-093, AM-120) : lignes (lecture), bus, départs, équipages, appareils.
 *
 * Le patron voit toute son agence ; le superviseur, les lignes, départs et appareils de sa gare. Les écritures
 * sur les appareils sont signées par le PIN (corps `{ …, signature }` des contrats patron). Les réglages d'une ligne
 * (création, horaires, tarifs, arrêts) sont dictés par le client du patron : `/patron/reglages/lignes`
 * (`LignesPatronController`).
 */
@ApiTags("Administration")
@Controller("admin")
@Roles("patron", "superviseur")
export class AdministrationController {
  constructor(
    private readonly lignes: LignesService,
    private readonly bus: BusService,
    private readonly departs: DepartsService,
    private readonly appareils: AppareilsService,
  ) {}

  /* ------------------------------------------------------------------ gares et lignes */

  @Get("gares")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary: "Les gares de l'agence (identifiants pour créer une ligne ou déclarer un appareil)",
  })
  gares(@UtilisateurCourant() u: Utilisateur): Promise<GareAdmin[]> {
    return this.lignes.gares(u);
  }

  @Get("lignes")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary: "Les lignes de l'agence (un superviseur : celles qui partent de sa gare)",
    description: "Le détail éditable d'une ligne est `GET /patron/reglages/lignes/:ligneId`.",
  })
  catalogue(@UtilisateurCourant() u: Utilisateur): Promise<LigneCatalogue[]> {
    return this.lignes.catalogue(u);
  }

  /* ------------------------------------------------------------------ bus */

  @Get("bus")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Les bus de l'agence" })
  listerBus(@UtilisateurCourant() u: Utilisateur): Promise<BusAdmin[]> {
    return this.bus.lister(u);
  }

  @Roles("patron")
  @Post("bus")
  @ApiOperation({ summary: "Patron : ajouter un bus à l'agence" })
  @ApiResponse({ status: 201, description: "Le bus créé" })
  @ApiResponse({ status: 409, description: "Immatriculation déjà connue (`BUS_EXISTANT`)" })
  creerBus(@Body() corps: unknown, @UtilisateurCourant() u: Utilisateur): Promise<BusAdmin> {
    return this.bus.creer(u, lireCommande(creerBus, corps));
  }

  @Roles("patron")
  @Patch("bus/:id")
  @ApiOperation({ summary: "Patron : modifier la fiche d'un bus" })
  @ApiResponse({ status: 404, description: "Bus inconnu (`BUS_INCONNU`)" })
  @ApiResponse({
    status: 409,
    description: "Immatriculation prise, ou places changées alors que des départs sont à venir",
  })
  modifierBus(
    @Param("id") id: string,
    @Body() corps: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<BusAdmin> {
    return this.bus.modifier(u, id, lireCommande(modifierBus, corps));
  }

  /* ------------------------------------------------------------------ départs */

  @Get("departs")
  @Header("Cache-Control", "no-store")
  @ApiOperation({ summary: "Les départs d'un jour (aujourd'hui par défaut) avec leur équipage" })
  listerDeparts(
    @UtilisateurCourant() u: Utilisateur,
    @Query("jour") jour?: string,
    @Query("ligneId") ligneId?: string,
  ): Promise<DepartReponse[]> {
    if (jour !== undefined && (typeof jour !== "string" || !jourValide(jour))) {
      throw invalide("JOUR_INVALIDE", "Le jour s'écrit AAAA-MM-JJ et doit exister");
    }
    return this.departs.lister(u, {
      ...(jour !== undefined ? { jour } : {}),
      ...(typeof ligneId === "string" && ligneId !== "" ? { ligneId } : {}),
    });
  }

  @Post("departs")
  @ApiOperation({ summary: "Créer un départ à l'unité" })
  @ApiResponse({ status: 201, description: "Le départ créé" })
  @ApiResponse({
    status: 409,
    description: "Départ existant, bus ou personnel déjà pris par un départ qui chevauche",
  })
  @ApiResponse({ status: 422, description: "Heure passée, équipage incompatible" })
  creerDepart(
    @Body() corps: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<DepartReponse> {
    return this.departs.creer(u, lireCommande(creerDepart, corps));
  }

  @Post("departs/generer")
  @HttpCode(200)
  @ApiOperation({
    summary: "Générer les départs d'une période d'après les horaires des lignes",
    description:
      "Pour chaque jour de `du` à `au` et chaque horaire actif (jours de circulation compris), crée le départ s'il " +
      "n'existe pas. Rejouable : un départ déjà créé est compté dans `dejaPresents`, pas dupliqué.",
  })
  genererDeparts(
    @Body() corps: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<GenerationReponse> {
    return this.departs.generer(u, lireCommande(genererDeparts, corps));
  }

  @Patch("departs/:id/equipage")
  @ApiOperation({
    summary: "Affecter ou changer le bus, le chauffeur, le convoyeur et le quai d'un départ",
  })
  @ApiResponse({
    status: 409,
    description: "Départ clos, billets vendus, ou ressource déjà prise (`RESSOURCE_OCCUPEE`)",
  })
  equiper(
    @Param("id") id: string,
    @Body() corps: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<DepartReponse> {
    return this.departs.equiper(u, id, lireCommande(changerEquipage, corps));
  }

  /* ------------------------------------------------------------------ appareils */

  @Get("appareils")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary:
      "Les appareils de l'agence (un superviseur : ceux de sa gare), avec leur dernier ordre",
  })
  listerAppareils(@UtilisateurCourant() u: Utilisateur): Promise<AppareilReponse[]> {
    return this.appareils.lister(u);
  }

  @Post("appareils")
  @ApiOperation({
    summary:
      "Déclarer un appareil (fiche de synchronisation, rang, plage) et obtenir son code d'enrôlement",
    description:
      "Corps signé par le PIN. Le code d'enrôlement (`XXXXX-XXXXX`) n'est montré qu'une fois et vaut 24 heures : " +
      "le téléphone l'échange contre son secret par `POST /appareils/enrolement`.",
  })
  @ApiResponse({ status: 201, description: "`{ appareil, codeEnrolement, codeExpireA }`" })
  @ApiResponse({ status: 409, description: "Rang déjà pris dans la gare (`RANG_PRIS`)" })
  declarer(
    @Body() corps: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<DeclarationReponse> {
    return this.appareils.declarer(u, corps);
  }

  @Post("appareils/:id/code")
  @ApiOperation({ summary: "Nouveau code d'enrôlement (téléphone de secours)" })
  @ApiResponse({ status: 201, description: "`{ appareil, codeEnrolement, codeExpireA }`" })
  nouveauCode(
    @Param("id") id: string,
    @Body() corps: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<DeclarationReponse> {
    return this.appareils.nouveauCode(u, id, corps);
  }

  @Post("appareils/:id/retrait")
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Retirer un appareil du service (plus de code, plus de secret, synchronisation refusée)",
  })
  retirer(
    @Param("id") id: string,
    @Body() corps: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<AppareilReponse> {
    return this.appareils.retirer(u, id, corps);
  }

  @Post("appareils/:id/effacement")
  @ApiOperation({
    summary: "Effacer à distance les données de l'application d'un appareil (niveau 2 du kiosque)",
    description:
      "Corps `{ motif?, signature }`. L'appareil lit l'ordre à sa prochaine consultation (30 s), efface ses données " +
      "locales et envoie son accusé ; son secret est alors révoqué. Les ventes hors ligne non synchronisées sont perdues.",
  })
  @ApiResponse({ status: 201, description: "`{ commandeId, appareilId, emiseA }`" })
  @ApiResponse({ status: 409, description: "Appareil non enrôlé, ou effacement déjà en attente" })
  effacer(
    @Param("id") id: string,
    @Body() corps: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<EffacementReponse> {
    return this.appareils.effacer(u, id, corps);
  }
}

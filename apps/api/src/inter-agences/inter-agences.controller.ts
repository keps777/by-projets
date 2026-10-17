import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { lireSignature } from "../modules/commande";
import { Roles, UtilisateurCourant, type Utilisateur } from "../socle/auth/decorateurs";
import { BilletsService } from "./billets.service";
import { ROLES_TERRAIN, compagnieDe } from "./commun";
import { ConventionsService } from "./conventions.service";
import { EchangesService } from "./echanges.service";
import { ReglementsService } from "./reglements.service";
import {
  lireArrivee,
  lireContestation,
  lireEmbarquement,
  lireEnregistrementBillet,
  lireEnregistrementColis,
  lireInvitation,
  lirePropositionConvention,
  lireResolution,
  lireScanTransfert,
} from "./validation";
import { VuesService } from "./vues.service";

/**
 * Entre compagnies (planches « InterAgences » et « InterAgencesConvention »). Les noms d'opérations et les
 * schémas de réponse sont ceux de `packages/api-client/src/colis/operations.ts` : `inter-agences.lire`,
 * `inter-agences.reglement`, `inter-agences.contester`, `inter-agences.scanner-transfert`,
 * `inter-agences.convention`, `inter-agences.inviter`. Les autres routes (proposer et signer une convention,
 * enregistrer un colis ou un billet en correspondance, embarquement, arrivée du premier bus, décision sur une
 * contestation) sont **ajoutées** : voir le README.
 *
 * Toute route est limitée à la compagnie du compte connecté : une convention, un colis ou un billet d'une
 * autre paire de compagnies répond « inconnu ».
 */
@ApiTags("Inter-agences")
@Controller("inter-agences")
export class InterAgencesController {
  constructor(
    private readonly conventions: ConventionsService,
    private readonly echanges: EchangesService,
    private readonly billets: BilletsService,
    private readonly reglements: ReglementsService,
    private readonly vues: VuesService,
  ) {}

  /* ---------------------------------------------------------------- contrat colis */

  @Roles("patron", "comptable")
  @Get()
  @ApiOperation({
    summary: "Patron : colis en correspondance, conventions et correspondance des voyageurs",
  })
  lire(@UtilisateurCourant() u: Utilisateur) {
    return this.vues.interAgences(u);
  }

  @Roles("patron", "comptable")
  @Get("reglement")
  @ApiOperation({ summary: "Patron : le règlement de la semaine (solde net réglé lundi 08:00)" })
  reglement(@UtilisateurCourant() u: Utilisateur) {
    return this.vues.reglementHebdo(u);
  }

  @Roles("patron")
  @Post("reglement/contestations")
  @ApiOperation({
    summary: "Patron : contester le relevé de la semaine, jusqu'au dimanche 20:00",
    description:
      "Les colis ou billets désignés (tout le relevé sans `colisIds`) sortent du règlement du lundi jusqu'à " +
      "la décision d'AfriMove. Après le dimanche 20:00 la réponse porte `recevable: false`.",
  })
  async contester(@UtilisateurCourant() u: Utilisateur, @Body() corps: unknown) {
    return this.vues.contestation(await this.reglements.contester(u, lireContestation(corps)));
  }

  @Roles(...ROLES_TERRAIN)
  @Post("transferts")
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Convoyeur : scanner « remis à » (cédant) ou « reçu » (preneur) à la gare de correspondance",
    description:
      "La responsabilité reste au cédant jusqu'au scan « reçu », puis passe au preneur. Rejouer un scan " +
      "ne change rien.",
  })
  async transfert(@UtilisateurCourant() u: Utilisateur, @Body() corps: unknown) {
    return this.vues.transfert(await this.echanges.scanner(u, lireScanTransfert(corps)));
  }

  @Roles("patron", "comptable")
  @Get("conventions/:conventionId")
  @ApiOperation({
    summary: "Patron : la convention entre deux compagnies, parts, règles, signatures",
  })
  convention(@UtilisateurCourant() u: Utilisateur, @Param("conventionId") conventionId: string) {
    return this.vues.convention(u, conventionId);
  }

  @Roles("patron")
  @Post("invitations")
  @ApiOperation({ summary: "Patron : inviter une compagnie (SMS à son patron)" })
  inviter(@UtilisateurCourant() u: Utilisateur, @Body() corps: unknown) {
    return this.conventions.inviter(u, lireInvitation(corps));
  }

  /* ---------------------------------------------------------------- conventions (ajoutées) */

  @Roles("patron")
  @Get("propositions")
  @ApiOperation({ summary: "Patron : les conventions proposées, en attente de signature" })
  async propositions(@UtilisateurCourant() u: Utilisateur) {
    const liste = await this.conventions.propositions(u);
    return { propositions: await Promise.all(liste.map((c) => this.vues.proposition(c))) };
  }

  @Roles("patron")
  @Post("conventions")
  @ApiOperation({
    summary: "Patron : proposer une convention à une autre compagnie (signée par votre PIN)",
  })
  async proposer(@UtilisateurCourant() u: Utilisateur, @Body() corps: unknown) {
    const convention = await this.conventions.proposer(
      u,
      lirePropositionConvention(corps),
      lireSignature(corps),
    );
    return this.vues.proposition(convention);
  }

  @Roles("patron")
  @Post("conventions/:conventionId/signatures")
  @HttpCode(200)
  @ApiOperation({
    summary: "Patron : signer avec votre PIN la convention proposée par l'autre compagnie",
  })
  async signer(
    @UtilisateurCourant() u: Utilisateur,
    @Param("conventionId") conventionId: string,
    @Body() corps: unknown,
  ) {
    await this.conventions.signer(u, conventionId, lireSignature(corps));
    return this.vues.convention(u, conventionId);
  }

  @Roles("patron")
  @Post("conventions/:conventionId/denonciation")
  @HttpCode(200)
  @ApiOperation({
    summary:
      "Patron : quitter la convention (préavis de 30 jours, les colis en route vont au bout)",
  })
  async denoncer(
    @UtilisateurCourant() u: Utilisateur,
    @Param("conventionId") conventionId: string,
    @Body() corps: unknown,
  ) {
    await this.conventions.denoncer(u, conventionId, lireSignature(corps));
    return this.vues.convention(u, conventionId);
  }

  @Roles("patron", "comptable")
  @Get("correspondances")
  @ApiOperation({
    summary: "Patron : les trajets voyageurs en correspondance des conventions en vigueur",
  })
  correspondances(@UtilisateurCourant() u: Utilisateur) {
    return this.vues.correspondances(u);
  }

  /* ---------------------------------------------------------------- colis (ajoutées) */

  @Roles("guichetier", "superviseur", "patron")
  @Post("colis")
  @ApiOperation({
    summary: "Guichet : enregistrer un colis en correspondance (un seul numéro, deux tronçons)",
  })
  async enregistrerColis(@UtilisateurCourant() u: Utilisateur, @Body() corps: unknown) {
    const plan = await this.echanges.enregistrer(u, lireEnregistrementColis(corps));
    return this.vues.plan(u, plan.colisId);
  }

  @Roles("patron", "comptable", "superviseur", ...ROLES_TERRAIN)
  @Get("colis/:colisId")
  @ApiOperation({ summary: "Un colis en correspondance : tronçons, parts et responsable actuel" })
  colis(@UtilisateurCourant() u: Utilisateur, @Param("colisId") colisId: string) {
    return this.vues.plan(u, colisId);
  }

  /* ---------------------------------------------------------------- billets (ajoutées) */

  @Roles("guichetier", "superviseur", "patron")
  @Post("billets")
  @ApiOperation({
    summary: "Guichet : équiper un billet vendu d'un second tronçon (correspondance)",
  })
  async enregistrerBillet(@UtilisateurCourant() u: Utilisateur, @Body() corps: unknown) {
    return this.vues.billet(await this.billets.enregistrer(u, lireEnregistrementBillet(corps)));
  }

  @Roles("patron", "comptable", ...ROLES_TERRAIN)
  @Get("billets")
  @ApiOperation({ summary: "Les billets en correspondance où votre compagnie a un tronçon" })
  async billetsListe(@UtilisateurCourant() u: Utilisateur) {
    const billets = await this.billets.liste(compagnieDe(u));
    return { billets: await Promise.all(billets.map((b) => this.vues.billet(b))) };
  }

  @Roles("patron", "comptable", ...ROLES_TERRAIN)
  @Get("billets/:reference")
  @ApiOperation({ summary: "Un billet en correspondance, par identifiant ou numéro" })
  async billet(@UtilisateurCourant() u: Utilisateur, @Param("reference") reference: string) {
    return this.vues.billet(await this.billets.lire(u, reference));
  }

  @Roles(...ROLES_TERRAIN)
  @Post("billets/:reference/embarquements")
  @HttpCode(200)
  @ApiOperation({
    summary: "Convoyeur : le voyageur monte dans le bus du tronçon (rend la part due)",
  })
  async embarquer(
    @UtilisateurCourant() u: Utilisateur,
    @Param("reference") reference: string,
    @Body() corps: unknown,
  ) {
    return this.vues.billet(
      await this.billets.embarquer(u, reference, lireEmbarquement(corps).rang),
    );
  }

  @Roles(...ROLES_TERRAIN)
  @Post("billets/:reference/arrivee-premier-bus")
  @HttpCode(200)
  @ApiOperation({
    summary: "Gare de correspondance : constater l'arrivée du premier bus (attente ou replacement)",
    description:
      "À l'heure ou en retard dans l'attente du second bus : le voyageur continue. Au-delà, replacement " +
      "gratuit sur le départ suivant, à la charge du retardataire.",
  })
  async arrivee(
    @UtilisateurCourant() u: Utilisateur,
    @Param("reference") reference: string,
    @Body() corps: unknown,
  ) {
    const { billet, issue } = await this.billets.constaterArrivee(
      u,
      reference,
      lireArrivee(corps).arriveeLe,
    );
    return { issue, billet: await this.vues.billet(billet) };
  }

  /* ---------------------------------------------------------------- AfriMove (ajoutée) */

  @Roles("afrimove")
  @Post("contestations/:reference/resolution")
  @HttpCode(200)
  @ApiOperation({
    summary:
      "AfriMove : trancher une contestation (accordée : écartée du règlement ; rejetée : réglée)",
  })
  async resoudre(
    @UtilisateurCourant() u: Utilisateur,
    @Param("reference") reference: string,
    @Body() corps: unknown,
  ) {
    const c = await this.reglements.resoudre(u, reference, lireResolution(corps).issue);
    return { reference: c.reference, statut: c.statut, resolueLe: c.resolueLe };
  }
}

/**
 * La planche « Entre compagnies » du patron (`patron.interAgences.vue`). Le contrat patron ne montre qu'une
 * compagnie partenaire : `?conventionId=` choisit laquelle, sinon la première convention en vigueur.
 */
@ApiTags("Inter-agences")
@Controller("patron/inter-agences")
export class PatronInterAgencesController {
  constructor(private readonly vues: VuesService) {}

  @Roles("patron", "comptable")
  @Get()
  @ApiOperation({
    summary: "Patron : « Entre compagnies » (colis, règlement, correspondance, conventions)",
  })
  vue(@UtilisateurCourant() u: Utilisateur, @Query("conventionId") conventionId?: string) {
    return this.vues.vuePatron(
      u,
      conventionId && conventionId.length > 0 ? conventionId : undefined,
    );
  }

  /** `patron.interAgences.convention` : le même contrat que `/inter-agences/conventions/:conventionId` (un seul contrat). */
  @Roles("patron", "comptable")
  @Get("conventions/:conventionId")
  @ApiOperation({ summary: "Patron : la convention (même contrat que /inter-agences/conventions)" })
  convention(@UtilisateurCourant() u: Utilisateur, @Param("conventionId") conventionId: string) {
    return this.vues.convention(u, conventionId);
  }
}

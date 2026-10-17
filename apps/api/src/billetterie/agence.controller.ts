import { Body, Controller, Get, HttpCode, Post, Query } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { SchemaObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import { Roles, UtilisateurCourant, Vente, type Utilisateur } from "../socle/auth/decorateurs";
import { AgenceService } from "./agence.service";
import { corps, ou400 } from "./http";
import { lireIdOptionnel, type Requete } from "./requetes";
import {
  lireBilletComplete,
  lireBilletVendu,
  lireBilletVenduCadence,
  lireQuaiCodeSaisi,
  lireQuaiLibere,
  lireQuaiListeEnvoyee,
  lireQuaiScanne,
  lireTelephoneAjoute,
} from "./schemas";

const CORPS_EVENEMENT: SchemaObject = {
  type: "object",
  required: ["id", "type", "at", "appareilId", "auteurId", "cible", "numeroPlage", "donnees"],
};

const ERREURS = "Refus métier : `{ code, message, details }`";

/**
 * Billetterie côté agence : vente au guichet, scan et embarquement au quai. Les écritures sont des
 * événements (`packages/contrats/src/agence/evenements.ts`) envoyés tels quels ; l'identifiant
 * d'événement est la clé d'idempotence : un événement rejoué renvoie la même réponse avec
 * `accuse.statut = "deja_recu"` et ne refait rien.
 */
@ApiTags("Billetterie : agence")
@Controller("agence")
export class AgenceController {
  constructor(private readonly agence: AgenceService) {}

  /* ------------------------------------------------------------------ lectures */

  @Vente("guichetier")
  @Get("vente/contexte")
  @ApiOperation({
    summary: "Écran de vente : départs ouverts, siège proposé, prochain numéro, tarifs",
  })
  venteContexte(@Query() requete: Requete, @UtilisateurCourant() u: Utilisateur) {
    return this.agence.venteContexte(
      u,
      ou400(() => lireIdOptionnel(requete, "guichetId")),
    );
  }

  @Roles("guichetier", "superviseur", "patron")
  @Get("quai/embarquement")
  @ApiOperation({ summary: "Écran du quai : scan, embarqués, soute, absents" })
  @ApiResponse({
    status: 409,
    description: "EQUIPAGE_INCOMPLET : bus, chauffeur, convoyeur ou quai manquant",
  })
  quai(@Query() requete: Requete, @UtilisateurCourant() u: Utilisateur) {
    return this.agence.quai(
      u,
      ou400(() => lireIdOptionnel(requete, "departId")),
    );
  }

  /* ------------------------------------------------------------------ vente */

  @Vente("guichetier")
  @Post("billets")
  @HttpCode(200)
  @ApiOperation({ summary: "`billet.vendu` : un billet nominatif vendu au guichet" })
  @ApiBody({ schema: CORPS_EVENEMENT })
  @ApiResponse({ status: 409, description: `SIEGE_PRIS. ${ERREURS}` })
  @ApiResponse({ status: 422, description: `PAIEMENT_INVALIDE, PRIX_INCOHERENT. ${ERREURS}` })
  vendre(@Body() brut: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.agence.vendre(u, corps(lireBilletVendu, brut));
  }

  @Vente("guichetier")
  @Post("cadence/billets")
  @HttpCode(200)
  @ApiOperation({
    summary: "`billet.vendu_cadence` : vente rapide, nom et pièce complétés au quai",
  })
  @ApiBody({ schema: CORPS_EVENEMENT })
  vendreCadence(@Body() brut: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.agence.vendreCadence(u, corps(lireBilletVenduCadence, brut));
  }

  @Vente("guichetier", "convoyeur", "vendeur")
  @Post("billets/telephone")
  @HttpCode(200)
  @ApiOperation({ summary: "`billet.telephone_ajoute` : numéro d'un billet déjà vendu (SMS)" })
  @ApiBody({ schema: CORPS_EVENEMENT })
  ajouterTelephone(@Body() brut: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.agence.ajouterTelephone(u, corps(lireTelephoneAjoute, brut));
  }

  /* ------------------------------------------------------------------ quai */

  @Roles("guichetier", "superviseur")
  @Post("quai/scans")
  @HttpCode(200)
  @ApiOperation({
    summary: "`quai.scanne` : scan du QR d'un voyageur",
    description:
      "Le QR est vérifié par sa signature. Un billet déjà embarqué donne `deja_scanne` : jamais deux embarquements.",
  })
  @ApiBody({ schema: CORPS_EVENEMENT })
  scanner(@Body() brut: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.agence.scanner(u, corps(lireQuaiScanne, brut));
  }

  @Roles("guichetier", "superviseur")
  @Post("quai/codes")
  @HttpCode(200)
  @ApiOperation({ summary: "`quai.code_saisi` : le voyageur dicte son code à 4 chiffres" })
  @ApiBody({ schema: CORPS_EVENEMENT })
  saisirCode(@Body() brut: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.agence.saisirCode(u, corps(lireQuaiCodeSaisi, brut));
  }

  @Roles("guichetier", "superviseur")
  @Post("quai/completions")
  @HttpCode(200)
  @ApiOperation({ summary: "`billet.complete` : nom et pièce d'un billet de cadence, au quai" })
  @ApiBody({ schema: CORPS_EVENEMENT })
  completer(@Body() brut: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.agence.completer(u, corps(lireBilletComplete, brut));
  }

  @Roles("guichetier", "superviseur")
  @Post("quai/liberations")
  @HttpCode(200)
  @ApiOperation({ summary: "`quai.libere` : le siège d'un absent revient à la vente" })
  @ApiBody({ schema: CORPS_EVENEMENT })
  liberer(@Body() brut: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.agence.libererSiege(u, corps(lireQuaiLibere, brut));
  }

  @Roles("guichetier", "superviseur")
  @Post("quai/listes")
  @HttpCode(200)
  @ApiOperation({ summary: "`quai.liste_envoyee` : la liste part au chauffeur, le bus part" })
  @ApiBody({ schema: CORPS_EVENEMENT })
  @ApiResponse({ status: 409, description: `EQUIPAGE_INCOMPLET. ${ERREURS}` })
  envoyerListe(@Body() brut: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.agence.envoyerListe(u, corps(lireQuaiListeEnvoyee, brut));
  }
}

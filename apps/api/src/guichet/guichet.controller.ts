import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { SchemaObject } from "@nestjs/swagger/dist/interfaces/open-api-spec.interface";
import { ou400 } from "../billetterie/http";
import { lireIdOptionnel, type Requete } from "../billetterie/requetes";
import { Roles, UtilisateurCourant, type Utilisateur } from "../socle/auth/decorateurs";
import { AccueilService } from "./accueil.service";
import { CadenceService } from "./cadence.service";
import { ImpressionsService } from "./impressions.service";

const CORPS_EVENEMENT: SchemaObject = {
  type: "object",
  required: ["id", "type", "at", "appareilId", "auteurId", "cible", "numeroPlage", "donnees"],
};

/**
 * Accueil du guichet, mode cadence et impressions, avec exactement les chemins et les noms d'opérations de
 * `packages/api-client/src/agence/operations.ts` :
 *
 * - `agence.guichet.accueil` → `GET /agence/guichet/accueil`
 * - `agence.cadence.etat` → `GET /agence/cadence`
 * - `agence.cadence.billet` → `GET /agence/cadence/billets/{billetId}`
 * - `agence.impression.etat` → `GET /agence/impression`
 * - `agence.impression.demandee` → `POST /agence/impressions`
 * - `agence.quai.cadence` → `GET /agence/quai/cadence`
 */
@ApiTags("Guichet : accueil, cadence, impressions")
@Controller("agence")
export class GuichetController {
  constructor(
    private readonly accueil: AccueilService,
    private readonly cadence: CadenceService,
    private readonly impressions: ImpressionsService,
  ) {}

  @Roles("guichetier")
  @Get("guichet/accueil")
  @ApiOperation({
    summary: "Accueil du guichet : SYNC, billets, colis, en caisse, quai, prochain départ",
    description:
      "Les compteurs sont ceux de la session de caisse en cours (sans caisse ouverte : ceux de la journée).",
  })
  @ApiResponse({
    status: 404,
    description: "GUICHET_INCONNU : aucun guichet n'est affecté au compte",
  })
  guichetAccueil(@UtilisateurCourant() u: Utilisateur) {
    return this.accueil.lire(u);
  }

  @Roles("guichetier")
  @Get("cadence")
  @ApiOperation({
    summary: "Mode cadence : le départ, le dernier billet, le prochain siège et prix",
  })
  @ApiResponse({
    status: 409,
    description: "AUCUN_DEPART : aucun départ ouvert avec des places libres",
  })
  cadenceEtat(@Query() requete: Requete, @UtilisateurCourant() u: Utilisateur) {
    return this.cadence.etat(
      u,
      ou400(() => lireIdOptionnel(requete, "departId")),
    );
  }

  @Roles("guichetier")
  @Get("cadence/billets/:billetId")
  @ApiOperation({
    summary: "Un billet vendu en cadence : le billet à imprimer et la suite de la vente",
  })
  @ApiResponse({
    status: 404,
    description: "BILLET_INCONNU : pas un billet de cadence de la compagnie",
  })
  cadenceBillet(@Param("billetId") billetId: string, @UtilisateurCourant() u: Utilisateur) {
    return this.cadence.billet(u, billetId);
  }

  @Roles("guichetier", "superviseur", "convoyeur", "vendeur")
  @Get("impression")
  @ApiOperation({
    summary: "État de l'imprimante",
    description:
      "L'état de l'imprimante est connu de l'appareil, pas du serveur : la réponse est « ok ».",
  })
  impressionEtat() {
    return this.impressions.etat();
  }

  @Roles("guichetier", "superviseur", "convoyeur", "vendeur")
  @Post("impressions")
  @HttpCode(200)
  @ApiOperation({
    summary:
      "`impression.demandee` : un billet, une étiquette de colis ou un ticket de caisse imprimé",
    description:
      "Une réimpression est un événement aussi. Idempotent par l'UUID de l'événement (`deja_recu`).",
  })
  @ApiBody({ schema: CORPS_EVENEMENT })
  @ApiResponse({
    status: 404,
    description: "DOCUMENT_INCONNU : le document est d'une autre compagnie",
  })
  imprimer(@Body() corps: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.impressions.demander(corps, u);
  }

  @Roles("guichetier", "superviseur")
  @Get("quai/cadence")
  @ApiOperation({
    summary: "Quai : le billet de cadence à compléter, l'embarquement, les billets sans nom",
  })
  @ApiResponse({
    status: 404,
    description: "AUCUN_BILLET_CADENCE : aucun billet sans nom scanné sur ce quai",
  })
  @ApiResponse({ status: 409, description: "EQUIPAGE_INCOMPLET : bus, convoyeur ou quai manquant" })
  quaiCadence(@Query() requete: Requete, @UtilisateurCourant() u: Utilisateur) {
    return this.cadence.quai(
      u,
      ou400(() => lireIdOptionnel(requete, "departId")),
    );
  }
}

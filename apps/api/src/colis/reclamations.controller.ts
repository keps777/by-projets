import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles, UtilisateurCourant, type Utilisateur } from "../socle/auth/decorateurs";
import { requeteInvalide } from "./erreurs";
import { ReclamationsService } from "./reclamations.service";
import { lireDecision } from "./validation";

/**
 * Traitement des réclamations de colis par la compagnie (patron, superviseur) ou par AfriMove.
 * Routes absentes des contrats : ils ne décrivent que l'ouverture de la réclamation par le voyageur.
 */
@ApiTags("Colis · réclamations")
@Controller("reclamations-colis")
export class ReclamationsController {
  constructor(private readonly reclamations: ReclamationsService) {}

  @Roles("patron", "superviseur", "afrimove")
  @Get()
  @ApiOperation({ summary: "Réclamations de colis de ma compagnie (AfriMove : toutes)" })
  lister(@UtilisateurCourant() u: Utilisateur, @Query("statut") statut?: string) {
    if (statut !== undefined && !["ouverte", "acceptee", "refusee"].includes(statut)) {
      throw requeteInvalide("Requête invalide", [{ chemin: "statut", message: "Statut inconnu" }]);
    }
    return this.reclamations.lister(u, statut as "ouverte" | "acceptee" | "refusee" | undefined);
  }

  @Roles("patron", "superviseur", "afrimove")
  @Post(":reference/decision")
  @HttpCode(200)
  @ApiOperation({
    summary: "Décider d'une réclamation et indemniser",
    description:
      "Perte prouvée par le suivi : valeur assurée (déclarée à l'assureur partenaire) ou 10 × le port. " +
      "Autre cas : geste commercial, montant à fournir, plafonné de la même façon.",
  })
  decider(
    @UtilisateurCourant() u: Utilisateur,
    @Param("reference") reference: string,
    @Body() corps: unknown,
  ) {
    return this.reclamations.decider(u, reference, lireDecision(corps));
  }
}

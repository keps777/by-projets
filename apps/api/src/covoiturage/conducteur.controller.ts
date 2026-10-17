import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles, UtilisateurCourant, type Utilisateur } from "../socle/auth/decorateurs";
import { ConducteurService } from "./conducteur.service";
import { DemandesService } from "./demandes.service";
import {
  corps,
  lireDeposerPiece,
  lireNote,
  lireNumeroVersement,
  lirePublierTrajet,
  lireProposition,
  lireTypePiece,
  lireVehicule,
  ou400,
  type Requete,
} from "./requetes";
import { ReservationsService } from "./reservations.service";
import { ReputationService } from "./reputation.service";
import { TrajetsService } from "./trajets.service";
import { VerificationService } from "./verification.service";
import { dossierVideVue, dossierVue } from "./vues";
import { Horloge } from "../socle/horloge";

/**
 * Covoiturage côté conducteur (« Je conduis »). Les chemins sont ceux du client d'API ; chaque réponse
 * qui a un contrat suit un schéma de `@afrimove/contrats` (`voyageur`). Un conducteur est un voyageur
 * dont le dossier est vérifié : les routes sont celles du rôle `voyageur`.
 */
@ApiTags("Covoiturage : conducteur")
@Controller("voyageur/covoit/conducteur")
export class CovoiturageConducteurController {
  constructor(
    private readonly conducteur: ConducteurService,
    private readonly trajets: TrajetsService,
    private readonly reservations: ReservationsService,
    private readonly demandes: DemandesService,
    private readonly verification: VerificationService,
    private readonly reputation: ReputationService,
    private readonly horloge: Horloge,
  ) {}

  @Roles("voyageur")
  @Get()
  @ApiOperation({
    summary: "Mes trajets : résumé, trajets publiés, passagers qui cherchent",
    description:
      "Le gain de la semaine est l'argent déjà versé ; les trajets comptés sont ceux qui ont été menés " +
      "à leur terme.",
  })
  mesTrajets(@UtilisateurCourant() u: Utilisateur) {
    return this.conducteur.mesTrajets(u);
  }

  @Roles("voyageur")
  @Get("formulaire")
  @ApiOperation({
    summary: "Formulaire « Proposer mon trajet » prérempli",
    description: "Reprend le dernier trajet du conducteur une semaine plus tard.",
  })
  formulaire(@UtilisateurCourant() u: Utilisateur) {
    return this.trajets.formulaire(u);
  }

  @Roles("voyageur")
  @Post("trajets")
  @HttpCode(201)
  @ApiOperation({
    summary: "Publier un trajet",
    description:
      "403 `CONDUCTEUR_NON_VERIFIE` tant que la pièce d'identité, le permis, la carte grise et la " +
      "voiture ne sont pas validés. 422 `PRIX_INVALIDE` au-dessus du prix conseillé (partage de frais). " +
      "409 `TRAJET_CHEVAUCHANT`.",
  })
  publier(@Body() brut: unknown, @UtilisateurCourant() u: Utilisateur) {
    return this.trajets.publier(u, corps(lirePublierTrajet, brut));
  }

  @Roles("voyageur")
  @Delete("trajets/:trajetId")
  @ApiOperation({
    summary: "Annuler un trajet : les passagers sont remboursés en entier",
    description:
      "Avec `?serie=true`, un trajet régulier n'est plus republié chaque semaine. Impossible une fois " +
      "le départ passé (409 `TRAJET_COMMENCE`).",
  })
  annuler(
    @Param("trajetId") trajetId: string,
    @Query() requete: Requete,
    @UtilisateurCourant() u: Utilisateur,
  ) {
    return this.reservations.annulerTrajet(u, trajetId, { serie: requete.serie === "true" });
  }

  @Roles("voyageur")
  @Post("demandes/:demandeId/propositions")
  @HttpCode(201)
  @ApiOperation({
    summary: "Proposer un de mes trajets à un passager qui cherche",
    description: "Le passager reçoit un SMS ; rejouer la proposition n'en envoie pas un second.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["trajetId"],
      properties: { trajetId: { type: "string" } },
    },
  })
  proposer(
    @Param("demandeId") demandeId: string,
    @Body() brut: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ) {
    return this.demandes.proposer(u, demandeId, corps(lireProposition, brut).trajetId);
  }

  @Roles("voyageur")
  @Post("reservations/:reservationId/note")
  @HttpCode(201)
  @ApiOperation({
    summary: "Noter un passager",
    description: "Une note de 1 à 5, une seule fois, une fois le trajet terminé.",
  })
  noter(
    @Param("reservationId") id: string,
    @Body() brut: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ) {
    const { note, commentaire } = corps(lireNote, brut);
    return this.reputation.noter(u, id, note, commentaire);
  }

  /* ------------------------------------------------------------------ vérification */

  @Roles("voyageur")
  @Get("verification")
  @ApiOperation({
    summary: "Où en est ma vérification",
    description:
      "Pièce d'identité, permis, carte grise, voiture : état de chacune et ce qui reste à faire. Les " +
      "numéros ne sont jamais rendus.",
  })
  async dossier(@UtilisateurCourant() u: Utilisateur) {
    const d = await this.verification.dossierDe(u.id);
    return d ? dossierVue(d, this.horloge.maintenant()) : dossierVideVue(u.id);
  }

  @Roles("voyageur")
  @Put("verification/vehicule")
  @ApiOperation({
    summary: "Déclarer ma voiture",
    description:
      "Changer d'immatriculation oblige à redéposer la carte grise et la voiture. `places` : places " +
      "passagers, hors conducteur.",
  })
  async vehicule(@Body() brut: unknown, @UtilisateurCourant() u: Utilisateur) {
    const d = await this.verification.declarerVehicule(u.id, corps(lireVehicule, brut));
    return dossierVue(d, this.horloge.maintenant());
  }

  @Roles("voyageur")
  @Put("verification/pieces/:type")
  @ApiOperation({
    summary: "Déposer une pièce (identite, permis, carte_grise, voiture)",
    description:
      "`fichierId` : le fichier déjà déposé auprès du service de fichiers. `numero` est obligatoire " +
      "sauf pour la voiture ; `expireLe` (AAAA-MM-JJ) est obligatoire pour le permis. La pièce repasse " +
      "« à vérifier ».",
  })
  async deposer(
    @Param("type") type: string,
    @Body() brut: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ) {
    const piece = ou400(() => lireTypePiece(type));
    const d = await this.verification.deposerPiece(u.id, piece, corps(lireDeposerPiece, brut));
    return dossierVue(d, this.horloge.maintenant());
  }

  @Roles("voyageur")
  @Put("verification/versement")
  @ApiOperation({
    summary: "Numéro MoMo qui reçoit mon paiement",
    description: "Un numéro camerounais. À défaut, le numéro du compte.",
  })
  async numeroVersement(@Body() brut: unknown, @UtilisateurCourant() u: Utilisateur) {
    const d = await this.verification.definirNumeroVersement(
      u.id,
      corps(lireNumeroVersement, brut).telephone,
    );
    return dossierVue(d, this.horloge.maintenant());
  }
}

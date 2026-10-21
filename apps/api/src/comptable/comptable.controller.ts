import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Roles, UtilisateurCourant, type Utilisateur } from "../socle/auth/decorateurs";
import { ClotureService, type MoisClotureVue } from "./cloture.service";
import { ComptableService } from "./comptable.service";
import type { ApercuConstruit } from "./fichiers";
import { RapprochementService, type RapprochementAppliqueVue } from "./rapprochement.service";
import { lireIdExport, lireMoisFacultatif, lireOngletFacultatif } from "./validation";
import type { ClotureVue, RapprochementVue, SyntheseVue } from "./vues";

interface ReponseHttp {
  set(entetes: Record<string, string>): void;
}

/**
 * Comptable (planches Comptable, ComptableRapprochement, ComptableApercu, ComptableCloture). Les noms
 * d'opérations et les chemins sont ceux de `packages/api-client/src/patron/operations.ts`. Lectures : patron
 * et comptable ; écritures (rapprochement, clôture) : le patron seul, signées par son PIN.
 */
@ApiTags("Comptable")
@Controller("patron/comptable")
export class ComptableController {
  constructor(
    private readonly comptable: ComptableService,
    private readonly rapprochement: RapprochementService,
    private readonly cloture: ClotureService,
  ) {}

  @Roles("patron", "comptable")
  @Get()
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary: "Synthèse du mois : rapprochement MoMo, cinq exports, envoi au cabinet",
    description:
      "`patron.comptable.synthese` → `SyntheseComptable`. Sans `mois` : le mois à clôturer.",
  })
  @ApiQuery({ name: "mois", required: false, description: "AAAA-MM" })
  synthese(
    @UtilisateurCourant() u: Utilisateur,
    @Query("mois") mois?: unknown,
  ): Promise<SyntheseVue> {
    return this.comptable.synthese(u, lireMoisFacultatif(mois));
  }

  @Roles("patron", "comptable")
  @Get("exports/:exportId/apercu")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary: "Aperçu d'un export : les 10 premières lignes d'un onglet, le total, la signature",
    description:
      "`patron.comptable.apercu` → `ApercuExport`. `onglet` choisit l'onglet (un `id` de `onglets`) ; " +
      "par défaut le premier ; 404 `ONGLET_INCONNU` sinon.",
  })
  @ApiQuery({ name: "mois", required: false })
  @ApiQuery({ name: "onglet", required: false })
  apercu(
    @UtilisateurCourant() u: Utilisateur,
    @Param("exportId") exportId: string,
    @Query("mois") mois?: unknown,
    @Query("onglet") onglet?: unknown,
  ): Promise<ApercuConstruit> {
    return this.comptable.apercu(
      u,
      lireIdExport(exportId),
      lireMoisFacultatif(mois),
      lireOngletFacultatif(onglet),
    );
  }

  @Roles("patron", "comptable")
  @Get("exports/:exportId/fichier")
  @ApiOperation({
    summary: "Télécharger le fichier d'un export (XLSX, CSV ou PDF)",
    description:
      '`patron.comptable.fichier` → `FichierExport` (les octets de la réponse, `lecture: "binaire"`). ' +
      "Mois clôturé : le fichier figé à la clôture. Mois ouvert : le fichier de l'aperçu s'il date de moins " +
      "de 10 minutes, sinon un fichier neuf. L'empreinte est dans l'en-tête `X-Empreinte-AfriMove`.",
  })
  @ApiQuery({ name: "mois", required: false })
  @ApiResponse({ status: 200, description: "Les octets du fichier" })
  async fichier(
    @UtilisateurCourant() u: Utilisateur,
    @Param("exportId") exportId: string,
    @Res({ passthrough: true }) reponse: ReponseHttp,
    @Query("mois") mois?: unknown,
  ): Promise<StreamableFile> {
    const fichier = await this.comptable.fichier(
      u,
      lireIdExport(exportId),
      lireMoisFacultatif(mois),
    );
    reponse.set({
      "Content-Type": fichier.typeMime,
      "Content-Disposition": `attachment; filename="${fichier.nomFichier}"`,
      "Cache-Control": "no-store",
      "X-Empreinte-AfriMove": fichier.empreinte,
      "X-Content-Type-Options": "nosniff",
    });
    return new StreamableFile(fichier.contenu);
  }

  @Roles("patron", "comptable")
  @Get("rapprochement")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary: "Transactions MoMo sans correspondance, avec la cause probable et l'action proposée",
    description: "`patron.comptable.rapprochement` → `RapprochementMomo`.",
  })
  @ApiQuery({ name: "mois", required: false })
  rapprochementDuMois(
    @UtilisateurCourant() u: Utilisateur,
    @Query("mois") mois?: unknown,
  ): Promise<RapprochementVue> {
    return this.comptable.rapprochement(u, lireMoisFacultatif(mois));
  }

  @Roles("patron")
  @Post("rapprochement/decisions")
  @HttpCode(200)
  @ApiOperation({
    summary: "Appliquer les décisions : rembourser, rattacher, demander (réclamation)",
    description:
      "`patron.comptable.rapprochement.appliquer`, corps `AppliquerRapprochement` signé par le PIN. " +
      "Une décision est définitive (409 `DECISION_DEJA_PRISE` si on en change) ; un mois clôturé les refuse " +
      "(409 `MOIS_DEJA_CLOTURE`).",
  })
  @ApiResponse({ status: 200, description: "`RapprochementApplique`" })
  @ApiResponse({ status: 401, description: "Signature PIN absente (`PIN_REQUIS`)" })
  @ApiResponse({ status: 403, description: "PIN incorrect (`PIN_INCORRECT`)" })
  @ApiResponse({ status: 404, description: "Transaction ou mois inconnu" })
  @ApiResponse({ status: 409, description: "Mois clôturé, décision déjà prise, PIN non défini" })
  @ApiResponse({ status: 422, description: "Corps invalide, cible introuvable, action refusée" })
  @ApiResponse({ status: 423, description: "PIN bloqué après trop d'essais" })
  appliquer(
    @UtilisateurCourant() u: Utilisateur,
    @Body() corps: unknown,
  ): Promise<RapprochementAppliqueVue> {
    return this.rapprochement.appliquer(u, corps);
  }

  @Roles("patron", "comptable")
  @Get("cloture")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary: "Le mois à clôturer, ou clôturé : encaissé, verrou, fichiers envoyés au cabinet",
    description: "`patron.comptable.cloture` → `ClotureMois`.",
  })
  @ApiQuery({ name: "mois", required: false })
  clotureDuMois(
    @UtilisateurCourant() u: Utilisateur,
    @Query("mois") mois?: unknown,
  ): Promise<ClotureVue> {
    return this.comptable.cloture(u, lireMoisFacultatif(mois));
  }

  @Roles("patron")
  @Post("clotures")
  @HttpCode(200)
  @ApiOperation({
    summary: "Clôturer le mois (irréversible) et, si demandé, tout envoyer au cabinet",
    description:
      "`patron.comptable.cloturer`, corps `CloturerMois` signé par le PIN. Refusé tant qu'une ligne du " +
      "rapprochement reste ouverte (409 `RAPPROCHEMENT_OUVERT`) ou que le mois n'est pas terminé " +
      "(409 `MOIS_EN_COURS`).",
  })
  @ApiResponse({ status: 200, description: "`MoisCloture`" })
  @ApiResponse({ status: 401, description: "Signature PIN absente (`PIN_REQUIS`)" })
  @ApiResponse({ status: 403, description: "PIN incorrect (`PIN_INCORRECT`)" })
  @ApiResponse({ status: 409, description: "Déjà clôturé, rapprochement ouvert, mois en cours" })
  @ApiResponse({ status: 422, description: "Corps invalide, cabinet non renseigné" })
  @ApiResponse({ status: 423, description: "PIN bloqué après trop d'essais" })
  cloturer(@UtilisateurCourant() u: Utilisateur, @Body() corps: unknown): Promise<MoisClotureVue> {
    return this.cloture.cloturer(u, corps);
  }
}

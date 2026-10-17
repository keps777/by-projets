import { Body, Controller, Get, HttpCode, Param, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles, UtilisateurCourant, type Utilisateur } from "../socle/auth/decorateurs";
import { ColisService } from "./colis.service";
import { GuichetColisService } from "./guichet.service";
import { requeteInvalide } from "./erreurs";
import { lireScan } from "./validation";

/**
 * Colis de l'agence : guichet (« GuichetColis »), dépôt prépayé (« Depot »), scans de la chaîne
 * (chargement, déchargement, relais, livraison, remise) et déchargement en route.
 * Chemins et noms d'opérations : `agence.colis.formulaire`, `agence.colis.depot`,
 * `agence.colis.enregistre`, `agence.colis.depose`, `agence.route.colis_decharges`
 * (`packages/api-client/src/agence/operations.ts`).
 *
 * `POST /agence/colis/scans` et `POST /agence/colis/:colisId/deblocage` n'existent pas dans les
 * contrats : ils portent les scans et le déblocage, que les contrats ne décrivent pas encore.
 */
@ApiTags("Colis · agence")
@Controller("agence")
export class AgenceColisController {
  constructor(
    private readonly guichet: GuichetColisService,
    private readonly colis: ColisService,
  ) {}

  @Roles("guichetier")
  @Get("colis/formulaire")
  @ApiOperation({ summary: "Guichet : prochain numéro, départs et prix pour enregistrer un colis" })
  formulaire(@UtilisateurCourant() u: Utilisateur, @Query("guichetId") guichetId?: string) {
    return this.guichet.formulaire(u, guichetId && guichetId.length > 0 ? guichetId : undefined);
  }

  @Roles("guichetier")
  @Get("colis/depot")
  @ApiOperation({ summary: "Guichet : retrouver un colis prépayé par son code" })
  depot(@UtilisateurCourant() u: Utilisateur, @Query("code") code?: string) {
    if (!code) throw requeteInvalide("Requête invalide", [{ chemin: "code", message: "Requis" }]);
    return this.guichet.depot(u, code);
  }

  @Roles("guichetier")
  @Post("colis")
  @HttpCode(200)
  @ApiOperation({ summary: "Guichet : événement « colis.enregistre » (idempotent par UUID)" })
  enregistrer(@UtilisateurCourant() u: Utilisateur, @Body() evenement: unknown) {
    return this.guichet.enregistrer(u, evenement);
  }

  @Roles("guichetier")
  @Post("colis/depot")
  @HttpCode(200)
  @ApiOperation({ summary: "Guichet : événement « colis.depose » (idempotent par UUID)" })
  deposer(@UtilisateurCourant() u: Utilisateur, @Body() evenement: unknown) {
    return this.guichet.deposer(u, evenement);
  }

  @Roles("guichetier", "convoyeur", "chauffeur", "superviseur")
  @Post("colis/scans")
  @HttpCode(200)
  @ApiOperation({
    summary: "Scan d'un colis : fait avancer l'état et prévient l'expéditeur",
    description:
      "Actions de la machine d'états des colis (`charger`, `expedier`, `decharger`, `rendre_disponible`, " +
      "`envoyer_en_relais`, `mettre_en_livraison`, `remettre`, `retourner`, `declarer_perdu`, " +
      "`ouvrir_litige`), selon le rôle. La remise exige le code de retrait, la pièce vérifiée et la " +
      "photo ; trois codes faux bloquent le colis (423).",
  })
  async scanner(@UtilisateurCourant() u: Utilisateur, @Body() corps: unknown) {
    const scan = lireScan(corps);
    const colis = await this.colis.executer({
      acteur: u,
      colis: {
        ...(scan.colisId !== undefined ? { id: scan.colisId } : {}),
        ...(scan.numero !== undefined ? { numero: scan.numero } : {}),
      },
      action: scan.action,
      ...(scan.code !== undefined ? { code: scan.code } : {}),
      pieceVerifiee: scan.pieceVerifiee,
      ...(scan.photoRef !== undefined ? { photoRef: scan.photoRef } : {}),
      ...(scan.relaisId !== undefined ? { relaisId: scan.relaisId } : {}),
      ...(scan.motif !== undefined ? { motif: scan.motif } : {}),
    });
    return this.colis.lirePartenaire({ id: colis.id });
  }

  @Roles("superviseur")
  @Post("colis/:colisId/deblocage")
  @HttpCode(204)
  @ApiOperation({ summary: "Superviseur : débloquer un colis après trois codes de retrait faux" })
  async debloquer(@UtilisateurCourant() u: Utilisateur, @Param("colisId") colisId: string) {
    await this.colis.debloquerCode(u, colisId);
  }

  @Roles("convoyeur")
  @Post("bus/dechargements")
  @HttpCode(200)
  @ApiOperation({
    summary: "Convoyeur : événement « route.colis_decharges » (idempotent par UUID)",
  })
  decharger(@UtilisateurCourant() u: Utilisateur, @Body() evenement: unknown) {
    return this.guichet.decharger(u, evenement);
  }
}

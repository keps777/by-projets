import { Body, Controller, Get, Header, Param, Post, Put } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Roles, UtilisateurCourant, type Utilisateur } from "../socle/auth/decorateurs";
import {
  LignesService,
  type LigneEditableReponse,
  type LignePublieeReponse,
} from "./lignes.service";

/**
 * Réglages des lignes du patron (planche « Config ») : les trois routes dictées par `@afrimove/api-client`
 * (`OP_LIGNE_EDITABLE`, `OP_MODIFIER_LIGNE`, `OP_CREER_LIGNE`). Les autres routes `/patron/reglages/*` (personnes,
 * règles, comptes MoMo) ne sont pas de ce module.
 */
@ApiTags("Administration")
@Controller("patron/reglages/lignes")
@Roles("patron")
export class LignesPatronController {
  constructor(private readonly lignes: LignesService) {}

  @Get(":ligneId")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    operationId: "patron.reglages.ligne",
    summary: "Patron : une ligne éditable (départs récurrents, tarifs, arrêts, plan, options)",
    description:
      "`LigneEditable` des contrats patron. Un brouillon programmé « dès le … » s'applique à la première lecture de ce jour-là.",
  })
  @ApiResponse({ status: 404, description: "Ligne inconnue (`LIGNE_INCONNUE`)" })
  lire(
    @Param("ligneId") ligneId: string,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<LigneEditableReponse> {
    return this.lignes.lire(u, ligneId);
  }

  @Put(":ligneId")
  @ApiOperation({
    operationId: "patron.reglages.ligne.modifier",
    summary: "Patron : publier les modifications d'une ligne, tout de suite ou dès un jour futur",
    description:
      "Corps `ModifierLigne` signé par le PIN. `effetDu` futur (90 jours au plus, sinon 422 `EFFET_TROP_LOIN`) : les " +
      "sections modifiées restent en brouillon et s'appliquent ce jour-là. Le prix d'un départ vient du tarif de sa " +
      "classe (le `prix` reçu est ignoré). Une commande sans aucune section : 422 `COMMANDE_VIDE`.",
  })
  @ApiResponse({
    status: 200,
    description: "`LignePubliee` : journal, signature et ligne après publication",
  })
  @ApiResponse({ status: 401, description: "Signature PIN absente (`PIN_REQUIS`)" })
  @ApiResponse({ status: 403, description: "PIN incorrect (`PIN_INCORRECT`)" })
  @ApiResponse({ status: 404, description: "Ligne ou départ inconnu" })
  @ApiResponse({
    status: 422,
    description: "Corps invalide, ou état refusé (deux départs à la même heure…)",
  })
  @ApiResponse({ status: 423, description: "PIN bloqué après trop d'essais" })
  modifier(
    @Param("ligneId") ligneId: string,
    @Body() corps: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<LignePublieeReponse> {
    return this.lignes.modifier(u, ligneId, corps);
  }

  @Post()
  @ApiOperation({
    operationId: "patron.reglages.ligne.creer",
    summary: "Patron : créer une ligne entre deux gares",
    description:
      "Corps `CreerLigne` signé par le PIN. Le code de la ligne est celui des deux gares (DLAYDE).",
  })
  @ApiResponse({ status: 201, description: "`LignePubliee`" })
  @ApiResponse({ status: 409, description: "La ligne existe déjà (`LIGNE_EXISTANTE`)" })
  @ApiResponse({
    status: 422,
    description: "Corps invalide, gares identiques, tarifs ou arrêts refusés",
  })
  creer(
    @Body() corps: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<LignePublieeReponse> {
    return this.lignes.creer(u, corps);
  }
}

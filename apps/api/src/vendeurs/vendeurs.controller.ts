import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles, UtilisateurCourant, Vente, type Utilisateur } from "../socle/auth/decorateurs";
import { AgrementsService } from "./agrements.service";
import {
  lireAgrement,
  lireCommissions,
  lireIdentifiant,
  lireParamsDeparts,
  lireVente,
} from "./validation";
import { VendeursService } from "./vendeurs.service";
import { VentesService } from "./ventes.service";

/**
 * L'app du vendeur ambulant (planche « Vendeur », route `/(vendeur)/accueil`). Noms d'opérations de
 * `packages/api-client/src/colis/operations.ts` : `vendeur.espace`, `vendeur.departs`,
 * `vendeur.clients`, `vendeur.vendre`. Les réponses suivent `SchemaEspaceVendeur`,
 * `SchemaDepartsVendeur`, `SchemaClientsVendeur` et `SchemaBilletVendu`.
 */
@ApiTags("Vendeurs ambulants")
@Controller("vendeurs/moi")
export class VendeurController {
  constructor(
    private readonly vendeurs: VendeursService,
    private readonly ventes: VentesService,
  ) {}

  @Roles("vendeur")
  @Get()
  @ApiOperation({ summary: "Vendeur : mon espace (agences, bilan du mois, règle d'or)" })
  espace(@UtilisateurCourant() u: Utilisateur) {
    return this.vendeurs.espace(u);
  }

  @Roles("vendeur")
  @Get("departs")
  @ApiOperation({
    summary: "Vendeur : les départs des agences qui m'ont agréé (demain par défaut)",
  })
  departs(@UtilisateurCourant() u: Utilisateur, @Query() requete: unknown) {
    return this.vendeurs.departs(u, lireParamsDeparts(requete));
  }

  @Roles("vendeur")
  @Get("clients")
  @ApiOperation({ summary: "Vendeur : mes clients, pour revendre en une touche" })
  clients(@UtilisateurCourant() u: Utilisateur) {
    return this.vendeurs.clients(u);
  }

  @Vente("vendeur")
  @Post("ventes")
  @ApiOperation({
    summary: "Vendeur : vendre un billet au nom d'un voisin, en payant l'agence par MoMo",
    description:
      "Le billet est émis seulement quand l'agence a reçu l'argent (60 s au plus). Un paiement " +
      "refusé répond 402 `reglement_refuse` (aucun billet, le vendeur rend l'argent au voisin) ; " +
      "sans réponse de l'opérateur, 409 `reglement_en_attente` : le billet part par SMS dès que " +
      "l'agence est payée. Une seule vente attend son règlement à la fois (409 `vente_en_cours`).",
  })
  vendre(@UtilisateurCourant() u: Utilisateur, @Body() corps: unknown) {
    return this.ventes.vendre(u, lireVente(corps));
  }
}

/**
 * Les agences gèrent leurs vendeurs. Ces routes n'existent pas dans les contrats : l'écran du
 * vendeur n'en a pas besoin. Réservées au patron et aux superviseurs, chacun pour sa propre agence.
 */
@ApiTags("Vendeurs ambulants · agences")
@Controller("agence/vendeurs")
export class AgenceVendeursController {
  constructor(private readonly agrements: AgrementsService) {}

  @Roles("patron", "superviseur")
  @Post()
  @ApiOperation({
    summary: "Agence : agréer un vendeur (compte créé au besoin, numéro V-… donné une fois)",
  })
  agreer(@UtilisateurCourant() u: Utilisateur, @Body() corps: unknown) {
    return this.agrements.agreer(u, lireAgrement(corps));
  }

  @Roles("patron", "superviseur")
  @Get()
  @ApiOperation({ summary: "Agence : mes vendeurs, avec leurs billets et commissions du mois" })
  lister(@UtilisateurCourant() u: Utilisateur) {
    return this.agrements.lister(u);
  }

  @Roles("patron", "superviseur")
  @Post(":vendeurId/retrait")
  @HttpCode(200)
  @ApiOperation({
    summary: "Agence : retirer l'agrément (les billets déjà vendus restent valables)",
  })
  retirer(@UtilisateurCourant() u: Utilisateur, @Param("vendeurId") vendeurId: string) {
    return this.agrements.retirer(u, lireIdentifiant(vendeurId, "vendeurId"));
  }

  @Roles("patron", "superviseur")
  @Put(":vendeurId/commissions")
  @ApiOperation({ summary: "Agence : fixer la commission par billet (classique, VIP)" })
  commissions(
    @UtilisateurCourant() u: Utilisateur,
    @Param("vendeurId") vendeurId: string,
    @Body() corps: unknown,
  ) {
    return this.agrements.fixerCommissions(
      u,
      lireIdentifiant(vendeurId, "vendeurId"),
      lireCommissions(corps),
    );
  }
}

import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common";
import { ApiBody, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Roles, UtilisateurCourant, type Utilisateur } from "../socle/auth/decorateurs";
import { versIsoDouala } from "../billetterie/temps";
import { PaiementsService } from "./paiements.service";
import { corps, lireEncaissementAgence, lirePaiementGuichet } from "./requetes";
import { vueGuichet } from "./vues";

/** Rôles du guichet et du terrain qui encaissent une vente. */
const ROLES_VENTE_TERRAIN = ["guichetier", "convoyeur", "vendeur", "superviseur"] as const;
/** Rôles qui confirment un paiement à la gare (mode dégradé). */
const ROLES_GARE = ["guichetier", "vendeur", "superviseur"] as const;

/** Paiements côté agence : push MoMo au guichet et encaissement à la gare en mode dégradé. */
@ApiTags("Paiements : agence")
@Controller("paiements")
export class PaiementsAgenceController {
  constructor(private readonly paiements: PaiementsService) {}

  @Roles(...ROLES_VENTE_TERRAIN)
  @Post("guichet")
  @HttpCode(201)
  @ApiOperation({
    summary: "Push MoMo ou Orange Money au guichet",
    description:
      "Demande au client de confirmer sur son téléphone. Tout le montant va à la compagnie. `cle` " +
      "identifie la vente (idempotence : un double envoi ne débite qu'une fois). La vente se conclut " +
      "avec `referenceOperateur` quand le statut passe à `reussi` (`GET /paiements/guichet/{id}`).",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["moyen", "telephone", "montant", "cle"],
      properties: {
        moyen: { type: "string", enum: ["mtn_momo", "orange_money"] },
        telephone: { type: "string", example: "+237691221008" },
        montant: { type: "integer", example: 4000 },
        cle: { type: "string" },
      },
    },
  })
  async guichet(@Body() brut: unknown, @UtilisateurCourant() u: Utilisateur) {
    return vueGuichet(await this.paiements.payerAuGuichet(u, corps(lirePaiementGuichet, brut)));
  }

  @Roles(...ROLES_VENTE_TERRAIN)
  @Get("guichet/:paiementId")
  @ApiOperation({ summary: "Statut d'un push de guichet (même compagnie)" })
  async statutGuichet(
    @Param("paiementId") paiementId: string,
    @UtilisateurCourant() u: Utilisateur,
  ) {
    return vueGuichet(await this.paiements.statutGuichet(u, paiementId));
  }

  @Roles(...ROLES_GARE)
  @Get("commandes/:commandeId")
  @ApiOperation({
    summary: "Commande réservée à encaisser à la gare (mode dégradé)",
    description:
      "Libellé, lignes, total et fin de la réservation, pour la compagnie du guichetier.",
  })
  async commande(@Param("commandeId") commandeId: string, @UtilisateurCourant() u: Utilisateur) {
    const c = await this.paiements.commandeAEncaisser(u, commandeId);
    return { ...c, expireA: versIsoDouala(c.expireA) };
  }

  @Roles(...ROLES_GARE)
  @Post("commandes/:commandeId/encaissement")
  @HttpCode(201)
  @ApiOperation({
    summary: "Encaisser une commande réservée à la gare (mode dégradé)",
    description:
      "Réservé au mode dégradé (409 `MODE_NORMAL` sinon). Espèces, ou MoMo marchand de l'agence avec la " +
      "référence de la transaction. Les billets sont émis comme pour un paiement en ligne. 409 " +
      "`SIEGES_PERDUS` si les places ont été reprises : rendre l'argent au client.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["mode"],
      properties: {
        mode: { type: "string", enum: ["especes", "momo_marchand"] },
        reference: { type: "string" },
      },
    },
  })
  async encaisser(
    @Param("commandeId") commandeId: string,
    @Body() brut: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ) {
    const p = await this.paiements.encaisserEnAgence(
      u,
      commandeId,
      corps(lireEncaissementAgence, brut),
    );
    return {
      paiementId: p.id,
      commandeId,
      moyen: p.moyen,
      statut: p.confirmation === "faite" ? "reussi" : "en_attente_confirmation",
      billetIds: p.billetIds,
    };
  }
}

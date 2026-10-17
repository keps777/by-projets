import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Logger,
  Param,
  Post,
  Put,
  Req,
  type RawBodyRequest,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request } from "express";
import { Public, Roles, UtilisateurCourant, type Utilisateur } from "../socle/auth/decorateurs";
import { DeuxFoisService } from "./deux-fois.service";
import { ErreurFinancement } from "./erreurs";
import { FinancementService } from "./financement.service";
import { PaieService } from "./paie.service";
import { NotificationInvalide, PartenaireFinancier } from "./ports";

/**
 * Routes du patron : financement (avance sur recettes, crédit matériel, paie, paiement en 2 fois).
 * Noms d'opérations et schémas de `@afrimove/contrats` (patron, `financement.ts` et `reglages.ts`) et de
 * `packages/api-client/src/patron/operations.ts`. Toute écriture porte la signature PIN du patron.
 */
@ApiTags("Financement")
@Controller("patron")
export class FinancementController {
  constructor(
    private readonly financement: FinancementService,
    private readonly paie: PaieService,
    private readonly deuxFois: DeuxFoisService,
  ) {}

  @Roles("patron")
  @Get("financement")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary: "Patron : l'offre de financement (avance, crédit matériel, paie, paiement en 2 fois)",
    description: "`patron.financement.offre` : réponse `OffreFinancement`.",
  })
  offre(@UtilisateurCourant() u: Utilisateur) {
    return this.financement.offre(u);
  }

  @Roles("patron")
  @Get("financement/demandes/:dossierId")
  @Header("Cache-Control", "no-store")
  @ApiOperation({
    summary: "Patron : le dossier d'avance et son suivi",
    description:
      "`patron.financement.dossier` : réponse `DossierFinancement`. 404 `DOSSIER_INCONNU`.",
  })
  dossier(@UtilisateurCourant() u: Utilisateur, @Param("dossierId") dossierId: string) {
    return this.financement.dossier(u, dossierId);
  }

  @Roles("patron")
  @Post("financement/demandes")
  @HttpCode(201)
  @ApiOperation({
    summary: "Patron : demander l'avance (dossier envoyé au partenaire, mandat signé par le PIN)",
    description:
      "`patron.financement.demander` : corps `DemanderAvance`, réponse `AvanceDemandee`. 401 `PIN_REQUIS`, " +
      "403 `PIN_INCORRECT`, 409 `DEMANDE_EN_COURS`, `CONVENTION_NON_SIGNEE`, `NON_ELIGIBLE`, " +
      "`COMPTE_MARCHAND_ABSENT`, 422 `AU_DESSUS_DU_PLAFOND`, `EN_DESSOUS_DU_MINIMUM`.",
  })
  demander(@UtilisateurCourant() u: Utilisateur, @Body() corps: unknown) {
    return this.financement.demander(u, corps);
  }

  @Roles("patron")
  @Post("financement/demandes/:dossierId/retrait")
  @HttpCode(200)
  @ApiOperation({
    summary: "Patron : retirer la demande tant qu'elle n'est pas versée",
    description:
      "`patron.financement.retirer` : corps `RetirerDemande`, réponse `DemandeRetiree`. 409 " +
      "`DOSSIER_NON_RETIRABLE` si le partenaire a déjà répondu, 503 `PARTENAIRE_INDISPONIBLE` s'il ne répond pas.",
  })
  retirer(
    @UtilisateurCourant() u: Utilisateur,
    @Param("dossierId") dossierId: string,
    @Body() corps: unknown,
  ) {
    return this.financement.retirer(u, dossierId, corps);
  }

  @Roles("patron")
  @Post("paie")
  @HttpCode(200)
  @ApiOperation({
    summary: "Patron : payer les salaires du mois par MoMo en une touche",
    description:
      "`patron.paie.lancer` : corps `LancerPaie`, réponse `PaieLancee`. Un seul lot par mois ; relancer ne " +
      "paie que les lignes en attente ou refusées. 409 `PAIE_DEJA_LANCEE`, 422 `MOIS_INVALIDE`, `AUCUN_SALAIRE`.",
  })
  lancerPaie(@UtilisateurCourant() u: Utilisateur, @Body() corps: unknown) {
    return this.paie.lancer(u, corps);
  }

  @Roles("patron")
  @Put("financement/billet-en-deux-fois")
  @HttpCode(200)
  @ApiOperation({
    summary: "Patron : activer ou couper le paiement du billet en 2 fois",
    description:
      "`patron.financement.billetEnDeuxFois` : corps `ReglerBilletEnDeuxFois` (`{ actif, signature }`), " +
      "réponse `BilletEnDeuxFoisRegle`.",
  })
  billetEnDeuxFois(@UtilisateurCourant() u: Utilisateur, @Body() corps: unknown) {
    return this.deuxFois.regler(u, corps);
  }
}

/**
 * Appels de l'établissement partenaire (accusé de réception, versement, refus). Route publique : l'appel est
 * authentifié par `PartenaireFinancier.lireNotification` (signature du partenaire), pas par un jeton. Répond
 * 200 quand tout est traité, rejeu compris ; 401 si l'appel n'est pas authentique ; 409 s'il contredit l'état
 * du dossier. Nécessite `rawBody: true` à la création de l'application (comme les paiements).
 */
@ApiTags("Financement · partenaire")
@Controller("financement/partenaire")
export class PartenaireFinancementController {
  private readonly journal = new Logger("PartenaireFinancement");

  constructor(
    private readonly financement: FinancementService,
    private readonly partenaire: PartenaireFinancier,
  ) {}

  @Public()
  @SkipThrottle()
  @Post("notifications")
  @HttpCode(200)
  @ApiOperation({
    summary: "Notification du partenaire financier (appelée par le partenaire, signée)",
  })
  @ApiResponse({ status: 401, description: "Appel non authentifié" })
  @ApiResponse({ status: 409, description: "Notification incohérente avec l'état du dossier" })
  async notification(
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ dossier: string; statut: string }> {
    const corpsBrut = req.rawBody ? req.rawBody.toString("utf8") : null;
    if (corpsBrut === null) {
      this.journal.error("Corps brut indisponible : créer l'application avec rawBody: true");
    }
    const entetes: Record<string, string | undefined> = {};
    for (const [nom, valeur] of Object.entries(req.headers)) {
      entetes[nom.toLowerCase()] = Array.isArray(valeur) ? valeur[0] : valeur;
    }
    let notification;
    try {
      notification = await this.partenaire.lireNotification({ entetes, corpsBrut });
    } catch (e) {
      if (e instanceof NotificationInvalide) {
        this.journal.warn(`Notification refusée (${e.raison})`);
        throw e.raison === "format"
          ? new ErreurFinancement(400, "NOTIFICATION_ILLISIBLE", "Notification illisible")
          : new ErreurFinancement(401, "SIGNATURE_INVALIDE", "Appel non authentifié");
      }
      throw e;
    }
    const dossier = await this.financement.appliquer(notification);
    return { dossier: dossier.id, statut: dossier.statut };
  }
}

import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AuditService } from "../socle/audit/audit.service";
import { Roles, UtilisateurCourant, type Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import type { AlerteSync } from "../sync/ports";
import { aammjjDouala } from "../sync/temps";
import { ControleJourneeService, type PerimetreControle } from "./controle-journee.service";
import { AppareilSansPlage, PlageChevauchante, PlageInvalide } from "./erreurs";
import { NumerotationService, type ResumeAppareil, type ResumeGare } from "./numerotation.service";
import type { AttributionPlage } from "./ports";
import { PlagesService, type DemandeAttribution } from "./plages.service";
import { jourValide } from "./regles";

/** Rôles qui lisent le compteur d'un appareil (le guichet affiche « plage sans trou » après chaque vente). */
const ROLES_LECTURE = ["guichetier", "convoyeur", "vendeur", "superviseur", "patron"] as const;
/** Rôles qui administrent les plages et lisent les alertes. */
const ROLES_SUPERVISION = ["superviseur", "patron"] as const;

function requeteInvalide(message: string): never {
  throw new BadRequestException({ code: "REQUETE_INVALIDE", message });
}

function lireJour(brut: unknown, parDefaut: string): string {
  if (brut === undefined || brut === null || brut === "") return parDefaut;
  if (typeof brut !== "string" || !jourValide(brut)) {
    requeteInvalide("Le jour doit être au format AAMMJJ (ex. 270105)");
  }
  return brut;
}

const objet = (v: unknown): Record<string, unknown> | null =>
  typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const entier = (v: unknown): number | null => (Number.isInteger(v) ? (v as number) : null);

/** Ce que l'utilisateur a le droit de voir : sa compagnie (patron) ou sa gare (les autres). */
function peutVoir(u: Utilisateur, a: Pick<AttributionPlage, "gareId" | "compagnieId">): boolean {
  if (u.role === "patron") return u.compagnieId !== null && a.compagnieId === u.compagnieId;
  return (
    u.gareId !== null &&
    a.gareId === u.gareId &&
    (u.compagnieId === null || a.compagnieId === u.compagnieId)
  );
}

function perimetreDe(u: Utilisateur, gareId?: string): PerimetreControle {
  if (u.role === "patron") {
    if (u.compagnieId === null) throw refuse("Votre compte n'est rattaché à aucune compagnie");
    return gareId ? { compagnieId: u.compagnieId, gareId } : { compagnieId: u.compagnieId };
  }
  if (u.gareId === null) throw refuse("Votre compte n'est rattaché à aucune gare");
  if (gareId && gareId !== u.gareId) throw refuse("Cette gare n'est pas la vôtre");
  return { gareId: u.gareId };
}

const refuse = (message: string) => new ForbiddenException({ code: "HORS_PERIMETRE", message });

@ApiTags("Numérotation")
@Controller("numerotation")
export class NumerotationController {
  constructor(
    private readonly plages: PlagesService,
    private readonly numerotation: NumerotationService,
    private readonly controle: ControleJourneeService,
    private readonly audit: AuditService,
    private readonly horloge: Horloge,
  ) {}

  private aujourdHui(): string {
    return aammjjDouala(this.horloge.maintenant());
  }

  @Roles(...ROLES_LECTURE)
  @Get("appareils/:appareilId/plage")
  @ApiOperation({
    summary: "Plage d'un appareil, compteur du jour et numéros manquants",
    description:
      "Billets et colis ont chacun leur compteur du jour dans la plage. `plageSansTrou` est vrai " +
      "quand aucun numéro ne manque et qu'aucun numéro n'est sorti de la plage.",
  })
  @ApiResponse({ status: 404, description: "Aucune plage attribuée à cet appareil" })
  async plage(
    @Param("appareilId") appareilId: string,
    @Query("jour") jourBrut: string | undefined,
    @UtilisateurCourant() utilisateur: Utilisateur,
  ): Promise<ResumeAppareil> {
    const jour = lireJour(jourBrut, this.aujourdHui());
    const attribution = await this.plages.de(appareilId);
    if (!attribution) throw nonTrouve(appareilId);
    if (!peutVoir(utilisateur, attribution)) throw refuse("Cet appareil n'est pas dans votre gare");
    return this.numerotation.resume(appareilId, jour);
  }

  @Roles(...ROLES_SUPERVISION)
  @Put("appareils/:appareilId/plage")
  @HttpCode(200)
  @ApiOperation({
    summary: "Attribuer une plage à un appareil (plan de numérotation ou plage explicite)",
    description:
      "Guichet : rang 1 à 3 (0001–0999, 1001–1999, 2001–2999). Convoyeur : rang sur `nbConvoyeurs` " +
      "(3001–3999 partagé). Une plage explicite sert au renfort ; elle ne peut ni recouvrir celle d'un " +
      "autre appareil de la gare (409) ni dépasser 4000 (les numéros suivants sont ceux du serveur).",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["genre"],
      properties: {
        genre: { type: "string", enum: ["guichet", "convoyeur"] },
        rang: { type: "integer", minimum: 1 },
        nbConvoyeurs: { type: "integer", minimum: 1 },
        plage: {
          type: "object",
          properties: { debut: { type: "integer" }, fin: { type: "integer" } },
        },
        gareId: { type: "string" },
        titulaire: {
          type: "object",
          properties: { id: { type: "string" }, nom: { type: "string" } },
        },
      },
    },
  })
  async attribuer(
    @Param("appareilId") appareilId: string,
    @Body() corps: unknown,
    @UtilisateurCourant() utilisateur: Utilisateur,
  ): Promise<AttributionPlage> {
    const demande = this.lireDemande(appareilId, corps, utilisateur);
    try {
      const attribution = await this.plages.attribuer(demande, utilisateur.id);
      await this.audit.enregistrer({
        acteur: {
          id: utilisateur.id,
          role: utilisateur.role,
          compagnieId: utilisateur.compagnieId,
        },
        action: "numerotation.plage_attribuee",
        resultat: "succes",
        cible: { type: "appareil", id: appareilId },
        details: { genre: attribution.genre, plage: attribution.plage, gareId: attribution.gareId },
      });
      return attribution;
    } catch (e) {
      if (e instanceof PlageInvalide) {
        throw new BadRequestException({ code: "PLAGE_INVALIDE", message: e.message });
      }
      if (e instanceof PlageChevauchante) {
        throw new ConflictException({
          code: "PLAGE_CHEVAUCHANTE",
          message: e.message,
          appareilEnConflit: e.enConflitAvec.appareilId,
        });
      }
      throw e;
    }
  }

  @Roles(...ROLES_SUPERVISION)
  @Delete("appareils/:appareilId/plage")
  @HttpCode(204)
  @ApiOperation({
    summary: "Libérer la plage d'un appareil remplacé",
    description:
      "Les numéros déjà émis restent pris : seul le reste de la plage redevient disponible.",
  })
  async liberer(
    @Param("appareilId") appareilId: string,
    @UtilisateurCourant() utilisateur: Utilisateur,
  ): Promise<void> {
    const attribution = await this.plages.de(appareilId);
    if (!attribution) throw nonTrouve(appareilId);
    if (!peutVoir(utilisateur, attribution)) throw refuse("Cet appareil n'est pas dans votre gare");
    await this.plages.liberer(appareilId);
    await this.audit.enregistrer({
      acteur: { id: utilisateur.id, role: utilisateur.role, compagnieId: utilisateur.compagnieId },
      action: "numerotation.plage_liberee",
      resultat: "succes",
      cible: { type: "appareil", id: appareilId },
      details: { plage: attribution.plage },
    });
  }

  @Roles(...ROLES_SUPERVISION)
  @Get("compteurs")
  @ApiOperation({
    summary: "Compteur du jour de tous les appareils de la gare (ou de la compagnie)",
  })
  async compteurs(
    @Query("jour") jourBrut: string | undefined,
    @Query("gareId") gareId: string | undefined,
    @UtilisateurCourant() utilisateur: Utilisateur,
  ): Promise<ResumeGare> {
    const jour = lireJour(jourBrut, this.aujourdHui());
    return this.numerotation.resumeGare(perimetreDe(utilisateur, gareId), jour);
  }

  @Roles(...ROLES_SUPERVISION)
  @Post("controles")
  @HttpCode(200)
  @ApiOperation({
    summary: "Contrôler les plages du jour : un trou déclenche une alerte nominative",
    description:
      "Rejouable : relancer le contrôle met les alertes à jour, et referme celles dont le trou a été " +
      "comblé par une synchronisation tardive. Rend les alertes ouvertes du périmètre.",
  })
  @ApiBody({
    schema: { type: "object", properties: { jour: { type: "string", example: "270105" } } },
  })
  async controler(
    @Body() corps: unknown,
    @UtilisateurCourant() utilisateur: Utilisateur,
  ): Promise<AlerteSync[]> {
    const jour = lireJour(objet(corps)?.["jour"], this.aujourdHui());
    const alertes = await this.controle.controler(jour, perimetreDe(utilisateur));
    await this.audit.enregistrer({
      acteur: { id: utilisateur.id, role: utilisateur.role, compagnieId: utilisateur.compagnieId },
      action: "numerotation.controle",
      resultat: "succes",
      details: { jour, alertesOuvertes: alertes.length },
    });
    return alertes;
  }

  @Roles(...ROLES_SUPERVISION)
  @Get("alertes")
  @ApiOperation({
    summary: "Alertes de numérotation ouvertes (numéros manquants), pour le rapport du soir",
  })
  async alertes(
    @Query("jour") jourBrut: string | undefined,
    @UtilisateurCourant() utilisateur: Utilisateur,
  ): Promise<AlerteSync[]> {
    const jour = lireJour(jourBrut, this.aujourdHui());
    const alertes = await this.controle.lister(jour, perimetreDe(utilisateur));
    return alertes.sort((a, b) => a.creeeA.localeCompare(b.creeeA));
  }

  private lireDemande(
    appareilId: string,
    corps: unknown,
    utilisateur: Utilisateur,
  ): DemandeAttribution {
    const b = objet(corps);
    if (!b) requeteInvalide("Corps JSON attendu");
    const genre = b["genre"];
    if (genre !== "guichet" && genre !== "convoyeur") {
      requeteInvalide("Genre attendu : « guichet » ou « convoyeur »");
    }
    const rang = b["rang"] === undefined ? null : entier(b["rang"]);
    const nbConvoyeurs = b["nbConvoyeurs"] === undefined ? null : entier(b["nbConvoyeurs"]);
    if (b["rang"] !== undefined && rang === null) requeteInvalide("Le rang doit être un entier");
    if (b["nbConvoyeurs"] !== undefined && nbConvoyeurs === null) {
      requeteInvalide("Le nombre de convoyeurs doit être un entier");
    }
    let plage: { debut: number; fin: number } | null = null;
    if (b["plage"] !== undefined && b["plage"] !== null) {
      const p = objet(b["plage"]);
      const debut = entier(p?.["debut"]);
      const fin = entier(p?.["fin"]);
      if (debut === null || fin === null) requeteInvalide("La plage est { debut, fin } (entiers)");
      plage = { debut, fin };
    }
    let titulaire: { id: string; nom: string } | null = null;
    if (b["titulaire"] !== undefined && b["titulaire"] !== null) {
      const t = objet(b["titulaire"]);
      if (typeof t?.["id"] !== "string" || typeof t["nom"] !== "string" || !t["nom"].trim()) {
        requeteInvalide("Le titulaire est { id, nom }");
      }
      titulaire = { id: t["id"], nom: t["nom"].trim() };
    }

    if (utilisateur.compagnieId === null)
      throw refuse("Votre compte n'est rattaché à aucune compagnie");
    let gareId: string;
    if (utilisateur.role === "superviseur") {
      if (utilisateur.gareId === null) throw refuse("Votre compte n'est rattaché à aucune gare");
      if (b["gareId"] !== undefined && b["gareId"] !== utilisateur.gareId) {
        throw refuse("Un superviseur n'attribue des plages que dans sa gare");
      }
      gareId = utilisateur.gareId;
    } else {
      if (typeof b["gareId"] !== "string" || !b["gareId"]) requeteInvalide("La gare est requise");
      gareId = b["gareId"];
    }
    return {
      appareilId,
      genre,
      rang,
      nbConvoyeurs,
      plage,
      gareId,
      compagnieId: utilisateur.compagnieId,
      titulaire,
    };
  }
}

const nonTrouve = (appareilId: string) => {
  const e = new AppareilSansPlage(appareilId);
  return new NotFoundException({ code: "APPAREIL_SANS_PLAGE", message: e.message });
};

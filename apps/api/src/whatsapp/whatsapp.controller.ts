import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UnprocessableEntityException,
  type RawBodyRequest,
} from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request } from "express";
import { AuditService } from "../socle/audit/audit.service";
import { Public, Roles, UtilisateurCourant, type Utilisateur } from "../socle/auth/decorateurs";
import { Horloge } from "../socle/horloge";
import {
  CompteWhatsAppService,
  type EtatDetailleWhatsApp,
  type VueCompteWhatsApp,
} from "./compte.service";
import { AucunDestinataire, RapportIndisponible } from "./erreurs";
import { WebhookInvalide } from "./fournisseur";
import { VariablesInvalides } from "./gabarits";
import { JournalWhatsApp } from "./journal";
import {
  RapportSoirWhatsAppService,
  type ResumeRapport,
  type StatutRapport,
} from "./rapport-soir.service";
import { ReceptionWhatsAppService, type ResumeWebhook } from "./reception.service";
import { debutDeJour, jourDouala } from "./temps";
import {
  vueMessage,
  type EssaiWhatsApp,
  type MessageWhatsApp,
  type VueMessageWhatsApp,
} from "./types";

/** Rôles qui lisent l'état du compte et le suivi du rapport : ceux qui reçoivent le rapport. */
const ROLES_LECTURE = ["patron", "superviseur", "afrimove"] as const;

function requeteInvalide(message: string): never {
  throw new BadRequestException({ code: "REQUETE_INVALIDE", message });
}

/** Ce que ce compte a le droit de voir : AfriMove tout ; patron et superviseur, leur compagnie. */
function peutVoir(u: Utilisateur, m: Pick<MessageWhatsApp, "compagnieId">): boolean {
  if (u.role === "afrimove") return true;
  return u.compagnieId !== null && m.compagnieId === u.compagnieId;
}

interface MessageAvecEssais extends VueMessageWhatsApp {
  essais: Array<
    Pick<EssaiWhatsApp, "numero" | "fournisseur" | "at" | "dureeMs" | "resultat" | "code">
  >;
}

@ApiTags("WhatsApp")
@Controller("whatsapp")
export class WhatsAppController {
  private readonly logger = new Logger("WhatsAppController");

  constructor(
    private readonly compte: CompteWhatsAppService,
    private readonly rapports: RapportSoirWhatsAppService,
    private readonly reception: ReceptionWhatsAppService,
    private readonly journal: JournalWhatsApp,
    private readonly audit: AuditService,
    private readonly horloge: Horloge,
  ) {}

  @Roles(...ROLES_LECTURE)
  @Get("compte")
  @ApiOperation({
    summary: "Compte WhatsApp Business : nom, « compte vérifié · répond en 2 min »",
    description:
      "Le nom et la ligne de détail de l'en-tête de la conversation (écran Rapport du soir). Le délai " +
      "de réponse est le délai médian mesuré sur 7 jours entre un message reçu et notre réponse.",
  })
  vue(@UtilisateurCourant() u: Utilisateur): Promise<VueCompteWhatsApp> {
    return this.compte.vue(u.compagnieId);
  }

  @Roles("afrimove")
  @Get("etat")
  @ApiOperation({
    summary:
      "État détaillé : gabarits soumis et approuvés, mode normal ou repli SMS, circuit, file",
  })
  etat(): Promise<EtatDetailleWhatsApp> {
    return this.compte.detail(null);
  }

  @Roles(...ROLES_LECTURE)
  @Get("rapports/:jour")
  @ApiOperation({
    summary: "Suivi du rapport du soir : un état par destinataire (envoyé, remis, lu, repli SMS)",
    description:
      "`jour` au format AAAA-MM-JJ. Patron et superviseur voient leur compagnie ; AfriMove passe " +
      "`compagnieId` en paramètre.",
  })
  async statutRapport(
    @Param("jour") jour: string,
    @Query("compagnieId") compagnieId: string | undefined,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<StatutRapport> {
    if (!debutDeJour(jour)) return requeteInvalide("jour : AAAA-MM-JJ attendu");
    let compagnie: string | null = u.compagnieId;
    if (u.role === "afrimove") {
      compagnie = compagnieId || null;
      if (!compagnie) return requeteInvalide("compagnieId est obligatoire");
    } else if (compagnie === null) {
      throw new ForbiddenException({ code: "HORS_PERIMETRE", message: "Compte sans compagnie" });
    } else if (compagnieId && compagnieId !== compagnie) {
      throw new ForbiddenException({
        code: "HORS_PERIMETRE",
        message: "Cette compagnie n'est pas la vôtre",
      });
    }
    return this.rapports.statut(compagnie, jour);
  }

  @Roles("afrimove")
  @Post("rapports/envoyer")
  @HttpCode(202)
  @ApiOperation({
    summary: "Relancer l'envoi du rapport du soir d'une compagnie",
    description:
      "Met en file le rapport du jour (ou de `jour`) pour le patron et les superviseurs qui ne l'ont pas " +
      "encore reçu. Idempotent : un destinataire déjà servi n'est pas servi deux fois.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: ["compagnieId"],
      properties: {
        compagnieId: { type: "string" },
        jour: { type: "string", example: "2027-01-05" },
      },
    },
  })
  @ApiResponse({ status: 404, description: "Pas de rapport pour ce jour" })
  @ApiResponse({ status: 409, description: "Aucun destinataire avec un numéro" })
  async relancer(
    @Body() corps: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<ResumeRapport> {
    if (typeof corps !== "object" || corps === null || Array.isArray(corps)) {
      return requeteInvalide("Le corps doit être un objet");
    }
    const brut = corps as Record<string, unknown>;
    const inconnus = Object.keys(brut).filter((c) => c !== "compagnieId" && c !== "jour");
    if (inconnus.length > 0) return requeteInvalide(`Champs inconnus : ${inconnus.join(", ")}`);
    const { compagnieId, jour: jourBrut } = brut;
    if (typeof compagnieId !== "string" || compagnieId === "") {
      return requeteInvalide("compagnieId est obligatoire");
    }
    if (jourBrut !== undefined && (typeof jourBrut !== "string" || !debutDeJour(jourBrut))) {
      return requeteInvalide("jour : AAAA-MM-JJ attendu");
    }
    const jour = typeof jourBrut === "string" ? jourBrut : jourDouala(this.horloge.maintenant());

    try {
      const resume = await this.rapports.envoyerRapport(compagnieId, jour);
      await this.audit.enregistrer({
        acteur: { id: u.id, role: u.role, compagnieId: u.compagnieId },
        action: "whatsapp.rapport_relance",
        resultat: "succes",
        cible: { type: "rapport_soir", id: `${compagnieId}:${jour}` },
        details: {
          envoyes: resume.envoyes,
          dejaEnvoyes: resume.dejaEnvoyes,
          echecs: resume.echecs.length,
        },
      });
      return resume;
    } catch (e) {
      if (e instanceof RapportIndisponible) {
        throw new NotFoundException({ code: "RAPPORT_INDISPONIBLE", message: e.message });
      }
      if (e instanceof AucunDestinataire) {
        throw new ConflictException({ code: "AUCUN_DESTINATAIRE", message: e.message });
      }
      if (e instanceof VariablesInvalides) {
        throw new UnprocessableEntityException({
          code: "RAPPORT_INVALIDE",
          message: "Le rapport ne peut pas être mis en forme",
          erreurs: e.erreurs,
        });
      }
      throw e;
    }
  }

  @Roles(...ROLES_LECTURE)
  @Get("messages/:id")
  @ApiOperation({
    summary: "Statut de livraison d'un message WhatsApp",
    description:
      "Statut (`en_file`, `envoye`, `remis`, `lu`, `non_remis`, `echec`…), repli SMS, essais. Le " +
      "numéro est masqué, le contenu n'est jamais conservé.",
  })
  async message(
    @Param("id") id: string,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<MessageAvecEssais> {
    const m = /^[0-9a-f-]{36}$/i.test(id) ? await this.journal.trouver(id) : null;
    if (!m || !peutVoir(u, m)) {
      throw new NotFoundException({ code: "MESSAGE_INTROUVABLE", message: "Message introuvable" });
    }
    const essais = await this.journal.essais(m.id);
    return {
      ...vueMessage(m),
      essais: essais.map(({ numero, fournisseur, at, dureeMs, resultat, code }) => ({
        numero,
        fournisseur,
        at,
        dureeMs,
        resultat,
        code,
      })),
    };
  }

  /* ------------------------------------------------------------------------------ webhooks */

  /**
   * Vérification d'abonnement : WhatsApp appelle cette adresse en GET avec `hub.mode`,
   * `hub.verify_token` et `hub.challenge` quand on déclare le webhook, et attend le `challenge`.
   */
  @Public()
  @SkipThrottle()
  @Get("webhooks")
  @Header("Content-Type", "text/plain; charset=utf-8")
  @ApiOperation({ summary: "Vérification d'abonnement du webhook (appelé par WhatsApp)" })
  @ApiResponse({ status: 403, description: "Jeton de vérification invalide" })
  verifier(@Query() requete: Record<string, string | undefined>): string {
    try {
      return this.reception.verifierAbonnement({
        mode: requete["hub.mode"],
        jeton: requete["hub.verify_token"],
        challenge: requete["hub.challenge"],
      });
    } catch (e) {
      if (e instanceof WebhookInvalide) {
        this.logger.warn("Vérification d'abonnement refusée");
        throw new ForbiddenException({ code: "ABONNEMENT_REFUSE", message: "Jeton invalide" });
      }
      throw e;
    }
  }

  /**
   * Accusés de livraison et messages reçus. Route publique : l'appel est authentifié par sa
   * signature (HMAC-SHA-256 du corps exact avec le secret de l'application), pas par un jeton.
   * Nécessite `rawBody: true` à la création de l'application (README).
   */
  @Public()
  @SkipThrottle()
  @Post("webhooks")
  @HttpCode(200)
  @ApiOperation({ summary: "Accusés de livraison et messages reçus (appelé par WhatsApp, signé)" })
  @ApiResponse({ status: 401, description: "Signature absente ou invalide" })
  async webhook(@Req() req: RawBodyRequest<Request>): Promise<ResumeWebhook> {
    const corpsBrut = req.rawBody ? req.rawBody.toString("utf8") : null;
    if (corpsBrut === null) {
      this.logger.error("Corps brut indisponible : créer l'application avec rawBody: true");
    }
    const entetes: Record<string, string | undefined> = {};
    for (const [nom, valeur] of Object.entries(req.headers)) {
      entetes[nom.toLowerCase()] = Array.isArray(valeur) ? valeur[0] : valeur;
    }
    try {
      return await this.reception.traiter({ entetes, corpsBrut });
    } catch (e) {
      if (e instanceof WebhookInvalide) {
        this.logger.warn(`Appel refusé : ${e.raison}`);
        if (e.raison === "format") {
          throw new BadRequestException({ code: "APPEL_ILLISIBLE", message: e.message });
        }
        throw new UnauthorizedException({
          code: "SIGNATURE_INVALIDE",
          message: "Appel non authentifié",
        });
      }
      throw e;
    }
  }
}

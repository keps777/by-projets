import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Logger,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  type RawBodyRequest,
} from "@nestjs/common";
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { SkipThrottle } from "@nestjs/throttler";
import type { Request } from "express";
import { AuditService } from "../socle/audit/audit.service";
import { Public, Roles, UtilisateurCourant, type Utilisateur } from "../socle/auth/decorateurs";
import { TelephoneInvalide } from "../socle/comptes/telephone";
import { FileIndisponible, QuotaSmsDepasse } from "./erreurs";
import { RecuInvalide } from "./fournisseur";
import { VariablesInvalides } from "./gabarits";
import { JournalSms } from "./journal";
import { PasserelleSmsService, type EtatPasserelle } from "./passerelle.service";
import { FournisseurInconnu, ReceptionRecusService, type ResumeRecus } from "./reception.service";
import { StatistiquesSmsService, type RapportCoutsSms } from "./statistiques.service";
import { vueMessage, type EssaiSms, type MessageSms, type VueMessageSms } from "./types";

/** Rôles du guichet et du terrain qui envoient le billet à la demande. */
const ROLES_ENVOI_BILLET = ["guichetier", "convoyeur", "vendeur", "superviseur"] as const;
/** Rôles qui lisent le statut d'un SMS. */
const ROLES_LECTURE = [...ROLES_ENVOI_BILLET, "patron", "afrimove"] as const;
/** Rôles qui lisent les coûts : AfriMove (toutes les compagnies), patron et comptable (la leur). */
const ROLES_COUTS = ["afrimove", "patron", "comptable"] as const;

const CHAMPS_BILLET = [
  "billetId",
  "telephone",
  "renvoi",
  "compagnie",
  "origine",
  "destination",
  "departA",
  "siege",
  "code",
  "lien",
] as const;

function requeteInvalide(message: string, extra: Record<string, unknown> = {}): never {
  throw new BadRequestException({ code: "REQUETE_INVALIDE", message, ...extra });
}

function dateRequete(brut: unknown, nom: string): Date | undefined {
  if (brut === undefined || brut === "") return undefined;
  if (typeof brut !== "string") return requeteInvalide(`${nom} : date attendue`);
  // « 2027-01-05 » = ce jour-là à minuit, heure de Douala.
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(brut) ? `${brut}T00:00:00+01:00` : brut;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return requeteInvalide(`${nom} : date invalide`);
  return d;
}

/** Ce que ce compte a le droit de voir : AfriMove tout ; la compagnie pour patron et superviseur ; ses propres envois pour le terrain. */
function peutVoir(u: Utilisateur, m: Pick<MessageSms, "compagnieId" | "demandeurId">): boolean {
  if (u.role === "afrimove") return true;
  if (u.compagnieId === null || m.compagnieId !== u.compagnieId) return false;
  if (u.role === "patron" || u.role === "superviseur") return true;
  return m.demandeurId === u.id;
}

interface MessageAvecEssais extends VueMessageSms {
  essais: Array<Pick<EssaiSms, "numero" | "fournisseur" | "at" | "dureeMs" | "resultat" | "code">>;
}

@ApiTags("SMS")
@Controller("sms")
export class SmsController {
  private readonly logger = new Logger("SmsController");

  constructor(
    private readonly passerelle: PasserelleSmsService,
    private readonly reception: ReceptionRecusService,
    private readonly statistiques: StatistiquesSmsService,
    private readonly journal: JournalSms,
    private readonly audit: AuditService,
  ) {}

  @Roles(...ROLES_ENVOI_BILLET)
  @Post("billets")
  @HttpCode(202)
  @ApiOperation({
    summary: "Envoyer le billet par SMS à la demande (guichet)",
    description:
      "Met le SMS du billet en file (QR par lien, code à 4 chiffres) et rend son statut. Envoyer deux " +
      "fois le même billet au même numéro ne renvoie rien (`nouveau: false`) ; `renvoi: true` envoie un " +
      "nouveau SMS (facturé), jusqu'à 2 renvois. Le statut de livraison se lit avec `GET /sms/messages/{id}`.",
  })
  @ApiBody({
    schema: {
      type: "object",
      required: [...CHAMPS_BILLET.filter((c) => c !== "renvoi")],
      properties: {
        billetId: { type: "string" },
        telephone: { type: "string", example: "+237655012345" },
        renvoi: { type: "boolean" },
        compagnie: { type: "string" },
        origine: { type: "string" },
        destination: { type: "string" },
        departA: { type: "string", format: "date-time" },
        siege: { type: "string" },
        code: { type: "string", pattern: "^\\d{4}$" },
        lien: { type: "string", format: "uri" },
      },
    },
  })
  @ApiResponse({ status: 400, description: "Numéro ou valeurs invalides" })
  @ApiResponse({ status: 429, description: "Trop de SMS (par compte, par numéro ou renvois)" })
  async envoyerBillet(
    @Body() corps: unknown,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<{ nouveau: boolean; message: VueMessageSms }> {
    if (typeof corps !== "object" || corps === null || Array.isArray(corps)) {
      return requeteInvalide("Le corps doit être un objet");
    }
    const brut = corps as Record<string, unknown>;
    const inconnus = Object.keys(brut).filter(
      (c) => !(CHAMPS_BILLET as readonly string[]).includes(c),
    );
    if (inconnus.length > 0) return requeteInvalide(`Champs inconnus : ${inconnus.join(", ")}`);
    const { billetId, telephone, renvoi, ...variables } = brut;
    if (typeof billetId !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(billetId)) {
      return requeteInvalide("billetId : identifiant du billet (64 caractères au plus)");
    }
    if (typeof telephone !== "string") return requeteInvalide("telephone est obligatoire");
    if (renvoi !== undefined && typeof renvoi !== "boolean") {
      return requeteInvalide("renvoi : booléen attendu");
    }

    try {
      const resultat = await this.passerelle.envoyerBillet({
        billetId,
        destinataire: telephone,
        // La validation fine (codes, lien, dates) est faite par le gabarit.
        variables: variables as never,
        renvoi: renvoi === true,
        compagnieId: u.compagnieId,
        demandeurId: u.id,
      });
      await this.audit.enregistrer({
        acteur: { id: u.id, role: u.role, compagnieId: u.compagnieId },
        action: "sms.billet_demande",
        resultat: "succes",
        cible: { type: "billet", id: billetId },
        details: {
          messageId: resultat.message.id,
          nouveau: resultat.nouveau,
          renvoi: renvoi === true,
          destinataire: resultat.message.destinataireMasque,
        },
      });
      return resultat;
    } catch (e) {
      throw this.traduire(e);
    }
  }

  @Roles(...ROLES_LECTURE)
  @Get("messages/:id")
  @ApiOperation({
    summary: "Statut de livraison d'un SMS",
    description:
      "Statut (`en_file`, `en_reprise`, `envoye`, `livre`, `non_livre`, `echec`, `expire`, `annule`), " +
      "coût, délai d'envoi et essais. Le numéro est masqué, le texte n'est jamais conservé.",
  })
  async message(
    @Param("id") id: string,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<MessageAvecEssais> {
    const m = /^[0-9a-f-]{36}$/i.test(id) ? await this.journal.trouver(id) : null;
    if (!m || !peutVoir(u, m))
      throw new NotFoundException({ code: "SMS_INTROUVABLE", message: "SMS introuvable" });
    return this.avecEssais(m);
  }

  // Pas AfriMove : aucune route « billet » ne lui est ouverte (invariant du socle, roles.e2e.test.ts).
  // Il lit un SMS par son identifiant et les coûts.
  @Roles(...ROLES_ENVOI_BILLET, "patron")
  @Get("billets/:billetId")
  @ApiOperation({ summary: "SMS envoyés pour un billet, du plus récent au plus ancien" })
  async parBillet(
    @Param("billetId") billetId: string,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<{ messages: VueMessageSms[] }> {
    const liste = await this.journal.lister({
      type: "billet",
      reference: { type: "billet", id: billetId },
      limite: 20,
    });
    return { messages: liste.filter((m) => peutVoir(u, m)).map(vueMessage) };
  }

  @Roles(...ROLES_COUTS)
  @Get("couts")
  @ApiOperation({
    summary: "Coût et délai d'envoi par type de SMS (administration)",
    description:
      "`du` inclus, `au` exclu (date `AAAA-MM-JJ` en heure de Douala, ou date-heure avec fuseau). " +
      "AfriMove voit toutes les compagnies (filtre `compagnieId`) ; patron et comptable, la leur.",
  })
  async couts(
    @Query("du") du: string | undefined,
    @Query("au") au: string | undefined,
    @Query("compagnieId") compagnieId: string | undefined,
    @UtilisateurCourant() u: Utilisateur,
  ): Promise<RapportCoutsSms> {
    let compagnie: string | undefined;
    if (u.role === "afrimove") {
      compagnie = compagnieId || undefined;
    } else {
      if (u.compagnieId === null) {
        throw new ForbiddenException({ code: "HORS_PERIMETRE", message: "Compte sans compagnie" });
      }
      if (compagnieId && compagnieId !== u.compagnieId) {
        throw new ForbiddenException({
          code: "HORS_PERIMETRE",
          message: "Cette compagnie n'est pas la vôtre",
        });
      }
      compagnie = u.compagnieId;
    }
    const debut = dateRequete(du, "du");
    const fin = dateRequete(au, "au");
    return this.statistiques.couts({
      ...(compagnie !== undefined ? { compagnieId: compagnie } : {}),
      ...(debut ? { du: debut } : {}),
      ...(fin ? { au: fin } : {}),
    });
  }

  @Roles("afrimove")
  @Get("etat")
  @ApiOperation({
    summary: "État de la passerelle : mode normal, secours ou indisponible, circuits, file",
  })
  etat(): Promise<EtatPasserelle> {
    return this.passerelle.etat();
  }

  /**
   * Accusés de livraison du fournisseur. Route publique : l'appel est authentifié par sa signature
   * (HMAC du corps exact, horodatage de moins de 5 minutes), pas par un jeton. Nécessite
   * `rawBody: true` à la création de l'application (README).
   */
  @Public()
  @SkipThrottle()
  @Post("webhooks/:fournisseur")
  @HttpCode(200)
  @ApiOperation({ summary: "Accusés de livraison (appelé par le fournisseur, signé)" })
  @ApiResponse({ status: 401, description: "Signature absente, invalide ou périmée" })
  async webhook(
    @Param("fournisseur") fournisseur: string,
    @Req() req: RawBodyRequest<Request>,
  ): Promise<ResumeRecus> {
    const corpsBrut = req.rawBody ? req.rawBody.toString("utf8") : null;
    if (corpsBrut === null) {
      this.logger.error("Corps brut indisponible : créer l'application avec rawBody: true");
    }
    const entetes: Record<string, string | undefined> = {};
    for (const [nom, valeur] of Object.entries(req.headers)) {
      entetes[nom.toLowerCase()] = Array.isArray(valeur) ? valeur[0] : valeur;
    }
    try {
      return await this.reception.traiter(fournisseur, { entetes, corpsBrut });
    } catch (e) {
      if (e instanceof FournisseurInconnu) {
        throw new NotFoundException({ code: "FOURNISSEUR_INCONNU", message: e.message });
      }
      if (e instanceof RecuInvalide) {
        this.logger.warn(`Accusé refusé (${fournisseur}) : ${e.raison}`);
        if (e.raison === "format") {
          throw new BadRequestException({ code: "RECU_ILLISIBLE", message: e.message });
        }
        throw new UnauthorizedException({
          code: "SIGNATURE_INVALIDE",
          message: "Appel non authentifié",
        });
      }
      throw e;
    }
  }

  private async avecEssais(m: MessageSms): Promise<MessageAvecEssais> {
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

  private traduire(e: unknown): Error {
    if (e instanceof TelephoneInvalide) {
      return new BadRequestException({ code: "TELEPHONE_INVALIDE", message: e.message });
    }
    if (e instanceof VariablesInvalides) {
      return new BadRequestException({
        code: "VARIABLES_INVALIDES",
        message: "Valeurs invalides pour ce SMS",
        erreurs: e.erreurs,
      });
    }
    if (e instanceof QuotaSmsDepasse) {
      return new HttpException(
        { code: "QUOTA_SMS", portee: e.portee, message: e.message },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (e instanceof FileIndisponible) {
      return new ServiceUnavailableException({ code: "FILE_SMS_INDISPONIBLE", message: e.message });
    }
    return e instanceof Error ? e : new Error("Erreur inconnue");
  }
}

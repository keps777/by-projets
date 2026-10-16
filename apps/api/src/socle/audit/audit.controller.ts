import { Controller, ForbiddenException, Get, Query } from "@nestjs/common";
import { ApiOperation, ApiProperty, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsInt, IsOptional, IsNumberString, Max, Min } from "class-validator";
import { Roles, UtilisateurCourant, type Utilisateur } from "../auth/decorateurs";
import { AuditService } from "./audit.service";
import type { LigneAudit } from "./chaine";

export class FiltreAuditDto {
  @ApiProperty({ required: false, minimum: 1, maximum: 200, default: 50 })
  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(200)
  limite?: number;

  @ApiProperty({
    required: false,
    description: "Numéro de la dernière ligne déjà reçue (page suivante)",
  })
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  avant?: string;
}

export class LigneAuditReponse {
  @ApiProperty({ description: "Numéro d'ordre (texte : peut dépasser 2^53)" }) seq!: string;
  @ApiProperty({ format: "uuid" }) id!: string;
  @ApiProperty({ format: "date-time" }) at!: string;
  @ApiProperty({ nullable: true }) acteurId!: string | null;
  @ApiProperty({ nullable: true }) acteurRole!: string | null;
  @ApiProperty() action!: string;
  @ApiProperty({ enum: ["succes", "refus", "echec"] }) resultat!: string;
  @ApiProperty({ nullable: true }) cibleType!: string | null;
  @ApiProperty({ nullable: true }) cibleId!: string | null;
  @ApiProperty({ type: "object", additionalProperties: true }) details!: Record<string, unknown>;
}

export class RapportChaineReponse {
  @ApiProperty() valide!: boolean;
  @ApiProperty() lignesVerifiees!: number;
  @ApiProperty({
    required: false,
    description: "Première ligne dont l'empreinte ne correspond pas",
  })
  premiereLigneEnDefaut?: string;
}

function versReponse(l: LigneAudit): LigneAuditReponse {
  return {
    seq: String(l.seq ?? 0n),
    id: l.id,
    at: l.at.toISOString(),
    acteurId: l.acteurId,
    acteurRole: l.acteurRole,
    action: l.action,
    resultat: l.resultat,
    cibleType: l.cibleType,
    cibleId: l.cibleId,
    details: l.details,
  };
}

/** Journal d'audit de la compagnie, lisible par le patron. Lecture seule : il n'existe aucune route d'écriture. */
@ApiTags("Patron")
@Controller("patron/journal-audit")
export class AuditPatronController {
  constructor(private readonly audit: AuditService) {}

  @Roles("patron")
  @Get()
  @ApiOperation({ summary: "Journal d'audit de ma compagnie (le plus récent d'abord)" })
  @ApiQuery({ name: "limite", required: false })
  @ApiQuery({ name: "avant", required: false })
  @ApiResponse({ status: 200, type: [LigneAuditReponse] })
  async lister(
    @UtilisateurCourant() u: Utilisateur,
    @Query() filtre: FiltreAuditDto,
  ): Promise<LigneAuditReponse[]> {
    if (!u.compagnieId) throw new ForbiddenException("Aucune compagnie rattachée à ce compte");
    const lignes = await this.audit.lister({
      compagnieId: u.compagnieId,
      limite: filtre.limite ?? 50,
      ...(filtre.avant !== undefined ? { avantSeq: BigInt(filtre.avant) } : {}),
    });
    await this.audit.enregistrer({
      action: "journal_audit.lecture",
      resultat: "succes",
      acteur: { id: u.id, role: u.role, compagnieId: u.compagnieId },
    });
    return lignes.map(versReponse);
  }
}

/** Contrôle d'intégrité du journal, réservé à AfriMove (qui ne vend jamais). */
@ApiTags("AfriMove")
@Controller("afrimove/journal-audit")
export class AuditAfrimoveController {
  constructor(private readonly audit: AuditService) {}

  @Roles("afrimove")
  @Get("verification")
  @ApiOperation({ summary: "Recalcule la chaîne d'empreintes du journal d'audit" })
  @ApiResponse({ status: 200, type: RapportChaineReponse })
  async verifier(@UtilisateurCourant() u: Utilisateur): Promise<RapportChaineReponse> {
    const rapport = await this.audit.verifierChaine();
    await this.audit.enregistrer({
      action: "journal_audit.verification",
      resultat: rapport.valide ? "succes" : "echec",
      acteur: { id: u.id, role: u.role, compagnieId: u.compagnieId },
      details: { lignesVerifiees: rapport.lignesVerifiees },
    });
    return {
      valide: rapport.valide,
      lignesVerifiees: rapport.lignesVerifiees,
      ...(rapport.premiereLigneEnDefaut !== undefined
        ? { premiereLigneEnDefaut: String(rapport.premiereLigneEnDefaut) }
        : {}),
    };
  }
}

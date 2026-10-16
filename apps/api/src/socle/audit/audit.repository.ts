import { Injectable } from "@nestjs/common";
import { PrismaService } from "../db/prisma.service";
import { EMPREINTE_INITIALE, type LigneAudit } from "./chaine";

export interface FiltreAudit {
  /** Limite le journal à une compagnie (un patron ne lit que la sienne). */
  compagnieId?: string;
  /** Ne renvoie que les lignes de numéro strictement inférieur (pagination vers le passé). */
  avantSeq?: bigint;
  limite: number;
}

/**
 * Port du journal d'audit. Il n'expose AUCUNE modification ni suppression : le journal est en
 * ajout seul (et la base le refuse aussi, voir la migration « ajout_seul_et_contraintes »).
 */
export abstract class AuditRepository {
  /**
   * Ajoute une ligne à la suite du journal. `construire` reçoit l'empreinte de la dernière ligne
   * (ou l'empreinte initiale) et renvoie la ligne complète ; l'ajout est sérialisé pour que la
   * chaîne reste linéaire même avec plusieurs instances de l'API.
   */
  abstract ajouter(construire: (empreinteDerniereLigne: string) => LigneAudit): Promise<LigneAudit>;
  abstract lister(filtre: FiltreAudit): Promise<LigneAudit[]>;
  /** Lignes de numéro supérieur à `apresSeq`, par ordre croissant (vérification de la chaîne). */
  abstract lireParLots(apresSeq: bigint, taille: number): Promise<LigneAudit[]>;
}

/** Verrou consultatif PostgreSQL qui sérialise les écritures du journal. */
const VERROU_JOURNAL = 7_017_001;

function depuisBase(l: {
  seq: bigint;
  id: string;
  at: Date;
  acteurId: string | null;
  acteurRole: LigneAudit["acteurRole"];
  compagnieId: string | null;
  action: string;
  resultat: LigneAudit["resultat"];
  cibleType: string | null;
  cibleId: string | null;
  details: unknown;
  hashPrecedent: string;
  hash: string;
}): LigneAudit {
  return { ...l, details: (l.details ?? {}) as Record<string, unknown> };
}

@Injectable()
export class AuditPrisma extends AuditRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  ajouter(construire: (empreinteDerniereLigne: string) => LigneAudit): Promise<LigneAudit> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${VERROU_JOURNAL})`;
      const derniere = await tx.journalAudit.findFirst({
        orderBy: { seq: "desc" },
        select: { hash: true },
      });
      const { seq: _seq, ...ligne } = construire(derniere?.hash ?? EMPREINTE_INITIALE);
      const cree = await tx.journalAudit.create({
        data: { ...ligne, details: ligne.details as object },
      });
      return depuisBase(cree);
    });
  }

  async lister(filtre: FiltreAudit): Promise<LigneAudit[]> {
    const lignes = await this.prisma.journalAudit.findMany({
      where: {
        ...(filtre.compagnieId !== undefined ? { compagnieId: filtre.compagnieId } : {}),
        ...(filtre.avantSeq !== undefined ? { seq: { lt: filtre.avantSeq } } : {}),
      },
      orderBy: { seq: "desc" },
      take: filtre.limite,
    });
    return lignes.map(depuisBase);
  }

  async lireParLots(apresSeq: bigint, taille: number): Promise<LigneAudit[]> {
    const lignes = await this.prisma.journalAudit.findMany({
      where: { seq: { gt: apresSeq } },
      orderBy: { seq: "asc" },
      take: taille,
    });
    return lignes.map(depuisBase);
  }
}

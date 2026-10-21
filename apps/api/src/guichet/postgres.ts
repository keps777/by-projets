import { Injectable } from "@nestjs/common";
import { PrismaService } from "../socle/db/prisma.service";
import { versIsoDouala } from "../caisse/temps";
import { ImpressionsAgence, type DocumentImprimable, type ImpressionStockee } from "./ports";

/** Adaptateurs PostgreSQL du module guichet (table `impression_agence`, voir le README). */

type Ligne = {
  evenementId: string;
  document: string;
  documentId: string;
  copies: number;
  reimpression: boolean;
  auteurId: string;
  appareilId: string;
  compagnieId: string | null;
  imprimeeA: Date;
  recuA: Date;
};

const versImpression = (l: Ligne): ImpressionStockee => ({
  evenementId: l.evenementId,
  document: l.document as DocumentImprimable,
  documentId: l.documentId,
  copies: l.copies,
  reimpression: l.reimpression,
  auteurId: l.auteurId,
  appareilId: l.appareilId,
  compagnieId: l.compagnieId,
  imprimeeA: versIsoDouala(l.imprimeeA),
  recuA: versIsoDouala(l.recuA),
});

@Injectable()
export class ImpressionsPrisma extends ImpressionsAgence {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ajouter(i: ImpressionStockee): Promise<boolean> {
    // `ON CONFLICT DO NOTHING` : de deux requêtes identiques simultanées, une seule écrit.
    const { count } = await this.prisma.impressionAgence.createMany({
      data: [
        {
          evenementId: i.evenementId,
          document: i.document,
          documentId: i.documentId,
          copies: i.copies,
          reimpression: i.reimpression,
          auteurId: i.auteurId,
          appareilId: i.appareilId,
          compagnieId: i.compagnieId,
          imprimeeA: new Date(i.imprimeeA),
          recuA: new Date(i.recuA),
        },
      ],
      skipDuplicates: true,
    });
    return count === 1;
  }

  async deDocument(document: DocumentImprimable, documentId: string) {
    const lignes = await this.prisma.impressionAgence.findMany({
      where: { document, documentId },
      orderBy: [{ imprimeeA: "asc" }, { evenementId: "asc" }],
    });
    return lignes.map(versImpression);
  }

  async copiesDe(document: DocumentImprimable, documentIds: readonly string[]) {
    const ids = [...new Set(documentIds)];
    if (ids.length === 0) return new Map<string, number>();
    const groupes = await this.prisma.impressionAgence.groupBy({
      by: ["documentId"],
      where: { document, documentId: { in: ids } },
      _sum: { copies: true },
    });
    return new Map(groupes.map((g) => [g.documentId, g._sum.copies ?? 0]));
  }
}

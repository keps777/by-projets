import { Injectable } from "@nestjs/common";
import { ImpressionsAgence, type DocumentImprimable, type ImpressionStockee } from "./ports";

/** Version en mémoire de `ImpressionsAgence` (tests, développement). Rien n'y survit à un redémarrage. */
@Injectable()
export class ImpressionsMemoire extends ImpressionsAgence {
  readonly durable = false;
  readonly lignes: ImpressionStockee[] = [];

  async ajouter(impression: ImpressionStockee): Promise<boolean> {
    if (this.lignes.some((l) => l.evenementId === impression.evenementId)) return false;
    this.lignes.push({ ...impression });
    return true;
  }

  async deDocument(document: DocumentImprimable, documentId: string) {
    return this.lignes
      .filter((l) => l.document === document && l.documentId === documentId)
      .sort((a, b) => Date.parse(a.imprimeeA) - Date.parse(b.imprimeeA))
      .map((l) => ({ ...l }));
  }

  async copiesDe(document: DocumentImprimable, documentIds: readonly string[]) {
    const voulus = new Set(documentIds);
    const copies = new Map<string, number>();
    for (const l of this.lignes) {
      if (l.document !== document || !voulus.has(l.documentId)) continue;
      copies.set(l.documentId, (copies.get(l.documentId) ?? 0) + l.copies);
    }
    return copies;
  }
}

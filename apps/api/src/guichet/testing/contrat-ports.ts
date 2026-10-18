import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ImpressionsAgence, type ImpressionStockee } from "../ports";

/**
 * Contrat du port `ImpressionsAgence` : les mêmes tests s'exécutent sur l'adaptateur en mémoire et sur
 * l'adaptateur PostgreSQL. Un comportement que la mémoire a et que PostgreSQL n'a pas (ou l'inverse) fait
 * échouer l'un des deux : c'est ce qui garantit que la mémoire, sur laquelle tournent les autres tests, se
 * comporte comme la base.
 */

export interface ContexteImpressions {
  /** Une personne qui existe (clé étrangère en base). */
  auteurId: string;
  /** Une compagnie qui existe (clé étrangère en base). */
  compagnieId: string | null;
}

export interface BancImpressions {
  impressions: ImpressionsAgence;
  /** Une personne et une compagnie neuves. En base, les lignes sont créées. */
  nouveauContexte(): Promise<ContexteImpressions>;
  fermer(): Promise<void>;
}

export function uneImpression(
  c: ContexteImpressions,
  surcharge: Partial<ImpressionStockee> = {},
): ImpressionStockee {
  return {
    evenementId: randomUUID(),
    document: "billet",
    documentId: randomUUID(),
    copies: 1,
    reimpression: false,
    auteurId: c.auteurId,
    appareilId: "GU1-DLA",
    compagnieId: c.compagnieId,
    imprimeeA: "2027-01-05T09:00:00.000+01:00",
    recuA: "2027-01-05T09:00:05.000+01:00",
    ...surcharge,
  };
}

export function contratImpressions(nom: string, ouvrir: () => Promise<BancImpressions>): void {
  describe(`contrat ImpressionsAgence : ${nom}`, () => {
    let banc: BancImpressions;
    beforeAll(async () => {
      banc = await ouvrir();
    }, 120_000);
    afterAll(async () => {
      await banc?.fermer();
    });

    it("ajoute une impression et la relit telle quelle", async () => {
      const c = await banc.nouveauContexte();
      const i = uneImpression(c, { document: "etiquette_colis", copies: 3, reimpression: true });
      expect(await banc.impressions.ajouter(i)).toBe(true);
      expect(await banc.impressions.deDocument("etiquette_colis", i.documentId)).toEqual([i]);
    });

    it("rejouer un identifiant d'événement n'ajoute rien ; vingt requêtes simultanées : une seule écrit", async () => {
      const c = await banc.nouveauContexte();
      const i = uneImpression(c);
      expect(await banc.impressions.ajouter(i)).toBe(true);
      expect(await banc.impressions.ajouter({ ...i, copies: 5 })).toBe(false);
      expect((await banc.impressions.deDocument("billet", i.documentId))[0]?.copies).toBe(1);

      const j = uneImpression(c);
      const reponses = await Promise.all(
        Array.from({ length: 20 }, () => banc.impressions.ajouter(j)),
      );
      expect(reponses.filter(Boolean)).toHaveLength(1);
      expect(await banc.impressions.deDocument("billet", j.documentId)).toHaveLength(1);
    });

    it("liste les impressions d'un document de la plus ancienne à la plus récente, sans mélanger les types", async () => {
      const c = await banc.nouveauContexte();
      const documentId = randomUUID();
      const tard = uneImpression(c, {
        documentId,
        reimpression: true,
        imprimeeA: "2027-01-05T11:00:00.000+01:00",
      });
      const tot = uneImpression(c, { documentId, imprimeeA: "2027-01-05T09:30:00.000+01:00" });
      const autreType = uneImpression(c, { documentId, document: "ticket_caisse" });
      for (const i of [tard, tot, autreType]) await banc.impressions.ajouter(i);
      const billets = await banc.impressions.deDocument("billet", documentId);
      expect(billets.map((i) => i.evenementId)).toEqual([tot.evenementId, tard.evenementId]);
      expect(await banc.impressions.deDocument("etiquette_colis", documentId)).toEqual([]);
      expect(await banc.impressions.deDocument("billet", randomUUID())).toEqual([]);
    });

    it("compte les copies par document, en une fois, sans les documents jamais imprimés", async () => {
      const c = await banc.nouveauContexte();
      const a = randomUUID();
      const b = randomUUID();
      const jamais = randomUUID();
      await banc.impressions.ajouter(uneImpression(c, { documentId: a, copies: 1 }));
      await banc.impressions.ajouter(
        uneImpression(c, { documentId: a, copies: 2, reimpression: true }),
      );
      await banc.impressions.ajouter(uneImpression(c, { documentId: b, copies: 4 }));
      // Même identifiant, autre type de document : ne compte pas.
      await banc.impressions.ajouter(
        uneImpression(c, { documentId: a, document: "ticket_caisse" }),
      );

      const copies = await banc.impressions.copiesDe("billet", [a, b, jamais, a]);
      expect(Object.fromEntries(copies)).toEqual({ [a]: 3, [b]: 4 });
      expect((await banc.impressions.copiesDe("billet", [])).size).toBe(0);
      expect((await banc.impressions.copiesDe("etiquette_colis", [a])).size).toBe(0);
    });
  });
}

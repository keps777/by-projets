import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type {
  ConventionFinancement,
  DossierStocke,
  LignePaie,
  LotPaie,
  OffreCreditMateriel,
} from "../modele";
import type {
  ConventionsFinancement,
  DossiersFinancement,
  LotsPaie,
  OffresCredit,
  Prelevements,
  ReglagesFinancement,
} from "../ports";
import { versIsoDouala } from "../temps";
import { dossierType } from "./fabriques";

/**
 * Contrat des ports de stockage du financement : les mêmes tests passent sur la mémoire et sur PostgreSQL.
 * Un comportement que l'une a et que l'autre n'a pas fait échouer l'un des deux : c'est ce qui prouve que la
 * mémoire, sur laquelle tournent tous les autres tests, se comporte comme la base (une seule avance ouverte
 * par agence, jamais plus prélevé que dû, un salaire jamais relancé deux fois…).
 */

export interface BancFinancement {
  dossiers: DossiersFinancement;
  prelevements: Prelevements;
  lots: LotsPaie;
  reglages: ReglagesFinancement;
  conventions: ConventionsFinancement;
  offres: OffresCredit;
  /** Un compte (en base : une ligne `personne`). */
  personne(): Promise<string>;
  /** Une agence (en base : une ligne `compagnie`). */
  compagnie(): Promise<string>;
  /** Écrit la convention de l'agence (aucune route : un agent AfriMove, ici le test). */
  poserConvention(agenceId: string, convention: ConventionFinancement): Promise<void>;
  /** Écrit l'offre de crédit de l'agence (aucune route : le partenaire ou un agent, ici le test). */
  poserOffre(agenceId: string, offre: OffreCreditMateriel): Promise<void>;
  fermer(): Promise<void>;
}

export const T0 = "2027-01-05T10:04:00.000+01:00";
export const apres = (minutes: number, depuis = T0): string =>
  versIsoDouala(Date.parse(depuis) + minutes * 60_000);

let compteur = 0;
const suivant = (): number => {
  compteur += 1;
  return compteur;
};

/** Un numéro d'avance que personne d'autre n'a pris dans cette base. */
export const numeroAvance = (annee = 2027): string =>
  `AV-${annee}-${String(suivant() + 5000).padStart(4, "0")}`;

/** Un dossier d'avance (en analyse par défaut) d'une agence, demandé et signé par `patronId`. */
export function unDossier(
  agenceId: string,
  patronId: string,
  over: Partial<DossierStocke> = {},
): DossierStocke {
  const id = over.id ?? numeroAvance();
  const base = dossierType();
  return {
    ...base,
    id,
    agenceId,
    demandePar: patronId,
    referencePartenaire: `PART-${id}`,
    mandat: { ...base.mandat, signePar: patronId },
    ...over,
  };
}

/** Un dossier versé : 6 M, dû 6,48 M, mandat actif. */
export const verse = (over: Partial<DossierStocke> = {}): Partial<DossierStocke> => ({
  statut: "verse",
  decisionA: apres(60),
  verseA: apres(60),
  conditions: { remboursementPctVentesMomo: 8, dureeEstimeeSemaines: 7, coutTotalPct: 8 },
  resteDu: 6_480_000,
  ...over,
});

export function uneLignePaie(personneId: string, o: Partial<LignePaie> = {}): LignePaie {
  return {
    personneId,
    nom: "Jean Mballa",
    montant: 150_000,
    operateur: "mtn",
    telephone: "+237677112233",
    etat: "en_attente",
    tentative: 0,
    reference: null,
    motif: null,
    ...o,
  };
}

export function unLot(
  agenceId: string,
  lancePar: string,
  lignes: LignePaie[],
  o: Partial<LotPaie> = {},
): LotPaie {
  return {
    id: randomUUID(),
    version: 1,
    agenceId,
    mois: "2027-01",
    lancePar,
    lanceA: T0,
    total: lignes.reduce((s, l) => s + l.montant, 0),
    lignes,
    ...o,
  };
}

export function contratPortsFinancement(
  titre: string,
  creerBanc: () => Promise<BancFinancement>,
): void {
  describe(titre, () => {
    let banc: BancFinancement | null = null;
    const obtenir = async (): Promise<BancFinancement> => (banc ??= await creerBanc());
    afterAll(async () => {
      await banc?.fermer();
    });

    /** Une agence, son patron et un dossier prêt à être écrit. */
    const decor = async (over: Partial<DossierStocke> = {}) => {
      const b = await obtenir();
      const agenceId = await b.compagnie();
      const patronId = await b.personne();
      return { b, agenceId, patronId, dossier: unDossier(agenceId, patronId, over) };
    };

    describe("DossiersFinancement", () => {
      it("garde un dossier tel qu'il a été écrit, pièces, conditions et mandat compris", async () => {
        const { b, agenceId, dossier } = await decor();
        expect(await b.dossiers.ajouter(dossier)).toBe("ajoute");
        expect(await b.dossiers.trouver(agenceId, dossier.id)).toEqual({ ...dossier, version: 1 });
        expect(await b.dossiers.parReference(dossier.referencePartenaire!)).toEqual({
          ...dossier,
          version: 1,
        });
        expect(await b.dossiers.parReference("PART-INCONNUE")).toBeNull();
      });

      it("un dossier d'une autre agence n'existe pas", async () => {
        const { b, dossier } = await decor();
        await b.dossiers.ajouter(dossier);
        expect(await b.dossiers.trouver(await b.compagnie(), dossier.id)).toBeNull();
        expect(await b.dossiers.trouver("pas-un-uuid", dossier.id)).toBeNull();
        expect(await b.dossiers.trouver(dossier.agenceId, "AV-2027-9999")).toBeNull();
      });

      it("une agence n'a qu'une avance ouverte : envoyée, en analyse, ou versée avec un mandat actif", async () => {
        const ouvertes: Partial<DossierStocke>[] = [
          { statut: "envoye", accuseA: null, referencePartenaire: null },
          { statut: "en_analyse" },
          verse(),
        ];
        for (const ouverte of ouvertes) {
          const { b, agenceId, patronId, dossier } = await decor(ouverte);
          expect(await b.dossiers.ajouter(dossier)).toBe("ajoute");
          const autre = unDossier(agenceId, patronId);
          expect(await b.dossiers.ajouter(autre)).toBe("demande_en_cours");
          expect(await b.dossiers.trouver(agenceId, autre.id)).toBeNull();
          expect((await b.dossiers.ouvert(agenceId))?.id).toBe(dossier.id);
        }
      });

      it("refusée, retirée ou soldée (mandat révoqué), l'avance libère la place", async () => {
        const mandatSolde = { ...dossierType().mandat, actif: false };
        const fermees: Partial<DossierStocke>[] = [
          { statut: "refuse", motifRefus: "dossier incomplet", decisionA: apres(30) },
          { statut: "retire", retireA: apres(30) },
          verse({ mandat: mandatSolde, rembourseA: apres(90) }),
        ];
        for (const close of fermees) {
          const { b, agenceId, patronId, dossier } = await decor(close);
          const ferme = { ...dossier, mandat: { ...dossier.mandat, signePar: patronId } };
          expect(await b.dossiers.ajouter(ferme)).toBe("ajoute");
          expect(await b.dossiers.ouvert(agenceId)).toBeNull();
          expect(await b.dossiers.aPrelever(agenceId)).toBeNull();
          expect(await b.dossiers.ajouter(unDossier(agenceId, patronId))).toBe("ajoute");
        }
      });

      it("de dix demandes simultanées d'une agence, une seule est acceptée", async () => {
        const { b, agenceId, patronId } = await decor();
        const essais = await Promise.all(
          Array.from({ length: 10 }, () => b.dossiers.ajouter(unDossier(agenceId, patronId))),
        );
        expect(essais.filter((r) => r === "ajoute")).toHaveLength(1);
        expect(essais.filter((r) => r === "demande_en_cours")).toHaveLength(9);
      });

      it("un numéro déjà pris est refusé, même par une autre agence", async () => {
        const { b, dossier } = await decor();
        expect(await b.dossiers.ajouter(dossier)).toBe("ajoute");
        const { agenceId, patronId } = await decor();
        const memeNumero = unDossier(agenceId, patronId, {
          id: dossier.id,
          referencePartenaire: null,
        });
        expect(await b.dossiers.ajouter(memeNumero)).toBe("numero_pris");
        expect(await b.dossiers.trouver(agenceId, dossier.id)).toBeNull();
      });

      it("aPrelever ne rend que le dossier versé dont le mandat est actif", async () => {
        const { b, agenceId, dossier } = await decor(verse());
        expect(await b.dossiers.aPrelever(agenceId)).toBeNull();
        await b.dossiers.ajouter(dossier);
        expect((await b.dossiers.aPrelever(agenceId))?.id).toBe(dossier.id);
        expect(await b.dossiers.aPrelever(await b.compagnie())).toBeNull();
      });

      it("remplacer exige la version lue : de cinq écritures simultanées, une seule passe", async () => {
        const { b, agenceId, dossier } = await decor();
        await b.dossiers.ajouter(dossier);
        const essais = await Promise.all(
          [1, 2, 3, 4, 5].map((i) =>
            b.dossiers.remplacer({ ...dossier, partenaire: `Banque ${i}` }, 1),
          ),
        );
        expect(essais.filter(Boolean)).toHaveLength(1);
        const lu = (await b.dossiers.trouver(agenceId, dossier.id))!;
        expect(lu.version).toBe(2);
        expect(await b.dossiers.remplacer({ ...lu, montant: 1 }, 1)).toBe(false);
        expect(await b.dossiers.remplacer({ ...lu, montant: 5_000_000 }, 2)).toBe(true);
        expect((await b.dossiers.trouver(agenceId, dossier.id))?.version).toBe(3);
        expect(await b.dossiers.remplacer(unDossier(agenceId, dossier.demandePar), 1)).toBe(false);
      });

      it("remplacer ne change ni l'agence ni le patron qui a demandé", async () => {
        const { b, agenceId, patronId, dossier } = await decor();
        await b.dossiers.ajouter(dossier);
        const autreAgence = await b.compagnie();
        const autrePatron = await b.personne();
        expect(
          await b.dossiers.remplacer(
            { ...dossier, agenceId: autreAgence, demandePar: autrePatron, motifRefus: "x" },
            1,
          ),
        ).toBe(true);
        const lu = (await b.dossiers.trouver(agenceId, dossier.id))!;
        expect(lu).toMatchObject({ agenceId, demandePar: patronId, motifRefus: "x", version: 2 });
        expect(await b.dossiers.trouver(autreAgence, dossier.id)).toBeNull();
      });

      it("remplacer garde toutes les étapes de la vie d'un dossier : accusé, versement, solde", async () => {
        const { b, agenceId, dossier } = await decor({
          statut: "envoye",
          accuseA: null,
          referencePartenaire: null,
        });
        await b.dossiers.ajouter(dossier);
        const accuse = {
          ...dossier,
          statut: "en_analyse" as const,
          accuseA: apres(1),
          referencePartenaire: `PART-${dossier.id}`,
        };
        expect(await b.dossiers.remplacer(accuse, 1)).toBe(true);
        expect(await b.dossiers.trouver(agenceId, dossier.id)).toEqual({ ...accuse, version: 2 });
        const verseDossier = { ...accuse, ...verse() };
        expect(await b.dossiers.remplacer(verseDossier, 2)).toBe(true);
        expect(await b.dossiers.trouver(agenceId, dossier.id)).toEqual({
          ...verseDossier,
          version: 3,
        });
        const solde = {
          ...verseDossier,
          mandat: { ...verseDossier.mandat, actif: false },
          rembourseA: apres(500),
        };
        expect(await b.dossiers.remplacer(solde, 3)).toBe(true);
        expect(await b.dossiers.aPrelever(agenceId)).toBeNull();
        expect(await b.dossiers.ouvert(agenceId)).toBeNull();
        expect(await b.dossiers.trouver(agenceId, dossier.id)).toEqual({ ...solde, version: 4 });
      });

      it("nonTransmis rend les envoyés sans accusé, enAnalyse les transmis, dans l'ordre des numéros", async () => {
        const b = await obtenir();
        const n1 = numeroAvance(2031);
        const n2 = numeroAvance(2031);
        const n3 = numeroAvance(2031);
        const sansAccuse: Partial<DossierStocke> = {
          statut: "envoye",
          accuseA: null,
          referencePartenaire: null,
        };
        const aEcrire: [string, Partial<DossierStocke>][] = [
          [n3, sansAccuse],
          [n1, sansAccuse],
          [n2, { statut: "en_analyse" }],
        ];
        for (const [id, over] of aEcrire) {
          const agenceId = await b.compagnie();
          const patronId = await b.personne();
          expect(await b.dossiers.ajouter(unDossier(agenceId, patronId, { id, ...over }))).toBe(
            "ajoute",
          );
        }
        const ids = (l: DossierStocke[]) => l.map((d) => d.id).filter((id) => id.includes("2031"));
        expect(ids(await b.dossiers.nonTransmis())).toEqual([n1, n3]);
        expect(ids(await b.dossiers.enAnalyse())).toEqual([n2]);
      });

      it("prochainNumero compte par année, sans trou ni doublon, même simultané", async () => {
        const b = await obtenir();
        const an = 3000 + suivant();
        expect(await b.dossiers.prochainNumero(an)).toBe(1);
        expect(await b.dossiers.prochainNumero(an)).toBe(2);
        expect(await b.dossiers.prochainNumero(an + 1)).toBe(1);
        const numeros = await Promise.all(
          Array.from({ length: 20 }, () => b.dossiers.prochainNumero(an)),
        );
        expect([...numeros].sort((x, y) => x - y)).toEqual(
          Array.from({ length: 20 }, (_, i) => i + 3),
        );
      });
    });

    describe("Prelevements", () => {
      /** Un dossier versé (6,48 M dus) et de quoi réserver dessus. */
      const dossierVerse = async () => {
        const d = await decor(verse());
        await d.b.dossiers.ajouter(d.dossier);
        const demande = (venteId: string, souhaite: number, totalDu = 6_480_000) => ({
          cle: `prelevement:${venteId}`,
          dossierId: d.dossier.id,
          agenceId: d.agenceId,
          venteId,
          montantVente: souhaite * 12,
          souhaite,
          totalDu,
          at: apres(120),
        });
        return { ...d, demande };
      };

      it("réserve ce qui est souhaité et garde la réservation telle quelle", async () => {
        const { b, dossier, agenceId, demande } = await dossierVerse();
        const venteId = `vente-${randomUUID()}`;
        const r = await b.prelevements.reserver(demande(venteId, 640));
        expect(r).toEqual({
          resultat: "reserve",
          prelevement: {
            cle: `prelevement:${venteId}`,
            dossierId: dossier.id,
            agenceId,
            venteId,
            montantVente: 640 * 12,
            montant: 640,
            at: apres(120),
            etat: "en_attente",
            reference: null,
          },
        });
        expect(await b.prelevements.enAttente()).toEqual(
          expect.arrayContaining([expect.objectContaining({ venteId, montant: 640 })]),
        );
        expect(await b.prelevements.totalReserve(dossier.id)).toBe(640);
        expect(await b.prelevements.totalExecute(dossier.id)).toBe(0);
      });

      it("une vente ne se compte qu'une fois : rejouer la clé répond « existe »", async () => {
        const { b, dossier, demande } = await dossierVerse();
        const venteId = `vente-${randomUUID()}`;
        expect((await b.prelevements.reserver(demande(venteId, 500))).resultat).toBe("reserve");
        expect(await b.prelevements.reserver(demande(venteId, 500))).toEqual({
          resultat: "existe",
        });
        expect(await b.prelevements.totalReserve(dossier.id)).toBe(500);
      });

      it("ne réserve jamais plus que ce qui reste dû, puis répond « solde nul »", async () => {
        const { b, dossier, demande } = await dossierVerse();
        const a = await b.prelevements.reserver(demande(`v-${randomUUID()}`, 700, 1000));
        expect(a).toMatchObject({ resultat: "reserve", prelevement: { montant: 700 } });
        const rogne = await b.prelevements.reserver(demande(`v-${randomUUID()}`, 700, 1000));
        expect(rogne).toMatchObject({ resultat: "reserve", prelevement: { montant: 300 } });
        expect(await b.prelevements.reserver(demande(`v-${randomUUID()}`, 700, 1000))).toEqual({
          resultat: "solde_nul",
        });
        expect(await b.prelevements.totalReserve(dossier.id)).toBe(1000);
      });

      it("de douze ventes simultanées, le total réservé ne dépasse jamais ce qui est dû", async () => {
        const { b, dossier, demande } = await dossierVerse();
        const rendus = await Promise.all(
          Array.from({ length: 12 }, () =>
            b.prelevements.reserver(demande(`v-${randomUUID()}`, 400, 2500)),
          ),
        );
        // 400 × 6 = 2 400, puis 100 pour le dernier : 2 500 en tout, jamais un franc de plus.
        expect(await b.prelevements.totalReserve(dossier.id)).toBe(2500);
        expect(rendus.filter((r) => r.resultat === "reserve")).toHaveLength(7);
        expect(rendus.filter((r) => r.resultat === "solde_nul")).toHaveLength(5);
      });

      it("confirmer exécute, une seule fois ; annuler ne défait qu'une réservation en attente", async () => {
        const { b, dossier, demande } = await dossierVerse();
        const v1 = `v-${randomUUID()}`;
        const v2 = `v-${randomUUID()}`;
        await b.prelevements.reserver(demande(v1, 800));
        await b.prelevements.reserver(demande(v2, 200));
        await b.prelevements.confirmer(`prelevement:${v1}`, "PREL-1");
        await b.prelevements.confirmer(`prelevement:${v1}`, "PREL-AUTRE");
        expect(await b.prelevements.totalExecute(dossier.id)).toBe(800);
        const enAttente = await b.prelevements.enAttente();
        expect(enAttente.map((p) => p.venteId)).toContain(v2);
        expect(enAttente.map((p) => p.venteId)).not.toContain(v1);

        await b.prelevements.annuler(`prelevement:${v2}`);
        expect(await b.prelevements.totalReserve(dossier.id)).toBe(800);
        // Un prélèvement exécuté est de l'argent parti : annuler n'y touche pas.
        await b.prelevements.annuler(`prelevement:${v1}`);
        expect(await b.prelevements.totalExecute(dossier.id)).toBe(800);
        expect(await b.prelevements.totalReserve(dossier.id)).toBe(800);
        // La vente annulée peut être reprise.
        expect((await b.prelevements.reserver(demande(v2, 200))).resultat).toBe("reserve");
      });

      it("confirmer ou annuler une clé inconnue ne fait rien", async () => {
        const { b } = await dossierVerse();
        await b.prelevements.confirmer("prelevement:inconnue", "REF");
        await b.prelevements.annuler("prelevement:inconnue");
      });

      it("deux dossiers ont chacun leur total", async () => {
        const a = await dossierVerse();
        const autre = await dossierVerse();
        await a.b.prelevements.reserver(a.demande(`v-${randomUUID()}`, 900));
        await a.b.prelevements.reserver(autre.demande(`v-${randomUUID()}`, 100));
        expect(await a.b.prelevements.totalReserve(a.dossier.id)).toBe(900);
        expect(await a.b.prelevements.totalReserve(autre.dossier.id)).toBe(100);
        expect(await a.b.prelevements.totalReserve("AV-2027-0000")).toBe(0);
      });
    });

    describe("LotsPaie", () => {
      it("garde un lot tel qu'il a été écrit, lignes dans l'ordre, numéros MoMo compris", async () => {
        const b = await obtenir();
        const agenceId = await b.compagnie();
        const patronId = await b.personne();
        const lignes = [
          uneLignePaie(await b.personne(), { nom: "Zacharie Fotso", montant: 90_000 }),
          uneLignePaie(await b.personne(), {
            nom: "Éloïse Tchamba",
            operateur: "orange",
            telephone: "+237699887766",
            montant: 120_000,
          }),
          uneLignePaie(await b.personne(), {
            nom: "Sans compte",
            operateur: null,
            telephone: null,
            montant: 60_000,
          }),
        ];
        const lot = unLot(agenceId, patronId, lignes);
        expect(await b.lots.creer(lot)).toBe(true);
        expect(await b.lots.trouver(agenceId, "2027-01")).toEqual(lot);
        expect(await b.lots.trouver(agenceId, "2027-02")).toBeNull();
        expect(await b.lots.trouver(await b.compagnie(), "2027-01")).toBeNull();
        expect(await b.lots.trouver("pas-un-uuid", "2027-01")).toBeNull();
      });

      it("une agence n'a qu'un lot par mois : le second est refusé, sans rien écrire", async () => {
        const b = await obtenir();
        const agenceId = await b.compagnie();
        const patronId = await b.personne();
        const premier = unLot(agenceId, patronId, [uneLignePaie(await b.personne())]);
        expect(await b.lots.creer(premier)).toBe(true);
        const second = unLot(agenceId, patronId, [uneLignePaie(await b.personne())]);
        expect(await b.lots.creer(second)).toBe(false);
        expect(await b.lots.trouver(agenceId, "2027-01")).toEqual(premier);
        // Un autre mois, une autre agence : sans problème.
        expect(
          await b.lots.creer(
            unLot(agenceId, patronId, [uneLignePaie(await b.personne())], { mois: "2027-02" }),
          ),
        ).toBe(true);
        expect(
          await b.lots.creer(
            unLot(await b.compagnie(), patronId, [uneLignePaie(await b.personne())]),
          ),
        ).toBe(true);
      });

      it("de cinq lancements simultanés du même mois, un seul lot est créé", async () => {
        const b = await obtenir();
        const agenceId = await b.compagnie();
        const patronId = await b.personne();
        const personne = await b.personne();
        const essais = await Promise.all(
          Array.from({ length: 5 }, () =>
            b.lots.creer(unLot(agenceId, patronId, [uneLignePaie(personne)])),
          ),
        );
        expect(essais.filter(Boolean)).toHaveLength(1);
      });

      it("marquerLigne modifie une ligne, et elle seule", async () => {
        const b = await obtenir();
        const agenceId = await b.compagnie();
        const [p1, p2] = [await b.personne(), await b.personne()];
        const lot = unLot(agenceId, await b.personne(), [uneLignePaie(p1), uneLignePaie(p2)]);
        await b.lots.creer(lot);
        expect(
          await b.lots.marquerLigne(
            lot.id,
            p1,
            { etat: "verse", reference: "MOMO-1" },
            "en_attente",
          ),
        ).toBe(true);
        const lu = (await b.lots.trouver(agenceId, "2027-01"))!;
        expect(lu.lignes[0]).toMatchObject({ etat: "verse", reference: "MOMO-1", motif: null });
        expect(lu.lignes[1]).toEqual(lot.lignes[1]);
        // Inconnue : rien ne change.
        expect(await b.lots.marquerLigne(lot.id, randomUUID(), { etat: "verse" })).toBe(false);
        expect(await b.lots.marquerLigne(randomUUID(), p1, { etat: "verse" })).toBe(false);
        expect(await b.lots.marquerLigne("pas-un-uuid", p1, { etat: "verse" })).toBe(false);
      });

      it("depuisEtat : la ligne doit y être encore, sinon rien ne change", async () => {
        const b = await obtenir();
        const agenceId = await b.compagnie();
        const p = await b.personne();
        const lot = unLot(agenceId, await b.personne(), [uneLignePaie(p)]);
        await b.lots.creer(lot);
        expect(await b.lots.marquerLigne(lot.id, p, { etat: "refuse" }, "verse")).toBe(false);
        expect(
          await b.lots.marquerLigne(
            lot.id,
            p,
            { etat: "refuse", motif: "numéro inconnu" },
            "en_attente",
          ),
        ).toBe(true);
        expect(await b.lots.marquerLigne(lot.id, p, { etat: "verse" }, "en_attente")).toBe(false);
        expect((await b.lots.trouver(agenceId, "2027-01"))!.lignes[0]).toMatchObject({
          etat: "refuse",
          motif: "numéro inconnu",
        });
      });

      it("de cinq relances simultanées d'un salaire refusé, une seule passe", async () => {
        const b = await obtenir();
        const agenceId = await b.compagnie();
        const p = await b.personne();
        const lot = unLot(agenceId, await b.personne(), [
          uneLignePaie(p, { etat: "refuse", motif: "refusé par l'opérateur" }),
        ]);
        await b.lots.creer(lot);
        const essais = await Promise.all(
          [1, 2, 3, 4, 5].map(() =>
            b.lots.marquerLigne(
              lot.id,
              p,
              { etat: "en_attente", tentative: 1, motif: null },
              "refuse",
            ),
          ),
        );
        expect(essais.filter(Boolean)).toHaveLength(1);
        expect((await b.lots.trouver(agenceId, "2027-01"))!.lignes[0]).toMatchObject({
          etat: "en_attente",
          tentative: 1,
          motif: null,
        });
      });

      it("un compte MoMo ajouté après coup se reprend (opérateur et numéro), le montant reste figé", async () => {
        const b = await obtenir();
        const agenceId = await b.compagnie();
        const p = await b.personne();
        const lot = unLot(agenceId, await b.personne(), [
          uneLignePaie(p, {
            operateur: null,
            telephone: null,
            etat: "refuse",
            motif: "compte MoMo absent",
          }),
        ]);
        await b.lots.creer(lot);
        expect(
          await b.lots.marquerLigne(
            lot.id,
            p,
            {
              etat: "en_attente",
              tentative: 1,
              motif: null,
              operateur: "orange",
              telephone: "+237699001122",
            },
            "refuse",
          ),
        ).toBe(true);
        expect((await b.lots.trouver(agenceId, "2027-01"))!.lignes[0]).toMatchObject({
          operateur: "orange",
          telephone: "+237699001122",
          montant: 150_000,
          tentative: 1,
        });
      });

      it("incomplets rend les lots qui ont encore une ligne en attente", async () => {
        const b = await obtenir();
        const agenceId = await b.compagnie();
        const patronId = await b.personne();
        const [p1, p2, p3] = [await b.personne(), await b.personne(), await b.personne()];
        const fini = unLot(
          agenceId,
          patronId,
          [uneLignePaie(p1, { etat: "verse", reference: "R" })],
          {
            mois: "2027-03",
          },
        );
        const encours = unLot(
          agenceId,
          patronId,
          [uneLignePaie(p2), uneLignePaie(p3, { etat: "refuse" })],
          {
            mois: "2027-04",
          },
        );
        await b.lots.creer(fini);
        await b.lots.creer(encours);
        const ids = (await b.lots.incomplets()).map((l) => l.id);
        expect(ids).toContain(encours.id);
        expect(ids).not.toContain(fini.id);
        await b.lots.marquerLigne(encours.id, p2, { etat: "verse", reference: "R2" }, "en_attente");
        expect((await b.lots.incomplets()).map((l) => l.id)).not.toContain(encours.id);
      });
    });

    describe("ReglagesFinancement", () => {
      it("sans réglage écrit : paiement en 2 fois coupé, paie le vendredi", async () => {
        const b = await obtenir();
        expect(await b.reglages.lire(await b.compagnie())).toEqual({
          billetEnDeuxFois: false,
          jourDePaie: "vendredi",
        });
        expect(await b.reglages.lire("pas-un-uuid")).toEqual({
          billetEnDeuxFois: false,
          jourDePaie: "vendredi",
        });
      });

      it("active et coupe le paiement en 2 fois, agence par agence", async () => {
        const b = await obtenir();
        const a = await b.compagnie();
        const autre = await b.compagnie();
        await b.reglages.definirBilletEnDeuxFois(a, true);
        expect((await b.reglages.lire(a)).billetEnDeuxFois).toBe(true);
        expect((await b.reglages.lire(autre)).billetEnDeuxFois).toBe(false);
        await b.reglages.definirBilletEnDeuxFois(a, true);
        await b.reglages.definirBilletEnDeuxFois(a, false);
        expect(await b.reglages.lire(a)).toEqual({
          billetEnDeuxFois: false,
          jourDePaie: "vendredi",
        });
      });
    });

    describe("ConventionsFinancement et OffresCredit", () => {
      it("la convention de l'agence : absente, puis lue telle qu'elle a été écrite", async () => {
        const b = await obtenir();
        const a = await b.compagnie();
        expect(await b.conventions.pour(a)).toBeNull();
        expect(await b.conventions.pour("pas-un-uuid")).toBeNull();
        await b.poserConvention(a, { partenaire: "Banque Atlantique", signeeA: null });
        expect(await b.conventions.pour(a)).toEqual({
          partenaire: "Banque Atlantique",
          signeeA: null,
        });
        const signee = await b.compagnie();
        await b.poserConvention(signee, {
          partenaire: "Afriland First Bank",
          signeeA: apres(-1440),
        });
        expect(await b.conventions.pour(signee)).toEqual({
          partenaire: "Afriland First Bank",
          signeeA: apres(-1440),
        });
        expect(await b.conventions.pour(await b.compagnie())).toBeNull();
      });

      it("l'offre de crédit matériel de l'agence : absente, puis lue telle qu'elle a été écrite", async () => {
        const b = await obtenir();
        const a = await b.compagnie();
        expect(await b.offres.pour(a)).toBeNull();
        const offre: OffreCreditMateriel = {
          description: "Deux autocars Yutong de 59 places",
          montantTotal: 48_000_000,
          mensualites: 24,
          montantMensualite: 2_200_000,
        };
        await b.poserOffre(a, offre);
        expect(await b.offres.pour(a)).toEqual(offre);
        expect(await b.offres.pour(await b.compagnie())).toBeNull();
        expect(await b.offres.pour("pas-un-uuid")).toBeNull();
      });
    });
  });
}

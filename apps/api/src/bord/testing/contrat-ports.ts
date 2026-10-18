import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import type { ControleStocke } from "../modeles";
import type {
  ControlesBord,
  DepensesBord,
  IncidentsBord,
  PassagesRoute,
  RetardsDepart,
  VentesEnRoute,
} from "../ports";

/**
 * Le contrat des six ports du bord : les mêmes tests passent sur la mémoire et sur PostgreSQL (le fichier
 * d'intégration ajoute ce que seule la base garantit : clés étrangères, ajout seul, contrôle clos figé).
 */

export interface BancBord {
  ventes: VentesEnRoute;
  passages: PassagesRoute;
  depenses: DepensesBord;
  incidents: IncidentsBord;
  retards: RetardsDepart;
  controles: ControlesBord;
  /** Un départ (en base : une ligne `depart`). */
  nouveauDepart(): Promise<string>;
  /** Une personne : convoyeur, chauffeur ou contrôleur (en base : une ligne `personne`). */
  nouvellePersonne(): Promise<string>;
  /** Un billet du départ (en base : une ligne `billet`). */
  nouveauBillet(departId: string): Promise<string>;
  fermer(): Promise<void>;
}

const T = (hhmm: string) => `2026-11-02T${hhmm}:00.000+01:00`;
const position = { latitude: 3.9, longitude: 10.1, precisionM: 12 };

export function contratPortsBord(nom: string, creer: () => Promise<BancBord>): void {
  describe(nom, () => {
    let banc: BancBord | null = null;
    const b = async (): Promise<BancBord> => (banc ??= await creer());
    afterAll(async () => banc?.fermer());

    describe("ventes en route", () => {
      it("garde le détail de la vente, une seule fois par billet, dans l'ordre des heures", async () => {
        const { ventes, nouveauDepart, nouvellePersonne, nouveauBillet } = await b();
        const departId = await nouveauDepart();
        const convoyeurId = await nouvellePersonne();
        const premier = await nouveauBillet(departId);
        const second = await nouveauBillet(departId);
        const vente = (
          billetId: string,
          venduA: string,
          p = position as typeof position | null,
        ) => ({
          billetId,
          departId,
          convoyeurId,
          arretMontee: "Douala",
          arretDescente: "Édéa",
          position: p,
          venduA,
        });
        expect(await ventes.ajouter(vente(second, T("10:00"), null))).toBe(true);
        expect(await ventes.ajouter(vente(premier, T("09:00")))).toBe(true);
        expect(await ventes.ajouter(vente(premier, T("11:00")))).toBe(false);
        const lues = await ventes.duDepart(departId);
        expect(lues.map((v) => v.billetId)).toEqual([premier, second]);
        expect(lues[0]).toEqual(vente(premier, T("09:00")));
        expect(lues[1]?.position).toBeNull();
        expect(await ventes.duDepart(await nouveauDepart())).toEqual([]);
      });
    });

    describe("passages", () => {
      it("garde les scans et les arrivées en ajout seul, filtrés par genre, du plus ancien au plus récent", async () => {
        const { passages, nouveauDepart, nouvellePersonne, nouveauBillet } = await b();
        const departId = await nouveauDepart();
        const auteurId = await nouvellePersonne();
        const billetId = await nouveauBillet(departId);
        const scan = {
          id: randomUUID(),
          genre: "scan" as const,
          departId,
          auteurId,
          arret: "Édéa",
          billetId,
          resultat: "monte" as const,
          position: null,
          at: T("10:00"),
        };
        const arrivee = {
          id: randomUUID(),
          genre: "arrivee" as const,
          departId,
          auteurId,
          arret: "Édéa",
          billetId: null,
          resultat: null,
          position,
          at: T("09:30"),
        };
        expect(await passages.ajouter(scan)).toBe(true);
        expect(await passages.ajouter(arrivee)).toBe(true);
        expect(await passages.ajouter({ ...scan, arret: "Autre" })).toBe(false);
        expect(await passages.duDepart(departId)).toEqual([arrivee, scan]);
        expect(await passages.duDepart(departId, "scan")).toEqual([scan]);
        expect(await passages.duDepart(departId, "arrivee")).toEqual([arrivee]);
      });
    });

    describe("dépenses", () => {
      it("garde la catégorie, le justificatif et l'auteur ; un identifiant ne s'écrit qu'une fois", async () => {
        const { depenses, nouveauDepart, nouvellePersonne } = await b();
        const departId = await nouveauDepart();
        const auteurId = await nouvellePersonne();
        const ligne = (
          montant: number,
          categorie: "carburant" | "peage" | "autre",
          at: string,
        ) => ({
          id: randomUUID(),
          departId,
          categorie,
          libelle: `Dépense ${categorie}`,
          montant,
          justificatifRef: "photo-1.jpg",
          auteurId,
          saisieA: at,
        });
        const peage = ligne(2000, "peage", T("09:30"));
        const carburant = ligne(25_000, "carburant", T("09:00"));
        expect(await depenses.ajouter(peage)).toBe(true);
        expect(await depenses.ajouter(carburant)).toBe(true);
        expect(await depenses.ajouter({ ...peage, montant: 1 })).toBe(false);
        expect(await depenses.duDepart(departId)).toEqual([carburant, peage]);
        expect(await depenses.duDepart(await nouveauDepart())).toEqual([]);
      });
    });

    describe("incidents", () => {
      it("garde la nature exacte, la note et la position ; un identifiant ne s'écrit qu'une fois", async () => {
        const { incidents, nouveauDepart, nouvellePersonne } = await b();
        const departId = await nouveauDepart();
        const auteurId = await nouvellePersonne();
        const accident = {
          id: randomUUID(),
          departId,
          nature: "accident" as const,
          description: "Pneu éclaté",
          note: "Pneu éclaté",
          position,
          auteurId,
          signaleA: T("10:00"),
        };
        const panne = {
          ...accident,
          id: randomUUID(),
          nature: "panne" as const,
          description: "Panne",
          note: null,
          position: null,
          signaleA: T("09:00"),
        };
        expect(await incidents.ajouter(accident)).toBe(true);
        expect(await incidents.ajouter(panne)).toBe(true);
        expect(await incidents.ajouter({ ...accident, note: "autre" })).toBe(false);
        expect(await incidents.duDepart(departId)).toEqual([panne, accident]);
      });
    });

    describe("retards", () => {
      it("note le retard annoncé, le dernier l'emporte", async () => {
        const { retards, nouveauDepart } = await b();
        const departId = await nouveauDepart();
        expect(await retards.lire(departId)).toBeNull();
        await retards.noter(departId, 25, T("09:00"));
        expect(await retards.lire(departId)).toEqual({ departId, minutes: 25 });
        await retards.noter(departId, 40, T("09:10"));
        expect(await retards.lire(departId)).toEqual({ departId, minutes: 40 });
      });
    });

    describe("contrôles inopinés", () => {
      const ouvert = (departId: string, controleurId: string): ControleStocke => ({
        id: randomUUID(),
        departId,
        controleurId,
        lieu: "Douala",
        ouvertA: T("09:00"),
        clotureA: null,
        liste: null,
        tetes: null,
        ecart: null,
        envoyeAuPatron: false,
      });

      it("ouvre un contrôle, jamais deux ouverts pour la même personne", async () => {
        const { controles, nouveauDepart, nouvellePersonne } = await b();
        const departId = await nouveauDepart();
        const controleurId = await nouvellePersonne();
        expect(await controles.ouvertDe(controleurId)).toBeNull();
        const un = ouvert(departId, controleurId);
        expect(await controles.ouvrir(un)).toEqual({ controle: un, cree: true });
        expect(await controles.ouvertDe(controleurId)).toEqual(un);
        const second = await controles.ouvrir(ouvert(departId, controleurId));
        expect(second.cree).toBe(false);
        expect(second.controle.id).toBe(un.id);
        expect(await controles.trouver(un.id)).toEqual(un);
        expect(await controles.trouver(randomUUID())).toBeNull();
        expect(await controles.trouver("pas-un-uuid")).toBeNull();
        expect((await controles.duDepart(departId)).map((c) => c.id)).toEqual([un.id]);
      });

      it("deux ouvertures simultanées ne créent qu'un contrôle", async () => {
        const { controles, nouveauDepart, nouvellePersonne } = await b();
        const departId = await nouveauDepart();
        const controleurId = await nouvellePersonne();
        const res = await Promise.all([
          controles.ouvrir(ouvert(departId, controleurId)),
          controles.ouvrir(ouvert(departId, controleurId)),
        ]);
        expect(res.filter((r) => r.cree)).toHaveLength(1);
        expect(res[0]?.controle.id).toBe(res[1]?.controle.id);
      });

      it("pose et remplace le constat d'un siège", async () => {
        const { controles, nouveauDepart, nouvellePersonne } = await b();
        const c = (await controles.ouvrir(ouvert(await nouveauDepart(), await nouvellePersonne())))
          .controle;
        await controles.constater(c.id, 7, "sans_billet", T("09:01"));
        await controles.constater(c.id, 3, "scanne", T("09:02"));
        await controles.constater(c.id, 7, "libre", T("09:03"));
        expect(await controles.constats(c.id)).toEqual([
          { controleId: c.id, siege: 3, constat: "scanne", at: T("09:02") },
          { controleId: c.id, siege: 7, constat: "libre", at: T("09:03") },
        ]);
      });

      it("note une régularisation par billet et un signalement par événement", async () => {
        const { controles, nouveauDepart, nouvellePersonne, nouveauBillet } = await b();
        const departId = await nouveauDepart();
        const c = (await controles.ouvrir(ouvert(departId, await nouvellePersonne()))).controle;
        const convoyeurId = await nouvellePersonne();
        const billetId = await nouveauBillet(departId);
        const regul = { billetId, controleId: c.id, siege: 10, prix: 1000, at: T("09:05") };
        expect(await controles.regulariser(regul)).toBe(true);
        expect(await controles.regulariser({ ...regul, prix: 2000 })).toBe(false);
        expect(await controles.regularisations(c.id)).toEqual([regul]);

        const signal = {
          evenementId: randomUUID(),
          controleId: c.id,
          departId,
          convoyeurId,
          siege: 10,
          montantDeclare: 1000,
          note: "Dit avoir payé",
          at: T("09:06"),
          patronPrevenu: false,
        };
        expect(await controles.signaler(signal)).toBe(true);
        expect(await controles.signaler({ ...signal, siege: 11 })).toBe(false);
        expect(await controles.signalements(c.id)).toEqual([signal]);
        await controles.marquerPatronPrevenu(signal.evenementId);
        expect((await controles.signalements(c.id))[0]?.patronPrevenu).toBe(true);
      });

      it("clôture une fois : comptes figés, plus rien d'ouvert, un nouveau contrôle est possible", async () => {
        const { controles, nouveauDepart, nouvellePersonne } = await b();
        const departId = await nouveauDepart();
        const controleurId = await nouvellePersonne();
        const c = (await controles.ouvrir(ouvert(departId, controleurId))).controle;
        const clos = await controles.clore(c.id, {
          clotureA: T("09:30"),
          liste: 30,
          tetes: 31,
          ecart: 1,
        });
        expect(clos).toEqual({
          ...c,
          clotureA: T("09:30"),
          liste: 30,
          tetes: 31,
          ecart: 1,
        });
        expect(
          await controles.clore(c.id, { clotureA: T("09:40"), liste: 1, tetes: 1, ecart: 0 }),
        ).toBeNull();
        expect(await controles.trouver(c.id)).toEqual(clos);
        expect(await controles.ouvertDe(controleurId)).toBeNull();

        await controles.marquerEnvoye(c.id);
        expect((await controles.trouver(c.id))?.envoyeAuPatron).toBe(true);

        const suivant = await controles.ouvrir(ouvert(departId, controleurId));
        expect(suivant.cree).toBe(true);
        expect(suivant.controle.id).not.toBe(c.id);
      });

      it("deux clôtures simultanées : une seule passe", async () => {
        const { controles, nouveauDepart, nouvellePersonne } = await b();
        const c = (await controles.ouvrir(ouvert(await nouveauDepart(), await nouvellePersonne())))
          .controle;
        const a = { clotureA: T("09:30"), liste: 2, tetes: 2, ecart: 0 };
        const res = await Promise.all([controles.clore(c.id, a), controles.clore(c.id, a)]);
        expect(res.filter((r) => r !== null)).toHaveLength(1);
      });
    });
  });
}

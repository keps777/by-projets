import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AlertesSync,
  AppareilsSync,
  JournalSync,
  SiegesSync,
  type AlerteSync,
  type ConflitStocke,
  type EntreeJournal,
} from "../ports";
import type { OperationSiege } from "../sieges";

/**
 * Contrat des ports de la synchronisation : les mêmes tests s'exécutent sur les adaptateurs en
 * mémoire et sur les adaptateurs PostgreSQL. Un comportement que la mémoire a et que PostgreSQL n'a
 * pas (ou l'inverse) fait échouer l'un des deux.
 *
 * Chaque test prend ses propres identifiants : le journal et les gestes sur les sièges sont en ajout
 * seul, on ne les vide pas entre deux tests.
 */

export interface BancSync {
  appareils: AppareilsSync;
  journal: JournalSync;
  sieges: SiegesSync;
  alertes: AlertesSync;
  /** Une gare (et sa compagnie) neuves. En base, les lignes sont créées (clé étrangère). */
  nouvelleGare(): Promise<{ gareId: string; compagnieId: string }>;
  fermer(): Promise<void>;
}

const INSTANT = "2027-01-05T09:00:00.000+01:00";

const evenement = (surcharge: Partial<EntreeJournal["evenement"]> = {}) => ({
  id: randomUUID(),
  type: "billet.vendu",
  at: INSTANT,
  appareilId: "tel-1",
  auteurId: "auteur-1",
  cible: { type: "billet", id: "billet-1" },
  numeroPlage: 12,
  donnees: { billetId: "billet-1", departId: "depart-1", siege: 7, prix: 4000 },
  ...surcharge,
});

const entree = (
  surcharge: Partial<EntreeJournal["evenement"]> = {},
  reste: Partial<Omit<EntreeJournal, "seq" | "evenement">> = {},
): Omit<EntreeJournal, "seq"> => ({
  evenement: evenement(surcharge),
  recuA: "2027-01-05T09:05:00.000+01:00",
  ordreAppareil: 1,
  origine: "appareil",
  ...reste,
});

const operation = (surcharge: Partial<OperationSiege> = {}): OperationSiege => ({
  evenementId: randomUUID(),
  billetId: `billet-${randomUUID()}`,
  kind: "prend",
  at: Date.parse("2027-01-05T09:00:00.000+01:00"),
  appareilId: "tel-1",
  auteurId: "auteur-1",
  ...surcharge,
});

const conflit = (surcharge: Partial<ConflitStocke> = {}): ConflitStocke => ({
  evenementId: randomUUID(),
  billetId: "billet-perdant",
  departId: "depart-1",
  siege: 7,
  gagnantBilletId: "billet-gagnant",
  appareilId: "tel-1",
  auteurId: "auteur-1",
  detecteA: "2027-01-05T09:10:00.000+01:00",
  ...surcharge,
});

export function contratPortsSync(titre: string, creer: () => Promise<BancSync>): void {
  describe(titre, () => {
    let banc: BancSync;
    beforeAll(async () => {
      banc = await creer();
    });
    afterAll(async () => {
      await banc?.fermer();
    });

    describe("appareils", () => {
      it("un appareil inconnu n'existe pas", async () => {
        expect(await banc.appareils.trouver(`inconnu-${randomUUID()}`)).toBeNull();
      });

      it("déclare un appareil avec des valeurs par défaut et le retrouve tel quel", async () => {
        const id = `tel-${randomUUID()}`;
        const fiche = await banc.appareils.declarer({ id });
        expect(fiche).toEqual({
          id,
          cle: null,
          genre: "autre",
          rang: null,
          nbConvoyeurs: null,
          plage: null,
          gareId: null,
          compagnieId: null,
          derniereSyncA: null,
          dernierOrdre: 0,
          octroi: null,
          retire: false,
        });
        expect(await banc.appareils.trouver(id)).toEqual(fiche);
      });

      it("déclarer de nouveau complète la fiche sans écraser ce qui n'est pas donné", async () => {
        const gare = await banc.nouvelleGare();
        const id = `tel-${randomUUID()}`;
        await banc.appareils.declarer({ id, genre: "guichet", rang: 2, ...gare });
        await banc.appareils.mettreAJour(id, { dernierOrdre: 5 });
        const fiche = await banc.appareils.declarer({ id, nbConvoyeurs: 3 });
        expect(fiche).toMatchObject({
          id,
          genre: "guichet",
          rang: 2,
          nbConvoyeurs: 3,
          gareId: gare.gareId,
          compagnieId: gare.compagnieId,
          dernierOrdre: 5,
        });
      });

      it("enregistre la clé publique ; sur un appareil inconnu, ne fait rien", async () => {
        const id = `tel-${randomUUID()}`;
        await banc.appareils.declarer({ id });
        const cle = { kty: "EC", crv: "P-256", x: "abc", y: "def" };
        await banc.appareils.enregistrerCle(id, cle);
        expect((await banc.appareils.trouver(id))?.cle).toEqual(cle);
        await banc.appareils.enregistrerCle(`fantome-${randomUUID()}`, cle);
      });

      it("met à jour la synchro, le rang de file, l'octroi, le retrait et la plage", async () => {
        const id = `tel-${randomUUID()}`;
        await banc.appareils.declarer({ id });
        const octroi = {
          option: "debloquer_4h" as const,
          superviseurId: "sup-1",
          accordeA: "2027-01-05T09:00:00.000+01:00",
          debloqueJusqua: "2027-01-05T13:00:00.000+01:00",
        };
        await banc.appareils.mettreAJour(id, {
          derniereSyncA: "2027-01-05T09:30:00.000+01:00",
          dernierOrdre: 12,
          octroi,
          retire: true,
          plage: { debut: 1001, fin: 1999 },
        });
        expect(await banc.appareils.trouver(id)).toMatchObject({
          derniereSyncA: "2027-01-05T09:30:00.000+01:00",
          dernierOrdre: 12,
          octroi,
          retire: true,
          plage: { debut: 1001, fin: 1999 },
        });
        await banc.appareils.mettreAJour(id, { octroi: null, plage: null });
        expect(await banc.appareils.trouver(id)).toMatchObject({
          octroi: null,
          plage: null,
          dernierOrdre: 12,
          retire: true,
        });
      });

      it("une mise à jour sur un appareil inconnu ne crée rien", async () => {
        const id = `fantome-${randomUUID()}`;
        await banc.appareils.mettreAJour(id, { dernierOrdre: 3 });
        expect(await banc.appareils.trouver(id)).toBeNull();
      });

      it("ce qu'on reçoit est une copie : le modifier ne change pas la fiche", async () => {
        const id = `tel-${randomUUID()}`;
        await banc.appareils.declarer({ id, genre: "guichet", rang: 1 });
        const fiche = (await banc.appareils.trouver(id))!;
        fiche.rang = 3;
        expect((await banc.appareils.trouver(id))?.rang).toBe(1);
      });
    });

    describe("journal d'événements", () => {
      it("écrit un événement avec un rang d'arrivée, le retrouve tel quel, et sait qu'il existe", async () => {
        const e = entree();
        expect(await banc.journal.existe(e.evenement.id)).toBe(false);
        const ecrit = await banc.journal.ajouter(e);
        expect(ecrit).toMatchObject({ ...e, seq: expect.any(Number) });
        expect(await banc.journal.existe(e.evenement.id)).toBe(true);
        const [relu] = await banc.journal.lister({ appareilId: e.evenement.appareilId! });
        expect(relu).toBeDefined();
        const trouve = (await banc.journal.lister({ type: "billet.vendu" })).find(
          (l) => l.evenement.id === e.evenement.id,
        );
        expect(trouve).toEqual(ecrit);
      });

      it("rejouer le même identifiant n'écrit rien et répond null", async () => {
        const e = entree();
        expect(await banc.journal.ajouter(e)).not.toBeNull();
        expect(await banc.journal.ajouter(e)).toBeNull();
        expect(await banc.journal.ajouter({ ...e, ordreAppareil: 9 })).toBeNull();
        const lignes = (await banc.journal.lister({})).filter(
          (l) => l.evenement.id === e.evenement.id,
        );
        expect(lignes).toHaveLength(1);
        expect(lignes[0]?.ordreAppareil).toBe(1);
      });

      it("vingt requêtes simultanées qui portent le même événement n'en écrivent qu'un", async () => {
        const e = entree();
        const reponses = await Promise.all(
          Array.from({ length: 20 }, () => banc.journal.ajouter(e)),
        );
        expect(reponses.filter((r) => r !== null)).toHaveLength(1);
        const lignes = (await banc.journal.lister({})).filter(
          (l) => l.evenement.id === e.evenement.id,
        );
        expect(lignes).toHaveLength(1);
      });

      it("des événements différents reçus en même temps ont chacun un rang d'arrivée distinct", async () => {
        const appareilId = `tel-${randomUUID()}`;
        const reponses = await Promise.all(
          Array.from({ length: 15 }, (_, i) =>
            banc.journal.ajouter(entree({ appareilId }, { ordreAppareil: i + 1 })),
          ),
        );
        const rangs = reponses.map((r) => r!.seq);
        expect(new Set(rangs).size).toBe(15);
        const lus = await banc.journal.lister({ appareilId });
        expect(lus.map((l) => l.seq)).toEqual([...rangs].sort((a, b) => a - b));
      });

      it("les rangs d'arrivée montent, et `depuisSeq` ne rend que la suite", async () => {
        const appareilId = `tel-${randomUUID()}`;
        const a = (await banc.journal.ajouter(entree({ appareilId })))!;
        const b = (await banc.journal.ajouter(entree({ appareilId })))!;
        const c = (await banc.journal.ajouter(entree({ appareilId })))!;
        expect(b.seq).toBeGreaterThan(a.seq);
        expect(c.seq).toBeGreaterThan(b.seq);
        const suite = await banc.journal.lister({ appareilId, depuisSeq: a.seq });
        expect(suite.map((l) => l.evenement.id)).toEqual([b.evenement.id, c.evenement.id]);
      });

      it("filtre par appareil et par type", async () => {
        const appareilId = `tel-${randomUUID()}`;
        await banc.journal.ajouter(entree({ appareilId, type: "billet.vendu" }));
        await banc.journal.ajouter(entree({ appareilId, type: "quai.libere", numeroPlage: null }));
        const autre = await banc.journal.ajouter(entree({ appareilId: `tel-${randomUUID()}` }));
        expect(autre).not.toBeNull();
        expect((await banc.journal.lister({ appareilId })).map((l) => l.evenement.type)).toEqual([
          "billet.vendu",
          "quai.libere",
        ]);
        const libres = await banc.journal.lister({ appareilId, type: "quai.libere" });
        expect(libres).toHaveLength(1);
        expect(libres[0]?.evenement.numeroPlage).toBeNull();
      });

      it("garde l'heure de l'appareil telle qu'il l'a écrite (la signature porte sur ce texte)", async () => {
        const e = entree({ at: "2027-01-05T09:00:00+01:00" });
        await banc.journal.ajouter(e);
        const [relu] = (await banc.journal.lister({})).filter(
          (l) => l.evenement.id === e.evenement.id,
        );
        expect(relu?.evenement.at).toBe("2027-01-05T09:00:00+01:00");
      });

      it("garde les données imbriquées, les accents et les valeurs vides", async () => {
        const donnees = {
          billetId: "b-é",
          nom: "Aïcha N'Gono — « VIP »",
          liste: [1, 2, { a: null, b: [true, false] }],
          vide: {},
          zero: 0,
          nul: null,
        };
        const e = entree({ donnees });
        await banc.journal.ajouter(e);
        const [relu] = (await banc.journal.lister({})).filter(
          (l) => l.evenement.id === e.evenement.id,
        );
        expect(relu?.evenement.donnees).toEqual(donnees);
      });

      it("un événement produit par le serveur n'a ni appareil, ni auteur, ni rang de file", async () => {
        const e = entree(
          {
            type: "billet.a_replacer",
            appareilId: null,
            auteurId: null,
            numeroPlage: null,
            cible: { type: "billet", id: "billet-x" },
          },
          { ordreAppareil: null, origine: "serveur" },
        );
        const ecrit = await banc.journal.ajouter(e);
        expect(ecrit).toMatchObject({ ordreAppareil: null, origine: "serveur" });
        expect(ecrit?.evenement).toMatchObject({ appareilId: null, auteurId: null });
        const relu = (await banc.journal.lister({ type: "billet.a_replacer" })).find(
          (l) => l.evenement.id === e.evenement.id,
        );
        expect(relu).toEqual(ecrit);
      });

      it("un identifiant mal formé n'existe pas au journal (et ne fait pas échouer la question)", async () => {
        expect(await banc.journal.existe("pas-un-uuid")).toBe(false);
        expect(await banc.journal.existe("")).toBe(false);
      });
    });

    describe("sièges et conflits", () => {
      it("ajoute un geste une fois : le même événement rejoué rend false", async () => {
        const departId = `depart-${randomUUID()}`;
        const op = operation();
        expect(await banc.sieges.ajouterOperation(departId, 7, op)).toBe(true);
        expect(await banc.sieges.ajouterOperation(departId, 7, op)).toBe(false);
        expect(await banc.sieges.ajouterOperation(departId, 7, { ...op, kind: "libere" })).toBe(
          false,
        );
        expect(await banc.sieges.operations(departId, 7)).toEqual([op]);
      });

      it("dix requêtes simultanées pour le même geste : une seule l'écrit", async () => {
        const departId = `depart-${randomUUID()}`;
        const op = operation();
        const reponses = await Promise.all(
          Array.from({ length: 10 }, () => banc.sieges.ajouterOperation(departId, 3, op)),
        );
        expect(reponses.filter(Boolean)).toHaveLength(1);
        expect(await banc.sieges.operations(departId, 3)).toHaveLength(1);
      });

      it("les gestes d'un siège ne se mélangent pas avec ceux d'un autre siège ou d'un autre départ", async () => {
        const departId = `depart-${randomUUID()}`;
        const a = operation();
        const b = operation({ kind: "libere" });
        await banc.sieges.ajouterOperation(departId, 1, a);
        await banc.sieges.ajouterOperation(departId, 2, b);
        await banc.sieges.ajouterOperation(`${departId}-bis`, 1, operation());
        expect(await banc.sieges.operations(departId, 1)).toEqual([a]);
        expect(await banc.sieges.operations(departId, 2)).toEqual([b]);
        expect(await banc.sieges.operations(departId, 3)).toEqual([]);
      });

      it("rend tous les gestes d'un siège, avec l'heure du geste à la milliseconde", async () => {
        const departId = `depart-${randomUUID()}`;
        const premier = operation({ at: Date.parse("2027-01-05T09:00:00.123+01:00") });
        const second = operation({
          at: Date.parse("2027-01-05T09:00:00.456+01:00"),
          kind: "libere",
          billetId: premier.billetId,
        });
        await banc.sieges.ajouterOperation(departId, 9, second);
        await banc.sieges.ajouterOperation(departId, 9, premier);
        const lues = await banc.sieges.operations(departId, 9);
        expect([...lues].sort((x, y) => x.at - y.at)).toEqual([premier, second]);
      });

      it("retrouve où est un billet, et la dernière indication fait foi", async () => {
        const billetId = `billet-${randomUUID()}`;
        expect(await banc.sieges.billet(billetId)).toBeNull();
        await banc.sieges.definirBillet(billetId, "depart-a", 4);
        expect(await banc.sieges.billet(billetId)).toEqual({ departId: "depart-a", siege: 4 });
        await banc.sieges.definirBillet(billetId, "depart-b", 9);
        expect(await banc.sieges.billet(billetId)).toEqual({ departId: "depart-b", siege: 9 });
      });

      it("enregistre un conflit : nouveau la première fois, déjà connu ensuite", async () => {
        const c = conflit({ departId: `depart-${randomUUID()}` });
        expect(await banc.sieges.conflit(c.evenementId)).toBeNull();
        expect(await banc.sieges.enregistrerConflit(c)).toBe(true);
        expect(await banc.sieges.enregistrerConflit(c)).toBe(false);
        expect(await banc.sieges.conflit(c.evenementId)).toEqual(c);
        expect(await banc.sieges.conflitsDuSiege(c.departId, c.siege)).toEqual([c]);
        expect(await banc.sieges.conflitsDuSiege(c.departId, c.siege + 1)).toEqual([]);
      });

      it("dix détections simultanées du même conflit : une seule est « nouvelle »", async () => {
        const c = conflit({ departId: `depart-${randomUUID()}` });
        const reponses = await Promise.all(
          Array.from({ length: 10 }, () => banc.sieges.enregistrerConflit(c)),
        );
        expect(reponses.filter(Boolean)).toHaveLength(1);
        expect(await banc.sieges.conflitsDuSiege(c.departId, c.siege)).toHaveLength(1);
      });

      it("lève un conflit une seule fois, même si deux rejeux le lèvent ensemble", async () => {
        const c = conflit({ departId: `depart-${randomUUID()}` });
        await banc.sieges.enregistrerConflit(c);
        const reponses = await Promise.all([
          banc.sieges.leverConflit(c.evenementId),
          banc.sieges.leverConflit(c.evenementId),
          banc.sieges.leverConflit(c.evenementId),
        ]);
        expect(reponses.filter(Boolean)).toHaveLength(1);
        expect(await banc.sieges.conflit(c.evenementId)).toBeNull();
        expect(await banc.sieges.leverConflit(c.evenementId)).toBe(false);
        expect(await banc.sieges.leverConflit(randomUUID())).toBe(false);
      });

      it("les conflits d'un appareil depuis un instant : ceux d'avant ne reviennent pas", async () => {
        const appareilId = `tel-${randomUUID()}`;
        const ancien = conflit({ appareilId, detecteA: "2027-01-05T09:00:00.000+01:00" });
        const recent = conflit({ appareilId, detecteA: "2027-01-05T11:00:00.000+01:00" });
        const autre = conflit({
          appareilId: `tel-${randomUUID()}`,
          detecteA: "2027-01-05T11:00:00.000+01:00",
        });
        for (const c of [ancien, recent, autre]) await banc.sieges.enregistrerConflit(c);
        const depuis = await banc.sieges.conflitsDeAppareil(
          appareilId,
          "2027-01-05T10:00:00.000+01:00",
        );
        expect(depuis).toEqual([recent]);
        const tout = await banc.sieges.conflitsDeAppareil(
          appareilId,
          "2027-01-05T09:00:00.000+01:00",
        );
        expect(tout.map((c) => c.evenementId).sort()).toEqual(
          [ancien.evenementId, recent.evenementId].sort(),
        );
      });
    });

    describe("alertes", () => {
      const alerte = (surcharge: Partial<AlerteSync> = {}): AlerteSync => ({
        id: randomUUID(),
        type: "numero_en_double",
        gravite: "alerte",
        creeeA: "2027-01-05T09:00:00.000+01:00",
        appareilId: "tel-1",
        auteurId: "auteur-1",
        evenementId: randomUUID(),
        gareId: null,
        compagnieId: null,
        details: { numeroPlage: 12, imbrique: { a: [1, 2] } },
        resolueA: null,
        ...surcharge,
      });

      it("enregistre une alerte et la retrouve telle quelle", async () => {
        const gare = await banc.nouvelleGare();
        const a = alerte({ ...gare });
        await banc.alertes.ajouter(a);
        expect(await banc.alertes.lister({ gareId: gare.gareId })).toEqual([a]);
      });

      it("une alerte sans événement, ou dont l'identifiant d'événement n'est pas un UUID, est gardée", async () => {
        const gare = await banc.nouvelleGare();
        const sans = alerte({
          ...gare,
          evenementId: null,
          creeeA: "2027-01-05T09:00:00.000+01:00",
        });
        const brut = alerte({
          ...gare,
          evenementId: "pas-un-uuid",
          type: "evenement_rejete",
          creeeA: "2027-01-05T09:01:00.000+01:00",
        });
        await banc.alertes.ajouter(sans);
        await banc.alertes.ajouter(brut);
        expect(await banc.alertes.lister({ gareId: gare.gareId })).toEqual([sans, brut]);
      });

      it("filtre par gare, par compagnie et sur les alertes ouvertes", async () => {
        const g1 = await banc.nouvelleGare();
        const g2 = await banc.nouvelleGare();
        const ouverte = alerte({ ...g1, creeeA: "2027-01-05T09:00:00.000+01:00" });
        const close = alerte({
          ...g1,
          creeeA: "2027-01-05T09:30:00.000+01:00",
          resolueA: "2027-01-05T10:00:00.000+01:00",
        });
        const ailleurs = alerte({ ...g2 });
        for (const a of [ouverte, close, ailleurs]) await banc.alertes.ajouter(a);
        expect(await banc.alertes.lister({ gareId: g1.gareId })).toEqual([ouverte, close]);
        expect(await banc.alertes.lister({ gareId: g1.gareId, ouvertesSeulement: true })).toEqual([
          ouverte,
        ]);
        expect(await banc.alertes.lister({ compagnieId: g2.compagnieId })).toEqual([ailleurs]);
        expect(await banc.alertes.lister({ gareId: randomUUID() })).toEqual([]);
      });

      it("une alerte reçue deux fois sous le même identifiant n'est gardée qu'une fois", async () => {
        const gare = await banc.nouvelleGare();
        const a = alerte({ ...gare });
        await Promise.all([banc.alertes.ajouter(a), banc.alertes.ajouter(a)]);
        expect(await banc.alertes.lister({ gareId: gare.gareId })).toHaveLength(1);
      });
    });
  });
}

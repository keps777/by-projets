import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { EntreeJournalStockee } from "../journal/ports";
import { EvenementsTraites, JournalAgenceRepository } from "../journal/ports";
import {
  AlertesPatron,
  GuichetsAgence,
  MouvementsCaisse,
  ReglesAgence,
  SessionsCaisse,
  type AlertePatron,
  type ClotureStockee,
  type SessionStockee,
} from "../ports";
import { TOLERANCE_ECART_DEFAUT } from "../regles";
import { versIsoDouala } from "../temps";

/**
 * Contrat des ports de la caisse et du journal d'agence : les mêmes tests s'exécutent sur les
 * adaptateurs en mémoire et sur les adaptateurs PostgreSQL. Un comportement que la mémoire a et que
 * PostgreSQL n'a pas (ou l'inverse) fait échouer l'un des deux : c'est ce qui garantit que la mémoire,
 * sur laquelle tournent les autres tests, se comporte comme la base.
 *
 * Chaque test prend son propre contexte (compagnie, gare, guichets, agents) : on ne vide rien entre
 * deux tests.
 */

export interface ContexteCaisse {
  compagnieId: string;
  gareId: string;
  gareCode: string;
  /** Trois guichets, de rang 1 à 3. */
  guichets: { id: string; rang: number }[];
  /** Trois agents de la gare. */
  agents: string[];
  superviseurId: string;
}

export type GenreVente = "billet_cash" | "billet_momo" | "billet_orange_money" | "colis_cash";

export interface BancCaisse {
  sessions: SessionsCaisse;
  mouvements: MouvementsCaisse;
  guichets: GuichetsAgence;
  regles: ReglesAgence;
  alertes: AlertesPatron;
  journal: JournalAgenceRepository;
  traites: EvenementsTraites;
  /** Une compagnie, une gare, trois guichets, trois agents et un superviseur neufs. */
  nouveauContexte(): Promise<ContexteCaisse>;
  /** Une vente faite par `agentId` au guichet `guichetId` à l'instant `at`. */
  vendre(
    ctx: ContexteCaisse,
    vente: { genre: GenreVente; agentId: string; guichetId: string; montant: number; at: string },
  ): Promise<void>;
  definirTolerance(compagnieId: string, montant: number): Promise<void>;
  alertesDe(compagnieId: string): Promise<AlertePatron[]>;
  fermer(): Promise<void>;
}

/** Lundi 4 janvier 2027, 09:00 à Douala. */
const DEBUT = Date.parse("2027-01-04T08:00:00.000Z");
export const instant = (minutes: number): string => versIsoDouala(DEBUT + minutes * 60_000);

let compteur = 0;

export function uneSession(
  ctx: ContexteCaisse,
  surcharge: Partial<SessionStockee> & { rang?: number; agent?: number } = {},
): SessionStockee {
  compteur += 1;
  const rang = surcharge.rang ?? 1;
  const guichet = ctx.guichets.find((g) => g.rang === rang)!;
  const { rang: _rang, agent, ...reste } = surcharge;
  return {
    id: randomUUID(),
    numero: `K-${ctx.gareCode}-270104-${rang}-${compteur}`,
    guichetId: guichet.id,
    guichetRang: rang,
    gareId: ctx.gareId,
    compagnieId: ctx.compagnieId,
    agentId: ctx.agents[agent ?? rang - 1]!,
    fondDeCaisse: 25_000,
    tolerance: 1_000,
    ouverteA: instant(0),
    reouverteA: null,
    etat: "ouverte",
    comptage: null,
    cloture: null,
    validation: null,
    refus: [],
    evenementOuvertureId: randomUUID(),
    ...reste,
  };
}

export function uneCloture(surcharge: Partial<ClotureStockee> = {}): ClotureStockee {
  return {
    at: instant(480),
    auto: false,
    cashCompte: 41_500,
    cashAttendu: 42_000,
    ecart: -500,
    divergenceAppareil: 0,
    comptageAbsent: false,
    decompte: {
      billetsCash: { nombre: 2, montant: 17_000 },
      colisCash: { nombre: 0, montant: 0 },
      annulationsValidees: { nombre: 0, montant: 0 },
      momo: { ventes: 1, montant: 8_000 },
    },
    evenementId: randomUUID(),
    ...surcharge,
  };
}

export function contratPortsCaisse(
  titre: string,
  creerBanc: () => Promise<BancCaisse>,
  options: { attendreFin?: boolean } = {},
): void {
  describe(titre, () => {
    let banc: BancCaisse;

    beforeAll(async () => {
      banc = await creerBanc();
    }, 120_000);

    afterAll(async () => {
      if (options.attendreFin !== false) await banc?.fermer();
    });

    /* ------------------------------------------------------------------ sessions */

    describe("sessions de caisse", () => {
      it("crée une session et la relit telle quelle, par identifiant", async () => {
        const ctx = await banc.nouveauContexte();
        const s = uneSession(ctx, {
          comptage: { coupures: [{ valeur: 10_000, nombre: 2 }], pieces: 250, total: 20_250 },
        });
        expect(await banc.sessions.creer(s)).toBe("ok");
        expect(await banc.sessions.trouver(s.id)).toEqual(s);
        expect(await banc.sessions.trouver(randomUUID())).toBeNull();
        expect(await banc.sessions.trouver("pas-un-identifiant")).toBeNull();
      });

      it("refuse une deuxième caisse ouverte pour le même agent, ou pour le même guichet", async () => {
        const ctx = await banc.nouveauContexte();
        const premiere = uneSession(ctx, { rang: 1 });
        expect(await banc.sessions.creer(premiere)).toBe("ok");
        // Même agent, autre guichet.
        expect(await banc.sessions.creer(uneSession(ctx, { rang: 2, agent: 0 }))).toBe(
          "agent_occupe",
        );
        // Même guichet, autre agent.
        expect(await banc.sessions.creer(uneSession(ctx, { rang: 1, agent: 1 }))).toBe(
          "guichet_occupe",
        );
        // Un autre agent à un autre guichet n'est pas gêné.
        expect(await banc.sessions.creer(uneSession(ctx, { rang: 2, agent: 1 }))).toBe("ok");
      });

      it("refuse un identifiant, un numéro ou un événement d'ouverture déjà pris", async () => {
        const ctx = await banc.nouveauContexte();
        const s = uneSession(ctx, { rang: 1 });
        expect(await banc.sessions.creer(s)).toBe("ok");
        expect(await banc.sessions.creer({ ...s, numero: `${s.numero}-bis` })).toBe(
          "identifiant_pris",
        );
        expect(await banc.sessions.creer(uneSession(ctx, { rang: 2, numero: s.numero }))).toBe(
          "numero_pris",
        );
        expect(
          await banc.sessions.creer(
            uneSession(ctx, { rang: 2, evenementOuvertureId: s.evenementOuvertureId }),
          ),
        ).toBe("identifiant_pris");
      });

      it("rend le guichet et l'agent dès que la caisse est clôturée", async () => {
        const ctx = await banc.nouveauContexte();
        const s = uneSession(ctx, { rang: 1 });
        await banc.sessions.creer(s);
        expect(await banc.sessions.creer(uneSession(ctx, { rang: 1 }))).toBe("agent_occupe");
        await banc.sessions.transiter(s.id, "ouverte", { etat: "cloturee", cloture: uneCloture() });
        expect(await banc.sessions.creer(uneSession(ctx, { rang: 1 }))).toBe("ok");
      });

      it("trente ouvertures simultanées du même agent : une seule passe", async () => {
        const ctx = await banc.nouveauContexte();
        const resultats = await Promise.all(
          Array.from({ length: 30 }, () => banc.sessions.creer(uneSession(ctx, { rang: 1 }))),
        );
        expect(resultats.filter((r) => r === "ok")).toHaveLength(1);
        expect(resultats.filter((r) => r !== "ok").every((r) => r === "agent_occupe")).toBe(true);
        expect((await banc.sessions.deAgent(ctx.agents[0]!)).length).toBe(1);
      });

      it("deux agents se disputent le même guichet à la fois : un seul l'obtient", async () => {
        const ctx = await banc.nouveauContexte();
        const resultats = await Promise.all(
          [0, 1, 2].flatMap((agent) =>
            Array.from({ length: 5 }, () =>
              banc.sessions.creer(uneSession(ctx, { rang: 1, agent })),
            ),
          ),
        );
        expect(resultats.filter((r) => r === "ok")).toHaveLength(1);
        const ouvertes = (await banc.sessions.ouvertes()).filter((s) => s.gareId === ctx.gareId);
        expect(ouvertes).toHaveLength(1);
      });

      it("transiter est un compare-et-échange : comptage, clôture, validation, refus", async () => {
        const ctx = await banc.nouveauContexte();
        const s = uneSession(ctx);
        await banc.sessions.creer(s);

        const comptage = { coupures: [{ valeur: 500, nombre: 3 }], pieces: 10, total: 1_510 };
        const comptee = await banc.sessions.transiter(s.id, "ouverte", { comptage });
        expect(comptee).toEqual({ ...s, comptage });

        // Pas dans l'état annoncé : rien ne change.
        expect(await banc.sessions.transiter(s.id, "cloturee", { comptage: null })).toBeNull();
        expect(await banc.sessions.transiter(randomUUID(), "ouverte", { comptage })).toBeNull();

        const cloture = uneCloture({ cashCompte: 1_510, cashAttendu: 26_500, ecart: -24_990 });
        const cloturee = await banc.sessions.transiter(s.id, "ouverte", {
          etat: "cloturee",
          cloture,
        });
        expect(cloturee).toEqual({ ...s, comptage, etat: "cloturee", cloture });
        // Une deuxième clôture, rejouée ou concurrente, ne passe pas.
        expect(
          await banc.sessions.transiter(s.id, "ouverte", {
            etat: "cloturee",
            cloture: uneCloture(),
          }),
        ).toBeNull();
        expect((await banc.sessions.trouver(s.id))?.cloture).toEqual(cloture);

        const validation = {
          at: instant(500),
          superviseurId: ctx.superviseurId,
          superviseurNom: "Marie Ngo",
          ecart: -24_990,
          commentaire: null,
          evenementId: randomUUID(),
        };
        const validee = await banc.sessions.transiter(s.id, "cloturee", {
          etat: "validee",
          validation,
        });
        expect(validee).toEqual({ ...s, comptage, etat: "validee", cloture, validation });
        expect(
          await banc.sessions.transiter(s.id, "cloturee", { etat: "validee", validation }),
        ).toBeNull();
      });

      it("« Refuser · recompter » : la session redevient ouverte, sans clôture, avec l'historique des refus", async () => {
        const ctx = await banc.nouveauContexte();
        const s = uneSession(ctx);
        await banc.sessions.creer(s);
        await banc.sessions.transiter(s.id, "ouverte", { etat: "cloturee", cloture: uneCloture() });
        const refus = [
          {
            at: instant(490),
            superviseurId: ctx.superviseurId,
            motif: "Recomptez",
            ecart: -500,
            evenementId: randomUUID(),
          },
        ];
        const rouverte = await banc.sessions.transiter(s.id, "cloturee", {
          etat: "ouverte",
          cloture: null,
          reouverteA: instant(491),
          refus,
        });
        expect(rouverte).toEqual({
          ...s,
          etat: "ouverte",
          cloture: null,
          reouverteA: instant(491),
          refus,
        });
        expect((await banc.sessions.ouverteDeAgent(s.agentId))?.id).toBe(s.id);
      });

      it("liste les sessions d'un agent, d'une gare, et les sessions ouvertes", async () => {
        const ctx = await banc.nouveauContexte();
        const a = uneSession(ctx, { rang: 1, ouverteA: instant(0) });
        const b = uneSession(ctx, { rang: 2, ouverteA: instant(30) });
        const c = uneSession(ctx, { rang: 3, ouverteA: instant(60) });
        for (const s of [a, b, c]) await banc.sessions.creer(s);
        await banc.sessions.transiter(a.id, "ouverte", { etat: "cloturee", cloture: uneCloture() });
        await banc.sessions.transiter(b.id, "ouverte", { etat: "cloturee", cloture: uneCloture() });
        await banc.sessions.transiter(b.id, "cloturee", {
          etat: "validee",
          validation: {
            at: instant(500),
            superviseurId: ctx.superviseurId,
            superviseurNom: "Marie Ngo",
            ecart: 0,
            commentaire: null,
            evenementId: randomUUID(),
          },
        });

        expect((await banc.sessions.ouverteDeAgent(c.agentId))?.id).toBe(c.id);
        expect(await banc.sessions.ouverteDeAgent(a.agentId)).toBeNull();
        expect(await banc.sessions.ouverteDeAgent("pas-un-identifiant")).toBeNull();

        // Du plus récent au plus ancien.
        expect((await banc.sessions.deAgent(a.agentId)).map((s) => s.id)).toEqual([a.id]);
        expect((await banc.sessions.deAgent(a.agentId, instant(10))).map((s) => s.id)).toEqual([]);

        // Une gare : les caisses à valider (clôturées) et celles ouvertes depuis l'instant donné.
        const dixHeures = instant(45);
        expect((await banc.sessions.deGare(ctx.gareId, dixHeures)).map((s) => s.id)).toEqual([
          a.id,
          c.id,
        ]);
        expect((await banc.sessions.deGare(ctx.gareId, instant(0))).map((s) => s.id)).toEqual([
          a.id,
          b.id,
          c.id,
        ]);

        const ouvertes = (await banc.sessions.ouvertes()).filter((s) => s.gareId === ctx.gareId);
        expect(ouvertes.map((s) => s.id)).toEqual([c.id]);
      });
    });

    /* ------------------------------------------------------------------ mouvements */

    describe("mouvements de caisse", () => {
      it("compte les ventes de l'agent au guichet de la session, entre l'ouverture et l'instant demandé", async () => {
        const ctx = await banc.nouveauContexte();
        const s = uneSession(ctx, { rang: 1, ouverteA: instant(0) });
        await banc.sessions.creer(s);
        const [g1, g2] = ctx.guichets;
        const vendre = (
          genre: GenreVente,
          montant: number,
          at: number,
          agentId = s.agentId,
          guichetId = g1!.id,
        ) => banc.vendre(ctx, { genre, agentId, guichetId, montant, at: instant(at) });

        await vendre("billet_cash", 8_000, 10);
        await vendre("billet_cash", 9_000, 20);
        await vendre("colis_cash", 3_500, 30);
        await vendre("billet_momo", 7_500, 40);
        await vendre("billet_orange_money", 6_000, 41);
        // Hors de la session, ou d'un autre agent, ou d'un autre guichet : ne compte pas.
        await vendre("billet_cash", 99_000, -5);
        await vendre("billet_cash", 99_000, 200);
        await vendre("billet_cash", 99_000, 15, ctx.agents[1]);
        await vendre("billet_cash", 99_000, 15, s.agentId, g2!.id);

        const d = await banc.mouvements.decompte(s, instant(100));
        expect(d).toEqual({
          billetsCash: { nombre: 2, montant: 17_000 },
          colisCash: { nombre: 1, montant: 3_500 },
          annulationsValidees: { nombre: 0, montant: 0 },
          momo: { ventes: 2, montant: 13_500 },
        });

        // Arrêté plus tôt : les ventes qui suivent ne comptent pas.
        const tot = await banc.mouvements.decompte(s, instant(15));
        expect(tot.billetsCash).toEqual({ nombre: 1, montant: 8_000 });
        expect(tot.colisCash).toEqual({ nombre: 0, montant: 0 });
      });

      it("une annulation remboursée en cash est retranchée une seule fois, même rejouée", async () => {
        const ctx = await banc.nouveauContexte();
        const s = uneSession(ctx, { rang: 1 });
        await banc.sessions.creer(s);
        const demandeId = randomUUID();
        await banc.mouvements.enregistrerAnnulation({
          demandeId,
          sessionId: s.id,
          montant: 7_500,
          at: instant(50),
        });
        // Rejouée avec un autre montant : la première écriture fait foi.
        await banc.mouvements.enregistrerAnnulation({
          demandeId,
          sessionId: s.id,
          montant: 1,
          at: instant(55),
        });
        await Promise.all(
          Array.from({ length: 8 }, () =>
            banc.mouvements.enregistrerAnnulation({
              demandeId,
              sessionId: s.id,
              montant: 7_500,
              at: instant(50),
            }),
          ),
        );
        await banc.mouvements.enregistrerAnnulation({
          demandeId: randomUUID(),
          sessionId: s.id,
          montant: 2_000,
          at: instant(80),
        });

        expect((await banc.mouvements.decompte(s, instant(60))).annulationsValidees).toEqual({
          nombre: 1,
          montant: 7_500,
        });
        expect((await banc.mouvements.decompte(s, instant(100))).annulationsValidees).toEqual({
          nombre: 2,
          montant: 9_500,
        });
      });
    });

    /* ------------------------------------------------------------------ guichets, règles, alertes */

    describe("guichets, règles et alertes", () => {
      it("retrouve un guichet avec sa gare, et pas un guichet inconnu", async () => {
        const ctx = await banc.nouveauContexte();
        const g = ctx.guichets[1]!;
        expect(await banc.guichets.trouver(g.id)).toEqual({
          id: g.id,
          rang: 2,
          gareId: ctx.gareId,
          gareCode: ctx.gareCode,
          compagnieId: ctx.compagnieId,
        });
        expect(await banc.guichets.trouver(randomUUID())).toBeNull();
        expect(await banc.guichets.trouver("pas-un-identifiant")).toBeNull();
      });

      it("la tolérance d'écart est celle de la compagnie, 1 000 F sinon", async () => {
        const ctx = await banc.nouveauContexte();
        expect(TOLERANCE_ECART_DEFAUT).toBe(1_000);
        expect(await banc.regles.tolerance(ctx.compagnieId)).toBe(TOLERANCE_ECART_DEFAUT);
        expect(await banc.regles.tolerance(null)).toBe(TOLERANCE_ECART_DEFAUT);
        await banc.definirTolerance(ctx.compagnieId, 2_500);
        expect(await banc.regles.tolerance(ctx.compagnieId)).toBe(2_500);
        await banc.definirTolerance(ctx.compagnieId, 0);
        expect(await banc.regles.tolerance(ctx.compagnieId)).toBe(0);
      });

      it("garde les alertes du patron, dans l'ordre, sans rien d'autre que ce qu'on y met", async () => {
        const ctx = await banc.nouveauContexte();
        const alerte = (
          type: AlertePatron["type"],
          message: string,
          details: Record<string, unknown>,
        ): AlertePatron => ({
          type,
          compagnieId: ctx.compagnieId,
          gareId: ctx.gareId,
          message,
          details,
        });
        const a = alerte("cloture_automatique", "Caisse fermée à minuit", {
          sessionId: randomUUID(),
          ecart: -500,
          comptageAbsent: true,
        });
        const b = alerte("pin_bloque", "PIN bloqué", { personneId: ctx.agents[0] });
        await banc.alertes.alerter(a);
        await banc.alertes.alerter(b);
        expect(await banc.alertesDe(ctx.compagnieId)).toEqual([a, b]);
      });
    });

    /* ------------------------------------------------------------------ journal */

    describe("journal signé", () => {
      let chaineNum = 0;
      const entree = (
        ctx: ContexteCaisse,
        surcharge: Partial<EntreeJournalStockee> = {},
      ): Omit<EntreeJournalStockee, "seq" | "chaine"> => {
        chaineNum += 1;
        return {
          gareId: ctx.gareId,
          compagnieId: ctx.compagnieId,
          evenementId: randomUUID(),
          type: "caisse.ouverte",
          at: instant(chaineNum),
          auteur: { id: ctx.agents[0]!, nom: "Joseph Mbarga" },
          appareilId: "GU1-DLA",
          cible: { type: "session", id: randomUUID() },
          numeroPlage: null,
          resume: "Ouverture de la caisse du guichet 1",
          validePar: null,
          empreinte: `empreinte-${chaineNum}-${randomUUID()}`,
          precedente: null,
          ...surcharge,
        };
      };
      const ajouter = (
        ctx: ContexteCaisse,
        surcharge: Partial<EntreeJournalStockee> = {},
        chaine = ctx.compagnieId,
      ) => {
        const base = entree(ctx, surcharge);
        return banc.journal.ajouter(chaine, base.evenementId, (precedente) => ({
          ...base,
          precedente,
        }));
      };

      it("chaîne chaque entrée à l'empreinte de la précédente de sa compagnie", async () => {
        const ctx = await banc.nouveauContexte();
        const autre = await banc.nouveauContexte();
        const e1 = (await ajouter(ctx))!;
        const e2 = (await ajouter(ctx))!;
        const e3 = (await ajouter(ctx))!;
        const f1 = (await ajouter(autre, {}, autre.compagnieId))!;
        expect(e1.precedente).toBeNull();
        expect(e2.precedente).toBe(e1.empreinte);
        expect(e3.precedente).toBe(e2.empreinte);
        // Une autre compagnie a sa propre chaîne.
        expect(f1.precedente).toBeNull();
        expect(e2.seq).toBeGreaterThan(e1.seq);
        expect(e3.seq).toBeGreaterThan(e2.seq);
        expect(await banc.journal.chaine(ctx.compagnieId)).toEqual([e1, e2, e3]);
        expect(await banc.journal.chaine(autre.compagnieId)).toEqual([f1]);
      });

      it("un événement n'entre qu'une fois, même dans une autre chaîne", async () => {
        const ctx = await banc.nouveauContexte();
        const autre = await banc.nouveauContexte();
        const premier = (await ajouter(ctx))!;
        const doublon = await banc.journal.ajouter(
          ctx.compagnieId,
          premier.evenementId,
          (precedente) => ({ ...entree(ctx, { evenementId: premier.evenementId }), precedente }),
        );
        expect(doublon).toBeNull();
        const ailleurs = await banc.journal.ajouter(
          autre.compagnieId,
          premier.evenementId,
          (precedente) => ({ ...entree(autre, { evenementId: premier.evenementId }), precedente }),
        );
        expect(ailleurs).toBeNull();
        expect(await banc.journal.chaine(ctx.compagnieId)).toEqual([premier]);
        expect(await banc.journal.chaine(autre.compagnieId)).toEqual([]);
      });

      it("trente écritures simultanées : la chaîne reste droite, sans trou ni branche", async () => {
        const ctx = await banc.nouveauContexte();
        const ecrites = await Promise.all(Array.from({ length: 30 }, () => ajouter(ctx)));
        expect(ecrites.every((e) => e !== null)).toBe(true);
        const chaine = await banc.journal.chaine(ctx.compagnieId);
        expect(chaine).toHaveLength(30);
        expect(chaine[0]!.precedente).toBeNull();
        for (let i = 1; i < chaine.length; i++) {
          expect(chaine[i]!.precedente).toBe(chaine[i - 1]!.empreinte);
        }
        expect(new Set(chaine.map((e) => e.precedente)).size).toBe(30);
      });

      it("dix écritures simultanées du même événement : une seule entrée", async () => {
        const ctx = await banc.nouveauContexte();
        const evenementId = randomUUID();
        const resultats = await Promise.all(
          Array.from({ length: 10 }, () => ajouter(ctx, { evenementId })),
        );
        expect(resultats.filter((r) => r !== null)).toHaveLength(1);
        expect(await banc.journal.chaine(ctx.compagnieId)).toHaveLength(1);
      });

      it("le même événement écrit en même temps dans deux chaînes : une seule entrée", async () => {
        const ctx = await banc.nouveauContexte();
        const autre = await banc.nouveauContexte();
        const evenementId = randomUUID();
        const resultats = await Promise.all([
          ajouter(ctx, { evenementId }),
          ajouter(autre, { evenementId }, autre.compagnieId),
        ]);
        expect(resultats.filter((r) => r !== null)).toHaveLength(1);
      });

      it("liste du plus récent au plus ancien, avec ses filtres et ses pages", async () => {
        const ctx = await banc.nouveauContexte();
        const autreGare = randomUUID();
        const session = randomUUID();
        const e1 = (await ajouter(ctx, {
          at: instant(0),
          cible: { type: "session", id: session },
        }))!;
        const e2 = (await ajouter(ctx, {
          at: instant(10),
          type: "annulation.decidee",
          auteur: { id: ctx.superviseurId, nom: "Marie Ngo" },
          cible: { type: "personne", id: ctx.agents[1]! },
          validePar: {
            superviseurId: ctx.superviseurId,
            methode: "pin",
            signature: "ab".repeat(36),
          },
        }))!;
        const e3 = (await ajouter(ctx, { at: instant(20), gareId: autreGare }))!;
        // Le lendemain à Douala.
        const e4 = (await ajouter(ctx, { at: instant(24 * 60 + 5) }))!;
        // Minuit à Douala est le jour suivant, pas le même jour.
        const minuit = (await ajouter(ctx, {
          at: versIsoDouala(Date.parse("2027-01-04T23:00:00.000Z")),
        }))!;

        const tous = await banc.journal.lister({ compagnieId: ctx.compagnieId, limite: 50 });
        expect(tous.map((e) => e.evenementId)).toEqual(
          [minuit, e4, e3, e2, e1].map((e) => e.evenementId),
        );
        const page = await banc.journal.lister({ compagnieId: ctx.compagnieId, limite: 2 });
        expect(page.map((e) => e.evenementId)).toEqual([minuit.evenementId, e4.evenementId]);
        const suite = await banc.journal.lister({
          compagnieId: ctx.compagnieId,
          avantSeq: e4.seq,
          limite: 2,
        });
        expect(suite.map((e) => e.evenementId)).toEqual([e3.evenementId, e2.evenementId]);

        const ids = async (f: Parameters<JournalAgenceRepository["lister"]>[0]) =>
          (await banc.journal.lister(f)).map((e) => e.evenementId);
        expect(await ids({ compagnieId: ctx.compagnieId, gareId: autreGare, limite: 50 })).toEqual([
          e3.evenementId,
        ]);
        expect(await ids({ compagnieId: ctx.compagnieId, sessionId: session, limite: 50 })).toEqual(
          [e1.evenementId],
        );
        expect(await ids({ compagnieId: ctx.compagnieId, jour: "2027-01-04", limite: 50 })).toEqual(
          [e3.evenementId, e2.evenementId, e1.evenementId],
        );
        expect(await ids({ compagnieId: ctx.compagnieId, jour: "2027-01-05", limite: 50 })).toEqual(
          [minuit.evenementId, e4.evenementId],
        );
        // Une personne : celle qui agit, celle qui est visée, celle qui valide.
        expect(
          await ids({ compagnieId: ctx.compagnieId, personneId: ctx.superviseurId, limite: 50 }),
        ).toEqual([e2.evenementId]);
        expect(
          await ids({ compagnieId: ctx.compagnieId, personneId: ctx.agents[1]!, limite: 50 }),
        ).toEqual([e2.evenementId]);
        expect(
          await ids({ compagnieId: ctx.compagnieId, personneId: ctx.agents[0]!, limite: 50 }),
        ).toEqual([minuit, e4, e3, e1].map((e) => e.evenementId));
        // Une autre compagnie ne voit rien.
        expect(await ids({ compagnieId: randomUUID(), limite: 50 })).toEqual([]);
      });

      it("garde tout ce qui est signé, tel quel : validation, appareil, numéro de plage, accents", async () => {
        const ctx = await banc.nouveauContexte();
        const e = (await ajouter(ctx, {
          type: "annulation.decidee",
          appareilId: null,
          numeroPlage: 4_012,
          resume: "Annulation du billet 0171 · remboursement 7 500 F · validée par Aïcha Ngô",
          auteur: { id: "systeme", nom: "Système" },
          validePar: {
            superviseurId: ctx.superviseurId,
            methode: "pin",
            signature: "cd".repeat(36),
          },
        }))!;
        const [relue] = await banc.journal.chaine(ctx.compagnieId);
        expect(relue).toEqual(e);
        expect(relue!.numeroPlage).toBe(4_012);
        expect(relue!.appareilId).toBeNull();
      });
    });

    /* ------------------------------------------------------------------ événements traités */

    describe("événements traités (idempotence)", () => {
      it("nouveau, puis en cours, puis terminé avec son résultat et son heure", async () => {
        const id = randomUUID();
        expect(await banc.traites.commencer(id)).toEqual({ etat: "nouveau" });
        expect(await banc.traites.commencer(id)).toEqual({ etat: "en_cours" });
        const resultat = { session: { sessionId: randomUUID(), ecart: -500, tags: ["a", null] } };
        await banc.traites.terminer(id, resultat, instant(5));
        expect(await banc.traites.commencer(id)).toEqual({
          etat: "termine",
          resultat,
          recuA: instant(5),
        });
      });

      it("un traitement abandonné peut être recommencé ; un traitement terminé ne s'abandonne pas", async () => {
        const id = randomUUID();
        await banc.traites.commencer(id);
        await banc.traites.abandonner(id);
        expect(await banc.traites.commencer(id)).toEqual({ etat: "nouveau" });
        await banc.traites.terminer(id, { ok: true }, instant(1));
        await banc.traites.abandonner(id);
        expect(await banc.traites.commencer(id)).toMatchObject({ etat: "termine" });
      });

      it("vingt requêtes simultanées du même événement : une seule le traite", async () => {
        const id = randomUUID();
        const etats = await Promise.all(
          Array.from({ length: 20 }, () => banc.traites.commencer(id)),
        );
        expect(etats.filter((e) => e.etat === "nouveau")).toHaveLength(1);
        expect(etats.filter((e) => e.etat === "en_cours")).toHaveLength(19);
      });
    });
  });
}

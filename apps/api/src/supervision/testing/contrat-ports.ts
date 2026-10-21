import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { EtatBillet } from "../../caisse/regles";
import { versIsoDouala } from "../../caisse/temps";
import {
  DemandesAnnulation,
  EquipeGare,
  PinsEquipe,
  RegistreBillets,
  type BilletAnnulable,
  type DemandeAnnulationStockee,
  type ModePaiement,
  type RoleEquipe,
} from "../ports";

/**
 * Contrat des ports de la supervision (billets, demandes d'annulation, équipe, PIN) : les mêmes tests
 * s'exécutent sur les adaptateurs en mémoire et sur les adaptateurs PostgreSQL. Un comportement que la
 * mémoire a et que PostgreSQL n'a pas (ou l'inverse) fait échouer l'un des deux : c'est ce qui garantit
 * que la mémoire, sur laquelle tournent les autres tests, se comporte comme la base.
 *
 * `SourceGare` n'y figure pas : la version mémoire rend ce qu'un test lui donne, la version PostgreSQL
 * le calcule depuis les départs, les billets et les appareils (testée dans `postgres.integration.test.ts`).
 */

export interface ContexteSupervision {
  compagnieId: string;
  gareId: string;
  /** Trois guichets, de rang 1 à 3. */
  guichets: { id: string; rang: number }[];
  /** Trois guichetiers de la gare. */
  agents: string[];
  superviseurId: string;
}

export interface OptionsBillet {
  etat?: EtatBillet;
  prix?: number;
  /** Rang du guichet de vente (1 à 3). */
  rang?: number;
  mode?: ModePaiement;
  siege?: number;
  scanne?: boolean;
}

export interface BancSupervision {
  registre: RegistreBillets;
  demandes: DemandesAnnulation;
  equipe: EquipeGare;
  pins: PinsEquipe;
  nouveauContexte(): Promise<ContexteSupervision>;
  /** Un billet vendu au guichet par le premier agent ; renvoie ce que `trouver` doit rendre. */
  nouveauBillet(ctx: ContexteSupervision, options?: OptionsBillet): Promise<BilletAnnulable>;
  /** Le siège du billet est-il rendu à la vente ? */
  siegeLibre(billet: BilletAnnulable): Promise<boolean>;
  /** Un membre de l'équipe de la gare. */
  nouveauMembre(
    ctx: ContexteSupervision,
    options: { role: RoleEquipe; guichetId?: string | null; gareId?: string },
  ): Promise<string>;
  /** Le haché de PIN écrit pour cette personne, ou null. */
  pinHacheDe(personneId: string): Promise<string | null>;
  fermer(): Promise<void>;
}

const DEBUT = Date.parse("2027-01-04T08:00:00.000Z");
export const instant = (minutes: number): string => versIsoDouala(DEBUT + minutes * 60_000);

export function uneDemande(
  ctx: ContexteSupervision,
  billet: BilletAnnulable,
  surcharge: Partial<DemandeAnnulationStockee> = {},
): DemandeAnnulationStockee {
  return {
    demandeId: randomUUID(),
    billetId: billet.billetId,
    gareId: ctx.gareId,
    compagnieId: ctx.compagnieId,
    demandeurId: ctx.agents[0]!,
    guichetRang: billet.vendu.guichetRang,
    motif: "Le client a changé d'avis",
    demandeA: instant(10),
    statut: "en_attente",
    decision: null,
    montant: null,
    decideeA: null,
    decideeParId: null,
    evenementDemandeId: randomUUID(),
    evenementDecisionId: null,
    ...surcharge,
  };
}

const ETATS: readonly EtatBillet[] = [
  "reserve",
  "paye",
  "embarque",
  "voyage",
  "annule",
  "non_presente",
  "reporte",
];

export function contratPortsSupervision(
  titre: string,
  creerBanc: () => Promise<BancSupervision>,
  options: { attendreFin?: boolean } = {},
): void {
  describe(titre, () => {
    let banc: BancSupervision;

    beforeAll(async () => {
      banc = await creerBanc();
    }, 120_000);

    afterAll(async () => {
      if (options.attendreFin !== false) await banc?.fermer();
    });

    /* ------------------------------------------------------------------ billets */

    describe("registre des billets", () => {
      it("relit un billet tel quel, et ne connaît pas un billet inconnu", async () => {
        const ctx = await banc.nouveauContexte();
        const b = await banc.nouveauBillet(ctx, { prix: 7_500, rang: 2, siege: 14 });
        expect(await banc.registre.trouver(b.billetId)).toEqual(b);
        expect(await banc.registre.trouver(randomUUID())).toBeNull();
        expect(await banc.registre.trouver("pas-un-identifiant")).toBeNull();
      });

      it("annule un billet payé : il garde son numéro, son siège est libéré, une deuxième annulation est refusée", async () => {
        const ctx = await banc.nouveauContexte();
        const b = await banc.nouveauBillet(ctx, { etat: "paye", siege: 21 });
        const meta = { at: instant(30), parId: ctx.superviseurId, motif: "Erreur de destination" };
        expect(await banc.registre.appliquer(b.billetId, "annuler", meta)).toEqual({
          etat: "annule",
          siegeLibere: true,
        });
        const apres = await banc.registre.trouver(b.billetId);
        expect(apres).toEqual({ ...b, etat: "annule" });
        expect(apres!.numero).toBe(b.numero);
        expect(await banc.siegeLibre(b)).toBe(true);
        expect(await banc.registre.appliquer(b.billetId, "annuler", meta)).toBeNull();
        expect(await banc.registre.appliquer(b.billetId, "reporter", meta)).toBeNull();
      });

      it("reporte un billet payé à demain : état « reporté », siège rendu", async () => {
        const ctx = await banc.nouveauContexte();
        const b = await banc.nouveauBillet(ctx, { etat: "paye", siege: 5 });
        const meta = { at: instant(30), parId: ctx.superviseurId, motif: null };
        expect(await banc.registre.appliquer(b.billetId, "reporter", meta)).toEqual({
          etat: "reporte",
          siegeLibere: true,
        });
        expect((await banc.registre.trouver(b.billetId))!.etat).toBe("reporte");
        expect(await banc.siegeLibre(b)).toBe(true);
      });

      it("un billet déjà reporté s'annule sans rien libérer (son siège est déjà rendu)", async () => {
        const ctx = await banc.nouveauContexte();
        const b = await banc.nouveauBillet(ctx, { etat: "reporte", siege: 8 });
        const meta = { at: instant(30), parId: ctx.superviseurId, motif: null };
        expect(await banc.registre.appliquer(b.billetId, "annuler", meta)).toEqual({
          etat: "annule",
          siegeLibere: false,
        });
      });

      it("la machine d'états : annulable depuis réservé, payé, reporté ; reportable depuis payé, non présenté", async () => {
        const ctx = await banc.nouveauContexte();
        const meta = { at: instant(30), parId: ctx.superviseurId, motif: null };
        const annulables: EtatBillet[] = ["reserve", "paye", "reporte"];
        const reportables: EtatBillet[] = ["paye", "non_presente"];
        for (const etat of ETATS) {
          const a = await banc.nouveauBillet(ctx, { etat });
          const r = await banc.registre.appliquer(a.billetId, "annuler", meta);
          expect(r?.etat ?? null, `annuler depuis ${etat}`).toBe(
            annulables.includes(etat) ? "annule" : null,
          );
          const b = await banc.nouveauBillet(ctx, { etat });
          const s = await banc.registre.appliquer(b.billetId, "reporter", meta);
          expect(s?.etat ?? null, `reporter depuis ${etat}`).toBe(
            reportables.includes(etat) ? "reporte" : null,
          );
          // Un refus ne change rien.
          if (!annulables.includes(etat)) {
            expect((await banc.registre.trouver(a.billetId))!.etat).toBe(etat);
          }
        }
      });

      it("une transition inconnue ou un billet inconnu : null", async () => {
        const ctx = await banc.nouveauContexte();
        const meta = { at: instant(30), parId: ctx.superviseurId, motif: null };
        expect(await banc.registre.appliquer(randomUUID(), "annuler", meta)).toBeNull();
        expect(await banc.registre.appliquer("pas-un-identifiant", "annuler", meta)).toBeNull();
      });

      it("douze annulations simultanées du même billet : une seule passe", async () => {
        const ctx = await banc.nouveauContexte();
        const b = await banc.nouveauBillet(ctx, { etat: "paye" });
        const meta = { at: instant(30), parId: ctx.superviseurId, motif: null };
        const resultats = await Promise.all(
          Array.from({ length: 12 }, () => banc.registre.appliquer(b.billetId, "annuler", meta)),
        );
        expect(resultats.filter((r) => r !== null)).toHaveLength(1);
      });

      it("une annulation et un report simultanés : l'un des deux seulement", async () => {
        const ctx = await banc.nouveauContexte();
        const b = await banc.nouveauBillet(ctx, { etat: "paye" });
        const meta = { at: instant(30), parId: ctx.superviseurId, motif: null };
        const resultats = await Promise.all(
          Array.from({ length: 12 }, (_, i) =>
            banc.registre.appliquer(b.billetId, i % 2 === 0 ? "annuler" : "reporter", meta),
          ),
        );
        expect(resultats.filter((r) => r !== null)).toHaveLength(1);
        const etat = (await banc.registre.trouver(b.billetId))!.etat;
        expect(["annule", "reporte"]).toContain(etat);
      });
    });

    /* ------------------------------------------------------------------ demandes */

    describe("demandes d'annulation", () => {
      it("crée une demande et la relit telle quelle", async () => {
        const ctx = await banc.nouveauContexte();
        const b = await banc.nouveauBillet(ctx);
        const d = uneDemande(ctx, b);
        expect(await banc.demandes.creer(d)).toBe("ok");
        expect(await banc.demandes.trouver(d.demandeId)).toEqual(d);
        expect(await banc.demandes.enAttenteDuBillet(b.billetId)).toEqual(d);
        expect(await banc.demandes.trouver(randomUUID())).toBeNull();
        expect(await banc.demandes.trouver("pas-un-identifiant")).toBeNull();
        expect(await banc.demandes.enAttenteDuBillet(randomUUID())).toBeNull();
      });

      it("une seule demande en attente par billet ; l'identifiant d'une demande ne se réutilise pas", async () => {
        const ctx = await banc.nouveauContexte();
        const b = await banc.nouveauBillet(ctx);
        const d = uneDemande(ctx, b);
        await banc.demandes.creer(d);
        expect(await banc.demandes.creer(uneDemande(ctx, b))).toBe("deja_en_attente");
        expect(await banc.demandes.creer({ ...d, motif: "Autre" })).toBe("identifiant_pris");
        // Un autre billet n'est pas gêné.
        const autre = await banc.nouveauBillet(ctx);
        expect(await banc.demandes.creer(uneDemande(ctx, autre))).toBe("ok");
      });

      it("une fois la demande décidée, le billet peut recevoir une nouvelle demande", async () => {
        const ctx = await banc.nouveauContexte();
        const b = await banc.nouveauBillet(ctx);
        const d = uneDemande(ctx, b);
        await banc.demandes.creer(d);
        expect(
          await banc.demandes.decider(d.demandeId, {
            decision: "refuser",
            montant: 0,
            decideeA: instant(40),
            decideeParId: ctx.superviseurId,
            evenementDecisionId: randomUUID(),
          }),
        ).toBe(true);
        expect(await banc.demandes.enAttenteDuBillet(b.billetId)).toBeNull();
        expect(await banc.demandes.creer(uneDemande(ctx, b))).toBe("ok");
      });

      it("trente demandes simultanées pour le même billet : une seule est enregistrée", async () => {
        const ctx = await banc.nouveauContexte();
        const b = await banc.nouveauBillet(ctx);
        const resultats = await Promise.all(
          Array.from({ length: 30 }, () => banc.demandes.creer(uneDemande(ctx, b))),
        );
        expect(resultats.filter((r) => r === "ok")).toHaveLength(1);
        expect(resultats.filter((r) => r === "deja_en_attente")).toHaveLength(29);
      });

      it("décide une demande une seule fois, et garde la décision, l'auteur et l'heure", async () => {
        const ctx = await banc.nouveauContexte();
        const b = await banc.nouveauBillet(ctx);
        const d = uneDemande(ctx, b);
        await banc.demandes.creer(d);
        const decision = {
          decision: "rembourser" as const,
          montant: 7_500,
          decideeA: instant(45),
          decideeParId: ctx.superviseurId,
          evenementDecisionId: randomUUID(),
        };
        expect(await banc.demandes.decider(d.demandeId, decision)).toBe(true);
        expect(await banc.demandes.decider(d.demandeId, { ...decision, montant: 1 })).toBe(false);
        expect(await banc.demandes.trouver(d.demandeId)).toEqual({
          ...d,
          statut: "decidee",
          decision: "rembourser",
          montant: 7_500,
          decideeA: decision.decideeA,
          decideeParId: ctx.superviseurId,
          evenementDecisionId: decision.evenementDecisionId,
        });
        expect(await banc.demandes.decider(randomUUID(), decision)).toBe(false);
      });

      it("douze décisions simultanées de la même demande : une seule est retenue", async () => {
        const ctx = await banc.nouveauContexte();
        const b = await banc.nouveauBillet(ctx);
        const d = uneDemande(ctx, b);
        await banc.demandes.creer(d);
        const evenements = Array.from({ length: 12 }, () => randomUUID());
        const resultats = await Promise.all(
          evenements.map((evenementDecisionId, i) =>
            banc.demandes.decider(d.demandeId, {
              decision: i % 2 === 0 ? "rembourser" : "avoir",
              montant: 1_000 + i,
              decideeA: instant(45),
              decideeParId: ctx.superviseurId,
              evenementDecisionId,
            }),
          ),
        );
        expect(resultats.filter(Boolean)).toHaveLength(1);
        const gagnant = resultats.indexOf(true);
        const relue = (await banc.demandes.trouver(d.demandeId))!;
        expect(relue.evenementDecisionId).toBe(evenements[gagnant]);
        expect(relue.montant).toBe(1_000 + gagnant);
      });

      it("rouvrir une demande décidée la remet en attente, sans décision", async () => {
        const ctx = await banc.nouveauContexte();
        const b = await banc.nouveauBillet(ctx);
        const d = uneDemande(ctx, b);
        await banc.demandes.creer(d);
        await banc.demandes.decider(d.demandeId, {
          decision: "rembourser",
          montant: 7_500,
          decideeA: instant(45),
          decideeParId: ctx.superviseurId,
          evenementDecisionId: randomUUID(),
        });
        await banc.demandes.rouvrir(d.demandeId);
        expect(await banc.demandes.trouver(d.demandeId)).toEqual(d);
        // Rouvrir ne change rien à une demande déjà en attente, ni à une demande inconnue.
        await banc.demandes.rouvrir(d.demandeId);
        await banc.demandes.rouvrir(randomUUID());
        expect(await banc.demandes.trouver(d.demandeId)).toEqual(d);
        expect(
          await banc.demandes.decider(d.demandeId, {
            decision: "refuser",
            montant: 0,
            decideeA: instant(50),
            decideeParId: ctx.superviseurId,
            evenementDecisionId: randomUUID(),
          }),
        ).toBe(true);
      });

      it("liste les demandes en attente d'une gare, de la plus ancienne à la plus récente", async () => {
        const ctx = await banc.nouveauContexte();
        const autre = await banc.nouveauContexte();
        const [b1, b2, b3, b4] = [
          await banc.nouveauBillet(ctx),
          await banc.nouveauBillet(ctx),
          await banc.nouveauBillet(ctx),
          await banc.nouveauBillet(autre),
        ];
        const tard = uneDemande(ctx, b1!, { demandeA: instant(30) });
        const tot = uneDemande(ctx, b2!, { demandeA: instant(10) });
        const decidee = uneDemande(ctx, b3!, { demandeA: instant(20) });
        const ailleurs = uneDemande(autre, b4!, { demandeA: instant(5) });
        for (const d of [tard, tot, decidee, ailleurs]) await banc.demandes.creer(d);
        await banc.demandes.decider(decidee.demandeId, {
          decision: "refuser",
          montant: 0,
          decideeA: instant(40),
          decideeParId: ctx.superviseurId,
          evenementDecisionId: randomUUID(),
        });
        expect((await banc.demandes.enAttenteDeGare(ctx.gareId)).map((d) => d.demandeId)).toEqual([
          tot.demandeId,
          tard.demandeId,
        ]);
        expect(await banc.demandes.enAttenteDeGare(randomUUID())).toEqual([]);
      });
    });

    /* ------------------------------------------------------------------ équipe */

    describe("équipe de la gare", () => {
      it("retrouve un membre, et ne connaît pas une personne inconnue", async () => {
        const ctx = await banc.nouveauContexte();
        const id = await banc.nouveauMembre(ctx, {
          role: "guichetier",
          guichetId: ctx.guichets[1]!.id,
        });
        expect(await banc.equipe.trouver(id)).toMatchObject({
          personneId: id,
          role: "guichetier",
          gareId: ctx.gareId,
          compagnieId: ctx.compagnieId,
          guichetId: ctx.guichets[1]!.id,
          actif: true,
        });
        expect(await banc.equipe.trouver(randomUUID())).toBeNull();
        expect(await banc.equipe.trouver("pas-un-identifiant")).toBeNull();
      });

      it("liste les membres actifs de la gare, pas ceux d'une autre gare", async () => {
        const ctx = await banc.nouveauContexte();
        const autre = await banc.nouveauContexte();
        const a = await banc.nouveauMembre(ctx, { role: "guichetier" });
        const b = await banc.nouveauMembre(ctx, { role: "convoyeur" });
        const c = await banc.nouveauMembre(autre, { role: "guichetier" });
        const ids = (await banc.equipe.lister(ctx.gareId)).map((m) => m.personneId);
        expect(ids).toEqual(expect.arrayContaining([a, b]));
        expect(ids).not.toContain(c);
        expect(await banc.equipe.lister(randomUUID())).toEqual([]);
        expect(await banc.equipe.lister("pas-un-identifiant")).toEqual([]);
      });

      it("change le guichet, le rôle, ou les deux ; null veut dire inchangé", async () => {
        const ctx = await banc.nouveauContexte();
        const id = await banc.nouveauMembre(ctx, {
          role: "guichetier",
          guichetId: ctx.guichets[0]!.id,
        });
        await banc.equipe.changerAffectation(id, { guichetId: ctx.guichets[2]!.id, role: null });
        expect(await banc.equipe.trouver(id)).toMatchObject({
          role: "guichetier",
          guichetId: ctx.guichets[2]!.id,
        });
        await banc.equipe.changerAffectation(id, { guichetId: null, role: "convoyeur" });
        expect(await banc.equipe.trouver(id)).toMatchObject({
          role: "convoyeur",
          guichetId: ctx.guichets[2]!.id,
        });
        await banc.equipe.changerAffectation(id, { guichetId: null, role: null });
        expect(await banc.equipe.trouver(id)).toMatchObject({
          role: "convoyeur",
          guichetId: ctx.guichets[2]!.id,
        });
        // Une personne inconnue : rien ne se passe.
        await banc.equipe.changerAffectation(randomUUID(), { guichetId: null, role: "chauffeur" });
      });

      it("désactive un compte : il sort de l'équipe, mais reste retrouvable, inactif", async () => {
        const ctx = await banc.nouveauContexte();
        const id = await banc.nouveauMembre(ctx, { role: "guichetier" });
        await banc.equipe.desactiver(id);
        expect((await banc.equipe.lister(ctx.gareId)).map((m) => m.personneId)).not.toContain(id);
        expect(await banc.equipe.trouver(id)).toMatchObject({ personneId: id, actif: false });
        await banc.equipe.desactiver(randomUUID());
      });
    });

    /* ------------------------------------------------------------------ PIN */

    describe("PIN de l'équipe", () => {
      it("n'a pas de PIN provisoire au départ ; en pose un avec son échéance ; ne garde que le haché", async () => {
        const ctx = await banc.nouveauContexte();
        const id = await banc.nouveauMembre(ctx, { role: "guichetier" });
        expect(await banc.pins.lire(id)).toEqual({ provisoireJusqua: null });
        const jusqua = new Date("2027-01-04T09:00:00.000Z");
        await banc.pins.definirProvisoire(id, "$argon2id$v=19$m=65536$haché", jusqua);
        expect(await banc.pins.lire(id)).toEqual({ provisoireJusqua: jusqua });
        expect(await banc.pinHacheDe(id)).toBe("$argon2id$v=19$m=65536$haché");
        // Un deuxième PIN provisoire remplace le premier.
        const plus = new Date("2027-01-04T10:00:00.000Z");
        await banc.pins.definirProvisoire(id, "$argon2id$autre", plus);
        expect(await banc.pins.lire(id)).toEqual({ provisoireJusqua: plus });
        expect(await banc.pinHacheDe(id)).toBe("$argon2id$autre");
      });

      it("une personne inconnue n'a pas de PIN provisoire", async () => {
        expect(await banc.pins.lire(randomUUID())).toEqual({ provisoireJusqua: null });
        expect(await banc.pins.lire("pas-un-identifiant")).toEqual({ provisoireJusqua: null });
        await banc.pins.definirProvisoire(randomUUID(), "haché", new Date());
      });
    });
  });
}

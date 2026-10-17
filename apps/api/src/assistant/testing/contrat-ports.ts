import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ActionProposee } from "../../analyses/modele";
import { versIsoDouala } from "../../rapport/temps";
import type { EchangeStocke } from "../modele";
import type { ConversationsAssistant, PropositionsAssistant } from "../ports";

/**
 * Contrat des ports d'écriture de l'assistant (conversations, propositions) : les mêmes tests
 * s'exécutent sur les adaptateurs en mémoire et sur les adaptateurs PostgreSQL. Un comportement que
 * la mémoire a et que la base n'a pas (ou l'inverse) fait échouer l'un des deux.
 */

export interface ContexteAssistant {
  compagnieId: string;
  /** Deux patrons de la compagnie. */
  utilisateurs: [string, string];
}

export interface BancAssistant {
  conversations: ConversationsAssistant;
  propositions: PropositionsAssistant;
  /** Une compagnie neuve et deux patrons (sur PostgreSQL : des lignes qui existent). */
  nouveauContexte(): Promise<ContexteAssistant>;
  fermer(): Promise<void>;
}

export const DEBUT = new Date("2027-01-04T08:00:00.000Z");
export const apres = (minutes: number): Date => new Date(DEBUT.getTime() + minutes * 60_000);

export function unEchange(
  ctx: ContexteAssistant,
  rang: number,
  surcharge: Partial<EchangeStocke> = {},
): EchangeStocke {
  return {
    id: randomUUID(),
    compagnieId: ctx.compagnieId,
    utilisateurId: ctx.utilisateurs[0],
    intention: "pourquoi_ligne",
    redaction: "regles",
    reponse: {
      question: `Question ${rang}`,
      repondueA: versIsoDouala(DEBUT),
      dureeSecondes: 2,
      resume: `Réponse ${rang}`,
      points: ["Premier point", "Deuxième point"],
      actions: [{ id: "voir_ligne:l1", libelle: "Voir la ligne", type: "voir_ligne" }],
      sources: "Source : 30 derniers jours",
      simulation: null,
    },
    contexte: { ligneId: null, departId: null },
    // Toutes à la même milliseconde : seul l'ordre d'arrivée les distingue.
    creeLe: versIsoDouala(DEBUT),
    ...surcharge,
  };
}

export function uneAction(id = `controle_inopine:${randomUUID().slice(0, 8)}`): ActionProposee {
  return {
    id,
    libelle: "Programmer un contrôle inopiné le lundi",
    type: "controle_inopine",
    parametres: {
      type: "controle_inopine",
      agentId: randomUUID(),
      gareId: randomUUID(),
      jourSemaine: 1,
    },
  };
}

export function contratPortsAssistant(nom: string, creer: () => Promise<BancAssistant>): void {
  describe(nom, () => {
    let banc: BancAssistant;
    beforeAll(async () => {
      banc = await creer();
    }, 120_000);
    afterAll(async () => {
      await banc?.fermer();
    });

    describe("conversations", () => {
      it("rend les derniers échanges du plus ancien au plus récent, même écrits à la même milliseconde", async () => {
        const ctx = await banc.nouveauContexte();
        for (let i = 1; i <= 6; i++) await banc.conversations.ajouter(unEchange(ctx, i));
        const derniers = await banc.conversations.derniers(ctx.compagnieId, ctx.utilisateurs[0], 4);
        expect(derniers.map((e) => e.reponse.question)).toEqual([
          "Question 3",
          "Question 4",
          "Question 5",
          "Question 6",
        ]);
      });

      it("garde la forme exacte de l'échange (réponse, contexte, intention, rédaction, heure)", async () => {
        const ctx = await banc.nouveauContexte();
        const e = unEchange(ctx, 1, {
          intention: "et_si_prix",
          redaction: "modele",
          contexte: { ligneId: randomUUID(), departId: randomUUID() },
        });
        await banc.conversations.ajouter(e);
        expect(await banc.conversations.derniers(ctx.compagnieId, ctx.utilisateurs[0], 10)).toEqual(
          [e],
        );
      });

      it("ne mélange ni les patrons ni les compagnies", async () => {
        const a = await banc.nouveauContexte();
        const b = await banc.nouveauContexte();
        await banc.conversations.ajouter(unEchange(a, 1));
        await banc.conversations.ajouter(unEchange(a, 2, { utilisateurId: a.utilisateurs[1] }));
        await banc.conversations.ajouter(unEchange(b, 3));
        expect(
          (await banc.conversations.derniers(a.compagnieId, a.utilisateurs[0], 10)).map(
            (e) => e.reponse.question,
          ),
        ).toEqual(["Question 1"]);
        expect(
          (await banc.conversations.derniers(a.compagnieId, a.utilisateurs[1], 10)).map(
            (e) => e.reponse.question,
          ),
        ).toEqual(["Question 2"]);
        expect(await banc.conversations.derniers(b.compagnieId, a.utilisateurs[0], 10)).toEqual([]);
      });

      it("une conversation vide rend une liste vide", async () => {
        const ctx = await banc.nouveauContexte();
        expect(await banc.conversations.derniers(ctx.compagnieId, ctx.utilisateurs[0], 10)).toEqual(
          [],
        );
      });
    });

    describe("propositions", () => {
      it("enregistre une proposition telle quelle et la retrouve avec ses paramètres", async () => {
        const ctx = await banc.nouveauContexte();
        const action = uneAction();
        await banc.propositions.proposer(ctx.compagnieId, [action], apres(0), apres(60));
        expect(await banc.propositions.trouver(ctx.compagnieId, action.id)).toEqual({
          compagnieId: ctx.compagnieId,
          action,
          proposeeLe: versIsoDouala(apres(0)),
          expireLe: versIsoDouala(apres(60)),
          application: null,
        });
        expect(await banc.propositions.trouver(ctx.compagnieId, "inconnue:x")).toBeNull();
      });

      it("une proposition est propre à sa compagnie", async () => {
        const a = await banc.nouveauContexte();
        const b = await banc.nouveauContexte();
        const action = uneAction();
        await banc.propositions.proposer(a.compagnieId, [action], apres(0), apres(60));
        expect(await banc.propositions.trouver(b.compagnieId, action.id)).toBeNull();
        expect(
          await banc.propositions.reserver(b.compagnieId, action.id, b.utilisateurs[0], apres(1)),
        ).toBe(false);
        expect((await banc.propositions.trouver(a.compagnieId, action.id))!.application).toBeNull();
      });

      it("ne s'applique qu'une fois : la deuxième réservation est refusée", async () => {
        const ctx = await banc.nouveauContexte();
        const action = uneAction();
        await banc.propositions.proposer(ctx.compagnieId, [action], apres(0), apres(60));
        expect(
          await banc.propositions.reserver(
            ctx.compagnieId,
            action.id,
            ctx.utilisateurs[0],
            apres(5),
          ),
        ).toBe(true);
        expect(
          await banc.propositions.reserver(
            ctx.compagnieId,
            action.id,
            ctx.utilisateurs[1],
            apres(6),
          ),
        ).toBe(false);
        expect((await banc.propositions.trouver(ctx.compagnieId, action.id))!.application).toEqual({
          par: ctx.utilisateurs[0],
          a: versIsoDouala(apres(5)),
          journalId: null,
          effetA: null,
        });
      });

      it("dix clics simultanés n'appliquent qu'une fois", async () => {
        const ctx = await banc.nouveauContexte();
        const action = uneAction();
        await banc.propositions.proposer(ctx.compagnieId, [action], apres(0), apres(60));
        const reponses = await Promise.all(
          Array.from({ length: 10 }, (_, i) =>
            banc.propositions.reserver(
              ctx.compagnieId,
              action.id,
              ctx.utilisateurs[i % 2]!,
              apres(5),
            ),
          ),
        );
        expect(reponses.filter(Boolean)).toHaveLength(1);
      });

      it("réserver une proposition qui n'existe pas rend false", async () => {
        const ctx = await banc.nouveauContexte();
        expect(
          await banc.propositions.reserver(
            ctx.compagnieId,
            "rien:x",
            ctx.utilisateurs[0],
            apres(1),
          ),
        ).toBe(false);
      });

      it("confirmer note la ligne du journal et l'effet ; une application confirmée ne se libère plus", async () => {
        const ctx = await banc.nouveauContexte();
        const action = uneAction();
        const journalId = randomUUID();
        const effetA = versIsoDouala(apres(24 * 60));
        await banc.propositions.proposer(ctx.compagnieId, [action], apres(0), apres(60));
        await banc.propositions.reserver(ctx.compagnieId, action.id, ctx.utilisateurs[0], apres(5));
        await banc.propositions.confirmer(ctx.compagnieId, action.id, journalId, effetA);
        await banc.propositions.liberer(ctx.compagnieId, action.id);
        expect((await banc.propositions.trouver(ctx.compagnieId, action.id))!.application).toEqual({
          par: ctx.utilisateurs[0],
          a: versIsoDouala(apres(5)),
          journalId,
          effetA,
        });
        expect(
          await banc.propositions.reserver(
            ctx.compagnieId,
            action.id,
            ctx.utilisateurs[1],
            apres(9),
          ),
        ).toBe(false);
      });

      it("libérer une réservation dont l'application a échoué permet de réessayer", async () => {
        const ctx = await banc.nouveauContexte();
        const action = uneAction();
        await banc.propositions.proposer(ctx.compagnieId, [action], apres(0), apres(60));
        await banc.propositions.reserver(ctx.compagnieId, action.id, ctx.utilisateurs[0], apres(5));
        await banc.propositions.liberer(ctx.compagnieId, action.id);
        expect(
          (await banc.propositions.trouver(ctx.compagnieId, action.id))!.application,
        ).toBeNull();
        expect(
          await banc.propositions.reserver(
            ctx.compagnieId,
            action.id,
            ctx.utilisateurs[1],
            apres(6),
          ),
        ).toBe(true);
      });

      it("reproposer une proposition appliquée et encore valable ne la rend pas applicable", async () => {
        const ctx = await banc.nouveauContexte();
        const action = uneAction();
        await banc.propositions.proposer(ctx.compagnieId, [action], apres(0), apres(60));
        await banc.propositions.reserver(ctx.compagnieId, action.id, ctx.utilisateurs[0], apres(5));
        await banc.propositions.proposer(ctx.compagnieId, [action], apres(10), apres(70));
        const p = (await banc.propositions.trouver(ctx.compagnieId, action.id))!;
        expect(p.application?.par).toBe(ctx.utilisateurs[0]);
        expect(p.expireLe).toBe(versIsoDouala(apres(60)));
        expect(
          await banc.propositions.reserver(
            ctx.compagnieId,
            action.id,
            ctx.utilisateurs[1],
            apres(11),
          ),
        ).toBe(false);
      });

      it("reproposer une proposition appliquée mais périmée la rend de nouveau applicable", async () => {
        const ctx = await banc.nouveauContexte();
        const action = uneAction();
        await banc.propositions.proposer(ctx.compagnieId, [action], apres(0), apres(60));
        await banc.propositions.reserver(ctx.compagnieId, action.id, ctx.utilisateurs[0], apres(5));
        await banc.propositions.proposer(ctx.compagnieId, [action], apres(120), apres(180));
        const p = (await banc.propositions.trouver(ctx.compagnieId, action.id))!;
        expect(p.application).toBeNull();
        expect(p.expireLe).toBe(versIsoDouala(apres(180)));
      });

      it("reproposer une proposition non appliquée renouvelle ses paramètres et son échéance", async () => {
        const ctx = await banc.nouveauContexte();
        const action = uneAction("controle_inopine:renouvele");
        await banc.propositions.proposer(ctx.compagnieId, [action], apres(0), apres(60));
        const nouvelle = { ...action, libelle: "Programmer un contrôle inopiné le mardi" };
        await banc.propositions.proposer(ctx.compagnieId, [nouvelle], apres(10), apres(70));
        const p = (await banc.propositions.trouver(ctx.compagnieId, action.id))!;
        expect(p.action.libelle).toBe("Programmer un contrôle inopiné le mardi");
        expect(p.expireLe).toBe(versIsoDouala(apres(70)));
      });
    });
  });
}

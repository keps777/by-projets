import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { JournalSms } from "../journal";
import type { EssaiSms, MessageSms } from "../types";

/**
 * Contrat du journal des SMS : les mêmes tests s'exécutent sur l'adaptateur en mémoire et sur
 * l'adaptateur PostgreSQL. Un comportement que la mémoire a et que PostgreSQL n'a pas (ou
 * l'inverse) fait échouer l'un des deux.
 *
 * Chaque test prend ses propres identifiants (compagnie, demandeur, numéro) : la base n'est pas
 * vidée entre deux tests.
 */

export interface BancJournalSms {
  journal: JournalSms;
  fermer(): Promise<void>;
}

const T0 = new Date("2027-01-05T07:00:00.000Z");
const apres = (ms: number): Date => new Date(T0.getTime() + ms);

/** Un message neuf, avec des identifiants que personne d'autre n'utilise. */
export function messageSms(surcharge: Partial<MessageSms> = {}): MessageSms {
  const id = surcharge.id ?? randomUUID();
  return {
    id,
    type: "billet",
    cle: `cle:${id}`,
    reference: { type: "billet", id: `billet-${id}` },
    compagnieId: randomUUID(),
    demandeurId: randomUUID(),
    destinataireChiffre: `chiffre-${id}`,
    destinataireIndex: `index-${id}`,
    destinataireMasque: "+237 ••••• 345",
    expediteur: "AfriMove",
    statut: "en_file",
    encodage: "gsm7",
    caracteres: 120,
    segments: 1,
    coutFcfa: 0,
    coutEstimeFcfa: 12,
    tentatives: 0,
    fournisseur: null,
    idFournisseur: null,
    derniereErreur: null,
    creeA: T0,
    planifieA: null,
    expireA: null,
    envoyeA: null,
    livreA: null,
    delaiEnvoiMs: null,
    ...surcharge,
  };
}

const essai = (messageId: string, surcharge: Partial<EssaiSms> = {}): EssaiSms => ({
  messageId,
  numero: 1,
  fournisseur: "principal",
  at: apres(1_000),
  dureeMs: 180,
  resultat: "accepte",
  code: null,
  ...surcharge,
});

export function contratJournalSms(titre: string, creer: () => Promise<BancJournalSms>): void {
  describe(titre, () => {
    describe("création idempotente", () => {
      it("crée le message et le relit à l'identique, sans le texte (il n'existe pas ici)", async () => {
        const { journal, fermer } = await creer();
        try {
          const m = messageSms({
            planifieA: apres(900_000),
            expireA: apres(3_600_000),
            reference: { type: "colis", id: "colis-9" },
          });
          const res = await journal.creer(m);
          expect(res).toEqual({ cree: true, message: m });
          expect(await journal.trouver(m.id)).toEqual(m);
          expect(await journal.trouverParCle(m.cle)).toEqual(m);
          expect(Object.keys(m)).not.toContain("texte");
        } finally {
          await fermer();
        }
      });

      it("un message sans référence ni compagnie revient avec des null", async () => {
        const { journal, fermer } = await creer();
        try {
          const m = messageSms({ reference: null, compagnieId: null, demandeurId: null });
          await journal.creer(m);
          expect(await journal.trouver(m.id)).toEqual(m);
        } finally {
          await fermer();
        }
      });

      it("la même clé ne crée pas un second message : le premier est rendu, intact", async () => {
        const { journal, fermer } = await creer();
        try {
          const premier = messageSms({ cle: `retrait:${randomUUID()}` });
          const second = messageSms({ cle: premier.cle, segments: 2, caracteres: 200 });
          expect((await journal.creer(premier)).cree).toBe(true);
          const res = await journal.creer(second);
          expect(res.cree).toBe(false);
          expect(res.message).toEqual(premier);
          expect(await journal.trouver(second.id)).toBeNull();
        } finally {
          await fermer();
        }
      });

      it("huit demandes simultanées de la même clé : un seul message, un seul créateur", async () => {
        const { journal, fermer } = await creer();
        try {
          const cle = `billet:${randomUUID()}`;
          const candidats = Array.from({ length: 8 }, () => messageSms({ cle }));
          const res = await Promise.all(candidats.map((c) => journal.creer(c)));
          expect(res.filter((r) => r.cree)).toHaveLength(1);
          const gagnant = res.find((r) => r.cree)!.message;
          expect(res.map((r) => r.message.id)).toEqual(Array(8).fill(gagnant.id));
          expect(await journal.trouverParCle(cle)).toMatchObject({ id: gagnant.id });
        } finally {
          await fermer();
        }
      });

      it("une lecture inconnue rend null, y compris un identifiant qui n'est pas un UUID", async () => {
        const { journal, fermer } = await creer();
        try {
          expect(await journal.trouver(randomUUID())).toBeNull();
          expect(await journal.trouver("pas-un-uuid")).toBeNull();
          expect(await journal.trouverParCle(`inconnue:${randomUUID()}`)).toBeNull();
          expect(await journal.trouverParFournisseur("principal", randomUUID())).toBeNull();
          expect(await journal.essais("pas-un-uuid")).toEqual([]);
          expect(await journal.modifier("pas-un-uuid", { statut: "annule" })).toBeNull();
        } finally {
          await fermer();
        }
      });
    });

    describe("modifier", () => {
      it("fusionne les champs donnés et laisse les autres ; null efface une valeur", async () => {
        const { journal, fermer } = await creer();
        try {
          const m = messageSms({ derniereErreur: "delai_depasse", tentatives: 2 });
          await journal.creer(m);
          const maj = await journal.modifier(m.id, {
            statut: "envoye",
            fournisseur: "principal",
            idFournisseur: `ext-${m.id}`,
            coutFcfa: 12,
            envoyeA: apres(2_000),
            delaiEnvoiMs: 2_000,
            derniereErreur: null,
          });
          expect(maj).toEqual({
            ...m,
            statut: "envoye",
            fournisseur: "principal",
            idFournisseur: `ext-${m.id}`,
            coutFcfa: 12,
            envoyeA: apres(2_000),
            delaiEnvoiMs: 2_000,
            derniereErreur: null,
          });
          expect(await journal.trouver(m.id)).toEqual(maj);
          expect(await journal.trouverParFournisseur("principal", `ext-${m.id}`)).toEqual(maj);
          expect(await journal.trouverParFournisseur("secours", `ext-${m.id}`)).toBeNull();
        } finally {
          await fermer();
        }
      });

      it("un message inconnu rend null", async () => {
        const { journal, fermer } = await creer();
        try {
          expect(await journal.modifier(randomUUID(), { statut: "annule" })).toBeNull();
        } finally {
          await fermer();
        }
      });

      it("« seulementSi » : modifie quand le statut en fait partie, sinon ne touche à rien", async () => {
        const { journal, fermer } = await creer();
        try {
          const m = messageSms({ statut: "livre", fournisseur: "principal" });
          await journal.creer(m);
          // Un réessai en retard ne doit pas faire reculer un message déjà livré.
          expect(
            await journal.modifier(m.id, { statut: "en_reprise", tentatives: 3 }, [
              "en_file",
              "en_reprise",
            ]),
          ).toBeNull();
          expect(await journal.trouver(m.id)).toEqual(m);
          // Le statut est dans la liste : la modification passe.
          const maj = await journal.modifier(m.id, { statut: "non_livre" }, ["envoye", "livre"]);
          expect(maj).toMatchObject({ statut: "non_livre" });
        } finally {
          await fermer();
        }
      });

      it("dix changements simultanés « seulementSi » : un seul passe", async () => {
        const { journal, fermer } = await creer();
        try {
          const m = messageSms();
          await journal.creer(m);
          const res = await Promise.all(
            Array.from({ length: 10 }, (_, i) =>
              journal.modifier(m.id, { statut: "envoye", tentatives: i + 1 }, [
                "en_file",
                "en_reprise",
              ]),
            ),
          );
          const passes = res.filter((r) => r !== null);
          expect(passes).toHaveLength(1);
          expect(await journal.trouver(m.id)).toMatchObject({
            statut: "envoye",
            tentatives: passes[0]!.tentatives,
          });
        } finally {
          await fermer();
        }
      });
    });

    describe("lister", () => {
      it("filtre par compagnie (null = sans compagnie), type, statut, référence et demandeur", async () => {
        const { journal, fermer } = await creer();
        try {
          const compagnieId = randomUUID();
          const demandeurId = randomUUID();
          const a = messageSms({
            compagnieId,
            demandeurId,
            type: "billet",
            reference: { type: "billet", id: "b-1" },
            creeA: apres(1_000),
          });
          const b = messageSms({
            compagnieId,
            demandeurId: randomUUID(),
            type: "code_retrait",
            statut: "envoye",
            reference: { type: "colis", id: "c-1" },
            creeA: apres(2_000),
          });
          const c = messageSms({ compagnieId: randomUUID(), creeA: apres(3_000) });
          for (const m of [a, b, c]) await journal.creer(m);
          const ids = async (f: Parameters<JournalSms["lister"]>[0]) =>
            (await journal.lister(f)).map((m) => m.id);

          expect(await ids({ compagnieId })).toEqual([b.id, a.id]);
          expect(await ids({ compagnieId, type: "billet" })).toEqual([a.id]);
          expect(await ids({ compagnieId, statut: "envoye" })).toEqual([b.id]);
          expect(await ids({ compagnieId, demandeurId })).toEqual([a.id]);
          expect(await ids({ compagnieId, reference: { type: "colis", id: "c-1" } })).toEqual([
            b.id,
          ]);
          expect(await ids({ compagnieId, reference: { type: "colis", id: "autre" } })).toEqual([]);
          expect(await ids({ compagnieId: c.compagnieId })).toEqual([c.id]);

          const sans = messageSms({ compagnieId: null, demandeurId, creeA: apres(4_000) });
          await journal.creer(sans);
          expect(await ids({ compagnieId: null, demandeurId })).toEqual([sans.id]);
          // Sans filtre de compagnie, toutes les compagnies sont vues.
          expect(await ids({ demandeurId })).toEqual([sans.id, a.id]);
        } finally {
          await fermer();
        }
      });

      it("trie du plus récent au plus ancien, borne par « du » (inclus) et « au » (exclu), limite", async () => {
        const { journal, fermer } = await creer();
        try {
          const compagnieId = randomUUID();
          const ms = [1_000, 2_000, 3_000, 4_000].map((d) =>
            messageSms({ compagnieId, creeA: apres(d) }),
          );
          for (const m of [ms[2]!, ms[0]!, ms[3]!, ms[1]!]) await journal.creer(m);
          const ids = async (f: Parameters<JournalSms["lister"]>[0]) =>
            (await journal.lister({ compagnieId, ...f })).map((m) => m.id);
          expect(await ids({})).toEqual([ms[3]!.id, ms[2]!.id, ms[1]!.id, ms[0]!.id]);
          expect(await ids({ du: apres(2_000), au: apres(4_000) })).toEqual([ms[2]!.id, ms[1]!.id]);
          expect(await ids({ limite: 2 })).toEqual([ms[3]!.id, ms[2]!.id]);
          expect(await ids({ du: apres(5_000) })).toEqual([]);
        } finally {
          await fermer();
        }
      });
    });

    describe("compter", () => {
      it("compte depuis un instant, par demandeur, par numéro (index aveugle) et par type", async () => {
        const { journal, fermer } = await creer();
        try {
          const demandeurId = randomUUID();
          const index = `index-${randomUUID()}`;
          const messages = [
            messageSms({ demandeurId, destinataireIndex: index, creeA: apres(1_000) }),
            messageSms({
              demandeurId,
              destinataireIndex: index,
              type: "systeme",
              creeA: apres(2_000),
            }),
            messageSms({ demandeurId, type: "retard", creeA: apres(3_000) }),
            messageSms({ destinataireIndex: index, creeA: apres(4_000) }),
          ];
          for (const m of messages) await journal.creer(m);
          expect(await journal.compter({ depuis: apres(0), demandeurId })).toBe(3);
          expect(await journal.compter({ depuis: apres(2_000), demandeurId })).toBe(2);
          expect(await journal.compter({ depuis: apres(0), destinataireIndex: index })).toBe(3);
          expect(
            await journal.compter({
              depuis: apres(0),
              destinataireIndex: index,
              types: ["billet", "retard"],
            }),
          ).toBe(2);
          expect(await journal.compter({ depuis: apres(5_000), demandeurId })).toBe(0);
          expect(await journal.compter({ depuis: apres(0), demandeurId: randomUUID() })).toBe(0);
        } finally {
          await fermer();
        }
      });
    });

    describe("essais", () => {
      it("garde les essais de chaque message dans l'ordre où ils ont eu lieu", async () => {
        const { journal, fermer } = await creer();
        try {
          const m = messageSms();
          const autre = messageSms();
          await journal.creer(m);
          await journal.creer(autre);
          const e1 = essai(m.id, {
            numero: 1,
            resultat: "temporaire",
            code: "delai_depasse",
            dureeMs: 5_000,
          });
          const e2 = essai(m.id, { numero: 1, fournisseur: "secours", at: apres(6_000) });
          const e3 = essai(m.id, { numero: 2, resultat: "definitif", code: "numero_invalide" });
          await journal.ajouterEssai(e1);
          await journal.ajouterEssai(essai(autre.id));
          await journal.ajouterEssai(e2);
          await journal.ajouterEssai(e3);
          expect(await journal.essais(m.id)).toEqual([e1, e2, e3]);
          expect(await journal.essais(autre.id)).toHaveLength(1);
          expect(await journal.essais(randomUUID())).toEqual([]);
        } finally {
          await fermer();
        }
      });
    });
  });
}

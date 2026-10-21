import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { JournalWhatsApp } from "../journal";
import type { EssaiWhatsApp, MessageEntrant, MessageWhatsApp } from "../types";

/**
 * Contrat du journal de la passerelle WhatsApp : les mêmes tests s'exécutent sur l'adaptateur en
 * mémoire et sur l'adaptateur PostgreSQL. Un comportement que la mémoire a et que PostgreSQL n'a pas
 * (ou l'inverse) fait échouer l'un des deux.
 *
 * Chaque test prend ses propres identifiants (compagnie, demandeur, numéro) : la base n'est pas
 * vidée entre deux tests.
 */

export interface BancJournalWhatsApp {
  journal: JournalWhatsApp;
  fermer(): Promise<void>;
}

export const T0 = new Date("2027-01-05T07:00:00.000Z");
export const apres = (ms: number): Date => new Date(T0.getTime() + ms);

/** Un message neuf, avec des identifiants que personne d'autre n'utilise. */
export function messageWhatsApp(surcharge: Partial<MessageWhatsApp> = {}): MessageWhatsApp {
  const id = surcharge.id ?? randomUUID();
  return {
    id,
    type: "billet",
    cle: `cle:${id}`,
    gabarit: "afrimove_billet",
    reference: { type: "billet", id: `billet-${id}` },
    compagnieId: randomUUID(),
    demandeurId: randomUUID(),
    destinataireChiffre: `chiffre-${id}`,
    destinataireIndex: `index-${id}`,
    destinataireMasque: "+237 ••••• 345",
    statut: "en_file",
    tentatives: 0,
    idFournisseur: null,
    derniereErreur: null,
    secours: "aucun",
    secoursSmsId: null,
    secoursChiffre: null,
    creeA: T0,
    planifieA: null,
    expireA: null,
    envoyeA: null,
    remisA: null,
    luA: null,
    delaiEnvoiMs: null,
    ...surcharge,
  };
}

export function entrantWhatsApp(surcharge: Partial<MessageEntrant> = {}): MessageEntrant {
  const id = surcharge.id ?? randomUUID();
  return {
    id,
    idFournisseur: `wamid.in-${id}`,
    expediteurIndex: `exp-${randomUUID()}`,
    expediteurMasque: "+237 ••••• 002",
    typeMessage: "text",
    recuA: T0,
    repondueA: null,
    delaiReponseMs: null,
    ...surcharge,
  };
}

const essai = (messageId: string, surcharge: Partial<EssaiWhatsApp> = {}): EssaiWhatsApp => ({
  messageId,
  numero: 1,
  fournisseur: "meta",
  at: apres(1_000),
  dureeMs: 180,
  resultat: "accepte",
  code: null,
  ...surcharge,
});

export function contratJournalWhatsApp(
  titre: string,
  creer: () => Promise<BancJournalWhatsApp>,
): void {
  describe(titre, () => {
    async function avec<T>(test: (journal: JournalWhatsApp) => Promise<T>): Promise<T> {
      const { journal, fermer } = await creer();
      try {
        return await test(journal);
      } finally {
        await fermer();
      }
    }

    describe("création idempotente", () => {
      it("crée le message et le relit à l'identique, sans contenu (il n'existe pas ici)", () =>
        avec(async (journal) => {
          const m = messageWhatsApp({
            planifieA: apres(900_000),
            expireA: apres(3_600_000),
            reference: { type: "colis", id: "colis-9" },
            secours: "en_cours",
            secoursChiffre: "v1.secours",
          });
          expect(await journal.creer(m)).toEqual({ cree: true, message: m });
          expect(await journal.trouver(m.id)).toEqual(m);
          expect(await journal.trouverParCle(m.cle)).toEqual(m);
          expect(Object.keys(m)).not.toContain("contenu");
          expect(Object.keys(m)).not.toContain("texte");
        }));

      it("un message sans gabarit, sans référence ni compagnie revient avec des null", () =>
        avec(async (journal) => {
          const m = messageWhatsApp({
            type: "reponse",
            gabarit: null,
            reference: null,
            compagnieId: null,
            demandeurId: null,
          });
          await journal.creer(m);
          expect(await journal.trouver(m.id)).toEqual(m);
        }));

      it("la même clé ne crée pas un second message : le premier est rendu, intact", () =>
        avec(async (journal) => {
          const premier = messageWhatsApp({ cle: `rapport:${randomUUID()}` });
          const second = messageWhatsApp({ cle: premier.cle, tentatives: 3 });
          expect((await journal.creer(premier)).cree).toBe(true);
          const res = await journal.creer(second);
          expect(res.cree).toBe(false);
          expect(res.message).toEqual(premier);
          expect(await journal.trouver(second.id)).toBeNull();
        }));

      it("huit demandes simultanées de la même clé : un seul message, un seul créateur", () =>
        avec(async (journal) => {
          const cle = `billet:${randomUUID()}`;
          const candidats = Array.from({ length: 8 }, () => messageWhatsApp({ cle }));
          const res = await Promise.all(candidats.map((c) => journal.creer(c)));
          expect(res.filter((r) => r.cree)).toHaveLength(1);
          const gagnant = res.find((r) => r.cree)!.message;
          expect(res.map((r) => r.message.id)).toEqual(Array(8).fill(gagnant.id));
          expect(await journal.trouverParCle(cle)).toMatchObject({ id: gagnant.id });
        }));

      it("une lecture inconnue rend null, y compris un identifiant qui n'est pas un UUID", () =>
        avec(async (journal) => {
          expect(await journal.trouver(randomUUID())).toBeNull();
          expect(await journal.trouver("pas-un-uuid")).toBeNull();
          expect(await journal.trouverParCle(`inconnue:${randomUUID()}`)).toBeNull();
          expect(await journal.trouverParFournisseur(`wamid.${randomUUID()}`)).toBeNull();
          expect(await journal.essais("pas-un-uuid")).toEqual([]);
          expect(await journal.modifier("pas-un-uuid", { statut: "annule" })).toBeNull();
          expect(await journal.reserverSecours("pas-un-uuid")).toBeNull();
        }));
    });

    describe("modifier", () => {
      it("fusionne les champs donnés et laisse les autres ; null efface une valeur", () =>
        avec(async (journal) => {
          const m = messageWhatsApp({ derniereErreur: "delai_depasse", tentatives: 2 });
          await journal.creer(m);
          const maj = await journal.modifier(m.id, {
            statut: "envoye",
            idFournisseur: `wamid.${m.id}`,
            envoyeA: apres(2_000),
            delaiEnvoiMs: 2_000,
            derniereErreur: null,
          });
          const attendu = {
            ...m,
            statut: "envoye",
            idFournisseur: `wamid.${m.id}`,
            envoyeA: apres(2_000),
            delaiEnvoiMs: 2_000,
            derniereErreur: null,
          };
          expect(maj).toEqual(attendu);
          expect(await journal.trouver(m.id)).toEqual(attendu);
          expect(await journal.trouverParFournisseur(`wamid.${m.id}`)).toEqual(attendu);
        }));

      it("la référence se modifie et s'efface comme les autres champs", () =>
        avec(async (journal) => {
          const m = messageWhatsApp();
          await journal.creer(m);
          const nouvelle = { type: "depart", id: "d-1" };
          expect((await journal.modifier(m.id, { reference: nouvelle }))?.reference).toEqual(
            nouvelle,
          );
          expect((await journal.modifier(m.id, { reference: null }))?.reference).toBeNull();
        }));

      it("un message inconnu rend null", () =>
        avec(async (journal) => {
          expect(await journal.modifier(randomUUID(), { statut: "annule" })).toBeNull();
        }));

      it("« seulementSi » : modifie quand le statut en fait partie, sinon ne touche à rien", () =>
        avec(async (journal) => {
          const m = messageWhatsApp({ statut: "remis", idFournisseur: `wamid.${randomUUID()}` });
          await journal.creer(m);
          // Un réessai en retard ne doit pas faire reculer un message déjà remis.
          expect(
            await journal.modifier(m.id, { statut: "en_reprise", tentatives: 3 }, [
              "en_file",
              "en_reprise",
            ]),
          ).toBeNull();
          expect(await journal.trouver(m.id)).toEqual(m);
          const maj = await journal.modifier(m.id, { statut: "lu", luA: apres(5_000) }, [
            "envoye",
            "remis",
          ]);
          expect(maj).toMatchObject({ statut: "lu", luA: apres(5_000) });
        }));

      it("dix changements simultanés « seulementSi » : un seul passe", () =>
        avec(async (journal) => {
          const m = messageWhatsApp();
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
        }));
    });

    describe("repli par SMS", () => {
      it("le repli ne se réserve qu'une fois : le premier l'obtient, les autres reçoivent null", () =>
        avec(async (journal) => {
          const m = messageWhatsApp({ secoursChiffre: "v1.secours" });
          await journal.creer(m);
          expect(await journal.reserverSecours(m.id)).toMatchObject({
            id: m.id,
            secours: "en_cours",
          });
          expect(await journal.reserverSecours(m.id)).toBeNull();
          expect(await journal.reserverSecours(randomUUID())).toBeNull();
          expect((await journal.trouver(m.id))?.secours).toBe("en_cours");
        }));

      it("dix instances qui veulent le repli en même temps : une seule l'obtient", () =>
        avec(async (journal) => {
          const m = messageWhatsApp({ secoursChiffre: "v1.secours" });
          await journal.creer(m);
          const res = await Promise.all(
            Array.from({ length: 10 }, () => journal.reserverSecours(m.id)),
          );
          expect(res.filter((r) => r !== null)).toHaveLength(1);
        }));

      it("un repli déjà passé (sms) ne se réserve pas", () =>
        avec(async (journal) => {
          const m = messageWhatsApp({ secours: "sms", secoursSmsId: "sms-1" });
          await journal.creer(m);
          expect(await journal.reserverSecours(m.id)).toBeNull();
        }));

      it("effacerSecoursAvant efface le texte de repli des messages plus anciens que la date, et d'eux seuls", () =>
        avec(async (journal) => {
          // Des dates qu'aucun autre test n'utilise, pour ne compter que ses propres messages.
          const base = new Date("2031-06-01T00:00:00.000Z");
          const vieux = messageWhatsApp({ creeA: base, secoursChiffre: "v1.vieux" });
          const limite = messageWhatsApp({
            creeA: new Date(base.getTime() + 3_600_000),
            secoursChiffre: "v1.limite",
          });
          const recent = messageWhatsApp({
            creeA: new Date(base.getTime() + 7_200_000),
            secoursChiffre: "v1.recent",
          });
          const sans = messageWhatsApp({ creeA: base, secoursChiffre: null });
          for (const m of [vieux, limite, recent, sans]) await journal.creer(m);
          const n = await journal.effacerSecoursAvant(new Date(base.getTime() + 3_600_000));
          expect(n).toBeGreaterThanOrEqual(1);
          expect((await journal.trouver(vieux.id))?.secoursChiffre).toBeNull();
          // La date est exclue : le message créé à cet instant garde son texte.
          expect((await journal.trouver(limite.id))?.secoursChiffre).toBe("v1.limite");
          expect((await journal.trouver(recent.id))?.secoursChiffre).toBe("v1.recent");
          // Rien d'autre n'a bougé.
          expect(await journal.trouver(vieux.id)).toEqual({ ...vieux, secoursChiffre: null });
        }));
    });

    describe("lister", () => {
      it("filtre par compagnie (null = sans compagnie), type, statut, référence et demandeur", () =>
        avec(async (journal) => {
          const compagnieId = randomUUID();
          const demandeurId = randomUUID();
          const a = messageWhatsApp({
            compagnieId,
            demandeurId,
            type: "billet",
            reference: { type: "billet", id: "b-1" },
            creeA: apres(1_000),
          });
          const b = messageWhatsApp({
            compagnieId,
            demandeurId: randomUUID(),
            type: "colis",
            statut: "envoye",
            reference: { type: "colis", id: "c-1" },
            creeA: apres(2_000),
          });
          const c = messageWhatsApp({ compagnieId: randomUUID(), creeA: apres(3_000) });
          for (const m of [a, b, c]) await journal.creer(m);
          const ids = async (f: Parameters<JournalWhatsApp["lister"]>[0]) =>
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

          const sans = messageWhatsApp({ compagnieId: null, demandeurId, creeA: apres(4_000) });
          await journal.creer(sans);
          expect(await ids({ compagnieId: null, demandeurId })).toEqual([sans.id]);
          // Sans filtre de compagnie, toutes les compagnies sont vues.
          expect(await ids({ demandeurId })).toEqual([sans.id, a.id]);
        }));

      it("trie du plus récent au plus ancien, borne par « du » (inclus) et « au » (exclu), limite", () =>
        avec(async (journal) => {
          const compagnieId = randomUUID();
          const ms = [1_000, 2_000, 3_000, 4_000].map((d) =>
            messageWhatsApp({ compagnieId, creeA: apres(d) }),
          );
          for (const m of [ms[2]!, ms[0]!, ms[3]!, ms[1]!]) await journal.creer(m);
          const ids = async (f: Parameters<JournalWhatsApp["lister"]>[0]) =>
            (await journal.lister({ compagnieId, ...f })).map((m) => m.id);
          expect(await ids({})).toEqual([ms[3]!.id, ms[2]!.id, ms[1]!.id, ms[0]!.id]);
          expect(await ids({ du: apres(2_000), au: apres(4_000) })).toEqual([ms[2]!.id, ms[1]!.id]);
          expect(await ids({ limite: 2 })).toEqual([ms[3]!.id, ms[2]!.id]);
          expect(await ids({ du: apres(5_000) })).toEqual([]);
        }));
    });

    describe("compter", () => {
      it("compte depuis un instant, par demandeur, par numéro (index aveugle) et par type", () =>
        avec(async (journal) => {
          const demandeurId = randomUUID();
          const index = `index-${randomUUID()}`;
          const messages = [
            messageWhatsApp({ demandeurId, destinataireIndex: index, creeA: apres(1_000) }),
            messageWhatsApp({
              demandeurId,
              destinataireIndex: index,
              type: "reponse",
              gabarit: null,
              creeA: apres(2_000),
            }),
            messageWhatsApp({ demandeurId, type: "alerte_retard", creeA: apres(3_000) }),
            messageWhatsApp({ destinataireIndex: index, creeA: apres(4_000) }),
          ];
          for (const m of messages) await journal.creer(m);
          expect(await journal.compter({ depuis: apres(0), demandeurId })).toBe(3);
          expect(await journal.compter({ depuis: apres(2_000), demandeurId })).toBe(2);
          expect(await journal.compter({ depuis: apres(0), destinataireIndex: index })).toBe(3);
          expect(
            await journal.compter({
              depuis: apres(0),
              destinataireIndex: index,
              types: ["billet", "alerte_retard"],
            }),
          ).toBe(2);
          expect(await journal.compter({ depuis: apres(5_000), demandeurId })).toBe(0);
          expect(await journal.compter({ depuis: apres(0), demandeurId: randomUUID() })).toBe(0);
        }));
    });

    describe("essais", () => {
      it("garde les essais de chaque message dans l'ordre où ils ont eu lieu", () =>
        avec(async (journal) => {
          const m = messageWhatsApp();
          const autre = messageWhatsApp();
          await journal.creer(m);
          await journal.creer(autre);
          const e1 = essai(m.id, {
            numero: 1,
            resultat: "temporaire",
            code: "delai_depasse",
            dureeMs: 5_000,
          });
          const e2 = essai(m.id, { numero: 2, at: apres(6_000) });
          const e3 = essai(m.id, { numero: 3, resultat: "definitif", code: "pas_sur_whatsapp" });
          await journal.ajouterEssai(e1);
          await journal.ajouterEssai(essai(autre.id));
          await journal.ajouterEssai(e2);
          await journal.ajouterEssai(e3);
          expect(await journal.essais(m.id)).toEqual([e1, e2, e3]);
          expect(await journal.essais(autre.id)).toHaveLength(1);
          expect(await journal.essais(randomUUID())).toEqual([]);
        }));
    });

    describe("messages reçus", () => {
      it("enregistre un message reçu et le retrouve comme dernier de son expéditeur", () =>
        avec(async (journal) => {
          const e = entrantWhatsApp({ recuA: apres(1_000), typeMessage: "button" });
          expect(await journal.dernierEntrant(e.expediteurIndex)).toBeNull();
          expect(await journal.enregistrerEntrant(e)).toBe(true);
          expect(await journal.dernierEntrant(e.expediteurIndex)).toEqual(e);
        }));

      it("un identifiant WhatsApp déjà vu est un doublon : rien n'est enregistré", () =>
        avec(async (journal) => {
          const e = entrantWhatsApp();
          expect(await journal.enregistrerEntrant(e)).toBe(true);
          const autre = entrantWhatsApp({
            idFournisseur: e.idFournisseur,
            expediteurIndex: e.expediteurIndex,
            recuA: apres(9_000),
          });
          expect(await journal.enregistrerEntrant(autre)).toBe(false);
          expect(await journal.dernierEntrant(e.expediteurIndex)).toEqual(e);
        }));

      it("un webhook rejoué dix fois à la fois : un seul enregistrement", () =>
        avec(async (journal) => {
          const idFournisseur = `wamid.in-${randomUUID()}`;
          const res = await Promise.all(
            Array.from({ length: 10 }, () =>
              journal.enregistrerEntrant(entrantWhatsApp({ idFournisseur })),
            ),
          );
          expect(res.filter(Boolean)).toHaveLength(1);
        }));

      it("le dernier message reçu est le plus récent de cet expéditeur", () =>
        avec(async (journal) => {
          const expediteurIndex = `exp-${randomUUID()}`;
          const vieux = entrantWhatsApp({ expediteurIndex, recuA: apres(1_000) });
          const recent = entrantWhatsApp({ expediteurIndex, recuA: apres(5_000) });
          const milieu = entrantWhatsApp({ expediteurIndex, recuA: apres(3_000) });
          for (const e of [recent, vieux, milieu]) await journal.enregistrerEntrant(e);
          expect((await journal.dernierEntrant(expediteurIndex))?.id).toBe(recent.id);
        }));

      it("la réponse du compte marque le plus ancien message en attente, avec son délai", () =>
        avec(async (journal) => {
          const expediteurIndex = `exp-${randomUUID()}`;
          const premier = entrantWhatsApp({ expediteurIndex, recuA: apres(1_000) });
          const second = entrantWhatsApp({ expediteurIndex, recuA: apres(2_000) });
          await journal.enregistrerEntrant(second);
          await journal.enregistrerEntrant(premier);
          const fenetre = 24 * 3_600_000;
          const un = await journal.marquerReponse(expediteurIndex, apres(61_000), fenetre);
          expect(un).toEqual({ ...premier, repondueA: apres(61_000), delaiReponseMs: 60_000 });
          const deux = await journal.marquerReponse(expediteurIndex, apres(122_000), fenetre);
          expect(deux).toEqual({ ...second, repondueA: apres(122_000), delaiReponseMs: 120_000 });
          expect(await journal.marquerReponse(expediteurIndex, apres(130_000), fenetre)).toBeNull();
          expect(await journal.marquerReponse(`exp-${randomUUID()}`, apres(1), fenetre)).toBeNull();
        }));

      it("la fenêtre est respectée : un message trop ancien ou plus récent que la réponse n'est pas marqué", () =>
        avec(async (journal) => {
          const expediteurIndex = `exp-${randomUUID()}`;
          const ancien = entrantWhatsApp({ expediteurIndex, recuA: apres(0) });
          await journal.enregistrerEntrant(ancien);
          // Juste à la limite de la fenêtre : marqué ; une milliseconde de plus : non.
          expect(await journal.marquerReponse(expediteurIndex, apres(10_001), 10_000)).toBeNull();
          const limite = entrantWhatsApp({ expediteurIndex, recuA: apres(100_000) });
          await journal.enregistrerEntrant(limite);
          expect((await journal.marquerReponse(expediteurIndex, apres(110_000), 10_000))?.id).toBe(
            limite.id,
          );
          // Une réponse « avant » le message reçu ne le marque pas.
          const futur = entrantWhatsApp({ expediteurIndex, recuA: apres(500_000) });
          await journal.enregistrerEntrant(futur);
          expect(await journal.marquerReponse(expediteurIndex, apres(400_000), 10_000)).toBeNull();
        }));

      it("deux réponses simultanées ne marquent jamais le même message", () =>
        avec(async (journal) => {
          const expediteurIndex = `exp-${randomUUID()}`;
          const messages = [1, 2, 3].map((i) =>
            entrantWhatsApp({ expediteurIndex, recuA: apres(i * 1_000) }),
          );
          for (const e of messages) await journal.enregistrerEntrant(e);
          const res = await Promise.all(
            Array.from({ length: 6 }, () =>
              journal.marquerReponse(expediteurIndex, apres(10_000), 3_600_000),
            ),
          );
          const marques = res.filter((r) => r !== null).map((r) => r!.id);
          expect(marques).toHaveLength(3);
          expect(new Set(marques).size).toBe(3);
        }));

      it("les délais de réponse ne portent que sur les messages répondus, depuis la date donnée", () =>
        avec(async (journal) => {
          const base = new Date("2032-01-01T00:00:00.000Z");
          const a = entrantWhatsApp({
            recuA: new Date(base.getTime() + 1_000),
            repondueA: new Date(base.getTime() + 61_000),
            delaiReponseMs: 60_000,
          });
          const b = entrantWhatsApp({
            recuA: new Date(base.getTime() + 2_000),
            repondueA: new Date(base.getTime() + 182_000),
            delaiReponseMs: 180_000,
          });
          const sansReponse = entrantWhatsApp({ recuA: new Date(base.getTime() + 3_000) });
          const avant = entrantWhatsApp({
            recuA: new Date(base.getTime() - 1_000),
            repondueA: base,
            delaiReponseMs: 1_000,
          });
          for (const e of [b, sansReponse, avant, a]) await journal.enregistrerEntrant(e);
          expect((await journal.delaisReponse(base)).sort((x, y) => x - y)).toEqual([
            60_000, 180_000,
          ]);
          expect(await journal.delaisReponse(new Date(base.getTime() + 10_000))).toEqual([]);
        }));
    });
  });
}

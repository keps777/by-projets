import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AchatWhatsApp, ConversationStockee, EntreeJournalAchat, EtatAchat } from "../modeles";
import type { AchatsWhatsApp, ConversationsAchat, JournalAchatWhatsApp } from "../ports";

/**
 * Contrat des trois ports de stockage de l'achat par WhatsApp (`ConversationsAchat`,
 * `JournalAchatWhatsApp`, `AchatsWhatsApp`) : les mêmes tests s'exécutent sur la mémoire (toujours) et
 * sur PostgreSQL (quand `DATABASE_URL_TEST` est donnée). Un comportement que la mémoire a et que la
 * base n'a pas (ou l'inverse) fait échouer l'un des deux.
 *
 * Chaque test prend ses propres identifiants : la base n'est pas vidée entre deux tests.
 */

export interface BancAchatWhatsApp {
  conversations: ConversationsAchat;
  journal: JournalAchatWhatsApp;
  achats: AchatsWhatsApp;
  /** Les entrées du journal portant cette empreinte de conversation, de la plus ancienne à la plus récente. */
  relireJournal(conversationRef: string): Promise<EntreeJournalAchat[]>;
  fermer(): Promise<void>;
}

export const T0 = new Date("2026-11-02T06:00:00.000Z");
export const apres = (ms: number, de: Date = T0): Date => new Date(de.getTime() + ms);

export function uneConversation(surcharge: Partial<ConversationStockee> = {}): ConversationStockee {
  return {
    cle: `index-${randomUUID()}`,
    expireA: apres(1_800_000),
    charge: `v1.${randomUUID()}`,
    ...surcharge,
  };
}

export function unAchat(surcharge: Partial<AchatWhatsApp> = {}): AchatWhatsApp {
  return {
    commandeId: randomUUID(),
    voyageurId: randomUUID(),
    etat: "reservee",
    langue: "fr",
    destinataireChiffre: `v1.${randomUUID()}`,
    creeA: T0,
    ...surcharge,
  };
}

export function uneEntree(surcharge: Partial<EntreeJournalAchat> = {}): EntreeJournalAchat {
  return {
    id: randomUUID(),
    at: T0,
    numeroMasque: "+237 ••••• 008",
    conversationRef: randomUUID().replace(/-/g, "").slice(0, 12),
    evenement: "message",
    etape: "departs",
    langue: "fr",
    source: "texte",
    code: null,
    dureeMs: 12,
    ...surcharge,
  };
}

export function contratStockageAchatWhatsApp(
  nom: string,
  creerBanc: () => Promise<BancAchatWhatsApp>,
): void {
  describe(`contrat · stockage de l'achat par WhatsApp · ${nom}`, () => {
    async function avec<T>(test: (b: BancAchatWhatsApp) => Promise<T>): Promise<T> {
      const banc = await creerBanc();
      try {
        return await test(banc);
      } finally {
        await banc.fermer();
      }
    }

    /* -------------------------------------------------------------- conversations */

    it("une conversation écrite se relit telle quelle, une conversation inconnue n'existe pas", () =>
      avec(async ({ conversations }) => {
        const c = uneConversation();
        expect(await conversations.lire(c.cle, T0)).toBeNull();
        await conversations.ecrire(c);
        expect(await conversations.lire(c.cle, apres(1000))).toEqual(c);
      }));

    it("réécrire une conversation remplace sa charge et son échéance", () =>
      avec(async ({ conversations }) => {
        const c = uneConversation();
        await conversations.ecrire(c);
        const suite = { ...c, charge: "v1.suite", expireA: apres(3_600_000) };
        await conversations.ecrire(suite);
        expect(await conversations.lire(c.cle, apres(1_900_000))).toEqual(suite);
      }));

    it("une conversation échue n'est plus rendue, et elle disparaît", () =>
      avec(async ({ conversations }) => {
        const c = uneConversation({ expireA: apres(120_000) });
        await conversations.ecrire(c);
        expect(await conversations.lire(c.cle, apres(119_999))).toEqual(c);
        // À l'instant même de l'échéance, elle est échue.
        expect(await conversations.lire(c.cle, apres(120_000))).toBeNull();
        // Et même avec une horloge qui reculerait, la conversation a bien été retirée.
        expect(await conversations.lire(c.cle, T0)).toBeNull();
      }));

    it("supprimer retire la conversation, sans erreur si elle n'existe pas", () =>
      avec(async ({ conversations }) => {
        const c = uneConversation();
        await conversations.ecrire(c);
        await conversations.supprimer(c.cle);
        await conversations.supprimer(c.cle);
        expect(await conversations.lire(c.cle, T0)).toBeNull();
      }));

    it("purger retire les conversations échues, et elles seules", () =>
      avec(async ({ conversations }) => {
        // Chaque test de ce fichier partage la base : on ne compte que ce que ce test a écrit,
        // avec une échéance qu'aucun autre test n'utilise.
        const marque = apres(7_000_000_000);
        const echues = [
          uneConversation({ expireA: apres(1, marque) }),
          uneConversation({ expireA: marque }),
        ];
        const vivante = uneConversation({ expireA: apres(1_000_000, marque) });
        for (const c of [...echues, vivante]) await conversations.ecrire(c);
        const retirees = await conversations.purger(apres(500, marque));
        expect(retirees).toBeGreaterThanOrEqual(2);
        expect(await conversations.lire(vivante.cle, apres(500, marque))).toEqual(vivante);
        for (const c of echues) expect(await conversations.lire(c.cle, T0)).toBeNull();
      }));

    it("des écritures simultanées de la même conversation laissent l'une d'elles, entière", () =>
      avec(async ({ conversations }) => {
        const cle = `index-${randomUUID()}`;
        const versions = Array.from({ length: 10 }, (_, i) =>
          uneConversation({ cle, charge: `v1.ecriture-${i}`, expireA: apres(60_000 + i) }),
        );
        await Promise.all(versions.map((v) => conversations.ecrire(v)));
        const lue = await conversations.lire(cle, T0);
        expect(lue).not.toBeNull();
        // La ligne est celle d'une écriture, pas un mélange de deux.
        expect(versions).toContainEqual(lue);
      }));

    /* -------------------------------------------------------------- achats */

    it("un achat ajouté se relit tel quel, un achat inconnu n'existe pas", () =>
      avec(async ({ achats }) => {
        const a = unAchat({ langue: "pcm", creeA: apres(5000) });
        expect(await achats.trouver(a.commandeId)).toBeNull();
        await achats.ajouter(a);
        expect(await achats.trouver(a.commandeId)).toEqual(a);
        expect(await achats.trouver(randomUUID())).toBeNull();
        expect(await achats.trouver("pas-un-uuid")).toBeNull();
      }));

    it("ajouter un achat déjà connu ne le remet pas à son état d'origine", () =>
      avec(async ({ achats }) => {
        const a = unAchat();
        await achats.ajouter(a);
        await achats.transitionner(a.commandeId, ["reservee"], "paiement_demande");
        await achats.ajouter(a);
        expect((await achats.trouver(a.commandeId))?.etat).toBe("paiement_demande");
      }));

    it("une transition compare et remplace : elle réussit une fois, puis l'état attendu a changé", () =>
      avec(async ({ achats }) => {
        const a = unAchat();
        await achats.ajouter(a);
        const premiere = await achats.transitionner(a.commandeId, ["reservee"], "paiement_demande");
        expect(premiere).toEqual({ ...a, etat: "paiement_demande" });
        expect(await achats.transitionner(a.commandeId, ["reservee"], "abandonnee")).toBeNull();
        const suite = await achats.transitionner(
          a.commandeId,
          ["reservee", "paiement_demande"],
          "echouee",
        );
        expect(suite?.etat).toBe("echouee");
        expect(await achats.transitionner(randomUUID(), ["reservee"], "terminee")).toBeNull();
        expect(await achats.transitionner("pas-un-uuid", ["reservee"], "terminee")).toBeNull();
        expect(await achats.transitionner(a.commandeId, [], "terminee")).toBeNull();
      }));

    it("huit instances qui terminent le même achat : une seule réussit", () =>
      avec(async ({ achats }) => {
        const a = unAchat({ etat: "paiement_demande" });
        await achats.ajouter(a);
        const resultats = await Promise.all(
          Array.from({ length: 8 }, () =>
            achats.transitionner(a.commandeId, ["paiement_demande"], "terminee"),
          ),
        );
        expect(resultats.filter((r) => r !== null)).toHaveLength(1);
        expect((await achats.trouver(a.commandeId))?.etat).toBe("terminee");
      }));

    it("le webhook de paiement et le balayage qui abandonnent l'achat en même temps : un seul gagnant", () =>
      avec(async ({ achats }) => {
        const a = unAchat({ etat: "paiement_demande" });
        await achats.ajouter(a);
        const [abandon, fin] = await Promise.all([
          achats.transitionner(a.commandeId, ["reservee", "paiement_demande"], "abandonnee"),
          achats.transitionner(a.commandeId, ["paiement_demande"], "terminee"),
        ]);
        expect([abandon, fin].filter((r) => r !== null)).toHaveLength(1);
        const final = (await achats.trouver(a.commandeId))?.etat;
        expect(final).toBe(abandon ? "abandonnee" : "terminee");
      }));

    it("enEtat rend les achats de ces états, les plus anciens d'abord, dans la limite demandée", () =>
      avec(async ({ achats }) => {
        // Un voyageur propre à ce test et des dates qu'aucun autre test n'utilise.
        const base = apres(8_000_000_000);
        const voyageurId = randomUUID();
        const ancien = unAchat({ voyageurId, creeA: apres(1000, base) });
        const milieu = unAchat({ voyageurId, creeA: apres(2000, base), etat: "paiement_demande" });
        const recent = unAchat({ voyageurId, creeA: apres(3000, base) });
        const fini = unAchat({ voyageurId, creeA: apres(1500, base), etat: "terminee" });
        const echoue = unAchat({ voyageurId, creeA: apres(2500, base), etat: "echouee" });
        for (const a of [recent, fini, echoue, ancien, milieu]) await achats.ajouter(a);
        const etats: EtatAchat[] = ["reservee", "paiement_demande"];
        const lus = (await achats.enEtat(etats, 10_000)).filter((a) => a.voyageurId === voyageurId);
        expect(lus.map((a) => a.commandeId)).toEqual([
          ancien.commandeId,
          milieu.commandeId,
          recent.commandeId,
        ]);
        expect(await achats.enEtat(etats, 0)).toEqual([]);
        expect(await achats.enEtat([], 10)).toEqual([]);
        const autres = (await achats.enEtat(["terminee", "echouee"], 10_000)).filter(
          (a) => a.voyageurId === voyageurId,
        );
        expect(autres.map((a) => a.commandeId)).toEqual([fini.commandeId, echoue.commandeId]);
      }));

    /* -------------------------------------------------------------- journal */

    it("une entrée du journal se relit telle quelle, nulls compris", () =>
      avec(async ({ journal, relireJournal }) => {
        const complete = uneEntree({
          evenement: "paiement_refuse",
          etape: "paiement",
          langue: "pcm",
          source: "vocal",
          code: "PAIEMENT_REFUSE",
          dureeMs: 345,
          at: apres(1000),
        });
        const minimale = uneEntree({
          conversationRef: complete.conversationRef,
          evenement: "erreur",
          numeroMasque: null,
          etape: null,
          langue: null,
          source: null,
          code: null,
          dureeMs: null,
          at: apres(2000),
        });
        await journal.enregistrer(minimale);
        await journal.enregistrer(complete);
        expect(await relireJournal(complete.conversationRef!)).toEqual([complete, minimale]);
      }));

    it("enregistrer deux fois la même entrée ne l'écrit qu'une fois", () =>
      avec(async ({ journal, relireJournal }) => {
        const e = uneEntree();
        await Promise.all([journal.enregistrer(e), journal.enregistrer(e), journal.enregistrer(e)]);
        expect(await relireJournal(e.conversationRef!)).toEqual([e]);
      }));
  });
}

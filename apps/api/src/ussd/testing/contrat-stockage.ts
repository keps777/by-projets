import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AchatUssd, EntreeJournalUssd, EtatAchatUssd, SessionStockee } from "../modeles";
import type { AchatsUssd, JournalUssd, SessionsUssd } from "../ports";

/**
 * Contrat des trois ports de stockage du service USSD (`SessionsUssd`, `JournalUssd`, `AchatsUssd`) :
 * les mêmes tests s'exécutent sur la mémoire (toujours) et sur PostgreSQL (quand `DATABASE_URL_TEST`
 * est donnée). Un comportement que la mémoire a et que la base n'a pas (ou l'inverse) fait échouer
 * l'un des deux.
 *
 * Chaque test prend ses propres identifiants : la base n'est pas vidée entre deux tests.
 */

export interface BancUssd {
  sessions: SessionsUssd;
  journal: JournalUssd;
  achats: AchatsUssd;
  /** Les entrées du journal portant cette empreinte de session, de la plus ancienne à la plus récente. */
  relireJournal(sessionRef: string): Promise<EntreeJournalUssd[]>;
  fermer(): Promise<void>;
}

export const T0 = new Date("2026-11-02T06:00:00.000Z");
export const apres = (ms: number, de: Date = T0): Date => new Date(de.getTime() + ms);

export function uneSession(surcharge: Partial<SessionStockee> = {}): SessionStockee {
  return {
    cle: `mtn:${randomUUID()}`,
    expireA: apres(120_000),
    charge: `v1.${randomUUID()}`,
    ...surcharge,
  };
}

export function unAchat(surcharge: Partial<AchatUssd> = {}): AchatUssd {
  return {
    commandeId: randomUUID(),
    voyageurId: randomUUID(),
    operateur: "mtn",
    etat: "reservee",
    destinataireChiffre: `v1.${randomUUID()}`,
    creeA: T0,
    ...surcharge,
  };
}

export function uneEntree(surcharge: Partial<EntreeJournalUssd> = {}): EntreeJournalUssd {
  return {
    id: randomUUID(),
    at: T0,
    operateur: "mtn",
    msisdnMasque: "+237 ••••• 345",
    sessionRef: randomUUID().replace(/-/g, "").slice(0, 12),
    evenement: "ouverte",
    etape: "menu",
    code: null,
    dureeMs: 12,
    ...surcharge,
  };
}

export function contratStockageUssd(nom: string, creerBanc: () => Promise<BancUssd>): void {
  describe(`contrat · stockage USSD · ${nom}`, () => {
    async function avec<T>(test: (b: BancUssd) => Promise<T>): Promise<T> {
      const banc = await creerBanc();
      try {
        return await test(banc);
      } finally {
        await banc.fermer();
      }
    }

    /* -------------------------------------------------------------- sessions */

    it("une session écrite se relit telle quelle, une session inconnue n'existe pas", () =>
      avec(async ({ sessions }) => {
        const s = uneSession();
        expect(await sessions.lire(s.cle, T0)).toBeNull();
        await sessions.ecrire(s);
        expect(await sessions.lire(s.cle, apres(1000))).toEqual(s);
      }));

    it("réécrire une session remplace sa charge et son échéance", () =>
      avec(async ({ sessions }) => {
        const s = uneSession();
        await sessions.ecrire(s);
        const suite = { ...s, charge: "v1.suite", expireA: apres(240_000) };
        await sessions.ecrire(suite);
        expect(await sessions.lire(s.cle, apres(130_000))).toEqual(suite);
      }));

    it("une session échue n'est plus rendue, et elle disparaît", () =>
      avec(async ({ sessions }) => {
        const s = uneSession({ expireA: apres(120_000) });
        await sessions.ecrire(s);
        expect(await sessions.lire(s.cle, apres(119_999))).toEqual(s);
        // À l'instant même de l'échéance, elle est échue.
        expect(await sessions.lire(s.cle, apres(120_000))).toBeNull();
        // Et même avec une horloge qui reculerait, la session a bien été retirée.
        expect(await sessions.lire(s.cle, T0)).toBeNull();
      }));

    it("supprimer retire la session, sans erreur si elle n'existe pas", () =>
      avec(async ({ sessions }) => {
        const s = uneSession();
        await sessions.ecrire(s);
        await sessions.supprimer(s.cle);
        await sessions.supprimer(s.cle);
        expect(await sessions.lire(s.cle, T0)).toBeNull();
      }));

    it("purger retire les sessions échues, et elles seules", () =>
      avec(async ({ sessions }) => {
        // Chaque test de ce fichier partage la base : on ne compte que ce que ce test a écrit,
        // avec une échéance qu'aucun autre test n'utilise.
        const marque = apres(7_000_000_000);
        const echues = [uneSession({ expireA: apres(1, marque) }), uneSession({ expireA: marque })];
        const vivante = uneSession({ expireA: apres(1_000_000, marque) });
        for (const s of [...echues, vivante]) await sessions.ecrire(s);
        const retirees = await sessions.purger(apres(500, marque));
        expect(retirees).toBeGreaterThanOrEqual(2);
        expect(await sessions.lire(vivante.cle, apres(500, marque))).toEqual(vivante);
        for (const s of echues) expect(await sessions.lire(s.cle, T0)).toBeNull();
      }));

    it("des écritures simultanées de la même session laissent l'une d'elles, entière", () =>
      avec(async ({ sessions }) => {
        const cle = `orange:${randomUUID()}`;
        const versions = Array.from({ length: 10 }, (_, i) =>
          uneSession({ cle, charge: `v1.ecriture-${i}`, expireA: apres(60_000 + i) }),
        );
        await Promise.all(versions.map((v) => sessions.ecrire(v)));
        const lue = await sessions.lire(cle, T0);
        expect(lue).not.toBeNull();
        // La ligne est celle d'une écriture, pas un mélange de deux.
        expect(versions).toContainEqual(lue);
      }));

    /* -------------------------------------------------------------- achats */

    it("un achat ajouté se relit tel quel, un achat inconnu n'existe pas", () =>
      avec(async ({ achats }) => {
        const a = unAchat({ operateur: "orange", creeA: apres(5000) });
        expect(await achats.trouver(a.commandeId)).toBeNull();
        await achats.ajouter(a);
        expect(await achats.trouver(a.commandeId)).toEqual(a);
        expect(await achats.trouver(randomUUID())).toBeNull();
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
          "terminee",
        );
        expect(suite?.etat).toBe("terminee");
        expect(await achats.transitionner(randomUUID(), ["reservee"], "terminee")).toBeNull();
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

    it("la fin d'une session et le webhook qui terminent l'achat en même temps : un seul gagnant", () =>
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
        for (const a of [recent, fini, ancien, milieu]) await achats.ajouter(a);
        const etats: EtatAchatUssd[] = ["reservee", "paiement_demande"];
        const lus = (await achats.enEtat(etats, 10_000)).filter((a) => a.voyageurId === voyageurId);
        expect(lus.map((a) => a.commandeId)).toEqual([
          ancien.commandeId,
          milieu.commandeId,
          recent.commandeId,
        ]);
        expect(await achats.enEtat(etats, 0)).toEqual([]);
        expect(await achats.enEtat([], 10)).toEqual([]);
        const terminees = (await achats.enEtat(["terminee"], 10_000)).filter(
          (a) => a.voyageurId === voyageurId,
        );
        expect(terminees.map((a) => a.commandeId)).toEqual([fini.commandeId]);
      }));

    /* -------------------------------------------------------------- journal */

    it("une entrée du journal se relit telle quelle, nulls compris", () =>
      avec(async ({ journal, relireJournal }) => {
        const complete = uneEntree({
          evenement: "paiement_refuse",
          etape: "confirmation",
          code: "PAIEMENT_REFUSE",
          dureeMs: 345,
          at: apres(1000),
        });
        const minimale = uneEntree({
          sessionRef: complete.sessionRef,
          evenement: "refus_jeton",
          msisdnMasque: null,
          etape: null,
          code: null,
          dureeMs: null,
          at: apres(2000),
        });
        await journal.enregistrer(minimale);
        await journal.enregistrer(complete);
        expect(await relireJournal(complete.sessionRef!)).toEqual([complete, minimale]);
      }));

    it("enregistrer deux fois la même entrée ne l'écrit qu'une fois", () =>
      avec(async ({ journal, relireJournal }) => {
        const e = uneEntree();
        await Promise.all([journal.enregistrer(e), journal.enregistrer(e), journal.enregistrer(e)]);
        expect(await relireJournal(e.sessionRef!)).toEqual([e]);
      }));
  });
}

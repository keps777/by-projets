import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { CodeEmis, FichesVoyageur, StockageConnexion } from "../ports";
import type { ReglesEnvoi, ReglesEssais } from "../regles";

/**
 * Contrat du port `StockageConnexion` : les mêmes tests s'exécutent sur la mémoire (toujours) et sur
 * l'adaptateur PostgreSQL du coordinateur (quand une base de test est donnée). C'est ici que se
 * vérifie ce que la base doit garantir seule : quota d'envois, blocage et usage unique résistent à
 * des requêtes simultanées.
 */

export const ENVOI: ReglesEnvoi = { intervalleMs: 40_000, maxParFenetre: 5, fenetreMs: 3_600_000 };
export const ESSAIS: ReglesEssais = {
  essaisMax: 5,
  fenetreEchecsMs: 3_600_000,
  blocageBaseMs: 900_000,
  blocageMaxMs: 86_400_000,
};

export const T0 = new Date("2027-01-05T08:00:00.000Z");
export const apres = (ms: number, de: Date = T0): Date => new Date(de.getTime() + ms);

export function unCode(
  telephoneIndex: string,
  creeA: Date,
  surcharge: Partial<CodeEmis> = {},
): CodeEmis {
  return {
    id: randomUUID(),
    telephoneIndex,
    codeHache: "a".repeat(64),
    canal: "sms",
    creeA,
    expireA: apres(300_000, creeA),
    consommeA: null,
    ...surcharge,
  };
}

export interface BancStockage {
  stockage: StockageConnexion;
  /** Un numéro (index) que personne n'a encore utilisé dans ce banc. */
  nouveauNumero(): string;
}

export function contratStockageConnexion(
  nom: string,
  creer: () => Promise<{ banc: BancStockage; fermer?: () => Promise<void> }>,
): void {
  describe(`StockageConnexion : ${nom}`, () => {
    async function avec<T>(test: (b: BancStockage) => Promise<T>): Promise<T> {
      const { banc, fermer } = await creer();
      try {
        return await test(banc);
      } finally {
        await fermer?.();
      }
    }

    it("accepte un premier envoi, puis refuse le suivant avant 40 s en disant quand réessayer", () =>
      avec(async ({ stockage, nouveauNumero }) => {
        const tel = nouveauNumero();
        expect(await stockage.reserverEnvoi(unCode(tel, T0), ENVOI)).toEqual({ ok: true });
        expect(await stockage.reserverEnvoi(unCode(tel, apres(39_999)), ENVOI)).toEqual({
          ok: false,
          raison: "trop_tot",
          reessayerA: apres(40_000),
        });
        expect(await stockage.reserverEnvoi(unCode(tel, apres(40_000)), ENVOI)).toEqual({
          ok: true,
        });
      }));

    it("limite à 5 envois par heure et dit quand le premier sort de la fenêtre", () =>
      avec(async ({ stockage, nouveauNumero }) => {
        const tel = nouveauNumero();
        for (let i = 0; i < 5; i++) {
          expect(await stockage.reserverEnvoi(unCode(tel, apres(i * 60_000)), ENVOI)).toEqual({
            ok: true,
          });
        }
        expect(await stockage.reserverEnvoi(unCode(tel, apres(5 * 60_000)), ENVOI)).toEqual({
          ok: false,
          raison: "quota",
          reessayerA: apres(3_600_000),
        });
        // Le premier envoi sort de la fenêtre : un de plus est permis.
        expect(await stockage.reserverEnvoi(unCode(tel, apres(3_600_001)), ENVOI)).toEqual({
          ok: true,
        });
      }));

    it("ne mélange pas les numéros", () =>
      avec(async ({ stockage, nouveauNumero }) => {
        const [a, b] = [nouveauNumero(), nouveauNumero()];
        await stockage.reserverEnvoi(unCode(a, T0), ENVOI);
        expect(await stockage.reserverEnvoi(unCode(b, apres(1000)), ENVOI)).toEqual({ ok: true });
        await stockage.noterEchec(a, T0, ESSAIS);
        expect((await stockage.etat(b)).echecs).toBe(0);
        expect((await stockage.dernierCode(b))?.telephoneIndex).toBe(b);
      }));

    it("annuler un envoi libère le numéro tout de suite et efface le code", () =>
      avec(async ({ stockage, nouveauNumero }) => {
        const tel = nouveauNumero();
        const code = unCode(tel, T0);
        await stockage.reserverEnvoi(code, ENVOI);
        await stockage.annulerEnvoi(code.id);
        expect(await stockage.dernierCode(tel)).toBeNull();
        expect(await stockage.reserverEnvoi(unCode(tel, apres(1000)), ENVOI)).toEqual({ ok: true });
      }));

    it("des envois simultanés ne dépassent ni l'intervalle ni le quota", () =>
      avec(async ({ stockage, nouveauNumero }) => {
        const tel = nouveauNumero();
        // Même instant : un seul passe.
        const memeInstant = await Promise.all(
          Array.from({ length: 8 }, () => stockage.reserverEnvoi(unCode(tel, T0), ENVOI)),
        );
        expect(memeInstant.filter((r) => r.ok)).toHaveLength(1);

        // Espacés de 41 s mais demandés ensemble : au plus 5 sur l'heure, en tout.
        const autre = nouveauNumero();
        const espaces = await Promise.all(
          Array.from({ length: 12 }, (_, i) =>
            stockage.reserverEnvoi(unCode(autre, apres(i * 41_000)), ENVOI),
          ),
        );
        expect(espaces.filter((r) => r.ok).length).toBeLessThanOrEqual(5);
      }));

    it("rend le code le plus récent, consommé ou non", () =>
      avec(async ({ stockage, nouveauNumero }) => {
        const tel = nouveauNumero();
        expect(await stockage.dernierCode(tel)).toBeNull();
        const un = unCode(tel, T0);
        const deux = unCode(tel, apres(60_000));
        await stockage.reserverEnvoi(un, ENVOI);
        await stockage.reserverEnvoi(deux, ENVOI);
        expect((await stockage.dernierCode(tel))?.id).toBe(deux.id);
        await stockage.consommer(deux.id, apres(70_000));
        const lu = await stockage.dernierCode(tel);
        expect(lu?.id).toBe(deux.id);
        expect(lu?.consommeA).toEqual(apres(70_000));
        expect(lu?.codeHache).toBe(deux.codeHache);
        expect(lu?.expireA).toEqual(deux.expireA);
      }));

    it("un code se consomme une seule fois, même en concurrence", () =>
      avec(async ({ stockage, nouveauNumero }) => {
        const tel = nouveauNumero();
        const code = unCode(tel, T0);
        await stockage.reserverEnvoi(code, ENVOI);
        const resultats = await Promise.all(
          Array.from({ length: 6 }, () => stockage.consommer(code.id, apres(1000))),
        );
        expect(resultats.filter(Boolean)).toHaveLength(1);
        expect(await stockage.consommer(code.id, apres(2000))).toBe(false);
        expect(await stockage.consommer(randomUUID(), apres(2000))).toBe(false);
      }));

    it("compte les mauvais codes, bloque à la cinquième erreur puis double la durée", () =>
      avec(async ({ stockage, nouveauNumero }) => {
        const tel = nouveauNumero();
        expect(await stockage.etat(tel)).toEqual({
          echecs: 0,
          blocages: 0,
          bloqueJusqua: null,
          dernierEchecA: null,
        });
        for (let i = 1; i <= 4; i++) {
          const etat = await stockage.noterEchec(tel, apres(i * 1000), ESSAIS);
          expect(etat).toMatchObject({ echecs: i, blocages: 0, bloqueJusqua: null });
        }
        const bloque = await stockage.noterEchec(tel, apres(5000), ESSAIS);
        expect(bloque).toEqual({
          echecs: 0,
          blocages: 1,
          bloqueJusqua: apres(5000 + 900_000),
          dernierEchecA: apres(5000),
        });
        expect(await stockage.etat(tel)).toEqual(bloque);

        // Le blocage fini, cinq nouvelles erreurs : 30 minutes.
        const reprise = apres(5000 + 900_001);
        for (let i = 0; i < 4; i++) await stockage.noterEchec(tel, apres(i, reprise), ESSAIS);
        const second = await stockage.noterEchec(tel, apres(10, reprise), ESSAIS);
        expect(second).toMatchObject({ blocages: 2, bloqueJusqua: apres(10 + 1_800_000, reprise) });
      }));

    it("des mauvais codes simultanés bloquent une seule fois", () =>
      avec(async ({ stockage, nouveauNumero }) => {
        const tel = nouveauNumero();
        await Promise.all(
          Array.from({ length: 12 }, () => stockage.noterEchec(tel, apres(1000), ESSAIS)),
        );
        // 5 erreurs comptées, le blocage tombe ; les 7 suivantes arrivent sur un numéro bloqué.
        expect(await stockage.etat(tel)).toEqual({
          echecs: 0,
          blocages: 1,
          bloqueJusqua: apres(1000 + 900_000),
          dernierEchecA: apres(1000),
        });
      }));

    it("une connexion réussie efface erreurs et blocages", () =>
      avec(async ({ stockage, nouveauNumero }) => {
        const tel = nouveauNumero();
        for (let i = 0; i < 5; i++) await stockage.noterEchec(tel, apres(i), ESSAIS);
        await stockage.effacerEchecs(tel);
        expect(await stockage.etat(tel)).toEqual({
          echecs: 0,
          blocages: 0,
          bloqueJusqua: null,
          dernierEchecA: null,
        });
      }));
  });
}

/**
 * Contrat du port `FichesVoyageur` : une fiche par personne, créée à la première ouverture, qui garde
 * sa date d'inscription (mémoire toujours, PostgreSQL quand une base de test est donnée).
 */
export function contratFichesVoyageur(
  nom: string,
  creer: () => Promise<{ fiches: FichesVoyageur; fermer?: () => Promise<void> }>,
): void {
  describe(`FichesVoyageur : ${nom}`, () => {
    async function avec<T>(test: (f: FichesVoyageur) => Promise<T>): Promise<T> {
      const { fiches, fermer } = await creer();
      try {
        return await test(fiches);
      } finally {
        await fermer?.();
      }
    }

    it("crée la fiche à la première ouverture avec les valeurs par défaut", () =>
      avec(async (fiches) => {
        const personneId = randomUUID();
        expect(await fiches.ouvrir(personneId, T0)).toEqual({
          personneId,
          inscritA: T0,
          langue: "fr",
          pieceVerifiee: false,
          pieceQuatreDerniers: null,
        });
      }));

    it("garde la date d'inscription d'origine aux ouvertures suivantes", () =>
      avec(async (fiches) => {
        const personneId = randomUUID();
        await fiches.ouvrir(personneId, T0);
        const encore = await fiches.ouvrir(personneId, apres(86_400_000));
        expect(encore.inscritA).toEqual(T0);
        expect((await fiches.ouvrir(randomUUID(), apres(1000))).inscritA).toEqual(apres(1000));
      }));

    it("des ouvertures simultanées donnent la même fiche", () =>
      avec(async (fiches) => {
        const personneId = randomUUID();
        const lues = await Promise.all(
          Array.from({ length: 8 }, (_, i) => fiches.ouvrir(personneId, apres(i * 1000))),
        );
        expect(new Set(lues.map((f) => f.inscritA.getTime())).size).toBe(1);
      }));
  });
}

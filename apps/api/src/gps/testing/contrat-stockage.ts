import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { AlerteArret, EtatSuivi, Position, PrevenirProche } from "../modeles";
import type { AlertesArret, EtatsSuivi, Positions, PrevenirProches } from "../ports";

/**
 * Contrat des quatre ports que le suivi GPS écrit (`Positions`, `EtatsSuivi`, `AlertesArret`,
 * `PrevenirProches`) : les mêmes tests s'exécutent sur la mémoire (toujours) et sur PostgreSQL
 * (quand `DATABASE_URL_TEST` est donnée). Un comportement que la mémoire a et que la base n'a pas
 * (ou l'inverse) fait échouer l'un des deux.
 *
 * Chaque test prend ses propres identifiants : la base n'est pas vidée entre deux tests. Les
 * instants sont donnés en heure de Douala, avec les millisecondes, comme le module les produit.
 */

export interface BancGps {
  positions: Positions;
  etats: EtatsSuivi;
  alertes: AlertesArret;
  prevenirs: PrevenirProches;
  fermer(): Promise<void>;
}

const T0 = Date.parse("2026-11-02T08:00:00.000+01:00");
const DOUALA = (ms: number): string => {
  const d = new Date(ms + 3_600_000);
  const p = (n: number, l = 2) => String(n).padStart(l, "0");
  return (
    `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}` +
    `T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}.${p(d.getUTCMilliseconds(), 3)}+01:00`
  );
};
export const instant = (secondes: number): string => DOUALA(T0 + secondes * 1000);

export function unePosition(surcharge: Partial<Position> = {}): Position {
  return {
    sujet: `bus:${randomUUID()}`,
    auteurId: randomUUID(),
    instant: instant(0),
    latitude: 4.0511,
    longitude: 9.7043,
    precisionM: 8,
    vitesseKmh: 80,
    recuA: instant(1),
    ...surcharge,
  };
}

export function unEtat(departId: string, version: number, surcharge: Partial<EtatSuivi> = {}) {
  return {
    departId,
    version,
    derniere: { instant: instant(version * 30), latitude: 4.05, longitude: 9.7, vitesseKmh: 70 },
    progressionKm: version * 2.5,
    passages: { "arret-edea": instant(version * 30) },
    immobile: null,
    alerteId: null,
    ...surcharge,
  } satisfies EtatSuivi;
}

export function uneAlerte(surcharge: Partial<AlerteArret> = {}): AlerteArret {
  return {
    id: randomUUID(),
    departId: randomUUID(),
    compagnieId: randomUUID(),
    immatriculation: "LT 204 AB",
    apres: "Edéa",
    arretDepuis: instant(0),
    ouverteA: instant(600),
    latitude: 3.8,
    longitude: 10.13,
    soupcon: "autre",
    aBord: 42,
    resolueA: null,
    ...surcharge,
  };
}

export function unPrevenir(surcharge: Partial<PrevenirProche> = {}) {
  return {
    billetId: randomUUID(),
    procheId: `proche-${randomUUID().slice(0, 8)}`,
    voyageurId: randomUUID(),
    departId: randomUUID(),
    minutesAvantArrivee: 15,
    actif: true,
    creeA: instant(0),
    ...surcharge,
  };
}

export function contratStockageGps(nom: string, creer: () => Promise<BancGps>): void {
  describe(`stockage du suivi GPS : ${nom}`, () => {
    async function avec<T>(test: (b: BancGps) => Promise<T>): Promise<T> {
      const banc = await creer();
      try {
        return await test(banc);
      } finally {
        await banc.fermer();
      }
    }

    describe("Positions", () => {
      it("garde une position une fois : un lot renvoyé ne change rien", () =>
        avec(async ({ positions }) => {
          const p = unePosition();
          expect(await positions.ajouter(p)).toBe(true);
          expect(await positions.ajouter(p)).toBe(false);
          // Même instant, autre auteur (chauffeur et convoyeur) : deux positions distinctes.
          expect(await positions.ajouter({ ...p, auteurId: randomUUID() })).toBe(true);
          // Même auteur, autre instant : une nouvelle position.
          expect(await positions.ajouter({ ...p, instant: instant(30) })).toBe(true);
          expect(await positions.recentes(p.sujet, 10)).toHaveLength(3);
        }));

      it("rend la dernière position par l'instant, pas par l'ordre d'arrivée", () =>
        avec(async ({ positions }) => {
          const sujet = `bus:${randomUUID()}`;
          const auteurId = randomUUID();
          expect(await positions.derniere(sujet)).toBeNull();
          await positions.ajouter(unePosition({ sujet, auteurId, instant: instant(60) }));
          await positions.ajouter(unePosition({ sujet, auteurId, instant: instant(0) }));
          await positions.ajouter(
            unePosition({ sujet, auteurId, instant: instant(30), latitude: 3.9 }),
          );
          expect((await positions.derniere(sujet))?.instant).toBe(instant(60));
        }));

      it("rend les dernières positions de la plus ancienne à la plus récente, bornées", () =>
        avec(async ({ positions }) => {
          const sujet = `bus:${randomUUID()}`;
          const auteurId = randomUUID();
          for (const s of [90, 0, 60, 30, 120]) {
            await positions.ajouter(unePosition({ sujet, auteurId, instant: instant(s) }));
          }
          const trois = await positions.recentes(sujet, 3);
          expect(trois.map((p) => p.instant)).toEqual([instant(60), instant(90), instant(120)]);
          expect(await positions.recentes(sujet, 0)).toEqual([]);
          expect(await positions.recentes(`bus:${randomUUID()}`, 5)).toEqual([]);
        }));

      it("rend toutes les mesures telles qu'elles ont été données, absentes comprises", () =>
        avec(async ({ positions }) => {
          const p = unePosition({ precisionM: null, vitesseKmh: null, latitude: -3.8667 });
          await positions.ajouter(p);
          expect(await positions.derniere(p.sujet)).toEqual(p);
        }));

      it("les positions d'un sujet ne se mélangent pas à celles d'un autre", () =>
        avec(async ({ positions }) => {
          const a = unePosition();
          const b = unePosition();
          await positions.ajouter(a);
          await positions.ajouter(b);
          expect(await positions.recentes(a.sujet, 10)).toEqual([a]);
          expect(await positions.derniere(b.sujet)).toEqual(b);
        }));
    });

    describe("EtatsSuivi", () => {
      it("crée l'état à la version 1, puis ne l'écrit que depuis la version précédente", () =>
        avec(async ({ etats }) => {
          const departId = randomUUID();
          expect(await etats.lire(departId)).toBeNull();
          expect(await etats.ecrire(unEtat(departId, 1))).toBe(true);
          expect(await etats.ecrire(unEtat(departId, 1))).toBe(false); // déjà créé
          expect(await etats.ecrire(unEtat(departId, 3))).toBe(false); // saute une version
          expect(await etats.ecrire(unEtat(departId, 2))).toBe(true);
          expect(await etats.ecrire(unEtat(departId, 2))).toBe(false); // perdu : quelqu'un a écrit
          expect((await etats.lire(departId))?.version).toBe(2);
        }));

      it("une première écriture qui n'est pas la version 1 est refusée", () =>
        avec(async ({ etats }) => {
          const departId = randomUUID();
          expect(await etats.ecrire(unEtat(departId, 2))).toBe(false);
          expect(await etats.lire(departId)).toBeNull();
        }));

      it("relit tout ce qui a été écrit : dernière position, passages, immobilité, alerte", () =>
        avec(async ({ etats }) => {
          const departId = randomUUID();
          const e = unEtat(departId, 1, {
            passages: { "arret-edea": instant(900), "arret-pouma": instant(2400) },
            immobile: { depuis: instant(100), latitude: 3.8, longitude: 10.13 },
            alerteId: randomUUID(),
          });
          await etats.ecrire(e);
          expect(await etats.lire(departId)).toEqual(e);
          const vide = unEtat(departId, 2, {
            derniere: null,
            immobile: null,
            alerteId: null,
            passages: {},
          });
          await etats.ecrire(vide);
          expect(await etats.lire(departId)).toEqual(vide);
        }));

      it("un identifiant qui n'existe pas se lit comme absent", () =>
        avec(async ({ etats }) => {
          expect(await etats.lire("depart-inconnu")).toBeNull();
        }));
    });

    describe("AlertesArret", () => {
      it("ouvre une alerte, une seule par départ tant qu'elle est ouverte", () =>
        avec(async ({ alertes }) => {
          const a = uneAlerte();
          expect(await alertes.ouvrir(a)).toEqual(a);
          expect(await alertes.ouvrir(uneAlerte({ departId: a.departId }))).toBeNull();
          // Un autre départ n'est pas gêné.
          expect(await alertes.ouvrir(uneAlerte())).not.toBeNull();
          // Fermée, une nouvelle alerte peut s'ouvrir pour le même départ.
          await alertes.resoudre(a.id, instant(1200));
          const suivante = uneAlerte({ departId: a.departId });
          expect(await alertes.ouvrir(suivante)).toEqual(suivante);
        }));

      it("ferme l'alerte une fois, avec l'instant donné", () =>
        avec(async ({ alertes }) => {
          const a = uneAlerte();
          await alertes.ouvrir(a);
          const fermee = await alertes.resoudre(a.id, instant(1200));
          expect(fermee).toEqual({ ...a, resolueA: instant(1200) });
          expect(await alertes.resoudre(a.id, instant(1300))).toBeNull();
          expect(await alertes.resoudre(randomUUID(), instant(1300))).toBeNull();
          expect((await alertes.trouver(a.id))?.resolueA).toBe(instant(1200));
        }));

      it("liste les alertes ouvertes d'une compagnie, la plus ancienne d'abord", () =>
        avec(async ({ alertes }) => {
          const compagnieId = randomUUID();
          const tard = uneAlerte({ compagnieId, ouverteA: instant(900) });
          const tot = uneAlerte({ compagnieId, ouverteA: instant(300) });
          const close = uneAlerte({ compagnieId, ouverteA: instant(100) });
          const ailleurs = uneAlerte({ ouverteA: instant(50) });
          for (const a of [tard, tot, close, ailleurs]) await alertes.ouvrir(a);
          await alertes.resoudre(close.id, instant(500));
          expect((await alertes.ouvertes(compagnieId)).map((a) => a.id)).toEqual([tot.id, tard.id]);
          expect(await alertes.ouvertes(randomUUID())).toEqual([]);
        }));

      it("retrouve une alerte, absente ou non, sans lever d'erreur sur un identifiant inconnu", () =>
        avec(async ({ alertes }) => {
          const a = uneAlerte({ aBord: null });
          await alertes.ouvrir(a);
          expect(await alertes.trouver(a.id)).toEqual(a);
          expect(await alertes.trouver(randomUUID())).toBeNull();
          expect(await alertes.trouver("alerte-inconnue")).toBeNull();
        }));
    });

    describe("PrevenirProches", () => {
      it("crée puis met à jour (minutes, actif) en gardant la date de création", () =>
        avec(async ({ prevenirs }) => {
          const p = unPrevenir();
          const cree = await prevenirs.enregistrer(p);
          expect(cree).toEqual({ ...p, envoyeA: null });
          const maj = await prevenirs.enregistrer({
            ...p,
            minutesAvantArrivee: 30,
            actif: false,
            creeA: instant(9999),
          });
          expect(maj).toEqual({ ...p, minutesAvantArrivee: 30, actif: false, envoyeA: null });
          expect(await prevenirs.deBillet(p.billetId)).toEqual([maj]);
        }));

      it("liste les SMS en attente d'un départ : actifs et pas encore partis", () =>
        avec(async ({ prevenirs }) => {
          const departId = randomUUID();
          const a = unPrevenir({ departId });
          const b = unPrevenir({ departId });
          const inactif = unPrevenir({ departId, actif: false });
          const parti = unPrevenir({ departId });
          const ailleurs = unPrevenir();
          for (const p of [a, b, inactif, parti, ailleurs]) await prevenirs.enregistrer(p);
          await prevenirs.marquerEnvoye(parti.billetId, parti.procheId, instant(100));
          const ids = (await prevenirs.enAttente(departId)).map((p) => p.billetId).sort();
          expect(ids).toEqual([a.billetId, b.billetId].sort());
        }));

      it("note l'envoi une seule fois et le conserve quand la ligne est mise à jour", () =>
        avec(async ({ prevenirs }) => {
          const p = unPrevenir();
          await prevenirs.enregistrer(p);
          expect(await prevenirs.marquerEnvoye(p.billetId, p.procheId, instant(100))).toBe(true);
          expect(await prevenirs.marquerEnvoye(p.billetId, p.procheId, instant(200))).toBe(false);
          expect(await prevenirs.marquerEnvoye(randomUUID(), "autre", instant(200))).toBe(false);
          const maj = await prevenirs.enregistrer({ ...p, minutesAvantArrivee: 5 });
          expect(maj.envoyeA).toBe(instant(100));
        }));

      it("désactive sans effacer l'envoi, et dit si la ligne n'existe pas", () =>
        avec(async ({ prevenirs }) => {
          const p = unPrevenir();
          await prevenirs.enregistrer(p);
          const off = await prevenirs.desactiver(p.billetId, p.procheId);
          expect(off).toMatchObject({ actif: false, envoyeA: null });
          expect(await prevenirs.desactiver(randomUUID(), "x")).toBeNull();
          expect(await prevenirs.deBillet("billet-inconnu")).toEqual([]);
        }));

      it("un billet peut prévenir plusieurs proches ; chacun garde sa ligne", () =>
        avec(async ({ prevenirs }) => {
          const billetId = randomUUID();
          await prevenirs.enregistrer(unPrevenir({ billetId, procheId: "maman" }));
          await prevenirs.enregistrer(unPrevenir({ billetId, procheId: "papa", actif: false }));
          const lignes = await prevenirs.deBillet(billetId);
          expect(lignes.map((l) => l.procheId).sort()).toEqual(["maman", "papa"]);
        }));
    });
  });
}

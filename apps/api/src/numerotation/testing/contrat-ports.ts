import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AlerteSync } from "../../sync/ports";
import {
  AlertesNumerotation,
  PlagesAttribuees,
  RegistreNumeros,
  type AttributionPlage,
  type EntreeRegistre,
} from "../ports";
import { PLAGE_EN_LIGNE, porteeDe, type GenreNumero } from "../regles";

/**
 * Contrat des ports de la numérotation : les mêmes tests s'exécutent sur les adaptateurs en mémoire
 * et sur les adaptateurs PostgreSQL. Un comportement que la mémoire a et que PostgreSQL n'a pas (ou
 * l'inverse) fait échouer l'un des deux.
 *
 * Chaque test prend sa propre gare : le registre est en ajout seul, on ne le vide pas entre deux tests.
 */

export interface BancNumerotation {
  plages: PlagesAttribuees;
  registre: RegistreNumeros;
  alertes: AlertesNumerotation;
  /** Une gare (et sa compagnie) neuves. En base, les lignes sont créées. */
  nouvelleGare(): Promise<{ gareId: string; compagnieId: string }>;
  fermer(): Promise<void>;
}

const JOUR = "270105";

function attribution(
  appareilId: string,
  gare: { gareId: string; compagnieId: string },
  plage: { debut: number; fin: number },
  surcharge: Partial<AttributionPlage> = {},
): AttributionPlage {
  return {
    appareilId,
    genre: "guichet",
    rang: 1,
    nbConvoyeurs: null,
    plage,
    gareId: gare.gareId,
    compagnieId: gare.compagnieId,
    titulaire: { id: "titulaire-1", nom: "Aïcha Ngono" },
    attribueeA: "2027-01-05T08:00:00.000+01:00",
    attribueePar: null,
    libereeA: null,
    ...surcharge,
  };
}

function entree(
  gare: { gareId: string; compagnieId: string },
  numero: number,
  evenementId: string,
  surcharge: Partial<EntreeRegistre> = {},
): EntreeRegistre {
  const appareilId = surcharge.appareilId ?? "tel-guichet-1";
  return {
    portee: porteeDe({ appareilId, gareId: gare.gareId, compagnieId: gare.compagnieId }),
    gareId: gare.gareId,
    compagnieId: gare.compagnieId,
    appareilId,
    jour: JOUR,
    genre: "billet",
    numero,
    evenementId,
    recuA: "2027-01-05T09:00:00.000+01:00",
    ...surcharge,
  };
}

const alerte = (
  id: string,
  gare: { gareId: string; compagnieId: string },
  surcharge: Partial<AlerteSync> = {},
): AlerteSync => ({
  id,
  type: "trou_dans_la_plage",
  gravite: "alerte",
  creeeA: "2027-01-05T21:00:00.000+01:00",
  appareilId: "tel-guichet-1",
  auteurId: "titulaire-1",
  evenementId: null,
  gareId: gare.gareId,
  compagnieId: gare.compagnieId,
  details: { jour: JOUR, genre: "billet", numerosManquants: [3] },
  resolueA: null,
  ...surcharge,
});

export function contratPortsNumerotation(nom: string, monter: () => Promise<BancNumerotation>) {
  describe(nom, () => {
    let banc: BancNumerotation;
    beforeAll(async () => {
      banc = await monter();
    }, 120_000);
    afterAll(async () => {
      await banc?.fermer();
    });

    describe("plages attribuées", () => {
      it("attribue une plage et la retrouve telle quelle", async () => {
        const gare = await banc.nouvelleGare();
        const a = attribution("tel-1", gare, { debut: 1, fin: 999 });
        const r = await banc.plages.attribuer(a);
        expect(r).toEqual({ ok: true, attribution: a });
        expect(await banc.plages.trouver("tel-1")).toEqual(a);
        expect(await banc.plages.trouver("inconnu")).toBeNull();
      });

      it("liste les attributions en cours d'une gare ou d'une compagnie, pas les libérées", async () => {
        const gare = await banc.nouvelleGare();
        const autre = await banc.nouvelleGare();
        await banc.plages.attribuer(attribution("g1", gare, { debut: 1, fin: 999 }));
        await banc.plages.attribuer(attribution("g2", gare, { debut: 1001, fin: 1999 }));
        await banc.plages.attribuer(attribution("g3", autre, { debut: 1, fin: 999 }));
        await banc.plages.liberer("g2", "2027-01-05T10:00:00.000+01:00");

        const deLaGare = await banc.plages.lister({ gareId: gare.gareId });
        expect(deLaGare.map((p) => p.appareilId)).toEqual(["g1"]);
        const deLaCompagnie = await banc.plages.lister({ compagnieId: autre.compagnieId });
        expect(deLaCompagnie.map((p) => p.appareilId)).toEqual(["g3"]);
      });

      it("refuse une plage qui en recouvre une autre de la gare, et nomme l'appareil en conflit", async () => {
        const gare = await banc.nouvelleGare();
        await banc.plages.attribuer(attribution("g1", gare, { debut: 1, fin: 999 }));
        const r = await banc.plages.attribuer(attribution("g2", gare, { debut: 500, fin: 1500 }));
        expect(r.ok).toBe(false);
        if (!r.ok) {
          expect(r.enConflitAvec.appareilId).toBe("g1");
          expect(r.enConflitAvec.plage).toEqual({ debut: 1, fin: 999 });
        }
        // Rien n'a été écrit pour g2.
        expect(await banc.plages.trouver("g2")).toBeNull();
      });

      it("accepte des plages voisines, et la même plage dans une autre gare", async () => {
        const gare = await banc.nouvelleGare();
        const autre = await banc.nouvelleGare();
        expect(
          (await banc.plages.attribuer(attribution("g1", gare, { debut: 1, fin: 999 }))).ok,
        ).toBe(true);
        expect(
          (await banc.plages.attribuer(attribution("g2", gare, { debut: 1000, fin: 1999 }))).ok,
        ).toBe(true);
        expect(
          (await banc.plages.attribuer(attribution("g3", autre, { debut: 1, fin: 999 }))).ok,
        ).toBe(true);
      });

      it("un appareil qui change de plage n'entre pas en conflit avec sa propre ancienne plage", async () => {
        const gare = await banc.nouvelleGare();
        await banc.plages.attribuer(attribution("g1", gare, { debut: 1, fin: 999 }));
        const r = await banc.plages.attribuer(
          attribution(
            "g1",
            gare,
            { debut: 500, fin: 1200 },
            { attribueeA: "2027-01-05T12:00:00.000+01:00" },
          ),
        );
        expect(r.ok).toBe(true);
        expect((await banc.plages.trouver("g1"))?.plage).toEqual({ debut: 500, fin: 1200 });
        expect(await banc.plages.lister({ gareId: gare.gareId })).toHaveLength(1);
      });

      it("libère la plage d'un appareil remplacé : elle redevient disponible", async () => {
        const gare = await banc.nouvelleGare();
        await banc.plages.attribuer(attribution("vieux", gare, { debut: 1, fin: 999 }));
        const liberee = await banc.plages.liberer("vieux", "2027-01-05T10:00:00.000+01:00");
        expect(liberee?.libereeA).toBe("2027-01-05T10:00:00.000+01:00");
        expect(await banc.plages.trouver("vieux")).toBeNull();
        expect(await banc.plages.liberer("vieux", "2027-01-05T11:00:00.000+01:00")).toBeNull();
        const r = await banc.plages.attribuer(attribution("neuf", gare, { debut: 1, fin: 999 }));
        expect(r.ok).toBe(true);
      });

      it("huit demandes simultanées pour des plages qui se recouvrent : une seule passe", async () => {
        const gare = await banc.nouvelleGare();
        const resultats = await Promise.all(
          Array.from({ length: 8 }, (_, i) =>
            banc.plages.attribuer(attribution(`tel-${i}`, gare, { debut: 100 + i, fin: 600 + i })),
          ),
        );
        expect(resultats.filter((r) => r.ok)).toHaveLength(1);
        expect(await banc.plages.lister({ gareId: gare.gareId })).toHaveLength(1);
      });
    });

    describe("registre des numéros", () => {
      it("réserve un numéro, reconnaît le rejeu et signale le doublon", async () => {
        const gare = await banc.nouvelleGare();
        const e1 = randomUUID();
        expect(await banc.registre.reserver(entree(gare, 17, e1))).toEqual({ statut: "reserve" });
        expect(await banc.registre.reserver(entree(gare, 17, e1))).toEqual({ statut: "rejeu" });
        const e2 = randomUUID();
        expect(
          await banc.registre.reserver(entree(gare, 17, e2, { appareilId: "tel-guichet-2" })),
        ).toEqual({ statut: "doublon", evenementIdExistant: e1 });
      });

      it("vingt événements différents avec le même numéro : un seul est réservé", async () => {
        const gare = await banc.nouvelleGare();
        const resultats = await Promise.all(
          Array.from({ length: 20 }, () => banc.registre.reserver(entree(gare, 42, randomUUID()))),
        );
        expect(resultats.filter((r) => r.statut === "reserve")).toHaveLength(1);
        expect(resultats.filter((r) => r.statut === "doublon")).toHaveLength(19);
        const lignes = await banc.registre.entrees(
          porteeDe({ appareilId: "tel-guichet-1", ...gare }),
          JOUR,
          "billet",
        );
        expect(lignes.map((l) => l.numero)).toEqual([42]);
      });

      it("le même numéro est libre un autre jour, pour l'autre genre et dans une autre gare", async () => {
        const gare = await banc.nouvelleGare();
        const autre = await banc.nouvelleGare();
        const r = async (e: EntreeRegistre) => (await banc.registre.reserver(e)).statut;
        expect(await r(entree(gare, 5, randomUUID()))).toBe("reserve");
        expect(await r(entree(gare, 5, randomUUID(), { jour: "270106" }))).toBe("reserve");
        expect(await r(entree(gare, 5, randomUUID(), { genre: "colis" }))).toBe("reserve");
        expect(await r(entree(autre, 5, randomUUID()))).toBe("reserve");
        expect(await r(entree(gare, 5, randomUUID()))).toBe("doublon");
      });

      it("un numéro est unique pour toute la gare, quel que soit l'appareil", async () => {
        const gare = await banc.nouvelleGare();
        const porteeGare = porteeDe({ appareilId: "x", ...gare });
        await banc.registre.reserver(entree(gare, 8, randomUUID(), { appareilId: "tel-1" }));
        const r = await banc.registre.reserver(
          entree(gare, 8, randomUUID(), { appareilId: "tel-2" }),
        );
        expect(r.statut).toBe("doublon");
        const lignes = await banc.registre.entrees(porteeGare, JOUR, "billet");
        expect(lignes).toHaveLength(1);
        expect(lignes[0]?.appareilId).toBe("tel-1");
      });

      it("rend les entrées d'une portée et celles d'un jour", async () => {
        const gare = await banc.nouvelleGare();
        for (const n of [30, 10, 20]) await banc.registre.reserver(entree(gare, n, randomUUID()));
        const portee = porteeDe({ appareilId: "x", ...gare });
        const entrees = await banc.registre.entrees(portee, JOUR, "billet");
        expect(entrees.map((e) => e.numero).sort((a, b) => a - b)).toEqual([10, 20, 30]);
        const duJour = (await banc.registre.duJour(JOUR)).filter((e) => e.portee === portee);
        expect(duJour.map((e) => e.numero).sort((a, b) => a - b)).toEqual([10, 20, 30]);
        const e = duJour[0]!;
        expect(e.gareId).toBe(gare.gareId);
        expect(e.recuA).toBe("2027-01-05T09:00:00.000+01:00");
      });

      describe("numéros du serveur (4001–9999)", () => {
        const prendre = (
          gare: { gareId: string; compagnieId: string },
          reference: string,
          surcharge: {
            jour?: string;
            genre?: GenreNumero;
            plage?: { debut: number; fin: number };
          } = {},
        ) => {
          const e = entree(gare, 0, reference, {
            appareilId: "serveur-en-ligne",
            jour: surcharge.jour ?? JOUR,
            genre: surcharge.genre ?? "billet",
          });
          return banc.registre.prendreSuivant({
            portee: e.portee,
            gareId: e.gareId,
            compagnieId: e.compagnieId,
            appareilId: e.appareilId,
            jour: e.jour,
            genre: e.genre,
            evenementId: e.evenementId,
            recuA: e.recuA,
            plage: surcharge.plage ?? PLAGE_EN_LIGNE,
          });
        };

        it("prend les numéros dans l'ordre à partir de 4001", async () => {
          const gare = await banc.nouvelleGare();
          expect(await prendre(gare, "billet-a")).toEqual({ numero: 4001, nouveau: true });
          expect(await prendre(gare, "billet-b")).toEqual({ numero: 4002, nouveau: true });
          expect(await prendre(gare, "colis-a", { genre: "colis" })).toEqual({
            numero: 4001,
            nouveau: true,
          });
        });

        it("rend le même numéro à la même référence (réessai après une erreur réseau)", async () => {
          const gare = await banc.nouvelleGare();
          const premier = await prendre(gare, "billet-a");
          const second = await prendre(gare, "billet-a");
          expect(second).toEqual({ numero: premier!.numero, nouveau: false });
          expect(await prendre(gare, "billet-b")).toEqual({ numero: 4002, nouveau: true });
        });

        it("prend le plus petit numéro libre quand un appareil a déjà pris 4001 ou 4003", async () => {
          const gare = await banc.nouvelleGare();
          await banc.registre.reserver(entree(gare, 4001, randomUUID()));
          await banc.registre.reserver(entree(gare, 4003, randomUUID()));
          expect((await prendre(gare, "a"))?.numero).toBe(4002);
          expect((await prendre(gare, "b"))?.numero).toBe(4004);
        });

        it("répond null quand la plage est épuisée", async () => {
          const gare = await banc.nouvelleGare();
          const plage = { debut: 4001, fin: 4003 };
          const numeros = [];
          for (const ref of ["a", "b", "c"])
            numeros.push((await prendre(gare, ref, { plage }))?.numero);
          expect(numeros).toEqual([4001, 4002, 4003]);
          expect(await prendre(gare, "d", { plage })).toBeNull();
          // Une référence connue retrouve son numéro même quand la plage est pleine.
          expect(await prendre(gare, "b", { plage })).toEqual({ numero: 4002, nouveau: false });
        });

        it("cent ventes simultanées : cent numéros distincts, consécutifs, sans trou", async () => {
          const gare = await banc.nouvelleGare();
          const pris = await Promise.all(
            Array.from({ length: 100 }, (_, i) => prendre(gare, `vente-${i}`)),
          );
          const numeros = pris.map((p) => p!.numero).sort((a, b) => a - b);
          expect(numeros).toEqual(Array.from({ length: 100 }, (_, i) => 4001 + i));
          expect(new Set(pris.map((p) => p!.nouveau))).toEqual(new Set([true]));
        });

        it("des appareils qui sortent leurs numéros pendant que le serveur numérote : jamais deux fois le même", async () => {
          const gare = await banc.nouvelleGare();
          const [serveur, appareil] = await Promise.all([
            Promise.all(Array.from({ length: 30 }, (_, i) => prendre(gare, `vente-${i}`))),
            Promise.all(
              Array.from({ length: 30 }, (_, i) =>
                banc.registre.reserver(
                  entree(gare, 4001 + i, randomUUID(), { appareilId: "tel-x" }),
                ),
              ),
            ),
          ]);
          const numerosServeur = serveur.map((p) => p!.numero);
          expect(new Set(numerosServeur).size).toBe(30);
          const reserves = appareil.filter((r) => r.statut === "reserve").length;
          // Chaque numéro entre une seule fois au registre.
          const lignes = await banc.registre.entrees(
            porteeDe({ appareilId: "x", ...gare }),
            JOUR,
            "billet",
          );
          expect(new Set(lignes.map((l) => l.numero)).size).toBe(lignes.length);
          expect(lignes).toHaveLength(30 + reserves);
        });
      });
    });

    describe("alertes de numérotation", () => {
      it("enregistre une alerte, la met à jour sans la doubler, la retrouve par jour", async () => {
        const gare = await banc.nouvelleGare();
        const id = `alerte-${randomUUID()}`;
        await banc.alertes.enregistrer(alerte(id, gare));
        await banc.alertes.enregistrer(
          alerte(id, gare, { details: { jour: JOUR, genre: "billet", numerosManquants: [3, 4] } }),
        );
        const trouvees = await banc.alertes.lister({ gareId: gare.gareId, jour: JOUR });
        expect(trouvees).toHaveLength(1);
        expect(trouvees[0]?.details["numerosManquants"]).toEqual([3, 4]);
        expect(trouvees[0]).toMatchObject({
          id,
          type: "trou_dans_la_plage",
          creeeA: "2027-01-05T21:00:00.000+01:00",
          gareId: gare.gareId,
          resolueA: null,
        });
        expect(await banc.alertes.lister({ gareId: gare.gareId, jour: "270106" })).toEqual([]);
      });

      it("filtre par gare, par compagnie et sur les alertes ouvertes", async () => {
        const gare = await banc.nouvelleGare();
        const autre = await banc.nouvelleGare();
        const a = `alerte-${randomUUID()}`;
        const b = `alerte-${randomUUID()}`;
        const c = `alerte-${randomUUID()}`;
        await banc.alertes.enregistrer(alerte(a, gare));
        await banc.alertes.enregistrer(alerte(b, gare));
        await banc.alertes.enregistrer(alerte(c, autre));
        await banc.alertes.resoudre(b, "2027-01-05T22:00:00.000+01:00");
        const ids = async (f: Parameters<AlertesNumerotation["lister"]>[0]) =>
          (await banc.alertes.lister(f)).map((x) => x.id).sort();
        expect(await ids({ gareId: gare.gareId })).toEqual([a, b].sort());
        expect(await ids({ gareId: gare.gareId, ouvertesSeulement: true })).toEqual([a]);
        expect(await ids({ compagnieId: autre.compagnieId })).toEqual([c]);
      });

      it("résoudre garde la première heure de résolution", async () => {
        const gare = await banc.nouvelleGare();
        const id = `alerte-${randomUUID()}`;
        await banc.alertes.enregistrer(alerte(id, gare));
        await banc.alertes.resoudre(id, "2027-01-05T22:00:00.000+01:00");
        await banc.alertes.resoudre(id, "2027-01-06T08:00:00.000+01:00");
        const [lue] = await banc.alertes.lister({ gareId: gare.gareId });
        expect(lue?.resolueA).toBe("2027-01-05T22:00:00.000+01:00");
        await banc.alertes.resoudre("inconnue", "2027-01-06T08:00:00.000+01:00");
      });
    });
  });
}

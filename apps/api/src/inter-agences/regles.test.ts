import { describe, expect, it } from "vitest";
import type {
  BilletCorrespondanceStocke,
  ColisInterAgencesStocke,
  Creance,
  PartsConvention,
} from "./modele";
import {
  contestationRecevable,
  correspondanceGarantie,
  creancesDuBillet,
  creancesDuColis,
  defautDesParts,
  issueDeLaCorrespondance,
  ligneVoyageurs,
  partsDesTroncons,
  periodeAffichee,
  periodesEchues,
  repartir,
  responsable,
  soldePour,
  totauxParCompagnie,
} from "./regles";

const A = "alpha";
const B = "omega";

const PARTS: PartsConvention = {
  colisType: { poidsKg: 3, prix: 3000 },
  lignes: [
    { troncon: "Douala → Bafoussam", parts: { [A]: 1400, [B]: null } },
    { troncon: "Bafoussam → Bamenda", parts: { [A]: null, [B]: 1200 } },
    { troncon: "Transbordement à Bafoussam", parts: { [A]: 200, [B]: 200 } },
  ],
};

function plan(over: Partial<ColisInterAgencesStocke> = {}): ColisInterAgencesStocke {
  const tronc = (rang: number, compagnieId: string, part: number) => ({
    rang,
    compagnieId,
    departId: `d${rang}`,
    origine: "Douala",
    destination: "Bafoussam",
    heureDepart: "2026-11-02T10:00:00.000+01:00",
    heureArrivee: "2026-11-02T15:00:00.000+01:00",
    bus: "LT 118 AB",
    part,
  });
  return {
    colisId: "c1",
    version: 1,
    numero: "C-DLA-261102-4001",
    conventionId: "conv",
    emettriceId: A,
    prix: 3000,
    troncons: [tronc(1, A, 1600), tronc(2, B, 1400)],
    transferts: [{ rang: 1, cedantId: A, preneurId: B, remis: null, recu: null }],
    creeLe: "2026-11-02T09:00:00.000+01:00",
    creePar: "u1",
    ...over,
  };
}

const scan = (a: string) => ({ a, par: "u", lieu: null });

describe("parts par tronçon", () => {
  it("la convention d'exemple donne 1 600 à Alpha et 1 400 à Oméga", () => {
    expect(totauxParCompagnie(PARTS)).toEqual({ [A]: 1600, [B]: 1400 });
    expect(defautDesParts(PARTS, [A, B])).toBeNull();
  });

  it("refuse un tableau dont la somme n'est pas le prix du colis type", () => {
    const faux = { ...PARTS, colisType: { poidsKg: 3, prix: 3100 } };
    expect(defautDesParts(faux, [A, B])).toMatch(/3100|3 100/);
    expect(defautDesParts({ ...PARTS, lignes: [] }, [A, B])).toMatch(/vide/);
  });

  it("refuse une compagnie inconnue, un montant négatif ou une compagnie sans part", () => {
    const inconnue = {
      ...PARTS,
      lignes: [...PARTS.lignes, { troncon: "Hors convention", parts: { autre: 0 } }],
    };
    expect(defautDesParts(inconnue, [A, B])).toMatch(/compagnie inconnue/);
    const negatif = { ...PARTS, lignes: [{ troncon: "x", parts: { [A]: -1, [B]: 3001 } }] };
    expect(defautDesParts(negatif, [A, B])).toMatch(/invalide/);
    const sansB = { ...PARTS, lignes: [{ troncon: "x", parts: { [A]: 3000, [B]: null } }] };
    expect(defautDesParts(sansB, [A, B])).toMatch(/Chaque compagnie/);
  });

  it("partage un prix au franc près : la somme vaut toujours le prix", () => {
    expect(repartir(3000, { [A]: 1600, [B]: 1400 }, [A, B])).toEqual({ [A]: 1600, [B]: 1400 });
    const mille = repartir(1000, { [A]: 1600, [B]: 1400 }, [A, B]);
    expect(mille[A]! + mille[B]!).toBe(1000);
    expect(mille).toEqual({ [A]: 533, [B]: 467 });
    for (let prix = 1; prix <= 4000; prix += 37) {
      const r = repartir(prix, { [A]: 1600, [B]: 1400 }, [A, B]);
      expect(r[A]! + r[B]!).toBe(prix);
      expect(Math.abs(r[A]! - (prix * 1600) / 3000)).toBeLessThan(1);
    }
  });

  it("sans base de partage, tout le monde reçoit zéro", () => {
    expect(repartir(500, {}, [A, B])).toEqual({ [A]: 0, [B]: 0 });
  });

  it("la part d'un tronçon est celle de sa compagnie, répartie si elle en a plusieurs", () => {
    expect(partsDesTroncons([A, B], { [A]: 1600, [B]: 1400 })).toEqual([1600, 1400]);
    expect(partsDesTroncons([A, B, A], { [A]: 1001, [B]: 1400 })).toEqual([501, 1400, 500]);
  });
});

describe("responsabilité au scan", () => {
  it("reste au cédant jusqu'au scan « reçu », puis passe au preneur", () => {
    const p = plan();
    expect(responsable(p)).toEqual({ compagnieId: A, enTransfert: false });
    const remis = plan({
      transferts: [
        {
          rang: 1,
          cedantId: A,
          preneurId: B,
          remis: scan("2026-11-02T15:10:00.000+01:00"),
          recu: null,
        },
      ],
    });
    expect(responsable(remis)).toEqual({ compagnieId: A, enTransfert: true });
    const recu = plan({
      transferts: [
        {
          rang: 1,
          cedantId: A,
          preneurId: B,
          remis: scan("2026-11-02T15:10:00.000+01:00"),
          recu: scan("2026-11-02T15:12:00.000+01:00"),
        },
      ],
    });
    expect(responsable(recu)).toEqual({ compagnieId: B, enTransfert: false });
  });
});

describe("créances : seulement ce que les scans prouvent", () => {
  it("rien n'est dû sans scan, ni avec le seul « remis à »", () => {
    expect(creancesDuColis(plan())).toEqual([]);
    const remis = plan({
      transferts: [
        {
          rang: 1,
          cedantId: A,
          preneurId: B,
          remis: scan("2026-11-02T15:10:00.000+01:00"),
          recu: null,
        },
      ],
    });
    expect(creancesDuColis(remis)).toEqual([]);
  });

  it("un « reçu » sans « remis à » ne prouve rien", () => {
    const orphelin = plan({
      transferts: [
        {
          rang: 1,
          cedantId: A,
          preneurId: B,
          remis: null,
          recu: scan("2026-11-02T15:12:00.000+01:00"),
        },
      ],
    });
    expect(creancesDuColis(orphelin)).toEqual([]);
  });

  it("après le passage complet, l'émettrice doit sa part à Oméga, à la date du scan « reçu »", () => {
    const complet = plan({
      transferts: [
        {
          rang: 1,
          cedantId: A,
          preneurId: B,
          remis: scan("2026-11-02T15:10:00.000+01:00"),
          recu: scan("2026-11-02T15:12:00.000+01:00"),
        },
      ],
    });
    expect(creancesDuColis(complet)).toEqual([
      {
        cle: "colis:c1:2",
        type: "colis",
        reference: "c1",
        numero: "C-DLA-261102-4001",
        conventionId: "conv",
        debiteurId: A,
        creancierId: B,
        montant: 1400,
        acquiseLe: "2026-11-02T15:12:00.000+01:00",
      },
    ]);
  });

  it("un billet ne doit la part d'un tronçon qu'une fois le voyageur embarqué", () => {
    const billet = (embarque: boolean, replacement = false): BilletCorrespondanceStocke => ({
      id: "b1",
      version: 1,
      numero: "ALP-YDE-261102-0142",
      conventionId: "conv",
      emettriceId: A,
      voyageur: { nom: "Ngo", telephone: "+237691221008" },
      prix: 7000,
      troncons: [
        {
          rang: 1,
          compagnieId: A,
          departId: "d1",
          origine: "Yaoundé",
          destination: "Bafoussam",
          heureDepart: "2026-11-02T11:00:00.000+01:00",
          heureArrivee: "2026-11-02T15:00:00.000+01:00",
          bus: "LT 204 AB",
          part: 4000,
          etat: "embarque",
          embarqueLe: "2026-11-02T11:00:00.000+01:00",
        },
        {
          rang: 2,
          compagnieId: B,
          departId: "d2",
          origine: "Bafoussam",
          destination: "Bamenda",
          heureDepart: "2026-11-02T15:40:00.000+01:00",
          heureArrivee: "2026-11-02T18:10:00.000+01:00",
          bus: "OU 302 NW",
          part: 3000,
          etat: embarque ? "embarque" : "prevu",
          embarqueLe: embarque ? "2026-11-02T15:41:00.000+01:00" : null,
        },
      ],
      arriveePremierBus: null,
      replacement: replacement
        ? {
            decideLe: "2026-11-02T16:10:00.000+01:00",
            departId: "d3",
            heureDepart: "2026-11-03T08:00:00.000+01:00",
            bus: "OU 117 NW",
            retardataireId: A,
            montant: 3000,
          }
        : null,
      creeLe: "2026-11-02T10:00:00.000+01:00",
      creePar: "u1",
    });
    expect(creancesDuBillet(billet(false))).toEqual([]);
    expect(creancesDuBillet(billet(true)).map((c) => [c.cle, c.montant, c.debiteurId])).toEqual([
      ["billet:b1:2", 3000, A],
    ]);
    // Le retardataire (Alpha) paie le siège perdu à Oméga, en plus.
    const avecReplacement = creancesDuBillet(billet(true, true));
    expect(avecReplacement.map((c) => [c.type, c.montant, c.debiteurId, c.creancierId])).toEqual([
      ["billet", 3000, A, B],
      ["replacement", 3000, A, B],
    ]);
  });

  it("le solde net compense ce qu'on nous doit et ce que nous devons, et compte colis et billets", () => {
    const c = (over: Partial<Creance>): Creance => ({
      cle: "k",
      type: "colis",
      reference: "r",
      numero: "n",
      conventionId: "conv",
      debiteurId: B,
      creancierId: A,
      montant: 1000,
      acquiseLe: "2026-11-02T15:12:00.000+01:00",
      ...over,
    });
    const creances = [
      c({ cle: "1", reference: "c1", montant: 1500 }),
      c({ cle: "2", reference: "c2", montant: 1500 }),
      c({ cle: "3", reference: "c3", debiteurId: A, creancierId: B, montant: 1200 }),
      c({
        cle: "4",
        type: "replacement",
        reference: "b9",
        debiteurId: A,
        creancierId: B,
        montant: 300,
      }),
    ];
    expect(soldePour(A, creances)).toEqual({
      net: 3000 - 1500,
      recoit: 3000,
      doit: 1500,
      nbRecoit: 2,
      nbDoit: 1,
    });
    expect(soldePour(B, creances).net).toBe(-1500);
  });
});

describe("calendrier : lundi 08:00 et dimanche 20:00", () => {
  // Le lundi 2 novembre 2026 est un lundi.
  it("en semaine, le relevé affiché est celui qui sera payé lundi 08:00, gelé dimanche 20:00", () => {
    const p = periodeAffichee("2026-11-02T09:00:00.000+01:00");
    expect(p.gelLe).toBe("2026-11-08T20:00:00.000+01:00");
    expect(p.paiementLe).toBe("2026-11-09T08:00:00.000+01:00");
    expect(p.lundi).toBe("261109");
  });

  it("la contestation est ouverte jusqu'à 19:59 le dimanche, fermée à 20:00", () => {
    expect(contestationRecevable("2026-11-08T19:59:59.000+01:00")).toBe(true);
    expect(contestationRecevable("2026-11-08T20:00:00.000+01:00")).toBe(false);
    expect(contestationRecevable("2026-11-08T23:59:00.000+01:00")).toBe(false);
  });

  it("le relevé gelé reste affiché jusqu'au paiement, puis le suivant s'ouvre", () => {
    expect(periodeAffichee("2026-11-09T07:59:00.000+01:00").paiementLe).toBe(
      "2026-11-09T08:00:00.000+01:00",
    );
    expect(periodeAffichee("2026-11-09T08:00:00.000+01:00").paiementLe).toBe(
      "2026-11-16T08:00:00.000+01:00",
    );
    // Entre le gel et le paiement, rien n'est contestable.
    expect(contestationRecevable("2026-11-09T07:00:00.000+01:00")).toBe(false);
    expect(contestationRecevable("2026-11-09T08:00:00.000+01:00")).toBe(true);
  });

  it("liste les paiements échus depuis une date, lundi 08:00 compris", () => {
    const depuis = "2026-11-02T09:00:00.000+01:00";
    expect(periodesEchues(depuis, "2026-11-09T07:59:59.000+01:00")).toEqual([]);
    expect(periodesEchues(depuis, "2026-11-09T08:00:00.000+01:00").map((p) => p.lundi)).toEqual([
      "261109",
    ]);
    expect(periodesEchues(depuis, "2026-11-23T08:00:00.000+01:00").map((p) => p.lundi)).toEqual([
      "261109",
      "261116",
      "261123",
    ]);
  });

  it("une convention signée le dimanche soir après 20:00 commence au gel suivant", () => {
    const periodes = periodesEchues(
      "2026-11-08T21:00:00.000+01:00",
      "2026-11-16T08:00:00.000+01:00",
    );
    expect(periodes.map((p) => p.lundi)).toEqual(["261116"]);
  });
});

describe("correspondance garantie", () => {
  const depart = "2026-11-02T15:40:00.000+01:00";
  it("à l'heure : le voyageur monte ; jusqu'à 15 minutes de retard, le second bus attend", () => {
    expect(issueDeLaCorrespondance("2026-11-02T15:30:00.000+01:00", depart)).toEqual({
      type: "a_l_heure",
    });
    expect(issueDeLaCorrespondance(depart, depart)).toEqual({ type: "a_l_heure" });
    expect(issueDeLaCorrespondance("2026-11-02T15:55:00.000+01:00", depart)).toEqual({
      type: "attente",
      minutes: 15,
    });
  });

  it("au-delà de 15 minutes : replacement gratuit sur le départ suivant", () => {
    expect(issueDeLaCorrespondance("2026-11-02T15:56:00.000+01:00", depart)).toEqual({
      type: "replacement",
      retardMinutes: 16,
    });
  });

  it("une correspondance prévue doit laisser 25 minutes", () => {
    expect(
      correspondanceGarantie("2026-11-02T15:00:00.000+01:00", "2026-11-02T15:25:00.000+01:00"),
    ).toBe(true);
    expect(
      correspondanceGarantie("2026-11-02T15:00:00.000+01:00", "2026-11-02T15:24:00.000+01:00"),
    ).toBe(false);
  });

  it("retrouve la ligne voyageurs sans tenir compte de la casse ni des accents", () => {
    const voyageurs = {
      garantieMinutes: 25,
      attenteMinutes: 15,
      lignes: [
        {
          origine: "Yaoundé",
          via: "Bafoussam",
          destination: "Bamenda",
          premiere: A,
          parts: { [A]: 1, [B]: 1 },
        },
      ],
    };
    expect(ligneVoyageurs(voyageurs, "yaounde", "BAFOUSSAM", "Bamenda")).toBeDefined();
    expect(ligneVoyageurs(voyageurs, "Douala", "Bafoussam", "Bamenda")).toBeUndefined();
  });
});

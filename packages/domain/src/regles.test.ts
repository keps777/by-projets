import { describe, expect, it } from "vitest";
import {
  cashAttendu,
  colisNonRetire,
  debloquerTemporairement,
  decisionAnnulation,
  doitCloturerAuto,
  evaluerEcart,
  finBlocageSiege,
  heureClotureAuto,
  limiteAnnulationGratuite,
  limiteRetraitColis,
  peutValiderAnnulation,
  peutVendre,
  pinBloque,
  REGLES_PAR_DEFAUT,
  statutAppareil,
  totalCoupures,
} from "./regles";

const DEPART = "2027-01-05T08:00:00+01:00";

describe("annulation", () => {
  it("gratuite jusqu'à 1 h avant le départ (« gratuit jusqu'à 07:00 »)", () => {
    expect(limiteAnnulationGratuite(DEPART)).toBe("2027-01-05T07:00:00.000+01:00");
    const d = decisionAnnulation({
      etat: "paye",
      prix: 5500,
      classe: "vip",
      heureDepart: DEPART,
      maintenant: "2027-01-05T07:00:00+01:00",
    });
    expect(d).toEqual({ autorise: true, gratuite: true, retenue: 0, remboursement: 5500 });
  });

  it("une minute après la limite, la retenue de la classe s'applique", () => {
    const base = {
      etat: "paye",
      heureDepart: DEPART,
      maintenant: "2027-01-05T07:01:00+01:00",
    } as const;
    expect(decisionAnnulation({ ...base, prix: 4000, classe: "classique" })).toEqual({
      autorise: true,
      gratuite: false,
      retenue: 1000,
      remboursement: 3000,
    });
    expect(decisionAnnulation({ ...base, prix: 5500, classe: "vip" })).toEqual({
      autorise: true,
      gratuite: false,
      retenue: 2750,
      remboursement: 2750,
    });
  });

  it("respecte une règle de compagnie différente", () => {
    const regles = {
      ...REGLES_PAR_DEFAUT,
      annulationGratuiteMinutes: 120,
      retenueApresDelaiPct: { classique: 10, vip: 10 },
    };
    const d = decisionAnnulation({
      etat: "paye",
      prix: 4000,
      classe: "classique",
      heureDepart: DEPART,
      maintenant: "2027-01-05T06:30:00+01:00",
      regles,
    });
    expect(d.gratuite).toBe(false);
    expect(d.retenue).toBe(400);
    expect(limiteAnnulationGratuite(DEPART, regles)).toBe("2027-01-05T06:00:00.000+01:00");
  });

  it("après l'heure du départ, tout est retenu", () => {
    const d = decisionAnnulation({
      etat: "paye",
      prix: 4000,
      classe: "classique",
      heureDepart: DEPART,
      maintenant: "2027-01-05T08:00:01+01:00",
    });
    expect(d).toMatchObject({
      autorise: true,
      raison: "depart_passe",
      retenue: 4000,
      remboursement: 0,
    });
  });

  it.each(["embarque", "voyage", "annule", "non_presente"] as const)(
    "refuse l'annulation d'un billet « %s »",
    (etat) => {
      const d = decisionAnnulation({
        etat,
        prix: 4000,
        classe: "classique",
        heureDepart: DEPART,
        maintenant: "2027-01-05T05:00:00+01:00",
      });
      expect(d).toMatchObject({ autorise: false, raison: "etat_interdit", remboursement: 0 });
    },
  );

  it("remboursement + retenue = prix, toujours", () => {
    for (const prix of [1, 999, 3500, 4001, 5500]) {
      for (let minutes = 0; minutes <= 180; minutes += 7) {
        const d = decisionAnnulation({
          etat: "reporte",
          prix,
          classe: "classique",
          heureDepart: DEPART,
          maintenant: new Date(Date.parse(DEPART) - minutes * 60_000),
        });
        expect(d.retenue + d.remboursement).toBe(prix);
      }
    }
  });

  it("seul un superviseur valide une annulation ; AfriMove ne vend jamais", () => {
    expect(peutValiderAnnulation("superviseur")).toBe(true);
    expect(peutValiderAnnulation("guichetier")).toBe(false);
    expect(peutValiderAnnulation("patron")).toBe(false);
    expect(peutVendre("guichetier")).toBe(true);
    expect(peutVendre("convoyeur")).toBe(true);
    expect(peutVendre("afrimove")).toBe(false);
    expect(peutVendre("comptable")).toBe(false);
  });
});

describe("caisse : cash attendu, écart, tolérance", () => {
  it("reproduit la planche Caisse : 695 500 attendus, 694 500 comptés, écart − 1 000", () => {
    const attendu = cashAttendu({
      fondDeCaisse: 20_000,
      billetsCash: 612_000,
      colisCash: 71_500,
      annulationsValidees: 8000,
    });
    expect(attendu).toBe(695_500);
    const compte = totalCoupures({ 10_000: 48, 5000: 36, 2000: 14, 1000: 5, 500: 3 });
    expect(compte).toBe(694_500);
    expect(evaluerEcart(attendu, compte, 1000)).toEqual({ ecart: -1000, statut: "dans_tolerance" });
  });

  it("compte les pièces à part et refuse une coupure inconnue", () => {
    expect(totalCoupures({ 1000: 2 }, 350)).toBe(2350);
    expect(() => totalCoupures({ 750: 1 })).toThrow(RangeError);
    expect(() => totalCoupures({ 1000: -1 })).toThrow(RangeError);
  });

  it("tolérance : vert dedans (bornes comprises), rouge au-delà, dans les deux sens", () => {
    expect(evaluerEcart(10_000, 10_000, 1000).statut).toBe("exact");
    expect(evaluerEcart(10_000, 9000, 1000)).toEqual({ ecart: -1000, statut: "dans_tolerance" });
    expect(evaluerEcart(10_000, 11_000, 1000)).toEqual({ ecart: 1000, statut: "dans_tolerance" });
    expect(evaluerEcart(10_000, 8999, 1000).statut).toBe("hors_tolerance");
    expect(evaluerEcart(10_000, 11_001, 1000).statut).toBe("hors_tolerance");
    expect(evaluerEcart(10_000, 9500, 500).statut).toBe("dans_tolerance");
    expect(evaluerEcart(10_000, 9499, 500).statut).toBe("hors_tolerance");
  });

  it("la tolérance par défaut est celle des réglages : 1 000 F", () => {
    expect(REGLES_PAR_DEFAUT.toleranceEcart).toBe(1000);
    expect(evaluerEcart(5000, 4000).statut).toBe("dans_tolerance");
    expect(evaluerEcart(5000, 3999).statut).toBe("hors_tolerance");
  });

  it("refuse des montants non entiers ou négatifs", () => {
    expect(() => evaluerEcart(1000.5, 1000)).toThrow(RangeError);
    expect(() =>
      cashAttendu({ fondDeCaisse: -1, billetsCash: 0, colisCash: 0, annulationsValidees: 0 }),
    ).toThrow(RangeError);
  });
});

describe("clôture automatique à minuit (Africa/Douala)", () => {
  it("n'a pas lieu avant minuit local, a lieu à minuit pile", () => {
    const ouverte = "2027-01-05T05:02:00+01:00";
    expect(doitCloturerAuto(ouverte, "2027-01-05T23:59:59+01:00")).toBe(false);
    expect(doitCloturerAuto(ouverte, "2027-01-06T00:00:00+01:00")).toBe(true);
    expect(doitCloturerAuto(ouverte, "2027-01-06T09:00:00+01:00")).toBe(true);
    expect(heureClotureAuto(ouverte)).toBe("2027-01-06T00:00:00.000+01:00");
  });

  it("minuit est celui de Douala, pas celui d'UTC", () => {
    // 22:59 UTC = 23:59 à Douala : pas encore ; 23:00 UTC = minuit à Douala : clôture, alors qu'il
    // est encore le même jour en UTC.
    const ouverte = "2027-01-05T10:00:00+01:00";
    expect(doitCloturerAuto(ouverte, "2027-01-05T22:59:59Z")).toBe(false);
    expect(doitCloturerAuto(ouverte, "2027-01-05T23:00:00Z")).toBe(true);
  });
});

describe("appareil hors ligne : blocage au-delà de 12 h", () => {
  const derniere = "2027-01-05T06:00:00+01:00";

  it("pas bloqué à 11 h 59, ni à 12 h pile (le seuil est strictement supérieur à 12 h)", () => {
    expect(
      statutAppareil({ derniereSyncA: derniere, maintenant: "2027-01-05T17:59:00+01:00" }).bloque,
    ).toBe(false);
    expect(
      statutAppareil({ derniereSyncA: derniere, maintenant: "2027-01-05T18:00:00+01:00" }).bloque,
    ).toBe(false);
  });

  it("bloqué dès 12 h 01", () => {
    const s = statutAppareil({ derniereSyncA: derniere, maintenant: "2027-01-05T18:01:00+01:00" });
    expect(s.bloque).toBe(true);
    expect(s.horsLigneMinutes).toBe(12 * 60 + 1);
    expect(s.bloqueDepuis).toBe("2027-01-05T18:00:00.000+01:00");
  });

  it("le PIN superviseur débloque 4 h, puis l'appareil est de nouveau bloqué", () => {
    const maintenant = "2027-01-05T19:00:00+01:00";
    const jusqua = debloquerTemporairement(maintenant);
    expect(jusqua).toBe("2027-01-05T23:00:00.000+01:00");
    expect(
      statutAppareil({ derniereSyncA: derniere, maintenant, debloqueJusqua: jusqua }).bloque,
    ).toBe(false);
    expect(
      statutAppareil({
        derniereSyncA: derniere,
        maintenant: "2027-01-05T22:59:59+01:00",
        debloqueJusqua: jusqua,
      }).bloque,
    ).toBe(false);
    expect(
      statutAppareil({
        derniereSyncA: derniere,
        maintenant: "2027-01-05T23:00:00+01:00",
        debloqueJusqua: jusqua,
      }).bloque,
    ).toBe(true);
  });

  it("une synchronisation récente ramène le compteur à zéro", () => {
    const s = statutAppareil({
      derniereSyncA: "2027-01-05T18:30:00+01:00",
      maintenant: "2027-01-05T18:31:00+01:00",
    });
    expect(s).toMatchObject({ bloque: false, horsLigneMinutes: 1 });
  });
});

describe("colis non retiré, siège bloqué, PIN", () => {
  it("garde de 7 jours : non retiré à J+7", () => {
    const dispo = "2027-01-05T13:00:00+01:00";
    expect(limiteRetraitColis(dispo)).toBe("2027-01-12T13:00:00.000+01:00");
    expect(colisNonRetire(dispo, "2027-01-12T12:59:59+01:00")).toBe(false);
    expect(colisNonRetire(dispo, "2027-01-12T13:00:00+01:00")).toBe(true);
  });

  it("un siège est bloqué 15 min", () => {
    expect(finBlocageSiege("2027-01-05T10:00:00+01:00")).toBe("2027-01-05T10:15:00.000+01:00");
  });

  it("3 PIN faux bloquent", () => {
    expect(pinBloque(2)).toBe(false);
    expect(pinBloque(3)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import {
  ecartsParJour,
  etatDe,
  lectureEcarts,
  lectureVentes,
  masquerNumero,
  montantCourt,
  resumerAppareils,
  sansAccents,
  ventesParHeure,
} from "./calculs";
import type { MembrePatron } from "./modele";
import { droitsParDefaut } from "./modele";

const membre = (extra: Partial<MembrePatron> = {}): MembrePatron => ({
  id: "m1",
  nom: "Éric Ngono",
  role: "guichetier",
  gareId: "g",
  gareNom: "Akwa",
  guichetId: null,
  guichetRang: 2,
  bus: null,
  situation: "en_service",
  enServiceDepuis: null,
  actif: true,
  bloqueJusqua: null,
  pinProvisoireJusqua: null,
  creeA: new Date("2026-01-01T00:00:00Z"),
  telephoneChiffre: "x",
  operateur: "MTN",
  salaire: 0,
  jourDePaie: 30,
  droits: droitsParDefaut("guichetier"),
  billets90: 0,
  ...extra,
});

describe("formats", () => {
  it("masque le milieu d'un numéro", () => {
    expect(masquerNumero("+237677000002")).toBe("6 77 •• •• 02");
    expect(masquerNumero("677000002")).toBe("6 77 •• •• 02");
  });
  it("écrit les montants courts", () => {
    expect(montantCourt(2_610_000)).toBe("2,6 M");
    expect(montantCourt(740_000)).toContain("740");
  });
  it("cherche sans accents ni casse", () => {
    expect(sansAccents("Éric")).toBe("eric");
  });
});

describe("états d'une personne", () => {
  const maintenant = new Date("2026-11-02T08:00:00Z");
  it("désactivé > bloqué > ce qu'elle fait", () => {
    expect(etatDe(membre({ actif: false }), maintenant)).toBe("hors_service");
    expect(etatDe(membre({ bloqueJusqua: new Date("2026-11-02T08:05:00Z") }), maintenant)).toBe(
      "bloquee",
    );
    expect(etatDe(membre({ bloqueJusqua: new Date("2026-11-02T07:59:00Z") }), maintenant)).toBe(
      "en_service",
    );
  });
});

describe("écarts de caisse", () => {
  it("un point par jour, zéro sans écart", () => {
    const jours = ecartsParJour(
      [{ at: "2026-11-02T09:00:00.000+01:00", ecart: -500 }],
      "2026-11-02",
      3,
    );
    expect(jours).toEqual([
      { jour: "2026-10-31", ecart: 0 },
      { jour: "2026-11-01", ecart: 0 },
      { jour: "2026-11-02", ecart: -500 },
    ]);
  });
  it("lit un motif : toujours négatif, multiple de 500, hors tolérance", () => {
    const l = lectureEcarts([-1000, -500, 0, -1500], 10, 700);
    expect(l).toContain("3 écarts en 10 jours");
    expect(l).toContain("Toujours en négatif.");
    expect(l).toContain("Toujours un multiple de 500.");
    expect(l).toContain("dépassent la tolérance");
    expect(lectureEcarts([0, 0], 10, 1000)).toContain("Aucun écart");
  });
});

describe("appareils", () => {
  it("synchronisé = annoncé depuis moins de 15 minutes", () => {
    const maintenant = new Date("2026-11-02T08:00:00Z");
    const r = resumerAppareils(
      [
        { rang: 1, derniereSyncA: new Date("2026-11-02T07:50:00Z") },
        { rang: 2, derniereSyncA: new Date("2026-11-02T07:30:00Z") },
        { rang: 3, derniereSyncA: null },
      ],
      maintenant,
    );
    expect(r.total).toBe(3);
    expect(r.synchronises).toBe(1);
    expect(r.derniereSyncA?.toISOString()).toBe("2026-11-02T07:50:00.000Z");
  });
});

describe("ventes par heure", () => {
  const maintenant = new Date("2026-11-02T08:00:00Z"); // 09:00 à Douala
  it("réel avant l'heure en cours, moyenne des semaines d'avant ensuite", () => {
    const aujourdhui = [{ at: "2026-11-02T06:30:00.000+01:00", montant: 3000 }];
    const historique = [
      [{ at: "2026-10-26T10:15:00.000+01:00", montant: 4000 }],
      [{ at: "2026-10-19T10:40:00.000+01:00", montant: 2000 }],
    ];
    const r = ventesParHeure(aujourdhui, historique, maintenant);
    expect(r.heures.find((h) => h.heure === 6)).toEqual({ heure: 6, montant: 3000, prevu: false });
    expect(r.heures.find((h) => h.heure === 10)).toEqual({ heure: 10, montant: 3000, prevu: true });
    expect(r.previsionCloture).toBe(6000);
    expect(r.lecture).toContain("Prévision de clôture");
  });
  it("sans vente, une phrase honnête", () => {
    expect(lectureVentes([{ heure: 5, montant: 0 }], 0)).toBe("Pas encore de vente aujourd'hui.");
  });
});

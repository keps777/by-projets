import { describe, expect, it } from "vitest";
import type { ArretLigne, EtatLigne } from "./modeles";
import {
  KM_PAR_TRONCON_INCONNU,
  ajouterJours,
  chercherConflit,
  circuleLe,
  codeDeLigne,
  compterModifications,
  controlerEtat,
  disposerArrets,
  fusionner,
  heureDepartIso,
  jourSemaine,
  jourValide,
  joursEntre,
  joursTries,
  numeroDepart,
  planParDefaut,
  prorataDe,
  seChevauchent,
} from "./regles";

describe("calendrier des départs", () => {
  it("ne valide que les jours qui existent", () => {
    expect(jourValide("2027-02-28")).toBe(true);
    expect(jourValide("2028-02-29")).toBe(true);
    expect(jourValide("2027-02-29")).toBe(false);
    expect(jourValide("2027-13-01")).toBe(false);
    expect(jourValide("27-01-01")).toBe(false);
  });

  it("donne le jour de la semaine et franchit les fins de mois et d'année", () => {
    expect(jourSemaine("2026-11-02")).toBe("lun");
    expect(jourSemaine("2026-11-08")).toBe("dim");
    expect(ajouterJours("2026-12-31", 1)).toBe("2027-01-01");
    expect(joursEntre("2026-12-30", "2027-01-02")).toEqual([
      "2026-12-30",
      "2026-12-31",
      "2027-01-01",
      "2027-01-02",
    ]);
    expect(joursEntre("2026-11-02", "2026-11-02")).toHaveLength(1);
    expect(joursEntre("2026-11-03", "2026-11-02")).toEqual([]);
  });

  it("un horaire sans jours circule tous les jours, sinon seulement les jours nommés", () => {
    expect(circuleLe([], "2026-11-07")).toBe(true);
    expect(circuleLe(["lun", "ven"], "2026-11-02")).toBe(true);
    expect(circuleLe(["lun", "ven"], "2026-11-03")).toBe(false);
  });

  it("compose le numéro AGENCE-LIGNE-AAMMJJ-HHMM de la billetterie", () => {
    const iso = heureDepartIso("2026-11-02", "05:30");
    expect(iso).toBe("2026-11-02T05:30:00.000+01:00");
    expect(numeroDepart("ALP", "DLAYDE", iso)).toBe("ALP-DLAYDE-261102-0530");
    expect(numeroDepart("ALP", "DLA-YDE", iso)).toBe("ALP-DLAYDE-261102-0530");
  });
});

const arrets = (...v: [string, number][]): ArretLigne[] =>
  v.map(([nom, kmDepuisOrigine], i) => ({ nom, kmDepuisOrigine, montee: i < v.length - 1 }));

describe("arrêts d'une ligne", () => {
  it("une ligne sans distance connue répartit ses arrêts à intervalles réguliers", () => {
    const r = disposerArrets(
      [],
      [
        { nom: "Édéa", montee: true },
        { nom: "Makak", montee: true },
      ],
      "Douala",
      "Yaoundé",
    );
    expect(r.map((a) => a.nom)).toEqual(["Douala", "Édéa", "Makak", "Yaoundé"]);
    expect(r.map((a) => a.kmDepuisOrigine)).toEqual([
      0,
      KM_PAR_TRONCON_INCONNU,
      2 * KM_PAR_TRONCON_INCONNU,
      3 * KM_PAR_TRONCON_INCONNU,
    ]);
    expect(r[0]!.montee).toBe(true);
    expect(r[3]!.montee).toBe(false);
  });

  it("un arrêt déjà connu garde ses kilomètres, un nouvel arrêt se place entre ses voisins", () => {
    const avant = arrets(["Douala", 0], ["Édéa", 60], ["Yaoundé", 240]);
    const r = disposerArrets(
      avant,
      [
        { nom: "Édéa", montee: true },
        { nom: "Makak", montee: true },
      ],
      "Douala",
      "Yaoundé",
    );
    expect(r.find((a) => a.nom === "Édéa")!.kmDepuisOrigine).toBe(60);
    const makak = r.find((a) => a.nom === "Makak")!.kmDepuisOrigine;
    expect(makak).toBeGreaterThan(60);
    expect(makak).toBeLessThan(r[r.length - 1]!.kmDepuisOrigine);
  });

  it("les kilomètres sont toujours croissants, même si l'ordre des arrêts change", () => {
    const avant = arrets(["Douala", 0], ["Édéa", 60], ["Makak", 150], ["Yaoundé", 240]);
    const r = disposerArrets(
      avant,
      [
        { nom: "Makak", montee: true },
        { nom: "Édéa", montee: true },
      ],
      "Douala",
      "Yaoundé",
    );
    const kms = r.map((a) => a.kmDepuisOrigine);
    expect([...kms].sort((a, b) => a - b)).toEqual(kms);
    expect(new Set(kms).size).toBe(kms.length);
  });

  it("le prix d'un arrêt est proportionnel aux kilomètres, au centaine de francs", () => {
    const l = arrets(["Douala", 0], ["Édéa", 60], ["Yaoundé", 240]);
    expect(prorataDe(l, 1, 4000)).toBe(1000);
    expect(prorataDe(l, 2, 4000)).toBe(4000);
    expect(prorataDe(l, 0, 4000)).toBe(0);
    expect(prorataDe(l, 5, 4000)).toBe(0);
  });
});

const etat = (surcharge: Partial<EtatLigne> = {}): EtatLigne => ({
  tarifs: { classique: 4000, vip: 6000, bagage: 500 },
  arrets: [{ nom: "Édéa", montee: true }],
  horaires: [
    { id: "h1", heure: "05:30", classe: "classique", actif: true, note: null, jours: [] },
    { id: "h2", heure: "08:00", classe: "vip", actif: true, note: null, jours: ["lun"] },
  ],
  plan: planParDefaut(70),
  options: { venteEnLigne: true, fusionAuto: false },
  ...surcharge,
});

describe("modifications d'une ligne", () => {
  it("compte chaque tarif, arrêt, horaire, plan et option qui change", () => {
    const base = etat();
    expect(compterModifications(base, base)).toBe(0);
    expect(
      compterModifications(base, etat({ tarifs: { classique: 4500, vip: 6500, bagage: 500 } })),
    ).toBe(2);
    expect(compterModifications(base, etat({ horaires: [base.horaires[0]!] }))).toBe(1);
    expect(
      compterModifications(
        base,
        etat({
          horaires: [
            ...base.horaires,
            { id: null, heure: "12:00", classe: "classique", actif: true, note: null, jours: [] },
          ],
        }),
      ),
    ).toBe(1);
    expect(
      compterModifications(base, etat({ options: { venteEnLigne: false, fusionAuto: true } })),
    ).toBe(2);
  });

  it("déplacer un horaire n'est qu'un changement, pas une suppression plus une création", () => {
    const base = etat();
    const deplace = etat({
      horaires: [{ ...base.horaires[0]!, heure: "06:00" }, base.horaires[1]!],
    });
    expect(compterModifications(base, deplace)).toBe(1);
  });

  it("fusionne un brouillon sans toucher aux sections qu'il ne nomme pas", () => {
    const base = etat();
    const f = fusionner(base, { tarifs: { classique: 5000, vip: 6000, bagage: 500 } });
    expect(f.tarifs.classique).toBe(5000);
    expect(f.horaires).toBe(base.horaires);
    expect(fusionner(base, null)).toBe(base);
  });

  it("refuse deux départs actifs à la même heure, mais pas un départ désactivé", () => {
    const double = etat({
      horaires: [
        { id: "a", heure: "06:00", classe: "classique", actif: true, note: null, jours: [] },
        { id: "b", heure: "06:00", classe: "vip", actif: true, note: null, jours: [] },
      ],
    });
    expect(controlerEtat(double)?.code).toBe("HORAIRE_EN_DOUBLE");
    const eteint = etat({
      horaires: [
        { id: "a", heure: "06:00", classe: "classique", actif: true, note: null, jours: [] },
        { id: "b", heure: "06:00", classe: "vip", actif: false, note: null, jours: [] },
      ],
    });
    expect(controlerEtat(eteint)).toBeNull();
  });

  it("refuse un arrêt en double (casse et espaces ignorés) et un plan qui ne porte pas la capacité", () => {
    expect(
      controlerEtat(
        etat({
          arrets: [
            { nom: "Édéa", montee: true },
            { nom: " édéa ", montee: false },
          ],
        }),
      )?.code,
    ).toBe("ARRET_EN_DOUBLE");
    expect(
      controlerEtat(etat({ plan: { capacite: 70, disposition: "2+2", rangees: 10 } }))?.code,
    ).toBe("PLAN_INCOHERENT");
    expect(
      controlerEtat(etat({ plan: { capacite: 40, disposition: "2+2", rangees: 10 } })),
    ).toBeNull();
  });

  it("range les jours dans l'ordre de la semaine, sans doublon", () => {
    expect(joursTries(["dim", "lun", "mer", "lun"])).toEqual(["lun", "mer", "dim"]);
  });

  it("compose le code de ligne avec les codes des deux gares", () => {
    expect(codeDeLigne({ code: "DLA" }, { code: "YDE" })).toBe("DLAYDE");
  });
});

describe("équipages", () => {
  const h = (heure: string) => Date.parse(`2026-11-02T${heure}:00.000+01:00`);
  const dep = (
    numero: string,
    heure: string,
    ressources: { busId?: string; chauffeurId?: string },
  ) => ({
    numero,
    debutMs: h(heure),
    dureeMinutes: 240,
    busId: ressources.busId ?? null,
    chauffeurId: ressources.chauffeurId ?? null,
    convoyeurId: null,
  });

  it("deux trajets se chevauchent tant que le premier n'est pas arrivé (fin exclue)", () => {
    const a = { debutMs: h("06:00"), dureeMinutes: 240 };
    expect(seChevauchent(a, { debutMs: h("09:59"), dureeMinutes: 240 })).toBe(true);
    expect(seChevauchent(a, { debutMs: h("10:00"), dureeMinutes: 240 })).toBe(false);
    expect(seChevauchent(a, { debutMs: h("02:00"), dureeMinutes: 240 })).toBe(false);
    expect(seChevauchent(a, { debutMs: h("02:01"), dureeMinutes: 240 })).toBe(true);
  });

  it("trouve le bus, puis le chauffeur, déjà pris par un départ qui chevauche", () => {
    const candidat = dep("A", "08:00", { busId: "bus-1", chauffeurId: "chauf-1" });
    expect(chercherConflit(candidat, [dep("B", "06:00", { busId: "bus-1" })])).toEqual({
      ressource: "bus",
      departNumero: "B",
    });
    expect(chercherConflit(candidat, [dep("C", "07:00", { chauffeurId: "chauf-1" })])).toEqual({
      ressource: "chauffeur",
      departNumero: "C",
    });
  });

  it("ne trouve rien quand les départs ne se chevauchent pas, ou ne partagent rien", () => {
    const candidat = dep("A", "08:00", { busId: "bus-1" });
    expect(chercherConflit(candidat, [dep("B", "14:00", { busId: "bus-1" })])).toBeNull();
    expect(chercherConflit(candidat, [dep("C", "08:00", { busId: "bus-2" })])).toBeNull();
    expect(chercherConflit(dep("D", "08:00", {}), [dep("E", "08:00", {})])).toBeNull();
  });

  it("un départ ne se bloque pas lui-même quand on le rééquipe", () => {
    const meme = dep("A", "08:00", { busId: "bus-1" });
    expect(chercherConflit(meme, [meme])).toBeNull();
  });
});

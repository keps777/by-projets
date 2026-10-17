import { describe, expect, it } from "vitest";
import {
  calculerComptes,
  constatDepuisPlan,
  constatSuivant,
  convoyeurDuDepart,
  ecritEcart,
  estFeminin,
  siegesOccupes,
  tonEcart,
  type SiegeConstate,
} from "./calculs";
import { heureDouala, montantFcfa } from "./formats";

const sieges = (constats: SiegeConstate["constat"][]): SiegeConstate[] =>
  constats.map((constat, i) => ({ numero: i + 1, constat }));

describe("constatSuivant : le tour des sièges", () => {
  it("fait passer scanné -> sans billet -> libre -> scanné", () => {
    expect(constatSuivant("scanne")).toBe("sans_billet");
    expect(constatSuivant("sans_billet")).toBe("libre");
    expect(constatSuivant("libre")).toBe("scanne");
  });

  it("revient au point de départ après trois touchers", () => {
    expect(constatSuivant(constatSuivant(constatSuivant("sans_billet")))).toBe("sans_billet");
  });

  it("traduit l'état d'affichage du plan en constat du contrat", () => {
    expect(constatDepuisPlan("sans-billet")).toBe("sans_billet");
    expect(constatDepuisPlan("scanne")).toBe("scanne");
    expect(constatDepuisPlan("libre")).toBe("libre");
  });
});

describe("calculerComptes : têtes comptées et écart", () => {
  const base = { tetes: 36, occupes: 35 };

  it("reprend les têtes du contrôle tant qu'aucun siège n'est touché", () => {
    const initial = sieges([...Array(34).fill("scanne"), "sans_billet", "libre"]);
    expect(siegesOccupes(initial)).toBe(35);
    expect(calculerComptes(base, 35, initial)).toEqual({ liste: 35, tetes: 36, ecart: 1 });
  });

  it("retire une tête quand un siège occupé passe à libre", () => {
    const touche = sieges([...Array(33).fill("scanne"), "libre", "sans_billet", "libre"]);
    expect(calculerComptes(base, 35, touche)).toEqual({ liste: 35, tetes: 35, ecart: 0 });
  });

  it("ajoute une tête quand un siège libre est occupé", () => {
    const touche = sieges([...Array(34).fill("scanne"), "sans_billet", "sans_billet"]);
    expect(calculerComptes(base, 35, touche)).toEqual({ liste: 35, tetes: 37, ecart: 2 });
  });

  it("ne change pas les têtes quand un siège passe de scanné à sans billet", () => {
    const touche = sieges([...Array(33).fill("scanne"), "sans_billet", "sans_billet", "libre"]);
    expect(calculerComptes(base, 35, touche).tetes).toBe(36);
  });

  it("donne un écart négatif quand il manque des voyageurs et ne descend jamais sous 0 tête", () => {
    expect(calculerComptes(base, 35, sieges(Array(30).fill("libre")))).toMatchObject({
      tetes: 1,
      ecart: -34,
    });
    expect(calculerComptes({ tetes: 2, occupes: 40 }, 3, sieges(["libre"]))).toMatchObject({
      tetes: 0,
      ecart: -3,
    });
  });

  it("recalcule l'écart quand la liste change (billet régularisé)", () => {
    const initial = sieges([...Array(34).fill("scanne"), "sans_billet", "libre"]);
    expect(calculerComptes(base, 36, initial)).toEqual({ liste: 36, tetes: 36, ecart: 0 });
  });
});

describe("écriture de l'écart", () => {
  it("écrit le signe, le vrai signe moins et zéro", () => {
    expect(ecritEcart(1)).toBe("+1");
    expect(ecritEcart(12)).toBe("+12");
    expect(ecritEcart(0)).toBe("0");
    expect(ecritEcart(-2)).toBe("−2");
  });

  it("choisit la teinte de la tuile", () => {
    expect(tonEcart(1)).toBe("alerte");
    expect(tonEcart(0)).toBe("ok");
    expect(tonEcart(-1)).toBe("manque");
  });
});

describe("autres calculs", () => {
  it("accorde la fonction d'après la civilité", () => {
    expect(estFeminin("Mme Fouda")).toBe(true);
    expect(estFeminin("mme Fouda")).toBe(true);
    expect(estFeminin("M. Fouda")).toBe(false);
    expect(estFeminin("Mbarga")).toBe(false);
  });

  it("désigne le convoyeur par son départ", () => {
    expect(convoyeurDuDepart("dep-0830")).toBe("convoyeur-du-depart-dep-0830");
  });

  it("écrit les montants avec une espace simple et lit l'heure de Douala", () => {
    expect(montantFcfa(4000)).toBe("4 000");
    expect(montantFcfa(950)).toBe("950");
    expect(montantFcfa(1250000)).toBe("1 250 000");
    expect(heureDouala("2027-01-05T09:14:00.000+01:00")).toBe("09:14");
    expect(heureDouala("n'importe quoi")).toBe("");
  });
});

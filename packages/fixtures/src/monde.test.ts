import { aammjjDouala, hhmmDouala, verifierCodeRetrait } from "@afrimove/domain";
import { describe, expect, it } from "vitest";
import { ecrans } from "./ecrans";
import { HORLOGE, JOUR, heure, jourDecale } from "./horloge";
import { nombre } from "./format";
import {
  BILLET_AICHA,
  BUS,
  CODE_RETRAIT_COLIS_0017,
  COLIS_MAMAN,
  GARES,
  GUICHETS,
  HACHE_COLIS_0017,
  LIGNES,
  MODULES,
  MONDE,
  PERSONNES,
  PLAN_BETA_0800,
  PLAN_BETA_0800_AVANT_PAIEMENT,
  SEL_COLIS_0017,
  SESSION_JOSEPH,
} from "./monde";
import { NOMS_PLANCHES } from "./planches";
import { problemes } from "./validation";

describe("horloge figée", () => {
  it("est le mardi 5 janvier 2027 à 07:38, heure de Douala", () => {
    expect(HORLOGE).toBe("2027-01-05T07:38:00.000+01:00");
    expect(JOUR).toBe("2027-01-05");
    expect(new Date(HORLOGE).getUTCDay()).toBe(2);
    expect(aammjjDouala(HORLOGE)).toBe("270105");
    expect(hhmmDouala(HORLOGE)).toBe("0738");
  });

  it("construit des instants de la journée et des jours voisins", () => {
    expect(heure("08:30")).toBe("2027-01-05T08:30:00.000+01:00");
    expect(heure("05:14:52")).toBe("2027-01-05T05:14:52.000+01:00");
    expect(jourDecale(1)).toBe("2027-01-06");
    expect(jourDecale(-2)).toBe("2027-01-03");
  });
});

describe("format des nombres", () => {
  it("écrit les montants comme les maquettes", () => {
    expect(nombre(7500)).toBe("7 500");
    expect(nombre(-1000)).toBe("− 1 000");
    expect(nombre(2.61)).toBe("2,61");
    expect(nombre(28_414_000)).toBe("28 414 000");
  });
});

describe("monde commun", () => {
  it("passe la validation du domaine sans aucun problème", () => {
    expect(problemes(MONDE)).toEqual([]);
  });

  it("n'a ni doublon d'identifiant ni doublon d'immatriculation", () => {
    for (const [nom, liste] of Object.entries({
      gares: GARES,
      guichets: GUICHETS,
      lignes: LIGNES,
      bus: BUS,
      personnes: PERSONNES,
    })) {
      const ids = liste.map((x) => x.id);
      expect(new Set(ids).size, nom).toBe(ids.length);
    }
    const plaques = BUS.map((b) => b.immatriculation);
    expect(new Set(plaques).size).toBe(plaques.length);
  });

  it("compte 5 compagnies, 12 modules dont 10 actifs", () => {
    expect(MONDE.compagnies).toHaveLength(5);
    expect(MODULES).toHaveLength(12);
    expect(MODULES.filter((m) => m.actif)).toHaveLength(10);
  });

  it("le billet d'Aïcha : BEX-DLA-270105-0142, siège 7, VIP 7 500 payé, code 7341", () => {
    expect(BILLET_AICHA.numero).toBe("BEX-DLA-270105-0142");
    expect(BILLET_AICHA.siege).toBe(7);
    expect(BILLET_AICHA.classe).toBe("vip");
    expect(BILLET_AICHA.prix).toBe(7500);
    expect(BILLET_AICHA.etat).toBe("paye");
    expect(BILLET_AICHA.codeBillet).toBe("7341");
    expect(BILLET_AICHA.passager.pieceQuatreDerniers).toBe("4471");
  });

  it("le plan du Bêta Express : 16 sièges, 7 pris puis 8 avec le siège 7 d'Aïcha", () => {
    expect(Object.keys(PLAN_BETA_0800_AVANT_PAIEMENT.occupes)).toHaveLength(7);
    expect(PLAN_BETA_0800_AVANT_PAIEMENT.bloques?.[7]).toBeDefined();
    expect(Object.keys(PLAN_BETA_0800.occupes)).toHaveLength(8);
    expect(PLAN_BETA_0800.occupes[7]).toBe(BILLET_AICHA.id);
  });

  it("le code de retrait du colis de Maman (482913) correspond à son haché", async () => {
    expect(COLIS_MAMAN.numero).toBe("C-DLA-270105-0017");
    expect(
      await verifierCodeRetrait(CODE_RETRAIT_COLIS_0017, HACHE_COLIS_0017, SEL_COLIS_0017),
    ).toBe(true);
    expect(await verifierCodeRetrait("000000", HACHE_COLIS_0017, SEL_COLIS_0017)).toBe(false);
    expect(COLIS_MAMAN.codeRetraitHache).toBe(HACHE_COLIS_0017);
  });

  it("la caisse de Joseph : K-DLA-270105-2-1, fond 20 000, 694 500 comptés pour 695 500", () => {
    expect(SESSION_JOSEPH.numero).toBe("K-DLA-270105-2-1");
    expect(SESSION_JOSEPH.fondDeCaisse).toBe(20_000);
    expect(SESSION_JOSEPH.cloturee).toMatchObject({
      cashCompte: 694_500,
      cashAttendu: 695_500,
      ecart: -1000,
    });
  });
});

describe("scénarios", () => {
  it("les 77 planches ont chacune leur scénario, avec leur nom", () => {
    expect(NOMS_PLANCHES).toHaveLength(77);
    for (const nom of NOMS_PLANCHES) {
      expect(ecrans[nom].planche).toBe(nom);
      expect(ecrans[nom].horloge).toBe(HORLOGE);
    }
  });

  it("les codes de retrait des autres colis des scénarios sont vérifiables", async () => {
    const colis = Object.values(ecrans).flatMap((e) => e.entites.colis ?? []);
    expect(colis.length).toBeGreaterThan(5);
    for (const c of colis) {
      expect(c.codeRetraitHache, c.numero).toMatch(/^[0-9a-f]{64}$/);
      expect(c.codeRetraitSel, c.numero).toMatch(/^[0-9a-f]{32}$/);
    }
    const parNumero = new Map(colis.map((c) => [c.numero, c]));
    const c88 = [...parNumero.values()].find((c) => c.sequence === 88);
    expect(c88).toBeDefined();
    expect(await verifierCodeRetrait("719264", c88!.codeRetraitHache, c88!.codeRetraitSel)).toBe(
      true,
    );
  });
});

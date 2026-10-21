import type { colis as contrats } from "@afrimove/contrats";
import { describe, expect, it } from "vitest";
import {
  appliquerMessage,
  detailEtape,
  detailsFrise,
  estRemis,
  etapeCourante,
  formaterMontant,
  formaterPoids,
  heureDouala,
  heureEtape,
  jourDouala,
} from "./formats";

const JOUR = "2027-01-05";
const iso = (heure: string) => `${JOUR}T${heure}:00.000+01:00`;

function etape(
  jalon: contrats.JalonSuivi,
  libelle: string,
  reste: Partial<contrats.EtapeSuivi> = {},
): contrats.EtapeSuivi {
  return { jalon, libelle, detail: null, a: null, estimee: false, fait: false, ...reste };
}

/** Le suivi de la planche : déposé et chargé, en route depuis 11:20, arrivée prévue vers 13:00. */
function suiviPlanche(): contrats.EtapeSuivi[] {
  return [
    etape("depose", "Déposé", {
      detail: "gare Alpha Douala · étiquette imprimée",
      a: iso("07:52"),
      fait: true,
    }),
    etape("charge", "Chargé", {
      detail: "bus LT 118 AB · scanné par le convoyeur",
      a: iso("08:10"),
      fait: true,
    }),
    etape("en_route", "En route", {
      detail: "après Bafang · arrivée vers 13:00",
      a: iso("11:20"),
      fait: true,
    }),
    etape("disponible", "Disponible", {
      detail: "à Bafoussam · SMS à Maman avec le lieu",
      a: iso("13:00"),
      estimee: true,
    }),
    etape("remis", "Remis", { detail: "photo de la remise envoyée aux deux" }),
  ];
}

describe("ColisCode · formats", () => {
  it("groupe les milliers par des espaces ordinaires", () => {
    expect(formaterMontant(25_000)).toBe("25 000");
    expect(formaterMontant(500)).toBe("500");
    expect(formaterMontant(1_250_000)).toBe("1 250 000");
  });

  it("écrit le poids avec une virgule décimale", () => {
    expect(formaterPoids(2)).toBe("2");
    expect(formaterPoids(2.5)).toBe("2,5");
  });

  it("lit l'heure de Douala dans l'horodatage du contrat", () => {
    expect(heureDouala("2027-01-05T07:52:00.000+01:00")).toBe("07:52");
    expect(heureDouala("n'importe quoi")).toBe("");
  });

  it("nomme le jour d'une promesse de réponse à l'heure de Douala", () => {
    expect(jourDouala("2027-01-07T11:30:00.000+01:00")).toBe("jeudi 7 janvier");
    // 00:30 à Douala est encore le 6 janvier en UTC : le jour est bien celui de Douala.
    expect(jourDouala("2027-01-07T00:30:00.000+01:00")).toBe("jeudi 7 janvier");
    expect(jourDouala("pas une date")).toBe("");
  });

  it("donne l'heure d'une étape : connue, prévue ou inconnue", () => {
    const [depose, , , disponible, remis] = suiviPlanche() as [
      contrats.EtapeSuivi,
      contrats.EtapeSuivi,
      contrats.EtapeSuivi,
      contrats.EtapeSuivi,
      contrats.EtapeSuivi,
    ];
    expect(heureEtape(depose)).toBe("07:52");
    expect(heureEtape(disponible)).toBe("~13:00");
    expect(heureEtape(remis)).toBe("—");
  });
});

describe("ColisCode · étape en cours", () => {
  it("est la dernière étape franchie : « En route » pulse tant que le colis n'est pas arrivé", () => {
    expect(etapeCourante(suiviPlanche())).toBe(2);
  });

  it("est la première quand rien n'est encore fait", () => {
    const rien = suiviPlanche().map((e) => ({ ...e, fait: false }));
    expect(etapeCourante(rien)).toBe(0);
    expect(estRemis(rien)).toBe(false);
  });

  it("dépasse la dernière quand le colis est remis : tout est franchi", () => {
    const remis = suiviPlanche().map((e) => ({ ...e, fait: true }));
    expect(etapeCourante(remis)).toBe(5);
    expect(estRemis(remis)).toBe(true);
  });

  it("ne dépend pas de l'ordre du tableau", () => {
    expect(etapeCourante(suiviPlanche().reverse())).toBe(2);
  });
});

describe("ColisCode · suivi en direct", () => {
  const message = (
    jalon: contrats.JalonSuivi,
    heure: string,
    etat: contrats.MessageSuiviColis["etat"] = "disponible",
  ): contrats.MessageSuiviColis => ({ colisId: "colis-1", etat, jalon, a: iso(heure) });

  it("ne change rien sans message", () => {
    const suivi = suiviPlanche();
    expect(appliquerMessage(suivi, undefined)).toBe(suivi);
  });

  it("franchit l'étape annoncée et lui donne l'heure du scan", () => {
    const apres = appliquerMessage(suiviPlanche(), message("disponible", "12:47"));
    const disponible = apres.find((e) => e.jalon === "disponible");
    expect(disponible).toMatchObject({ fait: true, estimee: false, a: iso("12:47") });
    expect(apres.find((e) => e.jalon === "remis")?.fait).toBe(false);
    expect(etapeCourante(apres)).toBe(3);
  });

  it("franchit aussi les étapes sautées, sans inventer leur heure", () => {
    const depart = suiviPlanche().map((e) =>
      e.jalon === "depose" ? e : { ...e, fait: false, a: null },
    );
    const apres = appliquerMessage(depart, message("en_route", "11:20", "en_route"));
    expect(apres.map((e) => e.fait)).toEqual([true, true, true, false, false]);
    expect(apres.find((e) => e.jalon === "charge")?.a).toBeNull();
    expect(apres.find((e) => e.jalon === "en_route")?.a).toBe(iso("11:20"));
  });

  it("ignore un message qui n'avance pas : la lecture du colis reste la référence", () => {
    const suivi = suiviPlanche();
    expect(appliquerMessage(suivi, message("charge", "08:10", "charge"))).toBe(suivi);
    expect(appliquerMessage(suivi, message("en_route", "11:21", "en_route"))).toBe(suivi);
  });

  it("marque le colis remis au dernier scan", () => {
    const apres = appliquerMessage(suiviPlanche(), message("remis", "13:20", "remis"));
    expect(estRemis(apres)).toBe(true);
    expect(etapeCourante(apres)).toBe(5);
  });
});

describe("ColisCode · texte des étapes", () => {
  it("garde le nom de l'étape, puis son détail après « · »", () => {
    expect(detailEtape(suiviPlanche()[0])).toEqual({
      libelle: "Déposé",
      detail: "gare Alpha Douala · étiquette imprimée",
      heure: "07:52",
    });
  });

  it("lit un lieu à la suite du nom : « Disponible à Bafoussam · SMS… »", () => {
    expect(detailEtape(suiviPlanche()[3])).toEqual({
      libelle: "Disponible à Bafoussam",
      detail: "SMS à Maman avec le lieu",
      heure: "~13:00",
    });
  });

  it("n'ajoute rien quand l'étape n'a pas de détail", () => {
    expect(detailEtape(etape("remis", "Remis"))).toEqual({ libelle: "Remis", heure: "—" });
  });

  it("range les étapes dans l'ordre de la frise, même si le contrat les livre autrement", () => {
    const details = detailsFrise(suiviPlanche().reverse());
    expect(details.map((d) => d.libelle)).toEqual([
      "Déposé",
      "Chargé",
      "En route",
      "Disponible à Bafoussam",
      "Remis",
    ]);
  });

  it("laisse un trou vide pour une étape absente du contrat", () => {
    const details = detailsFrise(suiviPlanche().slice(0, 3));
    expect(details[3]).toEqual({});
    expect(details[4]).toEqual({});
  });
});

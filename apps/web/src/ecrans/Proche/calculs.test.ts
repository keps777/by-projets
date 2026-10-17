import type { voyageur as contrats } from "@afrimove/contrats";
import { describe, expect, it } from "vitest";
import {
  decomposerDevis,
  delaiDepasse,
  deviseDemandee,
  estFeminin,
  formaterConversion,
  formaterMontant,
  formaterTelephone,
  heureDouala,
  initialesDe,
  issuePaiement,
  jourCourt,
  jourDemande,
  jourSemaine,
  normaliserTelephone,
  resumeCarte,
  siegeAReserver,
  urlAuthentificationSure,
} from "./calculs";

describe("formaterMontant", () => {
  it("groupe les milliers par une espace, comme la planche", () => {
    expect(formaterMontant(250)).toBe("250");
    expect(formaterMontant(5500)).toBe("5 500");
    expect(formaterMontant(1250000)).toBe("1 250 000");
  });
});

describe("formaterTelephone", () => {
  it("écrit un mobile camerounais comme la planche", () => {
    expect(formaterTelephone("+237699401822")).toBe("+237 6 99 40 18 22");
  });

  it("laisse tel quel un autre indicatif ou une autre longueur", () => {
    expect(formaterTelephone("+33612345678")).toBe("+33612345678");
    expect(formaterTelephone("+2376994018")).toBe("+2376994018");
  });
});

describe("normaliserTelephone", () => {
  it("accepte un mobile camerounais écrit de plusieurs façons", () => {
    for (const saisie of [
      "699401822",
      "6 99 40 18 22",
      "699-40-18-22",
      "699.40.18.22",
      "+237 699 401 822",
      "237699401822",
      "00237699401822",
    ]) {
      expect(normaliserTelephone(saisie)).toBe("+237699401822");
    }
  });

  it("refuse ce qui n'est pas un mobile camerounais complet", () => {
    for (const saisie of [
      "",
      "12345",
      "69940182",
      "6994018222",
      "299401822",
      "+33612345678",
      "abc",
    ]) {
      expect(normaliserTelephone(saisie)).toBeNull();
    }
  });
});

describe("heureDouala", () => {
  it("lit l'heure dans l'instant ISO de Douala", () => {
    expect(heureDouala("2027-01-10T07:30:00.000+01:00")).toBe("07:30");
    expect(heureDouala("n'importe quoi")).toBe("");
  });
});

describe("jours", () => {
  it("calcule le jour de la semaine sur la date : le 10 janvier 2027 est un dimanche", () => {
    expect(jourCourt("2027-01-10")).toBe("dim. 10 janv.");
    expect(jourSemaine("2027-01-10")).toBe("dimanche");
    expect(jourCourt("2027-01-09")).toBe("sam. 9 janv.");
    expect(jourSemaine("2027-01-09")).toBe("samedi");
  });

  it("ne dépend pas du fuseau de l'appareil : le premier de l'an reste le premier de l'an", () => {
    expect(jourCourt("2027-01-01")).toBe("ven. 1 janv.");
  });

  it("rend le jour tel quel s'il n'est pas une date", () => {
    expect(jourCourt("demain")).toBe("demain");
  });

  it("ne retient dans l'adresse qu'un jour AAAA-MM-JJ", () => {
    expect(jourDemande("2027-01-12")).toBe("2027-01-12");
    expect(jourDemande("12/01/2027")).toBeUndefined();
    expect(jourDemande(null)).toBeUndefined();
  });
});

describe("formaterConversion", () => {
  it("écrit le montant en devise avec sa virgule et son symbole", () => {
    expect(formaterConversion({ devise: "CAD", montantMineur: 1290, approximatif: true })).toBe(
      "12,90 $ CA",
    );
    expect(formaterConversion({ devise: "EUR", montantMineur: 905, approximatif: true })).toBe(
      "9,05 €",
    );
    expect(formaterConversion({ devise: "USD", montantMineur: 123456, approximatif: true })).toBe(
      "1 234,56 $ US",
    );
  });

  it("garde le code d'une devise sans symbole connu", () => {
    expect(formaterConversion({ devise: "JPY", montantMineur: 2000, approximatif: true })).toBe(
      "20,00 JPY",
    );
  });
});

describe("deviseDemandee", () => {
  it("met la devise de l'adresse en majuscules, sinon prend celle par défaut", () => {
    expect(deviseDemandee("eur", "CAD")).toBe("EUR");
    expect(deviseDemandee(null, "CAD")).toBe("CAD");
    expect(deviseDemandee("EURO", "CAD")).toBe("CAD");
    expect(deviseDemandee("12", "CAD")).toBe("CAD");
  });
});

describe("initialesDe", () => {
  it("prend la première lettre du prénom et du nom, ou deux lettres d'un seul mot", () => {
    expect(initialesDe("Thérèse Ngo")).toBe("TN");
    expect(initialesDe("Maman")).toBe("MA");
    expect(initialesDe("")).toBe("");
  });
});

describe("estFeminin", () => {
  it("n'accorde au féminin que pour un terme de parenté sans ambiguïté", () => {
    expect(estFeminin("Maman")).toBe(true);
    expect(estFeminin("Tantine Rose")).toBe(true);
    expect(estFeminin("Sœur Marie")).toBe(true);
    expect(estFeminin("Mamie")).toBe(true);
  });

  it("reste neutre pour un prénom ou un terme neutre", () => {
    expect(estFeminin("Paul")).toBe(false);
    expect(estFeminin("Esther")).toBe(false);
    expect(estFeminin("Papa")).toBe(false);
    expect(estFeminin("")).toBe(false);
  });
});

function plan(
  sieges: Array<{ numero: number; etat: contrats.EtatSiegeVue; emplacement?: string }>,
  mon?: { siege: number },
): contrats.PlanSiegesVue {
  return {
    departId: "dep-1",
    capacite: sieges.length,
    sieges,
    libres: sieges.filter((s) => s.etat === "libre").length,
    ...(mon
      ? { mon: { departId: "dep-1", siege: mon.siege, jusqua: "2027-01-05T07:53:00+01:00" } }
      : {}),
    versionPlan: 1,
  };
}

describe("siegeAReserver", () => {
  it("prend le siège que je tiens, avec seulement son côté", () => {
    const vue = plan(
      [
        { numero: 1, etat: "libre" },
        { numero: 3, etat: "a_moi", emplacement: "côté fenêtre · près de la porte" },
      ],
      { siege: 3 },
    );
    expect(siegeAReserver(vue)).toEqual({ numero: 3, emplacement: "côté fenêtre", choisi: true });
  });

  it("prend la première place libre quand je n'en tiens aucune, sans la dire choisie", () => {
    const vue = plan([
      { numero: 1, etat: "pris" },
      { numero: 2, etat: "bloque" },
      { numero: 4, etat: "libre", emplacement: "côté couloir" },
      { numero: 5, etat: "libre" },
    ]);
    expect(siegeAReserver(vue)).toEqual({ numero: 4, emplacement: "côté couloir", choisi: false });
  });

  it("ne rend rien quand le bus est complet", () => {
    expect(siegeAReserver(plan([{ numero: 1, etat: "pris" }]))).toBeUndefined();
  });
});

describe("delaiDepasse", () => {
  it("est vrai à l'instant limite et après, faux avant ou si la limite est illisible", () => {
    const limite = "2027-01-05T07:53:00+01:00";
    expect(delaiDepasse(limite, new Date("2027-01-05T07:52:59+01:00"))).toBe(false);
    expect(delaiDepasse(limite, new Date("2027-01-05T07:53:00+01:00"))).toBe(true);
    expect(delaiDepasse("n'importe quoi", new Date())).toBe(false);
  });
});

describe("issuePaiement", () => {
  it("un statut définitif l'emporte sur l'attente", () => {
    expect(issuePaiement(["en_attente_confirmation", undefined], false)).toBe("attente");
    expect(issuePaiement(["en_attente_confirmation", "reussi"], false)).toBe("reussi");
    expect(issuePaiement(["echoue", undefined], false)).toBe("echoue");
    expect(issuePaiement(["expire"], false)).toBe("expire");
  });

  it("le succès l'emporte sur un échec plus ancien, l'échéance de la commande clôt l'attente", () => {
    expect(issuePaiement(["echoue", "reussi"], true)).toBe("reussi");
    expect(issuePaiement(["en_attente_confirmation"], true)).toBe("expire");
  });
});

describe("urlAuthentificationSure", () => {
  it("n'accepte que https", () => {
    expect(urlAuthentificationSure("https://3ds.example/a")).toBe("https://3ds.example/a");
    expect(urlAuthentificationSure("http://3ds.example/a")).toBeUndefined();
    expect(urlAuthentificationSure("javascript:alert(1)")).toBeUndefined();
    expect(urlAuthentificationSure(undefined)).toBeUndefined();
  });
});

describe("decomposerDevis", () => {
  it("sépare le billet des frais de service", () => {
    expect(
      decomposerDevis({
        lignes: [
          { code: "billet", libelle: "Billet", montant: 5500 },
          { code: "frais_voyageur", libelle: "Frais", montant: 250 },
        ],
        total: 5750,
      }),
    ).toEqual({ billet: 5500, frais: 250 });
  });

  it("compte des frais offerts pour zéro", () => {
    expect(
      decomposerDevis({
        lignes: [
          { code: "billet", libelle: "Billet", montant: 5500 },
          { code: "frais_voyageur", libelle: "Frais", montant: 0, montantBarre: 250 },
        ],
        total: 5500,
      }),
    ).toEqual({ billet: 5500, frais: 0 });
  });
});

describe("resumeCarte", () => {
  const moyens = (detail?: string): contrats.MoyenPaiementVue[] => [
    { code: "mtn_momo", nom: "MTN", detail: "6 91 22 10 08", choisi: false },
    { code: "carte", nom: "Carte bancaire", ...(detail ? { detail } : {}), choisi: false },
  ];

  it("rend la carte enregistrée, qui se termine par ses quatre derniers chiffres", () => {
    expect(resumeCarte(moyens("Visa ···· 4471"))).toBe("Visa ···· 4471");
  });

  it("ne prend pas un détail générique pour une carte", () => {
    expect(resumeCarte(moyens("Visa, Mastercard · aussi depuis l'étranger"))).toBeUndefined();
    expect(resumeCarte(moyens())).toBeUndefined();
    expect(resumeCarte([])).toBeUndefined();
  });
});

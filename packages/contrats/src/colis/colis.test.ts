import { ETATS_COLIS, devisColis, repartitionLivraison, repartitionRelais } from "@afrimove/domain";
import { describe, expect, it } from "vitest";
import {
  CHAMPS_CODE_RETRAIT,
  JALONS_SUIVI,
  MODES_COLIS,
  SchemaCodeRetrait,
  SchemaColisPartenaire,
  SchemaColisProprietaire,
  SchemaBrouillonRelais,
  SchemaClientVendeur,
  SchemaDemandeLivreur,
  SchemaDevisColis,
  SchemaFicheRelais,
  SchemaEtatColis,
  SchemaFcfa,
  SchemaFcfaPositif,
  SchemaIsoDouala,
  SchemaMissionLivraison,
  SchemaModeColis,
  SchemaOffreDepartColis,
  SchemaReglementHebdo,
  SchemaSuiviDemande,
  SchemaTelephone,
  fuitesCodeRetrait,
} from "./index";

const ISO = "2027-01-05T07:52:00.000+01:00";

const partenaire = {
  id: "colis-1",
  numero: "C-DLA-270105-0017",
  etat: "en_relais",
  mode: "relais",
  poidsKg: 2,
  assure: true,
  valeurAssuree: 25_000,
  expediteur: { nom: "Ngo Aïcha" },
  destinataire: { nom: "Ngo Thérèse", telephoneMasque: "6 99 …" },
  codeRequis: true,
  disponibleDepuis: ISO,
  limiteRetrait: "2027-01-12T13:05:00.000+01:00",
} as const;

const proprietaire = {
  id: "colis-1",
  numero: "C-ALP-DLA-270105-0017",
  role: "expediteur",
  etat: "en_route",
  mode: "gare",
  contenu: "Médicaments, vêtements",
  poidsKg: 2,
  assure: true,
  valeurAssuree: 25_000,
  prixTotal: 2200,
  creeA: ISO,
  expediteur: { nom: "Ngo Aïcha", telephone: "+237691221008" },
  destinataire: { nom: "Ngo Thérèse", surnom: "Maman", telephone: "+237699401822" },
  retrait: {
    code: "482913",
    libelle: "Code de retrait",
    consigne: "Jamais au téléphone.",
    photoDepot: { libelle: "photo au dépôt", a: ISO },
  },
  suivi: JALONS_SUIVI.map((jalon) => ({
    jalon,
    libelle: jalon,
    detail: null,
    a: null,
    estimee: false,
    fait: false,
  })),
  arriveePrevue: null,
  options: [{ mode: "moto", titre: "Livrer", detail: "dès l'arrivée", prix: 1000 }],
  reclamation: {
    delaiReponseJoursOuvres: 2,
    multiplePortSiPerte: 10,
    texte: "Réclamation en 1 touche.",
  },
} as const;

describe("briques communes", () => {
  it("les montants sont des entiers en FCFA", () => {
    expect(SchemaFcfa.safeParse(1500).success).toBe(true);
    expect(SchemaFcfa.safeParse(-7200).success).toBe(true);
    expect(SchemaFcfa.safeParse(1500.5).success).toBe(false);
    expect(SchemaFcfa.safeParse("1500").success).toBe(false);
    expect(SchemaFcfaPositif.safeParse(-1).success).toBe(false);
  });

  it("une offre de départ refuse un port décimal", () => {
    const offre = {
      departId: "dep-1",
      compagnie: "Alpha Voyages",
      heureDepart: ISO,
      retrait: "gare de Bafoussam",
      arriveePrevue: ISO,
      port: 1500,
      recommande: true,
    };
    expect(SchemaOffreDepartColis.safeParse(offre).success).toBe(true);
    expect(SchemaOffreDepartColis.safeParse({ ...offre, port: 1500.5 }).success).toBe(false);
  });

  it("les heures sont des ISO Africa/Douala (+01:00)", () => {
    expect(SchemaIsoDouala.safeParse("2027-01-05T07:38:00.000+01:00").success).toBe(true);
    expect(SchemaIsoDouala.safeParse("2027-01-05T07:38:00+01:00").success).toBe(true);
    expect(SchemaIsoDouala.safeParse("2027-01-05T06:38:00.000Z").success).toBe(false);
    expect(SchemaIsoDouala.safeParse("2027-01-05T07:38:00.000+02:00").success).toBe(false);
    expect(SchemaIsoDouala.safeParse("2027-01-05").success).toBe(false);
    expect(SchemaIsoDouala.safeParse("07:38").success).toBe(false);
  });

  it("le code de retrait a six chiffres", () => {
    expect(SchemaCodeRetrait.safeParse("482913").success).toBe(true);
    for (const mauvais of ["48291", "4829130", "482 913", "abcdef", ""]) {
      expect(SchemaCodeRetrait.safeParse(mauvais).success, mauvais).toBe(false);
    }
  });

  it("le téléphone est au format international", () => {
    expect(SchemaTelephone.safeParse("+237699401822").success).toBe(true);
    expect(SchemaTelephone.safeParse("699401822").success).toBe(false);
  });

  it("les modes et les états suivent ceux du domaine", () => {
    expect([...MODES_COLIS]).toEqual(["gare", "relais", "moto"]);
    expect(SchemaModeColis.options).toEqual(["gare", "relais", "moto"]);
    expect(SchemaEtatColis.options).toEqual([...ETATS_COLIS]);
  });
});

describe("devis", () => {
  it("accepte le devis du domaine (1 500 + 200 + 500 = 2 200)", () => {
    const devis = devisColis({ port: 1500, canal: "app", mode: "gare", valeurAssuree: 25_000 });
    expect(SchemaDevisColis.parse(devis).total).toBe(2200);
  });

  it("refuse un total qui n'est pas la somme des lignes", () => {
    const devis = devisColis({ port: 1500, canal: "app", mode: "relais" });
    expect(SchemaDevisColis.safeParse({ ...devis, total: devis.total + 1 }).success).toBe(false);
  });
});

describe("vue de l'expéditeur et du destinataire", () => {
  it("porte le code de retrait", () => {
    const colis = SchemaColisProprietaire.parse(proprietaire);
    expect(colis.retrait.code).toBe("482913");
  });

  it("exige un code à six chiffres", () => {
    const mauvais = { ...proprietaire, retrait: { ...proprietaire.retrait, code: "4829" } };
    expect(SchemaColisProprietaire.safeParse(mauvais).success).toBe(false);
  });
});

describe("vue du guichet, du relais, du livreur et des compagnies partenaires", () => {
  it("accepte un colis sans code", () => {
    expect(SchemaColisPartenaire.safeParse(partenaire).success).toBe(true);
  });

  it("refuse le code, le haché et le sel, sous tous leurs noms", () => {
    for (const champ of CHAMPS_CODE_RETRAIT) {
      expect(
        SchemaColisPartenaire.safeParse({ ...partenaire, [champ]: "482913" }).success,
        champ,
      ).toBe(false);
    }
    expect(SchemaColisPartenaire.safeParse({ ...partenaire, code: "482913" }).success).toBe(false);
  });

  it("n'accepte que `codeRequis: true`, jamais une valeur", () => {
    expect(SchemaColisPartenaire.safeParse({ ...partenaire, codeRequis: "482913" }).success).toBe(
      false,
    );
    expect(SchemaColisPartenaire.safeParse({ ...partenaire, codeRequis: false }).success).toBe(
      false,
    );
  });

  it("une mission refuse le code, même dans le colis imbriqué", () => {
    const mission = {
      id: "mission-1",
      colis: partenaire,
      trajet: { depart: "Gare Alpha", arrivee: "Tamdja", destinataire: "Ngo Thérèse" },
      distanceM: 4100,
      dureeMinutes: 14,
      gain: repartitionLivraison(1000).livreur,
      delaiAcceptationSecondes: 30,
      expireA: ISO,
      remiseContreCode: true,
    };
    expect(SchemaMissionLivraison.safeParse(mission).success).toBe(true);
    expect(
      SchemaMissionLivraison.safeParse({
        ...mission,
        colis: { ...partenaire, codeRetrait: "482913" },
      }).success,
    ).toBe(false);
    expect(SchemaMissionLivraison.safeParse({ ...mission, code: "482913" }).success).toBe(false);
    expect(SchemaMissionLivraison.safeParse({ ...mission, remiseContreCode: false }).success).toBe(
      false,
    );
    expect(SchemaMissionLivraison.safeParse({ ...mission, gain: 700.5 }).success).toBe(false);
  });
});

describe("fuitesCodeRetrait", () => {
  it("repère les champs interdits, à n'importe quelle profondeur", () => {
    expect(fuitesCodeRetrait({ a: [{ codeRetrait: "x" }] })).toEqual(["a[0].codeRetrait"]);
    expect(fuitesCodeRetrait({ codeRetraitHache: "ab", sel: "cd" })).toEqual([
      "codeRetraitHache",
      "sel",
    ]);
  });

  it("ne confond pas un `code` de ligne de devis avec un code de retrait", () => {
    expect(fuitesCodeRetrait({ lignes: [{ code: "port", montant: 1500 }] })).toEqual([]);
    expect(fuitesCodeRetrait({ code: "482 913" })).toEqual(["code"]);
    expect(fuitesCodeRetrait({ code: 482913 })).toEqual(["code"]);
  });

  it("repère le code dans un texte, quel que soit le format", () => {
    expect(fuitesCodeRetrait({ t: "demande le code 482 913 et regarde" }, ["482913"])).toEqual([
      "t",
    ]);
    expect(fuitesCodeRetrait({ t: "R-BAF-0215 · 214 relais" }, ["482913"])).toEqual([]);
  });
});

describe("règlement hebdomadaire", () => {
  const reglement = {
    titre: "Règlement entre compagnies · semaine",
    jour: "lundi",
    creances: [
      { compagnie: "Oméga", sens: "nous_doivent", colis: 14, montant: 19_500 },
      { compagnie: "Oméga", sens: "nous_devons", colis: 6, montant: 7200 },
    ],
    soldeNet: 12_300,
    moyen: "MoMo",
    reglementLe: "2027-01-11T08:00:00.000+01:00",
    contestationJusqua: "2027-01-10T20:00:00.000+01:00",
  };

  it("le solde net est la somme des créances", () => {
    expect(SchemaReglementHebdo.safeParse(reglement).success).toBe(true);
    expect(SchemaReglementHebdo.safeParse({ ...reglement, soldeNet: 12_000 }).success).toBe(false);
  });

  it("les montants sont des entiers", () => {
    const decimal = { ...reglement, creances: [{ ...reglement.creances[0]!, montant: 19_500.5 }] };
    expect(SchemaReglementHebdo.safeParse(decimal).success).toBe(false);
  });
});

describe("suivi d'une demande d'inscription", () => {
  const suivi = {
    type: "relais",
    dossier: "R-BAF-0215",
    statut: "en_cours",
    titre: "Fiche envoyée",
    detail: "Étape 2 / 3",
    etape: { courante: 2, total: 3 },
    jalons: [{ fait: true, libelle: "Fiche reçue", detail: "SMS envoyé", a: ISO }],
    reservation: {
      libelle: "Ton code relais",
      valeur: "R-BAF-0215",
      activation: "après la visite",
    },
    demo: { libelle: "En attendant", titre: "Essayer", detail: "démo" },
    recit: { titre: "Jeudi", texte: "Paul passe." },
    mention: null,
    complement: null,
    agent: { nom: "Paul K.", creneau: "jeudi" },
  };

  it("accepte un suivi de relais et de livreur", () => {
    expect(SchemaSuiviDemande.safeParse(suivi).success).toBe(true);
    expect(
      SchemaSuiviDemande.safeParse({ ...suivi, type: "livreur", etape: null, agent: null }).success,
    ).toBe(true);
  });

  it("refuse un statut inconnu", () => {
    expect(SchemaSuiviDemande.safeParse({ ...suivi, statut: "perdu" }).success).toBe(false);
  });
});

describe("tarifs du domaine repris dans les contrats", () => {
  it("le supplément relais et la part du livreur sont des entiers du domaine", () => {
    expect(repartitionRelais()).toEqual({ voyageur: 300, relais: 200, afrimove: 100 });
    expect(repartitionLivraison(1000)).toEqual({ livreur: 700, afrimove: 300 });
  });
});

describe("vendeur : départ de la proposition de revente", () => {
  const client = {
    nom: "Mme Ebogo",
    destination: "Yaoundé",
    habitude: "chaque vendredi",
    telephoneMasque: "6 70 …",
    proposition: "vendredi 08:30",
    dernierVoyage: null,
  };

  it("un client sans departId reste valide (champ ajouté, facultatif)", () => {
    expect(SchemaClientVendeur.safeParse(client).success).toBe(true);
  });

  it("la proposition porte le départ à ouvrir, rendu tel quel", () => {
    const lu = SchemaClientVendeur.parse({ ...client, departId: "dep-alp-dlayde-270108-0830" });
    expect(lu.departId).toBe("dep-alp-dlayde-270108-0830");
  });

  it("le departId est un identifiant non vide", () => {
    expect(SchemaClientVendeur.safeParse({ ...client, departId: "" }).success).toBe(false);
    expect(SchemaClientVendeur.safeParse({ ...client, departId: 8 }).success).toBe(false);
  });
});

describe("inscriptions : le MoMo du compte quand rien n'est retapé", () => {
  const momo = { telephone: "+237699123441", operateur: "orange" } as const;
  const fiche = {
    nom: "Boutique Chez Thérèse",
    type: "Boutique · alimentation",
    ouvert: "7 h – 20 h · lun.–sam.",
    position: { ville: "Bafoussam", quartier: "Tamdja" },
    tailleMax: "Petits et moyens (≤ 10 kg)",
    facadeRef: "photo-1",
  };
  const demande = {
    deplacement: "velo",
    zone: "Bafoussam · toute la ville",
    heures: "Soirs 17 h – 21 h",
    chargeMax: "10 kg · colis courants",
    pieces: {},
    reglesAcceptees: true,
  } as const;

  it("la fiche du relais est valide sans MoMo (le serveur prend celui du compte) et avec", () => {
    expect(SchemaFicheRelais.safeParse(fiche).success).toBe(true);
    expect(SchemaFicheRelais.safeParse({ ...fiche, momo }).success).toBe(true);
    expect(SchemaFicheRelais.parse({ ...fiche, momo }).momo).toEqual(momo);
  });

  it("la demande du livreur est valide sans MoMo et avec", () => {
    expect(SchemaDemandeLivreur.safeParse(demande).success).toBe(true);
    expect(SchemaDemandeLivreur.safeParse({ ...demande, momo }).success).toBe(true);
  });

  it("un MoMo présent reste contrôlé en entier : numéro international, opérateur connu", () => {
    for (const mauvais of [
      { telephone: "699123441", operateur: "orange" },
      { telephone: "+237699123441", operateur: "camtel" },
      { telephone: "+237699123441" },
      {},
      null,
    ]) {
      expect(SchemaFicheRelais.safeParse({ ...fiche, momo: mauvais }).success).toBe(false);
      expect(SchemaDemandeLivreur.safeParse({ ...demande, momo: mauvais }).success).toBe(false);
    }
  });

  it("le reste de la fiche et de la demande reste obligatoire", () => {
    const { nom: _nom, ...sansNom } = fiche;
    expect(SchemaFicheRelais.safeParse(sansNom).success).toBe(false);
    const { facadeRef: _facade, ...sansFacade } = fiche;
    expect(SchemaFicheRelais.safeParse(sansFacade).success).toBe(false);
    expect(SchemaDemandeLivreur.safeParse({ ...demande, reglesAcceptees: false }).success).toBe(
      false,
    );
  });

  it("le brouillon garde son MoMo facultatif, comme avant", () => {
    expect(SchemaBrouillonRelais.safeParse({ fiche: {} }).success).toBe(true);
    expect(SchemaBrouillonRelais.safeParse({ fiche: { momo } }).success).toBe(true);
  });
});

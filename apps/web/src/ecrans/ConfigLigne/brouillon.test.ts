import { patron } from "@afrimove/contrats";
import { describe, expect, it } from "vitest";
import {
  ajouterArret,
  ajouterDepart,
  basculerDepart,
  basculerOption,
  brouillonDepuis,
  changementsLocaux,
  changerHeure,
  changerTarif,
  erreursDuBrouillon,
  estDeplace,
  estPubliable,
  heureInitiale,
  nombreChangements,
  prixDepart,
  verifierArret,
  versModification,
} from "./brouillon";

type Ligne = patron.LigneEditable;

const SIGNATURE: patron.SignaturePin = {
  pin: "123456",
  methode: "pin",
  signeA: "2027-01-05T07:40:00.000+01:00",
};

function depart(
  id: string | null,
  heure: string,
  reste: Partial<patron.DepartEditable> = {},
): patron.DepartEditable {
  return {
    id,
    heure,
    heureInitiale: null,
    classe: "classique",
    prix: 3500,
    actif: true,
    note: null,
    jours: [],
    nouveau: false,
    ...reste,
  };
}

/** La ligne de la planche : un départ déjà déplacé (10:00 -> 09:15) et un départ du mardi, soit 2 changements en brouillon. */
function ligne(): Ligne {
  return {
    id: "ligne-alp-dlabaf",
    nom: "Douala → Bafoussam",
    departs: [
      depart("dep-0600", "06:00"),
      depart("dep-1000", "09:15", { heureInitiale: "10:00", note: "proposé par l'assistant" }),
      depart("dep-vip", "16:30", { classe: "vip", prix: 5000 }),
      depart(null, "17:00", { nouveau: true, jours: ["mar"], note: "marché" }),
    ],
    tarifs: { classique: 3500, vip: 5000, bagage: 1000 },
    arrets: [
      { nom: "Bafang", prorata: 2000, montee: true },
      { nom: "Mbouda", prorata: 2800, montee: true },
    ],
    plan: { capacite: 40, disposition: "2+2", rangees: 11 },
    options: { venteEnLigne: true, fusionAuto: false },
    brouillon: { modifications: 2, publicationA: "2027-01-11T00:00:00.000+01:00" },
  };
}

const depart1 = (b: ReturnType<typeof brouillonDepuis>, id: string) =>
  b.departs.find((d) => d.id === id)!;

describe("brouillonDepuis", () => {
  it("part de la ligne telle que l'API la renvoie, sans rien de changé sur l'écran", () => {
    const l = ligne();
    const b = brouillonDepuis(l);
    expect(b.departs.map((d) => d.heure)).toEqual(["06:00", "09:15", "16:30", "17:00"]);
    expect(b.tarifs).toEqual(l.tarifs);
    expect(b.options).toEqual(l.options);
    expect(changementsLocaux(b, l)).toBe(0);
    expect(nombreChangements(b, l)).toBe(2);
  });

  it("donne une clé distincte à chaque départ, même ajouté sur l'écran", () => {
    const b = brouillonDepuis(ligne());
    const cles = b.departs.map((d) => d.cle);
    expect(new Set(cles).size).toBe(cles.length);
  });

  it("ne partage rien avec la ligne : modifier le brouillon ne touche pas la lecture", () => {
    const l = ligne();
    const b = changerTarif(brouillonDepuis(l), "classique", 4000);
    expect(b.tarifs.classique).toBe(4000);
    expect(l.tarifs.classique).toBe(3500);
  });
});

describe("heure d'un départ", () => {
  it("un départ déplacé garde l'heure publiée comme « était »", () => {
    const b = brouillonDepuis(ligne());
    const d = depart1(b, "dep-1000");
    expect(heureInitiale(d)).toBe("10:00");
    expect(estDeplace(d)).toBe(true);
  });

  it("changer l'heure d'un départ publié marque l'ancienne heure ; la remettre l'efface", () => {
    let b = brouillonDepuis(ligne());
    b = changerHeure(b, "dep-0600", "06:30");
    expect(heureInitiale(depart1(b, "dep-0600"))).toBe("06:00");
    expect(estDeplace(depart1(b, "dep-0600"))).toBe(true);
    b = changerHeure(b, "dep-0600", "06:00");
    expect(heureInitiale(depart1(b, "dep-0600"))).toBeNull();
    expect(estDeplace(depart1(b, "dep-0600"))).toBe(false);
  });

  it("déplacer encore un départ déjà en brouillon garde l'heure publiée (10:00), pas l'heure intermédiaire", () => {
    const b = changerHeure(brouillonDepuis(ligne()), "dep-1000", "09:30");
    expect(heureInitiale(depart1(b, "dep-1000"))).toBe("10:00");
  });

  it("remettre un départ en brouillon à l'heure publiée supprime « était »", () => {
    const b = changerHeure(brouillonDepuis(ligne()), "dep-1000", "10:00");
    expect(heureInitiale(depart1(b, "dep-1000"))).toBeNull();
  });

  it("une heure en cours de frappe ne change pas « était »", () => {
    const b = changerHeure(brouillonDepuis(ligne()), "dep-0600", "06:");
    expect(heureInitiale(depart1(b, "dep-0600"))).toBeNull();
  });

  it("un départ nouveau n'a pas d'ancienne heure", () => {
    const b = brouillonDepuis(ligne());
    expect(heureInitiale(b.departs.find((d) => d.nouveau)!)).toBeNull();
  });
});

describe("tarifs et prix des départs", () => {
  it("le prix d'un départ suit le tarif de sa classe tant qu'il l'égalait à la lecture", () => {
    let b = brouillonDepuis(ligne());
    b = changerTarif(b, "classique", 4000);
    expect(prixDepart(b, depart1(b, "dep-0600"))).toBe(4000);
    expect(prixDepart(b, depart1(b, "dep-vip"))).toBe(5000);
    b = changerTarif(b, "vip", 6000);
    expect(prixDepart(b, depart1(b, "dep-vip"))).toBe(6000);
    expect(prixDepart(b, depart1(b, "dep-0600"))).toBe(4000);
  });

  it("un départ qui a son propre prix le garde quand le tarif change", () => {
    const l = ligne();
    l.departs[0] = depart("dep-0600", "06:00", { prix: 3000 });
    let b = brouillonDepuis(l);
    b = changerTarif(b, "classique", 4000);
    expect(prixDepart(b, depart1(b, "dep-0600"))).toBe(3000);
    expect(prixDepart(b, depart1(b, "dep-1000"))).toBe(4000);
  });

  it("un tarif vidé pendant la frappe ne met pas les prix à 0", () => {
    const b = changerTarif(brouillonDepuis(ligne()), "classique", null);
    expect(prixDepart(b, depart1(b, "dep-0600"))).toBe(3500);
  });
});

describe("ajouts", () => {
  it("« + départ » ajoute un départ classique au prix de la ligne, actif, sans heure", () => {
    const b = ajouterDepart(brouillonDepuis(ligne()), 1);
    const d = b.departs.at(-1)!;
    expect(b.departs).toHaveLength(5);
    expect(d).toMatchObject({
      id: null,
      heure: "",
      nouveau: true,
      actif: true,
      classe: "classique",
      jours: [],
      note: null,
    });
    expect(prixDepart(b, d)).toBe(3500);
    expect(d.cle).not.toBe(b.departs[0]!.cle);
  });

  it("deux ajouts de suite ont deux clés différentes", () => {
    let b = ajouterDepart(brouillonDepuis(ligne()), 1);
    b = ajouterDepart(b, 2);
    expect(new Set(b.departs.map((d) => d.cle)).size).toBe(5 + 1);
  });

  it("« + arrêt » ajoute l'arrêt sans prorata (calculé par l'API) avec la montée choisie", () => {
    const b = ajouterArret(brouillonDepuis(ligne()), "  Foumban ", false, 1);
    expect(b.arrets.at(-1)).toMatchObject({ nom: "Foumban", prorata: null, montee: false });
    expect(b.arrets).toHaveLength(3);
  });

  it("refuse un arrêt sans nom ou déjà sur la ligne, sans tenir compte des majuscules", () => {
    const b = brouillonDepuis(ligne());
    expect(verifierArret(b, "   ")).toBe("nom");
    expect(verifierArret(b, "bafang")).toBe("existe");
    expect(verifierArret(b, " MBOUDA ")).toBe("existe");
    expect(verifierArret(b, "Foumban")).toBeNull();
  });
});

describe("compte des changements", () => {
  it("compte ceux du brouillon de l'API, puis un par modification faite sur l'écran", () => {
    const l = ligne();
    let b = brouillonDepuis(l);
    expect(nombreChangements(b, l)).toBe(2);
    b = changerHeure(b, "dep-0600", "06:30");
    expect(nombreChangements(b, l)).toBe(3);
    b = basculerDepart(b, "dep-vip");
    expect(nombreChangements(b, l)).toBe(4);
    b = changerTarif(b, "bagage", 1500);
    expect(nombreChangements(b, l)).toBe(5);
    b = basculerOption(b, "fusionAuto");
    expect(nombreChangements(b, l)).toBe(6);
    b = ajouterDepart(b, 1);
    expect(nombreChangements(b, l)).toBe(7);
    b = ajouterArret(b, "Foumban", true, 1);
    expect(nombreChangements(b, l)).toBe(8);
  });

  it("annuler un changement le retire du compte", () => {
    const l = ligne();
    let b = changerHeure(brouillonDepuis(l), "dep-0600", "06:30");
    b = changerTarif(b, "vip", 5500);
    b = basculerOption(b, "venteEnLigne");
    expect(changementsLocaux(b, l)).toBe(3);
    b = changerHeure(b, "dep-0600", "06:00");
    b = changerTarif(b, "vip", 5000);
    b = basculerOption(b, "venteEnLigne");
    expect(changementsLocaux(b, l)).toBe(0);
  });

  it("une heure retapée sous une autre forme (« 6h30 ») compte comme la même heure", () => {
    const l = ligne();
    const b = changerHeure(brouillonDepuis(l), "dep-0600", "6h00");
    expect(changementsLocaux(b, l)).toBe(0);
  });
});

describe("contrôle avant publication", () => {
  it("le brouillon de la planche est publiable", () => {
    const b = brouillonDepuis(ligne());
    expect(estPubliable(erreursDuBrouillon(b))).toBe(true);
  });

  it("un départ ajouté sans heure ou avec une heure impossible empêche de publier", () => {
    let b = ajouterDepart(brouillonDepuis(ligne()), 1);
    const nouvelle = b.departs.at(-1)!.cle;
    expect(erreursDuBrouillon(b).departs).toEqual([nouvelle]);
    b = changerHeure(b, nouvelle, "25:70");
    expect(erreursDuBrouillon(b).departs).toEqual([nouvelle]);
    b = changerHeure(b, nouvelle, "7h30");
    expect(erreursDuBrouillon(b).departs).toEqual([]);
    expect(estPubliable(erreursDuBrouillon(b))).toBe(true);
  });

  it("un tarif vide empêche de publier", () => {
    const b = changerTarif(brouillonDepuis(ligne()), "vip", null);
    expect(erreursDuBrouillon(b).tarifs).toEqual(["vip"]);
    expect(estPubliable(erreursDuBrouillon(b))).toBe(false);
  });
});

describe("versModification : le corps signé de la publication", () => {
  it("envoie la ligne entière : départs, tarifs, arrêts sans prorata, plan, options, jour d'effet et signature", () => {
    const l = ligne();
    let b = brouillonDepuis(l);
    b = changerHeure(b, "dep-0600", "6h30");
    b = changerTarif(b, "classique", 4000);
    b = basculerOption(b, "fusionAuto");
    b = ajouterArret(b, "Foumban", false, 1);
    b = ajouterDepart(b, 2);
    b = changerHeure(b, b.departs.at(-1)!.cle, "20:00");

    const corps = versModification(b, l, SIGNATURE, "2027-01-11");

    expect(corps.ligneId).toBe("ligne-alp-dlabaf");
    expect(corps.effetDu).toBe("2027-01-11");
    expect(corps.signature).toEqual(SIGNATURE);
    expect(corps.tarifs).toEqual({ classique: 4000, vip: 5000, bagage: 1000 });
    expect(corps.options).toEqual({ venteEnLigne: true, fusionAuto: true });
    expect(corps.plan).toEqual(l.plan);
    expect(corps.arrets).toEqual([
      { nom: "Bafang", montee: true },
      { nom: "Mbouda", montee: true },
      { nom: "Foumban", montee: false },
    ]);
    expect(corps.departs).toEqual([
      depart("dep-0600", "06:30", { heureInitiale: "06:00", prix: 4000 }),
      depart("dep-1000", "09:15", {
        heureInitiale: "10:00",
        prix: 4000,
        note: "proposé par l'assistant",
      }),
      depart("dep-vip", "16:30", { classe: "vip", prix: 5000 }),
      depart(null, "17:00", { nouveau: true, jours: ["mar"], note: "marché", prix: 4000 }),
      depart(null, "20:00", { nouveau: true, prix: 4000 }),
    ]);
  });

  it("le corps est accepté par le contrat de l'API (schéma strict, signature obligatoire)", () => {
    const l = ligne();
    const corps = versModification(brouillonDepuis(l), l, SIGNATURE, "2027-01-11");
    expect(patron.ModifierLigneSchema.safeParse(corps).success).toBe(true);
  });

  it("un départ désactivé est envoyé inactif", () => {
    const l = ligne();
    const b = basculerDepart(brouillonDepuis(l), "dep-0600");
    const corps = versModification(b, l, SIGNATURE, "2027-01-11");
    expect(corps.departs![0]).toMatchObject({ id: "dep-0600", actif: false });
    expect(corps.departs![1]).toMatchObject({ id: "dep-1000", actif: true });
  });
});

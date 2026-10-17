import { voyageur } from "@afrimove/contrats";
import { describe, expect, it } from "vitest";
import type { Reservation, Trajet } from "./modeles";
import {
  corps,
  lireCreerTrajetRegulier,
  lireDefinirTrajetRegulier,
  lireProposition,
  lirePublierTrajet,
  lireRechercheCovoit,
  lireRechercheVille,
  lireReserver,
  type Requete,
} from "./requetes";
import { commandeVue, conducteurVue, offreCovoitVue, trajetPublieVue } from "./vues";

/**
 * Les lecteurs de requêtes et les vues du serveur doivent dire la même chose que les schémas zod de
 * `@afrimove/contrats` (ce que les applications utilisent). Un champ renommé d'un côté seulement fait
 * échouer ces tests. Les routes complètes sont comparées aux schémas dans `covoiturage.e2e.test.ts`.
 */

const accepte = (lecteur: Parameters<typeof corps>[0], brut: unknown): boolean => {
  try {
    corps(lecteur, brut);
    return true;
  } catch {
    return false;
  }
};

const lit = (q: Requete, lecteur: (q: Requete) => unknown): boolean => {
  try {
    lecteur(q);
    return true;
  } catch {
    return false;
  }
};

const ISO = "2027-01-06T08:30:00.000+01:00";

const essaisReserver: unknown[] = [
  { places: 1 },
  { places: 3 },
  { places: 0 },
  { places: -1 },
  { places: 1.5 },
  { places: "2" },
  {},
  null,
  "texte",
];

describe("corps de POST /voyageur/covoit/:offreId/reservations", () => {
  it.each(essaisReserver.map((e) => [JSON.stringify(e), e] as const))(
    "même verdict que SchemaReserverCovoit : %s",
    (_nom, brut) => {
      const zod = voyageur.SchemaReserverCovoit.omit({ offreId: true }).safeParse(brut).success;
      expect(accepte(lireReserver, brut)).toBe(zod);
    },
  );
});

const lieu = { ville: "Douala", point: "Bonapriso" };
const essaisPublier: unknown[] = [
  {
    depart: lieu,
    arrivee: { ville: "Kribi", point: "Centre" },
    departA: ISO,
    places: 2,
    prixParPlace: 4000,
    options: ["clim"],
  },
  { depart: lieu, arrivee: lieu, departA: ISO, places: 1, prixParPlace: 0, options: [] },
  {
    depart: lieu,
    arrivee: lieu,
    departA: ISO,
    places: 1,
    prixParPlace: 500,
    options: [],
    regulier: true,
  },
  {
    depart: lieu,
    arrivee: lieu,
    departA: ISO,
    places: 1,
    prixParPlace: 500,
    options: [],
    regulier: "oui",
  },
  {
    depart: lieu,
    arrivee: lieu,
    departA: "2027-01-06T07:30:00.000Z",
    places: 1,
    prixParPlace: 500,
    options: [],
  },
  {
    depart: lieu,
    arrivee: lieu,
    departA: "2027-01-06T08:30:00",
    places: 1,
    prixParPlace: 500,
    options: [],
  },
  { depart: lieu, arrivee: lieu, departA: ISO, places: 0, prixParPlace: 500, options: [] },
  { depart: lieu, arrivee: lieu, departA: ISO, places: 1, prixParPlace: 500.5, options: [] },
  { depart: lieu, arrivee: lieu, departA: ISO, places: 1, prixParPlace: -5, options: [] },
  { depart: lieu, arrivee: lieu, departA: ISO, places: 1, prixParPlace: 500 },
  { depart: lieu, arrivee: lieu, departA: ISO, places: 1, prixParPlace: 500, options: [1] },
  { depart: "Douala", arrivee: lieu, departA: ISO, places: 1, prixParPlace: 500, options: [] },
  {
    depart: { ville: "Douala" },
    arrivee: lieu,
    departA: ISO,
    places: 1,
    prixParPlace: 500,
    options: [],
  },
  {},
  null,
];

describe("corps de POST /voyageur/covoit/conducteur/trajets", () => {
  it.each(essaisPublier.map((e) => [JSON.stringify(e), e] as const))(
    "même verdict que SchemaPublierTrajet : %s",
    (_nom, brut) => {
      const zod = voyageur.SchemaPublierTrajet.safeParse(brut).success;
      expect(accepte(lirePublierTrajet, brut)).toBe(zod);
    },
  );
});

describe("autres corps", () => {
  it.each([{ trajetId: "t1" }, { trajetId: "" }, { trajetId: 3 }, {}])(
    "proposition : même verdict que SchemaProposerADemande : %j",
    (brut) => {
      const zod = voyageur.SchemaProposerADemande.omit({ demandeId: true }).safeParse(brut).success;
      expect(accepte(lireProposition, brut)).toBe(zod);
    },
  );

  it.each([{ actif: true }, { actif: false }, { actif: "oui" }, {}, null])(
    "trajet régulier : même verdict que SchemaDefinirTrajetRegulier : %j",
    (brut) => {
      const zod = voyageur.SchemaDefinirTrajetRegulier.safeParse(brut).success;
      expect(accepte(lireDefinirTrajetRegulier, brut)).toBe(zod);
    },
  );

  it("création d'un trajet régulier : heure HH:MM seulement", () => {
    const base = { ville: "Douala", depart: "Akwa", arrivee: "Bonabéri" };
    expect(accepte(lireCreerTrajetRegulier, { ...base, departA: "07:00" })).toBe(true);
    expect(accepte(lireCreerTrajetRegulier, { ...base, departA: "7:00" })).toBe(false);
    expect(accepte(lireCreerTrajetRegulier, { ...base, departA: "24:00" })).toBe(false);
    expect(accepte(lireCreerTrajetRegulier, { ...base, departA: "07:60" })).toBe(false);
  });
});

describe("paramètres de GET /voyageur/covoit", () => {
  const cas: { requete: Requete; valeur: voyageur.RechercheCovoit }[] = [
    {
      requete: { depart: "Douala", arrivee: "Kribi" },
      valeur: { depart: "Douala", arrivee: "Kribi" },
    },
    {
      requete: { depart: "Douala", arrivee: "Kribi", filtres: "clim,femmes", prixMax: "4000" },
      valeur: { depart: "Douala", arrivee: "Kribi", filtres: ["clim", "femmes"], prixMax: 4000 },
    },
    {
      requete: { depart: "DLA", arrivee: "KRB", apartirDe: ISO },
      valeur: { depart: "DLA", arrivee: "KRB", apartirDe: ISO },
    },
  ];

  it.each(cas.map((c) => [JSON.stringify(c.requete), c] as const))(
    "lit ce que le client envoie : %s",
    (_nom, { requete, valeur }) => {
      expect(voyageur.SchemaRechercheCovoit.safeParse(valeur).success).toBe(true);
      const lu = lireRechercheCovoit(requete);
      expect(lu).toMatchObject({
        depart: valeur.depart,
        arrivee: valeur.arrivee,
        apartirDe: valeur.apartirDe,
        filtres: valeur.filtres,
        prixMax: valeur.prixMax,
      });
    },
  );

  it("refuse l'essentiel de travers", () => {
    expect(lit({ arrivee: "Kribi" }, lireRechercheCovoit)).toBe(false);
    expect(lit({ depart: "Douala" }, lireRechercheCovoit)).toBe(false);
    expect(lit({ depart: "Douala", arrivee: "Kribi", filtres: "wifi" }, lireRechercheCovoit)).toBe(
      false,
    );
    expect(lit({ depart: "Douala", arrivee: "Kribi", prixMax: "abc" }, lireRechercheCovoit)).toBe(
      false,
    );
    expect(
      lit({ depart: "Douala", arrivee: "Kribi", apartirDe: "demain" }, lireRechercheCovoit),
    ).toBe(false);
    expect(
      lit({ depart: "Douala", arrivee: "Kribi", filtres: ["clim", "femmes"] }, lireRechercheCovoit),
    ).toBe(false);
  });

  it("filtres = ceux du contrat", () => {
    for (const f of voyageur.SchemaFiltreCovoit.options) {
      expect(lit({ depart: "a", arrivee: "b", filtres: f }, lireRechercheCovoit)).toBe(true);
    }
  });
});

describe("paramètres de GET /voyageur/ville/offres", () => {
  it("lit ce que le client envoie", () => {
    expect(
      lireRechercheVille({ ville: "Douala", quand: "dans_1h", types: "covoiturage,moto_taxi" }),
    ).toMatchObject({
      ville: "Douala",
      quand: "dans_1h",
      types: ["covoiturage", "moto_taxi"],
    });
    for (const q of voyageur.SchemaQuand.options) {
      expect(lit({ ville: "Douala", quand: q }, lireRechercheVille)).toBe(true);
    }
    for (const t of voyageur.SchemaTypeOffreVille.options) {
      expect(lit({ ville: "Douala", types: t }, lireRechercheVille)).toBe(true);
    }
    expect(lit({ ville: "Douala", quand: "hier" }, lireRechercheVille)).toBe(false);
    expect(lit({ quand: "maintenant" }, lireRechercheVille)).toBe(false);
  });
});

/* ------------------------------------------------------------------ vues */

const T0 = new Date("2027-01-05T07:00:00.000Z");

const trajet: Trajet = {
  id: "t1",
  conducteurId: "c1",
  type: "entre_villes",
  departVille: "Douala",
  departPoint: "Bonapriso, pharmacie du Rond-point",
  arriveeVille: "Kribi",
  arriveePoint: "Kribi centre",
  departA: new Date("2027-01-06T07:30:00.000Z"),
  dureeMinutes: 150,
  places: 2,
  prixParPlace: 4000,
  options: ["clim"],
  vehicule: "Toyota Corolla grise",
  immatriculation: "LT 882 CE",
  grandBagage: false,
  regulier: false,
  suivantCreeA: null,
  statut: "publie",
  creeA: T0,
  annuleA: null,
};

const reservation: Reservation = {
  id: "r1",
  trajetId: "t1",
  conducteurId: "c1",
  passagerId: "p1",
  places: 2,
  prixParPlace: 4000,
  fraisParPlace: 250,
  libelle: "Covoiturage Samuel · Douala → Kribi · 08:30",
  statut: "en_attente_paiement",
  creeA: T0,
  expireA: new Date(T0.getTime() + 15 * 60_000),
  payeeA: null,
  moyenPaiement: null,
  departA: trajet.departA,
  liberationAutoA: new Date("2027-01-06T12:00:00.000Z"),
  libereeA: null,
  motifLiberation: null,
  annuleeA: null,
  annulePar: null,
  remboursement: null,
  retenue: 0,
};

describe("vues du serveur = schémas du contrat", () => {
  const conducteur = conducteurVue("c1", "Samuel Ekambi", true, { note: 4.9, trajets: 112 });

  it("conducteur", () => {
    expect(voyageur.SchemaConducteurCovoit.parse(conducteur)).toEqual({
      id: "c1",
      nom: "Samuel E.",
      initiales: "SE",
      verifie: true,
      note: 4.9,
      trajets: 112,
    });
    // sans note, la note est absente (et non nulle)
    const neuf = conducteurVue("c2", "Marthe N", true, { note: null, trajets: 0 });
    expect(voyageur.SchemaConducteurCovoit.parse(neuf)).not.toHaveProperty("note");
  });

  it("offre", () => {
    const offre = voyageur.SchemaOffreCovoit.parse(
      offreCovoitVue(trajet, 2, conducteur, "Samuel Ekambi"),
    );
    expect(offre).toMatchObject({
      id: "t1",
      placesLibres: 2,
      prixParPlace: 4000,
      departA: "2027-01-06T08:30:00.000+01:00",
      arriveeEstimee: "2027-01-06T11:00:00.000+01:00",
      lieuDepart: "Bonapriso, pharmacie du Rond-point",
      clim: true,
      femmesBienvenues: false,
      grandBagage: false,
      garantie: "Payé dans l'app · remboursé si Samuel annule",
    });
  });

  it("commande à payer : deux lignes, 250 F de frais par place", () => {
    const c = voyageur.SchemaCommande.parse(commandeVue(reservation, T0));
    expect(c).toMatchObject({
      id: "r1",
      type: "covoiturage",
      total: 8500,
      statut: "en_attente_paiement",
      billetIds: [],
      creeeA: "2027-01-05T08:00:00.000+01:00",
      expireA: "2027-01-05T08:15:00.000+01:00",
    });
    expect(c.lignes.map((l) => [l.code, l.montant])).toEqual([
      ["places", 8000],
      ["frais_voyageur", 500],
    ]);
  });

  it("commande dont la retenue est écoulée : expirée même si le balayage n'est pas passé", () => {
    const tard = new Date(T0.getTime() + 16 * 60_000);
    expect(commandeVue(reservation, tard).statut).toBe("expiree");
    expect(commandeVue({ ...reservation, statut: "payee" }, tard).statut).toBe("payee");
    expect(commandeVue({ ...reservation, statut: "terminee" }, tard).statut).toBe("payee");
    expect(commandeVue({ ...reservation, statut: "annulee" }, T0).statut).toBe("annulee");
  });

  it("trajet publié", () => {
    const publie = voyageur.SchemaTrajetPublie.parse(
      trajetPublieVue(trajet, [{ passager: "Aïcha N.", places: 1, montantPaye: 4000 }], 240),
    );
    expect(publie).toMatchObject({
      id: "t1",
      depart: "Douala",
      arrivee: "Kribi",
      places: 2,
      placesReservees: 1,
      visiblePar: 240,
    });
  });
});

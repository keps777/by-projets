import type { patron } from "@afrimove/contrats";
import { describe, expect, it } from "vitest";
import {
  CLES_DROITS,
  DROITS_PAR_ROLE,
  ROLES,
  basculerDroit,
  brouillonDepuis,
  brouillonVide,
  champsModifies,
  changerRole,
  erreursDuBrouillon,
  estEnregistrable,
  exceptions,
  versCreation,
  versModification,
} from "./brouillon";

const SIGNATURE: patron.SignaturePin = {
  pin: "123456",
  methode: "pin",
  signeA: "2027-01-05T07:38:00.000+01:00",
};

const JOSEPH: patron.PersonneEditable = {
  id: "pers-joseph",
  nom: "Joseph Mbappé",
  telephone: "+237677123423",
  operateur: "MTN",
  role: "guichetier",
  gareId: "gare-alp-dla",
  guichet: "2",
  salaire: 95000,
  depuis: "2027-01-05",
  actif: true,
  droits: { ...DROITS_PAR_ROLE.guichetier },
};

describe("droits par défaut des rôles", () => {
  it("le guichetier a ceux de la planche : vendre et cadence, ni annuler sans PIN ni voir les autres caisses", () => {
    expect(DROITS_PAR_ROLE.guichetier).toEqual({
      vendreBilletsEtColis: true,
      annulerSansPinSuperviseur: false,
      modeCadence: true,
      voirCaissesDesAutres: false,
    });
  });

  it("chaque rôle a ses quatre droits, et seul le superviseur annule sans PIN du superviseur", () => {
    for (const role of ROLES) {
      expect(Object.keys(DROITS_PAR_ROLE[role]).sort()).toEqual([...CLES_DROITS].sort());
    }
    expect(ROLES.filter((r) => DROITS_PAR_ROLE[r].annulerSansPinSuperviseur)).toEqual([
      "superviseur",
    ]);
  });
});

describe("brouillon", () => {
  it("une fiche existante donne un brouillon qui n'a rien changé, donc rien à signer", () => {
    const b = brouillonDepuis(JOSEPH);
    expect(b).toMatchObject({
      nom: "Joseph Mbappé",
      telephone: "6 77 12 34 23",
      gareId: "gare-alp-dla",
      guichet: "2",
      salaire: "95 000",
    });
    expect(estEnregistrable(erreursDuBrouillon(b))).toBe(true);
    expect(champsModifies(b, JOSEPH)).toEqual({});
    expect(exceptions(b)).toEqual([]);
  });

  it("une nouvelle personne est vide, invalide, et porte les droits du guichetier", () => {
    const b = brouillonVide();
    expect(erreursDuBrouillon(b)).toEqual({
      nom: true,
      telephone: true,
      gare: true,
      guichet: true,
      salaire: true,
    });
    expect(b.droits).toEqual(DROITS_PAR_ROLE.guichetier);
  });

  it("changer le rôle remet ses droits par défaut, efface les exceptions et lâche le guichet", () => {
    const avecException = basculerDroit(brouillonDepuis(JOSEPH), "annulerSansPinSuperviseur");
    expect(exceptions(avecException)).toEqual(["annulerSansPinSuperviseur"]);

    const superviseur = changerRole(avecException, "superviseur");
    expect(superviseur.droits).toEqual(DROITS_PAR_ROLE.superviseur);
    expect(superviseur.guichet).toBe("");
    expect(exceptions(superviseur)).toEqual([]);

    // Revenir au guichetier ne rend pas le guichet : il est à choisir de nouveau.
    expect(changerRole(superviseur, "guichetier").guichet).toBe("");
  });

  it("une exception se compte par rapport aux droits du rôle courant", () => {
    const chauffeur = changerRole(brouillonDepuis(JOSEPH), "chauffeur");
    expect(exceptions(chauffeur)).toEqual([]);
    const vendeur = basculerDroit(chauffeur, "vendreBilletsEtColis");
    expect(exceptions(vendeur)).toEqual(["vendreBilletsEtColis"]);
    expect(exceptions(basculerDroit(vendeur, "vendreBilletsEtColis"))).toEqual([]);
  });

  it("la gare est obligatoire pour un guichetier et un superviseur, le guichet pour le seul guichetier", () => {
    const base = { ...brouillonVide(), nom: "A", telephone: "677123423", salaire: "1" };
    expect(erreursDuBrouillon(base)).toMatchObject({ gare: true, guichet: true });
    expect(erreursDuBrouillon(changerRole(base, "superviseur"))).toMatchObject({
      gare: true,
      guichet: false,
    });
    for (const role of ["convoyeur", "chauffeur", "relais", "comptable"] as const) {
      expect(estEnregistrable(erreursDuBrouillon(changerRole(base, role))), role).toBe(true);
    }
  });

  it("un nom d'espaces ou un numéro à 8 chiffres sont refusés", () => {
    const b = { ...brouillonDepuis(JOSEPH), nom: "   ", telephone: "6 77 12 34 2" };
    expect(erreursDuBrouillon(b)).toMatchObject({ nom: true, telephone: true });
  });
});

describe("vers l'API", () => {
  it("la création envoie tous les champs au format du contrat, le nom nettoyé", () => {
    const b = {
      ...brouillonVide(),
      nom: " Aïcha Ngo ",
      telephone: "6 91 22 10 08",
      operateur: "Orange" as const,
      gareId: "gare-alp-yde",
      guichet: "nuit",
      salaire: "80 000",
    };
    expect(versCreation(b, SIGNATURE)).toEqual({
      champs: {
        nom: "Aïcha Ngo",
        telephone: "+237691221008",
        operateur: "Orange",
        role: "guichetier",
        gareId: "gare-alp-yde",
        guichet: "nuit",
        salaire: 80000,
        droits: DROITS_PAR_ROLE.guichetier,
      },
      signature: SIGNATURE,
    });
  });

  it("un rôle sans guichet part avec `guichet: null`, une gare vide avec `gareId: null`", () => {
    const b = changerRole(
      { ...brouillonVide(), nom: "Paul", telephone: "677000040", salaire: "70 000" },
      "comptable",
    );
    expect(versCreation(b, SIGNATURE).champs).toMatchObject({ guichet: null, gareId: null });
  });

  it("la modification n'envoie que ce qui a changé, avec l'identifiant de la personne et la signature", () => {
    const b = {
      ...brouillonDepuis(JOSEPH),
      salaire: "100 000",
      telephone: "677123499",
      guichet: "3",
    };
    expect(versModification(b, JOSEPH, SIGNATURE)).toEqual({
      personneId: "pers-joseph",
      champs: { salaire: 100000, telephone: "+237677123499", guichet: "3" },
      signature: SIGNATURE,
    });
  });

  it("une écriture du numéro autrement (mêmes chiffres) n'est pas un changement", () => {
    const b = { ...brouillonDepuis(JOSEPH), telephone: "+237 677 123 423", salaire: "95000" };
    expect(champsModifies(b, JOSEPH)).toEqual({});
  });

  it("une exception envoie les quatre droits d'un bloc", () => {
    const b = basculerDroit(brouillonDepuis(JOSEPH), "voirCaissesDesAutres");
    expect(champsModifies(b, JOSEPH)).toEqual({
      droits: { ...DROITS_PAR_ROLE.guichetier, voirCaissesDesAutres: true },
    });
  });

  it("une personne dont le numéro est étranger le garde si on n'y touche pas", () => {
    const etrangere = { ...JOSEPH, telephone: "+15145550142" };
    const b = brouillonDepuis(etrangere);
    expect(b.telephone).toBe("+15145550142");
    expect(champsModifies(b, etrangere)).toEqual({});
  });
});

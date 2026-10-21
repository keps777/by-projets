import * as contrats from "@afrimove/contrats";
import { describe, expect, it } from "vitest";
import { ISO_ESSAIS, SIGNATURE_ESSAIS, UUID_ESSAIS, variantes } from "../caisse/testing/mutations";
import {
  DECISIONS,
  OPTIONS_DEBLOCAGE,
  lireAppareilDebloque,
  TYPES_AVEC_VALIDATION,
  lireAffectation,
  lireCompteDesactive,
  lireDecisionAnnulation,
  lireDemandeAnnulation,
  lirePersonneDebloquee,
  lirePinRenouvele,
  lireRefusCaisse,
  lireValidationCaisse,
} from "./evenements";
import { ROLES_EQUIPE } from "./ports";

/**
 * Les écritures de la supervision sont relues à la main par l'API (zod n'est pas importable à
 * l'exécution) : ces tests les comparent aux schémas du contrat `@afrimove/contrats`.
 */

const c = contrats.agence;

const validePar = {
  superviseurId: "sup-1",
  methode: "pin",
  signature: "0123456789abcdef".repeat(4) + "01234567",
};

const enveloppe = (type: string, donnees: unknown, cible: { type: string; id: string }) => ({
  id: "00000000-0000-4000-8000-000000000001",
  type,
  at: "2026-11-02T09:00:00.000+01:00",
  appareilId: "SUP-DLA",
  auteurId: "sup-1",
  cible,
  numeroPlage: null,
  donnees,
});

const personne = { type: "personne", id: "p1" };

interface DefinitionContrat {
  type: string;
  donnees: { shape: Record<string, unknown> };
}

/** Toutes les définitions d'événements exportées par le contrat de l'agence. */
function definitionsDuContrat(): DefinitionContrat[] {
  return (Object.values(c) as unknown[]).filter(
    (e): e is DefinitionContrat =>
      typeof e === "object" && e !== null && "type" in e && "donnees" in e && "numerote" in e,
  );
}

const cas = [
  {
    nom: "annulation.demandee",
    schema: c.EVENEMENT_ANNULATION_DEMANDEE.schema,
    lire: lireDemandeAnnulation,
    valide: enveloppe(
      "annulation.demandee",
      { demandeId: "d1", billetId: "b1", motif: "Doublon" },
      { type: "demande", id: "d1" },
    ),
  },
  {
    nom: "annulation.decidee",
    schema: c.EVENEMENT_ANNULATION_DECIDEE.schema,
    lire: lireDecisionAnnulation,
    valide: enveloppe(
      "annulation.decidee",
      { demandeId: "d1", billetId: "b1", decision: "rembourser", montant: 7_500, validePar },
      { type: "demande", id: "d1" },
    ),
  },
  {
    nom: "caisse.validee",
    schema: c.EVENEMENT_CAISSE_VALIDEE.schema,
    lire: lireValidationCaisse,
    valide: enveloppe(
      "caisse.validee",
      { sessionId: "s1", ecart: -500, commentaire: "RAS", validePar },
      { type: "session", id: "s1" },
    ),
  },
  {
    nom: "caisse.refusee",
    schema: c.EVENEMENT_CAISSE_REFUSEE.schema,
    lire: lireRefusCaisse,
    valide: enveloppe(
      "caisse.refusee",
      { sessionId: "s1", motif: "Recomptez", validePar },
      { type: "session", id: "s1" },
    ),
  },
  {
    nom: "equipe.pin_renouvele",
    schema: c.EVENEMENT_EQUIPE_PIN_RENOUVELE.schema,
    lire: lirePinRenouvele,
    valide: enveloppe("equipe.pin_renouvele", { personneId: "p1", validePar }, personne),
  },
  {
    nom: "equipe.affectation_changee",
    schema: c.EVENEMENT_EQUIPE_AFFECTATION_CHANGEE.schema,
    lire: lireAffectation,
    valide: enveloppe(
      "equipe.affectation_changee",
      { personneId: "p1", guichetId: "g3", role: "controleur", validePar },
      personne,
    ),
  },
  {
    nom: "equipe.compte_desactive",
    schema: c.EVENEMENT_EQUIPE_COMPTE_DESACTIVE.schema,
    lire: lireCompteDesactive,
    valide: enveloppe("equipe.compte_desactive", { personneId: "p1", validePar }, personne),
  },
  {
    nom: "appareil.debloque",
    schema: c.EVENEMENT_APPAREIL_DEBLOQUE.schema,
    lire: lireAppareilDebloque,
    valide: enveloppe(
      "appareil.debloque",
      { appareilId: "appareil-guichet-3", option: "debloquer_4h", validePar },
      { type: "appareil", id: "appareil-guichet-3" },
    ),
  },
  {
    nom: "equipe.personne_debloquee",
    schema: c.EVENEMENT_EQUIPE_PERSONNE_DEBLOQUEE.schema,
    lire: lirePersonneDebloquee,
    valide: enveloppe("equipe.personne_debloquee", { personneId: "p1", validePar }, personne),
  },
];

describe("listes de la supervision : mêmes valeurs que le contrat", () => {
  it("décisions d'annulation et rôles de l'équipe", () => {
    expect([...DECISIONS]).toEqual(c.SchemaDecisionAnnulation.options);
    expect([...ROLES_EQUIPE]).toEqual(c.SchemaRoleEquipe.options);
    expect([...OPTIONS_DEBLOCAGE]).toEqual(c.SchemaOptionDeblocage.options);
  });

  it("les événements qui exigent le PIN d'un superviseur sont ceux dont le contrat porte validePar", () => {
    const duContrat = definitionsDuContrat()
      .filter((e) => "validePar" in e.donnees.shape)
      .map((e) => e.type)
      .sort();
    expect(duContrat).toEqual([...TYPES_AVEC_VALIDATION].sort());
  });

  it("tous les événements de la supervision du contrat ont un lecteur", () => {
    const types = cas.map((x) => x.nom).sort();
    const duContrat = definitionsDuContrat()
      .map((e) => e.type)
      .filter((t) =>
        /^(annulation|equipe)\.|^caisse\.(validee|refusee)$|^appareil\.debloque$/.test(t),
      )
      .sort();
    expect(types).toEqual(duContrat);
  });
});

for (const { nom, schema, lire, valide } of cas) {
  describe(`événement ${nom} : le lecteur fait comme le schéma zod du contrat`, () => {
    const accepte = (v: unknown) => {
      try {
        lire(v);
        return true;
      } catch {
        return false;
      }
    };

    it("accepte un événement valide", () => {
      expect(schema.safeParse(valide).success).toBe(true);
      expect(accepte(valide)).toBe(true);
    });

    it("refuse tout ce que le contrat refuse, champ par champ", () => {
      const divergences: string[] = [];
      let refuses = 0;
      for (const { nom: variante, valeur } of variantes(valide)) {
        const zod = schema.safeParse(valeur).success;
        const lecteur = accepte(valeur);
        if (!zod) refuses += 1;
        if (zod !== lecteur) divergences.push(`${variante} : contrat ${zod}, lecteur ${lecteur}`);
      }
      expect(refuses).toBeGreaterThan(20);
      expect(divergences).toEqual([]);
    });

    it("même verdict sur les identifiants, les heures et la cible", () => {
      for (const id of UUID_ESSAIS) {
        const e = { ...valide, id };
        expect(accepte(e), `id ${id}`).toBe(schema.safeParse(e).success);
      }
      for (const at of ISO_ESSAIS) {
        const e = { ...valide, at };
        expect(accepte(e), `at ${at}`).toBe(schema.safeParse(e).success);
      }
      for (const type of ["session", "billet", "demande", "personne", "autre"]) {
        const e = { ...valide, cible: { type, id: "x" } };
        expect(accepte(e), `cible ${type}`).toBe(schema.safeParse(e).success);
      }
    });

    it("refuse un autre type et un numéro de plage", () => {
      expect(accepte({ ...valide, type: "caisse.ouverte" })).toBe(false);
      expect(accepte({ ...valide, numeroPlage: 7 })).toBe(false);
    });
  });
}

describe("validePar (preuve du superviseur) : même verdict que le contrat", () => {
  const evenement = cas.find((x) => x.nom === "caisse.validee")!;
  const verdicts = (donneesValidePar: unknown) => {
    const e = {
      ...evenement.valide,
      donnees: { ...(evenement.valide.donnees as object), validePar: donneesValidePar },
    };
    let lecteur = true;
    try {
      evenement.lire(e);
    } catch {
      lecteur = false;
    }
    return { contrat: evenement.schema.safeParse(e).success, lecteur };
  };

  it("signature : hexadécimale en minuscules, 16 caractères au moins", () => {
    for (const signature of SIGNATURE_ESSAIS) {
      const v = verdicts({ ...validePar, signature });
      expect(v.lecteur, `signature « ${signature.slice(0, 20)} »`).toBe(v.contrat);
    }
  });

  it("méthode : « pin » ou « empreinte » ; le lecteur lit les deux, le serveur n'accepte que le PIN", () => {
    for (const methode of ["pin", "empreinte", "visage", "", 3, null]) {
      const v = verdicts({ ...validePar, methode });
      expect(v.lecteur, `méthode ${String(methode)}`).toBe(v.contrat);
    }
  });

  it("superviseurId : un texte non vide", () => {
    for (const superviseurId of ["sup-1", "", 3, null, undefined]) {
      const v = verdicts({ ...validePar, superviseurId });
      expect(v.lecteur, `superviseurId ${String(superviseurId)}`).toBe(v.contrat);
    }
  });
});

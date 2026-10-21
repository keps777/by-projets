import { patron } from "@afrimove/contrats";
import { describe, expect, it } from "vitest";
import {
  lireChangerMomo,
  lireConfirmationMomo,
  lireCreerPersonne,
  lireEnregistrerRegles,
  lireModifierPersonne,
  lirePersonneVisee,
} from "./validation";

/**
 * Les lecteurs de l'API et les schémas des contrats doivent s'accorder : ce que le contrat accepte (dans
 * les bornes de l'API), le lecteur l'accepte ; ce que le contrat refuse, le lecteur le refuse.
 */

const signature = { pin: "482915", methode: "pin", signeA: "2026-11-02T09:00:00.000+01:00" };
const droits = {
  vendreBilletsEtColis: true,
  annulerSansPinSuperviseur: false,
  modeCadence: false,
  voirCaissesDesAutres: false,
};
const champs = {
  nom: "Alice",
  telephone: "+237677112233",
  operateur: "MTN",
  role: "guichetier",
  gareId: "g1",
  guichet: "1",
  salaire: 85000,
  droits,
};
const regles = {
  annulation: {
    gratuiteJusqua: "1h_avant",
    retenue: "selon_classe",
    retenueParClassePct: { classique: 25, vip: 50 },
  },
  caisse: { toleranceEcart: 1000, auDela: "pin_superviseur" },
  cadence: { numeroObligatoire: false },
  fraisService: { montant: 250, priseEnChargeParAgence: false },
};

interface Cas {
  nom: string;
  schema: { safeParse: (v: unknown) => { success: boolean } };
  lire: (v: unknown) => unknown;
  valide: Record<string, unknown>;
  /** Modifications qui rendent le corps invalide. */
  invalides: Array<[string, (c: Record<string, unknown>) => Record<string, unknown>]>;
}

const sans = (cle: string) => (c: Record<string, unknown>) => {
  const { [cle]: _, ...reste } = c;
  return reste;
};
const avec = (extra: Record<string, unknown>) => (c: Record<string, unknown>) => ({
  ...c,
  ...extra,
});

const CAS: Cas[] = [
  {
    nom: "CreerPersonne",
    schema: patron.CreerPersonneSchema,
    lire: lireCreerPersonne,
    valide: { champs, signature },
    invalides: [
      ["téléphone sans +", avec({ champs: { ...champs, telephone: "677112233" } })],
      ["rôle inconnu", avec({ champs: { ...champs, role: "patron" } })],
      ["opérateur inconnu", avec({ champs: { ...champs, operateur: "Moov" } })],
      ["droit manquant", avec({ champs: { ...champs, droits: { vendreBilletsEtColis: true } } })],
      ["champ en trop", avec({ champs: { ...champs, mdp: "x" } })],
      ["nom vide", avec({ champs: { ...champs, nom: "" } })],
    ],
  },
  {
    nom: "ModifierPersonne",
    schema: patron.ModifierPersonneSchema,
    lire: lireModifierPersonne,
    valide: { personneId: "p1", champs: { salaire: 90000 }, signature },
    invalides: [
      ["salaire négatif", avec({ champs: { salaire: -5 } })],
      ["champ inconnu", avec({ champs: { age: 3 } })],
      ["sans personneId", sans("personneId")],
    ],
  },
  {
    nom: "DesactiverPersonne",
    schema: patron.DesactiverPersonneSchema,
    lire: lirePersonneVisee,
    valide: { personneId: "p1", signature },
    invalides: [
      ["sans personneId", sans("personneId")],
      ["champ inconnu", avec({ x: 1 })],
    ],
  },
  {
    nom: "EnregistrerRegles",
    schema: patron.EnregistrerReglesSchema,
    lire: lireEnregistrerRegles,
    valide: { regles, signature },
    invalides: [
      [
        "retenue inconnue",
        avec({ regles: { ...regles, annulation: { ...regles.annulation, retenue: "tout" } } }),
      ],
      [
        "pourcentage > 100",
        avec({
          regles: {
            ...regles,
            annulation: { ...regles.annulation, retenueParClassePct: { classique: 101, vip: 0 } },
          },
        }),
      ],
      ["comptes dans les règles", avec({ regles: { ...regles, comptesMomo: {} } })],
      [
        "tolérance négative",
        avec({ regles: { ...regles, caisse: { ...regles.caisse, toleranceEcart: -1 } } }),
      ],
    ],
  },
  {
    nom: "DemanderConfirmationCompteMomo",
    schema: patron.DemanderConfirmationCompteMomoSchema,
    lire: lireConfirmationMomo,
    valide: { operateur: "mtn", nouveauNumero: "+237677998877", signature },
    invalides: [
      ["opérateur inconnu", avec({ operateur: "moov" })],
      ["numéro trop court", avec({ nouveauNumero: "123" })],
      ["numéro avec lettres", avec({ nouveauNumero: "+23767799887a" })],
    ],
  },
  {
    nom: "ChangerCompteMomo",
    schema: patron.ChangerCompteMomoSchema,
    lire: lireChangerMomo,
    valide: { operateur: "orange", nouveauNumero: "677998877", codeSms: "123456", signature },
    invalides: [
      ["code à 5 chiffres", avec({ codeSms: "12345" })],
      ["code avec lettre", avec({ codeSms: "12345a" })],
      ["sans code", sans("codeSms")],
    ],
  },
];

describe.each(CAS)("$nom", (cas) => {
  it("accepte ce que le contrat accepte", () => {
    expect(cas.schema.safeParse(cas.valide).success).toBe(true);
    expect(() => cas.lire(cas.valide)).not.toThrow();
  });
  it.each(cas.invalides)("refuse comme le contrat : %s", (_nom, abime) => {
    const corps = abime(cas.valide);
    expect(cas.schema.safeParse(corps).success).toBe(false);
    expect(() => cas.lire(corps)).toThrow();
  });
});

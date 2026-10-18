import { patron } from "@afrimove/contrats";
import { describe, expect, it } from "vitest";
import {
  lireChangerMomo,
  lireConfirmationMomo,
  lireCreerLigne,
  lireCreerPersonne,
  lireEnregistrerRegles,
  lireModifierLigne,
  lireModifierPersonne,
  lirePersonneVisee,
} from "./validation";

/**
 * Les lecteurs de l'API et les schémas des contrats doivent s'accorder : ce que le contrat accepte (dans
 * les bornes de l'API), le lecteur l'accepte ; ce que le contrat refuse, le lecteur le refuse.
 */

const signature = { pin: "482915", methode: "pin", signeA: "2026-11-02T09:00:00.000+01:00" };
const tarifs = { classique: 3500, vip: 5000, bagage: 500 };
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
const depart = {
  id: null,
  heure: "06:00",
  heureInitiale: null,
  classe: "classique",
  prix: 3500,
  actif: true,
  note: null,
  jours: [],
  nouveau: true,
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
    nom: "ModifierLigne",
    schema: patron.ModifierLigneSchema,
    lire: lireModifierLigne,
    valide: {
      ligneId: "l1",
      departs: [depart],
      tarifs,
      arrets: [{ nom: "Édéa", montee: true }],
      plan: { capacite: 40, disposition: "2+2", rangees: 10 },
      options: { venteEnLigne: true, fusionAuto: false },
      effetDu: "2026-11-09",
      signature,
    },
    invalides: [
      ["sans ligneId", sans("ligneId")],
      ["champ inconnu", avec({ surprise: true })],
      ["tarif négatif", avec({ tarifs: { ...tarifs, vip: -1 } })],
      ["tarif décimal", avec({ tarifs: { ...tarifs, vip: 10.5 } })],
      ["heure invalide", avec({ departs: [{ ...depart, heure: "25:00" }] })],
      ["classe inconnue", avec({ departs: [{ ...depart, classe: "luxe" }] })],
      ["jour inconnu", avec({ departs: [{ ...depart, jours: ["xxx"] }] })],
      ["plan sans rangées", avec({ plan: { capacite: 40, disposition: "2+2" } })],
      ["disposition invalide", avec({ plan: { capacite: 40, disposition: "deux", rangees: 10 } })],
      ["jour d'effet invalide", avec({ effetDu: "lundi" })],
    ],
  },
  {
    nom: "CreerLigne",
    schema: patron.CreerLigneSchema,
    lire: lireCreerLigne,
    valide: {
      origineGareId: "g1",
      destinationGareId: "g2",
      tarifs,
      arrets: ["Édéa"],
      capacite: 40,
      signature,
    },
    invalides: [
      ["sans capacité", sans("capacite")],
      ["capacité nulle", avec({ capacite: 0 })],
      ["arrêt vide", avec({ arrets: [""] })],
      ["champ inconnu", avec({ x: 1 })],
    ],
  },
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

import { patron } from "@afrimove/contrats";
import { describe, expect, it } from "vitest";
import {
  OPERATIONS_SIGNEES,
  OP_CREER_LIGNE,
  OP_LIGNE_EDITABLE,
  OP_MODIFIER_LIGNE,
} from "../../../../packages/api-client/src/patron/operations";
import { lire } from "../billetterie/validation";
import { creerLigne, modifierLigne } from "./schemas";

/**
 * L'API ne peut pas importer les schémas zod de `@afrimove/contrats` à l'exécution (paquet non compilé, API en
 * CommonJS) : `schemas.ts` en recopie les formes. Ces tests donnent les mêmes corps aux deux lecteurs : ce que zod
 * accepte, l'API l'accepte ; ce que zod refuse, l'API le refuse. Une forme changée d'un seul côté fait échouer la CI.
 */

const signature = { pin: "482915", methode: "pin", signeA: "2026-11-02T09:00:00.000+01:00" };
const tarifs = { classique: 4000, vip: 6000, bagage: 500 };
const depart = {
  id: null,
  heure: "05:30",
  heureInitiale: null,
  classe: "classique",
  prix: 4000,
  actif: true,
  note: null,
  jours: [],
  nouveau: true,
};

const accepte = (lecteur: (v: unknown, chemin: string) => unknown, v: unknown): boolean => {
  try {
    lire(lecteur as never, v);
    return true;
  } catch {
    return false;
  }
};

function memeVerdict(
  nom: string,
  schema: { safeParse: (v: unknown) => { success: boolean } },
  lecteur: (v: unknown, chemin: string) => unknown,
  corps: unknown,
) {
  const zod = schema.safeParse(corps).success;
  expect(accepte(lecteur, corps), `${nom} : ${JSON.stringify(corps)}`).toBe(zod);
}

const creation = {
  origineGareId: "g1",
  destinationGareId: "g2",
  tarifs,
  arrets: ["Édéa"],
  capacite: 70,
  signature,
};
const modification = { ligneId: "l1", signature };

describe("CreerLigne : mêmes verdicts que les contrats du patron", () => {
  const cas: [string, unknown][] = [
    ["valide", creation],
    ["sans arrêt", { ...creation, arrets: [] }],
    ["arrêt vide", { ...creation, arrets: [""] }],
    ["sans signature", { ...creation, signature: undefined }],
    ["PIN de 5 chiffres", { ...creation, signature: { ...signature, pin: "12345" } }],
    ["méthode inconnue", { ...creation, signature: { ...signature, methode: "visage" } }],
    [
      "heure de signature sans fuseau",
      { ...creation, signature: { ...signature, signeA: "2026-11-02T09:00:00Z" } },
    ],
    ["capacité nulle", { ...creation, capacite: 0 }],
    ["capacité décimale", { ...creation, capacite: 70.5 }],
    ["tarif négatif", { ...creation, tarifs: { ...tarifs, vip: -1 } }],
    ["tarif décimal", { ...creation, tarifs: { ...tarifs, bagage: 500.5 } }],
    ["tarif manquant", { ...creation, tarifs: { classique: 4000, vip: 6000 } }],
    ["champ en trop", { ...creation, couleur: "rouge" }],
    ["gare vide", { ...creation, origineGareId: "" }],
    ["pas un objet", "ligne"],
    ["null", null],
  ];
  it.each(cas)("%s", (nom, corps) => memeVerdict(nom, patron.CreerLigneSchema, creerLigne, corps));
});

describe("ModifierLigne : mêmes verdicts que les contrats du patron", () => {
  const cas: [string, unknown][] = [
    ["signature seule", modification],
    ["avec départs", { ...modification, departs: [depart] }],
    [
      "départ en retard d'un format d'heure",
      { ...modification, departs: [{ ...depart, heure: "5:30" }] },
    ],
    ["heure 24:00", { ...modification, departs: [{ ...depart, heure: "24:00" }] }],
    ["classe inconnue", { ...modification, departs: [{ ...depart, classe: "luxe" }] }],
    ["jour inconnu", { ...modification, departs: [{ ...depart, jours: ["lundi"] }] }],
    ["jours valides", { ...modification, departs: [{ ...depart, jours: ["lun", "ven"] }] }],
    ["note", { ...modification, departs: [{ ...depart, note: "mardi seulement" }] }],
    [
      "départ sans champ nouveau",
      { ...modification, departs: [{ ...depart, nouveau: undefined }] },
    ],
    ["départ avec champ en trop", { ...modification, departs: [{ ...depart, surprise: 1 }] }],
    ["tarifs", { ...modification, tarifs }],
    ["tarifs incomplets", { ...modification, tarifs: { classique: 1 } }],
    ["arrêts", { ...modification, arrets: [{ nom: "Édéa", montee: true }] }],
    [
      "arrêt avec prorata (calculé par l'API)",
      { ...modification, arrets: [{ nom: "Édéa", montee: true, prorata: 100 }] },
    ],
    ["arrêt sans nom", { ...modification, arrets: [{ nom: "", montee: true }] }],
    ["plan", { ...modification, plan: { capacite: 70, disposition: "2+2", rangees: 18 } }],
    ["plan 2+1+2", { ...modification, plan: { capacite: 70, disposition: "2+1+2", rangees: 14 } }],
    [
      "plan mal écrit",
      { ...modification, plan: { capacite: 70, disposition: "deux", rangees: 18 } },
    ],
    [
      "plan sans rangée",
      { ...modification, plan: { capacite: 70, disposition: "2+2", rangees: 0 } },
    ],
    ["options", { ...modification, options: { venteEnLigne: true, fusionAuto: false } }],
    ["options incomplètes", { ...modification, options: { venteEnLigne: true } }],
    ["effet dès un jour", { ...modification, effetDu: "2026-11-09" }],
    ["effet mal écrit", { ...modification, effetDu: "09/11/2026" }],
    ["sans ligne", { signature }],
    ["sans signature", { ligneId: "l1" }],
    ["champ en trop", { ...modification, couleur: "rouge" }],
  ];
  it.each(cas)("%s", (nom, corps) =>
    memeVerdict(nom, patron.ModifierLigneSchema, modifierLigne, corps),
  );
});

describe("routes dictées par le client d'API", () => {
  it("les trois routes de lignes du contrôleur sont celles de api-client", () => {
    expect(
      [OP_LIGNE_EDITABLE, OP_MODIFIER_LIGNE, OP_CREER_LIGNE].map((o) => [
        o.methode,
        o.chemin({ ligneId: "L" } as never),
      ]),
    ).toEqual([
      ["GET", "/patron/reglages/lignes/L"],
      ["PUT", "/patron/reglages/lignes/L"],
      ["POST", "/patron/reglages/lignes"],
    ]);
  });

  it("créer et modifier une ligne sont des écritures signées", () => {
    expect(Object.keys(OPERATIONS_SIGNEES)).toEqual(
      expect.arrayContaining(["patron.reglages.ligne.modifier", "patron.reglages.ligne.creer"]),
    );
  });
});

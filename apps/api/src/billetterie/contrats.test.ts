import { agence, voyageur } from "@afrimove/contrats";
import { describe, expect, it } from "vitest";
import {
  lireBilletComplete,
  lireBilletVendu,
  lireBilletVenduCadence,
  lireCreerCommande,
  lireEnregistrerFiltres,
  lireFiltresDeparts,
  lireQuaiCodeSaisi,
  lireQuaiLibere,
  lireQuaiListeEnvoyee,
  lireQuaiScanne,
  lireTelephoneAjoute,
} from "./schemas";
import { DonneesInvalides, lire, type Lecteur } from "./validation";

/**
 * L'API lit les corps avec de petits lecteurs (elle ne peut pas importer zod ni les contrats à
 * l'exécution). Ce test les confronte aux schémas zod de `@afrimove/contrats` : pour chaque corps
 * valide, on change une valeur à la fois (champ retiré, `null`, mauvais type, valeurs limites) et
 * le lecteur doit accepter et refuser exactement ce que le schéma accepte et refuse.
 *
 * Seule différence voulue : les lecteurs plafonnent la taille des textes (500 caractères, 128 pour
 * un identifiant), ce que zod ne fait pas ; les valeurs de test restent donc sous ces plafonds.
 */

interface Schema {
  safeParse(valeur: unknown): { success: boolean };
}

const accepte = <T>(lecteur: Lecteur<T>, valeur: unknown): boolean => {
  try {
    lire(lecteur, valeur);
    return true;
  } catch (e) {
    if (e instanceof DonneesInvalides) return false;
    throw e;
  }
};

const VALEURS = [
  null,
  undefined,
  true,
  false,
  0,
  1,
  -1,
  1.5,
  9999,
  10_000,
  1000,
  1001,
  "",
  " ",
  "x",
  "4821",
  "482",
  "48212",
  "+237691221008",
  "237691221008",
  "+23769",
  "2026-11-02T09:00:00+01:00",
  "2026-11-02T09:00:00.123+01:00",
  "2026-11-02T09:00:00Z",
  "2026-11-02T09:00:00+02:00",
  "11111111-1111-4111-8111-111111111111",
  "11111111-1111-7111-8111-111111111111",
  "11111111-1111-9111-8111-111111111111",
  "not-a-uuid",
  "cash",
  "momo",
  "carte",
  "classique",
  "vip",
  "toutes",
  [],
  [1],
  ["a"],
  {},
];

/** Toutes les copies de `base` où une seule valeur (à n'importe quelle profondeur) est changée. */
function* mutations(base: unknown): Generator<unknown> {
  yield* parcourir(base, base, []);
}

function* parcourir(
  racine: unknown,
  noeud: unknown,
  chemin: (string | number)[],
): Generator<unknown> {
  // 1. remplacer ce noeud par chaque valeur de test (sauf à la racine)
  if (chemin.length > 0) {
    for (const v of VALEURS) yield avec(racine, chemin, v, false);
    yield avec(racine, chemin, undefined, true);
  }
  // 2. descendre
  if (Array.isArray(noeud)) {
    for (let i = 0; i < noeud.length; i++) yield* parcourir(racine, noeud[i], [...chemin, i]);
  } else if (noeud !== null && typeof noeud === "object") {
    for (const [cle, v] of Object.entries(noeud)) yield* parcourir(racine, v, [...chemin, cle]);
  }
}

function avec(
  racine: unknown,
  chemin: (string | number)[],
  valeur: unknown,
  retirer: boolean,
): unknown {
  const copie = structuredClone(racine) as Record<string | number, unknown>;
  let courant = copie;
  for (const p of chemin.slice(0, -1)) courant = courant[p] as Record<string | number, unknown>;
  const dernier = chemin[chemin.length - 1]!;
  if (retirer) delete courant[dernier];
  else courant[dernier] = valeur;
  return copie;
}

function comparer<T>(nom: string, schema: Schema, lecteur: Lecteur<T>, base: unknown): void {
  it(`${nom} : mêmes valeurs acceptées et refusées que le schéma zod`, () => {
    expect(schema.safeParse(base).success, "la base doit être valide").toBe(true);
    expect(accepte(lecteur, base)).toBe(true);
    let n = 0;
    let acceptees = 0;
    for (const m of mutations(base)) {
      n++;
      const attendu = schema.safeParse(m).success;
      if (attendu) acceptees++;
      expect(accepte(lecteur, m), `${JSON.stringify(m)}`).toBe(attendu);
    }
    expect(n).toBeGreaterThan(50);
    // Le test discrimine bien : certaines variantes sont valides, la plupart ne le sont pas.
    expect(acceptees).toBeGreaterThan(0);
    expect(acceptees).toBeLessThan(n);
  });
}

const UUID = "5d1b2f3e-7a4c-4b8e-9c1d-2e3f4a5b6c7d";
const enveloppe = (
  type: string,
  cible: { type: string; id: string },
  numeroPlage: number | null,
  donnees: unknown,
) => ({
  id: UUID,
  type,
  at: "2026-11-02T09:00:00+01:00",
  appareilId: "appareil-1",
  auteurId: "agent-1",
  cible,
  numeroPlage,
  donnees,
});
const paiement = { mode: "cash", recu: 5000, rendu: 1000, reference: null };

describe("événements de l'agence", () => {
  comparer(
    "billet.vendu",
    agence.EVENEMENT_BILLET_VENDU.schema,
    lireBilletVendu,
    enveloppe("billet.vendu", { type: "billet", id: "b1" }, 12, {
      billetId: "b1",
      departId: "d1",
      siege: 7,
      classe: "classique",
      prix: 4000,
      bagage: 500,
      passager: { nom: "Aminatou", telephone: "+237691221008", pieceQuatreDerniers: "4821" },
      paiement,
      codeBillet: "4821",
      sms: true,
    }),
  );
  comparer(
    "billet.vendu_cadence",
    agence.EVENEMENT_BILLET_VENDU_CADENCE.schema,
    lireBilletVenduCadence,
    enveloppe("billet.vendu_cadence", { type: "billet", id: "b1" }, 12, {
      billetId: "b1",
      departId: "d1",
      siege: 7,
      prix: 4000,
      paiement,
      codeBillet: "4821",
      telephone: null,
    }),
  );
  comparer(
    "billet.telephone_ajoute",
    agence.EVENEMENT_BILLET_TELEPHONE_AJOUTE.schema,
    lireTelephoneAjoute,
    enveloppe("billet.telephone_ajoute", { type: "billet", id: "b1" }, null, {
      billetId: "b1",
      telephone: "+237691221008",
    }),
  );
  comparer(
    "billet.complete",
    agence.EVENEMENT_BILLET_COMPLETE.schema,
    lireBilletComplete,
    enveloppe("billet.complete", { type: "billet", id: "b1" }, null, {
      billetId: "b1",
      departId: "d1",
      nom: "Brice",
      pieceQuatreDerniers: "7710",
      telephone: null,
      embarquer: true,
    }),
  );
  comparer(
    "quai.scanne",
    agence.EVENEMENT_QUAI_SCANNE.schema,
    lireQuaiScanne,
    enveloppe("quai.scanne", { type: "depart", id: "d1" }, null, {
      departId: "d1",
      qr: "AM1:ALP-DLA-261102-4001:4821:d1:" + "A".repeat(86),
    }),
  );
  comparer(
    "quai.code_saisi",
    agence.EVENEMENT_QUAI_CODE_SAISI.schema,
    lireQuaiCodeSaisi,
    enveloppe("quai.code_saisi", { type: "depart", id: "d1" }, null, {
      departId: "d1",
      codeBillet: "4821",
    }),
  );
  comparer(
    "quai.libere",
    agence.EVENEMENT_QUAI_LIBERE.schema,
    lireQuaiLibere,
    enveloppe("quai.libere", { type: "billet", id: "b1" }, null, {
      departId: "d1",
      billetId: "b1",
      siege: 7,
      motif: "absent",
    }),
  );
  comparer(
    "quai.liste_envoyee",
    agence.EVENEMENT_QUAI_LISTE_ENVOYEE.schema,
    lireQuaiListeEnvoyee,
    enveloppe("quai.liste_envoyee", { type: "depart", id: "d1" }, null, {
      departId: "d1",
      embarques: 31,
      capacite: 40,
    }),
  );

  it("un événement d'un autre type est refusé par chaque lecteur", () => {
    const evt = enveloppe("quai.scanne", { type: "depart", id: "d1" }, null, {
      departId: "d",
      qr: "x",
    });
    expect(accepte(lireQuaiScanne, evt)).toBe(true);
    expect(accepte(lireQuaiCodeSaisi, evt)).toBe(false);
    expect(accepte(lireBilletVendu, evt)).toBe(false);
  });
});

describe("corps du voyageur", () => {
  comparer("filtres de départs", voyageur.SchemaFiltresDeparts, lireFiltresDeparts, {
    classe: "vip",
    compagnies: ["c1", "c2"],
    preferees: true,
    inclureCovoit: false,
    matinSeulement: true,
    placesCoteACote: false,
    prixMax: 5000,
  });
  comparer("filtres enregistrés", voyageur.SchemaEnregistrerFiltres, lireEnregistrerFiltres, {
    depart: "DLA",
    arrivee: "YDE",
    filtres: { classe: "toutes", prixMax: 4000 },
  });
  comparer("création d'une commande", voyageur.SchemaCreerCommande, lireCreerCommande, {
    departId: "d1",
    sieges: [7, 8],
    pour: "plusieurs",
    procheId: "p1",
    passagers: [{ nom: "Mireille", telephone: "+237691221008" }, { nom: "Paul" }],
    codePromo: "JOURJ",
    devise: "CAD",
  });
});

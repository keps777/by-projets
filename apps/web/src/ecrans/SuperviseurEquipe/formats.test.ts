import { describe, expect, it } from "vitest";
import {
  contexteGenre,
  idGuichet,
  personnesADebloquer,
  rangsDesGuichets,
  tonAvatar,
  type Equipe,
  type Personne,
} from "./formats";
import { estFeminin } from "./genre";

function personne(reste: Partial<Personne> = {}): Personne {
  return {
    personneId: "pers-x",
    initiales: "XX",
    nom: "X Y.",
    role: "guichetier",
    affectation: null,
    statut: "en_service",
    pin: { etat: "ok", fauxEssais: 0, bloqueA: null },
    alerte: null,
    situation: null,
    ...reste,
  };
}

function equipe(personnes: Personne[], fiche: Equipe["fiche"] = null): Equipe {
  return {
    gare: { id: "gare-alp-dla", nom: "Akwa" },
    effectif: personnes.length,
    enService: personnes,
    autres: { nombre: 0, detail: null },
    fiche,
    pinProvisoireMinutes: 60,
  };
}

describe("estFeminin", () => {
  it("accorde au féminin les prénoms et les civilités féminins", () => {
    expect(estFeminin("Marie T.")).toBe(true);
    expect(estFeminin("Pauline N.")).toBe(true);
    expect(estFeminin("Mme Essono")).toBe(true);
    expect(estFeminin("Mlle Ngo")).toBe(true);
    expect(estFeminin("aïcha Ngo")).toBe(true);
  });

  it("laisse au masculin les autres prénoms, les initiales et « M. »", () => {
    expect(estFeminin("Joseph M.")).toBe(false);
    expect(estFeminin("Alain B.")).toBe(false);
    expect(estFeminin("O. Essomba")).toBe(false);
    expect(estFeminin("M. Kamga")).toBe(false);
    expect(estFeminin("Mariusz K.")).toBe(false);
  });

  it("donne le contexte i18next `f` seulement au féminin", () => {
    expect(contexteGenre("Marie T.")).toEqual({ context: "f" });
    expect(contexteGenre("Joseph M.")).toEqual({});
  });
});

describe("tonAvatar", () => {
  it("compte bloqué : gris, avant tout", () => {
    expect(tonAvatar(personne({ pin: { etat: "bloque", fauxEssais: 3, bloqueA: null } }))).toBe(
      "gris",
    );
  });

  it("PIN à renouveler : ambre, même pour un convoyeur", () => {
    const pin = { etat: "a_renouveler", fauxEssais: 0, bloqueA: null } as const;
    expect(tonAvatar(personne({ pin }))).toBe("ambre");
    expect(tonAvatar(personne({ pin, role: "convoyeur" }))).toBe("ambre");
  });

  it("PIN en règle : vert sur la route, bleu au guichet", () => {
    expect(tonAvatar(personne({ role: "convoyeur" }))).toBe("vert");
    expect(tonAvatar(personne({ role: "chauffeur" }))).toBe("vert");
    expect(tonAvatar(personne({ role: "guichetier" }))).toBe("bleu");
  });
});

describe("guichets de la gare", () => {
  it("relève les rangs des guichets de l'équipe, sans doublon, dans l'ordre", () => {
    const e = equipe([
      personne({ personneId: "a", affectation: "guichet 3" }),
      personne({ personneId: "b", affectation: "guichet 1" }),
      personne({ personneId: "c", affectation: "guichet 3" }),
      personne({ personneId: "d", affectation: "LT 412 AB" }),
      personne({ personneId: "e", affectation: null }),
    ]);
    expect(rangsDesGuichets(e)).toEqual([1, 3]);
  });

  it("construit l'identifiant du guichet : guichet-<compagnie>-<gare>-<rang>", () => {
    expect(idGuichet("gare-alp-dla", 2)).toBe("guichet-alp-dla-2");
    expect(idGuichet("gare-alp-yde", 1)).toBe("guichet-alp-yde-1");
  });
});

describe("personnesADebloquer", () => {
  it("prend les comptes bloqués de la liste, puis ceux de la fiche qui n'y sont pas", () => {
    const e = equipe(
      [
        personne({ personneId: "p1", nom: "Pauline N.", statut: "bloquee" }),
        personne({ personneId: "p2", nom: "Marie T." }),
      ],
      {
        personneId: "p2",
        nom: "Marie T.",
        role: "guichetier",
        depuisLibelle: "depuis le 5 janv.",
        billets: 1,
        actions: [],
        personnesADebloquer: [
          { id: "p1", nom: "Pauline N." },
          { id: "p3", nom: "Hors liste" },
          { id: "p2", nom: "Marie T." },
        ],
      },
    );
    expect(personnesADebloquer(e)).toEqual([
      { id: "p1", nom: "Pauline N." },
      { id: "p3", nom: "Hors liste" },
    ]);
  });

  it("est vide quand personne n'est bloqué", () => {
    expect(personnesADebloquer(equipe([personne()]))).toEqual([]);
  });
});

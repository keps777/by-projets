import { describe, expect, it } from "vitest";
import type { DemandeRedaction } from "./ports";
import {
  INSTRUCTIONS_REDACTION,
  messageRedaction,
  nombresDe,
  sansNumero,
  verifierRedaction,
} from "./redaction";

const demande: DemandeRedaction = {
  intention: "pourquoi_ligne",
  question: "Pourquoi Bafoussam baisse ?",
  faits: [
    "Douala → Bafoussam fait − 14 % sur deux semaines. Ce qui pèse : le mercredi et le 10:00.",
    "1. Les billets de la ligne ont rapporté 1 120 000 F ces 14 derniers jours, contre 1 302 000 F les 14 jours d'avant.",
    "2. Le 10:00 part à 55 % de remplissage, contre 88 % pour tes autres départs. Agent 1 part à 09:30 à 3 000 F, 500 F de moins que toi.",
  ],
  avecPoints: true,
  motsObligatoires: ["Douala → Bafoussam"],
};

const bonne = {
  resume: "Douala → Bafoussam recule de 14 % sur deux semaines, à cause du mercredi et du 10:00.",
  points: [
    "Les billets ont rapporté 1 120 000 F contre 1 302 000 F avant.",
    "Le 10:00 part à 55 %, les autres départs sont à 88 %.",
  ],
};

describe("lire les nombres d'un texte", () => {
  it("comprend les espaces de milliers, les virgules et les heures", () => {
    expect(nombresDe("1 120 000 F, 1,5 M, 10:00, 55 %, 3 000")).toEqual([
      "1120000",
      "1.5",
      "10",
      "0",
      "55",
      "3000",
    ]);
    expect(nombresDe("1 120 000")).toEqual(["1120000"]);
    expect(nombresDe("aucun nombre")).toEqual([]);
  });

  it("« 09:30 » et « 9:30 » se comparent", () => {
    expect(nombresDe("09:30")).toEqual(nombresDe("9:30"));
  });

  it("retire le numéro d'un point", () => {
    expect(sansNumero("1. Les billets")).toBe("Les billets");
    expect(sansNumero("2) Le 10:00")).toBe("Le 10:00");
    expect(sansNumero("Sans numéro")).toBe("Sans numéro");
  });
});

describe("la réponse du modèle n'est gardée que si elle est sûre", () => {
  it("une réponse fidèle aux faits passe, ses points sont renumérotés par l'API", () => {
    const r = verifierRedaction(bonne, demande)!;
    expect(r.resume).toBe(bonne.resume);
    expect(r.points).toEqual([
      "1. Les billets ont rapporté 1 120 000 F contre 1 302 000 F avant.",
      "2. Le 10:00 part à 55 %, les autres départs sont à 88 %.",
    ]);
  });

  it("un nombre inventé, arrondi ou recalculé la fait refuser", () => {
    for (const faux of [
      "Douala → Bafoussam recule de 15 % sur deux semaines.", // inventé
      "Douala → Bafoussam recule d'environ 1,1 M sur deux semaines.", // converti
      "Douala → Bafoussam : le 10:00 perd 33 points.", // recalculé (88 − 55)
    ]) {
      expect(verifierRedaction({ ...bonne, resume: faux }, demande)).toBeNull();
    }
    expect(verifierRedaction({ ...bonne, points: ["Le 10:00 part à 56 %."] }, demande)).toBeNull();
  });

  it("un nombre de la question est permis (le modèle peut la reprendre)", () => {
    const d = { ...demande, question: "Et si je baisse à 3 500 ?" };
    expect(
      verifierRedaction(
        { ...bonne, resume: "Douala → Bafoussam : à 3 500 le 10:00 part à 55 %." },
        d,
      ),
    ).not.toBeNull();
  });

  it("le nom complet de la ligne est obligatoire : l'écran s'en sert pour ouvrir la ligne", () => {
    expect(
      verifierRedaction(
        { ...bonne, resume: "Bafoussam recule de 14 % sur deux semaines." },
        demande,
      ),
    ).toBeNull();
  });

  it("des points sont exigés quand la réponse en a, et ignorés quand elle n'en a pas", () => {
    expect(verifierRedaction({ resume: bonne.resume, points: [] }, demande)).toBeNull();
    const sansPoints = { ...demande, avecPoints: false, motsObligatoires: [] };
    expect(verifierRedaction(bonne, sansPoints)).toEqual({ resume: bonne.resume, points: [] });
  });

  it("refuse les formes inattendues", () => {
    for (const brut of [
      null,
      "texte",
      42,
      [],
      {},
      { resume: 3, points: [] },
      { resume: "ok", points: "non" },
      { resume: "ok", points: [1] },
      { resume: "   ", points: ["a"] },
    ]) {
      expect(verifierRedaction(brut, { ...demande, motsObligatoires: [] })).toBeNull();
    }
  });

  it("refuse un texte trop long, une adresse web, ou un marqueur de masquage laissé dans la réponse", () => {
    expect(
      verifierRedaction({ ...bonne, resume: `Douala → Bafoussam ${"a".repeat(700)}` }, demande),
    ).toBeNull();
    expect(
      verifierRedaction(
        { ...bonne, resume: "Douala → Bafoussam : voir https://exemple.cm" },
        demande,
      ),
    ).toBeNull();
    expect(
      verifierRedaction({ ...bonne, resume: "Douala → Bafoussam : appelle le [numéro]" }, demande),
    ).toBeNull();
    expect(
      verifierRedaction(
        { ...bonne, points: Array.from({ length: 7 }, () => "Le 10:00 part à 55 %.") },
        demande,
      ),
    ).toBeNull();
  });
});

describe("ce qu'on demande au modèle", () => {
  it("le message ne contient que la question et les faits", () => {
    const m = messageRedaction(demande);
    expect(m).toContain("Question : Pourquoi Bafoussam baisse ?");
    for (const f of demande.faits) expect(m).toContain(`- ${f}`);
    expect(m).toContain("de 2 à 5 phrases");
  });

  it("les instructions interdisent d'inventer un chiffre et de citer une autre compagnie", () => {
    expect(INSTRUCTIONS_REDACTION).toMatch(/N'utilise que les faits/);
    expect(INSTRUCTIONS_REDACTION).toMatch(/recopié tel quel/);
    expect(INSTRUCTIONS_REDACTION).toMatch(/autre compagnie/);
  });
});

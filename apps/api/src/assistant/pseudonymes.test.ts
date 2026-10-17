import { describe, expect, it } from "vitest";
import { Pseudonymes } from "./pseudonymes";

const personnes = [
  { nom: "Joseph", genre: "Agent" as const },
  { nom: "Essono", genre: "Agent" as const },
  { nom: "Nana", genre: "Chauffeur" as const },
  { nom: "Jean Nana", genre: "Chauffeur" as const },
];

describe("pseudonymisation de ce qui part vers le modèle", () => {
  const p = new Pseudonymes(personnes);

  it("remplace chaque nom par un pseudonyme stable, sans casse ni accent à respecter", () => {
    const sortie = p.masquer(
      "Guichet 2 d'Akwa : 3 écarts, toujours JOSEPH. Essono n'a rien. Joseph encore.",
    );
    expect(sortie).not.toMatch(/joseph|essono/i);
    expect(sortie).toContain("Agent");
    // Le même nom reçoit toujours le même pseudonyme.
    const joseph = /(Agent \d)\./.exec(sortie)![1]!;
    expect(sortie.match(new RegExp(joseph, "g"))).toHaveLength(2);
  });

  it("le nom le plus long passe d'abord : « Jean Nana » ne laisse pas « Jean » derrière lui", () => {
    const sortie = p.masquer("Jean Nana conduit, Nana aussi.");
    expect(sortie).not.toContain("Nana");
    expect(sortie).not.toContain("Jean");
    expect(sortie).toMatch(/^Chauffeur \d conduit, Chauffeur \d aussi\.$/);
  });

  it("ne coupe pas les mots : « Nana » n'est pas reconnu dans « Nanabé »", () => {
    expect(p.masquer("Nanabé et Joséphine")).toBe("Nanabé et Joséphine");
  });

  it("remet les vrais noms dans la réponse du modèle, y compris Agent 10 avant Agent 1", () => {
    const beaucoup = new Pseudonymes(
      Array.from({ length: 11 }, (_, i) => ({ nom: `Agent-Nom${i}`, genre: "Agent" as const })),
    );
    const masque = beaucoup.masquer("Agent-Nom0 et Agent-Nom9 puis Agent-Nom10");
    expect(masque).not.toContain("Agent-Nom");
    expect(beaucoup.demasquer(masque)).toBe("Agent-Nom0 et Agent-Nom9 puis Agent-Nom10");
    expect(p.demasquer(p.masquer("Joseph et Essono"))).toBe("Joseph et Essono");
  });

  it("n'altère pas les montants des faits (un montant de 8 chiffres n'est pas un téléphone)", () => {
    expect(p.masquer("Total 12 345 678 F")).toBe("Total 12 345 678 F");
  });

  it("dans une question, retire les numéros de téléphone et les adresses électroniques", () => {
    const q = p.masquerQuestion(
      "Appelle Joseph au +237 655 40 12 34 ou au 655401234, écris à joseph@exemple.cm",
    );
    expect(q).not.toMatch(/655|joseph|exemple/i);
    expect(q).toContain("[numéro]");
    expect(q).toContain("[adresse]");
  });

  it("une question sans donnée personnelle reste inchangée", () => {
    expect(p.masquerQuestion("Et si je baisse à 3 500 moi aussi ?")).toBe(
      "Et si je baisse à 3 500 moi aussi ?",
    );
  });

  it("les noms contenant des caractères spéciaux d'expression régulière sont traités comme du texte", () => {
    const s = new Pseudonymes([{ nom: "A.B (chef)", genre: "Agent" }]);
    expect(s.masquer("Vu A.B (chef) hier, pas AXB (chef)")).toBe("Vu Agent 1 hier, pas AXB (chef)");
  });

  it("les noms trop courts ou vides sont ignorés", () => {
    const s = new Pseudonymes([
      { nom: "", genre: "Agent" },
      { nom: "X", genre: "Agent" },
    ]);
    expect(s.masquer("X est là")).toBe("X est là");
    expect(s.noms).toEqual([]);
  });
});

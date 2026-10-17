import { describe, expect, it } from "vitest";
import { apercuVide, billetCite, messagesVue, texteUssd } from "./formats";

describe("texteUssd", () => {
  it("sépare la réponse tapée du menu par une ligne vide, une seule fois", () => {
    expect(texteUssd(["AfriMove", "1 Billet", "Repondre: 1", "--------", "Place: 2"])).toBe(
      "AfriMove\n1 Billet\n\nRepondre: 1\n--------\nPlace: 2",
    );
    // Déjà séparée par le serveur : rien n'est ajouté.
    expect(texteUssd(["AfriMove", "", "Repondre: 1"])).toBe("AfriMove\n\nRepondre: 1");
  });

  it("garde les lignes telles quelles (espaces compris) quand il n'y a pas de réponse tapée", () => {
    expect(texteUssd(["  1 Billet", "2 Colis"])).toBe("  1 Billet\n2 Colis");
    expect(texteUssd([])).toBe("");
    expect(texteUssd(["Repondre: 1"])).toBe("Repondre: 1");
  });
});

describe("messagesVue", () => {
  const echanges = [
    { de: "voyageur" as const, lignes: ["Billet Douala Yaoundé demain matin"] },
    {
      de: "afrimove" as const,
      lignes: ["Alpha 08:30, siège 7 fenêtre. 4 000 F par MoMo ?", "Oui · Changer de siège"],
    },
    { de: "afrimove" as const, lignes: ["1 · 08:00 Bêta VIP 7 500"] },
    { de: "afrimove" as const, lignes: ["✓ Payé. Billet ALP-DLA-270106-0031, code 5582."] },
    { de: "voyageur" as const, lignes: ["✓ merci"] },
  ];

  it("met en avant la réponse proposée juste après une question, et elle seule", () => {
    const [, question, liste] = messagesVue(echanges);
    expect(question?.lignes[0]).toEqual({
      texte: "Alpha 08:30, siège 7 fenêtre. 4 000 F par MoMo ?",
    });
    expect(question?.lignes[1]).toEqual({
      texte: "Oui · Changer de siège",
      reponse: "Oui",
      suite: " · Changer de siège",
    });
    // « 1 · 08:00 … » ne suit pas une question : c'est une ligne de la liste des départs.
    expect(liste?.lignes[0]).toEqual({ texte: "1 · 08:00 Bêta VIP 7 500" });
  });

  it("reconnaît la confirmation d'AfriMove (✓), pas le « ✓ » du voyageur", () => {
    const vues = messagesVue(echanges);
    expect(vues.map((m) => m.confirmation)).toEqual([false, false, false, true, false]);
  });
});

describe("billetCite", () => {
  it("trouve le numéro de billet de la conversation", () => {
    expect(
      billetCite([
        { de: "afrimove", lignes: ["✓ Payé. Billet ALP-DLA-270106-0031, code 5582. Bon voyage."] },
      ]),
    ).toBe("ALP-DLA-270106-0031");
  });

  it("garde le dernier numéro cité, et ignore un code de colis ou un code à 4 chiffres", () => {
    expect(
      billetCite([
        { de: "afrimove", lignes: ["Billet ALP-DLA-270106-0031"] },
        {
          de: "afrimove",
          lignes: ["Colis C-DLA-270106-0007, code 5582", "Billet BEX-YDE-270107-0142."],
        },
      ]),
    ).toBe("BEX-YDE-270107-0142");
    expect(
      billetCite([{ de: "afrimove", lignes: ["Colis C-DLA-270106-0007, code 5582"] }]),
    ).toBeNull();
    expect(billetCite([])).toBeNull();
  });
});

describe("apercuVide", () => {
  const plein = {
    ussd: { code: "*123#", lignes: ["AfriMove"], touches: [], note: "" },
    whatsapp: { motCle: "billet", echanges: [], vocal: "" },
  };

  it("est vide seulement sans écran USSD et sans message", () => {
    expect(apercuVide(plein)).toBe(false);
    expect(apercuVide({ ...plein, ussd: { ...plein.ussd, lignes: [] } })).toBe(true);
    expect(
      apercuVide({
        ussd: { ...plein.ussd, lignes: [] },
        whatsapp: { ...plein.whatsapp, echanges: [{ de: "voyageur", lignes: ["billet"] }] },
      }),
    ).toBe(false);
  });
});

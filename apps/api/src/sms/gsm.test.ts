import { describe, expect, it } from "vitest";
import { adapterGsm, analyserTexte, masquerTelephone } from "./gsm";

describe("analyserTexte", () => {
  it("compte 160 caractères GSM dans un seul SMS, 161 dans deux (153 par morceau)", () => {
    expect(analyserTexte("a".repeat(160))).toMatchObject({ encodage: "gsm7", segments: 1 });
    expect(analyserTexte("a".repeat(161))).toMatchObject({ encodage: "gsm7", segments: 2 });
    expect(analyserTexte("a".repeat(306)).segments).toBe(2);
    expect(analyserTexte("a".repeat(307)).segments).toBe(3);
  });

  it("é è à ù É Ç restent en GSM ; ê ç î ô û ï n'y sont pas", () => {
    expect(analyserTexte("Siège réservé à Yaoundé. Où ? Ça va, très bien (ù)").encodage).toBe(
      "gsm7",
    );
    for (const c of ["ê", "ç", "î", "ô", "û", "ï", "â"]) {
      expect(analyserTexte(`a${c}b`).encodage).toBe("ucs2");
    }
  });

  it("un seul caractère hors table fait passer le message en UCS-2 (70 par SMS)", () => {
    expect(analyserTexte("ê")).toMatchObject({ encodage: "ucs2", segments: 1 });
    expect(analyserTexte("a".repeat(69) + "ê").segments).toBe(1);
    expect(analyserTexte("a".repeat(70) + "ê").segments).toBe(2);
    expect(analyserTexte("a".repeat(134) + "ê").segments).toBe(3);
  });

  it("les caractères étendus (€, [, ]) valent deux septets", () => {
    expect(analyserTexte("€".repeat(80))).toMatchObject({
      encodage: "gsm7",
      unites: 160,
      segments: 1,
    });
    expect(analyserTexte("€".repeat(81)).segments).toBe(2);
  });

  it("un texte vide ne coûte rien", () => {
    expect(analyserTexte("").segments).toBe(0);
  });
});

describe("adapterGsm", () => {
  it.each([
    ["Bêta Express", "Beta Express"],
    ["Aïcha", "Aicha"],
    ["François", "Francois"],
    ["cœur", "coeur"],
    ["« billet »", '" billet "'],
    ["l’heure", "l'heure"],
    ["08h30 – 10h", "08h30 - 10h"],
    ["Lá", "La"],
    ["Ñandú", "Ñandu"],
    ["a b", "a b"],
  ])("%s -> %s", (entree, attendu) => {
    expect(adapterGsm(entree)).toBe(attendu);
  });

  it("garde tels quels les caractères déjà valides", () => {
    expect(adapterGsm("Yaoundé, siège 14 : é è ù à")).toBe("Yaoundé, siège 14 : é è ù à");
  });

  it("rend GSM le français accentué courant : moins de SMS à payer", () => {
    const brut = "Prêt à partir pour Mbalmayo près de Garoua où l'été est chaud, ça oui, île";
    expect(analyserTexte(brut)).toMatchObject({ encodage: "ucs2", segments: 2 });
    const adapte = adapterGsm(brut);
    expect(adapte).toBe(
      "Pret à partir pour Mbalmayo près de Garoua où l'été est chaud, ca oui, ile",
    );
    expect(analyserTexte(adapte)).toMatchObject({ encodage: "gsm7", segments: 1 });
  });

  it("laisse un caractère sans équivalent (le message part en UCS-2 plutôt que d'être déformé)", () => {
    expect(adapterGsm("漢字")).toBe("漢字");
    expect(analyserTexte(adapterGsm("漢字")).encodage).toBe("ucs2");
  });
});

describe("masquerTelephone", () => {
  it("garde l'indicatif et les 3 derniers chiffres", () => {
    expect(masquerTelephone("+237655012345")).toBe("+237 ••••• 345");
    expect(masquerTelephone("+33612345678")).toBe("+33 ••••• 678");
  });

  it("ne révèle rien d'un numéro trop court", () => {
    expect(masquerTelephone("1234")).toBe("••••");
  });
});

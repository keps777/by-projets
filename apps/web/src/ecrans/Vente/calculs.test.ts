import { describe, expect, it } from "vitest";
import fr from "./i18n.fr.json";
import en from "./i18n.en.json";
import pcm from "./i18n.pcm.json";
import {
  afficherTelephone,
  formaterMontant,
  heureDouala,
  lireMontant,
  lirePiece,
  lireTelephone,
  placesCourtes,
  rangeeAvantAllee,
  renduCash,
  totalAPayer,
} from "./calculs";

function cles(objet: Record<string, unknown>, prefixe = ""): string[] {
  return Object.entries(objet).flatMap(([cle, valeur]) =>
    typeof valeur === "object" && valeur !== null
      ? cles(valeur as Record<string, unknown>, `${prefixe}${cle}.`)
      : [`${prefixe}${cle}`],
  );
}

describe("montants", () => {
  it("met une espace entre les milliers", () => {
    expect(formaterMontant(0)).toBe("0");
    expect(formaterMontant(4000)).toBe("4 000");
    expect(formaterMontant(1_250_000)).toBe("1 250 000");
  });

  it("relit une saisie en nombre entier", () => {
    expect(lireMontant("5 000")).toBe(5000);
    expect(lireMontant("")).toBe(0);
    expect(lireMontant("a1b2")).toBe(12);
  });

  it("additionne le tarif et le bagage choisi", () => {
    expect(totalAPayer(4000, 1000, false)).toBe(4000);
    expect(totalAPayer(4000, 1000, true)).toBe(5000);
  });

  it("calcule le rendu, ou refuse un montant insuffisant", () => {
    expect(renduCash(5000, 4000)).toBe(1000);
    expect(renduCash(4000, 4000)).toBe(0);
    expect(renduCash(3999, 4000)).toBeNull();
  });
});

describe("téléphone et pièce", () => {
  it("affiche le numéro national comme la planche", () => {
    expect(afficherTelephone("+237677301145")).toBe("6 77 30 11 45");
    expect(afficherTelephone(null)).toBe("");
  });

  it("relit la saisie au format du contrat", () => {
    expect(lireTelephone("6 77 30 11 45")).toEqual({ ok: true, valeur: "+237677301145" });
    expect(lireTelephone("+237 677 301 145")).toEqual({ ok: true, valeur: "+237677301145" });
    expect(lireTelephone("")).toEqual({ ok: true, valeur: null });
    expect(lireTelephone("12345")).toEqual({ ok: false });
    expect(lireTelephone("277301145")).toEqual({ ok: false });
  });

  it("accepte quatre chiffres de pièce, ou rien", () => {
    expect(lirePiece("8820")).toEqual({ ok: true, valeur: "8820" });
    expect(lirePiece(" ")).toEqual({ ok: true, valeur: null });
    expect(lirePiece("88")).toEqual({ ok: false });
    expect(lirePiece("88a0")).toEqual({ ok: false });
  });
});

describe("départs et plan", () => {
  it("lit l'heure de Douala dans l'ISO du contrat", () => {
    expect(heureDouala("2027-01-05T08:30:00.000+01:00")).toBe("08:30");
  });

  it("écrit « pl. » sous dix places", () => {
    expect(placesCourtes(9)).toBe(true);
    expect(placesCourtes(10)).toBe(false);
    expect(placesCourtes(28)).toBe(false);
  });

  it("place l'allée au milieu du bus", () => {
    expect(rangeeAvantAllee(44, 11)).toBe(2);
    expect(rangeeAvantAllee(45, 9)).toBe(2);
  });
});

describe("textes", () => {
  it("a les mêmes clés en français, en anglais et en pidgin", () => {
    expect(cles(en)).toEqual(cles(fr));
    expect(cles(pcm)).toEqual(cles(fr));
  });
});

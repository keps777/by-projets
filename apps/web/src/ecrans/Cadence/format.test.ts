import { describe, expect, it } from "vitest";
import {
  dateCourteDeIso,
  ecoule,
  formaterMontant,
  heureDeIso,
  heureDoualaDe,
  secondesAffichees,
  sequenceSur4,
  telephoneAffiche,
  telephoneDeSaisie,
} from "./format";
import fr from "./i18n.fr.json";
import en from "./i18n.en.json";
import pcm from "./i18n.pcm.json";
import frBillet from "../CadenceBillet/i18n.fr.json";
import enBillet from "../CadenceBillet/i18n.en.json";
import pcmBillet from "../CadenceBillet/i18n.pcm.json";

function cles(objet: unknown, prefixe = ""): string[] {
  if (typeof objet !== "object" || objet === null) return [prefixe];
  return Object.entries(objet).flatMap(([cle, valeur]) =>
    cles(valeur, prefixe === "" ? cle : `${prefixe}.${cle}`),
  );
}

describe("formats de la cadence", () => {
  it("formate les montants avec une espace simple", () => {
    expect(formaterMontant(4000)).toBe("4 000");
    expect(formaterMontant(1000)).toBe("1 000");
    expect(formaterMontant(950)).toBe("950");
    expect(formaterMontant(1250000)).toBe("1 250 000");
  });

  it("numérote les billets sur 4 chiffres", () => {
    expect(sequenceSur4(232)).toBe("0232");
    expect(sequenceSur4(1001)).toBe("1001");
  });

  it("lit l'heure de Douala d'un instant, avec ou sans secondes", () => {
    const instant = new Date("2027-01-05T05:14:52+01:00");
    expect(heureDoualaDe(instant)).toBe("05:14");
    expect(heureDoualaDe(instant, true)).toBe("05:14:52");
    expect(heureDoualaDe(new Date("2027-01-05T23:59:00+01:00"))).toBe("23:59");
  });

  it("découpe une heure ISO de Douala", () => {
    expect(heureDeIso("2027-01-05T05:30:00.000+01:00")).toBe("05:30");
    expect(dateCourteDeIso("2027-01-05T05:30:00.000+01:00")).toBe("05.01.27");
  });

  it("compte le temps écoulé en secondes, minutes puis heures, jamais négatif", () => {
    const maintenant = new Date("2027-01-05T05:14:00+01:00");
    expect(ecoule("2027-01-05T05:13:43+01:00", maintenant)).toEqual({ unite: "secondes", n: 17 });
    expect(ecoule("2027-01-05T05:09:00+01:00", maintenant)).toEqual({ unite: "minutes", n: 5 });
    expect(ecoule("2027-01-05T02:50:00+01:00", maintenant)).toEqual({
      unite: "heures",
      h: 2,
      m: "24",
    });
    expect(ecoule("2027-01-05T05:20:00+01:00", maintenant)).toEqual({ unite: "secondes", n: 0 });
  });

  it("affiche la durée d'une vente avec une virgule", () => {
    expect(secondesAffichees(1800)).toBe("1,8");
    expect(secondesAffichees(1849)).toBe("1,8");
    expect(secondesAffichees(0)).toBe("0,0");
    expect(secondesAffichees(12340)).toBe("12,3");
  });

  it("transforme un numéro saisi en numéro international, ou refuse", () => {
    expect(telephoneDeSaisie("677301145")).toBe("+237677301145");
    expect(telephoneDeSaisie("6 77 30 11 45")).toBe("+237677301145");
    expect(telephoneDeSaisie("+237677301145")).toBe("+237677301145");
    expect(telephoneDeSaisie("237677301145")).toBe("+237677301145");
    expect(telephoneDeSaisie("6773")).toBeNull();
    expect(telephoneDeSaisie("")).toBeNull();
  });

  it("regroupe un numéro pour l'affichage", () => {
    expect(telephoneAffiche("+237677301145")).toBe("6 77 30 11 45");
  });
});

describe("textes des écrans Cadence et CadenceBillet", () => {
  it("ont les mêmes clés en français, en anglais et en pidgin", () => {
    expect(cles(en)).toEqual(cles(fr));
    expect(cles(pcm)).toEqual(cles(fr));
    expect(cles(enBillet)).toEqual(cles(frBillet));
    expect(cles(pcmBillet)).toEqual(cles(frBillet));
  });
});

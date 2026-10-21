import type { agence } from "@afrimove/contrats";
import { describe, expect, it } from "vitest";
import en from "./i18n.en.json";
import fr from "./i18n.fr.json";
import pcm from "./i18n.pcm.json";
import { heureDouala, heureLimite, heureSecondes, pourcentage, premierScanDe } from "./calculs";

function cles(objet: Record<string, unknown>, prefixe = ""): string[] {
  return Object.entries(objet).flatMap(([cle, valeur]) =>
    typeof valeur === "object" && valeur !== null
      ? cles(valeur as Record<string, unknown>, `${prefixe}${cle}.`)
      : [`${prefixe}${cle}`],
  );
}

describe("heures", () => {
  it("lisent les heures de Douala du contrat", () => {
    expect(heureDouala("2027-01-05T08:19:42.000+01:00")).toBe("08:19");
    expect(heureSecondes("2027-01-05T08:19:42.000+01:00")).toBe("08:19:42");
  });

  it("donnent l'heure limite 5 minutes avant le départ", () => {
    expect(heureLimite("2027-01-05T08:30:00.000+01:00")).toBe("08:25");
    expect(heureLimite("2027-01-05T09:02:00.000+01:00")).toBe("08:57");
    expect(heureLimite("2027-01-05T00:03:00.000+01:00")).toBe("00:00");
  });
});

describe("pourcentage embarqué", () => {
  it("arrondit et borne", () => {
    expect(pourcentage(31, 40)).toBe(78);
    expect(pourcentage(0, 40)).toBe(0);
    expect(pourcentage(45, 40)).toBe(100);
    expect(pourcentage(3, 0)).toBe(0);
  });
});

describe("premier scan d'un billet déjà scanné", () => {
  const iso = (h: string) => `2027-01-05T${h}.000+01:00`;
  const scan = (billetId: string, resultat: agence.ScanQuai["resultat"]): agence.ScanQuai => ({
    billetId,
    numero: "N",
    resultat,
    at: iso("08:26:00"),
    voyageur: null,
    siege: null,
    pieceQuatreDerniers: null,
    classe: "classique",
    bagagesSoute: 0,
  });
  const quai = {
    dernierScan: scan("b1", "monte"),
    refuses: { nombre: 1, motif: "deja_scanne", premierScanA: iso("07:58:00") },
  } as unknown as agence.QuaiEmbarquement;
  const dernier = { ...quai.dernierScan!, at: iso("08:19:42") };
  const quaiAvecDernier = { ...quai, dernierScan: dernier } as agence.QuaiEmbarquement;

  it("préfère le scan vu sur cet écran, puis le dernier scan du quai, puis le compteur de refusés", () => {
    const ici = new Map([["b2", iso("08:21:00")]]);
    expect(premierScanDe(scan("b2", "deja_scanne"), quaiAvecDernier, ici)).toBe(iso("08:21:00"));
    expect(premierScanDe(scan("b1", "deja_scanne"), quaiAvecDernier, new Map())).toBe(
      iso("08:19:42"),
    );
    expect(premierScanDe(scan("b3", "deja_scanne"), quaiAvecDernier, new Map())).toBe(
      iso("07:58:00"),
    );
  });
});

describe("textes", () => {
  it("ont les mêmes clés en français, en anglais et en pidgin", () => {
    expect(cles(en)).toEqual(cles(fr));
    expect(cles(pcm)).toEqual(cles(fr));
  });
});

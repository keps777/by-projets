import type { patron } from "@afrimove/contrats";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  csvDeLApercu,
  nomDuFichierApercu,
  remettreLeFichier,
  telechargerApercu,
} from "./telechargement";

function apercu(lignes: patron.ApercuExport["tableau"]["lignes"]): patron.ApercuExport {
  return {
    export: {
      id: "journal_ventes",
      format: "XLSX",
      nom: "Journal des ventes · décembre",
      lignes: 31_404,
      colonnes: 3,
      tailleOctets: 1_200_000,
      genereA: "2027-01-05T07:38:00.000+01:00",
    },
    onglets: [{ id: "ventes", libelle: "Ventes · 31 404" }],
    tableau: {
      colonnes: ["date", "ligne", "prix"],
      lignes,
      premiere: 1,
      derniere: lignes.length,
      total: 31_404,
      totalMontant: 28_414_000,
    },
    signe: true,
  };
}

describe("csvDeLApercu", () => {
  it("écrit l'entête puis les lignes de l'aperçu, dans l'ordre, séparées par « ; »", () => {
    const csv = csvDeLApercu(
      apercu([
        ["2026-12-01", "DLA-YDE", 5000],
        ["2026-12-01", "COLIS", 3000],
      ]),
    );
    expect(csv).toBe("date;ligne;prix\r\n2026-12-01;DLA-YDE;5000\r\n2026-12-01;COLIS;3000\r\n");
  });

  it("laisse vide une cellule vide et protège le séparateur, les guillemets et les sauts de ligne", () => {
    const csv = csvDeLApercu(
      apercu([
        ["2026-12-01", null, 5000],
        ["a;b", 'dit "oui"', 1],
        ["x\ny", "z", 2],
      ]),
    );
    expect(csv).toBe(
      'date;ligne;prix\r\n2026-12-01;;5000\r\n"a;b";"dit ""oui""";1\r\n"x\ny";z;2\r\n',
    );
  });
});

describe("nomDuFichierApercu", () => {
  it("reprend le nom de l'export et dit qu'il ne s'agit que des lignes de l'aperçu", () => {
    expect(nomDuFichierApercu(apercu([]))).toBe("journal-des-ventes-decembre-apercu.csv");
  });
});

describe("remettreLeFichier", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("clique un lien temporaire portant le nom du fichier, puis le retire et libère l'adresse", async () => {
    vi.useFakeTimers();
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
      blobs.push(b as Blob);
      return "blob:test";
    });
    URL.revokeObjectURL = vi.fn();
    const liens: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      liens.push(this);
      expect(document.body.contains(this)).toBe(true);
    });

    remettreLeFichier("export.csv", "a;b\r\n");

    expect(liens).toHaveLength(1);
    expect(liens[0]?.download).toBe("export.csv");
    expect(liens[0]?.getAttribute("href")).toBe("blob:test");
    expect(document.body.contains(liens[0] as HTMLAnchorElement)).toBe(false);
    expect(blobs[0]?.type).toBe("text/csv;charset=utf-8");
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
  });

  it("telechargerApercu remet le CSV de l'aperçu sous le nom de l'aperçu", async () => {
    const blobs: Blob[] = [];
    URL.createObjectURL = vi.fn((b: Blob | MediaSource) => {
      blobs.push(b as Blob);
      return "blob:test";
    });
    URL.revokeObjectURL = vi.fn();
    const noms: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      noms.push(this.download);
    });

    telechargerApercu(apercu([["2026-12-01", "DLA-YDE", 5000]]));

    expect(noms).toEqual(["journal-des-ventes-decembre-apercu.csv"]);
    const octets = await new Promise<ArrayBuffer>((resolve) => {
      const lecteur = new FileReader();
      lecteur.onload = () => resolve(lecteur.result as ArrayBuffer);
      lecteur.readAsArrayBuffer(blobs[0] as Blob);
    });
    const texte = new TextDecoder("utf-8", { ignoreBOM: true }).decode(octets);
    // L'octet d'ordre (BOM) est écrit pour le tableur, puis le CSV.
    expect(texte).toBe("\uFEFFdate;ligne;prix\r\n2026-12-01;DLA-YDE;5000\r\n");
  });
});

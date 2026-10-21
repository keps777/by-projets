import { describe, expect, it } from "vitest";
import { analyser, hauteurDuFlux } from "../test-outils";
import { bitmapEnTexte, bitmapVide, lirePoint, poserPoint } from "./bitmap";
import {
  MOTIFS_CODE128,
  bitmapCodeBarres,
  modulesCode128,
  moduleQuiTient,
  symbolesCode128,
} from "./code128";
import { decoderPc850, encoderTexte } from "./codepage";
import { ConstructeurEscPos } from "./constructeur";
import { bitmapLogo, bitmapQr, modulesQr } from "./images";

/** Moitié haute de PC850 telle que la donne la table officielle (Python : bytes(range(0x80, 0x100)).decode("cp850")). */
const PC850_REFERENCE =
  "ÇüéâäàåçêëèïîìÄÅÉæÆôöòûùÿÖÜø£Ø×ƒáíóúñÑªº¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµþÞÚÛÙýÝ¯´­±‗¾¶§÷¸°¨·¹³²■ ";

describe("page de code PC850", () => {
  it("encode toute la moitié haute comme la table officielle", () => {
    const octets = encoderTexte(PC850_REFERENCE);
    expect(octets).toEqual(Array.from({ length: 128 }, (_, i) => 0x80 + i));
    expect(decoderPc850(octets)).toBe(PC850_REFERENCE);
  });

  it("encode les accents du français et la virgule médiane des maquettes", () => {
    expect(encoderTexte("é")).toEqual([0x82]);
    expect(encoderTexte("È")).toEqual([0xd4]);
    const octets = encoderTexte("SIÈGE · à Aïcha");
    expect(octets).toHaveLength(15);
    expect(octets[2]).toBe(0xd4);
    expect(octets[6]).toBe(0xfa);
    expect(octets[8]).toBe(0x85);
    expect(octets[11]).toBe(0x8b);
  });

  it("remplace la flèche et les tirets longs par de l'ASCII, et les inconnus par un point d'interrogation", () => {
    expect(decoderPc850(encoderTexte("DLA → YDE"))).toBe("DLA -> YDE");
    expect(decoderPc850(encoderTexte("a – b"))).toBe("a - b");
    expect(decoderPc850(encoderTexte("4 000 F"))).toBe("4 000 F");
    expect(decoderPc850(encoderTexte("日"))).toBe("?");
  });

  it("retire les sauts de ligne et caractères de commande qui casseraient la mise en page", () => {
    expect(decoderPc850(encoderTexte("a\nb\u001bc"))).toBe("a bc");
  });
});

describe("Code 128", () => {
  it("a 107 motifs de 11 modules (13 pour l'arrêt), de parité paire, tous différents", () => {
    expect(MOTIFS_CODE128).toHaveLength(107);
    for (const [valeur, motif] of MOTIFS_CODE128.entries()) {
      const chiffres = [...motif].map(Number);
      expect(chiffres.reduce((a, b) => a + b, 0)).toBe(valeur === 106 ? 13 : 11);
      const barres = chiffres.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0);
      expect(barres % 2).toBe(0);
    }
    expect(new Set(MOTIFS_CODE128).size).toBe(107);
  });

  it("calcule le caractère de contrôle (« PJJ123C » : 54 en jeu A comme sur Wikipédia, 55 en jeu B)", () => {
    const symboles = symbolesCode128("PJJ123C");
    expect(symboles[0]).toBe(104);
    // (104 + 48×1 + 42×2 + 42×3 + 17×4 + 18×5 + 19×6 + 35×7) mod 103
    expect(symboles.at(-2)).toBe(55);
    expect(symboles.at(-1)).toBe(106);
  });

  /* Chaînes de modules produites par python-barcode (Code128) pour les mêmes textes. */
  it("produit les mêmes barres qu'un encodeur de référence", () => {
    const vers = (t: string) =>
      modulesCode128(t)
        .map((b) => (b ? "1" : "0"))
        .join("");
    expect(vers("Hi")).toBe("110100100001100010100010000110100100111101001100011101011");
    expect(vers("C-ALP-DLA-270105-0042").slice(0, 80)).toBe(
      "11010010000100010001101001101110010100011000100011011101110111011010011011100101",
    );
  });

  it("repasse en jeu C pour les longues suites de chiffres et y gagne en largeur", () => {
    expect(symbolesCode128("0123456789")[0]).toBe(105);
    expect(symbolesCode128("AB")[0]).toBe(104);
    expect(symbolesCode128("C-ALP-DLA-270105-0042")).toContain(99);
    expect(modulesCode128("C-ALP-DLA-270105-0042")).toHaveLength(244);
  });

  it("se relit : décoder les modules redonne le texte", () => {
    const decoder = (modules: boolean[]): string => {
      const valeurs: number[] = [];
      let i = 0;
      while (i < modules.length) {
        const taille = modules.length - i === 13 ? 13 : 11;
        const bits = modules.slice(i, i + taille);
        const motif: number[] = [];
        let courant = bits[0];
        let n = 0;
        for (const b of bits) {
          if (b === courant) n += 1;
          else {
            motif.push(n);
            n = 1;
            courant = b;
          }
        }
        motif.push(n);
        valeurs.push(MOTIFS_CODE128.indexOf(motif.join("")));
        i += taille;
      }
      let jeu = valeurs[0] === 105 ? "C" : "B";
      let texte = "";
      for (const v of valeurs.slice(1, -2)) {
        if (v === 99) jeu = "C";
        else if (v === 100) jeu = "B";
        else texte += jeu === "C" ? String(v).padStart(2, "0") : String.fromCharCode(v + 32);
      }
      return texte;
    };
    for (const t of [
      "C-ALP-DLA-270105-0042",
      "ALP-DLA-270105-0232",
      "AM1:ALP-DLA-270105-0232:9047",
      "12345",
      "ab1234cd",
      "0123456789",
    ]) {
      expect(decoder(modulesCode128(t))).toBe(t);
    }
  });

  it("refuse un texte vide ou non imprimable", () => {
    expect(() => modulesCode128("")).toThrow();
    expect(() => modulesCode128("é")).toThrow();
  });

  it("choisit le plus grand module qui tient dans le papier de 384 points", () => {
    expect(moduleQuiTient("C-ALP-DLA-270105-0042", 384)).toBe(1);
    expect(moduleQuiTient("12", 384)).toBe(3);
  });

  it("dessine les barres avec une zone de silence blanche", () => {
    const image = bitmapCodeBarres("Hi", { module: 2, hauteur: 10, silence: 4 });
    expect(image.largeur).toBe((57 + 8) * 2);
    expect(lirePoint(image, 0, 0)).toBe(false);
    expect(lirePoint(image, 8, 0)).toBe(true);
    expect(lirePoint(image, 8, 9)).toBe(true);
  });
});

describe("images", () => {
  it("tasse les points dans des octets, bit de poids fort à gauche", () => {
    const image = bitmapVide(10, 2);
    poserPoint(image, 0, 0);
    poserPoint(image, 9, 1);
    expect(image.octetsParLigne).toBe(2);
    expect(Array.from(image.donnees)).toEqual([0x80, 0x00, 0x00, 0x40]);
  });

  it("le QR code tient dans 3 cm (240 points) avec des modules entiers", () => {
    const contenu = "AM1:ALP-DLA-270105-0232:9047";
    const n = modulesQr(contenu);
    const image = bitmapQr(contenu, { cotePoints: 240 });
    const module = image.largeur / (n + 4);
    expect(Number.isInteger(module)).toBe(true);
    expect(n * module).toBeLessThanOrEqual(240);
    expect(n * module).toBeGreaterThan(200);
    expect(image.largeur).toBe(image.hauteur);
  });

  it("le logo monochrome est stable (carré arrondi, tuile blanche, grisé, A)", () => {
    expect(bitmapEnTexte(bitmapLogo(48))).toMatchSnapshot();
  });
});

describe("constructeur ESC/POS", () => {
  it("écrit les ordres attendus pour une ligne centrée en gras et en double taille", () => {
    const octets = new ConstructeurEscPos()
      .initialiser()
      .ligne([{ texte: "Ab", gras: true, l: 2, h: 2 }], { alignement: "centre", ecart: 4 })
      .construire();
    expect(Array.from(octets)).toEqual([
      0x1b, 0x40, 0x1b, 0x74, 2, 0x1b, 0x61, 1, 0x1b, 0x33, 52, 0x1b, 0x4d, 0, 0x1b, 0x45, 1, 0x1d,
      0x21, 0x11, 0x41, 0x62, 0x0a, 0x1b, 0x4d, 0, 0x1b, 0x45, 0, 0x1d, 0x21, 0,
    ]);
  });

  it("découpe l'avance papier en ordres de 255 points au plus", () => {
    const octets = new ConstructeurEscPos().avancer(600).construire();
    expect(analyser(octets)).toEqual(["AVANCER 255", "AVANCER 255", "AVANCER 90"]);
  });

  it("découpe une grande image en bandes de 128 lignes", () => {
    const image = bitmapVide(16, 300);
    const lignes = analyser(new ConstructeurEscPos().image(image).construire()).filter((l) =>
      l.startsWith("IMAGE"),
    );
    expect(lignes.map((l) => l.split(" ")[1])).toEqual(["16x128", "16x128", "16x44"]);
  });

  it("suit la hauteur de papier consommée, qui est celle du flux", () => {
    const sortie = new ConstructeurEscPos()
      .initialiser()
      .ligne("abc", { ecart: 2 })
      .image(bitmapVide(8, 40), "centre", 4)
      .avancer(10);
    expect(sortie.hauteur()).toBe(26 + 40 + 4 + 10);
    expect(hauteurDuFlux(sortie.construire())).toBe(sortie.hauteur());
  });
});

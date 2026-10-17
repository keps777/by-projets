import type { agence as c } from "@afrimove/contrats";
import { ecrans } from "@afrimove/fixtures";
import { describe, expect, it } from "vitest";
import { decoderPc850 } from "../escpos/codepage";
import { CELLULE } from "../escpos/constructeur";
import { modulesQr } from "../escpos/images";
import { analyser, hauteurDuFlux } from "../test-outils";
import { PIED_BILLET, genererBillet, mettreEnPageBillet, type DonneesBillet } from "./billet";
import {
  ETIQUETTE_HAUTEUR_POINTS,
  genererEtiquette,
  mettreEnPageEtiquette,
  type DonneesEtiquette,
} from "./etiquette";
import {
  departBillet,
  donneesBilletDepuisContrat,
  donneesEtiquetteDepuisContrat,
  heureCourte,
  poidsAffiche,
} from "./formats";
import { texteDe } from "./mise-en-page";

/** Le billet 0232 de la planche CadenceBillet, tel que les fixtures l'écrivent. */
const maquetteBillet = ecrans.CadenceBillet.donnees.billet;
const billet: DonneesBillet = {
  compagnie: maquetteBillet.compagnie,
  trajet: maquetteBillet.trajet,
  depart: maquetteBillet.depart,
  siege: "19",
  classe: "CLASSIQUE",
  nom: null,
  piece: null,
  qr: "AM1:ALP-DLA-270105-0232:9047",
  code: "9047",
  numero: maquetteBillet.numero,
  pied: maquetteBillet.pied,
};

/** L'étiquette du colis 0042 de la planche GuichetColis. */
const maquetteEtiquette = ecrans.GuichetColis.donnees.etiquette;
const etiquette: DonneesEtiquette = {
  trajet: maquetteEtiquette.trajet,
  destinataire: maquetteEtiquette.destinataire,
  reference: "C-ALP-DLA-270105-0042",
  poids: "2 kg",
  heure: "08:15",
  mention: maquetteEtiquette.pied,
};

/** Largeur en points de chaque ligne imprimée, pour vérifier que rien ne dépasse les 384 points du papier. */
function largeursDesLignes(octets: Uint8Array): number[] {
  const largeurs: number[] = [];
  let police: "A" | "B" = "A";
  let l = 1;
  let courante = 0;
  for (const ligne of analyser(octets)) {
    if (ligne.startsWith("POLICE ")) police = ligne.endsWith("A") ? "A" : "B";
    else if (ligne.startsWith("TAILLE ")) l = Number(ligne.slice(7).split("x")[0]);
    else if (ligne.startsWith("TEXTE ")) {
      courante += (JSON.parse(ligne.slice(6)) as string).length * CELLULE[police].l * l;
    } else if (ligne === "LF") {
      largeurs.push(courante);
      courante = 0;
    }
  }
  return largeurs;
}

describe("billet", () => {
  it("imprime les lignes de l'aperçu de la planche CadenceBillet, dans l'ordre", () => {
    const lignes = mettreEnPageBillet(billet)
      .map(texteDe)
      .filter((t) => t !== "");
    expect(lignes).toEqual([
      maquetteBillet.compagnie,
      maquetteBillet.trajet,
      maquetteBillet.depart,
      maquetteBillet.siege,
      "-".repeat(32),
      maquetteBillet.nom,
      maquetteBillet.piece,
      maquetteBillet.code,
      maquetteBillet.numero,
      maquetteBillet.pied,
    ]);
  });

  it("produit les octets ESC/POS attendus (snapshot du flux)", () => {
    expect(analyser(genererBillet(billet))).toMatchSnapshot();
  });

  it("met la ligne et l'heure en gros, le code à 4 chiffres en très gros", () => {
    const flux = analyser(genererBillet(billet));
    const apres = (texte: string) => flux[flux.indexOf(`TEXTE ${JSON.stringify(texte)}`) - 1];
    expect(apres("DLA -> YDE")).toBe("TAILLE 2x2");
    expect(apres("05:30 · 05.01.27")).toBe("TAILLE 2x2");
    expect(apres("9 0 4 7")).toBe("TAILLE 3x3");
  });

  it("dessine un QR de 3 cm : modules entiers, 29 mm pour 29 modules", () => {
    const flux = analyser(genererBillet(billet));
    const images = flux.filter((l) => l.startsWith("IMAGE"));
    const n = modulesQr(billet.qr);
    const module = Math.floor(240 / n);
    const cote = (n + 4) * module;
    const largeur = Math.ceil(cote / 8) * 8;
    // Le logo (48 points) tient en une bande ; le QR est envoyé en bandes de 128 lignes.
    const bandes = images.filter((l) => l.startsWith(`IMAGE ${largeur}x`));
    expect(images).toHaveLength(1 + bandes.length);
    const hauteurs = bandes.map((l) => Number(l.split(" ")[1]?.split("x")[1]));
    expect(hauteurs.reduce((a, b) => a + b, 0)).toBe(cote);
    expect(n * module).toBeGreaterThanOrEqual(224);
    expect(n * module).toBeLessThanOrEqual(240);
  });

  it("n'écrit rien de plus large que le papier de 58 mm", () => {
    for (const variante of [
      billet,
      { ...billet, nom: "Tchoumi Paul Armand Boniface Sandjong", piece: "4471" },
      { ...billet, trajet: "DOUALA → YAOUNDÉ", compagnie: "BÊTA EXPRESS TRANSPORTS INTERURBAINS" },
    ]) {
      for (const largeur of largeursDesLignes(genererBillet(variante))) {
        expect(largeur).toBeLessThanOrEqual(384);
      }
    }
  });

  it("imprime le nom et la pièce quand ils sont connus", () => {
    const lignes = mettreEnPageBillet({ ...billet, nom: "Tchoumi Paul", piece: "4471" })
      .map(texteDe)
      .filter((t) => t.startsWith("NOM") || t.startsWith("PIÈCE"));
    expect(lignes).toEqual(["NOM : Tchoumi Paul", "PIÈCE : 4471"]);
  });

  it("replie un nom trop long sous la première ligne", () => {
    const lignes = mettreEnPageBillet({ ...billet, nom: "Tchoumi Paul Armand Boniface Sandjong" })
      .map(texteDe)
      .filter((t) => t.startsWith("NOM") || t.startsWith("      "));
    expect(lignes).toEqual(["NOM : Tchoumi Paul Armand", "      Boniface Sandjong"]);
  });

  it("refuse un code qui n'a pas 4 chiffres ou un QR vide", () => {
    expect(() => genererBillet({ ...billet, code: "90" })).toThrow(/4 chiffres/);
    expect(() => genererBillet({ ...billet, qr: "" })).toThrow(/QR/);
  });

  it("garde le pied par défaut de la maquette", () => {
    expect(PIED_BILLET).toBe("Au quai 20 min avant · afrimove.cm");
  });

  it("écrit un billet sans siège sans la mention « SIÈGE »", () => {
    const textes = mettreEnPageBillet({ ...billet, siege: null }).map(texteDe);
    expect(textes).toContain("CLASSIQUE");
  });

  it("est reproductible : mêmes données, mêmes octets", () => {
    expect(genererBillet(billet)).toEqual(genererBillet({ ...billet }));
  });

  it("reste petit à envoyer par Bluetooth (moins de 10 Ko)", () => {
    expect(genererBillet(billet).length).toBeLessThan(10_000);
  });
});

describe("étiquette colis 58 × 40", () => {
  it("imprime les lignes de l'aperçu de la planche GuichetColis", () => {
    const textes = mettreEnPageEtiquette(etiquette)
      .map(texteDe)
      .filter((t) => t !== "");
    expect(textes[0]).toBe(maquetteEtiquette.trajet);
    expect(textes[1]).toBe(maquetteEtiquette.destinataire);
    expect(textes[2]).toBe(maquetteEtiquette.reference);
    expect(textes.slice(3).join(" · ")).toBe(maquetteEtiquette.pied);
  });

  it("produit les octets ESC/POS attendus (snapshot du flux)", () => {
    expect(analyser(genererEtiquette(etiquette))).toMatchSnapshot();
  });

  it("fait exactement 40 mm de haut (320 points) et rien de plus large que 58 mm", () => {
    const octets = genererEtiquette(etiquette);
    expect(hauteurDuFlux(octets)).toBe(ETIQUETTE_HAUTEUR_POINTS);
    expect(ETIQUETTE_HAUTEUR_POINTS / 8).toBe(40);
    for (const largeur of largeursDesLignes(octets)) expect(largeur).toBeLessThanOrEqual(384);
  });

  it("dessine le code-barres de la référence (Code 128, 244 modules d'un point)", () => {
    const image = analyser(genererEtiquette(etiquette)).find((l) => l.startsWith("IMAGE"));
    // (244 modules + 2 × 4 de silence) = 252 points, arrondis à 32 octets.
    expect(image).toMatch(/^IMAGE 256x80 /);
  });

  it("n'imprime jamais le code de retrait, même si l'appelant en passe un", () => {
    const empoisonne = {
      ...etiquette,
      codeRetrait: "483920",
      codeRetraitHache: "9e9e27087eb235a8",
    } as DonneesEtiquette;
    const octets = genererEtiquette(empoisonne);
    expect(octets).toEqual(genererEtiquette(etiquette));
    const texte = analyser(octets).join("\n");
    expect(texte).not.toContain("483920");
    expect(texte).not.toContain("9e9e27087eb235a8");
    expect(decoderPc850(octets)).not.toContain("483920");
  });

  it("reste lisible avec des noms longs : tient dans la hauteur de l'étiquette", () => {
    const longue: DonneesEtiquette = {
      ...etiquette,
      trajet: "DLA → BAF",
      destinataire: "Ngo Thérèse Marie-Claire Nkoulou · ···· 18 22",
      mention: "Alpha Voyages Transports Interurbains · afrimove.cm · pas de code ici",
    };
    const octets = genererEtiquette(longue);
    expect(hauteurDuFlux(octets)).toBe(ETIQUETTE_HAUTEUR_POINTS);
    for (const largeur of largeursDesLignes(octets)) expect(largeur).toBeLessThanOrEqual(384);
  });

  it("refuse une étiquette qui ne tiendrait pas sur 40 mm", () => {
    const enorme = { ...etiquette, destinataire: "x ".repeat(400) };
    expect(() => genererEtiquette(enorme)).toThrow(/dépasse/);
  });
});

describe("depuis les contrats d'API", () => {
  const contrat: c.BilletImprimable = {
    billetId: "bil-0232" as c.BilletImprimable["billetId"],
    numero: "ALP-DLA-270105-0232",
    sequence: 232,
    compagnie: "Alpha Voyages",
    trajet: { origine: "DLA", destination: "YDE" },
    heureDepart: "2027-01-05T05:30:00+01:00" as c.BilletImprimable["heureDepart"],
    siege: 19,
    classe: "classique",
    passager: { nom: null, pieceQuatreDerniers: null },
    codeBillet: "9047",
    qr: "AM1:ALP-DLA-270105-0232:9047",
    prix: 4000 as c.BilletImprimable["prix"],
    aCompleterAuQuai: true,
  };

  it("un BilletImprimable donne exactement les données de l'aperçu", () => {
    expect(donneesBilletDepuisContrat(contrat)).toEqual(billet);
  });

  it("l'étiquette du formulaire donne exactement les données de l'aperçu", () => {
    const donnees = donneesEtiquetteDepuisContrat(
      {
        trajet: { origine: "DLA", destination: "BAF" },
        destinataireMasque: "···· 18 22",
        poidsKg: 2,
        heureDepart: "2027-01-05T08:15:00+01:00",
      },
      {
        reference: "C-ALP-DLA-270105-0042",
        destinataireNom: "Ngo Thérèse",
        compagnie: "Alpha Voyages",
      },
    );
    expect(donnees).toEqual(etiquette);
  });

  it("formate les heures et poids comme les écrans", () => {
    expect(departBillet("2027-01-05T05:30:00+01:00")).toBe("05:30 · 05.01.27");
    expect(heureCourte("2027-01-05T08:15:00.000+01:00")).toBe("08:15");
    expect(poidsAffiche(2)).toBe("2 kg");
    expect(poidsAffiche(2.5)).toBe("2,5 kg");
    expect(() => heureCourte("demain")).toThrow();
  });
});

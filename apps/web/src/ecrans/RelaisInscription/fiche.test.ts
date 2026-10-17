import { beforeEach, describe, expect, it } from "vitest";
import {
  CLE_BROUILLON,
  decouperEngagement,
  estEnvoyable,
  garderBrouillon,
  lireMomo,
  lirePosition,
  oublierBrouillon,
  problemesDe,
  reprendreBrouillon,
  versBrouillon,
  versFiche,
  type Saisie,
} from "./fiche";

const SAISIE: Saisie = {
  nom: "Boutique Chez Thérèse",
  type: "Boutique · alimentation",
  ouvert: "7 h – 20 h · lun.–sam.",
  position: "Bafoussam · Tamdja, face école publique",
  tailleMax: "Petits et moyens (≤ 10 kg)",
  momo: "6 99 12 34 41 · Orange",
  facadeRef: "photo-1",
};

const CHOIX = {
  type: ["Boutique · alimentation", "Pharmacie"],
  ouvert: ["7 h – 20 h · lun.–sam.", "7 h – 22 h · 7 j / 7"],
  tailleMax: ["Petits et moyens (≤ 10 kg)", "Tous (≤ 30 kg)"],
};

beforeEach(() => oublierBrouillon());

describe("lirePosition", () => {
  it("sépare la ville, le quartier et le repère", () => {
    expect(lirePosition("Bafoussam · Tamdja, face école publique")).toEqual({
      ville: "Bafoussam",
      quartier: "Tamdja",
      repere: "face école publique",
    });
  });

  it("accepte une position sans repère, sans clé « repere » vide", () => {
    const position = lirePosition("Douala · Akwa");
    expect(position).toEqual({ ville: "Douala", quartier: "Akwa" });
    expect(position).not.toHaveProperty("repere");
  });

  it("garde les virgules du repère", () => {
    expect(lirePosition("Douala · Akwa, face la poste, côté gauche")?.repere).toBe(
      "face la poste, côté gauche",
    );
  });

  it("refuse une position sans ville ou sans quartier", () => {
    expect(lirePosition("")).toBeNull();
    expect(lirePosition("Douala")).toBeNull();
    expect(lirePosition("Douala · ")).toBeNull();
    expect(lirePosition(" · Akwa")).toBeNull();
  });
});

describe("lireMomo", () => {
  it("lit un numéro écrit avec des espaces, avec l'opérateur écrit à côté", () => {
    expect(lireMomo("6 99 12 34 41 · Orange")).toEqual({
      telephone: "+237699123441",
      operateur: "orange",
    });
    expect(lireMomo("677 12 34 41 · MTN")).toEqual({
      telephone: "+237677123441",
      operateur: "mtn",
    });
  });

  it("accepte l'indicatif du pays", () => {
    expect(lireMomo("+237 6 77 12 34 41")?.telephone).toBe("+237677123441");
    expect(lireMomo("237677123441")?.telephone).toBe("+237677123441");
  });

  it("déduit l'opérateur du préfixe quand il n'est pas écrit", () => {
    expect(lireMomo("699123441")?.operateur).toBe("orange");
    expect(lireMomo("655123441")?.operateur).toBe("orange");
    expect(lireMomo("650123441")?.operateur).toBe("mtn");
    expect(lireMomo("671234412")?.operateur).toBe("mtn");
    expect(lireMomo("683123441")?.operateur).toBe("mtn");
  });

  it("préfère l'opérateur écrit à celui du préfixe", () => {
    expect(lireMomo("699123441 MTN")?.operateur).toBe("mtn");
  });

  it("ne lit jamais le numéro masqué du serveur", () => {
    expect(lireMomo("6 99 •• •• 41 · Orange")).toBeNull();
  });

  it("refuse un numéro trop court, trop long, qui ne commence pas par 6, ou d'opérateur inconnu", () => {
    expect(lireMomo("")).toBeNull();
    expect(lireMomo("69912344")).toBeNull();
    expect(lireMomo("6991234412")).toBeNull();
    expect(lireMomo("299123441")).toBeNull();
    expect(lireMomo("660123441")).toBeNull();
  });
});

describe("problemes et fiche complète", () => {
  it("une saisie complète n'a aucun problème et donne la fiche du contrat", () => {
    expect(estEnvoyable(problemesDe(SAISIE))).toBe(true);
    expect(versFiche(SAISIE)).toEqual({
      nom: "Boutique Chez Thérèse",
      type: "Boutique · alimentation",
      ouvert: "7 h – 20 h · lun.–sam.",
      position: { ville: "Bafoussam", quartier: "Tamdja", repere: "face école publique" },
      tailleMax: "Petits et moyens (≤ 10 kg)",
      momo: { telephone: "+237699123441", operateur: "orange" },
      facadeRef: "photo-1",
    });
  });

  it("nomme chaque problème", () => {
    expect(problemesDe({ ...SAISIE, nom: "   " })).toMatchObject({ nom: true, momo: false });
    expect(problemesDe({ ...SAISIE, position: "Douala" })).toMatchObject({ position: true });
    expect(problemesDe({ ...SAISIE, momo: "6 99 •• •• 41 · Orange" })).toMatchObject({
      momo: true,
    });
    expect(problemesDe({ ...SAISIE, facadeRef: null })).toMatchObject({ facade: true });
  });

  it("ne fabrique pas de fiche tant qu'un champ manque", () => {
    expect(versFiche({ ...SAISIE, nom: "" })).toBeNull();
    expect(versFiche({ ...SAISIE, momo: "6 99 •• •• 41 · Orange" })).toBeNull();
    expect(versFiche({ ...SAISIE, facadeRef: null })).toBeNull();
    expect(estEnvoyable(problemesDe({ ...SAISIE, facadeRef: null }))).toBe(false);
  });

  it("retire les espaces autour du nom", () => {
    expect(versFiche({ ...SAISIE, nom: "  Chez Thérèse  " })?.nom).toBe("Chez Thérèse");
  });
});

describe("versBrouillon", () => {
  it("garde les choix et ce qui est déjà complet", () => {
    expect(versBrouillon(SAISIE)).toEqual({
      nom: "Boutique Chez Thérèse",
      type: "Boutique · alimentation",
      ouvert: "7 h – 20 h · lun.–sam.",
      position: { ville: "Bafoussam", quartier: "Tamdja", repere: "face école publique" },
      tailleMax: "Petits et moyens (≤ 10 kg)",
      momo: { telephone: "+237699123441", operateur: "orange" },
      facadeRef: "photo-1",
    });
  });

  it("laisse de côté ce qui n'est pas encore bon, pour ne pas écraser le brouillon du serveur", () => {
    const brouillon = versBrouillon({
      ...SAISIE,
      nom: " ",
      position: "Douala",
      momo: "6 99 •• •• 41 · Orange",
      facadeRef: null,
    });
    expect(Object.keys(brouillon).sort()).toEqual(["ouvert", "tailleMax", "type"]);
  });
});

describe("decouperEngagement", () => {
  it("met « et » en gras dans « le code et la pièce »", () => {
    const texte =
      "Scanner chaque colis · ne remettre qu'avec le code et la pièce · garder les colis 7 jours.";
    const coupe = decouperEngagement(texte);
    expect(coupe).toEqual({
      avant: "Scanner chaque colis · ne remettre qu'avec le code ",
      gras: "et",
      apres: " la pièce · garder les colis 7 jours.",
    });
    expect(`${coupe?.avant}${coupe?.gras}${coupe?.apres}`).toBe(texte);
  });

  it("rend le texte tel quel quand la phrase n'y est pas", () => {
    expect(decouperEngagement("Scanner chaque colis.")).toBeNull();
  });
});

describe("brouillon gardé sur l'appareil", () => {
  const BASE: Saisie = {
    ...SAISIE,
    nom: "",
    momo: "6 99 •• •• 41 · Orange",
    facadeRef: null,
    position: "Bafoussam · Tamdja, face école publique",
  };

  it("sans brouillon, la fiche du serveur reste telle quelle", () => {
    expect(reprendreBrouillon(BASE, CHOIX, true)).toEqual(BASE);
  });

  it("remet ce qui a été tapé", () => {
    garderBrouillon(
      { ...SAISIE, nom: "Chez Paul", type: "Pharmacie", tailleMax: "Tous (≤ 30 kg)" },
      true,
    );
    expect(reprendreBrouillon(BASE, CHOIX, true)).toEqual({
      ...BASE,
      nom: "Chez Paul",
      type: "Pharmacie",
      tailleMax: "Tous (≤ 30 kg)",
      facadeRef: "photo-1",
    });
  });

  it("n'écrit jamais le numéro MoMo sur l'appareil", () => {
    garderBrouillon(SAISIE, true);
    const garde = localStorage.getItem(CLE_BROUILLON) ?? "";
    expect(garde).not.toContain("699");
    expect(garde).not.toContain("momo");
    expect(reprendreBrouillon(BASE, CHOIX, true).momo).toBe(BASE.momo);
  });

  it("ne garde la position que si elle a été tapée", () => {
    garderBrouillon({ ...SAISIE, position: "Douala · Akwa" }, true);
    expect(reprendreBrouillon(BASE, CHOIX, true).position).toBe(BASE.position);
    garderBrouillon({ ...SAISIE, position: "Douala · Akwa" }, false);
    expect(reprendreBrouillon({ ...BASE, position: "" }, CHOIX, false).position).toBe(
      "Douala · Akwa",
    );
  });

  it("ignore un choix qui n'est plus proposé", () => {
    garderBrouillon({ ...SAISIE, type: "Marché", ouvert: "24 h / 24" }, true);
    const lu = reprendreBrouillon(BASE, CHOIX, true);
    expect(lu.type).toBe(BASE.type);
    expect(lu.ouvert).toBe(BASE.ouvert);
  });

  it("ignore un brouillon illisible", () => {
    localStorage.setItem(CLE_BROUILLON, "{pas du json");
    expect(reprendreBrouillon(BASE, CHOIX, true)).toEqual(BASE);
    localStorage.setItem(CLE_BROUILLON, "12");
    expect(reprendreBrouillon(BASE, CHOIX, true)).toEqual(BASE);
  });

  it("l'oubli efface le brouillon", () => {
    garderBrouillon({ ...SAISIE, nom: "Chez Paul" }, true);
    oublierBrouillon();
    expect(localStorage.getItem(CLE_BROUILLON)).toBeNull();
    expect(reprendreBrouillon(BASE, CHOIX, true)).toEqual(BASE);
  });
});

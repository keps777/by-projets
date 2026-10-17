import { describe, expect, it } from "vitest";
import { USSD } from "../../../../packages/fixtures/src/ecrans/USSD";
import {
  ECHANGES_WHATSAPP_APERCU,
  LEGENDE_VOCAL,
  LIGNES_MENU,
  LONGUEUR_ECRAN_MAX,
  MOT_CLE_WHATSAPP,
  NOTE_APERCU,
  TEXTES,
  TEXTES_INVENTES,
  TOUCHES_CLAVIER,
  ajusterEcran,
  compagnieCourte,
  ecranConfirmation,
  ecranDeparts,
  ecranMenu,
  ligneDepart,
  lignesApercu,
  sansAccents,
} from "./textes";

/**
 * Les écrans doivent rester ceux de la planche « USSD » (`docs/maquettes-v3/USSD.dc.html`). Le fixture
 * de la planche est la source : si l'un des deux change seul, ces tests échouent.
 */
const PLANCHE = USSD.donnees;

describe("parité avec la planche USSD", () => {
  it("les lignes de l'aperçu sont exactement celles de l'écran de la planche", () => {
    expect(lignesApercu()).toEqual(PLANCHE.ussd.ecran);
  });

  it("le menu : sept lignes, une ligne vide, puis l'invite de réponse", () => {
    expect(ecranMenu().split("\n")).toEqual([...LIGNES_MENU, "", "Repondre:"]);
    expect(PLANCHE.ussd.ecran.slice(0, 8)).toEqual([...LIGNES_MENU, "Repondre: 1"]);
  });

  it("les départs : ceux de la planche, au caractère près", () => {
    const ecran = ecranDeparts("Douala", "Yaoundé", [
      { heure: "08:00", compagnie: "Bêta Voyages", vip: true, prix: 7500 },
      { heure: "08:30", compagnie: "Alpha Voyages", vip: false, prix: 4000 },
      { heure: "09:30", compagnie: "Oméga Transports", vip: false, prix: 3800 },
    ]);
    expect(ecran.split("\n")).toEqual(PLANCHE.ussd.ecran.slice(9, 13));
  });

  it("le siège et la demande de paiement : ceux de la planche", () => {
    expect(ecranConfirmation(2).split("\n")).toEqual(PLANCHE.ussd.ecran.slice(13, 15));
  });

  it("le clavier, la note, le mot-clé et la conversation WhatsApp de l'aperçu", () => {
    expect(TOUCHES_CLAVIER).toEqual(PLANCHE.ussd.clavier);
    expect(NOTE_APERCU).toBe(PLANCHE.ussd.note);
    expect(LEGENDE_VOCAL).toBe(PLANCHE.whatsapp.vocal);
    expect(PLANCHE.whatsapp.titre).toContain(`« ${MOT_CLE_WHATSAPP} »`);
    expect(ECHANGES_WHATSAPP_APERCU.map((e) => ({ _de: e.de, texte: e.lignes }))).toEqual(
      PLANCHE.whatsapp.echanges.map((e) => ({ _de: e._de, texte: [...e.texte] })),
    );
  });

  it("le code du titre de la planche est celui de la configuration par défaut", () => {
    expect(PLANCHE.ussd.titre).toContain("*123#");
  });

  it("la liste des départs suit la conversation WhatsApp : mêmes rangs, heures, compagnies et prix", () => {
    const whatsapp = PLANCHE.whatsapp.echanges[1]!.texte.slice(1, 4).map((l) =>
      sansAccents(l.replace(" · ", " ").replace(/(\d) (\d{3})$/, "$1$2")),
    );
    expect(PLANCHE.ussd.ecran.slice(10, 13)).toEqual(whatsapp);
  });
});

describe("mise en forme", () => {
  it("retire les accents et ce qui n'est pas de l'ASCII", () => {
    expect(sansAccents("Yaoundé, Édéa, Bafoussam, Oméga")).toBe("Yaounde, Edea, Bafoussam, Omega");
    expect(sansAccents("cœur ’✓é")).toBe("coeur 'e");
  });

  it("la compagnie est son premier mot, sans accent, sur 12 caractères au plus", () => {
    expect(compagnieCourte("Bêta Voyages")).toBe("Beta");
    expect(compagnieCourte("Élite Express")).toBe("Elite");
    expect(compagnieCourte("Transportsinternationauxdafrique SA")).toHaveLength(12);
  });

  it("un départ VIP porte « VIP », un départ classique rien", () => {
    expect(ligneDepart(1, { heure: "08:00", compagnie: "Bêta", vip: true, prix: 7500 })).toBe(
      "1 08:00 Beta VIP 7500",
    );
    expect(ligneDepart(2, { heure: "08:30", compagnie: "Alpha", vip: false, prix: 4000 })).toBe(
      "2 08:30 Alpha 4000",
    );
  });

  it("un écran trop long est coupé à la dernière ligne entière", () => {
    const lignes = Array.from({ length: 12 }, (_, i) => `${i + 1} ligne d'essai numero ${i}`);
    const coupe = ajusterEcran(lignes);
    expect(coupe.length).toBeLessThanOrEqual(LONGUEUR_ECRAN_MAX);
    expect(coupe.endsWith(lignes[coupe.split("\n").length - 1]!)).toBe(true);
  });
});

describe("textes sans maquette", () => {
  it("tous tiennent dans un écran et sont en ASCII (un vieux téléphone n'affiche pas les accents)", () => {
    for (const t of TEXTES_INVENTES) {
      expect(t.length, t).toBeLessThanOrEqual(LONGUEUR_ECRAN_MAX);
      expect(t, t).toMatch(/^[\x20-\x7e\n]+$/);
    }
  });

  it("un billet, un bus et un colis, avec les valeurs les plus longues, tiennent dans un écran", () => {
    const billet = TEXTES.billet({
      numero: "ALP-DLA-261102-4001",
      compagnie: "Transportsinternationaux SA",
      quand: "03/11 08:30",
      depart: "Bafoussam",
      arrivee: "Yaoundé",
      place: 40,
      code: "5582",
      autres: 9,
    });
    expect(billet.length).toBeLessThanOrEqual(LONGUEUR_ECRAN_MAX);
    expect(billet).toContain("Code: 5582");
    expect(billet).toContain("Yaounde");
    const bus = TEXTES.bus({
      compagnie: "Alpha Voyages",
      depart: "Douala",
      arrivee: "Yaoundé",
      arriveeEstimee: "12:40",
      retardMinutes: 15,
      prochainArret: "Édéa",
    });
    expect(bus.split("\n")).toEqual([
      "Alpha Douala>Yaounde",
      "Arrivee prevue 12:40",
      "Retard: 15 min",
      "Prochain arret: Edea",
    ]);
    expect(TEXTES.colis("COL-0042", "en_route")).toBe("Colis COL-0042\nEn route");
  });

  it("le billet sans place ni autre billet ne montre ni l'une ni l'autre", () => {
    const billet = TEXTES.billet({
      numero: "ALP-DLA-261102-4001",
      compagnie: "Alpha Voyages",
      quand: "08:30",
      depart: "Douala",
      arrivee: "Yaoundé",
      place: null,
      code: "5582",
      autres: 0,
    });
    expect(billet).toBe("Billet ALP-DLA-261102-4001\nAlpha 08:30\nDouala>Yaounde\nCode: 5582");
  });
});

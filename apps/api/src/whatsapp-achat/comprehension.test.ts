import { describe, expect, it } from "vitest";
import {
  choisirParIndice,
  dansLaPeriode,
  estAnnulation,
  lireDemande,
  lireRang,
  lireReponse,
  lireSiege,
} from "./comprehension";
import { VILLES_PAR_DEFAUT } from "./villes";

const lire = (texte: string) => lireDemande(texte, VILLES_PAR_DEFAUT);

describe("lireDemande : trajet, jour, moment", () => {
  const cas: Array<
    [
      string,
      {
        origine?: string | null;
        destination?: string | null;
        jour?: string | null;
        periode?: string | null;
        apres?: number | null;
      },
    ]
  > = [
    // français
    [
      "Billet Douala Yaoundé demain matin",
      { origine: "DLA", destination: "YDE", jour: "demain", periode: "matin" },
    ],
    ["billet de Yaoundé à Douala demain", { origine: "YDE", destination: "DLA", jour: "demain" }],
    [
      "billet pour Bafoussam aujourd'hui",
      { origine: null, destination: "BAF", jour: "aujourdhui" },
    ],
    [
      "Je voudrais aller à Kribi après-demain soir",
      { origine: null, destination: "KRI", jour: "apres_demain", periode: "soir" },
    ],
    ["billet Douala Yaoundé demain 8h", { jour: "demain", apres: 480 }],
    ["billet Douala Yaoundé demain 14h30", { jour: "demain", apres: 870 }],
    ["billet Douala Yaoundé demain après-midi", { jour: "demain", periode: "apres_midi" }],
    ["billet Douala Yaoundé cette nuit", { periode: "nuit" }],
    ["billet Yaoundé", { origine: null, destination: "YDE", jour: null }],
    ["billet Yaoundé depuis Bamenda", { origine: "BAM", destination: "YDE" }],
    // anglais
    [
      "ticket Douala Yaoundé tomorrow morning",
      { origine: "DLA", destination: "YDE", jour: "demain", periode: "matin" },
    ],
    ["I want to go to Bafoussam today", { destination: "BAF", jour: "aujourdhui" }],
    [
      "ticket from Yaounde to Douala tomorrow 8am",
      { origine: "YDE", destination: "DLA", jour: "demain", apres: 480 },
    ],
    ["ticket Douala Yaounde the day after tomorrow", { jour: "apres_demain" }],
    ["ticket to Bamenda tonight", { destination: "BAM", periode: "soir" }],
    // pidgin
    ["I wan go Yaounde tumara", { destination: "YDE", jour: "demain" }],
    [
      "abeg bilet Douala fo Bafoussam tude",
      { origine: "DLA", destination: "BAF", jour: "aujourdhui" },
    ],
    ["I wan go Bafoussam tumara mornin", { destination: "BAF", jour: "demain", periode: "matin" }],
    // orthographes courantes
    ["billet dwala yde demain", { origine: "DLA", destination: "YDE" }],
    ["billet Ngaoundéré Douala", { origine: "NGA", destination: "DLA" }],
  ];

  it.each(cas)("« %s »", (texte, attendu) => {
    const l = lire(texte);
    expect(l.intention).toBe("achat");
    for (const [cle, valeur] of Object.entries(attendu)) {
      expect(l[cle as keyof typeof l], cle).toBe(valeur);
    }
  });

  it("deux villes sans indication : la première est le départ", () => {
    expect(lire("billet Douala Yaoundé")).toMatchObject({ origine: "DLA", destination: "YDE" });
  });

  it("une ville inconnue après « pour », « to », « fo » est signalée, jamais remplacée", () => {
    expect(lire("billet pour Garoua demain").villeInconnue).toBe("garoua");
    expect(lire("ticket to Maroua tomorrow").villeInconnue).toBe("maroua");
    expect(lire("bilet fo Limbe tude").villeInconnue).toBe("limbe");
    // une ville connue, un jour, une heure ou un mot du vocabulaire ne sont pas des villes inconnues
    expect(lire("billet pour Yaoundé demain").villeInconnue).toBeNull();
    expect(lire("billet pour demain").villeInconnue).toBeNull();
    expect(lire("billet pour 8h").villeInconnue).toBeNull();
    expect(lire("billet Douala Yaoundé pour le matin").villeInconnue).toBeNull();
  });

  it("un jour de la semaine, une date ou « semaine prochaine » ne sont pas lus : ils sont signalés", () => {
    expect(lire("billet Douala Yaoundé vendredi").dateNonLue).toBe(true);
    expect(lire("ticket Douala Yaounde on Friday").dateNonLue).toBe(true);
    expect(lire("billet Douala Yaoundé le 12/11").dateNonLue).toBe(true);
    expect(lire("billet Douala Yaoundé demain").dateNonLue).toBe(false);
    expect(lire("billet Douala Yaoundé 8h").dateNonLue).toBe(false);
  });

  it("la même ville deux fois", () => {
    expect(lire("billet Douala Douala").memeVille).toBe(true);
    expect(lire("billet Douala Yaoundé").memeVille).toBe(false);
  });

  it("l'intention : annuler l'emporte sur billet, puis l'aide, puis la salutation", () => {
    expect(lire("annuler mon billet").intention).toBe("annulation");
    expect(lire("cancel ticket").intention).toBe("annulation");
    expect(lire("aide").intention).toBe("aide");
    expect(lire("help").intention).toBe("aide");
    expect(lire("Bonjour").intention).toBe("salutation");
    expect(lire("Hello").intention).toBe("salutation");
    expect(lire("how far").intention).toBe("salutation");
    expect(lire("Pourquoi le 09:30 part si vide ?").intention).toBe("autre");
    expect(lire("2").intention).toBe("autre");
  });

  it("un mot qui contient un nom de ville n'est pas une ville", () => {
    expect(lire("bambou").destination).toBeNull();
    expect(lire("baffer").destination).toBeNull();
  });
});

describe("dansLaPeriode", () => {
  it.each([
    ["matin", 8, true],
    ["matin", 12, false],
    ["matin", 3, false],
    ["apres_midi", 15, true],
    ["apres_midi", 11, false],
    ["soir", 18, true],
    ["soir", 10, false],
    ["nuit", 22, true],
    ["nuit", 2, true],
    ["nuit", 9, false],
  ] as const)("%s à %ih : %s", (periode, heure, attendu) => {
    expect(dansLaPeriode(periode, heure)).toBe(attendu);
  });
});

describe("lireRang", () => {
  it.each([
    ["2", 2],
    [" 3 ", 3],
    ["le 1", 1],
    ["le 1 svp", 1],
    ["option 2", 2],
    ["n°3", 3],
    ["number 2 please", 2],
    ["deux", 2],
    ["premier", 1],
    ["the second", 2],
    ["2 abeg", 2],
  ])("« %s » → %i", (texte, rang) => {
    expect(lireRang(texte)).toBe(rang);
  });

  it.each(["Alpha", "oui", "0", "billet Douala Yaoundé", "2 3", ""])(
    "« %s » n'est pas un rang",
    (texte) => {
      expect(lireRang(texte)).toBeNull();
    },
  );
});

describe("lireSiege", () => {
  it.each([
    ["6", 6],
    ["siège 12", 12],
    ["seat 7", 7],
    ["le 6", 6],
    ["6 fenêtre", 6],
    ["place 3 svp", 3],
  ])("« %s » → %i", (texte, siege) => {
    expect(lireSiege(texte)).toBe(siege);
  });

  it.each(["oui", "0", "6 7", "siège", "1234"])("« %s » n'est pas un siège", (texte) => {
    expect(lireSiege(texte)).toBeNull();
  });
});

describe("lireReponse", () => {
  it.each([
    ["Oui", "oui"],
    ["oui merci", "oui"],
    ["OK", "oui"],
    ["d'accord", "oui"],
    ["yes", "oui"],
    ["yes abeg", "oui"],
    ["go ahead", "oui"],
    ["Non", "non"],
    ["no thanks", "non"],
    ["laisse tomber", "non"],
    ["Changer de siège", "changer"],
    ["change seat", "changer"],
    ["oui mais change de siège", "changer"],
    ["non, un autre siège", "changer"],
    ["another one", "changer"],
  ])("« %s » → %s", (texte, reponse) => {
    expect(lireReponse(texte)).toBe(reponse);
  });

  it.each([
    "",
    "peut-être",
    "billet Douala Yaoundé demain matin pour mon frère ce soir si possible ok",
  ])("« %s » n'est aucune réponse", (texte) => {
    expect(lireReponse(texte)).toBeNull();
  });
});

describe("estAnnulation", () => {
  it.each(["annuler", "Annule", "cancel", "laisse tomber", "non", "no"])("« %s »", (texte) => {
    expect(estAnnulation(texte)).toBe(true);
  });
  it.each(["oui", "2", "changer de siège", "billet Douala Yaoundé demain matin"])(
    "« %s » n'annule rien",
    (texte) => {
      expect(estAnnulation(texte)).toBe(false);
    },
  );
});

describe("choisirParIndice", () => {
  const departs = [
    { heure: "08:00", nom: "beta" },
    { heure: "08:30", nom: "alpha" },
    { heure: "09:30", nom: "omega" },
    { heure: "15:00", nom: "alpha" },
  ];
  it("par l'heure", () => {
    expect(choisirParIndice("8h30", departs)).toBe(1);
    expect(choisirParIndice("9:30", departs)).toBe(2);
    expect(choisirParIndice("le 15h", departs)).toBe(3);
  });
  it("par la compagnie, si elle est seule", () => {
    expect(choisirParIndice("Bêta", departs)).toBe(0);
    expect(choisirParIndice("je prends Oméga", departs)).toBe(2);
  });
  it("jamais en cas de doute", () => {
    expect(choisirParIndice("Alpha", departs)).toBeNull();
    expect(choisirParIndice("10h", departs)).toBeNull();
    expect(choisirParIndice("bonjour", departs)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  LIMITES,
  analyserRemplissage,
  compterVentes,
  construireRapport,
  estUneVente,
  type EntreesRapport,
} from "./calcul";
import type { BilletVendu, CaisseDuJour } from "./modele";
import {
  AKWA,
  BAFOUSSAM,
  COMPAGNIE,
  GARES,
  JOUR,
  MVAN,
  NOM_COMPAGNIE,
  VEILLE,
  VINGT_ET_UNE_HEURES,
  billet,
  caisse,
  colis,
  depart,
  instant,
} from "./testing/montage";

const F = " "; // espace fine insécable des montants

function entrees(partiel: Partial<EntreesRapport> = {}): EntreesRapport {
  return {
    compagnie: { id: COMPAGNIE, nom: NOM_COMPAGNIE },
    jour: JOUR,
    arreteA: VINGT_ET_UNE_HEURES,
    gares: GARES,
    billets: [],
    nbBilletsVeille: 0,
    colis: [],
    litiges: 0,
    caisses: [],
    departs: [],
    annulations: [],
    trous: [],
    controles: [],
    question: null,
    incidents: [],
    ...partiel,
  };
}

const gare = (r: ReturnType<typeof construireRapport>, nom: string) =>
  r.gares.find((g) => g.nom === nom)!;

describe("ce qui compte comme une vente", () => {
  it("écarte les billets annulés, réservés et ceux qui en remplacent un autre (report)", () => {
    expect(estUneVente(billet({ etat: "paye" }))).toBe(true);
    expect(estUneVente(billet({ etat: "embarque" }))).toBe(true);
    expect(estUneVente(billet({ etat: "voyage" }))).toBe(true);
    expect(estUneVente(billet({ etat: "non_presente" }))).toBe(true);
    expect(estUneVente(billet({ etat: "reporte" }))).toBe(true); // l'argent reste encaissé
    expect(estUneVente(billet({ etat: "annule" }))).toBe(false);
    expect(estUneVente(billet({ etat: "reserve" }))).toBe(false);
    expect(estUneVente(billet({ reporteDe: "b-origine" }))).toBe(false);
  });

  it("ne compte que les ventes du jour demandé", () => {
    const billets = [
      billet({ venduA: instant("00:00") }),
      billet({ venduA: instant("23:59") }),
      billet({ venduA: instant("23:59", VEILLE) }),
      billet({ venduA: instant("00:00", "2027-01-06") }),
      billet({ etat: "annule" }),
    ];
    expect(compterVentes(billets, JOUR)).toBe(2);
    expect(compterVentes(billets, VEILLE)).toBe(1);
  });
});

describe("les montants, au franc près", () => {
  it("additionne les billets et les colis ; le mobile money est ce qui n'est pas cash", () => {
    const r = construireRapport(
      entrees({
        billets: [
          billet({ montant: 3_700, mode: "cash" }),
          billet({ montant: 3_500, mode: "momo" }),
          billet({ montant: 4_100, mode: "orange_money" }),
          billet({ montant: 3_700, mode: null }), // paiement non renseigné : jamais compté comme cash
          billet({ montant: 99_999, etat: "annule" }), // annulé : hors recette
        ],
        colis: [colis({ montant: 2_550, mode: "cash" }), colis({ montant: 6_000, mode: "momo" })],
      }),
    );
    expect(r.chiffres).toMatchObject({
      billets: 4,
      colis: 2,
      recette: 3_700 + 3_500 + 4_100 + 3_700 + 2_550 + 6_000,
      cash: 3_700 + 2_550,
      momo: 3_500 + 4_100 + 3_700 + 6_000,
    });
    expect(r.chiffres.cash + r.chiffres.momo).toBe(r.chiffres.recette);
  });

  it("donne le même résultat qu'un calcul indépendant sur des journées tirées au hasard", () => {
    // Générateur pseudo-aléatoire fixe (mulberry32) : le test est rejouable à l'identique.
    let graine = 20270105;
    const hasard = (): number => {
      graine = (graine + 0x6d2b79f5) | 0;
      let t = Math.imul(graine ^ (graine >>> 15), 1 | graine);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const choix = <T>(valeurs: readonly T[]): T => valeurs[Math.floor(hasard() * valeurs.length)]!;
    const gares = [AKWA, MVAN, BAFOUSSAM];

    for (let essai = 0; essai < 40; essai++) {
      const billets: BilletVendu[] = Array.from({ length: Math.floor(hasard() * 60) }, () =>
        billet({
          gareId: choix(gares),
          canal: choix(["guichet", "convoyeur", "en_ligne", "vendeur"] as const),
          mode: choix(["cash", "momo", "orange_money", null] as const),
          montant: 100 * (1 + Math.floor(hasard() * 80)) + choix([0, 50, 250]),
          etat: choix(["paye", "embarque", "voyage", "annule", "reserve", "non_presente"] as const),
          reporteDe: hasard() < 0.1 ? "autre" : null,
        }),
      );
      const lesColis = Array.from({ length: Math.floor(hasard() * 20) }, () =>
        colis({
          gareId: choix(gares),
          mode: choix(["cash", "momo", null] as const),
          montant: 50 * Math.floor(hasard() * 200),
        }),
      );
      const r = construireRapport(entrees({ billets, colis: lesColis }));

      // calcul indépendant : on repart des lignes, billet par billet, centime par centime
      let recette = 0;
      let cash = 0;
      let nb = 0;
      const parGare: Record<string, number> = {};
      for (const b of billets) {
        if (b.etat === "annule" || b.etat === "reserve" || b.reporteDe !== null) continue;
        nb += 1;
        recette += b.montant;
        if (b.mode === "cash") cash += b.montant;
        parGare[b.gareId] = (parGare[b.gareId] ?? 0) + 1;
      }
      for (const c of lesColis) {
        recette += c.montant;
        if (c.mode === "cash") cash += c.montant;
      }
      expect(r.chiffres.billets).toBe(nb);
      expect(r.chiffres.recette).toBe(recette);
      expect(r.chiffres.cash).toBe(cash);
      expect(r.chiffres.momo).toBe(recette - cash);
      expect(Number.isInteger(r.chiffres.recette)).toBe(true);
      expect(r.gares.reduce((s, g) => s + g.billets, 0)).toBe(nb);
      for (const g of r.gares) expect(g.billets).toBe(parGare[g.gareId] ?? 0);
      expect(r.enLigne.billets).toBe(
        billets.filter((b) => estUneVente(b) && b.canal === "en_ligne").length,
      );
    }
  });

  it("n'arrondit jamais un montant : un franc de plus se retrouve dans la recette", () => {
    const a = construireRapport(entrees({ billets: [billet({ montant: 3_500 })] }));
    const b = construireRapport(entrees({ billets: [billet({ montant: 3_501 })] }));
    expect(b.chiffres.recette - a.chiffres.recette).toBe(1);
  });
});

describe("variation, part en ligne, titre", () => {
  it("compare au nombre de billets de la veille, à une décimale", () => {
    const billets = Array.from({ length: 1004 }, () => billet());
    expect(
      construireRapport(entrees({ billets, nbBilletsVeille: 947 })).chiffres.variationBilletsPct,
    ).toBe(6);
    expect(
      construireRapport(entrees({ billets, nbBilletsVeille: 1_100 })).chiffres.variationBilletsPct,
    ).toBe(-8.7);
    expect(
      construireRapport(entrees({ billets, nbBilletsVeille: 1004 })).chiffres.variationBilletsPct,
    ).toBe(0);
  });

  it("sans billets la veille, il n'y a rien à comparer : 0, pas une division par zéro", () => {
    const r = construireRapport(entrees({ billets: [billet()], nbBilletsVeille: 0 }));
    expect(r.chiffres.variationBilletsPct).toBe(0);
    const vide = construireRapport(entrees());
    expect(vide.chiffres.variationBilletsPct).toBe(0);
    expect(vide.enLigne).toEqual({ billets: 0, partPct: 0 });
  });

  it("calcule la part des ventes en ligne sur les ventes (61 sur 1 004 = 6,1 %)", () => {
    const billets = [
      ...Array.from({ length: 61 }, () => billet({ canal: "en_ligne" })),
      ...Array.from({ length: 943 }, () => billet()),
      billet({ canal: "en_ligne", etat: "annule" }), // une vente en ligne annulée ne compte pas
    ];
    expect(construireRapport(entrees({ billets })).enLigne).toEqual({ billets: 61, partPct: 6.1 });
  });

  it("écrit le titre comme la planche, au singulier pour une seule gare", () => {
    expect(construireRapport(entrees()).titre).toBe("Rapport du mardi 5 janvier · 3 gares");
    expect(construireRapport(entrees({ gares: [GARES[0]!] })).titre).toBe(
      "Rapport du mardi 5 janvier · 1 gare",
    );
    expect(construireRapport(entrees({ jour: "2027-02-01" })).titre).toBe(
      "Rapport du lundi 1 février · 3 gares",
    );
  });

  it("date le rapport de l'instant où il est arrêté, à Douala", () => {
    expect(construireRapport(entrees()).envoyeA).toBe("2027-01-05T21:00:00.000+01:00");
  });
});

describe("les gares", () => {
  it("range les gares de la plus active à la moins active, et compte toutes celles du référentiel", () => {
    const r = construireRapport(
      entrees({
        billets: [
          billet({ gareId: BAFOUSSAM }),
          billet({ gareId: BAFOUSSAM }),
          billet({ gareId: BAFOUSSAM }),
          billet({ gareId: MVAN }),
        ],
      }),
    );
    expect(r.gares.map((g) => [g.nom, g.billets])).toEqual([
      ["Bafoussam", 3],
      ["Mvan", 1],
      ["Akwa", 0],
    ]);
    expect(r.nbGares).toBe(3);
  });

  it("n'oublie pas une gare absente du référentiel : ses billets restent dans le total", () => {
    const r = construireRapport(entrees({ billets: [billet({ gareId: "gare-fantome" })] }));
    expect(r.chiffres.billets).toBe(1);
    expect(r.gares.reduce((s, g) => s + g.billets, 0)).toBe(1);
    expect(r.nbGares).toBe(4);
    const premiere = r.gares[0]!;
    expect(premiere.nom).toBe("gare-fantome");
    expect(premiere.remarques).toContain("1 gare absente du référentiel");
  });

  it("garde au plus dix remarques par gare, la dernière dit combien ont été retirées", () => {
    const trous = Array.from({ length: 14 }, (_, i) => ({
      gareId: AKWA,
      message: `Il manque le numéro 00${10 + i}`,
    }));
    const akwa = gare(construireRapport(entrees({ trous, billets: [billet()] })), "Akwa");
    expect(akwa.remarques).toHaveLength(LIMITES.remarquesParGare);
    expect(akwa.remarques[0]).toBe("Il manque le numéro 0010");
    expect(akwa.remarques.at(-1)).toBe("5 autres remarques");
  });

  it("rattache à la première gare les trous sans gare et les incidents de source", () => {
    const r = construireRapport(
      entrees({
        billets: [billet({ gareId: MVAN }), billet({ gareId: MVAN }), billet({ gareId: AKWA })],
        trous: [{ gareId: null, message: "Il manque le numéro 0004 (billets) de Joseph" }],
        incidents: ["colis : données indisponibles"],
      }),
    );
    expect(gare(r, "Mvan").remarques).toEqual([
      "Il manque le numéro 0004 (billets) de Joseph",
      "colis : données indisponibles",
    ]);
    expect(gare(r, "Akwa").remarques).toEqual([]);
  });
});

describe("caisses et écarts", () => {
  it("additionne les écarts signés des caisses de la gare et nomme le superviseur qui a validé", () => {
    const r = construireRapport(
      entrees({
        caisses: [
          caisse({ gareId: AKWA, guichetRang: 1, ecart: 0 }),
          caisse({ gareId: AKWA, guichetRang: 2, ecart: -1_000 }),
          caisse({ gareId: AKWA, guichetRang: 3, ecart: 500 }),
        ],
      }),
    );
    const akwa = gare(r, "Akwa");
    expect(akwa.ecart).toBe(-500);
    expect(akwa.remarques).toEqual([
      "3 guichets clôturés",
      "guichet 2, validé par Essono",
      "guichet 3, validé par Essono",
    ]);
  });

  it("ne dit rien des caisses quand tout est validé sans écart", () => {
    const r = construireRapport(
      entrees({
        caisses: [
          caisse({ gareId: MVAN, guichetRang: 1 }),
          caisse({ gareId: MVAN, guichetRang: 2 }),
        ],
      }),
    );
    expect(gare(r, "Mvan")).toMatchObject({ ecart: 0, remarques: [] });
  });

  it("signale une caisse clôturée mais non validée, avec son écart, sans la cacher ni la valider", () => {
    const r = construireRapport(
      entrees({
        caisses: [
          caisse({ gareId: AKWA, guichetRang: 1 }),
          caisse({
            gareId: AKWA,
            guichetRang: 2,
            etat: "cloturee",
            ecart: -2_500,
            validation: null,
          }),
        ],
      }),
    );
    const akwa = gare(r, "Akwa");
    expect(akwa.ecart).toBe(-2_500); // l'écart est connu : il est dans le total, signalé
    expect(akwa.remarques).toEqual([
      "2 guichets clôturés",
      `guichet 2, caisse non validée (écart −${"2"}${F}500 F)`,
    ]);
    expect(r.signatures).toEqual([{ nom: "Essono", gare: "Akwa" }]);
  });

  it("signale une caisse encore ouverte : pas d'écart connu, pas de signature", () => {
    const r = construireRapport(
      entrees({
        caisses: [
          caisse({ gareId: MVAN, guichetRang: 1 }),
          caisse({
            gareId: MVAN,
            guichetRang: 2,
            etat: "ouverte",
            ecart: null,
            validation: null,
          }),
        ],
      }),
    );
    const mvan = gare(r, "Mvan");
    expect(mvan.ecart).toBe(0);
    expect(mvan.remarques).toEqual(["1 guichet clôturé sur 2", "guichet 2, caisse encore ouverte"]);
  });

  it("signale une clôture automatique sans comptage", () => {
    const r = construireRapport(
      entrees({
        caisses: [
          caisse({
            gareId: AKWA,
            guichetRang: 1,
            etat: "cloturee",
            ecart: -695_500,
            comptageAbsent: true,
            validation: null,
          }),
        ],
      }),
    );
    expect(gare(r, "Akwa").remarques).toContain("guichet 1, clôturée sans comptage");
  });

  it("signe le rapport une fois par superviseur et par gare, dans l'ordre des gares", () => {
    const valideur = (id: string, nom: string, at: string): CaisseDuJour["validation"] => ({
      superviseurId: id,
      superviseurNom: nom,
      at,
    });
    const billets = [billet({ gareId: MVAN }), billet({ gareId: MVAN }), billet({ gareId: AKWA })];
    const r = construireRapport(
      entrees({
        billets,
        caisses: [
          caisse({
            gareId: AKWA,
            guichetRang: 1,
            validation: valideur("s1", "Essono", instant("18:00")),
          }),
          caisse({
            gareId: AKWA,
            guichetRang: 2,
            validation: valideur("s1", "Essono", instant("19:00")),
          }),
          caisse({
            gareId: MVAN,
            guichetRang: 1,
            validation: valideur("s2", "Tchinda", instant("19:30")),
          }),
          // un remplaçant qui valide aussi à Mvan signe aussi
          caisse({
            gareId: MVAN,
            guichetRang: 2,
            validation: valideur("s3", "Olinga", instant("20:00")),
          }),
        ],
      }),
    );
    expect(r.signatures).toEqual([
      { nom: "Tchinda", gare: "Mvan" },
      { nom: "Olinga", gare: "Mvan" },
      { nom: "Essono", gare: "Akwa" },
    ]);
  });

  it("n'invente pas de signature : sans validation, personne n'a signé", () => {
    const r = construireRapport(
      entrees({ caisses: [caisse({ etat: "cloturee", validation: null, ecart: 0 })] }),
    );
    expect(r.signatures).toEqual([]);
  });
});

describe("départs : fusion, soute, remplissage", () => {
  it("écrit les fusions et les soutes pleines comme la planche", () => {
    const r = construireRapport(
      entrees({
        departs: [
          depart({
            gareId: MVAN,
            heure: "16:00",
            etat: "fusionne",
            fusionneAvec: "16:30",
            vendus: 0,
          }),
          depart({ gareId: MVAN, heure: "16:30", vendus: 30 }),
          depart({ gareId: BAFOUSSAM, heure: "10:00", soutePleine: true }),
        ],
      }),
    );
    expect(gare(r, "Mvan").remarques).toEqual(["1 départ fusionné (16:00 + 16:30)"]);
    expect(gare(r, "Bafoussam").remarques).toEqual(["soute pleine à 10:00"]);
  });

  it("accorde au pluriel plusieurs fusions et plusieurs soutes pleines", () => {
    const r = construireRapport(
      entrees({
        departs: [
          depart({ gareId: MVAN, heure: "17:00", etat: "fusionne", fusionneAvec: "17:30" }),
          depart({ gareId: MVAN, heure: "16:00", etat: "fusionne", fusionneAvec: "16:30" }),
          depart({ gareId: MVAN, heure: "08:00", soutePleine: true }),
          depart({ gareId: MVAN, heure: "06:30", soutePleine: true }),
          depart({ gareId: MVAN, heure: "09:00", soutePleine: true, etat: "annule" }),
        ],
      }),
    );
    expect(gare(r, "Mvan").remarques).toEqual([
      "2 départs fusionnés (16:00 + 16:30, 17:00 + 17:30)",
      "soute pleine à 06:30, 08:00",
    ]);
  });

  it("le remplissage est celui des places prises sur les places offertes, hors annulés et fusionnés", () => {
    const a = analyserRemplissage(
      [
        depart({ capacite: 40, vendus: 22, heure: "09:30" }),
        depart({ capacite: 40, vendus: 40, heure: "11:00" }),
        depart({ capacite: 50, vendus: 49, heure: "13:00" }),
        depart({ capacite: 40, vendus: 0, etat: "fusionne", fusionneAvec: "11:00" }),
        depart({ capacite: 40, vendus: 0, etat: "annule" }),
        depart({ capacite: 0, vendus: 0 }),
      ],
      NOM_COMPAGNIE,
    );
    expect(a.moyenPct).toBe(85.4); // 111 / 130
    expect(a.remarque).toBe("le 09:30 Oméga part à 55 %");
    expect(a.departFaible).toEqual({ heure: "09:30", remplissagePct: 55 });
  });

  it("ne signale rien quand tous les départs sont au-dessus du seuil, ni quand il n'y en a pas", () => {
    expect(
      analyserRemplissage([depart({ vendus: 24 }), depart({ vendus: 40 })], NOM_COMPAGNIE).remarque,
    ).toBeNull(); // 60 % pile : pas sous le seuil
    expect(analyserRemplissage([], NOM_COMPAGNIE)).toEqual({
      moyenPct: 0,
      remarque: null,
      departFaible: null,
    });
  });

  it("signale le départ le moins rempli ; à égalité, le plus tôt", () => {
    const a = analyserRemplissage(
      [
        depart({ heure: "14:00", vendus: 10 }),
        depart({ heure: "07:00", vendus: 10 }),
        depart({ heure: "09:00", vendus: 20 }),
      ],
      "Alpha",
    );
    expect(a.departFaible).toEqual({ heure: "07:00", remplissagePct: 25 });
    expect(a.remarque).toBe("le 07:00 Alpha part à 25 %");
  });
});

describe("billets de cadence sans nom", () => {
  it("distingue ceux qui restent à compléter de ceux qui n'ont jamais embarqué", () => {
    const sansNom = (partiel: Partial<BilletVendu>) =>
      billet({ aCompleterAuQuai: true, sansNom: true, ...partiel });
    const r = construireRapport(
      entrees({
        billets: [
          sansNom({ departParti: false, embarque: false }),
          sansNom({ departParti: false, embarque: false }),
          sansNom({ departParti: true, embarque: false }),
          billet({ aCompleterAuQuai: true, sansNom: false }), // complété au quai : rien à dire
          sansNom({ etat: "annule" }), // annulé : plus une vente
        ],
      }),
    );
    expect(gare(r, "Akwa").remarques).toEqual([
      "2 billets de cadence sans nom",
      "1 billet de cadence vendu, non embarqué, sans nom",
    ]);
  });
});

describe("trous de numérotation", () => {
  it("reprend la phrase nominative de la numérotation, dans la gare concernée", () => {
    const message = "Il manque le numéro 0005 (billets) dans la plage 0001–0999 de Joseph Nkoulou";
    const r = construireRapport(
      entrees({ billets: [billet({ gareId: AKWA })], trous: [{ gareId: AKWA, message }] }),
    );
    expect(gare(r, "Akwa").remarques).toEqual([message]);
  });
});

describe("en route", () => {
  const convoyeur = () => billet({ canal: "convoyeur" });

  it("écrit la ligne de la planche : ventes des convoyeurs, contrôle, régularisation", () => {
    const r = construireRapport(
      entrees({
        billets: Array.from({ length: 23 }, convoyeur),
        controles: [
          { controleId: "k1", lieu: "Edéa", regularisations: 1, ventesNonEnregistrees: 0 },
        ],
      }),
    );
    expect(r.enRoute).toEqual({
      billetsConvoyeurs: 23,
      controles: 1,
      regularisations: 1,
      texte:
        "23 billets vendus par les convoyeurs, tous enregistrés · 1 contrôle : 1 régularisation à Edéa",
    });
  });

  it("dit quand des ventes n'ont pas été enregistrées par le convoyeur", () => {
    const r = construireRapport(
      entrees({
        billets: [convoyeur()],
        controles: [
          { controleId: "k1", lieu: "Edéa", regularisations: 2, ventesNonEnregistrees: 2 },
          { controleId: "k2", lieu: "Yaoundé", regularisations: 0, ventesNonEnregistrees: 1 },
          { controleId: "k3", lieu: "Edéa", regularisations: 1, ventesNonEnregistrees: 0 },
        ],
      }),
    );
    expect(r.enRoute.regularisations).toBe(3);
    expect(r.enRoute.controles).toBe(3);
    expect(r.enRoute.texte).toBe(
      "1 billet vendu par les convoyeurs, 3 ventes non enregistrées · 3 contrôles : 3 régularisations à Edéa",
    );
  });

  it("sait dire qu'il ne s'est rien passé en route", () => {
    expect(construireRapport(entrees()).enRoute).toEqual({
      billetsConvoyeurs: 0,
      controles: 0,
      regularisations: 0,
      texte: "aucun billet vendu par les convoyeurs · aucun contrôle",
    });
    const r = construireRapport(
      entrees({
        controles: [
          { controleId: "k", lieu: "Edéa", regularisations: 0, ventesNonEnregistrees: 0 },
        ],
      }),
    );
    expect(r.enRoute.texte).toBe(
      "aucun billet vendu par les convoyeurs · 1 contrôle : aucune régularisation",
    );
  });

  it("ne dépasse pas la longueur qu'accepte la mise en forme WhatsApp", () => {
    const controles = Array.from({ length: 60 }, (_, i) => ({
      controleId: `k${i}`,
      lieu: `Village numéro ${i}`,
      regularisations: 1,
      ventesNonEnregistrees: 0,
    }));
    expect(construireRapport(entrees({ controles })).enRoute.texte.length).toBeLessThanOrEqual(
      LIMITES.enRoute,
    );
  });
});

describe("annulations", () => {
  const annulation = (partiel: { montant?: number; avecPin?: boolean; at?: string } = {}) => ({
    billetId: "b",
    numero: "OME-DLA-270105-0171",
    gareId: AKWA,
    montant: 4_000,
    avecPin: true,
    at: instant("14:00"),
    ...partiel,
  });

  it("compte les annulations, additionne ce qui est rendu et dit si toutes ont eu un PIN", () => {
    const toutes = construireRapport(
      entrees({ annulations: Array.from({ length: 5 }, () => annulation()) }),
    );
    expect(toutes.annulations).toEqual({ nombre: 5, montant: 20_000, toutesAvecPin: true });

    const unesans = construireRapport(
      entrees({ annulations: [annulation(), annulation({ montant: 2_500, avecPin: false })] }),
    );
    expect(unesans.annulations).toEqual({ nombre: 2, montant: 6_500, toutesAvecPin: false });
  });

  it("sans annulation : zéro, et « toutes avec PIN » est vrai (rien à reprocher)", () => {
    expect(construireRapport(entrees()).annulations).toEqual({
      nombre: 0,
      montant: 0,
      toutesAvecPin: true,
    });
  });

  it("ignore une annulation décidée un autre jour", () => {
    const r = construireRapport(
      entrees({ annulations: [annulation({ at: instant("14:00", VEILLE) })] }),
    );
    expect(r.annulations.nombre).toBe(0);
  });
});

describe("la question suggérée", () => {
  it("vient de l'assistant quand il en propose une, sinon elle est vide", () => {
    const avec = construireRapport(
      entrees({
        question: { question: "Pourquoi le 09:30 part si vide ?", reponse: "Trois jours à 55 %." },
      }),
    );
    expect(avec.questionSuggeree).toEqual({
      question: "Pourquoi le 09:30 part si vide ?",
      reponse: "Trois jours à 55 %.",
    });
    expect(construireRapport(entrees()).questionSuggeree).toEqual({ question: "", reponse: "" });
  });
});

describe("déterminisme", () => {
  it("les mêmes faits donnent exactement le même rapport", () => {
    const faits = entrees({
      billets: [billet(), billet({ gareId: MVAN, montant: 4_200 })],
      colis: [colis()],
      caisses: [caisse({ ecart: -300 })],
      departs: [depart({ vendus: 10 })],
    });
    expect(construireRapport(faits)).toEqual(construireRapport(faits));
  });

  it("ne modifie pas les faits qu'on lui donne", () => {
    const faits = entrees({ billets: [billet()], incidents: ["colis : données indisponibles"] });
    const avant = structuredClone(faits);
    construireRapport(faits);
    expect(faits).toEqual(avant);
  });
});

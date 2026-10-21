import { describe, expect, it } from "vitest";
import { FaitsMemoire } from "./memoire";
import {
  arrondirPct,
  calculerRapprochement,
  devinerCause,
  masquerTelephone,
  tauxRapprochePct,
} from "./rapprochement";
import {
  COLIS_A_RATTACHER,
  ORPHELINES,
  TELEPHONES,
  iso,
  ligneReleve,
  vente,
} from "./testing/donnees";

const C = "agence-test";

describe("masquer le numéro du payeur", () => {
  it("garde le premier chiffre, l'indicatif de l'opérateur et les deux derniers chiffres", () => {
    expect(masquerTelephone("+237677123441")).toBe("6 77 •• •• 41");
    expect(masquerTelephone("237699000002")).toBe("6 99 •• •• 02");
    expect(masquerTelephone("650 00 00 77")).toBe("6 50 •• •• 77");
  });

  it("ne laisse rien passer d'un numéro de format inconnu", () => {
    expect(masquerTelephone("12345")).toBe("•• •• 45");
    expect(masquerTelephone("")).toBe("•• •• ");
  });
});

describe("taux de rapprochement (calculé sur les références de l'opérateur)", () => {
  it("1 916 références dont 4 sans vente donnent 99,8 %", () => {
    expect(tauxRapprochePct(1916, 1912, 1912)).toBe(99.8);
  });

  it("tout rapproché vaut 100, rien de rapproché vaut 0", () => {
    expect(tauxRapprochePct(500, 500, 500)).toBe(100);
    expect(tauxRapprochePct(500, 0, 500)).toBe(0);
  });

  it("sans relevé, ce n'est pas 100 % quand des ventes mobiles attendent d'être rapprochées", () => {
    expect(tauxRapprochePct(0, 0, 12)).toBe(0);
    expect(tauxRapprochePct(0, 0, 0)).toBe(100);
  });

  it("arrondit à une décimale", () => {
    expect(arrondirPct(99.7912)).toBe(99.8);
    expect(arrondirPct(0.2092)).toBe(0.2);
  });
});

describe("cause probable d'une transaction sans correspondance", () => {
  function monde() {
    const faits = new FaitsMemoire();
    // Un billet DLA -> BAF de 10:00, déjà payé 40 secondes plus tôt avec le même numéro.
    faits.ventes.set(TELEPHONES.doublon, [
      {
        numero: "A-1",
        genre: "billet",
        at: iso("2026-12-03", "11:41:20"),
        montant: 4000,
        ligne: "DLA-BAF",
        depart: "10:00",
        referenceOperateur: "MP-PREMIER",
        canal: "en_ligne",
      },
    ]);
    return faits;
  }
  const doublon = () =>
    ligneReleve({
      reference: ORPHELINES.doublon,
      recueA: iso("2026-12-03", "11:42:00"),
      telephone: TELEPHONES.doublon,
      montant: 4000,
    });

  it("un second paiement du même montant, quelques secondes après le premier, est un doublon à rembourser", async () => {
    const cause = await devinerCause(C, doublon(), monde());
    expect(cause).toEqual({
      cause: "doublon_paiement",
      explication:
        "Probable : billet DLA → BAF 10:00 payé 2 fois, 2e paiement 40 s après le 1er (réseau)",
      actionProposee: "rembourser",
      cibleSuggeree: null,
    });
  });

  it("au-delà de deux minutes, l'écart est dit en minutes", async () => {
    const faits = monde();
    faits.ventes.set(TELEPHONES.doublon, [
      { ...faits.ventes.get(TELEPHONES.doublon)![0]!, at: iso("2026-12-03", "11:37:00") },
    ]);
    const cause = await devinerCause(C, doublon(), faits);
    expect(cause.explication).toContain("2e paiement 5 min après le 1er");
  });

  it("un montant différent, ou un paiement trop ancien, ou la même référence, n'est pas un doublon", async () => {
    const base = monde().ventes.get(TELEPHONES.doublon)![0]!;
    const cas = [
      { ...base, montant: 3500 },
      { ...base, at: iso("2026-12-03", "11:20:00") }, // 22 minutes avant
      { ...base, referenceOperateur: ORPHELINES.doublon },
      { ...base, referenceOperateur: null }, // payé en espèces : pas un doublon MoMo
      { ...base, at: iso("2026-12-03", "11:43:00") }, // après la transaction
    ];
    for (const vente of cas) {
      const faits = new FaitsMemoire();
      faits.ventes.set(TELEPHONES.doublon, [vente]);
      expect((await devinerCause(C, doublon(), faits)).cause).toBe("inconnue");
    }
  });

  it("le paiement arrivé après l'expiration du siège est à rembourser, et le texte dit si le client a repayé au guichet", async () => {
    const ligne = ligneReleve({
      reference: ORPHELINES.expiration,
      recueA: iso("2026-12-09", "06:58:00"),
      telephone: TELEPHONES.expiration,
      operateur: "orange",
      montant: 4000,
    });
    const faits = new FaitsMemoire();
    faits.expires.set(TELEPHONES.expiration, [
      { expireA: iso("2026-12-09", "06:41:00"), montant: 4000, ligne: "DLA-YDE", depart: "07:00" },
    ]);
    const sansRepaiement = await devinerCause(C, ligne, faits);
    expect(sansRepaiement).toMatchObject({
      cause: "paiement_apres_expiration",
      actionProposee: "rembourser",
      explication: "Probable : paiement arrivé après l'expiration du siège (15 min)",
    });

    faits.ventes.set(TELEPHONES.expiration, [
      {
        numero: "A-2",
        genre: "billet",
        at: iso("2026-12-09", "06:50:00"),
        montant: 4000,
        ligne: "DLA-YDE",
        depart: "07:00",
        referenceOperateur: null,
        canal: "guichet",
      },
    ]);
    const avecRepaiement = await devinerCause(C, ligne, faits);
    expect(avecRepaiement.explication).toBe(
      "Probable : paiement arrivé après l'expiration du siège (15 min) · le client a repayé au guichet",
    );
  });

  it("un colis payé à l'arrivée sans scan de dépôt est à rattacher à ce colis", async () => {
    const faits = new FaitsMemoire();
    faits.colis.set(TELEPHONES.colis, [
      { numero: COLIS_A_RATTACHER, montant: 5000, relais: "Bonabéri" },
    ]);
    const cause = await devinerCause(
      C,
      ligneReleve({ telephone: TELEPHONES.colis, montant: 5000 }),
      faits,
    );
    expect(cause).toEqual({
      cause: "scan_depot_manquant",
      explication: `Probable : colis payé à l'arrivée au relais Bonabéri, scan de dépôt manquant · à rattacher au colis ${COLIS_A_RATTACHER}`,
      actionProposee: "rattacher",
      cibleSuggeree: COLIS_A_RATTACHER,
    });
  });

  it("un colis d'un autre montant ne se rattache pas", async () => {
    const faits = new FaitsMemoire();
    faits.colis.set(TELEPHONES.colis, [{ numero: COLIS_A_RATTACHER, montant: 5000, relais: null }]);
    const cause = await devinerCause(
      C,
      ligneReleve({ telephone: TELEPHONES.colis, montant: 4500 }),
      faits,
    );
    expect(cause.cause).toBe("inconnue");
    expect(cause.cibleSuggeree).toBeNull();
  });

  it("sans aucun indice, il faut demander la pièce à l'opérateur ; un numéro connu change la phrase", async () => {
    const faits = new FaitsMemoire();
    const ligne = ligneReleve({ telephone: TELEPHONES.inconnue, montant: 3000 });
    const jamaisVu = await devinerCause(C, ligne, faits);
    expect(jamaisVu).toEqual({
      cause: "inconnue",
      explication:
        "Inconnu : aucun billet, aucun colis, numéro jamais vu · demander la pièce à l'opérateur",
      actionProposee: "demander",
      cibleSuggeree: null,
    });
    faits.connus.add(TELEPHONES.inconnue);
    const connu = await devinerCause(C, ligne, faits);
    expect(connu.cause).toBe("inconnue");
    expect(connu.explication).toContain("numéro déjà connu");
  });

  it("le doublon l'emporte sur l'expiration, l'expiration sur le colis", async () => {
    const faits = monde();
    faits.expires.set(TELEPHONES.doublon, [
      { expireA: iso("2026-12-03", "11:30:00"), montant: 4000, ligne: "DLA-BAF", depart: "10:00" },
    ]);
    faits.colis.set(TELEPHONES.doublon, [
      { numero: COLIS_A_RATTACHER, montant: 4000, relais: null },
    ]);
    expect((await devinerCause(C, doublon(), faits)).cause).toBe("doublon_paiement");
    faits.ventes.clear();
    expect((await devinerCause(C, doublon(), faits)).cause).toBe("paiement_apres_expiration");
    faits.expires.clear();
    expect((await devinerCause(C, doublon(), faits)).cause).toBe("scan_depot_manquant");
  });
});

describe("rapprochement d'un mois", () => {
  const faits = new FaitsMemoire();

  it("une ligne du relevé est rapprochée quand une vente porte sa référence ; les autres sont sans correspondance", async () => {
    const ventes = [
      vente({ moyen: "mtn", prix: 5000, referenceOperateur: "MP-1" }),
      vente({ moyen: "orange", prix: 3500, referenceOperateur: "OM-2" }),
      vente({ moyen: "cash", prix: 7500 }),
    ];
    const releve = [
      ligneReleve({ reference: "MP-1", montant: 5000 }),
      ligneReleve({ reference: "OM-2", montant: 3500, operateur: "orange" }),
      ligneReleve({
        reference: "MP-ORPHELINE",
        montant: 4000,
        recueA: iso("2026-12-05", "10:00:00"),
      }),
    ];
    const r = await calculerRapprochement({
      compagnieId: C,
      releve,
      ventes,
      referencesConnues: new Set(["MP-1", "OM-2"]),
      faits,
    });
    expect(r.references).toBe(3);
    expect(r.rapprochees).toBe(2);
    expect(r.recuMarchand).toBe(12_500);
    expect(r.ventesMobile).toEqual({ nombre: 2, montant: 8500 });
    expect(r.sansCorrespondance.map((t) => [t.reference, t.montant])).toEqual([
      ["MP-ORPHELINE", 4000],
    ]);
    expect(r.sansCorrespondance[0]!.telephoneMasque).toBe("6 77 •• •• 41");
  });

  it("une référence répétée dans le relevé ne compte qu'une fois", async () => {
    const r = await calculerRapprochement({
      compagnieId: C,
      releve: [
        ligneReleve({ reference: "MP-DOUBLE", montant: 4000 }),
        ligneReleve({ reference: "MP-DOUBLE", montant: 4000 }),
      ],
      ventes: [],
      referencesConnues: new Set(),
      faits,
    });
    expect(r.references).toBe(1);
    expect(r.recuMarchand).toBe(4000);
    expect(r.sansCorrespondance).toHaveLength(1);
  });

  it("les ventes mobiles annulées ne comptent pas dans les ventes, mais dans le brut que l'opérateur a reçu", async () => {
    const r = await calculerRapprochement({
      compagnieId: C,
      releve: [],
      ventes: [
        vente({ moyen: "mtn", prix: 5000, referenceOperateur: "MP-A" }),
        vente({
          moyen: "mtn",
          prix: 3500,
          referenceOperateur: "MP-B",
          annuleeA: iso("2026-12-02"),
        }),
        vente({ moyen: "carte", prix: 9000, referenceOperateur: "CB-1" }),
      ],
      referencesConnues: new Set(),
      faits,
    });
    expect(r.ventesMobile).toEqual({ nombre: 1, montant: 5000 });
    expect(r.montantMobileBrut).toBe(8500);
  });

  it("classe les lignes sans correspondance de la plus ancienne à la plus récente", async () => {
    const r = await calculerRapprochement({
      compagnieId: C,
      releve: [
        ligneReleve({ reference: "B", recueA: iso("2026-12-20") }),
        ligneReleve({ reference: "A", recueA: iso("2026-12-03") }),
        ligneReleve({ reference: "C", recueA: iso("2026-12-20") }),
      ],
      ventes: [],
      referencesConnues: new Set(),
      faits,
    });
    expect(r.sansCorrespondance.map((t) => t.reference)).toEqual(["A", "B", "C"]);
  });
});

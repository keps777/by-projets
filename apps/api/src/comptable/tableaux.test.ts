import { describe, expect, it } from "vitest";
import { analyserCsv, ligneCsv } from "./formats";
import { genererFichier } from "./fichiers";
import { IDS_EXPORT } from "./modele";
import { encaisse } from "./regles";
import {
  COLONNES,
  COLONNES_PAR_EXPORT,
  FORMAT_EXPORT,
  construireTableau,
  construireTousLesTableaux,
  descriptionExport,
  nomDeFichier,
} from "./tableaux";
import {
  AGENCE,
  ajouterOrphelines,
  annulation,
  creerMonde,
  iso,
  peuplerMois,
  session,
  vente,
} from "./testing/donnees";

const somme = (valeurs: readonly number[]) => valeurs.reduce((s, v) => s + v, 0);

async function decembre(options: Parameters<typeof peuplerMois>[3] = {}) {
  const m = creerMonde();
  const resume = peuplerMois(m, AGENCE, "2026-12", options);
  ajouterOrphelines(m, AGENCE, "2026-12");
  const d = await m.chargeur.charger(AGENCE, "2026-12");
  return { m, d, resume };
}

describe("mêmes colonnes chaque mois", () => {
  it("les colonnes sont les mêmes pour un mois plein, un mois vide et un autre mois", async () => {
    const m = creerMonde();
    peuplerMois(m, AGENCE, "2026-12");
    peuplerMois(m, AGENCE, "2026-11", { graine: 99, jours: 5 });
    const plein = await m.chargeur.charger(AGENCE, "2026-12");
    const autre = await m.chargeur.charger(AGENCE, "2026-11");
    const vide = await m.chargeur.charger(AGENCE, "2026-02");
    for (const id of IDS_EXPORT) {
      const colonnes = (d: typeof plein) =>
        construireTableau(id, d).onglets.map((o) => [o.id, o.colonnes]);
      expect(colonnes(autre), id).toEqual(colonnes(plein));
      expect(colonnes(vide), id).toEqual(colonnes(plein));
    }
  });

  it("épingle les colonnes de chaque export (un changement ici casse l'import du cabinet)", () => {
    expect(COLONNES.ventes).toEqual([
      "date",
      "heure",
      "ligne",
      "depart",
      "siege",
      "classe",
      "prix",
      "mode",
      "ref",
      "guichet",
      "pin",
    ]);
    expect(COLONNES.ecritures).toEqual([
      "journal",
      "date",
      "piece",
      "compte",
      "libelle",
      "debit",
      "credit",
    ]);
    expect(COLONNES.annulations).toHaveLength(10);
    expect(COLONNES.sessions).toHaveLength(15);
    expect(COLONNES.factures).toHaveLength(8);
    expect(COLONNES_PAR_EXPORT.journal_ventes).toBe(COLONNES.ventes);
  });

  it("le format de chaque export est celui des maquettes : XLSX, XLSX, CSV, CSV, PDF", () => {
    expect(IDS_EXPORT.map((id) => FORMAT_EXPORT[id])).toEqual([
      "XLSX",
      "XLSX",
      "CSV",
      "CSV",
      "PDF",
    ]);
    expect(nomDeFichier("journal_ventes", "2026-12")).toBe("journal-ventes-2026-12.xlsx");
    expect(nomDeFichier("ecritures_syscohada", "2026-12")).toBe("ecritures-syscohada-2026-12.csv");
    expect(nomDeFichier("factures_afrimove", "2026-12")).toBe("factures-afrimove-2026-12.pdf");
  });

  it("chaque ligne a autant de cellules que de colonnes", async () => {
    const { d } = await decembre();
    for (const tableau of construireTousLesTableaux(d)) {
      for (const onglet of tableau.onglets) {
        for (const ligne of onglet.lignes) {
          expect(ligne, `${tableau.id}/${onglet.id}`).toHaveLength(onglet.colonnes.length);
        }
      }
    }
  });

  it("un mois sans rien donne des tableaux vides, sauf le « par jour » qui garde ses jours", async () => {
    const m = creerMonde();
    const d = await m.chargeur.charger(AGENCE, "2026-02");
    const ventes = construireTableau("journal_ventes", d);
    expect(ventes.lignes).toBe(0);
    expect(ventes.onglets.find((o) => o.id === "ventes")?.lignes).toEqual([]);
    expect(ventes.onglets.find((o) => o.id === "par_jour")?.lignes).toHaveLength(28);
    expect(ventes.onglets.every((o) => o.totalMontant === 0)).toBe(true);
    expect(construireTableau("ecritures_syscohada", d).lignes).toBe(0);
  });
});

describe("le total des exports égale le total encaissé au franc près", () => {
  it("le journal des ventes : lignes, par jour, par guichet et totaux retrouvent le même total", async () => {
    const { d } = await decembre({ parJour: 9 });
    const attendu = encaisse(d.ventes);
    expect(attendu.total).toBeGreaterThan(0);

    const tableau = construireTableau("journal_ventes", d);
    const [ventes, parJour, parGuichet, totaux] = tableau.onglets;
    // Les lignes : la somme du prix des lignes qui ne sont pas annulées.
    const colPrix = ventes!.colonnes.indexOf("prix");
    const colMode = ventes!.colonnes.indexOf("mode");
    const sommeLignes = somme(
      ventes!.lignes.filter((l) => l[colMode] !== "ANNULÉ").map((l) => l[colPrix] as number),
    );
    expect(sommeLignes).toBe(attendu.total);
    expect(ventes!.totalMontant).toBe(attendu.total);
    expect(ventes!.lignes).toHaveLength(d.ventes.length);

    const colTotal = (o: NonNullable<typeof parJour>) => o.colonnes.indexOf("total");
    expect(somme(parJour!.lignes.map((l) => l[colTotal(parJour!)] as number))).toBe(attendu.total);
    expect(somme(parGuichet!.lignes.map((l) => l[colTotal(parGuichet!)] as number))).toBe(
      attendu.total,
    );
    const valeur = (nom: string) => totaux!.lignes.find((l) => l[0] === nom)![1];
    expect(valeur("total_encaisse")).toBe(attendu.total);
    expect(valeur("cash")).toBe(attendu.cash);
    expect(valeur("momo")).toBe(attendu.momo);
    expect(valeur("carte")).toBe(attendu.carte);
    expect(valeur("lignes")).toBe(d.ventes.length);
    expect(valeur("billets")).toBe(
      d.ventes.filter((v) => v.genre === "billet" && v.annuleeA === null).length,
    );
  });

  it("les écritures : crédit 706 = débit 571 + 462 = total encaissé, tout est équilibré", async () => {
    const { d } = await decembre({ parJour: 9 });
    const attendu = encaisse(d.ventes);
    const tableau = construireTableau("ecritures_syscohada", d);
    const lignes = tableau.onglets[0]!.lignes;
    const [iJournal, , , iCompte, , iDebit, iCredit] = [0, 1, 2, 3, 4, 5, 6];
    const ve = lignes.filter((l) => l[iJournal] === "VE");
    const total = (compte: string, colonne: number) =>
      somme(ve.filter((l) => l[iCompte] === compte).map((l) => l[colonne] as number));
    expect(total("706", iCredit)).toBe(attendu.total);
    expect(total("571", iDebit)).toBe(attendu.cash);
    expect(total("462", iDebit)).toBe(attendu.momo + attendu.carte);
    expect(total("706", iDebit) + total("571", iCredit) + total("462", iCredit)).toBe(0);
    // Tout le fichier, factures comprises, est équilibré.
    expect(somme(lignes.map((l) => l[iDebit] as number))).toBe(
      somme(lignes.map((l) => l[iCredit] as number)),
    );
    expect(tableau.onglets[0]!.totalMontant).toBe(somme(lignes.map((l) => l[iDebit] as number)));
  });

  it("le journal de caisse : guichets + ligne = total encaissé, et chaque session retrouve ses ventes", async () => {
    const { d } = await decembre({ parJour: 9 });
    const attendu = encaisse(d.ventes);
    const tableau = construireTableau("journal_caisse", d);
    const [sessions, totaux] = tableau.onglets;
    const valeur = (nom: string) => totaux!.lignes.find((l) => l[0] === nom)![1] as number;
    expect(valeur("encaisse_guichets") + valeur("encaisse_en_ligne")).toBe(attendu.total);
    expect(valeur("total_encaisse")).toBe(attendu.total);
    expect(valeur("sessions")).toBe(d.sessions.length);
    expect(totaux!.totalMontant).toBe(attendu.total);

    // Les espèces ne s'encaissent qu'au guichet : la caisse retrouve tout le cash du mois.
    const iCash = sessions!.colonnes.indexOf("cash");
    expect(somme(sessions!.lignes.map((l) => l[iCash] as number))).toBe(attendu.cash);
    // Et le total des sessions est celui des ventes de guichet.
    expect(sessions!.totalMontant).toBe(valeur("encaisse_guichets"));
    expect(valeur("ecarts")).toBe(somme(d.sessions.map((s) => s.ecart ?? 0)));
  });

  it("les factures : 75 F par billet et 150 F par colis, retrouvés ligne par ligne", async () => {
    const { d } = await decembre({ parJour: 9 });
    const tableau = construireTableau("factures_afrimove", d);
    const onglet = tableau.onglets[0]!;
    const col = (nom: string) => onglet.colonnes.indexOf(nom);
    for (const l of onglet.lignes) {
      expect(l[col("montant_billets")]).toBe((l[col("billets")] as number) * 75);
      expect(l[col("montant_colis")]).toBe((l[col("colis")] as number) * 150);
      expect(l[col("total")]).toBe(
        (l[col("montant_billets")] as number) + (l[col("montant_colis")] as number),
      );
    }
    expect(onglet.totalMontant).toBe(somme(onglet.lignes.map((l) => l[col("total")] as number)));
    expect(tableau.lignes).toBeNull();
    expect(tableau.texte.at(-1)?.texte).toContain("Total du mois");
  });

  it("les annulations : le total est celui des remboursements, MoMo sans correspondance compris", async () => {
    const m = creerMonde();
    m.annulations.ajouter(
      AGENCE,
      annulation({ at: iso("2026-12-10", "10:00:00"), montant: 5000, decision: "rembourser" }),
      annulation({ at: iso("2026-12-11", "10:00:00"), montant: 3500, decision: "avoir" }),
      annulation({ at: iso("2026-12-12", "10:00:00"), montant: 7500, decision: "refuser" }),
    );
    const d = await m.chargeur.charger(AGENCE, "2026-12");
    const tableau = construireTableau("annulations", d);
    expect(tableau.lignes).toBe(3);
    expect(tableau.onglets[0]!.totalMontant).toBe(5000);
  });

  it("une annulation décidée après la fin du mois ne change ni la vente ni le total du mois", async () => {
    const m = creerMonde();
    m.ventes.ajouter(
      AGENCE,
      vente({
        at: iso("2026-12-31", "22:00:00"),
        prix: 5000,
        annuleeA: iso("2027-01-02", "10:00:00"),
      }),
      vente({ at: iso("2026-12-31", "22:30:00"), prix: 3500 }),
    );
    const d = await m.chargeur.charger(AGENCE, "2026-12");
    expect(encaisse(d.ventes).total).toBe(8500);
    const ligne = construireTableau("journal_ventes", d).onglets[0]!.lignes[0]!;
    expect(ligne[7]).toBe("CASH"); // pas « ANNULÉ » : l'annulation est de janvier
  });

  it("les ventes de la dernière minute du mois restent dans le mois, celles de minuit pile passent au suivant", async () => {
    const m = creerMonde();
    m.ventes.ajouter(
      AGENCE,
      vente({ at: "2026-12-31T23:59:59.999+01:00", prix: 1000 }),
      vente({ at: "2027-01-01T00:00:00.000+01:00", prix: 2000 }),
    );
    expect(encaisse((await m.chargeur.charger(AGENCE, "2026-12")).ventes).total).toBe(1000);
    expect(encaisse((await m.chargeur.charger(AGENCE, "2027-01")).ventes).total).toBe(2000);
  });
});

describe("contenu des lignes", () => {
  it("le journal des ventes écrit la date, l'heure, le mode et la référence comme le CSV de la maquette", async () => {
    const m = creerMonde();
    m.ventes.ajouter(
      AGENCE,
      vente({
        at: iso("2026-12-01", "05:52:00"),
        ligne: "DLA-YDE",
        depart: "06:00",
        siege: "12",
        classe: "CLASSIQUE",
        prix: 5000,
        moyen: "cash",
        numero: "A-ALP-2341",
        guichet: "GU1",
        agent: "JM",
      }),
      vente({
        at: iso("2026-12-01", "05:54:00"),
        siege: "13",
        moyen: "mtn",
        referenceOperateur: "MP261201.0554.C10211",
        numero: "A-ALP-2342",
        guichet: "GU1",
        agent: "JM",
      }),
      vente({
        at: iso("2026-12-01", "06:08:00"),
        genre: "colis",
        ligne: "COLIS",
        depart: null,
        siege: null,
        classe: "3 kg",
        prix: 3000,
        moyen: "mtn",
        referenceOperateur: "MP261201.0608.D20000",
        numero: "C-ALP-0001",
        guichet: "GU3",
        agent: "PN",
      }),
    );
    const d = await m.chargeur.charger(AGENCE, "2026-12");
    const onglet = construireTableau("journal_ventes", d).onglets[0]!;
    expect(onglet.lignes.map((l) => ligneCsv(l))).toEqual([
      "2026-12-01;05:52;DLA-YDE;06:00;12;CLASSIQUE;5000;CASH;A-ALP-2341;GU1;JM",
      "2026-12-01;05:54;DLA-YDE;09:00;13;CLASSIQUE;5000;MOMO;MP261201.0554.C10211;GU1;JM",
      "2026-12-01;06:08;COLIS;;;3 kg;3000;MOMO;MP261201.0608.D20000;GU3;PN",
    ]);
    expect(onglet.libelle).toBe("Ventes · 3");
  });

  it("les onglets du journal des ventes sont Ventes, Par jour, Par guichet, Totaux", async () => {
    const { d } = await decembre({ jours: 3 });
    const onglets = construireTableau("journal_ventes", d).onglets;
    expect(onglets.map((o) => o.id)).toEqual(["ventes", "par_jour", "par_guichet", "totaux"]);
    expect(onglets.map((o) => o.libelle.split(" · ")[0])).toEqual([
      "Ventes",
      "Par jour",
      "Par guichet",
      "Totaux",
    ]);
  });

  it("le journal de caisse dit les écarts et qui a validé, et laisse vides les champs d'une session ouverte", async () => {
    const m = creerMonde();
    m.sessions.ajouter(
      AGENCE,
      session({
        id: "s1",
        cashAttendu: 150_000,
        cashCompte: 149_000,
        ecart: -1000,
        validePar: "Mme Essono",
        validation: "pin",
      }),
      session({
        id: "s2",
        ouverteA: iso("2026-12-02", "05:30:00"),
        clotureeA: null,
        cashAttendu: null,
        cashCompte: null,
        ecart: null,
        validePar: null,
        validation: null,
      }),
    );
    const d = await m.chargeur.charger(AGENCE, "2026-12");
    const [s1, s2] = construireTableau("journal_caisse", d).onglets[0]!.lignes;
    const col = COLONNES.sessions;
    expect(s1![col.indexOf("ecart")]).toBe(-1000);
    expect(s1![col.indexOf("valide_par")]).toBe("Mme Essono");
    expect(s1![col.indexOf("validation")]).toBe("PIN");
    expect(s2![col.indexOf("cloture")]).toBeNull();
    expect(s2![col.indexOf("ecart")]).toBeNull();
    expect(s2![col.indexOf("validation")]).toBeNull();
  });

  it("les annulations listent aussi les décisions du rapprochement, avec leur référence opérateur", async () => {
    const m = creerMonde();
    const d0 = await m.chargeur.charger(AGENCE, "2026-12");
    const d = {
      ...d0,
      decisions: [
        {
          compagnieId: AGENCE,
          mois: "2026-12",
          reference: "MP261203.1142.A71290",
          action: "rembourser" as const,
          cible: null,
          montant: 4000,
          operateur: "mtn" as const,
          telephoneMasque: "6 77 •• •• 41",
          cause: "doublon_paiement" as const,
          explication: "Probable : billet payé 2 fois",
          decideA: iso("2027-01-04", "10:00:00"),
          parId: "p",
          parNom: "Mme Mbarga",
          journalId: "j",
          methode: "pin" as const,
          execution: "faite" as const,
          referenceExecution: "R1",
        },
      ],
    };
    const t = construireTableau("annulations", d);
    const col = COLONNES.annulations;
    const ligne = t.onglets[0]!.lignes[0]!;
    expect(ligne[col.indexOf("ref")]).toBe("MP261203.1142.A71290");
    expect(ligne[col.indexOf("genre")]).toBe("momo_sans_correspondance");
    expect(ligne[col.indexOf("decision")]).toBe("rembourser");
    expect(ligne[col.indexOf("valide_par")]).toBe("Mme Mbarga");
    expect(ligne[col.indexOf("validation")]).toBe("PIN");
    expect(t.onglets[0]!.totalMontant).toBe(4000);
  });
});

describe("descriptions de la liste du comptable", () => {
  it("reprennent les phrases des maquettes avec les vrais nombres de lignes", async () => {
    const m = creerMonde();
    m.ventes.ajouter(AGENCE, vente({ at: iso("2026-12-01") }), vente({ at: iso("2026-12-02") }));
    m.annulations.ajouter(AGENCE, annulation({ at: iso("2026-12-10") }));
    const d = await m.chargeur.charger(AGENCE, "2026-12");
    expect(descriptionExport("journal_ventes", d)).toEqual({
      description: "une ligne par billet et par colis · 2 lignes",
      statut: "disponible",
      lignes: 2,
    });
    expect(descriptionExport("journal_caisse", d).description).toBe(
      "une ligne par session · écarts · validations PIN",
    );
    expect(descriptionExport("annulations", d).description).toBe("motif · qui a validé · 1 ligne");
    expect(descriptionExport("ecritures_syscohada", d).description).toBe(
      "706 · 571 · 462 · 622 · prêt pour le cabinet",
    );
  });

  it("les factures disent combien sont payées : « à jour » seulement quand toutes le sont", async () => {
    const m = creerMonde();
    m.ventes.ajouter(AGENCE, vente({ at: iso("2026-12-02") }));
    let d = await m.chargeur.charger(AGENCE, "2026-12");
    expect(descriptionExport("factures_afrimove", d)).toEqual({
      description: "4 factures hebdo · 75 F / billet · 150 F / colis · 4 à payer",
      statut: "disponible",
      lignes: null,
    });
    for (const dimanche of ["2026-12-06", "2026-12-13", "2026-12-20", "2026-12-27"]) {
      m.facturesPayees.payer(AGENCE, dimanche, "2027-01-02");
    }
    d = await m.chargeur.charger(AGENCE, "2026-12");
    expect(descriptionExport("factures_afrimove", d)).toEqual({
      description: "4 factures hebdo · 75 F / billet · 150 F / colis · payées",
      statut: "a_jour",
      lignes: null,
    });
  });

  it("aucune description ne parle d'abonnement (le modèle commercial est sans abonnement)", async () => {
    const { d } = await decembre({ jours: 3 });
    for (const id of IDS_EXPORT) {
      expect(descriptionExport(id, d).description.toLowerCase()).not.toContain("abonnement");
    }
    const factures = construireTableau("factures_afrimove", d);
    expect(JSON.stringify(factures.texte).toLowerCase()).not.toContain("abonnement");
  });
});

describe("injection de formule dans un export", () => {
  it("un motif qui commence par = + - @ est neutralisé dans le CSV, les montants restent des nombres", async () => {
    const m = creerMonde();
    m.annulations.ajouter(
      AGENCE,
      annulation({ motif: '=HYPERLINK("http://pirate.example","cliquer")', montant: 5000 }),
      annulation({ motif: "+237 600 000 000", at: iso("2026-12-11") }),
      annulation({ motif: "-1 siège", at: iso("2026-12-12") }),
      annulation({ motif: "@SOMME(A1)", at: iso("2026-12-13") }),
    );
    const d = await m.chargeur.charger(AGENCE, "2026-12");
    const fichier = genererFichier({
      tableau: construireTableau("annulations", d),
      compagnieId: AGENCE,
      mois: "2026-12",
      genereA: d.maintenant,
      cle: Buffer.alloc(32, 1),
    });
    const csv = analyserCsv(fichier.contenu.toString("utf8"));
    const iMotif = csv.colonnes.indexOf("motif");
    expect(csv.lignes.map((l) => l[iMotif])).toEqual([
      `'=HYPERLINK("http://pirate.example","cliquer")`,
      "'+237 600 000 000",
      "'-1 siège",
      "'@SOMME(A1)",
    ]);
    expect(csv.lignes[0]![csv.colonnes.indexOf("montant")]).toBe("5000");
  });
});

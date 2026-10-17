// @vitest-environment jsdom
import { agence as c } from "@afrimove/contrats";
import { ecrans } from "@afrimove/fixtures";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  useCadenceBillet,
  useCadenceEtat,
  useCaisseSession,
  useChauffeurFeuille,
  useColisDepot,
  useColisFormulaire,
  useControleInopine,
  useConvoyeurEtat,
  useGareDirect,
  useGuichetAccueil,
  useImpressionEtat,
  useJournal,
  useQuaiCadence,
  useQuaiDirect,
  useQuaiEmbarquement,
  useSuperviseurAnnulation,
  useSuperviseurAppareil,
  useSuperviseurCloture,
  useSuperviseurEquipe,
  useSuperviseurGare,
  useVenteContexte,
} from "./hooks";
import { donnees, contexteTest } from "./outils-test";

afterEach(cleanup);

/**
 * Un test par planche de l'agence : les hooks dont l'écran a besoin, branchés sur le mock du
 * scénario de la planche (@afrimove/fixtures), renvoient les valeurs que la maquette affiche — sans
 * backend. Les valeurs attendues sont écrites en dur : ce sont celles de la maquette.
 */

describe("planche Guichet (18)", () => {
  it("useGuichetAccueil : compteurs, quai, prochain départ", async () => {
    const { wrapper } = contexteTest("Guichet");
    const { result } = renderHook(() => useGuichetAccueil(), { wrapper });
    const a = await donnees(result);
    expect(a.agence).toEqual({ compagnie: "Alpha Voyages", gare: "Akwa" });
    expect(a.guichet).toMatchObject({
      rang: 2,
      id: "guichet-alp-dla-2",
      caisseOuverteA: "2027-01-05T05:02:00.000+01:00",
    });
    expect(a.guichet.agent.nom).toBe("Joseph M.");
    expect(a.synchro.etat).toBe("sync");
    expect(a.compteurs).toEqual({
      billets: 184,
      colis: 41,
      colisACharger: 3,
      enCaisse: 612_000,
      ecart: 0,
    });
    expect(a.quai).toMatchObject({ destination: "Yaoundé", scannes: 31, capacite: 40 });
    expect(a.cadence.fileAttente).toBe(40);
    expect(a.prochainDepart).toMatchObject({
      heureDepart: "2027-01-05T08:30:00.000+01:00",
      destination: "Yaoundé",
      placesLibres: 9,
      dansMinutes: 12,
    });
    expect(a.prochaineOuverture?.heureDepart).toBe("2027-01-05T09:00:00.000+01:00");
    expect(a.prochaineOuverture?.destination).toBe("Bafoussam");
  });
});

describe("planche Vente (19)", () => {
  it("useVenteContexte : départs, plan du bus, tarifs, brouillon", async () => {
    const { wrapper } = contexteTest("Vente");
    const { result } = renderHook(() => useVenteContexte(), { wrapper });
    const v = await donnees(result);
    expect(v.guichet.rang).toBe(2);
    expect(v.prochainNumero).toEqual({ sequence: 185, numero: "ALP-DLA-270105-0185" });
    expect(
      v.departs.map((x) => [x.heureDepart.slice(11, 16), x.destination, x.placesLibres]),
    ).toEqual([
      ["08:30", "Yaoundé", 9],
      ["09:00", "Bafoussam", 28],
      ["09:30", "Yaoundé", 40],
    ]);
    expect(v.autresDeparts).toBe(11);
    expect(v.departChoisiId).toBe(ecrans.Vente.entites.departs![0]!.id);
    expect(v.siege.propose).toBe(24);
    expect(v.siege.libres).toBe(9);
    expect(v.siege.plan.colonnes).toBe(11);
    expect(v.siege.plan.cases.filter((x) => x.etat === "libre")).toHaveLength(9);
    expect(v.siege.plan.cases.find((x) => x.numero === 24)?.etat).toBe("attribue");
    expect(v.tarifs).toEqual({ classique: 4000, vip: 5500, bagage: 1000 });
    expect(v.brouillon).toMatchObject({
      passager: { nom: "Tchoumi Paul", telephone: "+237677301145", pieceQuatreDerniers: "8820" },
      paiement: { mode: "cash", recu: 5000, rendu: 1000 },
      sms: true,
      montant: 4000,
    });
  });

  it("useImpressionEtat : l'imprimante de l'appareil", async () => {
    const { wrapper } = contexteTest("Vente");
    const { result } = renderHook(() => useImpressionEtat(), { wrapper });
    expect((await donnees(result)).imprimante.etat).toBe("ok");
  });
});

describe("planche Cadence (20)", () => {
  it("useCadenceEtat : départ en cours, dernier billet, siège suivant", async () => {
    const { wrapper } = contexteTest("Cadence");
    const { result } = renderHook(() => useCadenceEtat(), { wrapper });
    const e = await donnees(result);
    expect(e.depart).toMatchObject({
      heureDepart: "2027-01-05T05:30:00.000+01:00",
      destination: "Yaoundé",
      placesRestantes: 17,
    });
    expect(e.dernierBillet).toMatchObject({ sequence: 231, siege: 18, nom: "Ngono A." });
    expect(e.dernierBillet?.venduA).toBe("2027-01-05T05:13:43.000+01:00");
    expect(e.prochain).toEqual({ prix: 4000, siege: 19 });
    expect(e.vendusEnCadence).toBe(63);
    expect(e.annulations).toBe(0);
    expect(e.synchro).toMatchObject({
      etat: "hors_ligne",
      derniereSyncA: "2027-01-05T05:13:00.000+01:00",
    });
  });
});

describe("planche CadenceBillet (20b)", () => {
  it("useCadenceBillet : le billet 0232 imprimé et ce que l'app a fait", async () => {
    const { wrapper } = contexteTest("CadenceBillet");
    const billetId = ecrans.CadenceBillet.entites.billets![0]!.id;
    const { result } = renderHook(() => useCadenceBillet(billetId), { wrapper });
    const b = await donnees(result);
    expect(b.billet).toMatchObject({
      numero: "ALP-DLA-270105-0232",
      sequence: 232,
      siege: 19,
      codeBillet: "9047",
      prix: 4000,
      aCompleterAuQuai: true,
      passager: { nom: null, pieceQuatreDerniers: null },
    });
    expect(b.vente).toMatchObject({
      dureeMs: 1800,
      placesRestantes: 16,
      paiement: { mode: "cash", recu: 5000, rendu: 1000 },
    });
    expect(b.recapitulatif).toEqual({
      plageSansTrou: true,
      siegeBloque: 19,
      imprime: true,
      caisseCash: 4000,
      sms: "pas_de_numero",
      synchro: "au_retour_du_reseau",
    });
    expect(b.suivant).toEqual({ siege: 20, prix: 4000 });
  });
});

describe("planche CadenceQuai (20c)", () => {
  it("useQuaiCadence : le billet scanné, la saisie, les billets sans nom", async () => {
    const { wrapper } = contexteTest("CadenceQuai");
    const { result } = renderHook(() => useQuaiCadence(), { wrapper });
    const q = await donnees(result);
    expect(q.quai).toBe(1);
    expect(q.depart.heureDepart).toBe("2027-01-05T05:30:00.000+01:00");
    expect(q.convoyeur.nom).toBe("Alain");
    expect(q.scan).toMatchObject({
      numero: "ALP-DLA-270105-0232",
      siege: 19,
      venduA: "2027-01-05T05:14:00.000+01:00",
      guichetRang: 2,
      paiement: "cash",
      montant: 4000,
      validePourCeDepart: true,
    });
    expect(q.saisie).toMatchObject({ nom: "Ngono Albertine", pieceQuatreDerniers: "2210" });
    expect(q.embarquement).toEqual({
      embarques: 21,
      capacite: 40,
      nominatifs: 15,
      cadenceCompletes: 6,
    });
    expect(q.sansNom.total).toBe(11);
    expect(q.sansNom.liste.map((x) => [x.sequence, x.siege, x.paiement, x.smsEnvoye])).toEqual([
      [225, 12, "cash", false],
      [228, 15, "momo", true],
      [231, 18, "cash", false],
    ]);
  });
});

describe("planche GuichetColis (21)", () => {
  it("useColisFormulaire : départs, devis, étiquette, brouillon", async () => {
    const { wrapper } = contexteTest("GuichetColis");
    const { result } = renderHook(() => useColisFormulaire(), { wrapper });
    const f = await donnees(result);
    expect(f.prochainNumero).toEqual({ sequence: 42, numero: "C-DLA-270105-0042" });
    expect(f.guichet.rang).toBe(2);
    expect(f.departs.map((x) => [x.heureDepart.slice(11, 16), x.soutePct])).toEqual([
      ["08:15", 60],
      ["10:00", 20],
    ]);
    expect(f.autreVilleDisponible).toBe(true);
    expect(f.devis.total).toBe(2000);
    expect(f.devis.lignes.map((l) => [l.code, l.montant])).toEqual([
      ["port", 1500],
      ["assurance", 500],
    ]);
    expect(f.etiquette).toMatchObject({
      largeurMm: 58,
      hauteurMm: 40,
      trajet: { origine: "DLA", destination: "BAF" },
      destinataireMasque: "···· 18 22",
      poidsKg: 2,
    });
    expect(f.brouillon).toMatchObject({
      photoPrise: true,
      expediteur: { nom: "Ngo Aïcha", telephone: "+237691221008" },
      destinataire: { nom: "Ngo Thérèse", telephone: "+237699401822" },
      contenu: "Médicaments, vêtements",
      valeurDeclaree: 25_000,
      assure: true,
      modePaiement: "cash",
    });
    expect(f.imprimante.etat).toBe("ok");
  });
});

describe("planche Depot (22)", () => {
  it("useColisDepot : le colis prépayé que le guichet scanne", async () => {
    const { wrapper } = contexteTest("Depot");
    const { result } = renderHook(() => useColisDepot("C-ALP-DLA-270105-0017"), { wrapper });
    const d = await donnees(result);
    expect(d).toMatchObject({
      codeLu: "C-ALP-DLA-270105-0017",
      numero: "C-DLA-270105-0017",
      payeDansApp: 2200,
      trouveA: "2027-01-05T07:40:00.000+01:00",
      expediteur: { nom: "Ngo Aïcha", telephone: "+237691221008" },
      destinataire: { nom: "Ngo Thérèse", destination: "Bafoussam gare" },
      declare: {
        contenu: "Médicaments, vêtements",
        poidsKg: 2,
        valeurDeclaree: 25_000,
        assure: true,
      },
      depart: { destination: "Bafoussam", soutePct: 60 },
      verifications: { poidsReleveKg: 2.1, poidsConforme: true, seuilDepassementKg: 1 },
    });
  });

  it("un code inconnu répond 404 et ne s'affiche pas comme un colis", async () => {
    const { wrapper } = contexteTest("Depot");
    const { result } = renderHook(() => useColisDepot("C-ALP-DLA-270105-9999"), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ statut: 404, code: "COLIS_INCONNU" });
  });
});

describe("planche Quai (23)", () => {
  it("useQuaiEmbarquement : scan, comptage, soute, absents", async () => {
    const { wrapper } = contexteTest("Quai");
    const { result } = renderHook(() => useQuaiEmbarquement(), { wrapper });
    const q = await donnees(result);
    expect(q.quai).toBe(3);
    expect(q.depart).toMatchObject({
      heureDepart: "2027-01-05T08:30:00.000+01:00",
      destination: "Yaoundé",
    });
    expect(q.equipage.bus.immatriculation).toBe("LT 412 AB");
    expect(q.equipage.chauffeur.nom).toBe("Mbarga");
    expect(q.equipage.convoyeur.nom).toBe("Alain");
    expect(q.mode).toBe("scan");
    expect(q.dernierScan).toMatchObject({
      numero: "ALP-DLA-270105-0142",
      resultat: "monte",
      at: "2027-01-05T08:19:42.000+01:00",
      voyageur: "Ngo Aïcha",
      siege: 7,
      pieceQuatreDerniers: "4471",
      classe: "vip",
      bagagesSoute: 1,
    });
    expect(q.embarquement).toEqual({ embarques: 31, capacite: 40, attendus: 9, nonPresentes: 2 });
    expect(q.soute).toEqual({ charges: 14, capacite: 17, colisACharger: 3 });
    expect(q.refuses).toMatchObject({ nombre: 1, motif: "deja_scanne" });
    expect(q.refuses.premierScanA).toBe("2027-01-05T07:58:00.000+01:00");
    expect(q.enRoute).toEqual({ nombre: 4, arret: "Pouma" });
    expect(q.absents.map((a) => [a.voyageur, a.siege, a.actionSuggeree, a.retardPrevenu])).toEqual([
      ["Tchoumi Paul", 24, "code_billet", false],
      ["Essomba R.", 12, "liberer", true],
    ]);
    expect(q.placesAVendre).toBe(9);
  });

  it("useQuaiDirect : le canal temps réel émet l'état du quai", async () => {
    const { wrapper } = contexteTest("Quai");
    const departId = ecrans.Quai.entites.departs![0]!.id;
    const { result } = renderHook(() => useQuaiDirect({ departId }), { wrapper });
    await waitFor(() => expect(result.current.dernier).toBeDefined());
    expect(result.current.etat).toBe("ouvert");
    expect(result.current.dernier).toMatchObject({ departId, embarques: 31, capacite: 40 });
    expect(c.SchemaMessageQuai.safeParse(result.current.dernier).success).toBe(true);
  });
});

describe("planche Convoyeur (24)", () => {
  it("useConvoyeurEtat : à bord, vente en route, colis à décharger", async () => {
    const { wrapper } = contexteTest("Convoyeur");
    const { result } = renderHook(() => useConvoyeurEtat(), { wrapper });
    const e = await donnees(result);
    expect(e.convoyeur.nom).toBe("Alain");
    expect(e.bus.immatriculation).toBe("LT 412 AB");
    expect(e.trajet).toEqual({
      origine: "Douala",
      destination: "Yaoundé",
      partiA: "2027-01-05T08:34:00.000+01:00",
    });
    expect(e.reseau).toBe("hors_ligne");
    expect(e.compteurs).toEqual({
      scannesABord: 33,
      sieges: { libres: 7, reservees: 4, arretReservees: "Pouma" },
      ventesEnRoute: { nombre: 2, montant: 9000 },
    });
    expect(e.vente).toMatchObject({
      arretMontee: "Pouma",
      destination: "Yaoundé",
      places: 1,
      siege: 36,
      prix: 4500,
      saisie: { nom: "Mballa J.", telephone: "6 55 …" },
    });
    expect(e.colisADecharger).toBe(6);
    expect(e.listeNominative.aBord).toBe(33);
  });
});

describe("planche Chauffeur (25)", () => {
  it("useChauffeurFeuille : trajet, dépenses, incidents, semaine", async () => {
    const { wrapper } = contexteTest("Chauffeur");
    const { result } = renderHook(() => useChauffeurFeuille(), { wrapper });
    const f = await donnees(result);
    expect(f.chauffeur.nom).toBe("Mbarga");
    expect(f.bus.immatriculation).toBe("LT 412 AB");
    expect(f.jour).toBe("2027-01-05");
    expect(f.gps).toBe(true);
    expect(f.trajet).toMatchObject({
      origine: "Douala",
      destination: "Yaoundé",
      partiA: "2027-01-05T08:34:00.000+01:00",
      aBord: 33,
      colis: 14,
      prochainArret: { nom: "Pouma", heure: "2027-01-05T10:05:00.000+01:00" },
      vitesseKmh: 84,
      limiteKmh: 90,
    });
    expect(f.depenses.lignes.map((l) => [l.categorie, l.montant, l.justificatif])).toEqual([
      ["carburant", 45_000, true],
      ["peage", 1000, true],
    ]);
    expect(f.depenses.total).toBe(46_000);
    expect(f.incidents.retardParDefautMinutes).toBe(20);
    expect(f.semaine).toEqual({
      trajets: 9,
      km: 2310,
      excesVitesse: 0,
      aRecevoir: 81_000,
      paieLe: "vendredi",
    });
  });
});

describe("planche Controleur (26)", () => {
  it("useControleInopine : comptes, sièges, voyageur sans billet", async () => {
    const { wrapper } = contexteTest("Controleur");
    const { result } = renderHook(() => useControleInopine(), { wrapper });
    const k = await donnees(result);
    expect(k.controleur.nom).toBe("Mme Fouda");
    expect(k.bus.immatriculation).toBe("LT 412 AB");
    expect(k.lieu).toBe("Edéa");
    expect(k.at).toBe("2027-01-05T09:14:00.000+01:00");
    expect(k.comptes).toEqual({ liste: 35, tetes: 36, ecart: 1 });
    expect(k.sieges).toHaveLength(36);
    expect(k.sieges.find((s) => s.numero === 7)?.constat).toBe("sans_billet");
    expect(k.sieges.find((s) => s.numero === 23)?.constat).toBe("libre");
    expect(k.sansBillet).toMatchObject({
      siege: 7,
      lieu: "Edéa",
      montantDeclare: 4000,
      venteEnRouteTrouvee: false,
    });
  });
});

describe("planche Caisse (27)", () => {
  it("useCaisseSession : ce que l'app a compté, le comptage, l'écart", async () => {
    const { wrapper } = contexteTest("Caisse");
    const { result } = renderHook(() => useCaisseSession(), { wrapper });
    const s = await donnees(result);
    expect(s).toMatchObject({
      numero: "K-DLA-270105-2-1",
      guichetRang: 2,
      etat: "ouverte",
      fondDeCaisse: 20_000,
      ouverteA: "2027-01-05T05:02:00.000+01:00",
      periode: { debut: "2027-01-05T05:02:00.000+01:00", fin: "2027-01-05T13:58:00.000+01:00" },
      cashAttendu: 695_500,
      comptage: { pieces: 0, total: 694_500 },
    });
    expect(s.agent.nom).toBe("Joseph M.");
    expect(s.decompte).toEqual({
      billetsCash: { nombre: 184, montant: 612_000 },
      colisCash: { nombre: 41, montant: 71_500 },
      annulationsValidees: { nombre: 2, montant: 8000 },
      momo: { ventes: 63, montant: 252_000 },
    });
    expect(s.comptage.coupures).toEqual([
      { valeur: 10_000, nombre: 48 },
      { valeur: 5000, nombre: 36 },
      { valeur: 2000, nombre: 14 },
      { valeur: 1000, nombre: 5 },
      { valeur: 500, nombre: 3 },
    ]);
    expect(s.ecart).toEqual({
      montant: -1000,
      statut: "dans_tolerance",
      tolerance: 1000,
      hier: 0,
      semaine: -1000,
    });
  });
});

describe("planche Superviseur (28)", () => {
  it("useSuperviseurGare : demandes, guichets, après-midi", async () => {
    const { wrapper } = contexteTest("Superviseur");
    const { result } = renderHook(() => useSuperviseurGare(), { wrapper });
    const g = await donnees(result);
    expect(g.gare.nom).toBe("Akwa");
    expect(g.superviseur.nom).toBe("Mme Essono");
    expect(g.quais).toBe(2);
    expect(g.synchro).toEqual({ synchronises: 3, total: 3 });
    expect(g.demandes).toHaveLength(2);
    expect(g.demandes[0]).toMatchObject({
      genre: "cloture",
      guichetRang: 2,
      compte: 694_500,
      ecart: -1000,
    });
    expect(g.demandes[1]).toMatchObject({
      genre: "annulation",
      guichetRang: 1,
      billetSequence: 171,
      montant: 4000,
      motif: "client parti",
    });
    expect(g.guichets).toEqual([
      { rang: 1, billets: 211, ecart: 0, etat: "ouvert", ouvertA: null },
      { rang: 2, billets: 184, ecart: -1000, etat: "a_valider", ouvertA: null },
      { rang: 3, billets: 96, ecart: 0, etat: "ouvert", ouvertA: "2027-01-05T09:00:00.000+01:00" },
    ]);
    expect(g.apresMidi.map((x) => [x.destination, x.quai, x.bus, x.vendus, x.capacite])).toEqual([
      ["Yaoundé", 3, "LT 207 AB", 38, 40],
      ["Bafoussam", 1, "LT 118 AB", 19, 40],
      ["Yaoundé", 3, null, 9, 40],
    ]);
    expect(g.apresMidi[2]?.fusionProposeeAvec).toBe("2027-01-05T16:30:00.000+01:00");
  });

  it("useGareDirect : le remplissage se met à jour en direct", async () => {
    const { wrapper, horloge } = contexteTest("Superviseur");
    const { result } = renderHook(() => useGareDirect(), { wrapper });
    await waitFor(() => expect(result.current.dernier).toBeDefined());
    await horloge.avancer(5000);
    await waitFor(() =>
      expect(result.current.dernier).toMatchObject({
        type: "remplissage",
        vendus: 39,
        capacite: 40,
      }),
    );
  });

  it("useJournal : le journal signé est chaîné", async () => {
    const { wrapper } = contexteTest("Superviseur");
    const { result } = renderHook(() => useJournal({ jour: "2027-01-05" }), { wrapper });
    const j = await donnees(result);
    expect(j.chaineValide).toBe(true);
    expect(j.entrees.length).toBeGreaterThan(3);
    j.entrees.forEach((e, i) => {
      expect(e.precedente).toBe(i === 0 ? null : j.entrees[i - 1]!.empreinte);
    });
  });
});

describe("planche SuperviseurValider (28b)", () => {
  it("useSuperviseurCloture : le bilan de la clôture et les contrôles", async () => {
    const { wrapper } = contexteTest("SuperviseurValider");
    const sessionId = ecrans.SuperviseurValider.entites.sessions![0]!.id;
    const { result } = renderHook(() => useSuperviseurCloture(sessionId), { wrapper });
    const v = await donnees(result);
    expect(v).toMatchObject({
      numero: "K-DLA-270105-2-1",
      guichetRang: 2,
      clotureeA: "2027-01-05T13:58:00.000+01:00",
      bilan: { attendu: 695_500, compte: 694_500, ecart: -1000, statut: "dans_tolerance" },
      resume: { billetsCash: 184, colis: 41, annulationsValidees: 2 },
      controles: {
        tolerance: { montant: 1000, dansLaLimite: true },
        historiqueAgent: { jours: 10, ecartsNegatifs: 3, total: -4500 },
        cadenceSansNom: 11,
      },
      commentaire: "Recompté avec Joseph, écart confirmé, retenu sur sa prime",
      pin: {
        longueur: 6,
        empreinteDisponible: true,
        essaisMax: 3,
        blocageMinutes: 15,
      },
    });
    expect(v.agent.nom).toBe("Joseph M.");
    expect(v.pin.superviseur.nom).toBe("Mme Essono");
  });
});

describe("planche SuperviseurVoir (28c)", () => {
  it("useSuperviseurAnnulation : le billet 0171 et ce que l'app a vérifié", async () => {
    const { wrapper } = contexteTest("SuperviseurVoir");
    const billetId = ecrans.SuperviseurVoir.entites.billets![0]!.id;
    const { result } = renderHook(() => useSuperviseurAnnulation(`dem-annulation-${billetId}`), {
      wrapper,
    });
    const a = await donnees(result);
    expect(a.demandeA).toBe("2027-01-05T13:51:00.000+01:00");
    expect(a.demandeur.nom).toBe("Marie T.");
    expect(a.billet).toMatchObject({
      numero: "ALP-DLA-270105-0171",
      prix: 4000,
      etat: "paye",
      depart: { heureDepart: "2027-01-05T14:30:00.000+01:00", destination: "Yaoundé", siege: 9 },
      voyageur: { nom: "Essomba Rachel", pieceQuatreDerniers: "3309" },
      vendu: { at: "2027-01-05T09:12:00.000+01:00", guichetRang: 1, mode: "cash" },
      motif: "Client parti, ne voyage plus",
    });
    expect(a.billet.vendu.agent.nom).toBe("Marie T.");
    expect(a.verifications).toEqual({
      scanne: false,
      siegeLiberable: true,
      remboursementIntegral: true,
      retenue: 0,
      annulationsAgentAujourdhui: 2,
      annulationsAgent10Jours: 5,
      moyenneGuichets: 2,
      clientPresent: true,
      pieceVue: true,
      aRendreCash: 4000,
    });
    expect(a.decisionsPossibles).toEqual(["rembourser", "reporter", "avoir", "refuser"]);
    expect(a.decisionProposee).toBe("rembourser");
  });
});

describe("planche SuperviseurEquipe (28d)", () => {
  it("useSuperviseurEquipe : l'équipe, les PIN, la fiche", async () => {
    const { wrapper } = contexteTest("SuperviseurEquipe");
    const { result } = renderHook(() => useSuperviseurEquipe(), { wrapper });
    const e = await donnees(result);
    expect(e.gare.nom).toBe("Akwa");
    expect(e.effectif).toBe(9);
    expect(
      e.enService.map((p) => [
        p.nom,
        p.role,
        p.affectation,
        p.statut,
        p.pin.etat,
        p.pin.fauxEssais,
      ]),
    ).toEqual([
      ["Joseph M.", "guichetier", "guichet 2", "en_service", "a_renouveler", 0],
      ["Marie T.", "guichetier", "guichet 1", "en_service", "ok", 0],
      ["Alain B.", "convoyeur", "LT 412 AB", "a_bord", "ok", 0],
      ["Pauline N.", "guichetier", "guichet 3", "bloquee", "bloque", 3],
    ]);
    expect(e.enService[0]?.alerte).toBe("3 écarts en 10 jours");
    expect(e.enService[1]?.alerte).toBe("5 annulations en 10 jours");
    expect(e.enService[2]?.situation).toBe("en route vers Yaoundé");
    expect(e.enService[3]?.pin.bloqueA).toBe("2027-01-05T09:40:00.000+01:00");
    expect(e.autres).toEqual({
      nombre: 5,
      detail: "2 convoyeurs, 2 chauffeurs, 1 guichetier de nuit",
    });
    expect(e.fiche).toMatchObject({
      nom: "Joseph M.",
      role: "guichetier",
      depuisLibelle: "depuis le 5 janv.",
      billets: 1204,
      actions: ["renouveler_pin", "changer_affectation", "voir_journal", "desactiver"],
    });
    expect(e.fiche?.personnesADebloquer.map((p) => p.nom)).toEqual(["Pauline N."]);
    expect(e.pinProvisoireMinutes).toBe(60);
  });

  it("useJournal : « Voir son journal » d'une personne", async () => {
    const { wrapper } = contexteTest("SuperviseurEquipe");
    const { result } = renderHook(() => useJournal({ personneId: "pers-joseph" }), { wrapper });
    const j = await donnees(result);
    expect(j.entrees.length).toBeGreaterThan(0);
    expect(j.entrees.every((e) => e.auteur.id === "pers-joseph")).toBe(true);
  });
});

describe("planche SuperviseurDebloquer (28e)", () => {
  it("useSuperviseurAppareil : le téléphone GU3 bloqué, ce qui attend, les options", async () => {
    const { wrapper } = contexteTest("SuperviseurDebloquer");
    const { result } = renderHook(() => useSuperviseurAppareil("appareil-gu3-dla"), { wrapper });
    const a = await donnees(result);
    expect(a.appareil).toEqual({
      id: "appareil-gu3-dla",
      code: "GU3-DLA",
      guichetRang: 3,
      gareId: "gare-alp-dla",
    });
    expect(a).toMatchObject({
      etat: "bloque",
      derniereSyncA: "2027-01-05T01:20:00.000+01:00",
      horsLigneMinutes: 760,
      limiteHeures: 12,
      rappelSupport: true,
    });
    expect(a.enAttente).toEqual({
      ventes: 26,
      colis: 4,
      cash: 104_000,
      plage: { debut: 2001, fin: 2026, trous: [] },
    });
    expect(a.diagnostics.map((d) => d.niveau)).toEqual(["alerte", "alerte", "info"]);
    expect(a.diagnostics[0]?.constat).toContain("éteint depuis 01:20");
    expect(a.options).toEqual([
      { rang: 1, option: "synchroniser", recommande: true },
      { rang: 2, option: "debloquer_4h", recommande: false },
      { rang: 3, option: "telephone_secours", recommande: false },
    ]);
  });
});

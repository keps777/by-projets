// @vitest-environment jsdom
import { act, cleanup, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ErreurHttp } from "../infra/erreurs";
import { creerHorlogeManuelle } from "../infra/horloge";
import { clientPour, donnees, rendreHooks } from "./outilsTest";
import {
  useAjouterProche,
  useAnnulerBillet,
  useApercuAnnulation,
  useApercuSansInternet,
  useBillet,
  useBloquerSiege,
  useCommande,
  useCreerCommande,
  useCreerGroupe,
  useDefinirPreferee,
  useDefinirTrajetRegulier,
  useDemanderCode,
  useDetailDepart,
  useDevis,
  useDevisBus,
  useFidelite,
  useFormulairePublication,
  useGroupe,
  useHistorique,
  useMesTrajetsCovoit,
  useMoyensPaiement,
  useOffresMonteeEnRoute,
  useOptionsFiltres,
  useParrainage,
  usePayerCommande,
  usePlanSieges,
  usePlanSiegesTempsReel,
  usePositionBus,
  usePrevenirProche,
  useProches,
  useProfil,
  usePropositionCourse,
  usePublierTrajet,
  useProposerADemande,
  useRechercheCovoit,
  useRechercheDeparts,
  useRechercheVille,
  useReserverCourse,
  useReserverCovoit,
  useReserverMontee,
  useReseau,
  useStatutPaiement,
  useStatutPaiementEnDirect,
  useSuiviBus,
  useTrajetRegulier,
  useVerifierCode,
} from "./hooks";
import { PLANCHES_VOYAGEUR } from "./index";

afterEach(cleanup);

const FUSEAU = /\+01:00$/;
const heure = (iso: string): string => iso.slice(11, 16);

describe("connexion par code (planche Connexion)", () => {
  it("demande un code SMS puis ouvre la session d'Aïcha", async () => {
    const { result } = await rendreHooks("Connexion", () => ({
      demander: useDemanderCode(),
      verifier: useVerifierCode(),
    }));
    let reponse;
    await act(async () => {
      reponse = await result.current.demander.mutateAsync({ telephone: "+237691221008" });
    });
    expect(reponse).toMatchObject({
      telephone: "+237691221008",
      canal: "sms",
      longueurCode: 4,
      renvoiDansSecondes: 42,
    });
    let session;
    await act(async () => {
      session = await result.current.verifier.mutateAsync({
        telephone: "+237691221008",
        code: "4821",
      });
    });
    expect(session).toMatchObject({ nouveauCompte: false, profil: { prenom: "Aïcha" } });
  });
});

describe("accueil entre villes (planche Main)", () => {
  it("renvoie les trois départs, le covoiturage et la notification du colis", async () => {
    const { result } = await rendreHooks("Main", () => ({
      profil: useProfil(),
      recherche: useRechercheDeparts({ depart: "DLA", arrivee: "YDE" }),
    }));
    expect(donnees(result.current.profil).prenom).toBe("Aïcha");
    const r = donnees(result.current.recherche);
    expect(r.maintenant).toBe("2027-01-05T07:38:00.000+01:00");
    expect(r.position).toEqual({
      ville: "Douala",
      gareDepart: "Akwa",
      gareArrivee: "Yaoundé Mvan",
    });
    expect(r.departs.map((d) => [heure(d.heureDepart), d.compagnie.nom, d.classe, d.prix])).toEqual(
      [
        ["08:00", "Bêta Express", "vip", 7500],
        ["08:30", "Alpha Voyages", "classique", 4000],
        ["09:30", "Oméga Transports", "classique", 3800],
      ],
    );
    expect(r.departs.map((d) => d.placesLibres)).toEqual([9, 18, 3]);
    expect(r.departs.map((d) => d.presqueComplet)).toEqual([false, false, true]);
    expect(r.departs.every((d) => FUSEAU.test(d.heureDepart))).toBe(true);
    expect(r.filtres).toEqual({ classe: "toutes", compagnies: 5, preferees: 2 });
    expect(r.totaux).toEqual({ bus: 14, covoiturages: 6 });
    expect(r.covoits[0]).toMatchObject({
      conducteur: "Samuel",
      verifie: true,
      lieuDepart: "Bonapriso",
      placesLibres: 2,
      prixParPlace: 5000,
    });
    expect(r.notificationColis?.titre).toBe("Ton colis pour Maman est arrivé à Bafoussam");
  });

  it("applique le filtre de classe", async () => {
    const { result } = await rendreHooks("Main", () => ({
      recherche: useRechercheDeparts({
        depart: "DLA",
        arrivee: "YDE",
        filtres: { classe: "vip" },
      }),
    }));
    expect(donnees(result.current.recherche).departs.map((d) => d.prix)).toEqual([7500]);
  });
});

describe("accueil dans la même ville (planche MainVille)", () => {
  it("renvoie l'itinéraire d'Akwa à Bonabéri et les quatre offres", async () => {
    const { result } = await rendreHooks("MainVille", () => ({
      profil: useProfil(),
      ville: useRechercheVille({ ville: "Douala" }),
    }));
    const r = donnees(result.current.ville);
    expect(r.ville).toEqual({ nom: "Douala", detectee: true });
    expect(r.itineraire).toEqual({
      depart: "Akwa, marché central",
      arrivee: "Bonabéri, carrefour Ancien Dalip",
      departSurMaPosition: true,
      distanceKm: 9,
    });
    expect(r.quand).toBe("maintenant");
    expect(r.offres.map((o) => [o.type, o.prix, o.departDansMinutes])).toEqual([
      ["covoiturage", 700, 3],
      ["moto_taxi", 500, 5],
      ["bus_ville", 250, 12],
      ["covoiturage", 600, 22],
    ]);
    expect(r.offres[0]).toMatchObject({
      qui: "Clarisse",
      verifie: true,
      placesLibres: 3,
      dureeMinutes: 25,
    });
    expect(r.offres[3]?.note).toBe(4.8);
    expect(r.offres.every((o) => FUSEAU.test(o.departA))).toBe(true);
  });

  it("filtre par type d'offre", async () => {
    const { result } = await rendreHooks("MainVille", () => ({
      ville: useRechercheVille({ ville: "Douala", types: ["moto_taxi"] }),
    }));
    expect(donnees(result.current.ville).offres.map((o) => o.prix)).toEqual([500]);
  });
});

describe("filtres de l'accueil (planche MainFiltres)", () => {
  it("renvoie les classes, les cinq compagnies et les options, et mémorise les préférées", async () => {
    const { result } = await rendreHooks("MainFiltres", () => ({
      options: useOptionsFiltres({ depart: "DLA", arrivee: "YDE" }),
      preferee: useDefinirPreferee(),
    }));
    const o = donnees(result.current.options);
    expect(o.depart.nom).toBe("Douala");
    expect(o.totalDeparts).toBe(14);
    expect(o.classes.map((c) => c.valeur)).toEqual(["toutes", "vip", "classique"]);
    expect(o.compagnies.map((c) => [c.nom, c.departs, c.preferee])).toEqual([
      ["Bêta Express", 4, true],
      ["Alpha Voyages", 5, true],
      ["Oméga Transports", 3, false],
      ["Général Express", 1, false],
      ["Touristique Express", 1, false],
    ]);
    expect(o.aussi.map((a) => a.actif)).toEqual([true, false, false, false]);

    await act(async () => {
      await result.current.preferee.mutateAsync({ compagnieId: "cie-ome", preferee: true });
    });
    await waitFor(() => expect(donnees(result.current.options).compagnies[2]?.preferee).toBe(true));
  });
});

describe("siège et paiement en un écran (planche SiegePay)", () => {
  it("renvoie le départ, le plan, le devis, les moyens et la voyageuse", async () => {
    const { result } = await rendreHooks("SiegePay", () => ({
      profil: useProfil(),
      detail: useDetailDepart({ departId: "dep-bex-dlayde-270105-0800" }),
      plan: usePlanSieges({ departId: "dep-bex-dlayde-270105-0800" }),
      devis: useDevis({ departId: "dep-bex-dlayde-270105-0800" }),
      moyens: useMoyensPaiement(),
    }));
    expect(donnees(result.current.profil)).toMatchObject({
      nom: "Ngo",
      telephone: "+237691221008",
    });
    const detail = donnees(result.current.detail);
    expect(detail.depart).toMatchObject({
      numero: "BEX-DLAYDE-270105-0800",
      classe: "vip",
      prix: 7500,
      placesLibres: 9,
    });
    expect(detail).toMatchObject({ dureeMinutes: 210, blocageMinutes: 15 });
    expect(detail.origine.gare).toBe("Douala Akwa");
    expect(heure(detail.depart.heureDepart)).toBe("08:00");

    const plan = donnees(result.current.plan);
    expect(plan.capacite).toBe(16);
    expect(plan.libres).toBe(9);
    expect(plan.sieges.filter((s) => s.etat === "pris").map((s) => s.numero)).toEqual([
      1, 2, 5, 9, 10, 14, 15,
    ]);
    expect(plan.mon).toMatchObject({ siege: 7, jusqua: "2027-01-05T07:53:00.000+01:00" });
    expect(plan.sieges.find((s) => s.numero === 7)).toMatchObject({
      etat: "a_moi",
      emplacement: "côté fenêtre · près de la porte",
    });

    const devis = donnees(result.current.devis);
    expect(devis.total).toBe(7500);
    expect(devis.lignes[1]).toMatchObject({ montant: 0, montantBarre: 250, offertAvec: "JOURJ" });

    expect(donnees(result.current.moyens).map((m) => [m.code, m.choisi])).toEqual([
      ["mtn_momo", true],
      ["orange_money", false],
      ["carte", false],
    ]);
  });

  it("bloque un autre siège 15 min, refuse un siège pris et crée la commande", async () => {
    const departId = "dep-bex-dlayde-270105-0800";
    const { result } = await rendreHooks("SiegePay", () => ({
      plan: usePlanSieges({ departId }),
      bloquer: useBloquerSiege(),
      commander: useCreerCommande(),
    }));
    let blocage;
    await act(async () => {
      blocage = await result.current.bloquer.mutateAsync({ departId, siege: 8 });
    });
    expect(blocage).toMatchObject({ siege: 8 });
    await waitFor(() => expect(donnees(result.current.plan).mon?.siege).toBe(8));
    expect(donnees(result.current.plan).sieges.find((s) => s.numero === 7)?.etat).toBe("libre");

    await act(async () => {
      await expect(
        result.current.bloquer.mutateAsync({ departId, siege: 1 }),
      ).rejects.toBeInstanceOf(ErreurHttp);
    });
    let commande;
    await act(async () => {
      commande = await result.current.commander.mutateAsync({ departId, sieges: [8], pour: "moi" });
    });
    expect(commande).toMatchObject({ total: 7500, statut: "en_attente_paiement", type: "billet" });
  });

  it("suit le temps réel : un autre voyageur prend le siège 3", async () => {
    const horloge = creerHorlogeManuelle("2027-01-05T07:38:00.000+01:00");
    const client = clientPour("SiegePay", { horloge });
    const { result } = await rendreHooks(
      "SiegePay",
      () => ({ direct: usePlanSiegesTempsReel({ departId: "dep-bex-dlayde-270105-0800" }) }),
      client,
    );
    await act(async () => {
      await horloge.avancer(0);
    });
    await waitFor(() =>
      expect(result.current.direct.plan?.sieges.find((s) => s.numero === 3)?.etat).toBe("libre"),
    );
    await act(async () => {
      await horloge.avancer(30_000);
    });
    expect(result.current.direct.plan?.sieges.find((s) => s.numero === 3)?.etat).toBe("pris");
    expect(result.current.direct.etat).toBe("ouvert");
  });
});

describe("billet (planche Pass)", () => {
  it("renvoie le billet de Bêta Express, la moto et l'aperçu d'annulation", async () => {
    const id = "billet-bex-dla-270105-0142";
    const { result } = await rendreHooks("Pass", () => ({
      billet: useBillet({ billetId: id }),
      apercu: useApercuAnnulation({ billetId: id }),
      annuler: useAnnulerBillet(),
    }));
    const b = donnees(result.current.billet);
    expect(b).toMatchObject({
      numero: "BEX-DLA-270105-0142",
      etat: "paye",
      smsEnvoye: true,
      classe: "vip",
      siege: 7,
      prix: 7500,
      codeBillet: "7341",
      presenceQuaiMinutes: 20,
      dureeMinutes: 210,
      passager: { nom: "Aïcha Ngo", pieceQuatreDerniers: "4471" },
    });
    expect(b.origine).toEqual({ ville: { code: "DLA", nom: "Douala" }, gare: "Douala Akwa" });
    expect(b.destination.gare).toBe("Yaoundé Mvan");
    expect(heure(b.heureDepart)).toBe("08:00");
    expect(b.annulationGratuiteJusqua).toBe("2027-01-05T07:00:00.000+01:00");
    expect(b.courseProposee).toEqual({ partirA: "2027-01-05T07:10:00.000+01:00", prix: 700 });

    // 07:38 : le délai gratuit est passé, le domaine retient 50 % pour un billet VIP.
    expect(donnees(result.current.apercu)).toMatchObject({
      autorise: true,
      gratuite: false,
      retenue: 3750,
      remboursement: 3750,
    });
    await act(async () => {
      await result.current.annuler.mutateAsync({ billetId: id });
    });
    await waitFor(() => expect(donnees(result.current.billet).etat).toBe("annule"));
  });
});

describe("mon bus en direct (planche Direct)", () => {
  it("renvoie le suivi, prévient Maman et diffuse la position", async () => {
    const horloge = creerHorlogeManuelle("2027-01-05T07:38:00.000+01:00");
    const client = clientPour("Direct", { horloge });
    const billetId = "billet-direct";
    const { result } = await rendreHooks(
      "Direct",
      () => ({
        suivi: useSuiviBus({ billetId }),
        proches: useProches(),
        prevenir: usePrevenirProche(),
        position: usePositionBus({ billetId }),
      }),
      client,
    );
    const s = donnees(result.current.suivi);
    expect(s).toMatchObject({
      enDirect: true,
      siege: 7,
      vitesseKmh: 84,
      bus: { immatriculation: "LT 412 AB" },
    });
    expect(s.compagnie.nom).toBe("Bêta Express");
    expect(s.villes).toEqual(["Douala", "Edéa", "Yaoundé"]);
    expect(s.arrivee).toEqual({
      prevue: "2027-01-05T11:30:00.000+01:00",
      estimee: "2027-01-05T11:35:00.000+01:00",
      retardMinutes: 5,
    });
    expect(s.etapes.map((e) => [e.arret, heure(e.heure), e.statut])).toEqual([
      ["Douala Akwa", "08:04", "passe"],
      ["Edéa", "09:12", "passe"],
      ["Pouma", "10:05", "prochain"],
      ["Boumnyebel", "10:40", "a_venir"],
    ]);
    expect(s.etapes[1]?.arretMinutes).toBe(10);
    expect(s.etapes[3]?.placesQuiMontent).toBe(4);
    expect(s.prevenir).toMatchObject({
      nom: "Maman",
      minutesAvantArrivee: 15,
      gareArrivee: "Mvan",
      actif: false,
    });

    await act(async () => {
      await result.current.prevenir.mutateAsync({ billetId, procheId: "maman" });
    });
    await waitFor(() => expect(donnees(result.current.suivi).prevenir?.actif).toBe(true));

    await act(async () => {
      await horloge.avancer(0);
      await horloge.avancer(10_000);
    });
    expect(result.current.position.dernier).toMatchObject({
      vitesseKmh: 84,
      retardMinutes: 5,
      prochainArret: "Pouma",
    });
  });
});

describe("réseau en direct (planche Reseau)", () => {
  it("renvoie les chiffres du réseau et les lignes avec leur prochain départ", async () => {
    const { result } = await rendreHooks("Reseau", () => ({ reseau: useReseau() }));
    const r = donnees(result.current.reseau);
    expect(r).toMatchObject({
      compagnies: 5,
      busEnRoute: 38,
      departsAVenir: 14,
      filtreActif: "Toutes",
    });
    expect(r.maintenant).toBe("2027-01-05T07:40:00.000+01:00");
    expect(r.filtres).toEqual(["Toutes", "Bêta", "Alpha", "Oméga", "VIP", "Nuit"]);
    expect(r.lignes.map((l) => [l.depart, l.arrivee, l.prix, l.prixEstUnMinimum])).toEqual([
      ["Douala", "Yaoundé", 3800, true],
      ["Douala", "Bafoussam", 3500, true],
      ["Yaoundé", "Bamenda", 7000, true],
      ["Douala", "Kribi", 4000, false],
    ]);
    expect(r.lignes[0]?.prochains.map((p) => [heure(p.heure), p.libelle])).toEqual([
      ["08:00", "Bêta VIP"],
      ["08:30", "Alpha"],
      ["09:30", "Oméga"],
    ]);
    expect(r.lignes[2]).toMatchObject({ via: "Bafoussam", correspondanceMinutes: 25 });
    expect(r.lignes[3]).toMatchObject({ mode: "covoiturage", prochains: [] });
  });

  it("filtre par compagnie", async () => {
    const { result } = await rendreHooks("Reseau", () => ({
      reseau: useReseau({ filtre: "Alpha" }),
    }));
    const r = donnees(result.current.reseau);
    expect(r.filtreActif).toBe("Alpha");
    expect(r.lignes.map((l) => l.arrivee)).toEqual(["Yaoundé", "Bafoussam"]);
  });
});

describe("covoiturage entre villes (planche Covoit)", () => {
  it("renvoie les trois offres et réserve une place de Samuel", async () => {
    const { result } = await rendreHooks("Covoit", () => ({
      recherche: useRechercheCovoit({ depart: "Douala", arrivee: "Kribi" }),
      reserver: useReserverCovoit(),
    }));
    const r = donnees(result.current.recherche);
    expect(r).toMatchObject({ ville: "Douala", depart: "Douala", arrivee: "Kribi" });
    expect(r.offres.map((o) => [o.conducteur.nom, o.prixParPlace, heure(o.departA)])).toEqual([
      ["Samuel E.", 4000, "08:30"],
      ["Marthe N.", 3500, "10:00"],
      ["Didier K.", 3000, "14:00"],
    ]);
    expect(r.offres[0]).toMatchObject({
      vehicule: "Toyota Corolla grise",
      immatriculation: "LT 882 CE",
      clim: true,
      placesLibres: 2,
      lieuDepart: "Bonapriso, pharmacie du Rond-point",
      dureeMinutes: 150,
      lieuArrivee: "Kribi centre",
      arretsPossibles: 2,
      conducteur: { verifie: true, note: 4.9, trajets: 112, initiales: "SA" },
    });
    expect(heure(r.offres[0]?.arriveeEstimee ?? "")).toBe("11:00");
    expect(r.offres[1]).toMatchObject({
      femmesBienvenues: true,
      placesLibres: 3,
      vehicule: "Hyundai",
      lieuDepart: "Akwa",
    });
    expect(r.offres[2]).toMatchObject({ grandBagage: true, placesLibres: 4, vehicule: "pick-up" });

    let commande;
    await act(async () => {
      commande = await result.current.reserver.mutateAsync({
        offreId: r.offres[0]?.id ?? "",
        places: 1,
      });
    });
    // 4 000 F de trajet + 250 F de frais : le montant de la planche Paiement.
    expect(commande).toMatchObject({ total: 4250, type: "covoiturage" });
  });

  it("applique les filtres de la planche", async () => {
    const { result } = await rendreHooks("Covoit", () => ({
      bagage: useRechercheCovoit({ depart: "Douala", arrivee: "Kribi", filtres: ["grand_bagage"] }),
      prix: useRechercheCovoit({ depart: "Douala", arrivee: "Kribi", prixMax: 3500 }),
    }));
    expect(donnees(result.current.bagage).offres.map((o) => o.conducteur.nom)).toEqual([
      "Didier K.",
    ]);
    expect(donnees(result.current.prix).offres.map((o) => o.prixParPlace)).toEqual([3500, 3000]);
  });
});

describe("paiement (planche Paiement)", () => {
  it("renvoie la commande de 4 250 F et les quatre moyens, puis suit la confirmation MoMo", async () => {
    const horloge = creerHorlogeManuelle("2027-01-05T07:38:00.000+01:00");
    const client = clientPour("Paiement", { horloge });
    const { result } = await rendreHooks(
      "Paiement",
      () => ({
        commande: useCommande({ commandeId: "cmd-1" }),
        moyens: useMoyensPaiement(),
        payer: usePayerCommande(),
      }),
      client,
    );
    const commande = donnees(result.current.commande);
    expect(commande).toMatchObject({
      id: "cmd-1",
      libelle: "Covoiturage Samuel · Douala → Kribi · 08:30",
      total: 4250,
      statut: "en_attente_paiement",
    });
    expect(commande.lignes.map((l) => l.montant)).toEqual([4000, 250]);
    expect(donnees(result.current.moyens).map((m) => [m.code, m.choisi])).toEqual([
      ["mtn_momo", true],
      ["orange_money", false],
      ["carte", false],
      ["proche", false],
    ]);

    let paiement;
    await act(async () => {
      paiement = await result.current.payer.mutateAsync({ commandeId: "cmd-1", moyen: "mtn_momo" });
    });
    expect(paiement).toMatchObject({
      statut: "en_attente_confirmation",
      montant: 4250,
      consigne: "tu confirmes sur ton téléphone",
    });

    const direct = await rendreHooks(
      "Paiement",
      () => ({
        statut: useStatutPaiement({ paiementId: "pay-1" }),
        direct: useStatutPaiementEnDirect({ paiementId: "pay-1" }),
      }),
      client,
    );
    expect(donnees(direct.result.current.statut).statut).toBe("en_attente_confirmation");
    await act(async () => {
      await horloge.avancer(0);
      await horloge.avancer(5000);
    });
    expect(direct.result.current.direct.dernier).toMatchObject({
      statut: "reussi",
      commandeId: "cmd-1",
    });
  });
});

describe("moto vers la gare (planche Course)", () => {
  it("renvoie la proposition de Jean et réserve un taxi", async () => {
    const { result } = await rendreHooks("Course", () => ({
      proposition: usePropositionCourse({ billetId: "billet-aicha" }),
      reserver: useReserverCourse(),
    }));
    const p = donnees(result.current.proposition);
    expect(p).toMatchObject({
      lieuDepart: "Chez toi · Bonapriso",
      gare: "Gare Akwa · Bêta Express",
      trajetMinutes: 12,
      presenceQuaiMinutes: 20,
      prix: 700,
      payeAvecBillet: true,
      rappelMinutes: 10,
    });
    expect([p.partirA, p.arriveeQuai, p.busA, p.annulationGratuiteJusqua].map(heure)).toEqual([
      "07:10",
      "07:22",
      "08:00",
      "06:55",
    ]);
    expect(p.modes.map((m) => [m.mode, m.prix, m.choisi])).toEqual([
      ["moto", 700, true],
      ["taxi", 1500, false],
      ["avec_valises", undefined, false],
    ]);
    expect(p.chauffeur).toMatchObject({
      nom: "Jean K.",
      initiales: "JK",
      verifie: true,
      note: 4.8,
      arriveDansMinutes: 3,
    });
    let course;
    await act(async () => {
      course = await result.current.reserver.mutateAsync({
        billetId: "billet-aicha",
        mode: "taxi",
        partirA: p.partirA,
      });
    });
    expect(course).toMatchObject({ mode: "taxi", prix: 1500, statut: "reservee" });
  });
});

describe("covoiturage en ville (planche CovoitVille)", () => {
  it("renvoie les offres qui partent maintenant et le trajet du matin", async () => {
    const { result } = await rendreHooks("CovoitVille", () => ({
      ville: useRechercheVille({ ville: "Douala" }),
      regulier: useTrajetRegulier(),
      definir: useDefinirTrajetRegulier(),
    }));
    const r = donnees(result.current.ville);
    expect(r.ville).toEqual({ nom: "Douala", detectee: true });
    expect(r.itineraire).toMatchObject({ arrivee: "Bonabéri, Ancien Dalip", distanceKm: 9 });
    expect(r.offres.map((o) => [o.qui, o.type, o.prix, o.departDansMinutes])).toEqual([
      ["Clarisse", "covoiturage", 700, 3],
      ["Jean-Marc", "covoiturage", 600, 22],
      ["Paul", "moto_taxi", 500, 5],
    ]);
    expect(r.offres.map((o) => o.verifie)).toEqual([true, false, false]);
    expect(donnees(result.current.regulier)).toMatchObject({ departA: "07:00", actif: true });
    await act(async () => {
      await result.current.definir.mutateAsync({ actif: false });
    });
    await waitFor(() => expect(donnees(result.current.regulier).actif).toBe(false));
  });
});

describe("je conduis (planche CovoitConducteur)", () => {
  it("renvoie le résumé de Samuel, ses trajets publiés et les demandes", async () => {
    const { result } = await rendreHooks("CovoitConducteur", () => ({
      mes: useMesTrajetsCovoit(),
      proposer: useProposerADemande(),
      publier: usePublierTrajet(),
    }));
    const m = donnees(result.current.mes);
    expect(m.conducteur).toMatchObject({ nom: "Samuel", verifie: true, note: 4.9, trajets: 112 });
    expect(m.resume).toEqual({ gainSemaine: 12000, trajets: 112, annulations: 0, piecesOk: true });
    expect(m.fraisParPlace).toBe(250);
    expect(
      m.publies.map((t) => [t.departA, t.depart, t.arrivee, t.places, t.placesReservees]),
    ).toEqual([
      ["2027-01-09T08:30:00.000+01:00", "Douala", "Kribi", 2, 1],
      ["2027-01-10T17:00:00.000+01:00", "Kribi", "Douala", 3, 0],
    ]);
    expect(m.publies[0]?.reservations).toEqual([
      { passager: "Aïcha N.", places: 1, montantPaye: 4000 },
    ]);
    expect(m.publies[1]?.visiblePar).toBe(240);
    expect(
      m.demandes.map((x) => [x.passager, x.depart, x.arrivee, x.heurePropose, x.trajetPropose]),
    ).toEqual([
      ["Marthe N.", "Douala", "Kribi", "08:30", "trajet-1"],
      ["Éric et Nadia", "Kribi", "Douala", "17:00", "trajet-2"],
    ]);

    await act(async () => {
      await result.current.proposer.mutateAsync({ demandeId: "demande-1", trajetId: "trajet-1" });
    });
    await waitFor(() => expect(donnees(result.current.mes).demandes).toHaveLength(1));
    await act(async () => {
      await result.current.publier.mutateAsync({
        depart: { ville: "Douala", point: "Akwa" },
        arrivee: { ville: "Edéa", point: "Gare routière" },
        departA: "2027-01-08T07:00:00.000+01:00",
        places: 3,
        prixParPlace: 1500,
        options: [],
      });
    });
    await waitFor(() => expect(donnees(result.current.mes).publies).toHaveLength(3));
  });
});

describe("proposer mon trajet (planche Conducteur)", () => {
  it("renvoie le formulaire pré-rempli et publie le trajet", async () => {
    const { result } = await rendreHooks("Conducteur", () => ({
      formulaire: useFormulairePublication(),
      publier: usePublierTrajet(),
    }));
    const f = donnees(result.current.formulaire);
    expect(f).toMatchObject({
      vehicule: "Toyota Corolla",
      immatriculation: "LT 882 CE",
      depart: { ville: "Douala", point: "Bonapriso, pharmacie" },
      arrivee: { ville: "Kribi", point: "Kribi centre" },
      departA: "2027-01-09T08:30:00.000+01:00",
      places: { choix: [1, 2, 3], choisi: 2 },
      prixParPlace: 4000,
      prixConseille: { min: 3500, max: 4500 },
      fraisParPlace: 250,
    });
    expect(f.conducteur).toMatchObject({
      nom: "Samuel E.",
      verifie: true,
      note: 4.9,
      trajets: 112,
    });
    expect(f.options.map((o) => [o.libelle, o.actif])).toEqual([
      ["Clim", true],
      ["Bagage moyen", true],
      ["Femmes seulement", false],
      ["Trajet régulier · chaque sam.", false],
    ]);
    expect(f.reputation.piecesVerifiees).toEqual(["pièce", "permis", "carte grise"]);
    let trajet;
    await act(async () => {
      trajet = await result.current.publier.mutateAsync({
        depart: f.depart,
        arrivee: f.arrivee,
        departA: f.departA,
        places: f.places.choisi,
        prixParPlace: f.prixParPlace,
        options: ["clim"],
      });
    });
    expect(trajet).toMatchObject({ places: 2, prixParPlace: 4000, placesReservees: 0 });
  });
});

describe("monter en route (planche Arret)", () => {
  it("renvoie les trois bus qui passent à Pouma et réserve le premier", async () => {
    const { result } = await rendreHooks("Arret", () => ({
      offres: useOffresMonteeEnRoute(),
      reserver: useReserverMontee(),
    }));
    const o = donnees(result.current.offres);
    expect(o.arret).toEqual({ id: "pouma", nom: "Pouma", gps: true });
    expect(o.ligne).toMatchObject({
      libelle: "Douala → Yaoundé",
      sens: "vers Yaoundé",
      arrets: ["Douala", "Edéa", "Pouma", "Boumnyebel", "Yaoundé"],
      arretCourant: "Pouma",
    });
    expect(
      o.bus.map((b) => [
        b.compagnie.nom,
        b.classe,
        heure(b.passeA),
        b.passeDansMinutes,
        b.placesLibres,
        b.prix,
      ]),
    ).toEqual([
      ["Bêta Express", "vip", "10:05", 14, 3, 4500],
      ["Alpha Voyages", "classique", "10:40", 49, 7, 2500],
      ["Oméga Transports", "classique", "11:10", 79, 1, 2400],
    ]);
    expect(heure(o.bus[0]?.partiA ?? "")).toBe("08:04");
    expect(heure(o.bus[0]?.arriveeDestination ?? "")).toBe("11:35");
    expect(o.bus.every((b) => b.prorata)).toBe(true);
    let commande;
    await act(async () => {
      commande = await result.current.reserver.mutateAsync({
        departId: o.bus[0]?.departId ?? "",
        arretId: o.arret.id,
      });
    });
    expect(commande).toMatchObject({ total: 4500, statut: "en_attente_paiement" });
  });
});

describe("à plusieurs (planche Groupe)", () => {
  it("renvoie le groupe de six, la cagnotte, le devis de bus et la commande de la part", async () => {
    const { result } = await rendreHooks("Groupe", () => ({
      groupe: useGroupe({ groupeId: "groupe-demo" }),
      creer: useCreerGroupe(),
      devisBus: useDevisBus(),
      commander: useCreerCommande(),
    }));
    const g = donnees(result.current.groupe);
    expect(g).toMatchObject({
      id: "groupe-demo",
      mode: "groupe",
      voyageurs: 6,
      trajet: "Douala → Bafoussam",
      sieges: [11, 12, 13, 15, 16, 17],
    });
    expect(g.depart.compagnie.nom).toBe("Alpha Voyages");
    expect(g.depart.heureDepart).toBe("2027-01-10T07:30:00.000+01:00");
    expect(g.blocageJusqua).toBe("2027-01-05T07:53:00.000+01:00");
    expect(g.cagnotte).toMatchObject({ prixPlace: 3500, total: 21000, partMoi: 3500 });
    expect(g.cagnotte.participants.map((p) => [p.nom, p.places, p.statut])).toEqual([
      ["Aïcha", 1, "paye"],
      ["Paul K.", 1, "paye"],
      ["Marthe, Jo, Éric, Nadia", 4, "lien_envoye"],
    ]);

    let nouveau;
    await act(async () => {
      nouveau = await result.current.creer.mutateAsync({
        departId: g.depart.id,
        voyageurs: 4,
        mode: "cagnotte",
      });
    });
    expect(nouveau).toMatchObject({ mode: "cagnotte", voyageurs: 4 });
    let devis;
    await act(async () => {
      devis = await result.current.devisBus.mutateAsync({ places: 30 });
    });
    expect(devis).toMatchObject({ places: 30, statut: "demande" });
    let commande;
    await act(async () => {
      commande = await result.current.commander.mutateAsync({
        departId: g.depart.id,
        sieges: g.sieges,
        pour: "plusieurs",
      });
    });
    expect(commande).toMatchObject({ type: "groupe", total: 21000 });
  });
});

describe("sans internet (planche USSD)", () => {
  it("renvoie l'écran USSD et la conversation WhatsApp", async () => {
    const { result } = await rendreHooks("USSD", () => ({ apercu: useApercuSansInternet() }));
    const a = donnees(result.current.apercu);
    expect(a.ussd.code).toBe("*123#");
    expect(a.ussd.lignes).toHaveLength(15);
    expect(a.ussd.lignes[10]).toBe("1 08:00 Beta VIP 7500");
    expect(a.ussd.touches).toEqual(["1", "2", "3", "4", "5", "6", "*", "0", "#"]);
    expect(a.whatsapp.motCle).toBe("billet");
    expect(a.whatsapp.echanges.map((e) => e.de)).toEqual([
      "voyageur",
      "afrimove",
      "voyageur",
      "afrimove",
      "afrimove",
    ]);
    expect(a.whatsapp.echanges[4]?.lignes[0]).toContain("ALP-DLA-270106-0031");
  });
});

describe("moi (planche Moi)", () => {
  it("renvoie le profil, la fidélité, le parrainage, les proches et l'historique", async () => {
    const { result } = await rendreHooks("Moi", () => ({
      profil: useProfil(),
      fidelite: useFidelite(),
      parrainage: useParrainage(),
      proches: useProches(),
      historique: useHistorique(),
      ajouter: useAjouterProche(),
    }));
    expect(donnees(result.current.profil)).toMatchObject({
      prenom: "Aïcha",
      nom: "Ngo",
      initiales: "AN",
      telephone: "+237691221008",
      pieceVerifiee: true,
      inscritDepuis: "2027-01-01T08:00:00.000+01:00",
    });
    expect(donnees(result.current.fidelite)).toEqual({ points: 1250, valeurFcfa: 1250 });
    expect(donnees(result.current.parrainage)).toEqual({
      code: "AMI",
      amis: 3,
      bonusParrain: 250,
      bonusFilleul: 250,
    });
    expect(
      donnees(result.current.proches).map((p) => [
        p.id,
        p.nom,
        p.ville,
        p.prevenuALArrivee,
        p.payeMesVoyages,
      ]),
    ).toEqual([
      ["maman", "Maman", "Bafoussam", true, false],
      ["kevin", "Kevin", "Montréal", false, true],
    ]);
    const h = donnees(result.current.historique);
    expect(h.map((e) => [e.type, e.statut, e.montant, e.recuDisponible])).toEqual([
      ["voyage", "a_venir", 7500, false],
      ["colis", "a_retirer", 1500, false],
      ["voyage", "voyage", 4000, true],
    ]);
    expect(h[0]).toMatchObject({
      titre: "Douala → Yaoundé",
      departA: "2027-01-05T08:00:00.000+01:00",
      id: "billet-bex-dla-270105-0142",
    });
    expect(h[2]?.departA).toBeUndefined();

    await act(async () => {
      await result.current.ajouter.mutateAsync({ nom: "Paul", telephone: "+237677000040" });
    });
    await waitFor(() => expect(donnees(result.current.proches)).toHaveLength(3));
  });
});

describe("payer pour un proche (planche Proche)", () => {
  it("renvoie Maman, les deux départs de samedi et la commande par carte en CAD", async () => {
    const { result } = await rendreHooks("Proche", () => ({
      proches: useProches(),
      recherche: useRechercheDeparts({ depart: "BAF", arrivee: "DLA", jour: "2027-01-10" }),
      devis: useDevis({ departId: "x" }),
      commander: useCreerCommande(),
    }));
    const maman = donnees(result.current.proches)[0];
    expect(maman).toMatchObject({
      nom: "Maman",
      nomComplet: "Thérèse Ngo",
      telephone: "+237699401822",
    });
    const r = donnees(result.current.recherche);
    expect(r.jour).toBe("2027-01-10");
    expect(
      r.departs.map((d) => [
        heure(d.heureDepart),
        d.compagnie.nom,
        d.classe,
        d.placesLibres,
        d.prix,
      ]),
    ).toEqual([
      ["07:30", "Alpha Voyages", "vip", 14, 5500],
      ["10:00", "Oméga Transports", "classique", 22, 3500],
    ]);
    expect(donnees(result.current.devis).total).toBe(5750);
    let commande;
    await act(async () => {
      commande = await result.current.commander.mutateAsync({
        departId: r.departs[0]?.id ?? "",
        sieges: [3],
        pour: "proche",
        procheId: "maman",
        devise: "CAD",
      });
    });
    expect(commande).toMatchObject({
      type: "proche",
      total: 5750,
      conversion: { devise: "CAD", montantMineur: 1290, approximatif: true },
    });
  });
});

describe("couverture des planches voyageur", () => {
  it("chaque planche de l'app voyageur est servie par le mock (hors colis et partenaires)", async () => {
    const { PLANCHES } = await import("@afrimove/fixtures");
    const horsPerimetre = [
      // colis : packages/api-client/src/colis (AM-014)
      "ColisEnvoi",
      "ColisCode",
      "Relais",
      "Livraison",
      // devenir point relais / livreur : tickets partenaires (AM-141 à AM-146)
      "RelaisDevenir",
      "RelaisInscription",
      "RelaisVerification",
      "LivreurDevenir",
      "LivreurVerification",
    ];
    const voyageur = Object.entries(PLANCHES)
      .filter(([, info]) => info.route?.startsWith("/(voyageur)"))
      .map(([nom]) => nom)
      .filter((nom) => !horsPerimetre.includes(nom));
    // Splash, Tuto : aucune donnée ; Connexion est servie.
    expect([...voyageur].sort()).toEqual(PLANCHES_VOYAGEUR.filter((p) => p !== "Connexion").sort());
  });
});

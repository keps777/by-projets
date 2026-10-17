// @vitest-environment jsdom
import { act, cleanup, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ecrans } from "@afrimove/fixtures";
import {
  CODE_RETRAIT_COLIS_0017,
  DEPART_ALPHA_BAF_0815,
  COLIS_MAMAN,
  MAMA_FOTSO,
  ERIC_T,
} from "@afrimove/fixtures";
import { ErreurHttp } from "../infra/erreurs";
import {
  useAccepterMission,
  useChangerAdresseLivraison,
  useChangerModeColis,
  useChoisirRelais,
  useClientsVendeur,
  useColis,
  useColisRelais,
  useContesterReglement,
  useConventionInterAgences,
  useCreerColis,
  useDepartsVendeur,
  useDeposerDemandeLivreur,
  useDevisColis,
  useDisponibiliteLivreur,
  useEnregistrerBrouillonRelais,
  useEnvoyerCodeColis,
  useEnvoyerFicheRelais,
  useEspaceLivreur,
  useEspaceRelais,
  useEspaceVendeur,
  useEstimerPhotoColis,
  useFormulaireRelais,
  useInterAgences,
  useInviterCompagnie,
  useInviterLivreur,
  useLivraisonColis,
  useMissionsEnDirect,
  useOptionsEnvoiColis,
  usePartagerSuiviLivraison,
  usePositionLivreur,
  useProgrammeLivreur,
  useProgrammeRelais,
  useReclamerColis,
  useRecevoirColisRelais,
  useReglementInterAgences,
  useRelaisProches,
  useRemettreColisLivreur,
  useRemettreColisRelais,
  useRetirerGainsLivreur,
  useScannerTransfertColis,
  useSignalerAbsenceLivreur,
  useSuiviColisEnDirect,
  useSuiviDemandeLivreur,
  useSuiviDemandeRelais,
  useVendreBilletVendeur,
} from "./hooks";
import { ESSAIS_CODE_MAX, PLANCHES_COLIS } from "./index";
import { attendre, bancDe, echec, rendreHooks } from "./testing";

afterEach(cleanup);

const COLIS_ID = COLIS_MAMAN.id;

describe("couverture : chaque planche colis et partenaires a son scénario installé", () => {
  it("les 14 planches sont servies", () => {
    expect(PLANCHES_COLIS).toHaveLength(14);
    for (const planche of PLANCHES_COLIS) expect(ecrans[planche].planche).toBe(planche);
  });
});

describe("ColisEnvoi · /(voyageur)/colis", () => {
  const d = ecrans.ColisEnvoi.donnees;

  it("useOptionsEnvoiColis rend le départ, les modes et l'assurance de la planche", async () => {
    const { result } = rendreHooks(bancDe("ColisEnvoi"), () => useOptionsEnvoiColis());
    const options = await attendre(() => result.current.data);
    expect(options.suggestion).toMatchObject({
      surnom: "Maman",
      telephone: "+237699401822",
      destination: { ville: "Bafoussam", gare: "gare Alpha" },
    });
    const [depart] = options.departs;
    expect(depart).toMatchObject({
      departId: DEPART_ALPHA_BAF_0815.id,
      compagnie: "Alpha Voyages",
      heureDepart: "2027-01-05T08:15:00.000+01:00",
      retrait: "gare de Bafoussam",
      arriveePrevue: "2027-01-05T13:00:00.000+01:00",
      port: d.depart.options[0]?.prix,
      recommande: true,
    });
    expect(options.modes.map((m) => [m.mode, m.supplement])).toEqual([
      ["gare", 0],
      ["relais", 300],
      ["moto", 1000],
    ]);
    expect(options.assurance).toMatchObject({ tauxPct: 2, minimum: 500, plafondValeur: 500_000 });
    expect(options.interdits).toContain("armes");
  });

  it("useEstimerPhotoColis lit la taille et le poids de la photo", async () => {
    const { result } = rendreHooks(bancDe("ColisEnvoi"), () => useEstimerPhotoColis());
    const estimation = await act(() => result.current.mutateAsync({ photoRef: "photo-1" }));
    expect(estimation).toEqual({ photoRef: "photo-1", taille: "petit carton", poidsKg: 2 });
  });

  it("useDevisColis rend le total de la planche : 1 500 + 200 + 500 = 2 200", async () => {
    const { result } = rendreHooks(bancDe("ColisEnvoi"), () =>
      useDevisColis({ departId: DEPART_ALPHA_BAF_0815.id, mode: "gare", valeurAssuree: 25_000 }),
    );
    const devis = await attendre(() => result.current.data);
    expect(devis.total).toBe(d.action.total);
    expect(devis.lignes.map((l) => [l.code, l.montant])).toEqual([
      ["port", 1500],
      ["frais_app", 200],
      ["assurance", d.assurance.prime],
    ]);
  });

  it("useCreerColis paie et rend le code à l'expéditeur, que useColis relit ensuite", async () => {
    const banc = bancDe("ColisEnvoi");
    const { result } = rendreHooks(banc, () => ({
      creer: useCreerColis(),
      relire: undefined,
    }));
    const cree = await act(() =>
      result.current.creer.mutateAsync({
        departId: DEPART_ALPHA_BAF_0815.id,
        photoRef: "photo-1",
        destinataire: { nom: "Ngo Thérèse", telephone: "+237699401822" },
        contenu: d.formulaire.contenu,
        poidsKg: 2,
        valeurDeclaree: d.formulaire.valeur,
        assurer: true,
        mode: "gare",
        paiement: { moyen: "mtn_momo" },
      }),
    );
    expect(cree.devis.total).toBe(d.action.total);
    expect(cree.paiement).toMatchObject({ etat: "paye", montant: d.action.total });
    expect(cree.colis.retrait.code).toMatch(/^\d{6}$/);
    expect(cree.colis.valeurAssuree).toBe(d.formulaire.valeur);
    expect(cree.etiquettePrete).toBe(true);

    const relu = rendreHooks(banc, () => useColis(cree.colis.id));
    const colis = await attendre(() => relu.result.current.data);
    expect(colis.retrait.code).toBe(cree.colis.retrait.code);
  });

  it("refuse un mode relais sans point relais, un mode moto sans adresse", async () => {
    const { result } = rendreHooks(bancDe("ColisEnvoi"), () => useCreerColis());
    const base = {
      departId: DEPART_ALPHA_BAF_0815.id,
      photoRef: "photo-1",
      destinataire: { nom: "Ngo Thérèse", telephone: "+237699401822" },
      contenu: "Colis",
      poidsKg: 2,
      valeurDeclaree: 0,
      assurer: false,
      paiement: { moyen: "orange_money" as const },
    };
    expect(
      await echec(() => result.current.mutateAsync({ ...base, mode: "relais" })),
    ).toMatchObject({ code: "relais_requis" });
    expect(await echec(() => result.current.mutateAsync({ ...base, mode: "moto" }))).toMatchObject({
      code: "adresse_requise",
    });
  });
});

describe("ColisCode · /(voyageur)/colis/[colisId]", () => {
  const d = ecrans.ColisCode.donnees;

  it("useColis rend le code, le suivi, les options et la réclamation de la planche", async () => {
    const { result } = rendreHooks(bancDe("ColisCode"), () => useColis(COLIS_ID));
    const colis = await attendre(() => result.current.data);
    expect(colis.numero).toBe("C-ALP-DLA-270105-0017");
    expect(colis.retrait.code).toBe(CODE_RETRAIT_COLIS_0017);
    expect(colis.retrait.photoDepot).toEqual({
      libelle: "photo au dépôt",
      a: "2027-01-05T07:52:00.000+01:00",
    });
    expect(colis).toMatchObject({
      role: "expediteur",
      etat: "en_route",
      poidsKg: 2,
      valeurAssuree: 25_000,
    });
    expect(colis.destinataire.surnom).toBe("Maman");
    expect(colis.suivi.map((s) => [s.jalon, s.fait, s.estimee, s.a])).toEqual([
      ["depose", true, false, "2027-01-05T07:52:00.000+01:00"],
      ["charge", true, false, "2027-01-05T08:10:00.000+01:00"],
      ["en_route", true, false, "2027-01-05T11:20:00.000+01:00"],
      ["disponible", false, true, "2027-01-05T13:00:00.000+01:00"],
      ["remis", false, false, null],
    ]);
    expect(colis.suivi[3]?.detail).toBe(d.suivi[3]?.detail.replace(/^Disponible /, ""));
    expect(colis.arriveePrevue).toBe("2027-01-05T13:00:00.000+01:00");
    expect(colis.options.map((o) => [o.mode, o.prix])).toEqual([
      ["moto", 1000],
      ["relais", 300],
    ]);
    expect(colis.reclamation).toMatchObject({
      delaiReponseJoursOuvres: 2,
      multiplePortSiPerte: 10,
    });
  });

  it("useColis refuse un colis inconnu", async () => {
    const { result } = rendreHooks(bancDe("ColisCode"), () => useColis("colis-inconnu"));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ErreurHttp);
    expect((result.current.error as ErreurHttp).statut).toBe(404);
  });

  it("useEnvoyerCodeColis accuse l'envoi sans répéter le code", async () => {
    const { result } = rendreHooks(bancDe("ColisCode"), () => useEnvoyerCodeColis());
    const accuse = await act(() => result.current.mutateAsync({ colisId: COLIS_ID }));
    expect(accuse).toMatchObject({ canal: "sms", envoyeA: "6 99 …" });
    expect(JSON.stringify(accuse)).not.toContain(CODE_RETRAIT_COLIS_0017);
  });

  it("useReclamerColis promet la réponse sous 2 jours ouvrés", async () => {
    const { result } = rendreHooks(bancDe("ColisCode"), () => useReclamerColis());
    const r = await act(() => result.current.mutateAsync({ colisId: COLIS_ID, motif: "perdu" }));
    expect(r.ouverteLe).toBe(ecrans.ColisCode.maintenant);
    // mardi 5 janvier 11:30 + 2 jours ouvrés = jeudi 7 janvier 11:30
    expect(r.reponseAvant).toBe("2027-01-07T11:30:00.000+01:00");
  });

  it("useChangerModeColis ajoute le supplément et passe le colis en livraison moto", async () => {
    const banc = bancDe("ColisCode");
    const { result } = rendreHooks(banc, () => ({
      changer: useChangerModeColis(),
      colis: useColis(COLIS_ID),
    }));
    const change = await act(() =>
      result.current.changer.mutateAsync({ colisId: COLIS_ID, mode: "moto" }),
    );
    expect(change).toMatchObject({ mode: "moto", supplement: 1000, devis: { total: 3200 } });
    await waitFor(() => expect(result.current.colis.data?.mode).toBe("moto"));
    expect(result.current.colis.data?.options.map((o) => o.mode)).toEqual(["relais"]);
  });

  it("useSuiviColisEnDirect publie l'étape la plus récente", async () => {
    const { result } = rendreHooks(bancDe("ColisCode"), () => useSuiviColisEnDirect(COLIS_ID));
    const message = await attendre(() => result.current.dernier);
    expect(message).toMatchObject({ colisId: COLIS_ID, etat: "en_route", jalon: "en_route" });
  });
});

describe("Relais · /(voyageur)/colis/[colisId]/relais", () => {
  const d = ecrans.Relais.donnees;

  it("useRelaisProches rend les trois commerçants de la planche", async () => {
    const { result } = rendreHooks(bancDe("Relais"), () => useRelaisProches(COLIS_ID));
    const r = await attendre(() => result.current.data);
    expect(r.ville).toBe("Bafoussam");
    expect(r.destinataire.surnom).toBe("Maman");
    expect(r.reperes.map((x) => x.libelle)).toEqual([
      "Marché A",
      "Boutique Mama Fotso",
      "Pharmacie du Marché",
      "Call-box Tonton Paul",
      "Chez Maman",
      "Gare Alpha",
    ]);
    expect(r.relais.map((x) => x.nom)).toEqual(d.relais.map((x) => x.nom));
    expect(r.relais[0]).toMatchObject({
      rang: 1,
      ouvert: true,
      fermeLe: null,
      distanceM: 350,
      horaires: "7 h–20 h",
      jours: "lun.–sam.",
      note: 4.9,
      colisRemis: 212,
      particularite: null,
      supplement: 300,
    });
    expect(r.relais[1]).toMatchObject({
      distanceM: 900,
      jours: "7 j/7",
      particularite: "frigo pour médicaments",
    });
    expect(r.relais[2]).toMatchObject({
      distanceM: 1200,
      ouvert: true,
      fermeLe: "2027-01-05T19:00:00.000+01:00",
      jours: null,
      particularite: "petit colis seulement",
    });
    expect(r.devenir.partParColis).toBe(200);
  });

  it("useRelaisProches filtre par nom", async () => {
    const { result } = rendreHooks(bancDe("Relais"), () => useRelaisProches(COLIS_ID, "pharmacie"));
    const r = await attendre(() => result.current.data);
    expect(r.relais.map((x) => x.nom)).toEqual(["Pharmacie du Marché"]);
  });

  it("useChoisirRelais prévient le destinataire et facture 300 F", async () => {
    const { result } = rendreHooks(bancDe("Relais"), () => useChoisirRelais());
    const r = await act(() =>
      result.current.mutateAsync({ colisId: COLIS_ID, relaisId: "relais-boutique-mama-fotso" }),
    );
    expect(r).toEqual({
      colisId: COLIS_ID,
      relais: { id: "relais-boutique-mama-fotso", nom: "Boutique Mama Fotso" },
      supplement: d.action.montant,
      destinatairePrevenu: true,
    });
  });
});

describe("Livraison · /(voyageur)/colis/[colisId]/livraison", () => {
  const colisId = ecrans.Livraison.donnees.arrivee._colisId;

  it("useLivraisonColis rend le livreur, l'arrivée et les prix de la planche", async () => {
    const { result } = rendreHooks(bancDe("Livraison"), () => useLivraisonColis(colisId));
    const l = await attendre(() => result.current.data);
    expect(l).toMatchObject({
      statut: "en_livraison",
      carte: {
        depart: { libelle: "Gare Alpha", retireLe: "2027-01-05T13:05:00.000+01:00" },
        livreurMinutes: 6,
        arrivee: "Chez Maman · Tamdja",
      },
      arrivee: {
        libelle: "Arrive chez Maman",
        estimee: "2027-01-05T13:24:00.000+01:00",
        poidsKg: 2,
        assure: true,
      },
      livreur: {
        id: ERIC_T.id,
        initiales: "ÉT",
        nom: "Éric T.",
        verifie: true,
        note: 4.9,
        livraisons: 340,
        moto: "OU 517 MT",
        gilet: 23,
      },
      remise: { destinataireALeCode: true, attenteAbsenceMinutes: 10, relaisDeRepli: "Mama Fotso" },
      prix: { livraison: 1000, payee: true, partLivreur: 700 },
    });
    // L'expéditeur et le destinataire voient le code (ils doivent le donner au livreur).
    expect(l.remise.code).toBe(CODE_RETRAIT_COLIS_0017);
  });

  it("usePartagerSuiviLivraison envoie un lien sans le code", async () => {
    const { result } = rendreHooks(bancDe("Livraison"), () => usePartagerSuiviLivraison());
    const r = await act(() =>
      result.current.mutateAsync({ colisId, destinataire: "+237699401822" }),
    );
    expect(r.envoyeA).toBe("6 99 …");
    expect(JSON.stringify(r)).not.toContain(CODE_RETRAIT_COLIS_0017);
  });

  it("useChangerAdresseLivraison prévient le livreur et se relit", async () => {
    const { result } = rendreHooks(bancDe("Livraison"), () => ({
      changer: useChangerAdresseLivraison(),
      livraison: useLivraisonColis(colisId),
    }));
    await attendre(() => result.current.livraison.data);
    const r = await act(() =>
      result.current.changer.mutateAsync({ colisId, adresse: "Carrefour Djeleng" }),
    );
    expect(r.livreurPrevenu).toBe(true);
    await waitFor(() =>
      expect(result.current.livraison.data?.carte.arrivee).toBe("Carrefour Djeleng"),
    );
  });

  it("usePositionLivreur décompte les minutes jusqu'à l'arrivée", async () => {
    const banc = bancDe("Livraison");
    const { result } = rendreHooks(banc, () => usePositionLivreur(colisId));
    const premier = await attendre(() => result.current.dernier);
    expect(premier.minutesRestantes).toBe(6);
    await act(async () => {
      await banc.horloge.avancer(60_000);
    });
    expect(result.current.dernier?.minutesRestantes).toBe(5);
  });
});

describe("RelaisApp · /(relais)/accueil", () => {
  const d = ecrans.RelaisApp.donnees;
  const colis0011 = ecrans.RelaisApp.entites.colis![1]!;

  it("useEspaceRelais rend la boutique, le résumé, la remise en cours et la garde", async () => {
    const { result } = rendreHooks(bancDe("RelaisApp"), () => useEspaceRelais());
    const r = await attendre(() => result.current.data);
    expect(r.boutique).toMatchObject({ nom: "Boutique Mama Fotso", ouvert: true, note: 4.9 });
    expect(r.resume).toEqual({
      enGarde: 7,
      capacite: 30,
      arrivent: { nombre: 3, vers: "2027-01-05T13:30:00.000+01:00" },
      semaine: { gain: 8400, remis: 42, versement: { jour: "lundi", moyen: "MoMo" } },
    });
    expect(r.gainParRemise).toBe(200);
    expect(r.remiseEnCours?.colis.destinataire.nom).toBe("Ngo Thérèse");
    expect(r.remiseEnCours?.consigne).toContain("Ne pas photographier la pièce");
    expect(r.enGarde.map((g) => [g.colis.destinataire.nom, g.depuisJours, g.rappelEnvoye])).toEqual(
      [
        ["Kamdem J.", 2, false],
        ["Tagne M.", 6, true],
      ],
    );
    expect(r.enGarde[0]?.colis.destinataire.telephoneMasque).toBe(d.enGarde.liste[0]?.telephone);
    expect(r.enGarde[1]?.joursRestants).toBe(1);
  });

  it("useRemettreColisRelais exige le bon code et recharge l'espace", async () => {
    const banc = bancDe("RelaisApp");
    const { result } = rendreHooks(banc, () => ({
      espace: useEspaceRelais(),
      remettre: useRemettreColisRelais(),
    }));
    await attendre(() => result.current.espace.data);
    const demande = {
      colisId: d.remise._colisId,
      pieceVerifiee: true as const,
      photoRef: "photo-remise",
    };

    expect(
      await echec(() => result.current.remettre.mutateAsync({ ...demande, code: "000000" })),
    ).toMatchObject({ statut: 422, code: "code_invalide", details: { essaisRestants: 2 } });

    const remise = await act(() =>
      result.current.remettre.mutateAsync({ ...demande, code: CODE_RETRAIT_COLIS_0017 }),
    );
    expect(remise).toMatchObject({ gain: 200, colis: { etat: "remis" } });
    await waitFor(() => expect(result.current.espace.data?.resume.enGarde).toBe(6));
    expect(result.current.espace.data?.resume.semaine).toMatchObject({ gain: 8600, remis: 43 });
    expect(result.current.espace.data?.remiseEnCours).toBeNull();
  });

  it(`bloque le colis après ${ESSAIS_CODE_MAX} codes faux, même avec le bon code ensuite`, async () => {
    const { result } = rendreHooks(bancDe("RelaisApp"), () => useRemettreColisRelais());
    const demande = { colisId: d.remise._colisId, pieceVerifiee: true as const, photoRef: "p" };
    expect(
      await echec(() => result.current.mutateAsync({ ...demande, code: "111111" })),
    ).toMatchObject({ code: "code_invalide" });
    expect(
      await echec(() => result.current.mutateAsync({ ...demande, code: "222222" })),
    ).toMatchObject({ code: "code_invalide" });
    expect(
      await echec(() => result.current.mutateAsync({ ...demande, code: "333333" })),
    ).toMatchObject({ statut: 423, code: "code_bloque" });
    expect(
      await echec(() => result.current.mutateAsync({ ...demande, code: CODE_RETRAIT_COLIS_0017 })),
    ).toMatchObject({ statut: 423, code: "code_bloque" });
  });

  it("useRecevoirColisRelais et useColisRelais travaillent sur le colis scanné", async () => {
    const { result } = rendreHooks(bancDe("RelaisApp"), () => ({
      recevoir: useRecevoirColisRelais(),
      colis: useColisRelais(colis0011.id),
    }));
    const colis = await attendre(() => result.current.colis.data);
    expect(colis).toMatchObject({ numero: colis0011.numero, etat: "en_relais", codeRequis: true });
    const recu = await act(() =>
      result.current.recevoir.mutateAsync({ numeroColis: colis0011.numero }),
    );
    expect(recu.colis.id).toBe(colis0011.id);
    expect(
      await echec(() => result.current.recevoir.mutateAsync({ numeroColis: "C-XXX-000000-0000" })),
    ).toMatchObject({ statut: 404 });
  });
});

describe("Livreur · /(livreur)/accueil", () => {
  const d = ecrans.Livreur.donnees;
  const mission = d.mission;

  it("useEspaceLivreur rend le livreur, la mission à 30 s, le bilan et les pièces", async () => {
    const { result } = rendreHooks(bancDe("Livreur"), () => useEspaceLivreur());
    const e = await attendre(() => result.current.data);
    expect(e.livreur).toEqual({
      id: ERIC_T.id,
      initiales: "ÉT",
      nom: "Éric T.",
      numero: 23,
      ville: "Bafoussam",
      note: 4.9,
      disponible: true,
    });
    expect(e.mission).toMatchObject({
      gain: mission.gain.montant,
      delaiAcceptationSecondes: 30,
      expireA: "2027-01-05T13:06:24.000+01:00",
      distanceM: 4100,
      dureeMinutes: 14,
      trajet: { depart: "Gare Alpha", arrivee: "Tamdja", destinataire: "Ngo Thérèse" },
      remiseContreCode: true,
    });
    expect(e.bilan).toEqual({
      aujourdhui: { livraisons: 6, gain: 4900 },
      versement: "MoMo ce soir",
      semaine: { livraisons: 41, gain: 31_000 },
    });
    expect(e.pieces.aJour).toBe(true);
    expect(e.pieces.liste.map((p) => p.valeur)).toEqual(["valide 2028", "expire 02/27", "n° 23"]);
    expect(e.retrait).toEqual({ solde: 4900, seuil: 5000 });
  });

  it("useAccepterMission puis useRemettreColisLivreur : code, photo, gain, bilan à jour", async () => {
    const { result } = rendreHooks(bancDe("Livreur"), () => ({
      espace: useEspaceLivreur(),
      accepter: useAccepterMission(),
      remettre: useRemettreColisLivreur(),
      retirer: useRetirerGainsLivreur(),
    }));
    const espace = await attendre(() => result.current.espace.data);
    const missionId = espace.mission!.id;
    const demande = { missionId, pieceVerifiee: true as const, photoRef: "photo-remise" };

    expect(
      await echec(() =>
        result.current.remettre.mutateAsync({ ...demande, code: CODE_RETRAIT_COLIS_0017 }),
      ),
    ).toMatchObject({ code: "mission_non_acceptee" });

    const acceptee = await act(() => result.current.accepter.mutateAsync({ missionId }));
    expect(acceptee.colis.etat).toBe("en_livraison");
    await waitFor(() => expect(result.current.espace.data?.mission).toBeNull());

    expect(
      await echec(() => result.current.remettre.mutateAsync({ ...demande, code: "123456" })),
    ).toMatchObject({ code: "code_invalide" });
    const livre = await act(() =>
      result.current.remettre.mutateAsync({ ...demande, code: CODE_RETRAIT_COLIS_0017 }),
    );
    expect(livre).toMatchObject({ gain: 700, photoTransmise: true, colis: { etat: "livre" } });
    await waitFor(() =>
      expect(result.current.espace.data?.bilan.aujourdhui).toEqual({ livraisons: 7, gain: 5600 }),
    );
    expect(result.current.espace.data?.retrait.solde).toBe(5600);

    const retrait = await act(() => result.current.retirer.mutateAsync({}));
    expect(retrait).toMatchObject({ montant: 5600, moyen: "MoMo" });
  });

  it("refuse le retrait sous 5 000 F", async () => {
    const { result } = rendreHooks(bancDe("Livreur"), () => useRetirerGainsLivreur());
    expect(await echec(() => result.current.mutateAsync({}))).toMatchObject({
      code: "seuil_non_atteint",
    });
  });

  it("la mission passe au suivant après 30 s sans réponse", async () => {
    const banc = bancDe("Livreur");
    const { result } = rendreHooks(banc, () => ({
      accepter: useAccepterMission(),
      espace: useEspaceLivreur(),
    }));
    const espace = await attendre(() => result.current.espace.data);
    await act(async () => {
      await banc.horloge.avancer(25_000);
    });
    expect(
      await echec(() => result.current.accepter.mutateAsync({ missionId: espace.mission!.id })),
    ).toMatchObject({ statut: 410, code: "mission_expiree" });
  });

  it("useDisponibiliteLivreur retire la mission quand le livreur se déclare indisponible", async () => {
    const { result } = rendreHooks(bancDe("Livreur"), () => ({
      espace: useEspaceLivreur(),
      dispo: useDisponibiliteLivreur(),
    }));
    await attendre(() => result.current.espace.data);
    await act(() => result.current.dispo.mutateAsync({ disponible: false }));
    await waitFor(() => expect(result.current.espace.data?.livreur.disponible).toBe(false));
    expect(result.current.espace.data?.mission).toBeNull();
  });

  it("useSignalerAbsenceLivreur attend 10 minutes puis renvoie au relais", async () => {
    const { result } = rendreHooks(bancDe("Livreur"), () => ({
      espace: useEspaceLivreur(),
      accepter: useAccepterMission(),
      absence: useSignalerAbsenceLivreur(),
    }));
    const espace = await attendre(() => result.current.espace.data);
    const missionId = espace.mission!.id;
    await act(() => result.current.accepter.mutateAsync({ missionId }));
    const a = await act(() => result.current.absence.mutateAsync({ missionId }));
    expect(a).toMatchObject({
      attenteMinutes: 10,
      attenteJusqua: "2027-01-05T13:16:00.000+01:00",
      relaisDeRepli: { nom: "Boutique Mama Fotso" },
    });
  });

  it("useMissionsEnDirect propose la mission puis la déclare expirée", async () => {
    const banc = bancDe("Livreur");
    const { result } = rendreHooks(banc, () => useMissionsEnDirect());
    const proposee = await attendre(() => result.current.dernier);
    expect(proposee.type).toBe("proposee");
    await act(async () => {
      await banc.horloge.avancer(24_000);
    });
    expect(result.current.dernier).toMatchObject({ type: "expiree" });
  });

  it("useInviterLivreur masque le numéro invité", async () => {
    const { result } = rendreHooks(bancDe("Livreur"), () => useInviterLivreur());
    const r = await act(() => result.current.mutateAsync({ telephone: "+237675000010" }));
    expect(r.envoyeA).toBe("6 75 …");
  });
});

describe("RelaisDevenir · inscription du relais (programme)", () => {
  it("useProgrammeRelais rend les chiffres, les prérequis et les étapes de la planche", async () => {
    const d = ecrans.RelaisDevenir.donnees;
    const { result } = rendreHooks(bancDe("RelaisDevenir"), () => useProgrammeRelais());
    const p = await attendre(() => result.current.data);
    expect(p).toMatchObject({
      titre: d.titre,
      partParColis: 200,
      partSiRepris: 100,
      relaisActifs: 214,
      villes: 12,
      exemple: { nom: MAMA_FOTSO.nom, colis: 42, gain: 8400 },
    });
    expect(p.prerequis).toHaveLength(6);
    expect(p.prerequis[0]).toBe("Une boutique ouverte ≥ 6 j / 7");
    expect(p.etapes.map((e) => e.rang)).toEqual([1, 2, 3]);
  });
});

describe("RelaisInscription · inscription du relais (fiche)", () => {
  it("useFormulaireRelais rend les choix et les valeurs préremplies", async () => {
    const d = ecrans.RelaisInscription.donnees;
    const { result } = rendreHooks(bancDe("RelaisInscription"), () => useFormulaireRelais());
    const f = await attendre(() => result.current.data);
    expect(f.fiche.nom).toBe("Boutique Chez Thérèse");
    expect(f.fiche.type.choix).toEqual(d.fiche.type.choix);
    expect(f.fiche.ouvert.valeur).toBe("7 h – 20 h · lun.–sam.");
    expect(f.fiche.momo.valeurMasquee).toBe(d.fiche.momo.valeur);
    expect(f.etape).toEqual({ courante: 1, total: 3 });
  });

  it("useEnregistrerBrouillonRelais et useEnvoyerFicheRelais ouvrent un dossier", async () => {
    const { result } = rendreHooks(bancDe("RelaisInscription"), () => ({
      brouillon: useEnregistrerBrouillonRelais(),
      envoyer: useEnvoyerFicheRelais(),
    }));
    const b = await act(() =>
      result.current.brouillon.mutateAsync({ fiche: { nom: "Chez Thérèse" } }),
    );
    expect(b.enregistreLe).toBe(ecrans.RelaisInscription.maintenant);
    const depot = await act(() =>
      result.current.envoyer.mutateAsync({
        nom: "Boutique Chez Thérèse",
        type: "Boutique · alimentation",
        ouvert: "7 h – 20 h · lun.–sam.",
        position: { ville: "Bafoussam", quartier: "Tamdja" },
        tailleMax: "Petits et moyens (≤ 10 kg)",
        momo: { telephone: "+237699000041", operateur: "orange" },
        facadeRef: "photo-facade",
      }),
    );
    expect(depot.dossier).toBe("R-BAF-0215");
    expect(depot.suite).toBe("un agent te rappelle sous 72 h");
  });
});

describe("RelaisVerification · suivi de la demande du relais", () => {
  it("useSuiviDemandeRelais rend le dossier, les jalons et l'agent", async () => {
    const { result } = rendreHooks(bancDe("RelaisVerification"), () => useSuiviDemandeRelais());
    const s = await attendre(() => result.current.data);
    expect(s).toMatchObject({
      type: "relais",
      dossier: "R-BAF-0215",
      statut: "en_cours",
      etape: { courante: 2, total: 3 },
      reservation: { valeur: "R-BAF-0215", activation: "actif après la visite" },
      agent: { nom: "Paul K.", creneau: "jeudi entre 9 h et 12 h" },
    });
    expect(s.jalons.map((j) => j.fait)).toEqual([true, true, false, false, false]);
    expect(s.jalons[0]?.a).toBe("2027-01-05T10:12:00.000+01:00");
    expect(s.jalons[2]?.a).toBeNull();
  });
});

describe("LivreurDevenir · inscription du livreur", () => {
  it("useProgrammeLivreur rend les particularités à choisir et useDeposerDemandeLivreur ouvre un dossier", async () => {
    const d = ecrans.LivreurDevenir.donnees;
    const { result } = rendreHooks(bancDe("LivreurDevenir"), () => ({
      programme: useProgrammeLivreur(),
      deposer: useDeposerDemandeLivreur(),
    }));
    const p = await attendre(() => result.current.programme.data);
    expect(p).toMatchObject({
      partParCourse: 700,
      livreursActifs: 86,
      villes: 12,
      exemple: { nom: ERIC_T.nom, courses: 41, gain: 31_000 },
    });
    expect(p.particularites.deplacement.choix).toEqual(d.particularites.deplacement.choix);
    expect(p.particularites.zone.valeur).toBe("Bafoussam · Tamdja, Djeleng, centre");
    expect(p.regles.texte).toBe(d.regles.texte);

    const depot = await act(() =>
      result.current.deposer.mutateAsync({
        deplacement: "moto",
        zone: p.particularites.zone.valeur,
        heures: p.particularites.heures.valeur,
        chargeMax: p.particularites.charge.valeur,
        momo: { telephone: "+237675000009", operateur: "mtn" },
        pieces: {},
        reglesAcceptees: true,
      }),
    );
    expect(depot.dossier).toBe("L-BAF-0087");
  });
});

describe("LivreurVerification · suivi de la demande du livreur", () => {
  it("useSuiviDemandeLivreur rend le dossier, le badge réservé et la première soirée", async () => {
    const d = ecrans.LivreurVerification.donnees;
    const { result } = rendreHooks(bancDe("LivreurVerification"), () => useSuiviDemandeLivreur());
    const s = await attendre(() => result.current.data);
    expect(s).toMatchObject({
      type: "livreur",
      dossier: "L-BAF-0087",
      statut: "en_cours",
      reservation: { valeur: "L-BAF-0087", activation: "actif après la formation" },
      complement: { titre: d.particularites.titre },
      agent: null,
    });
    expect(s.jalons.map((j) => j.fait)).toEqual([true, true, false, false, false]);
    expect(s.recit.texte).toContain("700 F");
  });
});

describe("InterAgences · /(patron)/inter-agences", () => {
  const d = ecrans.InterAgences.donnees;

  it("useInterAgences rend le colis en correspondance et ses deux tronçons", async () => {
    const { result } = rendreHooks(bancDe("InterAgences"), () => useInterAgences());
    const r = await attendre(() => result.current.data);
    const [corr] = r.colis;
    expect(corr?.trajet).toBe("Douala → Bamenda");
    expect(corr?.colis.poidsKg).toBe(3);
    expect(corr?.troncons).toEqual([
      {
        rang: 1,
        compagnie: "Alpha",
        trajet: "Douala → Bafoussam",
        depart: "2027-01-05T08:15:00.000+01:00",
        bus: "LT 118 AB",
        arrivee: "2027-01-05T13:00:00.000+01:00",
        part: 1500,
      },
      {
        rang: 2,
        compagnie: "Oméga",
        trajet: "Bafoussam → Bamenda",
        depart: "2027-01-05T14:00:00.000+01:00",
        bus: "OU 302 NW",
        arrivee: "2027-01-05T16:30:00.000+01:00",
        part: 1200,
      },
    ]);
    expect(r.conventions).toEqual([
      { id: "convention-alpha-omega", partenaire: "Oméga", libelle: "Convention Oméga" },
    ]);
    expect(r.voyageurs).toMatchObject({ correspondanceMinutes: 25, attenteSecondBusMinutes: 15 });
    expect(r.titre).toBe(d.titre);
  });

  it("useReglementInterAgences rend le règlement net du lundi 08:00", async () => {
    const { result } = rendreHooks(bancDe("InterAgences"), () => useReglementInterAgences());
    const r = await attendre(() => result.current.data);
    expect(r.creances).toEqual([
      { compagnie: "Oméga", sens: "nous_doivent", colis: 14, montant: 19_500 },
      { compagnie: "Oméga", sens: "nous_devons", colis: 6, montant: 7200 },
    ]);
    expect(r.soldeNet).toBe(12_300);
    expect(r.moyen).toBe("MoMo");
    expect(r.reglementLe).toBe("2027-01-11T08:00:00.000+01:00");
    expect(r.contestationJusqua).toBe("2027-01-10T20:00:00.000+01:00");
  });

  it("useContesterReglement, useInviterCompagnie et useScannerTransfertColis répondent", async () => {
    const colisId = ecrans.InterAgences.donnees.colis._colisId;
    const { result } = rendreHooks(bancDe("InterAgences"), () => ({
      contester: useContesterReglement(),
      inviter: useInviterCompagnie(),
      scanner: useScannerTransfertColis(),
    }));
    const c = await act(() => result.current.contester.mutateAsync({ motif: "6 colis contestés" }));
    expect(c.recevable).toBe(true);
    const i = await act(() =>
      result.current.inviter.mutateAsync({ compagnie: "Bêta Express", patron: "+237677000054" }),
    );
    expect(i.reference).toMatch(/^INV-/);
    const remis = await act(() =>
      result.current.scanner.mutateAsync({ colisId, sens: "remis_a", compagnie: "Oméga" }),
    );
    expect(remis.responsable).toBe("cedant");
    const recu = await act(() =>
      result.current.scanner.mutateAsync({ colisId, sens: "recu", compagnie: "Oméga" }),
    );
    expect(recu).toMatchObject({ responsable: "preneur", colis: { id: colisId } });
  });
});

describe("InterAgencesConvention · convention Alpha – Oméga", () => {
  it("useConventionInterAgences rend parts, règles, signatures et bilan du trimestre", async () => {
    const d = ecrans.InterAgencesConvention.donnees;
    const { result } = rendreHooks(bancDe("InterAgencesConvention"), () =>
      useConventionInterAgences("convention-alpha-omega"),
    );
    const c = await attendre(() => result.current.data);
    expect(c).toMatchObject({
      titre: d.titre,
      statut: "active",
      signeLe: "2026-10-12T11:05:00.000+01:00",
      renouvellement: "renouvelée chaque trimestre",
    });
    expect(c.parts.lignes[0]).toEqual({
      troncon: "Douala → Bafoussam",
      parts: { Alpha: 1400, Oméga: null },
    });
    expect(c.parts.total).toMatchObject({
      prixClient: 3000,
      fraisAfrimove: 150,
      parts: { Alpha: 1600, Oméga: 1400 },
    });
    expect(c.regles.liste.map((r) => r.rang)).toEqual([1, 2, 3, 4, 5]);
    expect(c.signatures.map((s) => [s.compagnie, s.moi, s.signeLe])).toEqual([
      ["Alpha", true, "2026-10-12T09:40:00.000+01:00"],
      ["Oméga", false, "2026-10-12T11:05:00.000+01:00"],
    ]);
    expect(c.trimestre).toEqual({
      colisEchanges: 184,
      litiges: 1,
      delaiLitigeJours: 2,
      netRecu: 131_000,
      lundis: 12,
    });
  });
});

describe("Vendeur · /(vendeur)/accueil", () => {
  const d = ecrans.Vendeur.donnees;

  it("useEspaceVendeur rend le vendeur, son bilan et la règle", async () => {
    const { result } = rendreHooks(bancDe("Vendeur"), () => useEspaceVendeur());
    const e = await attendre(() => result.current.data);
    expect(e.vendeur).toEqual({
      id: "pers-nadege",
      nom: "Nadège",
      numero: "V-0412",
      quartier: "Ndokoti",
      compagnies: ["Alpha", "Bêta"],
    });
    expect(e.commissionParDefaut).toBe(100);
    expect(e.bilan).toEqual({
      billetsDuMois: 83,
      gainDuMois: 9350,
      versement: "lundi",
      clients: 41,
      clientsReguliers: 12,
    });
    expect(e.regle).toBe(d.regle);
  });

  it("useDepartsVendeur rend les deux départs de demain avec leur commission", async () => {
    const { result } = rendreHooks(bancDe("Vendeur"), () => useDepartsVendeur());
    const r = await attendre(() => result.current.data);
    expect(r.trajet).toBe("Douala → Yaoundé");
    expect(r.jour).toBe("2027-01-06");
    expect(
      r.departs.map((x) => [x.compagnie, x.classe, x.placesLibres, x.prix, x.commission]),
    ).toEqual([
      ["Alpha Voyages", "classique", 18, 4000, 100],
      ["Bêta Express VIP", "vip", 9, 7500, 150],
    ]);
    expect(r.departs[0]?.heureDepart).toBe("2027-01-06T08:30:00.000+01:00");
  });

  it("useClientsVendeur rend les clients à revendre en une touche", async () => {
    const { result } = rendreHooks(bancDe("Vendeur"), () => useClientsVendeur());
    const r = await attendre(() => result.current.data);
    expect(r.clients).toEqual([
      {
        nom: "Mme Ebogo",
        destination: "Yaoundé",
        habitude: "chaque vendredi",
        telephoneMasque: "6 70 …",
        proposition: "vendredi 08:30",
        dernierVoyage: null,
      },
      {
        nom: "Pasteur Nkou",
        destination: "Bafoussam",
        habitude: null,
        telephoneMasque: "6 94 …",
        proposition: null,
        dernierVoyage: "2026-12-28T00:00:00.000+01:00",
      },
    ]);
  });

  it("useVendreBilletVendeur vend au nom du voisin et met à jour places et bilan", async () => {
    const { result } = rendreHooks(bancDe("Vendeur"), () => ({
      departs: useDepartsVendeur(),
      espace: useEspaceVendeur(),
      vendre: useVendreBilletVendeur(),
    }));
    const departs = await attendre(() => result.current.departs.data);
    const departId = departs.departs[0]!.departId;
    const billet = await act(() =>
      result.current.vendre.mutateAsync({
        departId,
        voisin: { nom: "M. Tagne", telephone: "+237670111222" },
        reglementAgence: "mtn_momo",
      }),
    );
    expect(billet).toMatchObject({
      prix: 4000,
      commission: 100,
      aRegler: 4000,
      smsEnvoyeA: "6 70 …",
    });
    expect(billet.numero).toMatch(/^ALP-DLA-270106-\d{4}$|^ALP-DLA-270105-\d{4}$/);
    await waitFor(() => expect(result.current.departs.data?.departs[0]?.placesLibres).toBe(17));
    await waitFor(() =>
      expect(result.current.espace.data?.bilan).toMatchObject({
        billetsDuMois: 84,
        gainDuMois: 9450,
      }),
    );
  });
});

describe("le monde de démonstration reste cohérent avec le mock", () => {
  it("le colis de Maman du mock est celui des fixtures", () => {
    expect(COLIS_MAMAN.id).toBe(ecrans.ColisCode.donnees.retrait._colisId);
  });
});

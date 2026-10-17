// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { ALPHA_AKWA, ALPHA_DLA_BAF, JOSEPH_M, ecrans } from "@afrimove/fixtures";
import { afterEach, describe, expect, it } from "vitest";
import { ErreurHttp } from "../infra/erreurs";
import { creerHorlogeManuelle } from "../infra/horloge";
import {
  useAppliquerProposition,
  useAppliquerRapprochement,
  useChangerCompteMomo,
  useChangerModule,
  useCloturerMois,
  useConversationAssistant,
  useCreerPersonne,
  useDemanderAvance,
  useDemanderConfirmationCompteMomo,
  useDesactiverPersonne,
  useDirectControle,
  useDirectJour,
  useDossierFinancement,
  useEnregistrerRegles,
  useLancerPaie,
  useLigneEditable,
  useModifierLigne,
  useModules,
  useNouveauPinProvisoire,
  usePersonneEditable,
  usePoserQuestion,
  useRapprochementMomo,
  useRegles,
  useReglages,
  useReglerBilletEnDeuxFois,
  useRetirerDemande,
  useSignaturePin,
  useSimuler,
  useSyntheseComptable,
  useClotureMois,
  useOffreFinancement,
} from "./hooks";
import { PIN_REFUSE_PAR_LE_MOCK } from "./mock/contexte";
import { clientPatron, enveloppe } from "./mock/testing";

afterEach(cleanup);

/** Les écritures du patron, de bout en bout : hook → signature PIN → mock → lecture rechargée. */

const PIN = "483920";

async function erreurDe(promesse: Promise<unknown>): Promise<ErreurHttp> {
  try {
    await promesse;
  } catch (e) {
    if (e instanceof ErreurHttp) return e;
    throw e;
  }
  throw new Error("Une erreur HTTP était attendue");
}

describe("signature PIN", () => {
  it("useSignaturePin date la signature avec l'horloge du client et garde le mode de saisie", () => {
    const horloge = creerHorlogeManuelle("2027-01-05T14:07:00+01:00");
    const client = clientPatron("Patron", horloge);
    const { result } = renderHook(() => useSignaturePin(), { wrapper: enveloppe(client) });
    expect(result.current(PIN)).toEqual({
      pin: PIN,
      methode: "pin",
      signeA: "2027-01-05T14:07:00.000+01:00",
    });
    expect(result.current(PIN, "empreinte").methode).toBe("empreinte");
  });
});

describe("modules", () => {
  it("masquer un module le retire des modules actifs, avec la signature au journal", async () => {
    const client = clientPatron("Modules");
    const { result } = renderHook(
      () => ({ modules: useModules(), changer: useChangerModule(), signer: useSignaturePin() }),
      { wrapper: enveloppe(client) },
    );
    await waitFor(() => expect(result.current.modules.data?.actifs).toBe(10));

    let accuse: Awaited<ReturnType<typeof result.current.changer.mutateAsync>> | undefined;
    await act(async () => {
      accuse = await result.current.changer.mutateAsync({
        code: "relais",
        actif: false,
        portee: { type: "agence" },
        signature: result.current.signer(PIN),
      });
    });
    expect(accuse!.module).toMatchObject({ code: "relais", actif: false });
    expect(accuse!.journalId).toMatch(/^jrn-/);
    await waitFor(() => expect(result.current.modules.data?.actifs).toBe(9));
  });

  it("une activation par gare ou par ville est une exception à la règle de l'agence", async () => {
    const client = clientPatron("Modules");
    const { result } = renderHook(
      () => ({ changer: useChangerModule(), signer: useSignaturePin() }),
      {
        wrapper: enveloppe(client),
      },
    );
    let reponse: Awaited<ReturnType<typeof result.current.changer.mutateAsync>> | undefined;
    await act(async () => {
      reponse = await result.current.changer.mutateAsync({
        code: "financement",
        actif: true,
        portee: { type: "gare", id: ALPHA_AKWA.id },
        signature: result.current.signer(PIN),
      });
    });
    expect(reponse!.module.actif).toBe(false);
    expect(reponse!.module.exceptions).toEqual([
      { portee: { type: "gare", id: ALPHA_AKWA.id }, actif: true },
    ]);
  });

  it("le socle ne peut pas être masqué", async () => {
    const client = clientPatron("Modules");
    const { result } = renderHook(
      () => ({ changer: useChangerModule(), signer: useSignaturePin() }),
      {
        wrapper: enveloppe(client),
      },
    );
    const erreur = await erreurDe(
      result.current.changer.mutateAsync({
        code: "guichet_caisse",
        actif: false,
        portee: { type: "agence" },
        signature: result.current.signer(PIN),
      }),
    );
    expect(erreur).toMatchObject({ statut: 409, code: "MODULE_SOCLE" });
  });

  it("un PIN refusé ne change rien", async () => {
    const client = clientPatron("Modules");
    const { result } = renderHook(
      () => ({ modules: useModules(), changer: useChangerModule(), signer: useSignaturePin() }),
      { wrapper: enveloppe(client) },
    );
    await waitFor(() => expect(result.current.modules.data).toBeDefined());
    const erreur = await erreurDe(
      result.current.changer.mutateAsync({
        code: "relais",
        actif: false,
        portee: { type: "agence" },
        signature: result.current.signer("000000"),
      }),
    );
    expect(erreur).toMatchObject({ statut: 403, code: "PIN_INCORRECT" });
    expect(result.current.modules.data?.actifs).toBe(10);
  });
});

describe("règles et comptes MoMo", () => {
  it("enregistrer les règles recharge useRegles et l'accueil des réglages", async () => {
    const client = clientPatron("ConfigRegles");
    const { result } = renderHook(
      () => ({
        regles: useRegles(),
        accueil: useReglages(),
        enregistrer: useEnregistrerRegles(),
        signer: useSignaturePin(),
      }),
      { wrapper: enveloppe(client) },
    );
    await waitFor(() => expect(result.current.regles.data?.caisse.toleranceEcart).toBe(1000));
    await act(async () => {
      const { comptesMomo: _comptes, ...modifiables } = result.current.regles.data!;
      await result.current.enregistrer.mutateAsync({
        regles: { ...modifiables, caisse: { toleranceEcart: 500, auDela: "pin_superviseur" } },
        signature: result.current.signer(PIN),
      });
    });
    await waitFor(() => expect(result.current.regles.data?.caisse.toleranceEcart).toBe(500));
    await waitFor(() =>
      expect(result.current.accueil.data?.regles.caisse.auDela).toBe("pin_superviseur"),
    );
  });

  it("changer un compte MoMo exige d'abord le SMS de confirmation à l'ancien numéro", async () => {
    const client = clientPatron("ConfigRegles");
    const { result } = renderHook(
      () => ({
        regles: useRegles(),
        confirmer: useDemanderConfirmationCompteMomo(),
        changer: useChangerCompteMomo(),
        signer: useSignaturePin(),
      }),
      { wrapper: enveloppe(client) },
    );
    await waitFor(() => expect(result.current.regles.data).toBeDefined());
    const demande = { operateur: "mtn", nouveauNumero: "+237677555566" } as const;

    const sansSms = await erreurDe(
      result.current.changer.mutateAsync({
        ...demande,
        codeSms: "123456",
        signature: result.current.signer(PIN),
      }),
    );
    expect(sansSms).toMatchObject({ statut: 409, code: "CONFIRMATION_REQUISE" });

    await act(async () => {
      const sms = await result.current.confirmer.mutateAsync({
        ...demande,
        signature: result.current.signer(PIN),
      });
      expect(sms.envoyeA).toBe("6 77 •• •• 02");
    });
    await act(async () => {
      const change = await result.current.changer.mutateAsync({
        ...demande,
        codeSms: "123456",
        signature: result.current.signer(PIN),
      });
      expect(change.numeroMasque).toBe("6 77 •• •• 66");
      // Les ventes en cours restent sur l'ancien compte jusqu'à minuit.
      expect(change.effetA.endsWith("T00:00:00.000+01:00")).toBe(true);
    });
    await waitFor(() =>
      expect(result.current.regles.data?.comptesMomo.mtn.numeroMasque).toBe("6 77 •• •• 66"),
    );
  });
});

describe("lignes et personnes", () => {
  it("publier une ligne remplace ses tarifs et efface le brouillon", async () => {
    const client = clientPatron("ConfigLigne");
    const { result } = renderHook(
      () => ({
        ligne: useLigneEditable(ALPHA_DLA_BAF.id),
        accueil: useReglages(),
        modifier: useModifierLigne(),
        signer: useSignaturePin(),
      }),
      { wrapper: enveloppe(client) },
    );
    await waitFor(() => expect(result.current.ligne.data?.brouillon.modifications).toBe(2));
    await act(async () => {
      await result.current.modifier.mutateAsync({
        ligneId: ALPHA_DLA_BAF.id,
        tarifs: { classique: 3000, vip: 4500, bagage: 1000 },
        signature: result.current.signer(PIN),
      });
    });
    await waitFor(() => expect(result.current.ligne.data?.tarifs.classique).toBe(3000));
    expect(result.current.ligne.data?.brouillon).toEqual({ modifications: 0, publicationA: null });
    await waitFor(() =>
      expect(
        result.current.accueil.data?.lignes.find((l) => l.id === ALPHA_DLA_BAF.id)?.tarifs
          .classique,
      ).toBe(3000),
    );
  });

  it("ajouter une personne envoie un PIN provisoire ; la désactiver la retire", async () => {
    const client = clientPatron("ConfigPersonne");
    const { result } = renderHook(
      () => ({
        creer: useCreerPersonne(),
        desactiver: useDesactiverPersonne(),
        pin: useNouveauPinProvisoire(),
        joseph: usePersonneEditable(JOSEPH_M.id),
        signer: useSignaturePin(),
      }),
      { wrapper: enveloppe(client) },
    );
    await waitFor(() => expect(result.current.joseph.data?.actif).toBe(true));
    let nouvelle = "";
    await act(async () => {
      const r = await result.current.creer.mutateAsync({
        champs: {
          nom: "Nouvelle Recrue",
          telephone: "+237677000099",
          operateur: "Orange",
          role: "guichetier",
          gareId: ALPHA_AKWA.id,
          guichet: "1",
          salaire: 90_000,
          droits: {
            vendreBilletsEtColis: true,
            annulerSansPinSuperviseur: false,
            modeCadence: false,
            voirCaissesDesAutres: false,
          },
        },
        signature: result.current.signer(PIN),
      });
      expect(r.pinProvisoireEnvoye).toBe(true);
      nouvelle = r.personne.id;
    });
    await act(async () => {
      const pin = await result.current.pin.mutateAsync({
        personneId: JOSEPH_M.id,
        signature: result.current.signer(PIN),
      });
      expect(pin.valableJusqua.slice(11, 13)).toBe(
        String((Number(client.horloge.iso().slice(11, 13)) + 1) % 24).padStart(2, "0"),
      );
    });
    await act(async () => {
      await result.current.desactiver.mutateAsync({
        personneId: JOSEPH_M.id,
        signature: result.current.signer(PIN),
      });
    });
    await waitFor(() => expect(result.current.joseph.data?.actif).toBe(false));
    expect(nouvelle).toMatch(/^pers-nouvelle-/);
  });
});

describe("comptable : rapprochement puis clôture", () => {
  it("la clôture est refusée tant qu'une ligne reste ouverte, puis verrouille le mois", async () => {
    const client = clientPatron("Comptable");
    const { result } = renderHook(
      () => ({
        synthese: useSyntheseComptable(),
        rapprochement: useRapprochementMomo(),
        cloture: useClotureMois(),
        appliquer: useAppliquerRapprochement(),
        cloturer: useCloturerMois(),
        signer: useSignaturePin(),
      }),
      { wrapper: enveloppe(client) },
    );
    await waitFor(() => expect(result.current.rapprochement.data?.lignes).toHaveLength(4));
    expect(result.current.synthese.data?.statut).toBe("ouvert");

    const trop_tot = await erreurDe(
      result.current.cloturer.mutateAsync({
        mois: "2026-12",
        envoyerAuCabinet: true,
        signature: result.current.signer(PIN),
      }),
    );
    expect(trop_tot).toMatchObject({ statut: 409, code: "RAPPROCHEMENT_OUVERT" });

    await act(async () => {
      const r = await result.current.appliquer.mutateAsync({
        mois: "2026-12",
        decisions: result.current.rapprochement.data!.lignes.map((l) => ({
          reference: l.reference,
          action: l.actionProposee,
        })),
        signature: result.current.signer(PIN),
      });
      expect(r).toMatchObject({
        remboursements: 2,
        rattachements: 1,
        reclamations: 1,
        lignesOuvertes: 0,
      });
    });
    await waitFor(() =>
      expect(result.current.rapprochement.data?.lignes.every((l) => l.decision !== null)).toBe(
        true,
      ),
    );

    await act(async () => {
      const r = await result.current.cloturer.mutateAsync({
        mois: "2026-12",
        envoyerAuCabinet: true,
        signature: result.current.signer(PIN),
      });
      expect(r.cloture).toMatchObject({ statut: "cloture", verrouille: true });
    });
    await waitFor(() => expect(result.current.synthese.data?.statut).toBe("cloture"));
    await waitFor(() => expect(result.current.cloture.data?.envoi.recuA).not.toBeNull());

    const deuxieme = await erreurDe(
      result.current.cloturer.mutateAsync({
        mois: "2026-12",
        envoyerAuCabinet: true,
        signature: result.current.signer(PIN),
      }),
    );
    expect(deuxieme.code).toBe("MOIS_DEJA_CLOTURE");
  });

  it("une décision sur une référence inconnue est refusée", async () => {
    const client = clientPatron("Comptable");
    const { result } = renderHook(
      () => ({ appliquer: useAppliquerRapprochement(), signer: useSignaturePin() }),
      {
        wrapper: enveloppe(client),
      },
    );
    const erreur = await erreurDe(
      result.current.appliquer.mutateAsync({
        mois: "2026-12",
        decisions: [{ reference: "XX0000", action: "rembourser" }],
        signature: result.current.signer(PIN),
      }),
    );
    expect(erreur).toMatchObject({ statut: 404, code: "TRANSACTION_INCONNUE" });
  });
});

describe("financement", () => {
  it("demander l'avance crée un dossier, le retirer le ferme, une seule fois", async () => {
    const client = clientPatron("Financement");
    const { result } = renderHook(
      () => ({
        offre: useOffreFinancement(),
        demander: useDemanderAvance(),
        retirer: useRetirerDemande(),
        signer: useSignaturePin(),
      }),
      { wrapper: enveloppe(client) },
    );
    await waitFor(() => expect(result.current.offre.data?.avance.plafond).toBe(12_000_000));

    const trop = await erreurDe(
      result.current.demander.mutateAsync({
        montant: 12_000_001,
        signature: result.current.signer(PIN),
      }),
    );
    expect(trop).toMatchObject({ statut: 422, code: "AU_DESSUS_DU_PLAFOND" });

    let dossierId = "";
    await act(async () => {
      const r = await result.current.demander.mutateAsync({
        montant: 6_000_000,
        signature: result.current.signer(PIN),
      });
      dossierId = r.dossier.id;
      expect(r.dossier).toMatchObject({ statut: "envoye", montant: 6_000_000, retirable: true });
    });
    expect(dossierId).toBe("AV-2027-0042");

    await act(async () => {
      const r = await result.current.retirer.mutateAsync({
        dossierId,
        signature: result.current.signer(PIN),
      });
      expect(r.dossier).toMatchObject({ statut: "retire", retirable: false });
    });
    const encore = await erreurDe(
      result.current.retirer.mutateAsync({ dossierId, signature: result.current.signer(PIN) }),
    );
    expect(encore.code).toBe("DOSSIER_NON_RETIRABLE");
  });

  it("retirer le dossier de la planche met à jour useDossierFinancement", async () => {
    const client = clientPatron("FinancementDemande");
    const { result } = renderHook(
      () => ({
        dossier: useDossierFinancement("AV-2027-0041"),
        retirer: useRetirerDemande(),
        signer: useSignaturePin(),
      }),
      { wrapper: enveloppe(client) },
    );
    await waitFor(() => expect(result.current.dossier.data?.statut).toBe("en_analyse"));
    await act(async () => {
      await result.current.retirer.mutateAsync({
        dossierId: "AV-2027-0041",
        signature: result.current.signer(PIN),
      });
    });
    await waitFor(() => expect(result.current.dossier.data?.statut).toBe("retire"));
  });

  it("une demande envoyée met l'offre « en cours » avec le lien vers son dossier ; la retirer la rend éligible", async () => {
    const client = clientPatron("Financement");
    const { result } = renderHook(
      () => ({
        offre: useOffreFinancement(),
        demander: useDemanderAvance(),
        retirer: useRetirerDemande(),
        signer: useSignaturePin(),
      }),
      { wrapper: enveloppe(client) },
    );
    await waitFor(() => expect(result.current.offre.data?.avance.statut).toBe("eligible"));
    expect(result.current.offre.data?.avance.dossierId).toBeUndefined();

    await act(async () => {
      await result.current.demander.mutateAsync({
        montant: 4_000_000,
        signature: result.current.signer(PIN),
      });
    });
    await waitFor(() => expect(result.current.offre.data?.avance.statut).toBe("en_cours"));
    expect(result.current.offre.data?.avance).toMatchObject({
      dossierId: "AV-2027-0042",
      montantPropose: 4_000_000,
    });
    // Une seconde demande est refusée tant que la première est ouverte.
    const encore = await erreurDe(
      result.current.demander.mutateAsync({
        montant: 1_000_000,
        signature: result.current.signer(PIN),
      }),
    );
    expect(encore).toMatchObject({ statut: 409, code: "DEMANDE_EN_COURS" });

    await act(async () => {
      await result.current.retirer.mutateAsync({
        dossierId: "AV-2027-0042",
        signature: result.current.signer(PIN),
      });
    });
    await waitFor(() => expect(result.current.offre.data?.avance.statut).toBe("eligible"));
    expect(result.current.offre.data?.avance.dossierId).toBeUndefined();
  });

  it("activer puis couper le paiement en 2 fois met l'offre à jour ; sans PIN valide, rien ne change", async () => {
    const client = clientPatron("Financement");
    const { result } = renderHook(
      () => ({
        offre: useOffreFinancement(),
        regler: useReglerBilletEnDeuxFois(),
        signer: useSignaturePin(),
      }),
      { wrapper: enveloppe(client) },
    );
    await waitFor(() => expect(result.current.offre.data?.billetEnDeuxFois.actif).toBe(false));

    const refus = await erreurDe(
      result.current.regler.mutateAsync({
        actif: true,
        signature: result.current.signer(PIN_REFUSE_PAR_LE_MOCK),
      }),
    );
    expect(refus).toMatchObject({ statut: 403, code: "PIN_INCORRECT" });
    expect(result.current.offre.data?.billetEnDeuxFois.actif).toBe(false);

    await act(async () => {
      const r = await result.current.regler.mutateAsync({
        actif: true,
        signature: result.current.signer(PIN),
      });
      expect(r).toMatchObject({ actif: true, journalId: expect.any(String) });
    });
    await waitFor(() => expect(result.current.offre.data?.billetEnDeuxFois.actif).toBe(true));

    await act(async () => {
      await result.current.regler.mutateAsync({
        actif: false,
        signature: result.current.signer(PIN),
      });
    });
    await waitFor(() => expect(result.current.offre.data?.billetEnDeuxFois.actif).toBe(false));
  });
});

describe("assistant", () => {
  it("une question de la conversation reçoit sa réponse préparée, une autre une réponse honnête", async () => {
    const client = clientPatron("AssistantReponse");
    const { result } = renderHook(
      () => ({ conversation: useConversationAssistant(), poser: usePoserQuestion() }),
      { wrapper: enveloppe(client) },
    );
    await waitFor(() => expect(result.current.conversation.data?.echanges).toHaveLength(2));
    await act(async () => {
      const r = await result.current.poser.mutateAsync({ question: "pourquoi bafoussam baisse" });
      expect(r.resume).toMatch(/− 14 %/);
    });
    expect(result.current.conversation.data?.echanges).toHaveLength(2);
    await act(async () => {
      const r = await result.current.poser.mutateAsync({
        question: "Quel temps fera-t-il samedi ?",
      });
      expect(r.resume).toMatch(/pas de réponse préparée/);
    });
    await waitFor(() => expect(result.current.conversation.data?.echanges).toHaveLength(3));
  });

  it("la simulation du 10:00 à 09:15 donne +1,5 M par mois ; une autre n'est pas préparée", async () => {
    const client = clientPatron("Assistant");
    const { result } = renderHook(() => useSimuler(), { wrapper: enveloppe(client) });
    const departId = ecrans.AnalysesLigne.donnees.departs.liste[2]!._departId;
    await act(async () => {
      const r = await result.current.mutateAsync({
        type: "horaire",
        departId,
        nouvelleHeure: "09:15",
      });
      expect(r.simulation.gainMensuel).toBe(1_500_000);
    });
    await act(async () => {
      const r = await result.current.mutateAsync({ type: "prix", departId, nouveauPrix: 3500 });
      expect(r.simulation.gainMensuel).toBe(-400_000);
    });
    const erreur = await erreurDe(
      result.current.mutateAsync({ type: "horaire", departId, nouvelleHeure: "11:00" }),
    );
    expect(erreur).toMatchObject({ statut: 422, code: "SIMULATION_NON_PREPAREE" });
  });

  it("appliquer « décaler le 10:00 » prend effet lundi, signé par le PIN", async () => {
    const client = clientPatron("Assistant");
    const { result } = renderHook(
      () => ({ appliquer: useAppliquerProposition(), signer: useSignaturePin() }),
      {
        wrapper: enveloppe(client),
      },
    );
    await act(async () => {
      const r = await result.current.appliquer.mutateAsync({
        actionId: "decaler-1000-0915",
        signature: result.current.signer(PIN),
      });
      expect(r.effetA).toBe("2027-01-11T00:00:00.000+01:00");
    });
    const inconnue = await erreurDe(
      result.current.appliquer.mutateAsync({
        actionId: "n-importe-quoi",
        signature: result.current.signer(PIN),
      }),
    );
    expect(inconnue.code).toBe("PROPOSITION_INCONNUE");
  });
});

describe("paie", () => {
  it("lancer la paie de janvier verse les 23 salaires le 30", async () => {
    const client = clientPatron("PatronEquipe");
    const { result } = renderHook(() => ({ payer: useLancerPaie(), signer: useSignaturePin() }), {
      wrapper: enveloppe(client),
    });
    await act(async () => {
      const r = await result.current.payer.mutateAsync({
        mois: "2027-01",
        signature: result.current.signer(PIN),
      });
      expect(r).toMatchObject({
        nbSalaires: 23,
        total: null,
        versementA: "2027-01-30T08:00:00.000+01:00",
      });
    });
  });
});

describe("temps réel", () => {
  it("useDirectJour : les chiffres de la planche, puis une vente toutes les 30 s", async () => {
    const horloge = creerHorlogeManuelle("2027-01-05T14:05:00+01:00");
    const client = clientPatron("Patron", horloge);
    const { result } = renderHook(() => useDirectJour(), { wrapper: enveloppe(client) });
    await act(async () => {
      await horloge.avancer(0);
    });
    const premier = result.current.dernier;
    expect(result.current.etat).toBe("ouvert");
    expect(premier).toMatchObject({
      type: "chiffres",
      instant: "2027-01-05T14:05:00.000+01:00",
      jour: { recette: 2_610_000, billets: 612, colis: 188, ecartTotal: -1000 },
    });
    await act(async () => {
      await horloge.avancer(30_000);
    });
    expect(result.current.dernier).toMatchObject({
      instant: "2027-01-05T14:05:30.000+01:00",
      jour: { recette: 2_614_000, billets: 613 },
    });
  });

  it("useDirectControle : même principe sur la salle de contrôle", async () => {
    const horloge = creerHorlogeManuelle("2027-01-05T14:05:00+01:00");
    const client = clientPatron("Controle", horloge);
    const { result } = renderHook(() => useDirectControle(), { wrapper: enveloppe(client) });
    await act(async () => {
      await horloge.avancer(0);
      await horloge.avancer(60_000);
    });
    expect(result.current.dernier).toMatchObject({
      type: "chiffres",
      chiffres: { billets: 614, recette: 2_618_000, ecartsDeCaisse: { total: -1000 } },
    });
  });

  it("le direct s'arrête quand l'écran est démonté", async () => {
    const horloge = creerHorlogeManuelle("2027-01-05T14:05:00+01:00");
    const client = clientPatron("Patron", horloge);
    const { unmount } = renderHook(() => useDirectJour(), { wrapper: enveloppe(client) });
    await act(async () => {
      await horloge.avancer(0);
    });
    unmount();
    expect(horloge.enAttente).toBe(0);
  });
});

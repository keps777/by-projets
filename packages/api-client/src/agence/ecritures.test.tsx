// @vitest-environment jsdom
import { agence as c } from "@afrimove/contrats";
import { ecrans } from "@afrimove/fixtures";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ErreurHttp } from "../infra/index";
import type { ContexteTest } from "./outils-test";
import {
  useAjouterTelephoneBillet,
  useCadenceEtat,
  useCaisseSession,
  useCompleterBillet,
  useDemanderAnnulation,
  useQuaiDirect,
  useQuaiEmbarquement,
  useScannerAuQuai,
  useVendreBillet,
  useVendreBilletCadence,
  useVenteContexte,
} from "./hooks";
import {
  ECRITURES,
  LECTURES_AGENCE,
  LISTE_ECRITURES,
  OP_CAISSE_SESSION,
  OP_COLIS_FORMULAIRE,
  OP_CONTROLE_INOPINE,
  OP_VENTE_CONTEXTE,
} from "./operations";
import type { DefinitionEvenementQuelconque, EcritureAgence } from "./operations";
import { PLANCHES_AGENCE } from "./mock/types";
import { contexteTest, scenarioAgence } from "./outils-test";

afterEach(cleanup);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CASH = { mode: "cash" as const, recu: 5000, rendu: 1000, reference: null };
const PREUVE = {
  superviseurId: "pers-essono",
  methode: "pin" as const,
  signature: "a1b2c3d4e5f60718",
};

/** Crée l'événement sur l'appareil du contexte puis l'envoie par le client (hors React). */
async function ecrire<E extends DefinitionEvenementQuelconque, R>(
  ctx: ContexteTest,
  ecriture: EcritureAgence<E, R>,
  donneesEvenement: c.DonneesDe<E>,
): Promise<R> {
  const evenement = ctx.appareil.creerEvenement(ecriture.evenement, donneesEvenement);
  return ctx.client.executer(ecriture.operation, evenement);
}

describe("les écritures sont des événements compatibles avec le moteur hors ligne (AM-160)", () => {
  it("chaque type d'événement du contrat a exactement une écriture, nommée comme lui", () => {
    const types = LISTE_ECRITURES.map((e) => e.evenement.type).sort();
    expect(types).toEqual(c.EVENEMENTS_AGENCE.map((e) => e.type).sort());
    expect(new Set(LISTE_ECRITURES.map((e) => e.operation.nom)).size).toBe(LISTE_ECRITURES.length);
    for (const e of LISTE_ECRITURES) expect(e.operation.nom).toBe(`agence.${e.evenement.type}`);
  });

  it("chaque écriture est un POST dont le corps est l'événement, idempotent grâce à son UUID", () => {
    for (const e of LISTE_ECRITURES) {
      expect(e.operation.methode).toBe("POST");
      expect(e.operation.idempotente).toBe(true);
      const evenement = { id: "x" } as never;
      expect(e.operation.corps?.(evenement)).toBe(evenement);
    }
  });

  it("le mock des planches couvre toutes les lectures et toutes les écritures", () => {
    const noms = new Set(
      PLANCHES_AGENCE.flatMap((p) => scenarioAgence(p).operations.map((o) => o.operation.nom)),
    );
    for (const op of LECTURES_AGENCE) expect(noms.has(op.nom), op.nom).toBe(true);
    for (const e of LISTE_ECRITURES) expect(noms.has(e.operation.nom), e.operation.nom).toBe(true);
  });

  it("un scénario qui n'est pas de l'agence n'installe rien", () => {
    const scenario = { nom: "Main", operations: [], flux: [] };
    expect(c.EVENEMENTS_AGENCE.length).toBeGreaterThan(30);
    return import("./mock/installer").then(({ installerMockAgence }) => {
      expect(installerMockAgence(scenario, ecrans.Main)).toBe(false);
      expect(scenario.operations).toHaveLength(0);
      expect(installerMockAgence(scenario, ecrans.Guichet)).toBe(true);
      expect(scenario.operations.length).toBeGreaterThan(0);
    });
  });
});

describe("vente au guichet (useVendreBillet)", () => {
  it("envoie un événement avec UUID et numéro de plage, et rafraîchit la lecture", async () => {
    const ctx = contexteTest("Vente");
    const executer = vi.spyOn(ctx.client, "executer");
    const departId = ecrans.Vente.entites.departs![0]!.id;
    const { result } = renderHook(
      () => ({ contexte: useVenteContexte(), vendre: useVendreBillet() }),
      { wrapper: ctx.wrapper },
    );
    await waitFor(() => expect(result.current.contexte.isSuccess).toBe(true));
    expect(result.current.contexte.data?.siege.libres).toBe(9);

    let vente: c.ResultatVente | undefined;
    await act(async () => {
      vente = await result.current.vendre.mutateAsync({
        billetId: "billet-test-1",
        departId,
        siege: 24,
        classe: "classique",
        prix: 4000,
        bagage: 0,
        passager: { nom: "Tchoumi Paul", telephone: "+237677301145", pieceQuatreDerniers: "8820" },
        paiement: CASH,
        codeBillet: "6204",
        sms: true,
      });
    });

    const envoye = executer.mock.calls.find(([op]) => op.nom === "agence.billet.vendu")![1] as {
      id: string;
      numeroPlage: number;
      type: string;
      appareilId: string;
    };
    expect(envoye.id).toMatch(UUID);
    expect(envoye.numeroPlage).toBe(1001);
    expect(envoye).toMatchObject({ type: "billet.vendu", appareilId: "appareil-gu2-dla" });
    expect(c.lireEvenementAgence(envoye)).toMatchObject({ ok: true });
    expect(vente?.accuse).toMatchObject({ evenementId: envoye.id, statut: "accepte" });
    expect(vente?.billet).toMatchObject({
      numero: "ALP-DLA-270105-1001",
      sequence: 1001,
      siege: 24,
      prix: 4000,
      passager: { nom: "Tchoumi Paul" },
    });

    // La lecture est rechargée : un siège de moins, le numéro suivant, un autre siège proposé.
    await waitFor(() => expect(result.current.contexte.data?.siege.libres).toBe(8));
    expect(result.current.contexte.data?.prochainNumero.sequence).toBe(1002);
    expect(result.current.contexte.data?.siege.propose).not.toBe(24);
    expect(result.current.contexte.data?.brouillon).toBeNull();
  });

  it("deux ventes prennent deux numéros consécutifs de la plage du guichet 2", async () => {
    const ctx = contexteTest("Vente");
    const departId = ecrans.Vente.entites.departs![0]!.id;
    const donnees = (
      n: number,
      siege: number,
    ): c.DonneesDe<typeof ECRITURES.billetVendu.evenement> => ({
      billetId: `billet-${n}`,
      departId,
      siege,
      classe: "classique",
      prix: 4000,
      bagage: 0,
      passager: { nom: `Voyageur ${n}`, telephone: null, pieceQuatreDerniers: null },
      paiement: CASH,
      codeBillet: String(1000 + n),
      sms: false,
    });
    const plan = (await ctx.client.executer(OP_VENTE_CONTEXTE, {})).siege.plan.cases;
    const libres = plan.filter((x) => x.etat === "libre").map((x) => x.numero);
    const un = await ecrire(ctx, ECRITURES.billetVendu, donnees(1, libres[0]!));
    const deux = await ecrire(ctx, ECRITURES.billetVendu, donnees(2, libres[1]!));
    expect([un.billet.sequence, deux.billet.sequence]).toEqual([1001, 1002]);
  });

  it("refuse un siège pris (409), un rendu faux (422) et un départ inconnu (404)", async () => {
    const ctx = contexteTest("Vente");
    const departId = ecrans.Vente.entites.departs![0]!.id;
    const base = {
      billetId: "b",
      departId,
      siege: 24,
      classe: "classique" as const,
      prix: 4000,
      bagage: 0,
      passager: { nom: "A", telephone: null, pieceQuatreDerniers: null },
      paiement: CASH,
      codeBillet: "1111",
      sms: false,
    };
    await expect(ecrire(ctx, ECRITURES.billetVendu, { ...base, siege: 1 })).rejects.toMatchObject({
      statut: 409,
      code: "SIEGE_PRIS",
    });
    await expect(
      ecrire(ctx, ECRITURES.billetVendu, { ...base, paiement: { ...CASH, rendu: 500 } }),
    ).rejects.toMatchObject({ statut: 422, code: "PAIEMENT_INVALIDE" });
    await expect(
      ecrire(ctx, ECRITURES.billetVendu, { ...base, departId: "dep-inconnu" }),
    ).rejects.toMatchObject({ statut: 404, code: "DEPART_INCONNU" });
  });

  it("rejouer le même événement ne vend rien de plus (deja_recu)", async () => {
    const ctx = contexteTest("Vente");
    const departId = ecrans.Vente.entites.departs![0]!.id;
    const evenement = ctx.appareil.creerEvenement(ECRITURES.billetVendu.evenement, {
      billetId: "billet-rejoue",
      departId,
      siege: 24,
      classe: "classique",
      prix: 4000,
      bagage: 0,
      passager: { nom: "Tchoumi Paul", telephone: null, pieceQuatreDerniers: null },
      paiement: CASH,
      codeBillet: "6204",
      sms: false,
    });
    const premier = await ctx.client.executer(ECRITURES.billetVendu.operation, evenement);
    const second = await ctx.client.executer(ECRITURES.billetVendu.operation, evenement);
    expect(premier.accuse.statut).toBe("accepte");
    expect(second.accuse.statut).toBe("deja_recu");
    expect(second.billet).toEqual(premier.billet);
    const contexte = await ctx.client.executer(OP_VENTE_CONTEXTE, {});
    expect(contexte.siege.libres).toBe(8);
  });

  it("le serveur refuse un événement mal formé (422) : UUID invalide, plage manquante", async () => {
    const ctx = contexteTest("Vente");
    const evenement = ctx.appareil.creerEvenement(ECRITURES.quaiScanne.evenement, {
      departId: "d",
      qr: "x",
    });
    const mauvais = { ...evenement, id: "pas-un-uuid" };
    await expect(
      ctx.client.executer(ECRITURES.billetVendu.operation, mauvais as never),
    ).rejects.toBeInstanceOf(ErreurHttp);
    await expect(
      ctx.client.executer(ECRITURES.billetVendu.operation, mauvais as never),
    ).rejects.toMatchObject({ statut: 422, code: "EVENEMENT_INVALIDE" });
  });
});

describe("cadence", () => {
  it("vente, SMS et demande d'annulation ; la lecture suit", async () => {
    const ctx = contexteTest("Cadence");
    const { result } = renderHook(
      () => ({
        etat: useCadenceEtat(),
        vendre: useVendreBilletCadence(),
        sms: useAjouterTelephoneBillet(),
        annuler: useDemanderAnnulation(),
      }),
      { wrapper: ctx.wrapper },
    );
    await waitFor(() => expect(result.current.etat.isSuccess).toBe(true));
    const departId = result.current.etat.data!.depart.departId;

    let vendu: c.ResultatCadence | undefined;
    await act(async () => {
      vendu = await result.current.vendre.mutateAsync({
        billetId: "billet-cadence-1",
        departId,
        siege: 19,
        prix: 4000,
        paiement: CASH,
        codeBillet: "9047",
        telephone: null,
      });
    });
    expect(vendu?.billet).toMatchObject({
      numero: "ALP-DLA-270105-1001",
      aCompleterAuQuai: true,
      passager: { nom: null },
    });
    expect(vendu?.placesRestantes).toBe(16);
    await waitFor(() => expect(result.current.etat.data?.vendusEnCadence).toBe(64));
    expect(result.current.etat.data?.dernierBillet).toMatchObject({
      sequence: 1001,
      siege: 19,
      nom: null,
    });
    expect(result.current.etat.data?.prochain.siege).toBe(20);

    await act(async () => {
      await result.current.sms.mutateAsync({
        billetId: "billet-cadence-1",
        telephone: "+237655120000",
      });
    });
    let demande: c.ResultatDemandeAnnulation | undefined;
    await act(async () => {
      demande = await result.current.annuler.mutateAsync({
        demandeId: "dem-1",
        billetId: "billet-cadence-1",
        motif: "Erreur de siège",
      });
    });
    expect(demande?.statut).toBe("en_attente_du_pin");

    await expect(
      ecrire(ctx, ECRITURES.billetTelephoneAjoute, {
        billetId: "inconnu",
        telephone: "+237655120000",
      }),
    ).rejects.toMatchObject({ statut: 404 });
  });
});

describe("quai", () => {
  const QR_TCHOUMI = "AM1:ALP-DLA-270105-0185:6204";
  const QR_AICHA = "AM1:ALP-DLA-270105-0142:7341";

  it("scan, code à 4 chiffres, libérer, liste au chauffeur", async () => {
    const ctx = contexteTest("Quai");
    const departId = ecrans.Quai.entites.departs![0]!.id;
    const absentLibere = (await ctx.client.executer(
      (await import("./operations")).OP_QUAI_EMBARQUEMENT,
      {},
    ))!.absents[1]!;

    const dejaScanne = await ecrire(ctx, ECRITURES.quaiScanne, { departId, qr: QR_AICHA });
    expect(dejaScanne.scan.resultat).toBe("deja_scanne");
    expect(dejaScanne.embarques).toBe(31);

    const monte = await ecrire(ctx, ECRITURES.quaiScanne, { departId, qr: QR_TCHOUMI });
    expect(monte.scan).toMatchObject({ resultat: "monte", voyageur: "Tchoumi Paul", siege: 24 });
    expect(monte.embarques).toBe(32);

    const inconnu = await ecrire(ctx, ECRITURES.quaiCodeSaisi, { departId, codeBillet: "0000" });
    expect(inconnu.scan.resultat).toBe("introuvable");

    const libere = await ecrire(ctx, ECRITURES.quaiLibere, {
      departId,
      billetId: absentLibere.billetId,
      siege: absentLibere.siege,
      motif: "retard",
    });
    expect(libere.siegesLibres).toBe(10);
    await expect(
      ecrire(ctx, ECRITURES.quaiLibere, {
        departId,
        billetId: absentLibere.billetId,
        siege: absentLibere.siege,
        motif: "retard",
      }),
    ).rejects.toMatchObject({ statut: 404 });

    const liste = await ecrire(ctx, ECRITURES.quaiListeEnvoyee, {
      departId,
      embarques: 32,
      capacite: 40,
    });
    expect(liste).toMatchObject({ embarques: 32, chauffeur: { nom: "Mbarga" } });

    const quai = await ctx.client.executer((await import("./operations")).OP_QUAI_EMBARQUEMENT, {});
    expect(quai.absents).toHaveLength(0);
    expect(quai.refuses.nombre).toBe(2);
  });

  it("chaque scan est diffusé sur le canal temps réel de la gare", async () => {
    const ctx = contexteTest("Quai");
    const departId = ecrans.Quai.entites.departs![0]!.id;
    const { result } = renderHook(() => useQuaiDirect({ departId }), { wrapper: ctx.wrapper });
    await waitFor(() => expect(result.current.dernier).toBeDefined());
    await ecrire(ctx, ECRITURES.quaiScanne, { departId, qr: QR_TCHOUMI });
    await waitFor(() => expect(result.current.dernier?.embarques).toBe(32));
    expect(result.current.dernier?.scan).toMatchObject({ resultat: "monte", siege: 24 });
  });

  it("useQuaiEmbarquement se recharge après un scan", async () => {
    const ctx = contexteTest("Quai");
    const departId = ecrans.Quai.entites.departs![0]!.id;
    const { result } = renderHook(
      () => ({ quai: useQuaiEmbarquement(), scanner: useScannerAuQuai() }),
      { wrapper: ctx.wrapper },
    );
    await waitFor(() => expect(result.current.quai.isSuccess).toBe(true));
    await act(async () => {
      await result.current.scanner.mutateAsync({ departId, qr: QR_TCHOUMI });
    });
    await waitFor(() => expect(result.current.quai.data?.embarquement.embarques).toBe(32));
  });

  it("compléter un billet de cadence au quai : le billet devient nominatif", async () => {
    const ctx = contexteTest("CadenceQuai");
    const { result } = renderHook(() => useCompleterBillet(), { wrapper: ctx.wrapper });
    const e = ecrans.CadenceQuai;
    let resultat: c.ResultatCompletion | undefined;
    await act(async () => {
      resultat = await result.current.mutateAsync({
        billetId: e.donnees.scan._billetId,
        departId: e.entites.departs![0]!.id,
        nom: "Ngono Albertine",
        pieceQuatreDerniers: "2210",
        telephone: null,
        embarquer: true,
      });
    });
    expect(resultat).toMatchObject({
      billet: { numero: "ALP-DLA-270105-0232", nom: "Ngono Albertine", embarque: true },
      embarques: 22,
      sansNomRestants: 10,
    });
    await expect(
      ecrire(ctx, ECRITURES.billetComplete, {
        billetId: e.donnees.scan._billetId,
        departId: e.entites.departs![0]!.id,
        nom: "Autre",
        pieceQuatreDerniers: "1234",
        telephone: null,
        embarquer: true,
      }),
    ).rejects.toMatchObject({ statut: 409, code: "DEJA_COMPLETE" });
  });
});

describe("caisse", () => {
  it("compter puis clôturer : l'écart suit le comptage", async () => {
    const ctx = contexteTest("Caisse");
    const sessionId = ecrans.Caisse.entites.sessions![0]!.id;
    const compte = await ecrire(ctx, ECRITURES.caisseComptee, {
      sessionId,
      coupures: [
        { valeur: 10_000, nombre: 48 },
        { valeur: 5000, nombre: 36 },
        { valeur: 2000, nombre: 14 },
        { valeur: 1000, nombre: 6 },
        { valeur: 500, nombre: 3 },
      ],
      pieces: 0,
      total: 695_500,
    });
    expect(compte.session.comptage.total).toBe(695_500);
    expect(compte.session.ecart).toMatchObject({ montant: 0, statut: "exact" });

    await expect(
      ecrire(ctx, ECRITURES.caisseComptee, {
        sessionId,
        coupures: [{ valeur: 10_000, nombre: 1 }],
        pieces: 0,
        total: 5,
      }),
    ).rejects.toMatchObject({ statut: 422, code: "COMPTAGE" });
    await expect(
      ecrire(ctx, ECRITURES.caisseComptee, {
        sessionId,
        coupures: [{ valeur: 300, nombre: 1 }],
        pieces: 0,
        total: 300,
      }),
    ).rejects.toMatchObject({ statut: 422 });

    const cloture = await ecrire(ctx, ECRITURES.caisseCloturee, {
      sessionId,
      cashCompte: 694_500,
      cashAttendu: 695_500,
      ecart: -1000,
      auto: false,
    });
    expect(cloture.session).toMatchObject({
      etat: "cloturee",
      ecart: { montant: -1000, statut: "dans_tolerance" },
    });
    const relue = await ctx.client.executer(OP_CAISSE_SESSION, {});
    expect(relue.etat).toBe("cloturee");
  });

  it("ouvrir une caisse repart d'un comptage vide, avec le fond de caisse", async () => {
    const ctx = contexteTest("Caisse");
    const ouverte = await ecrire(ctx, ECRITURES.caisseOuverte, {
      sessionId: "session-neuve",
      numero: "K-DLA-270105-2-2",
      guichetId: "guichet-alp-dla-2",
      fondDeCaisse: 15_000,
    });
    expect(ouverte.session).toMatchObject({
      numero: "K-DLA-270105-2-2",
      etat: "ouverte",
      fondDeCaisse: 15_000,
      cashAttendu: 15_000,
      comptage: { total: 0 },
    });
    expect(ouverte.session.ecart.montant).toBe(-15_000);
  });

  it("useCaisseSession suit les écritures", async () => {
    const ctx = contexteTest("Caisse");
    const { result } = renderHook(() => useCaisseSession(), { wrapper: ctx.wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.etat).toBe("ouverte");
  });
});

describe("colis et dépôt", () => {
  it("enregistrer un colis prend un numéro de colis dans la plage", async () => {
    const ctx = contexteTest("GuichetColis");
    const formulaire = await ctx.client.executer(OP_COLIS_FORMULAIRE, {});
    const resultat = await ecrire(ctx, ECRITURES.colisEnregistre, {
      colisId: "colis-test",
      departId: formulaire.departs[0]!.departId,
      expediteur: { nom: "Ngo Aïcha", telephone: "+237691221008" },
      destinataire: { nom: "Ngo Thérèse", telephone: "+237699401822" },
      contenu: "Médicaments, vêtements",
      poidsKg: 2,
      valeurDeclaree: 25_000,
      assure: true,
      photoRef: "photo-1",
      paiement: { mode: "cash", montant: 2000 },
    });
    expect(resultat.colis).toMatchObject({
      numero: "C-DLA-270105-1001",
      sequence: 1001,
      etat: "enregistre",
      prixTotal: 2000,
    });
    const apres = await ctx.client.executer(OP_COLIS_FORMULAIRE, {});
    expect(apres.prochainNumero.sequence).toBe(1002);
    await expect(
      ecrire(ctx, ECRITURES.colisEnregistre, {
        colisId: "colis-test-2",
        departId: "dep-inconnu",
        expediteur: { nom: "A", telephone: "+237691221008" },
        destinataire: { nom: "B", telephone: "+237699401822" },
        contenu: "x",
        poidsKg: 1,
        valeurDeclaree: 1000,
        assure: false,
        photoRef: "p",
        paiement: { mode: "cash", montant: 1500 },
      }),
    ).rejects.toMatchObject({ statut: 404 });
  });

  it("accepter un dépôt prépayé : un dépassement de poids exige un complément", async () => {
    const ctx = contexteTest("Depot");
    const colisId = ecrans.Depot.entites.colis![0]!.id;
    await expect(
      ecrire(ctx, ECRITURES.colisDepose, {
        colisId,
        poidsReleveKg: 3.4,
        photoRef: "photo-2",
        complement: 0,
      }),
    ).rejects.toMatchObject({ statut: 422, code: "COMPLEMENT_REQUIS" });
    const accepte = await ecrire(ctx, ECRITURES.colisDepose, {
      colisId,
      poidsReleveKg: 3.4,
      photoRef: "photo-2",
      complement: 500,
    });
    expect(accepte.complementDemande).toBe(500);
    expect(accepte.colis.prixTotal).toBe(2700);
    const simple = await ecrire(ctx, ECRITURES.colisDepose, {
      colisId,
      poidsReleveKg: 2.1,
      photoRef: "photo-3",
      complement: 0,
    });
    expect(simple.complementDemande).toBe(0);
  });
});

describe("à bord : convoyeur, chauffeur, contrôleur", () => {
  it("convoyeur : vente en route numérotée, scan, colis déchargés, incident", async () => {
    const ctx = contexteTest("Convoyeur");
    const departId = ecrans.Convoyeur.entites.departs![0]!.id;
    const vente = await ecrire(ctx, ECRITURES.routeBilletVendu, {
      billetId: "billet-route-1",
      departId,
      arretMontee: "Pouma",
      arretDescente: "Yaoundé Mvan",
      siege: 36,
      prix: 4500,
      passager: { nom: "Mballa J.", telephone: "+237655000000" },
      paiement: { mode: "cash", recu: 5000, rendu: 500, reference: null },
      codeBillet: "1183",
      gps: { latitude: 3.9, longitude: 10.1, precisionM: 15 },
    });
    expect(vente.billet).toMatchObject({
      numero: "ALP-DLA-270105-1001",
      siege: 36,
      smsEnvoye: true,
    });
    expect(vente.ventesEnRoute).toEqual({ nombre: 3, montant: 13_500 });

    const scan = await ecrire(ctx, ECRITURES.routeScanne, {
      departId,
      arret: "Pouma",
      qr: "AM1:ALP-DLA-270105-0142:7341",
    });
    expect(scan.scannesABord).toBe(34);

    const decharge = await ecrire(ctx, ECRITURES.routeColisDecharges, {
      departId,
      arret: "Pouma",
      colisIds: ["c1", "c2"],
    });
    expect(decharge.colisRestants).toBe(4);
    await expect(
      ecrire(ctx, ECRITURES.routeColisDecharges, {
        departId,
        arret: "Pouma",
        colisIds: ["a", "b", "c", "d", "e"],
      }),
    ).rejects.toMatchObject({ statut: 409 });

    const incident = await ecrire(ctx, ECRITURES.chauffeurIncident, {
      incidentId: "inc-1",
      departId,
      nature: "panne",
      gps: null,
      note: null,
    });
    expect(incident).toMatchObject({ voyageursPrevenus: 34, garePrevenue: true });
  });

  it("chauffeur : dépense avec justificatif, retard, arrivée à l'arrêt", async () => {
    const ctx = contexteTest("Chauffeur");
    const departId = ecrans.Chauffeur.entites.departs![0]!.id;
    const depense = await ecrire(ctx, ECRITURES.chauffeurDepense, {
      depenseId: "depense-test",
      departId,
      categorie: "autre",
      libelle: "Parking Pouma",
      montant: 500,
      justificatifRef: "photo-9",
    });
    expect(depense.totalDepenses).toBe(46_500);
    expect(depense.depense).toMatchObject({ categorie: "autre", justificatif: true });

    const retard = await ecrire(ctx, ECRITURES.chauffeurRetard, { departId, minutes: 20 });
    expect(retard.voyageursPrevenus).toBe(33);

    await expect(
      ecrire(ctx, ECRITURES.chauffeurArriveeArret, { departId, arret: "Boumnyebel", gps: null }),
    ).rejects.toMatchObject({ statut: 409 });
    await ecrire(ctx, ECRITURES.chauffeurArriveeArret, { departId, arret: "Pouma", gps: null });
  });

  it("contrôleur : régulariser le voyageur sans billet puis clore le contrôle", async () => {
    const ctx = contexteTest("Controleur");
    const departId = ecrans.Controleur.entites.departs![0]!.id;
    const { controleId } = await ctx.client.executer(OP_CONTROLE_INOPINE, {});

    const regularise = await ecrire(ctx, ECRITURES.controleRegularise, {
      controleId,
      billetId: "billet-regularise",
      departId,
      siege: 7,
      prix: 4000,
      paiement: CASH,
      codeBillet: "4471",
      passager: { nom: null, pieceQuatreDerniers: null },
    });
    expect(regularise.billet).toMatchObject({ numero: "ALP-DLA-270105-1001", prix: 4000 });
    expect(regularise.controle.comptes).toEqual({ liste: 36, tetes: 36, ecart: 0 });
    const apres = await ctx.client.executer(OP_CONTROLE_INOPINE, {});
    expect(apres.sansBillet).toBeNull();
    expect(apres.sieges.find((s) => s.numero === 7)?.constat).toBe("scanne");

    await expect(
      ecrire(ctx, ECRITURES.controleConvoyeurSignale, {
        controleId: "autre",
        departId,
        convoyeurId: "pers-alain-b",
        siege: 7,
        montantDeclare: 4000,
        note: null,
      }),
    ).rejects.toMatchObject({ statut: 404 });

    const cloture = await ecrire(ctx, ECRITURES.controleCloture, {
      controleId,
      departId,
      liste: 36,
      tetes: 36,
      ecart: 0,
    });
    expect(cloture.controle).toMatchObject({ clos: true, envoyeAuPatron: true });
    await expect(
      ecrire(ctx, ECRITURES.controleSiegeVerifie, {
        controleId,
        departId,
        siege: 3,
        constat: "scanne",
      }),
    ).rejects.toMatchObject({ statut: 409, code: "CONTROLE_CLOS" });
  });
});

describe("supervision : tout passe par le PIN d'un superviseur", () => {
  it("valider une clôture : refusé sans superviseur (403), puis accepté, une seule fois", async () => {
    const ctx = contexteTest("SuperviseurValider");
    const sessionId = ecrans.SuperviseurValider.entites.sessions![0]!.id;
    await expect(
      ecrire(ctx, ECRITURES.caisseValidee, {
        sessionId,
        ecart: -1000,
        commentaire: null,
        validePar: { ...PREUVE, superviseurId: "pers-joseph" },
      }),
    ).rejects.toMatchObject({ statut: 403, code: "SUPERVISEUR_REQUIS" });
    await expect(
      ecrire(ctx, ECRITURES.caisseValidee, {
        sessionId,
        ecart: -500,
        commentaire: null,
        validePar: PREUVE,
      }),
    ).rejects.toMatchObject({ statut: 422, code: "ECART_DIFFERENT" });

    const validee = await ecrire(ctx, ECRITURES.caisseValidee, {
      sessionId,
      ecart: -1000,
      commentaire: "Recompté avec Joseph",
      validePar: PREUVE,
    });
    expect(validee.session).toEqual({ sessionId, etat: "validee", ecart: -1000 });
    await expect(
      ecrire(ctx, ECRITURES.caisseRefusee, { sessionId, motif: null, validePar: PREUVE }),
    ).rejects.toMatchObject({ statut: 409, code: "TRANSITION_INTERDITE" });
  });

  it("refuser une clôture rouvre la session", async () => {
    const ctx = contexteTest("SuperviseurValider");
    const sessionId = ecrans.SuperviseurValider.entites.sessions![0]!.id;
    const refusee = await ecrire(ctx, ECRITURES.caisseRefusee, {
      sessionId,
      motif: "Recompter",
      validePar: PREUVE,
    });
    expect(refusee.session.etat).toBe("ouverte");
  });

  it("décider une annulation : le billet garde son numéro et passe à « annulé »", async () => {
    const ctx = contexteTest("SuperviseurVoir");
    const billetId = ecrans.SuperviseurVoir.entites.billets![0]!.id;
    const demandeId = `dem-annulation-${billetId}`;
    await expect(
      ecrire(ctx, ECRITURES.annulationDecidee, {
        demandeId,
        billetId,
        decision: "rembourser",
        montant: 4000,
        validePar: { ...PREUVE, superviseurId: "pers-marie" },
      }),
    ).rejects.toMatchObject({ statut: 403 });
    await expect(
      ecrire(ctx, ECRITURES.annulationDecidee, {
        demandeId,
        billetId,
        decision: "rembourser",
        montant: 9000,
        validePar: PREUVE,
      }),
    ).rejects.toMatchObject({ statut: 422, code: "MONTANT_TROP_ELEVE" });

    const annulation = await ecrire(ctx, ECRITURES.annulationDecidee, {
      demandeId,
      billetId,
      decision: "rembourser",
      montant: 4000,
      validePar: PREUVE,
    });
    expect(annulation).toMatchObject({
      billet: { numero: "ALP-DLA-270105-0171", etat: "annule" },
      decision: "rembourser",
      montant: 4000,
      siegeLibere: true,
    });
    await expect(
      ecrire(ctx, ECRITURES.annulationDecidee, {
        demandeId,
        billetId,
        decision: "refuser",
        montant: 0,
        validePar: PREUVE,
      }),
    ).rejects.toMatchObject({ statut: 409, code: "DEJA_DECIDEE" });
  });

  it("refuser ou reporter ne touche pas au numéro", async () => {
    const ctx = contexteTest("SuperviseurVoir");
    const billetId = ecrans.SuperviseurVoir.entites.billets![0]!.id;
    const refus = await ecrire(ctx, ECRITURES.annulationDecidee, {
      demandeId: `dem-annulation-${billetId}`,
      billetId,
      decision: "refuser",
      montant: 0,
      validePar: PREUVE,
    });
    expect(refus).toMatchObject({ billet: { etat: "paye" }, siegeLibere: false });
  });

  it("équipe : PIN provisoire, affectation, déblocage, désactivation", async () => {
    const ctx = contexteTest("SuperviseurEquipe");
    const pin = await ecrire(ctx, ECRITURES.equipePinRenouvele, {
      personneId: "pers-joseph",
      validePar: PREUVE,
    });
    // Le PIN provisoire part par SMS ; il n'est jamais renvoyé ni affiché.
    expect(pin.personne).toEqual({
      personneId: "pers-joseph",
      actif: true,
      pin: "a_renouveler",
      smsProvisoireEnvoye: true,
    });
    expect(Object.keys(pin.personne).sort()).toEqual([
      "actif",
      "personneId",
      "pin",
      "smsProvisoireEnvoye",
    ]);

    await ecrire(ctx, ECRITURES.equipeAffectationChangee, {
      personneId: "pers-joseph",
      guichetId: "guichet-alp-dla-1",
      role: null,
      validePar: PREUVE,
    });
    await expect(
      ecrire(ctx, ECRITURES.equipePersonneDebloquee, {
        personneId: "pers-marie",
        validePar: PREUVE,
      }),
    ).rejects.toMatchObject({ statut: 409, code: "COMPTE_NON_BLOQUE" });
    const debloquee = await ecrire(ctx, ECRITURES.equipePersonneDebloquee, {
      personneId: "pers-pauline",
      validePar: PREUVE,
    });
    expect(debloquee.personne).toMatchObject({ pin: "ok", actif: true });
    const desactivee = await ecrire(ctx, ECRITURES.equipeCompteDesactive, {
      personneId: "pers-marie",
      validePar: PREUVE,
    });
    expect(desactivee.personne.actif).toBe(false);
    await expect(
      ecrire(ctx, ECRITURES.equipePinRenouvele, { personneId: "pers-inconnue", validePar: PREUVE }),
    ).rejects.toMatchObject({ statut: 404 });

    const equipe = await ctx.client.executer(
      (await import("./operations")).OP_SUPERVISEUR_EQUIPE,
      {},
    );
    expect(equipe.effectif).toBe(8);
    expect(equipe.enService.find((p) => p.personneId === "pers-joseph")?.affectation).toBe(
      "guichet 1",
    );
    expect(equipe.enService.find((p) => p.personneId === "pers-pauline")?.statut).toBe(
      "en_service",
    );
  });

  it("débloquer un appareil : synchroniser, ou 4 h de plus", async () => {
    const ctx = contexteTest("SuperviseurDebloquer");
    const quatreHeures = await ecrire(ctx, ECRITURES.appareilDebloque, {
      appareilId: "appareil-gu3-dla",
      option: "debloquer_4h",
      validePar: PREUVE,
    });
    expect(quatreHeures.appareil).toEqual({
      id: "appareil-gu3-dla",
      etat: "debloque_temporairement",
      debloqueJusqua: "2027-01-05T18:00:00.000+01:00",
      ventesSynchronisees: 0,
    });
    const synchro = await ecrire(ctx, ECRITURES.appareilDebloque, {
      appareilId: "appareil-gu3-dla",
      option: "synchroniser",
      validePar: PREUVE,
    });
    expect(synchro.appareil).toMatchObject({ etat: "en_ligne", ventesSynchronisees: 26 });
    await expect(
      ecrire(ctx, ECRITURES.appareilDebloque, {
        appareilId: "appareil-inconnu",
        option: "synchroniser",
        validePar: PREUVE,
      }),
    ).rejects.toMatchObject({ statut: 404 });
  });
});

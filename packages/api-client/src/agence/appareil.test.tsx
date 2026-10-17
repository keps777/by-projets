// @vitest-environment jsdom
import { agence as c } from "@afrimove/contrats";
import { PlageEpuisee, plageGuichet } from "@afrimove/domain";
import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { creerClientMock, creerHorlogeManuelle, FournisseurApi } from "../infra/index";
import { creerAppareilAgence, useAppareilAgence } from "./appareil";
import { ECRITURES } from "./operations";
import { uuidsSequentiels } from "./outils-test";

afterEach(cleanup);

const DEBUT = "2027-01-05T08:11:00.000+01:00";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const VENTE = {
  billetId: "b1",
  departId: "d1",
  siege: 24,
  classe: "classique" as const,
  prix: 4000,
  bagage: 0,
  passager: { nom: "Tchoumi Paul", telephone: null, pieceQuatreDerniers: null },
  paiement: { mode: "cash" as const, recu: 5000, rendu: 1000, reference: null },
  codeBillet: "6204",
  sms: false,
};
const COLIS = {
  colisId: "c1",
  departId: "d2",
  expediteur: { nom: "Ngo Aïcha", telephone: "+237691221008" },
  destinataire: { nom: "Ngo Thérèse", telephone: "+237699401822" },
  contenu: "Médicaments",
  poidsKg: 2,
  valeurDeclaree: 25_000,
  assure: true,
  photoRef: "photo-1",
  paiement: { mode: "cash" as const, montant: 2000 },
};

function appareil(options: { plage?: { debut: number; fin: number }; uuids?: boolean } = {}) {
  const horloge = creerHorlogeManuelle(DEBUT);
  return creerAppareilAgence({
    appareilId: "appareil-gu2-dla",
    auteurId: "pers-joseph",
    agence: "ALP",
    gare: "DLA",
    plage: options.plage ?? plageGuichet(2),
    horloge,
    ...(options.uuids === false ? {} : { genererUuid: uuidsSequentiels() }),
  });
}

describe("appareil : l'événement est créé sur l'appareil", () => {
  it("donne à chaque écriture un UUID, l'heure de Douala, l'appareil et l'auteur", () => {
    const a = appareil();
    const evenement = a.creerEvenement(ECRITURES.billetTelephoneAjoute.evenement, {
      billetId: "b1",
      telephone: "+237655120000",
    });
    expect(evenement.id).toMatch(UUID);
    expect(evenement).toMatchObject({
      type: "billet.telephone_ajoute",
      at: DEBUT,
      appareilId: "appareil-gu2-dla",
      auteurId: "pers-joseph",
      cible: { type: "billet", id: "b1" },
      numeroPlage: null,
    });
    expect(c.lireEvenementAgence(evenement)).toMatchObject({ ok: true });
  });

  it("deux événements n'ont jamais le même identifiant, même avec l'UUID du système", () => {
    const a = appareil({ uuids: false });
    const ids = Array.from(
      { length: 50 },
      () =>
        a.creerEvenement(ECRITURES.quaiScanne.evenement, { departId: "d1", qr: "AM1:x:1234" }).id,
    );
    expect(new Set(ids).size).toBe(50);
    for (const id of ids) expect(id).toMatch(UUID);
  });

  it("prend les numéros de billet dans la plage de l'appareil, un par un, sans trou", () => {
    const a = appareil();
    const numeros = [1, 2, 3].map(
      () => a.creerEvenement(ECRITURES.billetVendu.evenement, VENTE).numeroPlage,
    );
    expect(numeros).toEqual([1001, 1002, 1003]);
    expect(a.billetsRestants()).toBe(1999 - 1003);
    const plage = plageGuichet(2);
    for (const n of numeros) expect(n >= plage.debut && n <= plage.fin).toBe(true);
  });

  it("une vente de cadence, une vente en route et une régularisation prennent aussi un numéro", () => {
    const a = appareil();
    const cadence = a.creerEvenement(ECRITURES.billetVenduCadence.evenement, {
      billetId: "b2",
      departId: "d1",
      siege: 19,
      prix: 4000,
      paiement: VENTE.paiement,
      codeBillet: "9047",
      telephone: null,
    });
    const route = a.creerEvenement(ECRITURES.routeBilletVendu.evenement, {
      billetId: "b3",
      departId: "d1",
      arretMontee: "Pouma",
      arretDescente: "Yaoundé Mvan",
      siege: 36,
      prix: 4500,
      passager: { nom: null, telephone: null },
      paiement: VENTE.paiement,
      codeBillet: "1183",
      gps: null,
    });
    expect([cadence.numeroPlage, route.numeroPlage]).toEqual([1001, 1002]);
  });

  it("les colis ont leur propre compteur dans la même plage", () => {
    const a = appareil();
    a.creerEvenement(ECRITURES.billetVendu.evenement, VENTE);
    const colis = a.creerEvenement(ECRITURES.colisEnregistre.evenement, COLIS);
    expect(colis.numeroPlage).toBe(1001);
    expect(a.numeroDe(colis)).toBe("C-DLA-270105-1001");
  });

  it("calcule le numéro de document d'un billet : AGENCE-GARE-AAMMJJ-NNNN", () => {
    const a = appareil();
    const evenement = a.creerEvenement(ECRITURES.billetVendu.evenement, VENTE);
    expect(a.numeroDe(evenement)).toBe("ALP-DLA-270105-1001");
    const sansNumero = a.creerEvenement(ECRITURES.quaiScanne.evenement, {
      departId: "d1",
      qr: "AM1:x:1234",
    });
    expect(a.numeroDe(sansNumero)).toBeNull();
  });

  it("refuse de dépasser la plage : il faut en demander une nouvelle", () => {
    const a = appareil({ plage: { debut: 1, fin: 2 } });
    a.creerEvenement(ECRITURES.billetVendu.evenement, VENTE);
    a.creerEvenement(ECRITURES.billetVendu.evenement, VENTE);
    expect(() => a.creerEvenement(ECRITURES.billetVendu.evenement, VENTE)).toThrow(PlageEpuisee);
  });

  it("reprend la numérotation après un redémarrage grâce à l'état exporté", () => {
    const a = appareil();
    a.creerEvenement(ECRITURES.billetVendu.evenement, VENTE);
    a.creerEvenement(ECRITURES.billetVendu.evenement, VENTE);
    const etat = a.exporterEtat();
    const horloge = creerHorlogeManuelle(DEBUT);
    const reprise = creerAppareilAgence({
      appareilId: "appareil-gu2-dla",
      auteurId: "pers-joseph",
      agence: "ALP",
      gare: "DLA",
      plage: plageGuichet(2),
      horloge,
      etat,
    });
    expect(reprise.creerEvenement(ECRITURES.billetVendu.evenement, VENTE).numeroPlage).toBe(1003);
  });

  it("le numéro repart de zéro le lendemain", () => {
    const horloge = creerHorlogeManuelle(DEBUT);
    const a = creerAppareilAgence({
      appareilId: "appareil-gu2-dla",
      auteurId: "pers-joseph",
      agence: "ALP",
      gare: "DLA",
      plage: plageGuichet(2),
      horloge,
    });
    a.creerEvenement(ECRITURES.billetVendu.evenement, VENTE);
    void horloge.avancer(24 * 3600 * 1000);
    expect(a.creerEvenement(ECRITURES.billetVendu.evenement, VENTE).numeroPlage).toBe(1001);
  });
});

describe("useAppareilAgence", () => {
  it("avec le mock et sans fournisseur : l'appareil de démonstration (guichet 2, Joseph)", () => {
    const client = creerClientMock({ latenceMs: 0 });
    const { result } = renderHook(() => useAppareilAgence(), {
      wrapper: ({ children }) => <FournisseurApi client={client}>{children}</FournisseurApi>,
    });
    expect(result.current).toMatchObject({
      appareilId: "appareil-gu2-dla",
      auteurId: "pers-joseph",
      plage: plageGuichet(2),
    });
  });
});

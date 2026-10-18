// @vitest-environment jsdom
import { agence as c } from "@afrimove/contrats";
import { plageGuichet } from "@afrimove/domain";
import { cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { creerClientHttp, creerHorlogeManuelle, FournisseurApi } from "../infra/index";
import {
  CLE_APPAREIL,
  appareilDepuisStockage,
  lireProvisionnement,
  useAppareilAgence,
} from "./appareil";
import { ECRITURES } from "./operations";

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

const DEBUT = "2027-01-05T08:11:00.000+01:00";

const PROVISIONNEMENT = {
  appareilId: "guichet-2",
  auteurId: "pers-2",
  agence: "DEM",
  gare: "DLA",
  plage: plageGuichet(2),
};

function installer(etat?: unknown) {
  window.localStorage.setItem(CLE_APPAREIL, JSON.stringify({ ...PROVISIONNEMENT, etat }));
}

const VENTE = {
  billetId: "b1",
  departId: "d1",
  siege: 24,
  classe: "classique" as const,
  prix: 8000,
  bagage: 0,
  passager: { nom: "Tchoumi Paul", telephone: null, pieceQuatreDerniers: null },
  paiement: { mode: "cash" as const, recu: 8000, rendu: 0, reference: null },
  codeBillet: "6204",
  sms: false,
};

function vendre(a: NonNullable<ReturnType<typeof appareilDepuisStockage>>) {
  return a.creerEvenement(ECRITURES.billetVendu.evenement, VENTE) as c.EvenementDe<
    typeof ECRITURES.billetVendu.evenement
  >;
}

describe("appareil installé sur le téléphone (adaptateur HTTP, recette AM-181)", () => {
  it("rend null tant que l'appareil n'est pas installé, ou si l'installation est incomplète", () => {
    const horloge = creerHorlogeManuelle(DEBUT);
    expect(appareilDepuisStockage(horloge)).toBeNull();
    window.localStorage.setItem(CLE_APPAREIL, JSON.stringify({ appareilId: "x" }));
    expect(appareilDepuisStockage(horloge)).toBeNull();
    window.localStorage.setItem(CLE_APPAREIL, "{pas du json");
    expect(lireProvisionnement()).toBeNull();
  });

  it("numérote dans la plage du guichet, sans trou, et garde le compteur après chaque événement", () => {
    installer();
    const horloge = creerHorlogeManuelle(DEBUT);
    const a = appareilDepuisStockage(horloge)!;
    const numeros = [vendre(a).numeroPlage, vendre(a).numeroPlage, vendre(a).numeroPlage];
    expect(numeros).toEqual([1001, 1002, 1003]);
    // Le compteur est dans le stockage dès le premier événement : c'est ce qui survit à un rechargement.
    const garde = lireProvisionnement();
    expect(Object.values(garde?.etat?.billets ?? {})).toEqual([1004]);
  });

  it("un rechargement de la page ne reprend aucun numéro déjà imprimé", () => {
    installer();
    const horloge = creerHorlogeManuelle(DEBUT);
    const avant = appareilDepuisStockage(horloge)!;
    expect(vendre(avant).numeroPlage).toBe(1001);
    expect(vendre(avant).numeroPlage).toBe(1002);
    // Nouvelle page : un nouvel appareil relit le stockage.
    const apres = appareilDepuisStockage(horloge)!;
    expect(vendre(apres).numeroPlage).toBe(1003);
  });

  it("un téléphone neuf aligné sur le numéro du serveur le garde après un rechargement (recette A9)", () => {
    installer(); // aucun compteur : appareil neuf
    const horloge = creerHorlogeManuelle(DEBUT);
    const neuf = appareilDepuisStockage(horloge)!;
    // Le guichet a déjà vendu 1001 à 1013 : l'écran de vente annonce 1014.
    neuf.aligner("billet", 1014);
    expect(Object.values(lireProvisionnement()?.etat?.billets ?? {})).toEqual([1014]);
    expect(vendre(neuf).numeroPlage).toBe(1014);
    const recharge = appareilDepuisStockage(horloge)!;
    expect(vendre(recharge).numeroPlage).toBe(1015);
    // Une annonce plus ancienne que le compteur ne le fait pas reculer, et n'écrit rien.
    recharge.aligner("billet", 1003);
    expect(vendre(recharge).numeroPlage).toBe(1016);
  });

  it("garde l'identité de l'appareil et de la personne connectée dans chaque événement", () => {
    installer();
    const a = appareilDepuisStockage(creerHorlogeManuelle(DEBUT))!;
    const e = vendre(a);
    expect(e.appareilId).toBe("guichet-2");
    expect(e.auteurId).toBe("pers-2");
    expect(a.numeroDe(e)).toBe("DEM-DLA-270105-1001");
  });

  it("useAppareilAgence avec l'adaptateur HTTP : l'appareil installé, partagé par tous les hooks (un seul compteur)", () => {
    installer();
    const client = creerClientHttp({
      urlBase: "https://api.test",
      fetch: async () => new Response("{}"),
    });
    const wrapper = ({ children }: { children?: ReactNode }) => (
      <FournisseurApi client={client}>{children}</FournisseurApi>
    );
    const un = renderHook(() => useAppareilAgence(), { wrapper }).result.current;
    const deux = renderHook(() => useAppareilAgence(), { wrapper }).result.current;
    expect(un).toBe(deux);
    expect(un.appareilId).toBe("guichet-2");
    const numeros = [
      un.creerEvenement(ECRITURES.billetVendu.evenement, VENTE).numeroPlage,
      deux.creerEvenement(ECRITURES.billetVendu.evenement, VENTE).numeroPlage,
    ];
    expect(numeros).toEqual([1001, 1002]);
  });

  it("useAppareilAgence avec l'adaptateur HTTP lève une erreur claire si l'appareil n'est pas installé (jamais d'appareil inventé)", () => {
    const client = creerClientHttp({
      urlBase: "https://api.test",
      fetch: async () => new Response("{}"),
    });
    expect(() =>
      renderHook(() => useAppareilAgence(), {
        wrapper: ({ children }: { children?: ReactNode }) => (
          <FournisseurApi client={client}>{children}</FournisseurApi>
        ),
      }),
    ).toThrow(/installer l'appareil/);
  });
});

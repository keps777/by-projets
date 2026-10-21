import { CLE_JETON, agence } from "@afrimove/api-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLE_APPAREIL_ID, CLES_CONSERVEES } from "@/kiosque/etat";
import type { Enrolement, Moi } from "./api";
import {
  CLE_APPAREIL_ENROLE,
  CLE_JETON_EXPIRE,
  EVENEMENT_APPAREIL,
  entetesAppareil,
  jetonExpire,
  lireAppareilEnrole,
  memoriserEnrolement,
  memoriserJeton,
  oublierJeton,
  provisionnerVente,
} from "./stockage";

const ENROLEMENT: Enrolement = {
  appareilId: "appareil-dla-g1-ab12cd34",
  secret: "apd_secret-de-l-appareil",
  compagnieId: "c-1",
  gareId: "g-1",
  libelle: "Guichet 1",
  agence: "DEM",
  gare: "DLA",
  genre: "guichet",
  rang: 1,
  plage: { debut: 1, fin: 999 },
};

const MOI: Moi = {
  id: "personne-1",
  role: "guichetier",
  compagnieId: "c-1",
  gareId: "g-1",
  peutVendre: true,
  accesPatron: false,
};

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("enrôlement gardé sur l'appareil", () => {
  it("garde l'identité, le secret et l'identifiant qui survivra à un effacement", () => {
    const evenement = vi.fn();
    window.addEventListener(EVENEMENT_APPAREIL, evenement);
    memoriserEnrolement(ENROLEMENT);
    window.removeEventListener(EVENEMENT_APPAREIL, evenement);
    expect(lireAppareilEnrole()).toMatchObject({
      appareilId: ENROLEMENT.appareilId,
      secret: ENROLEMENT.secret,
      agence: "DEM",
      gare: "DLA",
      plage: { debut: 1, fin: 999 },
    });
    expect(localStorage.getItem(CLE_APPAREIL_ID)).toBe(ENROLEMENT.appareilId);
    expect(CLES_CONSERVEES).toContain(CLE_APPAREIL_ID);
    expect(evenement).toHaveBeenCalledTimes(1);
  });

  it("prouve l'appareil par son secret, et n'envoie rien tant qu'il n'est pas enrôlé", () => {
    expect(entetesAppareil()).toEqual({});
    memoriserEnrolement(ENROLEMENT);
    expect(entetesAppareil()).toEqual({ Authorization: `Bearer ${ENROLEMENT.secret}` });
  });

  it("ignore un enrôlement abîmé", () => {
    localStorage.setItem(CLE_APPAREIL_ENROLE, "{pas du json");
    expect(lireAppareilEnrole()).toBeNull();
    localStorage.setItem(CLE_APPAREIL_ENROLE, JSON.stringify({ appareilId: "x" }));
    expect(lireAppareilEnrole()).toBeNull();
  });

  it("un nouvel enrôlement repart d'un compteur de numéros neuf", () => {
    localStorage.setItem(agence.CLE_APPAREIL, "ancien");
    memoriserEnrolement(ENROLEMENT);
    expect(localStorage.getItem(agence.CLE_APPAREIL)).toBeNull();
  });
});

describe("jeton", () => {
  it("garde le jeton et sa fin de validité", () => {
    memoriserJeton("jwt", 3600, 1_000_000);
    expect(localStorage.getItem(CLE_JETON)).toBe("jwt");
    expect(localStorage.getItem(CLE_JETON_EXPIRE)).toBe(String(1_000_000 + 3_600_000));
    expect(jetonExpire(1_000_000 + 3_599_999)).toBe(false);
    expect(jetonExpire(1_000_000 + 3_600_000)).toBe(true);
  });

  it("n'expire pas sans jeton, ni sans date de fin", () => {
    expect(jetonExpire(Number.MAX_SAFE_INTEGER)).toBe(false);
    localStorage.setItem(CLE_JETON, "jwt");
    expect(jetonExpire(Number.MAX_SAFE_INTEGER)).toBe(false);
  });

  it("l'oubli retire le jeton et sa date", () => {
    memoriserJeton("jwt", 60, 0);
    oublierJeton();
    expect(localStorage.getItem(CLE_JETON)).toBeNull();
    expect(localStorage.getItem(CLE_JETON_EXPIRE)).toBeNull();
  });
});

describe("identité de vente", () => {
  it("compose l'identité que le moteur de vente lit : le téléphone et la personne connectée", () => {
    const appareil = memoriserEnrolement(ENROLEMENT);
    expect(provisionnerVente(appareil, MOI)).toBe(true);
    expect(agence.lireProvisionnement()).toEqual({
      appareilId: ENROLEMENT.appareilId,
      auteurId: "personne-1",
      agence: "DEM",
      gare: "DLA",
      plage: { debut: 1, fin: 999 },
    });
  });

  it("garde le compteur déjà avancé quand le même téléphone change de personne", () => {
    const appareil = memoriserEnrolement(ENROLEMENT);
    provisionnerVente(appareil, MOI);
    const brut = JSON.parse(localStorage.getItem(agence.CLE_APPAREIL) ?? "{}") as object;
    const etat = { prochain: 42 };
    localStorage.setItem(agence.CLE_APPAREIL, JSON.stringify({ ...brut, etat }));
    provisionnerVente(appareil, { ...MOI, id: "personne-2" });
    const apres = JSON.parse(localStorage.getItem(agence.CLE_APPAREIL) ?? "{}") as {
      auteurId: string;
      etat?: unknown;
    };
    expect(apres.auteurId).toBe("personne-2");
    expect(apres.etat).toEqual(etat);
  });

  it("ne fait rien sans téléphone enrôlé, sans plage ou sans codes agence et gare", () => {
    expect(provisionnerVente(null, MOI)).toBe(false);
    const sansPlage = memoriserEnrolement({
      ...ENROLEMENT,
      genre: "autre",
      rang: null,
      plage: null,
    });
    expect(provisionnerVente(sansPlage, MOI)).toBe(false);
    const sansGare = memoriserEnrolement({ ...ENROLEMENT, gare: null });
    expect(provisionnerVente(sansGare, MOI)).toBe(false);
    expect(agence.lireProvisionnement()).toBeNull();
  });
});

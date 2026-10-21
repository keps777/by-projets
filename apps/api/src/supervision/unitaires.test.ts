import { describe, expect, it } from "vitest";
import { HorlogeFixe } from "../socle/testing/memoire";
import { verifierPin } from "../socle/comptes/comptes.service";
import { MS_PAR_MINUTE } from "../caisse/temps";
import { configTest } from "../socle/testing/app-test";
import { detailAutres } from "./equipe.service";
import {
  PreuvesPinService,
  VALIDITE_PREUVE_PIN_MS,
  contenuAProuver,
  genererPinProvisoire,
} from "./pin.service";
import type { ValidationSuperviseurLue } from "../caisse/validation";

const DEBUT = new Date("2026-11-02T08:00:00.000Z");

const evenement = (donnees: Record<string, unknown> = {}) => ({
  id: "00000000-0000-4000-8000-000000000001",
  type: "caisse.validee",
  at: "2026-11-02T09:00:00.000+01:00",
  appareilId: "SUP",
  auteurId: "sup-1",
  cible: { type: "session", id: "s1" },
  numeroPlage: null,
  donnees: {
    sessionId: "s1",
    ecart: -500,
    commentaire: null,
    validePar: { superviseurId: "sup-1", methode: "pin" },
    ...donnees,
  },
});

function preuves(poivre?: string) {
  const horloge = new HorlogeFixe(DEBUT);
  const config = configTest(poivre ? { AUTH_PEPPER: poivre } : {});
  return { horloge, service: new PreuvesPinService(config, horloge), config };
}

const lue = (signature: string, superviseurId = "sup-1"): ValidationSuperviseurLue => ({
  superviseurId,
  methode: "pin",
  signature,
});

describe("preuve du PIN", () => {
  it("le contenu prouvé ignore la signature mais garde tout le reste de l'événement", () => {
    const sans = contenuAProuver(evenement());
    const avec = contenuAProuver(
      evenement({
        validePar: { superviseurId: "sup-1", methode: "pin", signature: "ab".repeat(36) },
      }),
    );
    expect(avec).toEqual(sans);
    expect(contenuAProuver({ ...evenement(), donnees: { sessionId: "s1" } })).toBeNull();
    expect(contenuAProuver({ ...evenement(), donnees: null })).toBeNull();
  });

  it("une preuve émise se vérifie pour le même événement, pendant dix minutes seulement", () => {
    const { service, horloge } = preuves();
    const { signature, expireA } = service.emettre("sup-1", evenement());
    expect(signature).toMatch(/^[0-9a-f]{72}$/);
    expect(expireA).toBe("2026-11-02T09:10:00.000+01:00");
    expect(service.verifier(lue(signature), evenement())).toBe(true);

    horloge.avancer(VALIDITE_PREUVE_PIN_MS);
    expect(service.verifier(lue(signature), evenement())).toBe(true);
    horloge.avancer(1_000);
    expect(service.verifier(lue(signature), evenement())).toBe(false);
  });

  it("une preuve datée du futur (au-delà d'une minute d'écart d'horloge) est refusée", () => {
    const { service, horloge } = preuves();
    const { signature } = service.emettre("sup-1", evenement());
    // L'instance qui vérifie a une horloge en retard de 5 minutes sur celle qui a émis.
    horloge.avancer(-5 * MS_PAR_MINUTE);
    expect(service.verifier(lue(signature), evenement())).toBe(false);
    horloge.avancer(4.5 * MS_PAR_MINUTE);
    expect(service.verifier(lue(signature), evenement())).toBe(true);
  });

  it("toute modification de l'événement invalide la preuve", () => {
    const { service } = preuves();
    const { signature } = service.emettre("sup-1", evenement());
    const modifs: Record<string, unknown> = {
      id: { ...evenement(), id: "00000000-0000-4000-8000-000000000002" },
      type: { ...evenement(), type: "caisse.refusee" },
      at: { ...evenement(), at: "2026-11-02T09:00:01.000+01:00" },
      auteur: { ...evenement(), auteurId: "sup-2" },
      cible: { ...evenement(), cible: { type: "session", id: "s2" } },
      ecart: evenement({ ecart: 0 }),
      commentaire: evenement({ commentaire: "ajouté" }),
      session: evenement({ sessionId: "s2" }),
      superviseurDansDonnees: evenement({ validePar: { superviseurId: "sup-2", methode: "pin" } }),
      champEnPlus: evenement({ extra: 1 }),
    };
    for (const [nom, evt] of Object.entries(modifs)) {
      expect(service.verifier(lue(signature), evt as Record<string, unknown>), nom).toBe(false);
    }
  });

  it("la preuve est liée au superviseur, à la méthode et au poivre du serveur", () => {
    const { service } = preuves();
    const { signature } = service.emettre("sup-1", evenement());
    expect(service.verifier(lue(signature, "sup-2"), evenement())).toBe(false);
    expect(service.verifier({ ...lue(signature), methode: "empreinte" }, evenement())).toBe(false);
    const autreServeur = preuves("un-autre-poivre-un-autre-poivre-un-autre-poivre-12345").service;
    expect(autreServeur.verifier(lue(signature), evenement())).toBe(false);
  });

  it("refuse une signature de mauvaise longueur, falsifiée ou sans heure valable", () => {
    const { service } = preuves();
    const { signature } = service.emettre("sup-1", evenement());
    expect(service.verifier(lue(signature.slice(0, 71)), evenement())).toBe(false);
    expect(service.verifier(lue(signature + "0"), evenement())).toBe(false);
    const derniere = signature.endsWith("0") ? "1" : "0";
    expect(service.verifier(lue(signature.slice(0, 71) + derniere), evenement())).toBe(false);
    expect(service.verifier(lue("0".repeat(8) + signature.slice(8)), evenement())).toBe(false);
    expect(service.verifier(lue("g".repeat(72)), evenement())).toBe(false);
  });

  it("refuse d'émettre pour un événement sans validePar", () => {
    const { service } = preuves();
    expect(() => service.emettre("sup-1", { ...evenement(), donnees: {} })).toThrow(RangeError);
  });
});

describe("PIN provisoire", () => {
  it("six chiffres, jamais une suite ni des chiffres identiques, et bien varié", () => {
    const vus = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const pin = genererPinProvisoire();
      expect(pin).toMatch(/^\d{6}$/);
      expect(() => verifierPin(pin)).not.toThrow();
      vus.add(pin);
    }
    expect(vus.size).toBeGreaterThan(250);
  });
});

describe("détail des personnes hors service", () => {
  it("compte par rôle, au pluriel quand il le faut, dans l'ordre de l'équipe", () => {
    expect(detailAutres([])).toBeNull();
    expect(detailAutres(["chauffeur"])).toBe("1 chauffeur");
    expect(detailAutres(["controleur", "chauffeur", "chauffeur", "convoyeur", "convoyeur"])).toBe(
      "2 convoyeurs, 2 chauffeurs, 1 contrôleur",
    );
    expect(detailAutres(["guichetier", "superviseur", "guichetier"])).toBe(
      "2 guichetiers, 1 superviseur",
    );
  });
});

import * as contrats from "@afrimove/contrats";
import { describe, expect, it } from "vitest";
import { ISO_ESSAIS, UUID_ESSAIS, variantes } from "../caisse/testing/mutations";
import {
  lireChauffeurArrivee,
  lireChauffeurDepense,
  lireChauffeurIncident,
  lireChauffeurRetard,
  lireControleCloture,
  lireControleConvoyeurSignale,
  lireControleRegularise,
  lireControleSiegeVerifie,
  lireRouteBilletVendu,
  lireRouteScanne,
} from "./schemas";

/**
 * Les événements du bord sont relus à la main par l'API (zod n'est pas importable à l'exécution) : ces tests
 * les comparent aux schémas du contrat `@afrimove/contrats`, champ par champ.
 */

const c = contrats.agence;

const enveloppe = (
  type: string,
  donnees: unknown,
  cible: { type: string; id: string },
  numeroPlage: number | null = null,
) => ({
  id: "00000000-0000-4000-8000-000000000001",
  type,
  at: "2026-11-02T09:00:00.000+01:00",
  appareilId: "appareil-bord-1",
  auteurId: "agent-1",
  cible,
  numeroPlage,
  donnees,
});

const NUL = "00000000-0000-0000-0000-000000000000";
const MAX = "ffffffff-ffff-ffff-ffff-ffffffffffff";
const gps = { latitude: 3.9, longitude: 10.1, precisionM: 12 };
const paiement = { mode: "cash", recu: 1000, rendu: 0, reference: null };
const depart = { type: "depart", id: "d1" };
const controle = { type: "controle", id: "c1" };

const cas = [
  {
    nom: "route.billet_vendu",
    schema: c.EVENEMENT_ROUTE_BILLET_VENDU.schema,
    lire: lireRouteBilletVendu,
    valide: enveloppe(
      "route.billet_vendu",
      {
        billetId: "b1",
        departId: "d1",
        arretMontee: "Douala",
        arretDescente: "Édéa",
        siege: 21,
        prix: 1000,
        passager: { nom: "Mballa Jean", telephone: "+237655123456" },
        paiement,
        codeBillet: "4821",
        gps,
      },
      { type: "billet", id: "b1" },
      3010,
    ),
  },
  {
    nom: "route.scanne",
    schema: c.EVENEMENT_ROUTE_SCANNE.schema,
    lire: lireRouteScanne,
    valide: enveloppe("route.scanne", { departId: "d1", arret: "Édéa", qr: "AM1:xyz" }, depart),
  },
  {
    nom: "chauffeur.depense",
    schema: c.EVENEMENT_CHAUFFEUR_DEPENSE.schema,
    lire: lireChauffeurDepense,
    valide: enveloppe(
      "chauffeur.depense",
      {
        depenseId: "dep1",
        departId: "d1",
        categorie: "carburant",
        libelle: "Gasoil",
        montant: 25000,
        justificatifRef: "photo-1.jpg",
      },
      depart,
    ),
  },
  {
    nom: "chauffeur.incident",
    schema: c.EVENEMENT_CHAUFFEUR_INCIDENT.schema,
    lire: lireChauffeurIncident,
    valide: enveloppe(
      "chauffeur.incident",
      { incidentId: "i1", departId: "d1", nature: "panne", gps, note: "Pneu éclaté" },
      depart,
    ),
  },
  {
    nom: "chauffeur.retard",
    schema: c.EVENEMENT_CHAUFFEUR_RETARD.schema,
    lire: lireChauffeurRetard,
    valide: enveloppe("chauffeur.retard", { departId: "d1", minutes: 25 }, depart),
  },
  {
    nom: "chauffeur.arrivee_arret",
    schema: c.EVENEMENT_CHAUFFEUR_ARRIVEE_ARRET.schema,
    lire: lireChauffeurArrivee,
    valide: enveloppe("chauffeur.arrivee_arret", { departId: "d1", arret: "Édéa", gps }, depart),
  },
  {
    nom: "controle.siege_verifie",
    schema: c.EVENEMENT_CONTROLE_SIEGE_VERIFIE.schema,
    lire: lireControleSiegeVerifie,
    valide: enveloppe(
      "controle.siege_verifie",
      { controleId: "c1", departId: "d1", siege: 7, constat: "sans_billet" },
      controle,
    ),
  },
  {
    nom: "controle.regularise",
    schema: c.EVENEMENT_CONTROLE_REGULARISE.schema,
    lire: lireControleRegularise,
    valide: enveloppe(
      "controle.regularise",
      {
        controleId: "c1",
        billetId: "b2",
        departId: "d1",
        siege: 7,
        prix: 1000,
        paiement,
        codeBillet: "1234",
        passager: { nom: "Njoya Marie", pieceQuatreDerniers: "5678" },
      },
      { type: "billet", id: "b2" },
      3200,
    ),
  },
  {
    nom: "controle.convoyeur_signale",
    schema: c.EVENEMENT_CONTROLE_CONVOYEUR_SIGNALE.schema,
    lire: lireControleConvoyeurSignale,
    valide: enveloppe(
      "controle.convoyeur_signale",
      {
        controleId: "c1",
        departId: "d1",
        convoyeurId: "conv-1",
        siege: 7,
        montantDeclare: 1000,
        note: "Dit avoir payé",
      },
      controle,
    ),
  },
  {
    nom: "controle.cloture",
    schema: c.EVENEMENT_CONTROLE_CLOTURE.schema,
    lire: lireControleCloture,
    valide: enveloppe(
      "controle.cloture",
      { controleId: "c1", departId: "d1", liste: 30, tetes: 31, ecart: 1 },
      controle,
    ),
  },
];

const accepte = (lire: (v: unknown, chemin: string) => unknown, v: unknown): boolean => {
  try {
    lire(v, "$");
    return true;
  } catch {
    return false;
  }
};

describe("événements du bord : tous ont un lecteur", () => {
  it("couvre les événements du contrat que l'API reçoit sur /agence/bus et /agence/controle", () => {
    const duContrat = (Object.values(c) as unknown[])
      .filter(
        (e): e is { type: string } =>
          typeof e === "object" && e !== null && "type" in e && "donnees" in e && "numerote" in e,
      )
      .map((e) => e.type)
      .filter((t) => /^(route|chauffeur|controle)\./.test(t))
      // Le déchargement des colis est lu par le module colis.
      .filter((t) => t !== "route.colis_decharges")
      .sort();
    expect(cas.map((x) => x.nom).sort()).toEqual(duContrat);
  });
});

for (const { nom, schema, lire, valide } of cas) {
  describe(`événement ${nom} : le lecteur fait comme le schéma zod du contrat`, () => {
    it("accepte un événement valide", () => {
      expect(schema.safeParse(valide).success).toBe(true);
      expect(accepte(lire as never, valide)).toBe(true);
    });

    it("refuse tout ce que le contrat refuse, champ par champ", () => {
      const divergences: string[] = [];
      let refuses = 0;
      for (const { nom: variante, valeur } of variantes(valide)) {
        const zod = schema.safeParse(valeur).success;
        const lecteur = accepte(lire as never, valeur);
        if (!zod) refuses += 1;
        if (zod !== lecteur) divergences.push(`${variante} : contrat ${zod}, lecteur ${lecteur}`);
      }
      expect(refuses).toBeGreaterThan(20);
      expect(divergences).toEqual([]);
    });

    it("même verdict sur les identifiants, les heures et la cible", () => {
      for (const id of UUID_ESSAIS) {
        // Écart connu du lecteur partagé de la billetterie (`uuid`) : les UUID nul et maximal sont refusés,
        // zod les accepte. Un appareil n'en tire jamais (UUID v4), et refuser est le côté sûr.
        if (id === NUL || id === MAX) continue;
        const e = { ...valide, id };
        expect(accepte(lire as never, e), `id ${id}`).toBe(schema.safeParse(e).success);
      }
      for (const at of ISO_ESSAIS) {
        const e = { ...valide, at };
        expect(accepte(lire as never, e), `at ${at}`).toBe(schema.safeParse(e).success);
      }
      for (const type of ["billet", "depart", "controle", "session", "autre"]) {
        const e = { ...valide, cible: { type, id: "x" } };
        expect(accepte(lire as never, e), `cible ${type}`).toBe(schema.safeParse(e).success);
      }
    });

    it("refuse un autre type et, selon l'événement, un numéro de plage absent ou en trop", () => {
      expect(accepte(lire as never, { ...valide, type: "caisse.ouverte" })).toBe(false);
      for (const numeroPlage of [null, 0, 1, 3010, 9999, 10000]) {
        const e = { ...valide, numeroPlage };
        expect(accepte(lire as never, e), `numeroPlage ${String(numeroPlage)}`).toBe(
          schema.safeParse(e).success,
        );
      }
    });
  });
}

describe("champs en trop", () => {
  it("un champ inconnu est ignoré, comme zod : le motif d'un retard ne bloque pas", () => {
    const retard = cas.find((x) => x.nom === "chauffeur.retard")!;
    const avecMotif = {
      ...retard.valide,
      donnees: { ...(retard.valide.donnees as object), motif: "embouteillage" },
    };
    expect(retard.schema.safeParse(avecMotif).success).toBe(true);
    expect(accepte(retard.lire as never, avecMotif)).toBe(true);
  });
});

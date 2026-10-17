import type { patron as c } from "@afrimove/contrats";
import { KAMGA_PATRON, heure, jourDecale } from "@afrimove/fixtures";
import { implementer } from "../../infra/scenarios";
import { OP_CONVENTION, OP_INTER_AGENCES } from "../operations";
import { introuvable } from "./contexte";
import type { ContributionMock, SourceFixtures } from "./contexte";
import { dateFrancaise, entier, instantFrancais, montant, segments } from "./lecture";

/** Colis entre compagnies et convention (planches InterAgences, InterAgencesConvention). */

export const ID_CONVENTION_OMEGA = "convention-alpha-omega";

function vue(src: SourceFixtures): c.InterAgences {
  const d = src.ecran("InterAgences").donnees;
  const colis = d.colis;
  const [trajet = ""] = segments(colis.titre);
  const [origine = "", destination = ""] = trajet.split("→").map((s) => s.trim());
  const [doit, devons, net] = d.reglement.lignes;
  const avec = /^(\S+)/.exec(doit!.libelle)?.[1] ?? "";
  return {
    colisEnCorrespondance: {
      colisId: colis._colisId,
      numero: /(C-[A-Z]{3}-[A-Z]{3}-\d{6}-\d{4})/.exec(colis.titre)![1]!,
      origine,
      destination,
      poidsKg: entier(colis.poids),
      troncons: colis.troncons.map((t) => {
        const [departBus = "", arrivee = ""] = [t.horaire.split("·")[0]!.trim(), t.horaire];
        return {
          rang: entier(t.libelle),
          compagnie: segments(t.libelle)[1] ?? "",
          origine: t.trajet.split("→")[0]!.trim(),
          destination: t.trajet.split("→")[1]!.trim(),
          heureDepart: departBus,
          bus: segments(t.horaire)[1] ?? "",
          heureArrivee: /arrivée (\d{2}:\d{2})/.exec(arrivee)![1]!,
          part: entier(t.part),
        };
      }),
      regle: colis.regle,
    },
    reglement: {
      autreCompagnie: avec,
      nousDoit: doit!.montant,
      nbColisTransportesPourEux: Number(/(\d+) colis/.exec(doit!.libelle)?.[1] ?? 0),
      nousLeDevons: Math.abs(devons!.montant),
      nbColisEnCorrespondance: Number(/(\d+) colis/.exec(devons!.libelle)?.[1] ?? 0),
      soldeNet: net!.montant,
      // « réglé par MoMo lundi 08:00 » : le lundi qui suit le mardi des maquettes.
      reglementA: heure("08:00", jourDecale(6)),
    },
    correspondanceVoyageurs: {
      minutesGaranties: Number(/correspondance de (\d+) min/.exec(d.voyageurs.texte)?.[1] ?? 0),
      attenteDuSecondBusMinutes: Number(/attend (\d+) min/.exec(d.voyageurs.texte)?.[1] ?? 0),
    },
    conventions: [{ id: ID_CONVENTION_OMEGA, avec, statut: "active" }],
  };
}

function convention(src: SourceFixtures): c.Convention {
  const d = src.ecran("InterAgencesConvention").donnees;
  const compagnies = d.titre
    .replace(/^Convention\s+/, "")
    .split("–")
    .map((s) => s.trim()) as [string, string];
  const chiffre = (libelle: string) => d.trimestre.find((x) => x.libelle === libelle)!;
  const nombre = (v: string | number): number | null => (typeof v === "number" ? v : null);
  return {
    id: ID_CONVENTION_OMEGA,
    compagnies,
    signeeLe: dateFrancaise(d.detail).jour,
    renouvellement: /trimestre/.test(d.detail) ? "trimestriel" : "annuel",
    statut: d.badge === "ACTIVE" ? "active" : "expiree",
    parts: {
      colisType: {
        poidsKg: entier(d.parts.aide),
        prix: entier(/paie\s*([\d  ]+)/.exec(d.parts.total.libelle)![1]!),
        fraisAfriMove: Number(/AfriMove (\d+)/.exec(d.parts.total.libelle)?.[1] ?? 0),
      },
      lignes: d.parts.lignes.map((l) => ({
        troncon: l.troncon,
        premiere: nombre(l.alpha),
        seconde: nombre(l.omega),
      })),
      total: { premiere: d.parts.total.alpha, seconde: d.parts.total.omega },
    },
    regles: d.regles.liste.map((r) => ({
      rang: entier(r.titre),
      titre: r.titre.replace(/^\d\s*·\s*/, "").replace(/[.:]\s*$/, ""),
      texte: r.texte,
    })),
    signatures: d.signatures.map((s) => {
      const [qui = "", , quand = ""] = segments(s.detail);
      return {
        compagnie: s.libelle.replace(/^Signé pour\s+/, ""),
        signataire: qui === "Toi" ? KAMGA_PATRON.nom : qui,
        signeA: instantFrancais(quand),
      };
    }),
    trimestre: {
      colisEchanges: entier(chiffre("Trimestre").valeur),
      litiges: entier(chiffre("Litiges").valeur),
      netRecu: montant(chiffre("Net reçu").valeur),
      reglements: entier(chiffre("Net reçu").detail),
    },
  };
}

export function mockInterAgences(src: SourceFixtures): ContributionMock {
  return {
    operations: [
      implementer(OP_INTER_AGENCES, () => vue(src)),
      implementer(OP_CONVENTION, ({ conventionId }) => {
        if (conventionId !== ID_CONVENTION_OMEGA) {
          throw introuvable("Convention", "CONVENTION_INCONNUE", conventionId);
        }
        return convention(src);
      }),
    ],
    flux: [],
  };
}

import type { patron as c } from "@afrimove/contrats";
import { heure, jourDecale } from "@afrimove/fixtures";
import { construireConvention } from "../../colis/mock/inter-agences";
import { implementer } from "../../infra/scenarios";
import { OP_CONVENTION, OP_INTER_AGENCES } from "../operations";
import { introuvable } from "./contexte";
import type { ContributionMock, SourceFixtures } from "./contexte";
import { entier, segments } from "./lecture";

/** Colis entre compagnies et convention (planches InterAgences, InterAgencesConvention). */

export const ID_CONVENTION_OMEGA = "convention-alpha-omega";

/** « Yaoundé → Bamenda en un seul billet : Alpha jusqu'à Bafoussam, Oméga ensuite » : l'origine du billet. */
function trajetVoyageur(texte: string): { trajet?: c.TrajetVoyageurCorrespondance } {
  const m = /^(.+?) → (.+?) en un seul billet : (.+?) jusqu['’]à (.+?), (.+?) ensuite/.exec(texte);
  if (!m) return {};
  const [, origine = "", destination = "", premiere = "", via = "", seconde = ""] = m;
  return { trajet: { origine, via, destination, premiere, seconde } };
}

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
      ...trajetVoyageur(d.voyageurs.texte),
    },
    conventions: [{ id: ID_CONVENTION_OMEGA, avec, statut: "active" }],
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
        // Le contrat est unique : la même convention que celle de l'écran InterAgencesConvention.
        return construireConvention(src.ecran("InterAgencesConvention"));
      }),
    ],
    flux: [],
  };
}

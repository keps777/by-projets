import type { patron as c } from "@afrimove/contrats";
import { ALPHA_AKWA, ALPHA_BAFOUSSAM, ALPHA_MVAN, JOUR, heure } from "@afrimove/fixtures";
import { ErreurHttp } from "../../infra/erreurs";
import { implementer } from "../../infra/scenarios";
import { OP_RAPPORT_SOIR } from "../operations";
import type { ContributionMock, SourceFixtures } from "./contexte";
import { entier, montant, nombreAvant, pourcent, segments } from "./lecture";

/** Rapport du soir (planche « RapportSoir ») : le message WhatsApp de 21 h et sa vue dans l'app. */

const GARES = [ALPHA_AKWA, ALPHA_MVAN, ALPHA_BAFOUSSAM] as const;

function rapport(src: SourceFixtures): c.RapportSoir {
  const e = src.ecran("RapportSoir");
  const d = e.donnees;
  const chiffre = (libelle: string) => d.chiffres.find((x) => x.libelle === libelle)!;
  const recette = chiffre("Recette");
  const cash = /cash\s*([\d,]+)/.exec(recette.detail)![1]!;
  const momo = /MoMo\s*([\d,]+)/.exec(recette.detail)![1]!;
  const sansPuce = (t: string): string => t.replace(/^·\s*/, "").trim();
  const enRoute = sansPuce(d.enRoute.texte);

  return {
    jour: JOUR,
    envoyeA: heure(d.expediteur.heure),
    titre: d.titre,
    nbGares: nombreAvant(d.titre, "gares") ?? 0,
    chiffres: {
      billets: entier(chiffre("Billets").valeur),
      variationBilletsPct: pourcent(chiffre("Billets").detail),
      colis: entier(chiffre("Colis").valeur),
      litiges: entier(chiffre("Colis").detail),
      recette: montant(recette.valeur),
      cash: montant(`${cash} M`),
      momo: montant(`${momo} M`),
    },
    gares: d.gares.map((g) => {
      const gare = GARES.find((x) => x.nom.toLowerCase().includes(g.nom.toLowerCase()))!;
      // Seules les parenthèses qui enveloppent toute la suite sont ôtées (« (guichet 2, validé par Essono) ») : celles
      // d'une remarque restent, l'API les écrit ainsi (« 1 départ fusionné (16:00 + 16:30) »).
      const suite = g.suite.trim().replace(/^\((.*)\)$/, "$1");
      const remarques = [...segments(g.texte), ...segments(suite)].filter(
        (s) => !/billets/.test(s) && !/^écart/.test(s),
      );
      return {
        gareId: gare.id,
        nom: g.nom,
        billets: nombreAvant(g.texte, "billets") ?? 0,
        ecart: g.ecart,
        remarques,
      };
    }),
    enRoute: {
      billetsConvoyeurs: nombreAvant(enRoute, "billets") ?? 0,
      controles: nombreAvant(enRoute, "contrôle") ?? 0,
      regularisations: nombreAvant(enRoute, "régularisation") ?? 0,
      texte: enRoute,
    },
    remplissage: {
      moyenPct: pourcent(d.remplissage.texte),
      remarque: segments(d.remplissage.texte)[1] ?? null,
    },
    annulations: {
      nombre: entier(sansPuce(d.annulations.texte)),
      montant: entier(/\(([\d  ]+)\s*F\)/.exec(d.annulations.texte)![1]!),
      toutesAvecPin: /toutes avec PIN/.test(d.annulations.texte),
    },
    enLigne: {
      billets: entier(sansPuce(d.annulations.enLigne.texte)),
      partPct: pourcent(d.annulations.enLigne.texte),
    },
    signatures: [...d.signature.matchAll(/([^\s,]+) \(([^)]+)\)/g)].map((m) => ({
      nom: m[1]!,
      gare: m[2]!,
    })),
    questionSuggeree: { question: d.question.titre, reponse: d.question.reponse },
  };
}

export function mockRapport(src: SourceFixtures): ContributionMock {
  return {
    operations: [
      implementer(OP_RAPPORT_SOIR, ({ jour }) => {
        if (jour && jour !== JOUR) {
          throw new ErreurHttp(
            404,
            `Pas de rapport pour le ${jour} dans ce scénario`,
            "RAPPORT_INCONNU",
          );
        }
        return rapport(src);
      }),
    ],
    flux: [],
  };
}

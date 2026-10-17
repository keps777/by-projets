import type { patron as c } from "@afrimove/contrats";
import { BUS_LT207, PAULINE_N, SESSION_JOSEPH } from "@afrimove/fixtures";
import { ajouterMinutes } from "@afrimove/domain";
import { implementer, simulerFlux } from "../../infra/scenarios";
import { CANAL_DIRECT_JOUR, OP_ALERTES, OP_TABLEAU_DU_JOUR } from "../operations";
import type { ContributionMock, SourceFixtures } from "./contexte";
import { entier, montant, nombreAvant, pourcent, quand, segments } from "./lecture";

/** Tableau du jour, alertes et temps réel de l'accueil du patron (planche « Patron »). */

const CATEGORIES: ReadonlyArray<readonly [RegExp, c.CategorieAlerte, string | null]> = [
  [/écart/i, "ecart_caisse", SESSION_JOSEPH.id],
  [/MoMo/i, "momo_sans_correspondance", null],
  [/correspondance/i, "correspondance", null],
  [/PIN faux/i, "pin_bloque", PAULINE_N.id],
  [/panne/i, "panne_bus", BUS_LT207.id],
  [/dossier AV-/i, "financement", "AV-2027-0041"],
];

/** Intervalle des mises à jour du direct simulé (sur l'horloge injectée). */
export const PERIODE_DIRECT_MS = 30_000;
/** Prix d'un billet simulé quand le direct ajoute une vente (classique Douala → Yaoundé). */
export const BILLET_SIMULE: c.Fcfa = 4000;

export function chiffresDuJour(src: SourceFixtures): c.ChiffresDuJour {
  const j = src.ecran("Patron").donnees.jour;
  const par = (libelle: string) => j.chiffres.find((x) => x.libelle === libelle)!.valeur;
  return {
    recette: montant(j.recette),
    variationPct: pourcent(j.variation),
    comparaison: j.comparaison.replace(/^vs\s+/, ""),
    billets: entier(par("billets")),
    colis: entier(par("colis")),
    remplissagePct: pourcent(par("remplissage")),
    ecartTotal: entier(par("écart total")),
  };
}

export function listeAlertes(src: SourceFixtures): c.Alerte[] {
  return src.ecran("Patron").donnees.alertes.liste.map((a, i) => {
    const [, categorie, cibleId] = CATEGORIES.find(([re]) => re.test(a.texte)) ?? [
      /./,
      "autre" as const,
      null,
    ];
    return {
      id: `alerte-${i + 1}`,
      categorie,
      texte: a.texte,
      quand: quand(a.quand),
      cibleId,
    };
  });
}

export function mockAujourdhui(src: SourceFixtures): ContributionMock {
  const patron = src.ecran("Patron");
  const d = patron.donnees;

  const tableau = (): c.TableauDuJour => {
    const [nomPatron = "", gares = "", bus = ""] = segments(d.detail);
    const personnes = d.raccourcis
      .map((r) => nombreAvant(r.detail, "pers"))
      .find((n) => n !== null);
    return {
      compagnie: d.compagnie,
      patron: nomPatron,
      nbGares: entier(gares),
      nbBus: entier(bus),
      nbPersonnes: personnes ?? 0,
      instant: patron.maintenant,
      jour: chiffresDuJour(src),
      assistant: {
        nbInsights: entier(/(\d+) chose/.exec(d.assistant.titre)?.[1] ?? "0"),
        apercus: segments(d.assistant.detail),
      },
      nbAlertes: d.alertes.liste.length,
    };
  };

  return {
    operations: [
      implementer(OP_TABLEAU_DU_JOUR, () => tableau()),
      implementer(OP_ALERTES, () => ({ alertes: listeAlertes(src) })),
    ],
    flux: [
      // Le direct repart des chiffres de la planche, puis une vente toutes les 30 s.
      simulerFlux(CANAL_DIRECT_JOUR, (_p, ctx) => {
        let jour = chiffresDuJour(src);
        let instant = patron.maintenant;
        const emettre = (): void => {
          const message: c.MessageDirectJour = { type: "chiffres", instant, jour };
          ctx.emettre(message);
        };
        const avancer = (): void => {
          instant = ajouterMinutes(instant, PERIODE_DIRECT_MS / 60_000);
          jour = { ...jour, billets: jour.billets + 1, recette: jour.recette + BILLET_SIMULE };
          emettre();
          ctx.planifier(PERIODE_DIRECT_MS, avancer);
        };
        emettre();
        ctx.planifier(PERIODE_DIRECT_MS, avancer);
      }),
    ],
  };
}

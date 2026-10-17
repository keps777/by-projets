import { HttpException } from "@nestjs/common";
import {
  depensesTotales,
  recetteTotale,
  remplissagePct,
  variationPct,
  vivants,
} from "../analyses/agregats";
import type { AnalysesService, ContexteAnalyses } from "../analyses/analyses.service";
import { accorder, arrondi, de, francs, nombre } from "../analyses/format";
import type {
  ActionProposee,
  Constat,
  DepartFait,
  LigneRef,
  SourceDonnee,
} from "../analyses/modele";
import { JOURS_NOMS, dateCourte, jourSemaine } from "../analyses/periodes";
import {
  CREUX_PART_DE_LA_MOYENNE,
  FUITE_JOURS,
  RETRAIT_DEPART_POINTS,
  VEILLE_PLEINE_PCT,
  actionAjouterDepart,
  actionDecaler,
  actionVoirLigne,
  hier,
  nomConcurrent,
  type Detections,
} from "../analyses/regles";
import {
  AVANCE_SUR_CONCURRENT_MINUTES,
  BASE_JOURS,
  DEPARTS_MINIMUM,
  ELASTICITE_PRIX,
  concurrentProche,
  heureDeMinutes,
  minutes,
  resumer,
  series,
  type SerieDepart,
} from "../analyses/simulation";
import { decalerJour } from "../rapport/temps";
import type { Interpretation } from "./interpretation";
import type { Brouillon, ContexteConversation, Intention, OptionSimuleeVue } from "./modele";

/**
 * Le moteur de l'assistant : pour chaque intention, il lit les chiffres de la compagnie (contexte du module
 * `analyses`), calcule, et écrit une réponse en français avec ses sources. Aucun modèle de langage ici :
 * c'est la réponse de référence, et celle qui part quand le modèle est absent, trop lent, ou refusé.
 */

/** Deux semaines : la période de comparaison des questions « pourquoi ça baisse ». */
export const DEUX_SEMAINES = 14;
/** Un concurrent compte dans une explication quand il publie ce créneau depuis au moins ce nombre de jours. */
export const CONCURRENT_RECENT_JOURS = 7;
/** Variation des colis à partir de laquelle on la cite (en %). */
export const COLIS_VARIATION_MINIMUM_PCT = 3;
/** Jours minimum observés d'un même jour de la semaine pour en faire une prévision. */
export const JOURS_MINIMUM_PREVISION = 2;
/** Nombre d'éléments listés dans les points d'une réponse. */
export const POINTS_MAXIMUM = 5;

export interface EntreeMoteur {
  ctx: ContexteAnalyses;
  analyses: Pick<AnalysesService, "simulerDans" | "retrouver">;
  /** Les constats du moment, calculés seulement si la question en a besoin. */
  constats: () => Detections;
  /** Le contexte de la question précédente, pour « et si… ». */
  precedent: ContexteConversation | null;
}

/* ------------------------------------------------------------------ petits outils */

const somme = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0);
const nomJour = (i: number): string => JOURS_NOMS[i]!;
const signe = (n: number): string => (n > 0 ? `+ ${nombre(n)}` : nombre(n));
const pct = (n: number): string => `${nombre(arrondi(n))} %`;
const numeroter = (textes: readonly string[]): string[] => textes.map((t, i) => `${i + 1}. ${t}`);

function liste(elements: readonly string[]): string {
  if (elements.length <= 1) return elements.join("");
  return `${elements.slice(0, -1).join(", ")} et ${elements[elements.length - 1]}`;
}

const periodeTexte = (du: string, au: string): string =>
  du === au ? `le ${dateCourte(du)}` : `du ${dateCourte(du)} au ${dateCourte(au)}`;

function source(
  type: SourceDonnee["type"],
  description: string,
  n: number,
  du: string,
  au: string,
): SourceDonnee {
  return { type, description, nombre: n, du, au };
}

/** La phrase « Sources : … » d'une réponse ; `null` quand rien n'a été lu. */
export function phraseSources(sources: readonly SourceDonnee[]): string | null {
  const descriptions = [...new Set(sources.map((s) => s.description))];
  if (descriptions.length === 0) return null;
  return `Sources : ${descriptions.join(", ")}. Jamais les chiffres d'une autre compagnie.`;
}

function brouillon(
  intention: Intention,
  partiel: Partial<Brouillon> & Pick<Brouillon, "resume">,
): Brouillon {
  const b: Brouillon = {
    intention,
    points: [],
    actions: [],
    sources: [],
    simulation: null,
    faits: [],
    motsObligatoires: [],
    contexte: { ligneId: null, departId: null },
    figee: false,
    ...partiel,
  };
  if (partiel.faits === undefined) b.faits = [b.resume, ...b.points];
  return b;
}

const ligneParId = (ctx: ContexteAnalyses, id: string | null | undefined): LigneRef | undefined =>
  id ? ctx.lignes.find((l) => l.id === id) : undefined;

function fenetres(ctx: ContexteAnalyses) {
  const au = hier(ctx.aujourdhui);
  const duRecent = decalerJour(au, -(DEUX_SEMAINES - 1));
  const auAvant = decalerJour(duRecent, -1);
  const duAvant = decalerJour(auAvant, -(DEUX_SEMAINES - 1));
  return { duRecent, au, duAvant, auAvant };
}

const entre = (d: DepartFait, du: string, au: string): boolean => d.jour >= du && d.jour <= au;
const libelleDepart = (s: Pick<SerieDepart, "heure" | "classe">): string =>
  `${s.heure}${s.classe === "vip" ? " VIP" : ""}`;

/* ------------------------------------------------------------------ questions suggérées */

/** La ligne dont la recette baisse le plus sur deux semaines (au moins 5 %), ou `null`. */
export function ligneEnBaisse(ctx: ContexteAnalyses): LigneRef | null {
  const f = fenetres(ctx);
  let pire: { ligne: LigneRef; variation: number } | null = null;
  for (const ligne of ctx.lignes) {
    const deLaLigne = vivants(ctx.departs.filter((d) => d.ligneId === ligne.id));
    const recette = (du: string, au: string) =>
      somme(deLaLigne.filter((d) => entre(d, du, au)).map((d) => d.recetteBillets));
    const avant = recette(f.duAvant, f.auAvant);
    if (avant === 0) continue;
    const variation = variationPct(recette(f.duRecent, f.au), avant);
    if (variation <= -5 && (pire === null || variation < pire.variation))
      pire = { ligne, variation };
  }
  return pire?.ligne ?? null;
}

/** Le jour de la semaine qui rapporte le plus en moyenne (au moins deux jours observés). */
export function meilleurJour(ctx: ContexteAnalyses): number | null {
  let meilleur: { jour: number; moyenne: number } | null = null;
  for (const [jour, jours] of recetteParJourDeLaSemaine(vivants(ctx.departs))) {
    if (jours.length < JOURS_MINIMUM_PREVISION) continue;
    const moyenne = somme(jours) / jours.length;
    if (meilleur === null || moyenne > meilleur.moyenne) meilleur = { jour, moyenne };
  }
  return meilleur?.jour ?? null;
}

/** Les questions que l'assistant propose : toujours des questions auxquelles il sait répondre. */
export function questionsSuggerees(ctx: ContexteAnalyses): string[] {
  const questions: string[] = [];
  const baisse = ligneEnBaisse(ctx);
  if (baisse) {
    const partage = ctx.lignes.filter((l) => l.destination === baisse.destination).length > 1;
    questions.push(`Pourquoi ${partage ? baisse.nom : baisse.destination} baisse ?`);
  }
  const busAvecTrajets = new Set(
    vivants(ctx.departs)
      .map((d) => d.busId)
      .filter((b): b is string => b !== null),
  );
  if (busAvecTrajets.size >= 2) questions.push("Quel bus coûte le plus ?");
  const jour = meilleurJour(ctx);
  if (jour !== null) questions.push(`Prévision de ${nomJour(jour)}`);
  return questions;
}

/* ------------------------------------------------------------------ pourquoi une ligne baisse */

function pourquoiLigne(interp: Interpretation, e: EntreeMoteur): Brouillon {
  const { ctx } = e;
  const ligne = ligneParId(ctx, interp.ligneIds[0])!;
  const contexte: ContexteConversation = { ligneId: ligne.id, departId: null };
  const f = fenetres(ctx);
  const deLaLigne = vivants(ctx.departs.filter((d) => d.ligneId === ligne.id));
  const recents = deLaLigne.filter((d) => entre(d, f.duRecent, f.au));
  const avant = deLaLigne.filter((d) => entre(d, f.duAvant, f.auAvant));
  const recetteR = somme(recents.map((d) => d.recetteBillets));
  const recetteA = somme(avant.map((d) => d.recetteBillets));

  if (recents.length === 0 || avant.length === 0 || recetteA === 0) {
    return brouillon("pourquoi_ligne", {
      resume: `Je n'ai pas assez de départs de ${ligne.nom} sur les ${2 * DEUX_SEMAINES} derniers jours pour comparer deux semaines et expliquer une baisse.`,
      sources: [
        source(
          "departs",
          `tes départs des ${BASE_JOURS} derniers jours (${deLaLigne.length} sur cette ligne)`,
          deLaLigne.length,
          f.duAvant,
          f.au,
        ),
      ],
      motsObligatoires: [ligne.nom],
      contexte,
      figee: true,
    });
  }

  const variation = variationPct(recetteR, recetteA);
  const moyenne = remplissagePct(recents);

  // Un jour de la semaine qui s'effondre.
  const parJour = new Map<number, DepartFait[]>();
  for (const d of recents) {
    const j = jourSemaine(d.jour);
    parJour.set(j, [...(parJour.get(j) ?? []), d]);
  }
  let creux: { jour: number; pct: number; jours: number; avant: number | null } | null = null;
  for (const [jour, xs] of parJour) {
    const jours = new Set(xs.map((d) => d.jour)).size;
    if (jours < 2) continue;
    const p = remplissagePct(xs);
    if (p <= moyenne * CREUX_PART_DE_LA_MOYENNE && (creux === null || p < creux.pct)) {
      const lesAvant = avant.filter((d) => jourSemaine(d.jour) === jour);
      creux = { jour, pct: p, jours, avant: lesAvant.length > 0 ? remplissagePct(lesAvant) : null };
    }
  }

  // Un départ qui remplit nettement moins que les autres.
  const sources: SourceDonnee[] = [
    source(
      "ventes",
      `tes ventes de billets (${accorder(recents.length + avant.length, "départ")}, ${periodeTexte(f.duAvant, f.au)})`,
      recents.length + avant.length,
      f.duAvant,
      f.au,
    ),
  ];
  let faible: {
    serie: SerieDepart;
    pct: number;
    autres: number;
    avant: number | null;
    concurrent: ReturnType<typeof concurrentProche>;
  } | null = null;
  for (const serie of series(deLaLigne)) {
    if (serie.occurrences.length < DEPARTS_MINIMUM) continue;
    const mesRecents = serie.occurrences.filter((d) => entre(d, f.duRecent, f.au));
    const autresRecents = recents.filter(
      (d) => d.heure !== serie.heure || d.classe !== serie.classe,
    );
    if (mesRecents.length < 2 || autresRecents.length === 0) continue;
    const p = remplissagePct(mesRecents);
    const autres = remplissagePct(autresRecents);
    if (autres - p < RETRAIT_DEPART_POINTS) continue;
    if (faible === null || autres - p > faible.autres - faible.pct) {
      const mesAvant = serie.occurrences.filter((d) => entre(d, f.duAvant, f.auAvant));
      const dernier = serie.occurrences[serie.occurrences.length - 1]!;
      const concurrent = concurrentProche(ctx.offres, ligne.code, serie.heure, dernier.prix);
      faible = {
        serie,
        pct: p,
        autres,
        avant: mesAvant.length > 0 ? remplissagePct(mesAvant) : null,
        concurrent: concurrent && concurrent.jours >= CONCURRENT_RECENT_JOURS ? concurrent : null,
      };
    }
  }

  // Les colis.
  const colisR = somme(recents.map((d) => d.recetteColis));
  const colisA = somme(avant.map((d) => d.recetteColis));
  const variationColis = colisA > 0 ? variationPct(colisR, colisA) : null;

  const textes: string[] = [
    `Les billets de la ligne ont rapporté ${francs(recetteR)} ces ${DEUX_SEMAINES} derniers jours, contre ${francs(recetteA)} les ${DEUX_SEMAINES} jours d'avant.`,
  ];
  const actions: ActionProposee[] = [];
  const causes: string[] = [];

  if (creux) {
    const nom = nomJour(creux.jour);
    let texte = `Les ${creux.jours} ${nom}s sont à ${pct(creux.pct)} de remplissage`;
    if (creux.avant !== null && creux.avant - creux.pct >= 5) {
      texte += ` (${pct(creux.avant)} les ${nom}s d'avant)`;
    }
    texte += `, pour ${pct(moyenne)} en moyenne sur la ligne.`;
    const veille = (creux.jour + 6) % 7;
    const lesVeilles = recents.filter((d) => jourSemaine(d.jour) === veille);
    const pctVeille = lesVeilles.length > 0 ? remplissagePct(lesVeilles) : 0;
    if (pctVeille >= VEILLE_PLEINE_PCT) {
      texte += ` Le ${nomJour(veille)}, la ligne remplit à ${pct(pctVeille)} : la demande semble s'être déplacée vers la veille.`;
      const plein = series(lesVeilles).sort(
        (a, b) =>
          remplissagePct(b.occurrences) - remplissagePct(a.occurrences) ||
          a.heure.localeCompare(b.heure),
      )[0]!;
      actions.push(actionAjouterDepart(ligne.id, veille, plein.heure, plein.classe));
    }
    textes.push(texte);
    causes.push(`le ${nom}`);
  }

  if (faible) {
    const dernier = faible.serie.occurrences[faible.serie.occurrences.length - 1]!;
    let texte = `Le ${libelleDepart(faible.serie)} part à ${pct(faible.pct)} de remplissage, contre ${pct(faible.autres)} pour tes autres départs.`;
    if (faible.avant !== null && faible.avant - faible.pct >= 5) {
      texte += ` Il était à ${pct(faible.avant)} les ${DEUX_SEMAINES} jours d'avant.`;
    }
    if (faible.concurrent) {
      const c = faible.concurrent;
      texte += ` ${nomConcurrent(ctx.nommerConcurrents, c.compagnie)} part à ${c.heure} à ${francs(c.prix)}, ${francs(dernier.prix - c.prix)} de moins que toi.`;
      sources.push(
        source(
          "offres_publiques",
          `l'horaire et le prix publics ${ctx.nommerConcurrents ? de(c.compagnie) : "d'une autre compagnie"}`,
          c.jours,
          f.duAvant,
          f.au,
        ),
      );
      if (minutes(c.heure) < minutes(faible.serie.heure)) {
        const nouvelleHeure = heureDeMinutes(minutes(c.heure) - AVANCE_SUR_CONCURRENT_MINUTES);
        try {
          const sim = e.analyses.simulerDans(ctx, {
            type: "horaire",
            departId: dernier.departId,
            nouvelleHeure,
          });
          if (sim.simulation.gainMensuel > 0) {
            actions.push(
              actionDecaler(dernier.departId, ligne.id, faible.serie.heure, nouvelleHeure),
            );
          }
        } catch (erreur) {
          if (!(erreur instanceof HttpException)) throw erreur;
        }
      }
    }
    textes.push(texte);
    causes.push(`le ${libelleDepart(faible.serie)}`);
    contexte.departId = dernier.departId;
  }

  if (variationColis !== null && Math.abs(variationColis) >= COLIS_VARIATION_MINIMUM_PCT) {
    textes.push(
      `Les colis ${variationColis > 0 ? "montent" : "baissent"} : ${signe(variationColis)} % sur la même période.`,
    );
    sources.push(
      source(
        "colis",
        `tes colis (${periodeTexte(f.duAvant, f.au)})`,
        recents.length + avant.length,
        f.duAvant,
        f.au,
      ),
    );
  }

  actions.push(actionVoirLigne(ligne.id));

  let resume: string;
  if (variation < 0) {
    resume = `${ligne.nom} fait ${nombre(variation)} % sur deux semaines.`;
    resume +=
      causes.length > 0
        ? ` Ce qui pèse : ${liste(causes)}.`
        : " Je ne vois ni un jour ni un départ qui l'explique clairement.";
  } else {
    resume = `${ligne.nom} ne baisse pas : ${signe(variation)} % sur deux semaines.`;
    if (causes.length > 0) resume += ` Points faibles tout de même : ${liste(causes)}.`;
  }

  const points = numeroter(textes.slice(0, POINTS_MAXIMUM));
  return brouillon("pourquoi_ligne", {
    resume,
    points,
    actions: actions.slice(0, 3),
    sources,
    motsObligatoires: [ligne.nom],
    contexte,
  });
}

/* ------------------------------------------------------------------ quel bus coûte le plus */

function coutBus(e: EntreeMoteur): Brouillon {
  const { ctx } = e;
  const du = decalerJour(hier(ctx.aujourdhui), -(BASE_JOURS - 1));
  const au = hier(ctx.aujourdhui);
  const faits = vivants(ctx.departs);
  const lignes = ctx.bus
    .map((bus) => {
      const siens = faits.filter((d) => d.busId === bus.id);
      return {
        bus,
        trajets: siens.length,
        carburant: somme(siens.map((d) => d.carburant)),
        pannes: somme(siens.map((d) => d.coutPanne)),
        total: somme(siens.map(depensesTotales)),
        net: somme(siens.map((d) => recetteTotale(d) - depensesTotales(d))),
      };
    })
    .filter((b) => b.trajets > 0)
    .sort(
      (a, b) => b.total - a.total || a.bus.immatriculation.localeCompare(b.bus.immatriculation),
    );

  const sources = [
    source(
      "departs",
      `tes dépenses de carburant, de pannes et autres frais (${accorder(faits.length, "départ")}, ${periodeTexte(du, au)})`,
      faits.length,
      du,
      au,
    ),
  ];
  if (lignes.length === 0) {
    return brouillon("cout_bus", {
      resume: `Je n'ai aucun trajet de bus sur les ${BASE_JOURS} derniers jours : je ne peux pas dire lequel coûte le plus.`,
      sources,
      figee: true,
    });
  }
  const premier = lignes[0]!;
  let resume = `${premier.bus.immatriculation} est le bus qui coûte le plus : ${francs(premier.total)} de dépenses en ${BASE_JOURS} jours, dont ${francs(premier.carburant)} de carburant`;
  resume += premier.pannes > 0 ? ` et ${francs(premier.pannes)} de pannes.` : ".";
  const textes = lignes.slice(0, 3).map((l, i) => {
    let t = `${l.bus.immatriculation} : ${francs(l.total)} pour ${accorder(l.trajets, "trajet")}, soit ${francs(arrondi(l.total / l.trajets))} par trajet (net ${francs(l.net)}).`;
    if (i === 0 && l.bus.chauffeurNom) t += ` Chauffeur habituel : ${l.bus.chauffeurNom}.`;
    return t;
  });
  return brouillon("cout_bus", { resume, points: numeroter(textes), sources });
}

/* ------------------------------------------------------------------ prévision d'un jour */

/** Recette (billets et colis) de chaque jour observé, regroupée par jour de la semaine. */
function recetteParJourDeLaSemaine(departs: readonly DepartFait[]): Map<number, number[]> {
  const parJour = new Map<string, number>();
  for (const d of departs) parJour.set(d.jour, (parJour.get(d.jour) ?? 0) + recetteTotale(d));
  const sortie = new Map<number, number[]>();
  for (const [jour, recette] of [...parJour].sort(([a], [b]) => a.localeCompare(b))) {
    const j = jourSemaine(jour);
    sortie.set(j, [...(sortie.get(j) ?? []), recette]);
  }
  return sortie;
}

/** Le prochain jour de ce nom, aujourd'hui compris. */
export function prochainJour(aujourdhui: string, jour: number): string {
  return decalerJour(aujourdhui, (jour - jourSemaine(aujourdhui) + 7) % 7);
}

function previsionJour(interp: Interpretation, e: EntreeMoteur): Brouillon {
  const { ctx } = e;
  const jour = interp.jourSemaine!;
  const nom = nomJour(jour);
  const cible = prochainJour(ctx.aujourdhui, jour);
  const du = decalerJour(hier(ctx.aujourdhui), -(BASE_JOURS - 1));
  const au = hier(ctx.aujourdhui);
  const faits = vivants(ctx.departs);
  const duJour = faits.filter((d) => jourSemaine(d.jour) === jour);
  const joursObserves = [...new Set(duJour.map((d) => d.jour))].sort();
  const sources = [
    source(
      "ventes",
      `tes ventes de billets et de colis (${accorder(joursObserves.length, nom)}, ${joursObserves.length > 0 ? periodeTexte(joursObserves[0]!, joursObserves[joursObserves.length - 1]!) : periodeTexte(du, au)})`,
      duJour.length,
      du,
      au,
    ),
  ];
  if (joursObserves.length < JOURS_MINIMUM_PREVISION) {
    return brouillon("prevision_jour", {
      resume: `Je n'ai que ${accorder(joursObserves.length, nom)} dans les ${BASE_JOURS} derniers jours : c'est trop peu pour prévoir le ${nom} (${dateCourte(cible)}).`,
      sources,
      figee: true,
    });
  }
  const recettes = recetteParJourDeLaSemaine(duJour).get(jour)!;
  const moyenne = somme(recettes) / recettes.length;
  const minimum = Math.min(...recettes);
  const maximum = Math.max(...recettes);
  const tous = [...recetteParJourDeLaSemaine(faits).values()].flat();
  const moyenneTous = somme(tous) / tous.length;
  const ecart = moyenneTous > 0 ? variationPct(moyenne, moyenneTous) : 0;
  const nbJours = joursObserves.length;

  const parLigne = ctx.lignes
    .map((ligne) => {
      const siens = duJour.filter((d) => d.ligneId === ligne.id);
      return {
        ligne,
        recette: somme(siens.map(recetteTotale)) / nbJours,
        remplissage: remplissagePct(siens),
        departs: siens.length,
      };
    })
    .filter((l) => l.departs > 0)
    .sort((a, b) => b.recette - a.recette || a.ligne.nom.localeCompare(b.ligne.nom, "fr"));

  const resume =
    `${nom[0]!.toUpperCase()}${nom.slice(1)} ${dateCourte(cible)} : environ ${francs(arrondi(moyenne))} de recette, ` +
    `d'après les ${nbJours} derniers ${nom}s (de ${francs(minimum)} à ${francs(maximum)}).`;
  const textes = [
    `Remplissage moyen les ${nom}s : ${pct(remplissagePct(duJour))}, ${Math.abs(ecart) >= 1 ? `soit ${signe(ecart)} % de recette par rapport à un jour moyen` : "comme un jour moyen"}.`,
    ...parLigne
      .slice(0, POINTS_MAXIMUM - 1)
      .map(
        (l) =>
          `${l.ligne.nom} : environ ${francs(arrondi(l.recette))}, remplissage ${pct(l.remplissage)}.`,
      ),
  ];
  return brouillon("prevision_jour", { resume, points: numeroter(textes), sources });
}

/* ------------------------------------------------------------------ « et si je baisse à… » */

function departCible(
  interp: Interpretation,
  e: EntreeMoteur,
): { departId: string } | { message: string } {
  const { ctx } = e;
  const exemple = `par exemple « Et si je baisse le 10:00 de ${ctx.lignes[0]?.nom ?? "Douala → Bafoussam"} à 3 500 F ? »`;
  if (interp.ligneIds.length > 1) {
    return { message: `Plusieurs lignes correspondent : précise la ligne, ${exemple}.` };
  }
  const ligneId = interp.ligneIds[0] ?? e.precedent?.ligneId ?? null;
  if (interp.heure !== null) {
    if (ligneId === null) return { message: `Sur quelle ligne ? Précise-la, ${exemple}.` };
    const candidats = vivants(
      ctx.departs.filter((d) => d.ligneId === ligneId && d.heure === interp.heure),
    ).sort((a, b) => a.jour.localeCompare(b.jour));
    const classique = candidats.filter((d) => d.classe === "classique");
    const choisis = classique.length > 0 ? classique : candidats;
    if (choisis.length === 0) {
      return {
        message: `Je ne trouve pas de départ à ${interp.heure} sur ${ligneParId(ctx, ligneId)?.nom ?? "cette ligne"} dans les ${BASE_JOURS} derniers jours.`,
      };
    }
    return { departId: choisis[choisis.length - 1]!.departId };
  }
  const precedent = e.precedent?.departId ?? null;
  if (precedent !== null && ctx.departs.some((d) => d.departId === precedent && !d.annule)) {
    return { departId: precedent };
  }
  return { message: `De quel départ parles-tu ? Donne la ligne et l'heure, ${exemple}.` };
}

function etSiPrix(interp: Interpretation, e: EntreeMoteur): Brouillon {
  const { ctx } = e;
  const cible = departCible(interp, e);
  if ("message" in cible) {
    return brouillon("et_si_prix", {
      resume: cible.message,
      contexte: { ligneId: interp.ligneIds[0] ?? e.precedent?.ligneId ?? null, departId: null },
      figee: true,
    });
  }
  const trouve = e.analyses.retrouver(ctx, cible.departId);
  const ligne = ligneParId(ctx, trouve.depart.ligneId);
  const contexte: ContexteConversation = {
    ligneId: trouve.depart.ligneId,
    departId: trouve.depart.departId,
  };
  const nouveauPrix = interp.prix!;
  const r = resumer(trouve.serie);

  let prix;
  try {
    prix = e.analyses.simulerDans(ctx, { type: "prix", departId: cible.departId, nouveauPrix });
  } catch (erreur) {
    if (!(erreur instanceof HttpException)) throw erreur;
    const rep = erreur.getResponse() as { message?: string };
    return brouillon("et_si_prix", {
      resume: `${rep.message ?? "Simulation impossible."}`,
      contexte,
      motsObligatoires: ligne ? [ligne.nom] : [],
      figee: true,
    });
  }

  const departLibelle = libelleDepart(trouve.serie);
  const du = decalerJour(hier(ctx.aujourdhui), -(BASE_JOURS - 1));
  const au = hier(ctx.aujourdhui);
  const sources = [
    source(
      "departs",
      `tes ventes de billets (${accorder(r.departs, "départ")} à ${trouve.serie.heure}, ${periodeTexte(du, au)})`,
      r.departs,
      du,
      au,
    ),
  ];

  // L'autre piste : se placer avant le concurrent le moins cher.
  let horaire: { nouvelleHeure: string; gainMensuel: number } | null = null;
  const concurrent = concurrentProche(ctx.offres, trouve.ligneCode, trouve.serie.heure, r.prix);
  if (concurrent && minutes(concurrent.heure) < minutes(trouve.serie.heure)) {
    const nouvelleHeure = heureDeMinutes(minutes(concurrent.heure) - AVANCE_SUR_CONCURRENT_MINUTES);
    try {
      const h = e.analyses.simulerDans(ctx, {
        type: "horaire",
        departId: cible.departId,
        nouvelleHeure,
      });
      horaire = { nouvelleHeure, gainMensuel: h.simulation.gainMensuel };
      sources.push(
        source(
          "offres_publiques",
          `l'horaire et le prix publics ${ctx.nommerConcurrents ? de(concurrent.compagnie) : "d'une autre compagnie"}`,
          concurrent.jours,
          du,
          au,
        ),
      );
    } catch (erreur) {
      if (!(erreur instanceof HttpException)) throw erreur;
    }
  }

  const phrases: string[] = [];
  const gainPrix = prix.simulation.gainMensuel;
  const equilibre = prix.simulation.passagersPourEquilibrer ?? null;
  // Le nom complet de la ligne : l'écran s'en sert pour ouvrir « Voir la ligne en détail ».
  const debut = `Le ${departLibelle}${ligne ? ` de ${ligne.nom}` : ""} : à ${francs(nouveauPrix)}`;
  if (nouveauPrix < r.prix && equilibre !== null) {
    phrases.push(
      `${debut}, il te faut ${accorder(equilibre, "passager")} de plus par départ pour gagner la même chose.`,
    );
    const objectif = r.remplis + equilibre;
    const parJour = new Map<number, number[]>();
    for (const d of trouve.serie.occurrences) {
      const j = jourSemaine(d.jour);
      parJour.set(j, [...(parJour.get(j) ?? []), d.billets]);
    }
    const atteints = [...parJour]
      .filter(([, xs]) => xs.length >= 2 && somme(xs) / xs.length >= objectif)
      .sort(([a], [b]) => ((a + 6) % 7) - ((b + 6) % 7)) // du lundi au dimanche
      .map(([j]) => `${nomJour(j)}s`);
    phrases.push(
      atteints.length > 0
        ? `Sur ${BASE_JOURS} jours, tu n'y es arrivé en moyenne que les ${liste(atteints)}.`
        : `Sur ${BASE_JOURS} jours, tu n'y es arrivé en moyenne aucun jour de la semaine.`,
    );
  } else if (nouveauPrix > r.prix) {
    const apres = prix.simulation.scenarios[1]!.remplis;
    phrases.push(
      `${debut}, chaque billet rapporte ${francs(nouveauPrix - r.prix)} de plus, mais la simulation prévoit ${accorder(apres, "voyageur")} par départ au lieu de ${nombre(Math.round(r.remplis))}.`,
    );
  }
  phrases.push(
    `Au prix de ${francs(nouveauPrix)}, la simulation donne ${signe(gainPrix)} F par mois.`,
  );
  if (horaire && horaire.gainMensuel > Math.max(gainPrix, 0)) {
    phrases.push(
      `${gainPrix < 0 ? "Je ne changerais pas le prix : je" : "Je"} déplacerais le ${departLibelle} à ${horaire.nouvelleHeure}, la simulation donne ${signe(horaire.gainMensuel)} F par mois.`,
    );
  } else if (gainPrix < 0) {
    phrases.push("Je ne changerais pas le prix.");
  }
  phrases.push(
    `C'est une hypothèse, pas une mesure : ${nombre(Math.abs(ELASTICITE_PRIX))} % de voyageurs en plus pour 1 % de baisse de prix.`,
  );

  const options: OptionSimuleeVue[] = [];
  const actions: ActionProposee[] = [];
  if (horaire) {
    options.push({ libelle: horaire.nouvelleHeure, gainMensuel: horaire.gainMensuel });
    if (horaire.gainMensuel > 0) {
      actions.push(
        actionDecaler(
          trouve.depart.departId,
          trouve.depart.ligneId,
          trouve.serie.heure,
          horaire.nouvelleHeure,
        ),
      );
    }
  }
  options.push({ libelle: `${nombre(nouveauPrix)} F`, gainMensuel: gainPrix });
  if (ligne) actions.push(actionVoirLigne(ligne.id));

  return brouillon("et_si_prix", {
    resume: phrases.join(" "),
    actions,
    sources,
    simulation: options,
    motsObligatoires: ligne ? [ligne.nom] : [],
    contexte,
  });
}

/* ------------------------------------------------------------------ où part mon argent */

function ouPartArgent(e: EntreeMoteur): Brouillon {
  const { ctx } = e;
  const { fuites, gains } = e.constats();
  const remarque = ctx.indisponibles.includes("caisse")
    ? " La caisse est indisponible : je n'ai pas pu regarder les écarts."
    : "";
  if (fuites.length === 0 && gains.length === 0) {
    return brouillon("ou_part_argent", {
      resume: `Je ne vois pas de fuite sur tes ${FUITE_JOURS} derniers jours, ni d'argent à gagner dans tes ${BASE_JOURS} derniers jours.${remarque}`,
      figee: true,
    });
  }
  const chiffre = somme(
    fuites.map((c) => (c.montantTotal !== null && c.montantTotal < 0 ? c.montantTotal : 0)),
  );
  let resume =
    fuites.length > 0
      ? `${accorder(fuites.length, "fuite repérée", "fuites repérées")} sur tes ${FUITE_JOURS} derniers jours`
      : "Aucune fuite repérée";
  resume += chiffre < 0 ? `, ${francs(chiffre)} au total chiffré.` : ".";
  if (gains.length > 0)
    resume += ` ${accorder(gains.length, "piste", "pistes")} pour gagner de l'argent.`;
  resume += remarque;

  const retenus: Constat[] = [...fuites.slice(0, 3), ...gains.slice(0, 1)];
  const textes = retenus.map((c) => c.constat);
  const actions: ActionProposee[] = [];
  const vus = new Set<string>();
  for (const c of retenus) {
    for (const a of c.actions) {
      if (!vus.has(a.id)) {
        vus.add(a.id);
        actions.push(a);
      }
    }
  }
  const sources = retenus.flatMap((c) => c.sources);
  return brouillon("ou_part_argent", {
    resume,
    points: numeroter(textes),
    actions: actions.slice(0, 4),
    sources,
  });
}

/* ------------------------------------------------------------------ point d'entrée */

function ambigue(interp: Interpretation, e: EntreeMoteur): Brouillon {
  const noms = interp.ligneIds
    .map((id) => ligneParId(e.ctx, id)?.nom)
    .filter((n): n is string => n !== undefined);
  return brouillon("ambigue", {
    resume: `Plusieurs lignes correspondent : ${noms.join(", ")}. Dis-moi laquelle, avec son nom complet, par exemple « Pourquoi ${noms[0] ?? "Douala → Bafoussam"} baisse ? ».`,
    figee: true,
  });
}

function inconnue(e: EntreeMoteur): Brouillon {
  const suggestions = questionsSuggerees(e.ctx);
  const exemples =
    suggestions.length > 0
      ? ` Tu peux demander par exemple : ${suggestions.map((q) => `« ${q} »`).join(", ")}.`
      : "";
  return brouillon("inconnue", {
    resume: `Je ne sais pas répondre à cette question avec tes chiffres.${exemples}`,
    figee: true,
  });
}

/** Calcule la réponse de référence à une question déjà interprétée. */
export function repondre(interp: Interpretation, e: EntreeMoteur): Brouillon {
  switch (interp.intention) {
    case "pourquoi_ligne":
      return pourquoiLigne(interp, e);
    case "cout_bus":
      return coutBus(e);
    case "prevision_jour":
      return previsionJour(interp, e);
    case "et_si_prix":
      return etSiPrix(interp, e);
    case "ou_part_argent":
      return ouPartArgent(e);
    case "ambigue":
      return ambigue(interp, e);
    case "inconnue":
      return inconnue(e);
  }
}

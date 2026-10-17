import { de, nombre } from "./format";
import type { AgregatReseau, DepartFait, OffrePublique, SimulationFaite } from "./modele";

/**
 * Simulation d'horaire et de prix : des calculs sur les chiffres de l'agence, jamais un texte
 * de modèle de langage. Les hypothèses sont ici, nommées, pour être discutées avec le métier.
 */

/** Fenêtre de données lue pour une simulation, en jours. */
export const BASE_JOURS = 30;
/** Moins de départs que cela dans la fenêtre : la simulation refuse de conclure. */
export const DEPARTS_MINIMUM = 5;
/** Deux départs de la même ligne ne peuvent pas être plus proches que cela. */
export const ECART_MINIMUM_MINUTES = 30;
/** Un départ placé juste avant le concurrent récupère cette part des clients qu'il manque (hypothèse). */
export const TAUX_RECUPERATION_DEVANCE = 0.9;
/** Sans concurrent à devancer, déplacer un départ ne récupère presque rien (hypothèse). */
export const TAUX_RECUPERATION_SANS_AVANTAGE = 0.25;
/** On se place ce nombre de minutes avant le départ du concurrent. */
export const AVANCE_SUR_CONCURRENT_MINUTES = 15;
/** Concurrents pris en compte : ceux dont l'horaire est à moins de cela du nôtre. */
export const PROXIMITE_CONCURRENT_MINUTES = 45;
/**
 * Élasticité-prix de la demande : − 10 % de prix, + 8 % de voyageurs (hypothèse à calibrer avec le métier).
 * Volontairement prudente (inférieure à 1 en valeur absolue) : avec une valeur plus élevée, toute baisse de
 * prix paraîtrait rentable, et l'assistant ne doit jamais conseiller de baisser un prix sur une hypothèse
 * optimiste.
 */
export const ELASTICITE_PRIX = -0.8;

export class SimulationImpossible extends Error {
  constructor(
    readonly code: "HORAIRE_EN_CONFLIT" | "DONNEES_INSUFFISANTES" | "SIMULATION_SANS_EFFET",
    message: string,
  ) {
    super(message);
    this.name = "SimulationImpossible";
  }
}

export const minutes = (heure: string): number => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(heure);
  if (!m) throw new RangeError(`Heure invalide : ${heure}`);
  return Number(m[1]) * 60 + Number(m[2]);
};

export const heureDeMinutes = (total: number): string => {
  const t = ((Math.round(total) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

/** La série d'un départ : ses occurrences (même ligne, même heure, même classe) dans la fenêtre. */
export interface SerieDepart {
  ligneId: string;
  heure: string;
  classe: DepartFait["classe"];
  occurrences: DepartFait[];
}

export const cleSerie = (d: Pick<DepartFait, "ligneId" | "heure" | "classe">): string =>
  `${d.ligneId}|${d.heure}|${d.classe}`;

/** Regroupe les départs effectués en séries, de la plus ancienne heure à la plus tardive. */
export function series(departs: readonly DepartFait[]): SerieDepart[] {
  const parCle = new Map<string, SerieDepart>();
  for (const d of departs) {
    if (d.annule) continue;
    const cle = cleSerie(d);
    const serie = parCle.get(cle) ?? {
      ligneId: d.ligneId,
      heure: d.heure,
      classe: d.classe,
      occurrences: [],
    };
    serie.occurrences.push(d);
    parCle.set(cle, serie);
  }
  return [...parCle.values()]
    .map((s) => ({
      ...s,
      occurrences: [...s.occurrences].sort((a, b) => a.jour.localeCompare(b.jour)),
    }))
    .sort((a, b) => a.heure.localeCompare(b.heure) || a.classe.localeCompare(b.classe));
}

export interface ResumeSerie {
  /** Places vendues par départ, en moyenne. */
  remplis: number;
  capacite: number;
  remplissagePct: number;
  /** Dernier tarif connu. */
  prix: number;
  /** Départs effectués dans la fenêtre. */
  departs: number;
}

export function resumer(serie: SerieDepart): ResumeSerie {
  const occ = serie.occurrences;
  const billets = occ.reduce((s, d) => s + d.billets, 0);
  const places = occ.reduce((s, d) => s + d.capacite, 0);
  const dernier = occ[occ.length - 1]!;
  return {
    remplis: occ.length === 0 ? 0 : billets / occ.length,
    capacite: occ.length === 0 ? 0 : places / occ.length,
    remplissagePct: places === 0 ? 0 : (billets / places) * 100,
    prix: dernier?.prix ?? 0,
    departs: occ.length,
  };
}

/**
 * Concurrents publics proches d'un horaire : le (nom, heure) qui revient le plus souvent dans la
 * fenêtre, à moins de 45 minutes de `heure`, moins cher que `prix`. À égalité, le plus proche.
 */
export function concurrentProche(
  offres: readonly OffrePublique[],
  ligneCode: string,
  heure: string,
  prix: number,
): { compagnie: string; heure: string; prix: number; jours: number } | null {
  const groupes = new Map<string, { o: OffrePublique; jours: Set<string>; prix: number }>();
  for (const o of offres) {
    if (o.ligneCode !== ligneCode || o.prix >= prix) continue;
    if (Math.abs(minutes(o.heure) - minutes(heure)) > PROXIMITE_CONCURRENT_MINUTES) continue;
    const cle = `${o.compagnie}|${o.heure}`;
    const g = groupes.get(cle) ?? { o, jours: new Set<string>(), prix: o.prix };
    g.jours.add(o.jour);
    g.prix = o.prix; // le tarif le plus récent (offres rendues par jour croissant)
    groupes.set(cle, g);
  }
  const meilleur = [...groupes.values()].sort(
    (a, b) =>
      b.jours.size - a.jours.size ||
      Math.abs(minutes(a.o.heure) - minutes(heure)) - Math.abs(minutes(b.o.heure) - minutes(heure)),
  )[0];
  return meilleur
    ? {
        compagnie: meilleur.o.compagnie,
        heure: meilleur.o.heure,
        prix: meilleur.prix,
        jours: meilleur.jours.size,
      }
    : null;
}

/** Places que ce départ perd chaque jour face aux autres départs de sa ligne (≥ 0). */
export function placesManquantes(serie: SerieDepart, autres: readonly DepartFait[]): number {
  const mienne = resumer(serie);
  const billets = autres.reduce((s, d) => s + d.billets, 0);
  const places = autres.reduce((s, d) => s + d.capacite, 0);
  if (places === 0) return 0;
  const reference = (billets / places) * mienne.capacite;
  return Math.max(0, reference - mienne.remplis);
}

export interface EntreeHoraire {
  serie: SerieDepart;
  /** Les départs effectués de la même ligne et classe, hors série. */
  autres: readonly DepartFait[];
  /** Les heures des autres séries de la ligne (toutes classes), pour tenir l'écart minimum. */
  heuresDeLaLigne: readonly string[];
  offres: readonly OffrePublique[];
  ligneCode: string;
  nouvelleHeure: string;
  reseau: AgregatReseau | null;
  nommerConcurrents: boolean;
}

export function simulerHoraire(e: EntreeHoraire): SimulationFaite & { concurrent: string | null } {
  const r = resumer(e.serie);
  if (r.departs < DEPARTS_MINIMUM) {
    throw new SimulationImpossible(
      "DONNEES_INSUFFISANTES",
      `Seulement ${r.departs} départs sur ${BASE_JOURS} jours : il en faut au moins ${DEPARTS_MINIMUM} pour simuler`,
    );
  }
  if (e.nouvelleHeure === e.serie.heure) {
    throw new SimulationImpossible("SIMULATION_SANS_EFFET", "Le départ est déjà à cette heure");
  }
  const voisin = e.heuresDeLaLigne.find(
    (h) =>
      h !== e.serie.heure &&
      Math.abs(minutes(h) - minutes(e.nouvelleHeure)) < ECART_MINIMUM_MINUTES,
  );
  if (voisin !== undefined) {
    throw new SimulationImpossible(
      "HORAIRE_EN_CONFLIT",
      `Un autre départ de la ligne part à ${voisin} : gardez ${ECART_MINIMUM_MINUTES} minutes d'écart`,
    );
  }

  const concurrent = concurrentProche(e.offres, e.ligneCode, e.serie.heure, r.prix);
  const devance =
    concurrent !== null &&
    minutes(e.nouvelleHeure) <= minutes(concurrent.heure) - AVANCE_SUR_CONCURRENT_MINUTES &&
    minutes(e.nouvelleHeure) < minutes(e.serie.heure);
  const taux = devance ? TAUX_RECUPERATION_DEVANCE : TAUX_RECUPERATION_SANS_AVANTAGE;
  const manque = placesManquantes(e.serie, e.autres);
  const capacite = Math.round(r.capacite);
  const avant = Math.round(r.remplis);
  const apres = Math.min(capacite, Math.round(r.remplis + manque * taux));
  const parMois = (r.departs * 30) / BASE_JOURS;
  const gainMensuel = Math.round((apres - avant) * r.prix * parMois);

  const sources = [`${r.departs} départs de ta ligne sur ${BASE_JOURS} jours`];
  if (concurrent) {
    sources.push(
      e.nommerConcurrents
        ? `l'horaire et le prix publics ${de(concurrent.compagnie)}`
        : "l'horaire et le prix publics d'une autre compagnie",
    );
  }
  if (e.reseau) {
    sources.push(
      `la moyenne anonyme de ${e.reseau.compagnies} autres compagnies sur ce créneau (${nombre(Math.round(e.reseau.remplissageMoyenPct))} % de remplissage)`,
    );
  }
  return {
    scenarios: [
      { libelle: "aujourd'hui", remplis: avant, capacite },
      { libelle: `à ${e.nouvelleHeure}`, remplis: apres, capacite },
    ],
    gainMensuel,
    base: `Basé sur ${sources.join(", ")}.`,
    concurrent: concurrent ? concurrent.compagnie : null,
  };
}

export interface EntreePrix {
  serie: SerieDepart;
  nouveauPrix: number;
}

export function simulerPrix(e: EntreePrix): SimulationFaite {
  const r = resumer(e.serie);
  if (r.departs < DEPARTS_MINIMUM) {
    throw new SimulationImpossible(
      "DONNEES_INSUFFISANTES",
      `Seulement ${r.departs} départs sur ${BASE_JOURS} jours : il en faut au moins ${DEPARTS_MINIMUM} pour simuler`,
    );
  }
  if (e.nouveauPrix === r.prix) {
    throw new SimulationImpossible("SIMULATION_SANS_EFFET", "Le départ est déjà à ce prix");
  }
  const capacite = Math.round(r.capacite);
  const avant = Math.round(r.remplis);
  const variation = (e.nouveauPrix - r.prix) / r.prix;
  const apres = Math.max(
    0,
    Math.min(capacite, Math.round(r.remplis * (1 + ELASTICITE_PRIX * variation))),
  );
  const parMois = (r.departs * 30) / BASE_JOURS;
  const gainMensuel = Math.round((apres * e.nouveauPrix - avant * r.prix) * parMois);
  const equilibre =
    e.nouveauPrix < r.prix ? Math.ceil(r.remplis * (r.prix / e.nouveauPrix - 1)) : null;
  return {
    scenarios: [
      { libelle: `aujourd'hui à ${nombre(r.prix)} F`, remplis: avant, capacite },
      { libelle: `à ${nombre(e.nouveauPrix)} F`, remplis: apres, capacite },
    ],
    gainMensuel,
    base: `Basé sur ${r.departs} départs de ta ligne sur ${BASE_JOURS} jours, avec l'hypothèse de ${nombre(Math.abs(ELASTICITE_PRIX))} % de voyageurs en plus pour 1 % de baisse de prix (une hypothèse, pas une mesure).`,
    passagersPourEquilibrer: equilibre,
  };
}

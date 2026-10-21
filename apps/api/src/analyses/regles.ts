import { decalerJour } from "../rapport/temps";
import { arrondi, accorder, de, francs, nombre } from "./format";
import type {
  ActionProposee,
  AgentRef,
  AgregatReseau,
  BusRef,
  Classe,
  Constat,
  DepartFait,
  EcartCaisseFait,
  GareRef,
  LigneRef,
  OffrePublique,
  SourceDonnee,
  VenteCadenceFait,
} from "./modele";
import { JOURS_NOMS, dateCourte, jourSemaine, nomDuJour, rangDansPeriode } from "./periodes";
import { pannesDuBus, remplissagePct, vivants } from "./agregats";
import {
  BASE_JOURS,
  SimulationImpossible,
  concurrentProche,
  heureDeMinutes,
  minutes,
  AVANCE_SUR_CONCURRENT_MINUTES,
  series,
  simulerHoraire,
} from "./simulation";

/**
 * Règles de détection. Chacune est une fonction pure : mêmes faits, mêmes constats. Les seuils sont
 * ici, nommés, pour qu'un test les attrape et que le métier puisse les corriger.
 */

/** Fenêtre des fuites (écarts, pannes, cadence) : 10 jours, comme la planche. */
export const FUITE_JOURS = 10;
/** Écarts négatifs d'un même agent à partir desquels on parle de répétition. */
export const ECARTS_REPETES_MINIMUM = 3;
/** Part des écarts tombant le même jour de la semaine pour dire « toujours le mardi ». */
export const PART_MEME_JOUR = 2 / 3;
/** En dessous de ce total, la fuite est « petite, mais régulière ». */
export const PETIT_TOTAL_FCFA = 20_000;
/** Pannes d'un même bus, dans la fenêtre des fuites, à partir desquelles il est « à surveiller ». */
export const PANNES_REPETEES_MINIMUM = 2;
/** Billets de cadence sans numéro de téléphone à partir desquels on le signale. */
export const CADENCE_SANS_NOM_MINIMUM = 5;
/** Un départ est « en retrait » quand il remplit au moins autant de points de moins que sa ligne. */
export const RETRAIT_DEPART_POINTS = 10;
/** Un concurrent compte quand il publie ce créneau au moins ce nombre de jours de la fenêtre. */
export const CONCURRENT_JOURS_MINIMUM = 15;
/** Un jour de la semaine est un creux sous cette part du remplissage moyen de la ligne. */
export const CREUX_PART_DE_LA_MOYENNE = 0.7;
/** Il faut ce nombre de jours observés pour parler d'un creux (3 semaines sur 4). */
export const CREUX_JOURS_MINIMUM = 3;
/** La veille d'un creux est « presque pleine » à partir de ce remplissage. */
export const VEILLE_PLEINE_PCT = 90;
/** Nombre de compagnies d'une moyenne du réseau pour qu'elle soit anonyme (la nôtre exclue). */
export const SEUIL_ANONYMAT = 3;

/* ------------------------------------------------------------------ contexte */

export interface ContexteRegles {
  /** Aujourd'hui, jour de Douala : le jour entamé n'entre jamais dans les calculs. */
  aujourdhui: string;
  lignes: readonly LigneRef[];
  bus: readonly BusRef[];
  agents: readonly AgentRef[];
  gares: readonly GareRef[];
  /** Les `BASE_JOURS` derniers jours complets. */
  departs: readonly DepartFait[];
  ecarts: readonly EcartCaisseFait[];
  cadence: readonly VenteCadenceFait[];
  offres: readonly OffrePublique[];
  /** Déjà filtrées par le seuil d'anonymat. */
  reseau: readonly AgregatReseau[];
  nommerConcurrents: boolean;
}

export const hier = (aujourdhui: string): string => decalerJour(aujourdhui, -1);
export const debutFuites = (aujourdhui: string): string =>
  decalerJour(hier(aujourdhui), -(FUITE_JOURS - 1));
export const debutBase = (aujourdhui: string): string =>
  decalerJour(hier(aujourdhui), -(BASE_JOURS - 1));

const nomAgent = (ctx: ContexteRegles, id: string): string =>
  ctx.agents.find((a) => a.id === id)?.nom ?? "Un agent";
const nomGare = (ctx: ContexteRegles, id: string): string =>
  ctx.gares.find((g) => g.id === id)?.nom ?? "gare inconnue";
const ligneDe = (ctx: ContexteRegles, id: string): LigneRef | undefined =>
  ctx.lignes.find((l) => l.id === id);
export const nomConcurrent = (nommer: boolean, compagnie: string): string =>
  nommer ? compagnie : "Une autre compagnie";

/* ------------------------------------------------------------------ actions */

export const actionControleInopine = (
  agentId: string,
  gareId: string,
  jour: number,
): ActionProposee => ({
  id: `controle_inopine:${agentId}:${jour}`,
  libelle: `Contrôle inopiné ${JOURS_NOMS[jour]}`,
  type: "controle_inopine",
  parametres: { type: "controle_inopine", agentId, gareId, jourSemaine: jour },
});

export const actionNumeroEnCadence = (gareId: string): ActionProposee => ({
  id: `regle_cadence_numero:${gareId}`,
  libelle: "Numéro obligatoire en cadence",
  type: "regle_cadence_numero",
  parametres: { type: "regle_cadence_numero", gareId },
});

export const actionDecaler = (
  departId: string,
  ligneId: string,
  heure: string,
  nouvelleHeure: string,
): ActionProposee => ({
  id: `decaler_depart:${departId}:${nouvelleHeure.replace(":", "")}`,
  libelle: `Décaler le ${heure} à ${nouvelleHeure} dès lundi`,
  type: "decaler_depart",
  parametres: { type: "decaler_depart", departId, ligneId, heure, nouvelleHeure },
});

export const actionAjouterDepart = (
  ligneId: string,
  jour: number,
  heure: string,
  classe: Classe,
): ActionProposee => ({
  id: `ajouter_depart:${ligneId}:${jour}:${heure.replace(":", "")}:${classe}`,
  libelle: `Ajouter un départ ${JOURS_NOMS[jour]} ${heure}`,
  type: "ajouter_depart",
  parametres: { type: "ajouter_depart", ligneId, jourSemaine: jour, heure, classe },
});

export const actionVoirLigne = (ligneId: string): ActionProposee => ({
  id: `voir_ligne:${ligneId}`,
  libelle: "Voir la ligne en détail",
  type: "voir_ligne",
  parametres: { type: "voir_ligne", ligneId },
});

/* ------------------------------------------------------------------ sources */

const source = (
  type: SourceDonnee["type"],
  description: string,
  nombreDeLignes: number,
  du: string,
  au: string,
): SourceDonnee => ({ type, description, nombre: nombreDeLignes, du, au });

const periodeTexte = (du: string, au: string): string =>
  du === au ? `le ${dateCourte(du)}` : `du ${dateCourte(du)} au ${dateCourte(au)}`;

/* ------------------------------------------------------------------ 1. écarts répétés d'un agent */

function plusFrequent<T>(valeurs: readonly T[]): { valeur: T; part: number } | null {
  if (valeurs.length === 0) return null;
  const n = new Map<T, number>();
  for (const v of valeurs) n.set(v, (n.get(v) ?? 0) + 1);
  const [valeur, compte] = [...n].sort((a, b) => b[1] - a[1])[0]!;
  return { valeur, part: compte / valeurs.length };
}

export function ecartsRepetes(ctx: ContexteRegles): Constat[] {
  const du = debutFuites(ctx.aujourdhui);
  const au = hier(ctx.aujourdhui);
  const negatifs = ctx.ecarts.filter(
    (e) => e.validee && e.ecart < -e.tolerance && e.jour >= du && e.jour <= au,
  );
  const parAgent = new Map<string, EcartCaisseFait[]>();
  for (const e of negatifs) parAgent.set(e.agentId, [...(parAgent.get(e.agentId) ?? []), e]);

  const sortie: Constat[] = [];
  for (const [agentId, ecarts] of parAgent) {
    if (ecarts.length < ECARTS_REPETES_MINIMUM) continue;
    const jours = [...new Set(ecarts.map((e) => e.jour))].sort();
    const total = ecarts.reduce((s, e) => s + e.ecart, 0);
    const agent = nomAgent(ctx, agentId);
    const dominant = plusFrequent(ecarts.map((e) => jourSemaine(e.jour)));
    const toujoursLeMemeJour = dominant !== null && dominant.part >= PART_MEME_JOUR;

    const guichets = new Set(ecarts.map((e) => `${e.guichet}|${e.gareId}`));
    const lieu =
      guichets.size === 1 ? `${ecarts[0]!.guichet} ${de(nomGare(ctx, ecarts[0]!.gareId))}` : agent;
    const constat =
      `${lieu} : ${ecarts.length} écarts négatifs` +
      (toujoursLeMemeJour ? `, toujours le ${JOURS_NOMS[dominant.valeur]}` : "") +
      (guichets.size === 1 ? `, toujours ${agent}.` : ".");

    // Les billets de cadence sans numéro vendus par cet agent ces jours-là.
    const cadence = ctx.cadence.filter(
      (c) => c.agentId === agentId && c.sansNom > 0 && jours.includes(c.jour),
    );
    const groupes = new Map<string, { heure: string; ligneId: string; n: number }>();
    for (const c of cadence) {
      const cle = `${c.ligneId}|${c.heure}`;
      const g = groupes.get(cle) ?? { heure: c.heure, ligneId: c.ligneId, n: 0 };
      g.n += c.sansNom;
      groupes.set(cle, g);
    }
    const pire = [...groupes.values()].sort((a, b) => b.n - a.n)[0];
    const phraseCadence = pire
      ? ` ${toujoursLeMemeJour ? `Les ${nomDuJour(jours[0]!)}s` : "Ces jours-là"}, le ${pire.heure} ${ligneDe(ctx, pire.ligneId)?.destination ?? ""} est en mode cadence et ${accorder(pire.n, "billet a été vendu", "billets ont été vendus")} sans numéro de téléphone.`.replace(
          "  ",
          " ",
        )
      : "";

    const sources = [
      source(
        "ecarts_caisse",
        `${accorder(ecarts.length, "clôture de caisse validée", "clôtures de caisse validées")} ${periodeTexte(jours[0]!, jours[jours.length - 1]!)}`,
        ecarts.length,
        du,
        au,
      ),
    ];
    if (pire) {
      const n = cadence.reduce((s, c) => s + c.sansNom, 0);
      sources.push(
        source(
          "billets_cadence",
          `${accorder(n, "billet de cadence sans numéro", "billets de cadence sans numéro")} vendus par le même agent ces jours-là`,
          cadence.length,
          du,
          au,
        ),
      );
    }

    const actions = [
      actionControleInopine(
        agentId,
        ecarts[0]!.gareId,
        dominant && toujoursLeMemeJour ? dominant.valeur : jourSemaine(jours[jours.length - 1]!),
      ),
    ];
    if (pire) actions.push(actionNumeroEnCadence(ecarts[0]!.gareId));

    sortie.push({
      id: `fuite:ecarts:${agentId}`,
      regle: "ecarts_repetes_agent",
      periodeJours: FUITE_JOURS,
      constat,
      explication:
        `Total ${nombre(total)}. ${Math.abs(total) < PETIT_TOTAL_FCFA ? "Petit, mais régulier." : "Régulier, et ça compte."}${phraseCadence}` +
        ` ${libelleSources(sources)}`,
      montantTotal: total,
      joursConcernes: jours.map((j) => rangDansPeriode(j, du)),
      sources,
      actions,
      simulation: null,
    });
  }
  return sortie;
}

/** « Sources : … » : la phrase qui cite les données d'un constat. */
export function libelleSources(sources: readonly SourceDonnee[]): string {
  const texte = sources.map((s) => s.description).join(" ; ");
  return `Sources : ${texte}${texte.endsWith(".") ? "" : "."}`;
}

/* ------------------------------------------------------------------ 2. pannes répétées */

export function pannesRepetees(ctx: ContexteRegles): Constat[] {
  const du = debutFuites(ctx.aujourdhui);
  const au = hier(ctx.aujourdhui);
  const recents = ctx.departs.filter((d) => d.jour >= du && d.jour <= au);
  const sortie: Constat[] = [];
  for (const bus of ctx.bus) {
    const pannes = pannesDuBus(recents, bus.id);
    if (pannes.length < PANNES_REPETEES_MINIMUM) continue;
    const jours = [...new Set(pannes.map((d) => d.jour))].sort();
    const cout = pannes.reduce((s, d) => s + d.coutPanne, 0);
    const sources = [
      source(
        "pannes",
        `${accorder(pannes.length, "panne enregistrée", "pannes enregistrées")} ${periodeTexte(jours[0]!, jours[jours.length - 1]!)}`,
        pannes.length,
        du,
        au,
      ),
    ];
    sortie.push({
      id: `fuite:pannes:${bus.id}`,
      regle: "pannes_repetees",
      periodeJours: FUITE_JOURS,
      constat: `${bus.immatriculation} : ${accorder(pannes.length, "panne")} en ${FUITE_JOURS} jours.`,
      explication:
        `Plusieurs pannes sur le même bus, c'est de l'entretien, pas de la malchance.` +
        (cout > 0 ? ` Elles ont coûté ${francs(cout)}.` : "") +
        ` ${libelleSources(sources)}`,
      montantTotal: cout > 0 ? -cout : null,
      joursConcernes: jours.map((j) => rangDansPeriode(j, du)),
      sources,
      actions: [],
      simulation: null,
    });
  }
  return sortie;
}

/** Le bus est-il « à surveiller » ? Au moins deux pannes en 10 jours. */
export function busASurveiller(
  departs: readonly DepartFait[],
  busId: string,
  aujourdhui: string,
): boolean {
  const du = debutFuites(aujourdhui);
  const au = hier(aujourdhui);
  return (
    pannesDuBus(
      departs.filter((d) => d.jour >= du && d.jour <= au),
      busId,
    ).length >= PANNES_REPETEES_MINIMUM
  );
}

/* ------------------------------------------------------------------ 3. billets de cadence sans nom */

export function cadenceSansNom(ctx: ContexteRegles, dejaTraites: ReadonlySet<string>): Constat[] {
  const du = debutFuites(ctx.aujourdhui);
  const au = hier(ctx.aujourdhui);
  const recents = ctx.cadence.filter((c) => c.jour >= du && c.jour <= au && c.sansNom > 0);
  const parAgent = new Map<string, VenteCadenceFait[]>();
  for (const c of recents) parAgent.set(c.agentId, [...(parAgent.get(c.agentId) ?? []), c]);
  const sortie: Constat[] = [];
  for (const [agentId, faits] of parAgent) {
    if (dejaTraites.has(agentId)) continue; // déjà cité avec ses écarts de caisse
    const n = faits.reduce((s, c) => s + c.sansNom, 0);
    if (n < CADENCE_SANS_NOM_MINIMUM) continue;
    const jours = [...new Set(faits.map((c) => c.jour))].sort();
    const gareId = faits[0]!.gareId;
    const sources = [
      source(
        "billets_cadence",
        `${accorder(n, "billet de cadence sans numéro", "billets de cadence sans numéro")} ${periodeTexte(jours[0]!, jours[jours.length - 1]!)}`,
        faits.length,
        du,
        au,
      ),
    ];
    sortie.push({
      id: `fuite:cadence:${agentId}`,
      regle: "cadence_sans_nom",
      periodeJours: FUITE_JOURS,
      constat: `${nomAgent(ctx, agentId)} ${de(nomGare(ctx, gareId))} : ${accorder(n, "billet vendu", "billets vendus")} sans numéro de téléphone en cadence.`,
      explication: `Sans numéro, impossible de prévenir le voyageur d'un retard ni de lui renvoyer son billet. ${libelleSources(sources)}`,
      montantTotal: null,
      joursConcernes: jours.map((j) => rangDansPeriode(j, du)),
      sources,
      actions: [actionNumeroEnCadence(gareId)],
      simulation: null,
    });
  }
  return sortie;
}

/* ------------------------------------------------------------------ 4. concurrent moins cher sur un créneau */

export function concurrentMoinsCher(ctx: ContexteRegles): Constat[] {
  const du = debutBase(ctx.aujourdhui);
  const au = hier(ctx.aujourdhui);
  const sortie: Constat[] = [];
  for (const ligne of ctx.lignes) {
    const deLaLigne = vivants(ctx.departs.filter((d) => d.ligneId === ligne.id));
    const toutes = series(deLaLigne);
    for (const serie of toutes) {
      const autres = deLaLigne.filter((d) => d.heure !== serie.heure || d.classe !== serie.classe);
      const dernier = serie.occurrences[serie.occurrences.length - 1]!;
      if (serie.occurrences.length < 5 || autres.length === 0) continue;
      const enRetrait = remplissagePct(autres) - remplissagePct(serie.occurrences);
      if (enRetrait < RETRAIT_DEPART_POINTS) continue;

      const concurrent = concurrentProche(ctx.offres, ligne.code, serie.heure, dernier.prix);
      if (!concurrent || concurrent.jours < CONCURRENT_JOURS_MINIMUM) continue;
      // On ne peut le devancer que s'il part avant nous.
      const nouvelle = minutes(concurrent.heure) - AVANCE_SUR_CONCURRENT_MINUTES;
      if (minutes(concurrent.heure) >= minutes(serie.heure)) continue;
      const nouvelleHeure = heureDeMinutes(nouvelle);

      const creneau = `${nouvelleHeure.slice(0, 2)}:00`;
      const reseau =
        ctx.reseau.find((r) => r.ligneCode === ligne.code && r.creneau === creneau) ?? null;
      let simulation;
      try {
        simulation = simulerHoraire({
          serie,
          autres: autres.filter((d) => d.classe === serie.classe),
          heuresDeLaLigne: toutes.map((s) => s.heure),
          offres: ctx.offres,
          ligneCode: ligne.code,
          nouvelleHeure,
          reseau,
          nommerConcurrents: ctx.nommerConcurrents,
        });
      } catch (e) {
        if (e instanceof SimulationImpossible) continue;
        throw e;
      }
      if (simulation.gainMensuel <= 0) continue;

      const mienne =
        serie.occurrences.reduce((s, d) => s + d.billets, 0) / serie.occurrences.length;
      const capacite =
        serie.occurrences.reduce((s, d) => s + d.capacite, 0) / serie.occurrences.length;
      const perdus = Math.max(0, (remplissagePct(autres) / 100) * capacite - mienne);
      const nom = nomConcurrent(ctx.nommerConcurrents, concurrent.compagnie);
      const sources = [
        source(
          "departs",
          `${serie.occurrences.length} départs de ${ligne.nom} à ${serie.heure} sur ${BASE_JOURS} jours`,
          serie.occurrences.length,
          du,
          au,
        ),
        source(
          "offres_publiques",
          `l'horaire et le prix publics ${ctx.nommerConcurrents ? de(concurrent.compagnie) : "d'une autre compagnie"} (${accorder(concurrent.jours, "jour")})`,
          concurrent.jours,
          du,
          au,
        ),
      ];
      if (reseau) {
        sources.push(
          source(
            "reseau_anonyme",
            `une moyenne anonyme de ${reseau.compagnies} autres compagnies sur le créneau de ${creneau}`,
            reseau.compagnies,
            du,
            au,
          ),
        );
      }
      sortie.push({
        id: `gain:horaire:${dernier.departId}`,
        regle: "concurrent_moins_cher",
        periodeJours: BASE_JOURS,
        constat:
          `${nom} part à ${concurrent.heure} à ${francs(concurrent.prix)}, moins cher que ton ${serie.heure} (${francs(dernier.prix)}) : ` +
          `ton ${serie.heure} remplit environ ${nombre(arrondi(perdus))} ${arrondi(perdus) > 1 ? "voyageurs" : "voyageur"} de moins que tes autres départs. Décale-le à ${nouvelleHeure}.`,
        explication: simulation.base,
        montantTotal: simulation.gainMensuel,
        joursConcernes: [],
        sources,
        actions: [actionDecaler(dernier.departId, ligne.id, serie.heure, nouvelleHeure)],
        simulation: {
          scenarios: simulation.scenarios,
          gainMensuel: simulation.gainMensuel,
          base: simulation.base,
        },
      });
    }
  }
  return sortie.sort((a, b) => (b.montantTotal ?? 0) - (a.montantTotal ?? 0));
}

/* ------------------------------------------------------------------ 5. creux d'un jour */

export function creuxDuJour(ctx: ContexteRegles): Constat[] {
  const du = debutBase(ctx.aujourdhui);
  const au = hier(ctx.aujourdhui);
  const sortie: Constat[] = [];
  for (const ligne of ctx.lignes) {
    const departs = vivants(ctx.departs.filter((d) => d.ligneId === ligne.id));
    if (departs.length === 0) continue;
    const moyenne = remplissagePct(departs);
    const parJourSemaine = new Map<number, DepartFait[]>();
    for (const d of departs) {
      const j = jourSemaine(d.jour);
      parJourSemaine.set(j, [...(parJourSemaine.get(j) ?? []), d]);
    }
    let pire: { jour: number; pct: number; departs: DepartFait[] } | null = null;
    for (const [jour, xs] of parJourSemaine) {
      if (new Set(xs.map((d) => d.jour)).size < CREUX_JOURS_MINIMUM) continue;
      const pct = remplissagePct(xs);
      if (pct <= moyenne * CREUX_PART_DE_LA_MOYENNE && (pire === null || pct < pire.pct)) {
        pire = { jour, pct, departs: xs };
      }
    }
    if (!pire) continue;

    const manque = pire.departs.reduce(
      (s, d) => s + Math.max(0, (moyenne / 100) * d.capacite - d.billets) * d.prix,
      0,
    );
    const veille = (pire.jour + 6) % 7;
    const departsVeille = parJourSemaine.get(veille) ?? [];
    const pctVeille = departsVeille.length === 0 ? 0 : remplissagePct(departsVeille);
    const sources = [
      source(
        "departs",
        `${accorder(pire.departs.length, "départ")} de ${ligne.nom} le ${nomDuJour(pire.departs[0]!.jour)} sur ${BASE_JOURS} jours`,
        pire.departs.length,
        du,
        au,
      ),
    ];
    const actions = [actionVoirLigne(ligne.id)];
    let phraseVeille = "";
    if (pctVeille >= VEILLE_PLEINE_PCT) {
      const plein = series(departsVeille).sort(
        (a, b) =>
          remplissagePct(b.occurrences) - remplissagePct(a.occurrences) ||
          a.heure.localeCompare(b.heure),
      )[0]!;
      actions.unshift(actionAjouterDepart(ligne.id, veille, plein.heure, plein.classe));
      phraseVeille = ` Le ${JOURS_NOMS[veille]}, la même ligne remplit à ${nombre(arrondi(pctVeille))} %.`;
    }
    const jourNom = JOURS_NOMS[pire.jour];
    sortie.push({
      id: `fuite:creux:${ligne.id}:${pire.jour}`,
      regle: "creux_jour",
      periodeJours: BASE_JOURS,
      constat: `${ligne.nom} : le ${jourNom} ne remplit qu'à ${nombre(arrondi(pire.pct))} % (moyenne ${nombre(arrondi(moyenne))} %).`,
      explication: `Manque à gagner estimé : ${francs(arrondi(manque))}.${phraseVeille} ${libelleSources(sources)}`,
      montantTotal: manque > 0 ? -arrondi(manque) : null,
      joursConcernes: [...new Set(pire.departs.map((d) => d.jour))]
        .sort()
        .map((j) => rangDansPeriode(j, du)),
      sources,
      actions,
      simulation: null,
    });
  }
  return sortie.sort((a, b) => (a.montantTotal ?? 0) - (b.montantTotal ?? 0));
}

/* ------------------------------------------------------------------ tout ensemble */

export interface Detections {
  /** « Argent qui fuit », le plus gros d'abord. */
  fuites: Constat[];
  /** « Argent à gagner », le plus gros d'abord. */
  gains: Constat[];
}

export function detecter(ctx: ContexteRegles): Detections {
  const ecarts = ecartsRepetes(ctx);
  const agentsCites = new Set(ecarts.map((c) => c.id.split(":")[2]!));
  const fuites = [
    ...ecarts,
    ...pannesRepetees(ctx),
    ...cadenceSansNom(ctx, agentsCites),
    ...creuxDuJour(ctx),
  ].sort(
    (a, b) =>
      Math.abs(b.montantTotal ?? 0) - Math.abs(a.montantTotal ?? 0) || a.id.localeCompare(b.id),
  );
  const gains = concurrentMoinsCher(ctx).sort(
    (a, b) => (b.simulation?.gainMensuel ?? 0) - (a.simulation?.gainMensuel ?? 0),
  );
  return { fuites, gains };
}

/* ------------------------------------------------------------------ avis sur un bus */

/**
 * L'avis de l'assistant sur un bus (écran Analyse d'un bus) : une règle, pas un modèle de langage.
 * Cite ce qu'il a lu : les pannes enregistrées et les trajets de la semaine.
 */
export function avisBus(
  ctx: Pick<ContexteRegles, "aujourdhui" | "bus" | "departs">,
  bus: BusRef,
  netSemaine: Map<string, { net: number; trajets: number; pannes: number }>,
): string {
  const du = debutFuites(ctx.aujourdhui);
  const au = hier(ctx.aujourdhui);
  const pannes = pannesDuBus(
    ctx.departs.filter((d) => d.jour >= du && d.jour <= au),
    bus.id,
  );
  const moi = netSemaine.get(bus.id);
  if (pannes.length >= PANNES_REPETEES_MINIMUM) {
    const cout = pannes.reduce((s, d) => s + d.coutPanne, 0);
    const meilleur = ctx.bus
      .filter((b) => b.id !== bus.id)
      .map((b) => ({ b, s: netSemaine.get(b.id) }))
      .filter((x) => x.s && x.s.trajets > 0 && x.s.pannes === 0)
      .sort((a, b) => b.s!.net - a.s!.net)[0];
    return (
      `${accorder(pannes.length, "panne")} en ${FUITE_JOURS} jours sur le même bus, c'est de l'entretien, pas de la malchance.` +
      (cout > 0 ? ` Elles t'ont coûté ${francs(cout)}.` : "") +
      ` Je mettrais ${bus.immatriculation} au garage` +
      (meilleur
        ? ` et je passerais ${bus.chauffeurNom} sur ${meilleur.b.immatriculation} (${accorder(meilleur.s!.trajets, "trajet")}, 0 incident).`
        : ".") +
      ` D'après les ${accorder(pannes.length, "panne enregistrée", "pannes enregistrées")} et les trajets de la semaine.`
    );
  }
  return (
    `Rien d'anormal sur ${bus.immatriculation} : ${accorder(moi?.trajets ?? 0, "trajet")} cette semaine, ` +
    `net ${francs(moi?.net ?? 0)}. D'après les trajets de la semaine.`
  );
}

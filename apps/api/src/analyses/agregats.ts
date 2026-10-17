import { accorder, arrondi, nombre, pct1 } from "./format";
import type { BusRef, DepartFait, GareRef, IncidentFait, LigneRef, OffrePublique } from "./modele";
import {
  abregeDuJour,
  dateCourte,
  INITIALES,
  JOURS_NOMS,
  jourSemaine,
  nomDuJour,
  semaineIso,
  tranches,
  type Fenetre,
  type Tranche,
} from "./periodes";
import { concurrentProche, series } from "./simulation";

/**
 * Agrégats : recette, remplissage, par ligne, par bus, par jour, par heure, par période. Des fonctions
 * pures des faits (`modele.ts`), au franc près, sans flottant sur les montants. Les formes rendues sont
 * celles de `@afrimove/contrats` (`patron/analyses.ts`) ; `analyses.contrat.test.ts` le vérifie avec les
 * schémas stricts.
 */

/** Cible de remplissage d'une ligne (« cible 85 » sur la planche). À confirmer : une valeur par agence ? */
export const CIBLE_REMPLISSAGE_PCT = 85;

/* ------------------------------------------------------------------ briques */

const somme = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0);
export const vivants = (departs: readonly DepartFait[]): DepartFait[] =>
  departs.filter((d) => !d.annule);

export const recetteTotale = (d: DepartFait): number => d.recetteBillets + d.recetteColis;
export const depensesTotales = (d: DepartFait): number =>
  d.carburant + d.coutPanne + d.autresDepenses;
export const netDuDepart = (d: DepartFait): number => recetteTotale(d) - depensesTotales(d);

/** Remplissage pondéré par les places : billets vendus / places offertes. */
export function remplissagePct(departs: readonly DepartFait[]): number {
  const places = somme(departs.map((d) => d.capacite));
  return places === 0 ? 0 : pct1((somme(departs.map((d) => d.billets)) / places) * 100);
}

/** Variation en % par rapport à la période d'avant (0 quand elle est vide). */
export function variationPct(actuel: number, avant: number): number {
  return avant === 0 ? 0 : pct1(((actuel - avant) / Math.abs(avant)) * 100);
}

export function dansLaFenetre(d: DepartFait, du: string, au: string): boolean {
  return d.jour >= du && d.jour <= au;
}

export function repartirParTranche(
  departs: readonly DepartFait[],
  coupes: readonly Tranche[],
  valeur: (d: DepartFait) => number,
): number[] {
  return coupes.map((t) =>
    somme(departs.filter((d) => d.jour >= t.du && d.jour <= t.au).map(valeur)),
  );
}

function parCle<T, K>(xs: readonly T[], cle: (x: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const x of xs) {
    const k = cle(x);
    const l = m.get(k);
    if (l) l.push(x);
    else m.set(k, [x]);
  }
  return m;
}

/* ------------------------------------------------------------------ formes des vues (contrats patron) */

export interface PointRecette {
  libelle: string;
  recette: number;
}
export interface PointNet {
  libelle: string;
  net: number;
}
export interface VueLigneAnalysee {
  ligneId: string;
  nom: string;
  remplissagePct: number;
  recette: number;
}
export interface VueBusAnalyse {
  busId: string;
  immatriculation: string;
  chauffeur: string;
  trajets: number;
  net: number;
  incident: string;
}
export interface VueAnalyses {
  periode: Fenetre["periode"];
  libelle: string;
  nbGares: number;
  recette: { total: number; variationPct: number; serie: PointRecette[]; lecture: string };
  lignes: VueLigneAnalysee[];
  colis: { nombre: number; recette: number };
  bus: VueBusAnalyse[];
}

export interface VueDepartAnalyse {
  departId: string;
  heure: string;
  classe: "classique" | "vip";
  prix: number;
  bus: string | null;
  note: string | null;
  remplissagePct: number;
  concurrent: { compagnie: string; heure: string; prix: number } | null;
}
export interface VueAnalyseLigne {
  ligne: { id: string; nom: string };
  periode: Fenetre["periode"];
  libelle: string;
  departsParJour: number;
  recette: { total: number; variationPct: number };
  billets: { nombre: number; departs: number };
  remplissage: { pct: number; cible: number };
  colis: { nombre: number; variationPct: number };
  departs: VueDepartAnalyse[];
  parJour: { serie: PointRecette[]; lecture: string };
  canaux: {
    enLigne: { partPct: number; billets: number; variationPts: number };
    enRoute: { billets: number; arrets: string[]; tousEnregistres: boolean };
  };
}

export interface VueTrajetBus {
  jour: "lun" | "mar" | "mer" | "jeu" | "ven" | "sam" | "dim";
  heure: string;
  origine: string;
  destination: string;
  passagers: { remplis: number; capacite: number } | null;
  recette: number | null;
  retardMinutes: number | null;
  incident: IncidentFait | null;
  net: number;
}
export interface VueAnalyseBus {
  bus: { id: string; immatriculation: string; modele: string; capacite: number; annee: number };
  chauffeur: { id: string | null; nom: string };
  statut: "ok" | "a_surveiller";
  trajetsSemaine: number;
  recette: { total: number; trajets: number; remplissagePct: number };
  depenses: { total: number; carburant: number; pannes: number };
  net: number;
  netMoyenFlotte: number;
  netParSemaine: { serie: PointNet[]; variationPct: number; depuis: string | null };
  trajets: VueTrajetBus[];
  avisAssistant: string;
}

/* ------------------------------------------------------------------ incident d'un bus (liste des bus) */

export const RETARD_LONG_MINUTES = 30;
export const HAUSSE_CARBURANT_PCT = 10;

export function incidentDuBus(
  bus: BusRef,
  courant: readonly DepartFait[],
  precedent: readonly DepartFait[],
): string {
  const pannes = courant.filter((d) => d.incident?.nature === "panne").length;
  if (pannes > 0) return accorder(pannes, "panne");
  const retards = courant.filter((d) => (d.retardMinutes ?? 0) > RETARD_LONG_MINUTES).length;
  if (retards > 0)
    return `${nombre(retards)} ${retards > 1 ? "retards" : "retard"} > ${RETARD_LONG_MINUTES} min`;
  const carburantParTrajet = (xs: readonly DepartFait[]): number =>
    xs.length === 0 ? 0 : somme(xs.map((d) => d.carburant)) / xs.length;
  const avant = carburantParTrajet(precedent);
  const maintenant = carburantParTrajet(courant);
  if (avant > 0 && maintenant > 0) {
    const hausse = (maintenant / avant - 1) * 100;
    if (hausse >= HAUSSE_CARBURANT_PCT) return `carburant + ${nombre(arrondi(hausse))} %`;
  }
  return bus.entretien ?? "0 incident";
}

/* ------------------------------------------------------------------ la synthèse */

export interface DonneesReferentiel {
  lignes: readonly LigneRef[];
  bus: readonly BusRef[];
  gares: readonly GareRef[];
}

const POURCENT_MAX_LECTURE = 100;

function lectureRecette(
  f: Fenetre,
  coupes: readonly Tranche[],
  parTranche: readonly number[],
  total: number,
  creux: { jour: string; lieu: string | null } | null,
): string {
  if (total === 0 || coupes.length < 2) return "Aucune vente sur la période.";
  const rangs = parTranche.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v || a.i - b.i);
  const [premier, deuxieme] = [rangs[0]!, rangs[1]!];
  const part = Math.min(POURCENT_MAX_LECTURE, arrondi(((premier.v + deuxieme.v) / total) * 100));
  const [a, b] = [premier, deuxieme].sort((x, y) => x.i - y.i);
  if (f.periode === "semaine") {
    const nom = (i: number): string => {
      const n = nomDuJour(coupes[i]!.du);
      return n.charAt(0).toUpperCase() + n.slice(1);
    };
    const debut = `${nom(a!.i)} et ${nomDuJour(coupes[b!.i]!.du)} font ${nombre(part)} % de la semaine.`;
    return creux
      ? `${debut} Le creux du ${nomDuJour(creux.jour)} est le plus profond${creux.lieu ? ` à ${creux.lieu}` : ""}.`
      : debut;
  }
  const faible = rangs[rangs.length - 1]!;
  return (
    `${coupes[a!.i]!.libelle} et ${coupes[b!.i]!.libelle} font ${nombre(part)} % de la période. ` +
    `${coupes[faible.i]!.libelle} est la plus faible.`
  );
}

/**
 * Le jour de la semaine où une ligne s'écarte le plus (vers le bas) de son propre remplissage moyen,
 * et la ville d'arrivée de cette ligne : « le creux du mercredi est le plus profond à Bafoussam ».
 */
function creuxLePlusProfond(
  departs: readonly DepartFait[],
  lignes: ReadonlyMap<string, LigneRef>,
): { jour: string; lieu: string | null } | null {
  let pire: { ecart: number; jour: string; ligneId: string } | null = null;
  for (const [ligneId, deLaLigne] of parCle(vivants(departs), (d) => d.ligneId)) {
    const moyenne = remplissagePct(deLaLigne);
    for (const [, duJour] of parCle(deLaLigne, (d) => d.jour)) {
      const ecart = remplissagePct(duJour) - moyenne;
      if (ecart < 0 && (pire === null || ecart < pire.ecart)) {
        pire = { ecart, jour: duJour[0]!.jour, ligneId };
      }
    }
  }
  return pire ? { jour: pire.jour, lieu: lignes.get(pire.ligneId)?.destination ?? null } : null;
}

export function synthese(
  f: Fenetre,
  departs: readonly DepartFait[],
  ref: DonneesReferentiel,
): VueAnalyses {
  const courant = vivants(departs.filter((d) => dansLaFenetre(d, f.du, f.au)));
  const avant = vivants(departs.filter((d) => dansLaFenetre(d, f.precedentDu, f.precedentAu)));
  const lignesRef = new Map(ref.lignes.map((l) => [l.id, l]));
  const busRef = new Map(ref.bus.map((b) => [b.id, b]));

  const total = somme(courant.map(recetteTotale));
  const coupes = tranches(f);
  const serieValeurs = repartirParTranche(courant, coupes, recetteTotale);
  const lecture = lectureRecette(
    f,
    coupes,
    serieValeurs,
    total,
    f.periode === "semaine" ? creuxLePlusProfond(courant, lignesRef) : null,
  );

  const lignes: VueLigneAnalysee[] = [...parCle(courant, (d) => d.ligneId)]
    .map(([ligneId, xs]) => ({
      ligneId,
      nom: lignesRef.get(ligneId)?.nom ?? ligneId,
      remplissagePct: remplissagePct(xs),
      recette: somme(xs.map((d) => d.recetteBillets)),
    }))
    .sort((a, b) => b.recette - a.recette || a.nom.localeCompare(b.nom, "fr"));

  const bus: VueBusAnalyse[] = [
    ...parCle(
      courant.filter((d) => d.busId !== null),
      (d) => d.busId!,
    ),
  ]
    .map(([busId, xs]) => {
      const b = busRef.get(busId);
      return {
        busId,
        immatriculation: b?.immatriculation ?? busId,
        chauffeur: b?.chauffeurNom ?? "",
        trajets: xs.length,
        net: somme(xs.map(netDuDepart)),
        incident: incidentDuBus(
          b ?? sansReference(busId),
          xs,
          avant.filter((d) => d.busId === busId),
        ),
      };
    })
    .sort((a, b) => b.net - a.net || a.immatriculation.localeCompare(b.immatriculation, "fr"));

  return {
    periode: f.periode,
    libelle: f.libelle,
    nbGares: ref.gares.length,
    recette: {
      total,
      variationPct: variationPct(total, somme(avant.map(recetteTotale))),
      serie: coupes.map((t, i) => ({ libelle: t.libelle, recette: serieValeurs[i]! })),
      lecture,
    },
    lignes,
    colis: {
      nombre: somme(courant.map((d) => d.colis)),
      recette: somme(courant.map((d) => d.recetteColis)),
    },
    bus,
  };
}

function sansReference(busId: string): BusRef {
  return {
    id: busId,
    immatriculation: busId,
    modele: "",
    capacite: 0,
    annee: 0,
    chauffeurId: null,
    chauffeurNom: "",
    entretien: null,
  };
}

/* ------------------------------------------------------------------ une ligne */

const ORDRE_SEMAINE: readonly number[] = [1, 2, 3, 4, 5, 6, 0]; // lundi … dimanche

function lectureParJour(
  parJour: readonly { jour: number; recette: number }[],
  moyenne: number,
): string {
  if (moyenne === 0) return "Aucune vente sur la période.";
  const tries = [...parJour].sort(
    (a, b) =>
      b.recette - a.recette || ORDRE_SEMAINE.indexOf(a.jour) - ORDRE_SEMAINE.indexOf(b.jour),
  );
  const haut = tries[0]!;
  const bas = tries[tries.length - 1]!;
  const nom = (j: number): string => JOURS_NOMS[j]!;
  const ecart = (r: number): string => {
    const e = arrondi((r / moyenne - 1) * 100);
    return e > 0 ? `+ ${nombre(e)} %` : nombre(e) + " %";
  };
  return `Le ${nom(haut.jour)} est le plus fort (${ecart(haut.recette)} par rapport à la moyenne), le ${nom(bas.jour)} le plus faible (${ecart(bas.recette)}).`;
}

export function analyseLigne(
  f: Fenetre,
  ligne: LigneRef,
  departs: readonly DepartFait[],
  ref: DonneesReferentiel,
  offres: readonly OffrePublique[],
  nommerConcurrents: boolean,
): VueAnalyseLigne {
  const deLaLigne = departs.filter((d) => d.ligneId === ligne.id);
  const courant = vivants(deLaLigne.filter((d) => dansLaFenetre(d, f.du, f.au)));
  const avant = vivants(deLaLigne.filter((d) => dansLaFenetre(d, f.precedentDu, f.precedentAu)));
  const busRef = new Map(ref.bus.map((b) => [b.id, b]));

  const recette = somme(courant.map((d) => d.recetteBillets));
  const billets = somme(courant.map((d) => d.billets));
  const enLigne = somme(courant.map((d) => d.billetsEnLigne));
  const enLigneAvant = somme(avant.map((d) => d.billetsEnLigne));
  const billetsAvant = somme(avant.map((d) => d.billets));
  const part = (a: number, b: number): number => (b === 0 ? 0 : pct1((a / b) * 100));
  const enRoute = courant.filter((d) => d.billetsEnRoute > 0);

  const parHeure = series(courant).map((s) => {
    const dernier = s.occurrences[s.occurrences.length - 1]!;
    const bus = [
      ...parCle(
        s.occurrences.filter((d) => d.busId),
        (d) => d.busId!,
      ),
    ].sort((a, b) => b[1].length - a[1].length)[0]?.[0];
    const concurrent = concurrentProche(offres, ligne.code, s.heure, dernier.prix);
    return {
      departId: dernier.departId,
      heure: s.heure,
      classe: s.classe,
      prix: dernier.prix,
      bus: bus ? (busRef.get(bus)?.immatriculation ?? bus) : null,
      note: [...s.occurrences].reverse().find((d) => d.note)?.note ?? null,
      remplissagePct: remplissagePct(s.occurrences),
      concurrent: concurrent
        ? {
            compagnie: nommerConcurrents ? concurrent.compagnie : "Une autre compagnie",
            heure: concurrent.heure,
            prix: concurrent.prix,
          }
        : null,
    } satisfies VueDepartAnalyse;
  });

  const parJourSemaine = ORDRE_SEMAINE.map((j) => ({
    jour: j,
    recette: somme(courant.filter((d) => jourSemaine(d.jour) === j).map((d) => d.recetteBillets)),
  }));
  const moyenneJour = recette / 7;

  return {
    ligne: { id: ligne.id, nom: ligne.nom },
    periode: f.periode,
    libelle: f.libelle,
    departsParJour: Math.max(1, arrondi(courant.length / f.jours)),
    recette: {
      total: recette,
      variationPct: variationPct(recette, somme(avant.map((d) => d.recetteBillets))),
    },
    billets: { nombre: billets, departs: courant.length },
    remplissage: { pct: remplissagePct(courant), cible: CIBLE_REMPLISSAGE_PCT },
    colis: {
      nombre: somme(courant.map((d) => d.colis)),
      variationPct: variationPct(
        somme(courant.map((d) => d.colis)),
        somme(avant.map((d) => d.colis)),
      ),
    },
    departs: parHeure,
    parJour: {
      serie: parJourSemaine.map((p) => ({
        libelle: INITIALES[p.jour]!,
        recette: p.recette,
      })),
      lecture: lectureParJour(parJourSemaine, moyenneJour),
    },
    canaux: {
      enLigne: {
        partPct: part(enLigne, billets),
        billets: enLigne,
        variationPts: pct1(part(enLigne, billets) - part(enLigneAvant, billetsAvant)),
      },
      enRoute: {
        billets: somme(courant.map((d) => d.billetsEnRoute)),
        arrets: [...new Set(enRoute.flatMap((d) => d.arretsEnRoute))],
        tousEnregistres: enRoute.every((d) => d.enRouteTousEnregistres),
      },
    },
  };
}

/* ------------------------------------------------------------------ un bus */

export const SEMAINES_NET = 8;

/** Pannes d'un bus dans une fenêtre : les départs avec un incident de nature « panne ». */
export function pannesDuBus(departs: readonly DepartFait[], busId: string): DepartFait[] {
  return departs.filter((d) => d.busId === busId && !d.annule && d.incident?.nature === "panne");
}

export function tendanceNet(
  nets: readonly number[],
  coupes: readonly Tranche[],
  jourPremierePanne: string | null,
): { variationPct: number; depuis: string | null } {
  if (nets.length < 2) return { variationPct: 0, depuis: null };
  let coupe = nets.length - 1;
  let depuis: string | null = null;
  if (jourPremierePanne !== null) {
    const i = coupes.findIndex((t) => jourPremierePanne >= t.du && jourPremierePanne <= t.au);
    if (i > 0) {
      coupe = i;
      depuis = `panne du ${dateCourte(jourPremierePanne)}`;
    }
  }
  const avant = nets.slice(0, coupe);
  const apres = nets.slice(coupe);
  const m = (xs: readonly number[]): number => somme(xs) / xs.length;
  return {
    variationPct: m(avant) === 0 ? 0 : pct1(((m(apres) - m(avant)) / Math.abs(m(avant))) * 100),
    depuis,
  };
}

export function analyseBus(
  f: Fenetre,
  bus: BusRef,
  departsBus: readonly DepartFait[],
  lignes: ReadonlyMap<string, LigneRef>,
  avisAssistant: string,
  statut: "ok" | "a_surveiller",
  netsFlotte: readonly number[],
  coupesNet: readonly Tranche[],
): VueAnalyseBus {
  const semaine = vivants(departsBus.filter((d) => dansLaFenetre(d, f.du, f.au)));
  const recette = somme(semaine.map(recetteTotale));
  const carburant = somme(semaine.map((d) => d.carburant));
  const pannes = somme(semaine.map((d) => d.coutPanne));
  const depenses = carburant + pannes + somme(semaine.map((d) => d.autresDepenses));
  const nets = coupesNet.map((t) =>
    somme(
      vivants(departsBus)
        .filter((d) => d.jour >= t.du && d.jour <= t.au)
        .map(netDuDepart),
    ),
  );
  const premierePanne =
    pannesDuBus(departsBus, bus.id)
      .map((d) => d.jour)
      .sort()[0] ?? null;
  const tendance = tendanceNet(nets, coupesNet, premierePanne);
  return {
    bus: {
      id: bus.id,
      immatriculation: bus.immatriculation,
      modele: bus.modele,
      capacite: bus.capacite,
      annee: bus.annee,
    },
    chauffeur: { id: bus.chauffeurId, nom: bus.chauffeurNom },
    statut,
    trajetsSemaine: semaine.length,
    recette: { total: recette, trajets: semaine.length, remplissagePct: remplissagePct(semaine) },
    depenses: { total: depenses, carburant, pannes },
    net: recette - depenses,
    netMoyenFlotte: netsFlotte.length === 0 ? 0 : arrondi(somme(netsFlotte) / netsFlotte.length),
    netParSemaine: {
      serie: coupesNet.map((t, i) => ({ libelle: `S${semaineIso(t.au)}`, net: nets[i]! })),
      variationPct: tendance.variationPct,
      depuis: tendance.depuis,
    },
    trajets: [...semaine]
      .sort((a, b) => a.jour.localeCompare(b.jour) || a.heure.localeCompare(b.heure))
      .map((d) => {
        const l = lignes.get(d.ligneId);
        return {
          jour: abregeDuJour(d.jour),
          heure: d.heure,
          origine: l?.origine ?? "",
          destination: l?.destination ?? "",
          passagers:
            d.billets > 0 || d.capacite > 0
              ? { remplis: d.billets, capacite: Math.max(1, d.capacite || bus.capacite) }
              : null,
          recette: recetteTotale(d) > 0 ? recetteTotale(d) : null,
          retardMinutes: d.retardMinutes,
          incident: d.incident,
          net: netDuDepart(d),
        };
      }),
    avisAssistant,
  };
}

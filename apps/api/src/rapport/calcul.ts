import type {
  AnnulationFaite,
  BilletVendu,
  CaisseDuJour,
  ColisEnregistre,
  CompagnieRapport,
  ControleEnRoute,
  DepartDuJour,
  GareRapport,
  QuestionSuggeree,
  RapportGare,
  RapportSoir,
  TrouNumerotation,
} from "./modele";
import {
  ETATS_BILLET_HORS_VENTE,
  SEUIL_REMPLISSAGE_BAS_PCT,
  distincts,
  formaterFcfa,
  pluriel,
  pourcentage,
  variationPct,
} from "./regles";
import { estDansLeJour, libelleJour, versIsoDouala } from "./temps";

/**
 * Calcul du rapport du soir : une fonction pure des faits du jour. Pas d'horloge, pas de base, pas
 * de hasard : les mêmes faits donnent toujours le même rapport, au franc près.
 *
 * Tous les montants sont des entiers de FCFA additionnés tels quels (aucun flottant, aucun
 * arrondi) ; les seuls arrondis sont ceux des pourcentages, à une décimale.
 */

export interface EntreesRapport {
  compagnie: CompagnieRapport;
  /** `AAAA-MM-JJ`. */
  jour: string;
  /** Instant où le rapport est arrêté. */
  arreteA: Date;
  gares: readonly GareRapport[];
  billets: readonly BilletVendu[];
  /** Nombre de billets vendus la veille (même définition), pour la variation. */
  nbBilletsVeille: number;
  colis: readonly ColisEnregistre[];
  litiges: number;
  caisses: readonly CaisseDuJour[];
  departs: readonly DepartDuJour[];
  annulations: readonly AnnulationFaite[];
  trous: readonly TrouNumerotation[];
  controles: readonly ControleEnRoute[];
  question: QuestionSuggeree | null;
  /** Sources de données indisponibles ce soir-là : une phrase par source, portée par le rapport. */
  incidents: readonly string[];
}

/** Limites de la mise en forme WhatsApp (`whatsapp/rapport.ts`, `erreursRapport`). */
export const LIMITES = {
  nomGare: 40,
  remarquesParGare: 10,
  enRoute: 300,
  remplissage: 200,
  signatures: 20,
} as const;

/** Un billet compte comme une vente s'il n'est ni annulé ni seulement réservé, et n'en remplace pas un autre. */
export function estUneVente(b: BilletVendu): boolean {
  return !(ETATS_BILLET_HORS_VENTE as readonly string[]).includes(b.etat) && b.reporteDe === null;
}

/** Une vente du jour (la date de la vente doit tomber dans le jour demandé). */
export function ventesDuJour(billets: readonly BilletVendu[], jour: string): BilletVendu[] {
  return billets.filter((b) => estUneVente(b) && estDansLeJour(b.venduA, jour));
}

/** Nombre de billets vendus ce jour-là (sert à la variation par rapport à la veille). */
export function compterVentes(billets: readonly BilletVendu[], jour: string): number {
  return ventesDuJour(billets, jour).length;
}

const somme = (valeurs: readonly number[]): number => valeurs.reduce((a, b) => a + b, 0);

function limiter(texte: string, max: number): string {
  return texte.length <= max ? texte : `${texte.slice(0, max - 1).trimEnd()}…`;
}

/* ------------------------------------------------------------------------- remplissage */

export interface AnalyseRemplissage {
  moyenPct: number;
  remarque: string | null;
  departFaible: { heure: string; remplissagePct: number } | null;
}

/**
 * Remplissage moyen = places occupées / places offertes sur tous les départs qui ont roulé ou vont
 * rouler (hors annulés et fusionnés, dont les voyageurs sont dans le départ qui les a repris).
 * Le départ le moins rempli est signalé s'il est sous le seuil.
 */
export function analyserRemplissage(
  departs: readonly DepartDuJour[],
  compagnie: string,
): AnalyseRemplissage {
  const actifs = departs.filter(
    (d) => d.etat !== "annule" && d.etat !== "fusionne" && d.capacite > 0,
  );
  const places = somme(actifs.map((d) => d.capacite));
  const vendus = somme(actifs.map((d) => d.vendus));
  const moyenPct = pourcentage(vendus, places);

  let faible: { heure: string; remplissagePct: number } | null = null;
  for (const d of actifs) {
    const pct = pourcentage(d.vendus, d.capacite);
    if (pct >= SEUIL_REMPLISSAGE_BAS_PCT) continue;
    if (
      faible === null ||
      pct < faible.remplissagePct ||
      (pct === faible.remplissagePct && d.heure < faible.heure)
    ) {
      faible = { heure: d.heure, remplissagePct: pct };
    }
  }
  const remarque =
    faible === null
      ? null
      : limiter(
          `le ${faible.heure} ${compagnie} part à ${Math.round(faible.remplissagePct)} %`,
          LIMITES.remplissage,
        );
  return { moyenPct, remarque, departFaible: faible };
}

/* ------------------------------------------------------------------------- en route */

function texteEnRoute(
  billetsConvoyeurs: number,
  controles: readonly ControleEnRoute[],
  regularisations: number,
  nonEnregistrees: number,
): string {
  const ventes =
    billetsConvoyeurs === 0
      ? "aucun billet vendu par les convoyeurs"
      : `${pluriel(billetsConvoyeurs, "billet vendu", "billets vendus")} par les convoyeurs`;
  const enregistrement =
    nonEnregistrees > 0
      ? `, ${pluriel(nonEnregistrees, "vente non enregistrée", "ventes non enregistrées")}`
      : billetsConvoyeurs > 0
        ? ", tous enregistrés"
        : "";
  let controle: string;
  if (controles.length === 0) {
    controle = "aucun contrôle";
  } else {
    controle = pluriel(controles.length, "contrôle", "contrôles");
    if (regularisations > 0) {
      const lieux = distincts(
        controles.filter((c) => c.regularisations > 0 && c.lieu !== "").map((c) => c.lieu),
      );
      controle +=
        ` : ${pluriel(regularisations, "régularisation", "régularisations")}` +
        (lieux.length > 0 ? ` à ${lieux.join(", ")}` : "");
    } else {
      controle += " : aucune régularisation";
    }
  }
  return limiter(`${ventes}${enregistrement} · ${controle}`, LIMITES.enRoute);
}

/* ------------------------------------------------------------------------- remarques d'une gare */

function remarquesCaisses(caisses: readonly CaisseDuJour[]): string[] {
  if (caisses.length === 0) return [];
  const rang = (c: CaisseDuJour): string => `guichet ${c.guichetRang}`;
  const triees = [...caisses].sort(
    (a, b) => a.guichetRang - b.guichetRang || a.numero.localeCompare(b.numero),
  );
  const fermees = triees.filter((c) => c.etat !== "ouverte");
  const ouvertes = triees.filter((c) => c.etat === "ouverte");
  const aValider = triees.filter((c) => c.etat === "cloturee");
  const avecEcart = triees.filter((c) => c.ecart !== null && c.ecart !== 0);
  const comptageAbsent = triees.filter((c) => c.comptageAbsent);
  if (
    avecEcart.length === 0 &&
    aValider.length === 0 &&
    ouvertes.length === 0 &&
    comptageAbsent.length === 0
  ) {
    return [];
  }

  const remarques: string[] = [];
  const fermeesTexte = pluriel(fermees.length, "guichet clôturé", "guichets clôturés");
  remarques.push(ouvertes.length === 0 ? fermeesTexte : `${fermeesTexte} sur ${triees.length}`);
  for (const c of triees) {
    if (c.etat === "validee" && c.validation && c.ecart !== null && c.ecart !== 0) {
      remarques.push(`${rang(c)}, validé par ${c.validation.superviseurNom}`);
    } else if (c.etat === "cloturee") {
      const ecart = c.ecart !== null && c.ecart !== 0 ? ` (écart ${formaterFcfa(c.ecart)})` : "";
      remarques.push(`${rang(c)}, caisse non validée${ecart}`);
    } else if (c.etat === "ouverte") {
      remarques.push(`${rang(c)}, caisse encore ouverte`);
    }
    if (c.comptageAbsent) remarques.push(`${rang(c)}, clôturée sans comptage`);
  }
  return remarques;
}

function remarquesDeparts(departs: readonly DepartDuJour[]): string[] {
  const remarques: string[] = [];
  const fusionnes = departs
    .filter((d) => d.etat === "fusionne" && d.fusionneAvec !== null)
    .sort((a, b) => a.heure.localeCompare(b.heure));
  if (fusionnes.length > 0) {
    const paires = fusionnes.map((d) => `${d.heure} + ${d.fusionneAvec}`);
    remarques.push(
      fusionnes.length === 1
        ? `1 départ fusionné (${paires[0]})`
        : `${fusionnes.length} départs fusionnés (${paires.join(", ")})`,
    );
  }
  const soutes = distincts(
    departs
      .filter((d) => d.soutePleine && d.etat !== "annule" && d.etat !== "fusionne")
      .map((d) => d.heure)
      .sort(),
  );
  if (soutes.length > 0) remarques.push(`soute pleine à ${soutes.join(", ")}`);
  return remarques;
}

function remarquesCadence(ventes: readonly BilletVendu[]): string[] {
  const sansNom = ventes.filter((b) => b.aCompleterAuQuai && b.sansNom);
  const nonEmbarques = sansNom.filter((b) => b.departParti && !b.embarque).length;
  const aCompleter = sansNom.length - nonEmbarques;
  const remarques: string[] = [];
  if (aCompleter > 0) {
    remarques.push(`${pluriel(aCompleter, "billet de cadence", "billets de cadence")} sans nom`);
  }
  if (nonEmbarques > 0) {
    remarques.push(
      `${pluriel(nonEmbarques, "billet de cadence vendu", "billets de cadence vendus")}, ` +
        `${nonEmbarques > 1 ? "non embarqués" : "non embarqué"}, sans nom`,
    );
  }
  return remarques;
}

/* ------------------------------------------------------------------------- le rapport */

export function construireRapport(e: EntreesRapport): RapportSoir {
  const ventes = ventesDuJour(e.billets, e.jour);
  const colis = e.colis.filter((c) => estDansLeJour(c.creeA, e.jour));
  const annulations = e.annulations.filter((a) => estDansLeJour(a.at, e.jour));

  /* ---- chiffres : tout est additionné en entiers de FCFA, momo = recette − cash ---- */
  const recetteBillets = somme(ventes.map((b) => b.montant));
  const recetteColis = somme(colis.map((c) => c.montant));
  const cashBillets = somme(ventes.filter((b) => b.mode === "cash").map((b) => b.montant));
  const cashColis = somme(colis.filter((c) => c.mode === "cash").map((c) => c.montant));
  const recette = recetteBillets + recetteColis;
  const cash = cashBillets + cashColis;

  /* ---- les gares : celles du référentiel, plus toute gare vue dans les faits ---- */
  const nomsConnus = new Map(e.gares.map((g) => [g.id, g.nom]));
  const vues = [
    ...ventes.map((b) => b.gareId),
    ...colis.map((c) => c.gareId),
    ...e.caisses.map((c) => c.gareId),
    ...e.departs.map((d) => d.gareId),
    ...annulations.map((a) => a.gareId),
  ];
  const inconnues = distincts(vues.filter((id) => !nomsConnus.has(id)));
  const gares: GareRapport[] = [...e.gares, ...inconnues.map((id) => ({ id, nom: id }))];
  const incidents = [...e.incidents];
  if (inconnues.length > 0) {
    incidents.push(`${pluriel(inconnues.length, "gare absente", "gares absentes")} du référentiel`);
  }

  const billetsParGare = new Map<string, number>();
  for (const b of ventes) billetsParGare.set(b.gareId, (billetsParGare.get(b.gareId) ?? 0) + 1);
  const ordre = [...gares].sort(
    (a, b) =>
      (billetsParGare.get(b.id) ?? 0) - (billetsParGare.get(a.id) ?? 0) ||
      a.nom.localeCompare(b.nom, "fr"),
  );
  const premiere = ordre[0]?.id ?? null;
  const idsGares = new Set(ordre.map((g) => g.id));

  const rapportGares: RapportGare[] = ordre.map((g) => {
    const caisses = e.caisses.filter((c) => c.gareId === g.id);
    const remarques = [
      ...remarquesCaisses(caisses),
      ...remarquesDeparts(e.departs.filter((d) => d.gareId === g.id)),
      ...remarquesCadence(ventes.filter((b) => b.gareId === g.id)),
      ...e.trous
        .filter((t) => t.gareId === g.id || (g.id === premiere && !idsGares.has(t.gareId ?? "")))
        .map((t) => t.message),
      ...(g.id === premiere ? incidents : []),
    ];
    const gardees =
      remarques.length > LIMITES.remarquesParGare
        ? [
            ...remarques.slice(0, LIMITES.remarquesParGare - 1),
            `${remarques.length - (LIMITES.remarquesParGare - 1)} autres remarques`,
          ]
        : remarques;
    return {
      gareId: g.id,
      nom: limiter(g.nom, LIMITES.nomGare),
      billets: billetsParGare.get(g.id) ?? 0,
      ecart: somme(caisses.map((c) => c.ecart ?? 0)),
      remarques: gardees,
    };
  });

  /* ---- signatures : les superviseurs qui ont validé une caisse de la gare ---- */
  const signatures: Array<{ nom: string; gare: string }> = [];
  const dejaSignes = new Set<string>();
  for (const g of ordre) {
    const validees = e.caisses
      .filter((c) => c.gareId === g.id && c.validation !== null)
      .sort((a, b) => a.validation!.at.localeCompare(b.validation!.at));
    for (const c of validees) {
      const v = c.validation!;
      const cle = `${v.superviseurId}|${g.id}`;
      if (dejaSignes.has(cle)) continue;
      dejaSignes.add(cle);
      signatures.push({
        nom: limiter(v.superviseurNom, LIMITES.nomGare),
        gare: limiter(g.nom, LIMITES.nomGare),
      });
    }
  }

  /* ---- en route, remplissage, annulations, en ligne ---- */
  const convoyeurs = ventes.filter((b) => b.canal === "convoyeur").length;
  const regularisations = somme(e.controles.map((c) => c.regularisations));
  const nonEnregistrees = somme(e.controles.map((c) => c.ventesNonEnregistrees));
  const remplissage = analyserRemplissage(e.departs, e.compagnie.nom);
  const enLigne = ventes.filter((b) => b.canal === "en_ligne").length;

  return {
    jour: e.jour,
    envoyeA: versIsoDouala(e.arreteA),
    titre: `Rapport du ${libelleJour(e.jour)} · ${pluriel(rapportGares.length, "gare", "gares")}`,
    nbGares: rapportGares.length,
    chiffres: {
      billets: ventes.length,
      variationBilletsPct: variationPct(ventes.length, e.nbBilletsVeille),
      colis: colis.length,
      litiges: e.litiges,
      recette,
      cash,
      momo: recette - cash,
    },
    gares: rapportGares,
    enRoute: {
      billetsConvoyeurs: convoyeurs,
      controles: e.controles.length,
      regularisations,
      texte: texteEnRoute(convoyeurs, e.controles, regularisations, nonEnregistrees),
    },
    remplissage: { moyenPct: remplissage.moyenPct, remarque: remplissage.remarque },
    annulations: {
      nombre: annulations.length,
      montant: somme(annulations.map((a) => a.montant)),
      toutesAvecPin: annulations.every((a) => a.avecPin),
    },
    enLigne: { billets: enLigne, partPct: pourcentage(enLigne, ventes.length) },
    signatures: signatures.slice(0, LIMITES.signatures),
    questionSuggeree: e.question ?? { question: "", reponse: "" },
  };
}

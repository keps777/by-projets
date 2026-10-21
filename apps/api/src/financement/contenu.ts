import type {
  DossierStocke,
  PieceStockee,
  PiecesAgence,
  ReleveMomo,
  VentesCertifiees,
} from "./modele";
import { ecartDeJours, enMs, heureCourte, jourCourt, type Instant } from "./temps";

/**
 * Textes et formats d'affichage du financement. Les phrases des pièces et de la frise de suivi sont
 * celles des planches Financement et FinancementDemande ; celles que la maquette ne montre pas (dossier
 * versé, refusé ou retiré, SMS) sont marquées « inventé » et listées dans le README.
 */

function decimale(valeur: number): string {
  return String(valeur).replace(".", ",");
}

/** `8940` donne `8 940`. */
export function groupes(entier: number): string {
  return String(Math.abs(Math.round(entier))).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** `36200000` donne `36,2 M`, `6000000` donne `6 M`, `250000` donne `250 k`. */
export function montantCourt(fcfa: number): string {
  const absolu = Math.abs(fcfa);
  if (absolu >= 1_000_000) return `${decimale(Math.round(absolu / 100_000) / 10)} M`;
  if (absolu >= 1000) return `${decimale(Math.round(absolu / 100) / 10)} k`;
  return String(absolu);
}

/** `99.8` donne `99,8`. */
export function pourcentage(valeur: number): string {
  return decimale(Math.round(valeur * 10) / 10);
}

/** « aujourd'hui 10:04 », « hier 10:04 », « demain 10:04 », sinon « 12 janv. 10:04 ». */
export function quand(instant: Instant, maintenant: Instant): string {
  const ecart = ecartDeJours(maintenant, instant);
  const heure = heureCourte(instant);
  if (ecart === 0) return `aujourd'hui ${heure}`;
  if (ecart === -1) return `hier ${heure}`;
  if (ecart === 1) return `demain ${heure}`;
  return `${jourCourt(instant)} ${heure}`;
}

/* ------------------------------------------------------------------ pièces jointes */

export interface ElementsPieces {
  ventes: VentesCertifiees;
  releve: ReleveMomo;
  pieces: PiecesAgence;
  pourcentage: number;
}

/** Les quatre pièces du dossier, fabriquées par AfriMove : le patron n'a rien à scanner. */
export function piecesDuDossier(e: ElementsPieces): PieceStockee[] {
  return [
    {
      code: "ventes",
      nom: `${e.ventes.joursCouverts} jours de ventes certifiées AfriMove`,
      detail:
        `${montantCourt(e.ventes.total)} · ${groupes(e.ventes.billets)} billets · ` +
        `${groupes(e.ventes.colis)} colis`,
      format: "pdf",
    },
    {
      code: "releves_momo",
      nom: `Relevés MoMo rapprochés · ${e.releve.mois} mois`,
      detail: `${pourcentage(e.releve.correspondancePct)} % de correspondance`,
      format: "csv",
    },
    {
      code: "registre",
      nom: "Registre de commerce · carte contribuable",
      detail: "fournis à l'inscription · valides",
      format: "pdf",
    },
    {
      code: "mandat",
      nom: `Mandat de prélèvement ${e.pourcentage} % · signé PIN`,
      detail: "sur le compte marchand MoMo · révocable à solde zéro",
      format: "pdf",
    },
  ];
}

/* ------------------------------------------------------------------ frise de suivi */

export interface EtapeVue {
  code: "envoye" | "analyse" | "versement";
  libelle: string;
  detail: string;
  at: string | null;
  etat: "fait" | "en_cours" | "a_venir";
}

/**
 * La frise : envoyé, analyse, versement. La phrase de chaque étape est écrite ici, relativement à
 * `maintenant` (« aujourd'hui 10:04 », « hier 10:04 »), et se relit donc juste le lendemain.
 */
export function suiviDuDossier(d: DossierStocke, maintenant: Instant): EtapeVue[] {
  const pct = d.mandat.pourcentage;
  const envoye: EtapeVue = {
    code: "envoye",
    libelle: "Envoyé",
    detail:
      d.accuseA !== null
        ? `${quand(d.envoyeA, maintenant)} · accusé reçu du partenaire`
        : `${quand(d.envoyeA, maintenant)} · le partenaire n'a pas encore accusé réception`,
    at: d.envoyeA,
    etat: "fait",
  };

  if (d.statut === "verse") {
    return [
      envoye,
      {
        code: "analyse",
        libelle: "Analyse",
        detail: `accordée ${quand(d.decisionA ?? d.verseA!, maintenant)}`, // inventé
        at: d.decisionA,
        etat: "fait",
      },
      {
        code: "versement",
        libelle: "Versement",
        detail: `Versement sur ton compte ${quand(d.verseA!, maintenant)} · ${pct} % de chaque billet MoMo prélevé pour rembourser`, // inventé
        at: d.verseA,
        etat: "fait",
      },
    ];
  }
  if (d.statut === "refuse") {
    return [
      envoye,
      {
        code: "analyse",
        libelle: "Analyse",
        detail: `refusée par le partenaire ${quand(d.decisionA!, maintenant)}`, // inventé
        at: d.decisionA,
        etat: "fait",
      },
      {
        code: "versement",
        libelle: "Versement",
        detail: "Versement annulé · aucun prélèvement ne sera fait", // inventé
        at: null,
        etat: "a_venir",
      },
    ];
  }
  if (d.statut === "retire") {
    return [
      envoye,
      {
        code: "analyse",
        libelle: "Analyse",
        detail: `demande retirée ${quand(d.retireA!, maintenant)}`, // inventé
        at: d.retireA,
        etat: "a_venir",
      },
      {
        code: "versement",
        libelle: "Versement",
        detail: "Versement annulé · aucun prélèvement ne sera fait", // inventé
        at: null,
        etat: "a_venir",
      },
    ];
  }
  const attendu = enMs(d.reponseAvant) > enMs(maintenant);
  return [
    envoye,
    {
      code: "analyse",
      libelle: "Analyse",
      detail: attendu
        ? `le partenaire décide seul · jusqu'à ${quand(d.reponseAvant, maintenant)}`
        : "le partenaire décide seul · sa réponse est attendue", // inventé (délai dépassé)
      at: null,
      etat: "en_cours",
    },
    {
      code: "versement",
      libelle: "Versement",
      detail: `Versement sur ton compte · SMS + notification · le ${pct} % démarre au 1er billet MoMo suivant`,
      at: null,
      etat: "a_venir",
    },
  ];
}

/* ------------------------------------------------------------------ SMS (inventés) */

export const sms = {
  verse: (d: DossierStocke): string =>
    `AfriMove : ton avance de ${groupes(d.montant)} FCFA (dossier ${d.id}) est versée sur ton compte. ` +
    `Le ${d.mandat.pourcentage} % de tes billets MoMo est prélevé pour rembourser.`,
  refuse: (d: DossierStocke): string =>
    `AfriMove : le partenaire a refusé ta demande d'avance (dossier ${d.id}). Tu peux en faire une nouvelle.`,
  soldee: (d: DossierStocke): string =>
    `AfriMove : ton avance (dossier ${d.id}) est remboursée en totalité. Le prélèvement s'arrête.`,
};

import { masquerAdresse } from "./donnees.service";
import { arrondirPct, tauxRapprochePct } from "./rapprochement";
import {
  IDS_EXPORT,
  type ActionRapprochement,
  type Cloture,
  type DecisionRapprochement,
  type DonneesMois,
  type EncaisseMois,
  type ExportFige,
  type FormatExport,
  type IdExport,
  type ResultatRapprochement,
  type TransactionFigee,
  type TransactionRapprochee,
} from "./modele";
import { ecartMobile, encaisse } from "./regles";
import {
  FORMAT_EXPORT,
  NOM_EXPORT,
  construireTableau,
  descriptionExport,
  nomAvecMois,
} from "./tableaux";
import { apercuCsv } from "./formats";
import { libelleMois } from "./temps";

/**
 * Les formes des réponses, telles que les schémas de `@afrimove/contrats` (patron/comptable) les décrivent.
 * L'API ne peut pas importer les contrats à l'exécution : `contrats.test.ts` valide chaque réponse avec leurs
 * schémas zod.
 */

export interface TransactionVue extends TransactionRapprochee {
  decision: ActionRapprochement | null;
}

export interface RapprochementVue {
  mois: string;
  libelle: string;
  transactions: number;
  surTotalVentes: number;
  montantTotal: number;
  partPct: number;
  lignes: TransactionVue[];
}

export interface SyntheseVue {
  mois: string;
  libelle: string;
  jourDeCloture: number;
  moisDisponibles: { mois: string; libelle: string }[];
  statut: "ouvert" | "cloture";
  rapprochement: {
    tauxRapprochePct: number;
    ventesMomo: { nombre: number; montant: number };
    recuMarchand: number;
    sansCorrespondance: { transactions: number; montant: number };
  };
  exports: {
    id: IdExport;
    nom: string;
    description: string;
    lignes: number | null;
    statut: "disponible" | "a_jour";
  }[];
  cabinet: {
    destinataire: string;
    automatique: boolean;
    jourDEnvoi: number;
    derniersEnvoisRecus: number;
  };
}

export interface FichierClotureVue {
  id: IdExport;
  nom: string;
  description: string;
  format: "xlsx" | "csv" | "pdf";
  tailleOctets: number | null;
  pages: number | null;
}

export interface ClotureVue {
  mois: string;
  libelle: string;
  statut: "ouvert" | "cloture";
  clotureA: string | null;
  encaisse: { total: number; cash: number; momo: number; ecart: number };
  verrouille: boolean;
  envoi: { destinataire: string; recuA: string | null; fichiers: FichierClotureVue[] };
  apercuJournal: string[];
}

const somme = (valeurs: readonly number[]): number => valeurs.reduce((s, v) => s + v, 0);

/** Une décision ne compte comme appliquée qu'une fois son effet parti (remboursement, rattachement, réclamation). */
export function decisionAppliquee(
  d: DecisionRapprochement | undefined,
): ActionRapprochement | null {
  return d && d.execution === "faite" ? d.action : null;
}

export function figerLignes(
  lignes: readonly TransactionRapprochee[],
  decisions: readonly DecisionRapprochement[],
): TransactionFigee[] {
  const parReference = new Map(decisions.map((d) => [d.reference, d]));
  return lignes.map((l) => ({ ...l, decision: decisionAppliquee(parReference.get(l.reference)) }));
}

export function lignesOuvertes(
  lignes: readonly { decision: ActionRapprochement | null }[],
): number {
  return lignes.filter((l) => l.decision === null).length;
}

/** Le taux, les montants et les lignes sans correspondance, calculés pour un mois encore ouvert. */
export function resumeRapprochement(r: ResultatRapprochement): Cloture["rapprochement"] {
  return {
    tauxRapprochePct: tauxRapprochePct(r.references, r.rapprochees, r.ventesMobile.nombre),
    ventesMobile: r.ventesMobile,
    recuMarchand: r.recuMarchand,
    sansCorrespondance: {
      transactions: r.sansCorrespondance.length,
      montant: somme(r.sansCorrespondance.map((t) => t.montant)),
    },
  };
}

export function vueRapprochement(
  mois: string,
  resume: Cloture["rapprochement"],
  lignes: readonly TransactionFigee[],
): RapprochementVue {
  const transactions = lignes.length;
  const surTotal = resume.ventesMobile.nombre;
  return {
    mois,
    libelle: libelleMois(mois),
    transactions,
    surTotalVentes: surTotal,
    montantTotal: somme(lignes.map((l) => l.montant)),
    partPct: surTotal > 0 ? arrondirPct((100 * transactions) / surTotal) : 0,
    lignes: lignes.map((l) => ({ ...l })),
  };
}

/** Ce que le mois a encaissé et l'écart restant, une fois les décisions prises en compte. */
export function encaisseOuvert(d: DonneesMois, lignes: readonly TransactionFigee[]): EncaisseMois {
  const traite = somme(lignes.filter((l) => l.decision !== null).map((l) => l.montant));
  return { ...encaisse(d.ventes), ecart: ecartMobile(d.rapprochement, traite) };
}

export function exportsOuverts(d: DonneesMois): ExportFige[] {
  return IDS_EXPORT.map((id) => {
    const { description, statut, lignes } = descriptionExport(id, d);
    return {
      id,
      nom: NOM_EXPORT[id],
      description,
      lignes,
      statut,
      format: FORMAT_EXPORT[id],
      tailleOctets: 0,
      pages: null,
    };
  });
}

export function vueSynthese(args: {
  mois: string;
  statut: "ouvert" | "cloture";
  jourDeCloture: number;
  moisDisponibles: { mois: string; libelle: string }[];
  resume: Cloture["rapprochement"];
  exports: readonly ExportFige[];
  emailCabinet: string | null;
  automatique: boolean;
  jourDEnvoi: number;
  derniersEnvoisRecus: number;
}): SyntheseVue {
  return {
    mois: args.mois,
    libelle: libelleMois(args.mois),
    jourDeCloture: args.jourDeCloture,
    moisDisponibles: args.moisDisponibles,
    statut: args.statut,
    rapprochement: {
      tauxRapprochePct: args.resume.tauxRapprochePct,
      ventesMomo: args.resume.ventesMobile,
      recuMarchand: args.resume.recuMarchand,
      sansCorrespondance: args.resume.sansCorrespondance,
    },
    exports: args.exports.map((e) => ({
      id: e.id,
      nom: e.nom,
      description: e.description,
      lignes: e.lignes,
      statut: e.statut,
    })),
    cabinet: {
      destinataire: masquerAdresse(args.emailCabinet),
      automatique: args.automatique,
      jourDEnvoi: args.jourDEnvoi,
      derniersEnvoisRecus: args.derniersEnvoisRecus,
    },
  };
}

const FORMAT_MINUSCULE: Readonly<Record<FormatExport, "xlsx" | "csv" | "pdf">> = {
  XLSX: "xlsx",
  CSV: "csv",
  PDF: "pdf",
};

/** Les trois premières lignes du journal des ventes, en CSV brut, avec son en-tête. */
export function apercuDuJournal(d: DonneesMois): string[] {
  const ventes = construireTableau("journal_ventes", d).onglets[0];
  return ventes ? apercuCsv(ventes, 3) : [];
}

export function vueClotureOuverte(d: DonneesMois, lignes: readonly TransactionFigee[]): ClotureVue {
  const e = encaisseOuvert(d, lignes);
  return {
    mois: d.mois,
    libelle: libelleMois(d.mois),
    statut: "ouvert",
    clotureA: null,
    encaisse: { total: e.total, cash: e.cash, momo: e.momo, ecart: e.ecart },
    verrouille: false,
    envoi: {
      destinataire: masquerAdresse(d.parametres.emailCabinet),
      recuA: null,
      fichiers: exportsOuverts(d).map((x) => ({
        id: x.id,
        nom: nomAvecMois(x.id, d.mois),
        description: x.description,
        format: FORMAT_MINUSCULE[x.format],
        tailleOctets: null,
        pages: null,
      })),
    },
    apercuJournal: apercuDuJournal(d),
  };
}

export function vueClotureFermee(c: Cloture): ClotureVue {
  return {
    mois: c.mois,
    libelle: libelleMois(c.mois),
    statut: "cloture",
    clotureA: c.clotureA,
    encaisse: {
      total: c.encaisse.total,
      cash: c.encaisse.cash,
      momo: c.encaisse.momo,
      ecart: c.encaisse.ecart,
    },
    verrouille: true,
    envoi: {
      destinataire: masquerAdresse(c.destinataire),
      recuA: c.envoiRecuA,
      fichiers: c.exports.map((x) => ({
        id: x.id,
        nom: nomAvecMois(x.id, c.mois),
        description: x.description,
        format: FORMAT_MINUSCULE[x.format],
        tailleOctets: x.tailleOctets,
        pages: x.pages,
      })),
    },
    apercuJournal: c.apercuJournal,
  };
}

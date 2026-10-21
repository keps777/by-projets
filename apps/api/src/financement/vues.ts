import { suiviDuDossier, type EtapeVue } from "./contenu";
import type { DossierStocke, PieceStockee, StatutDossier } from "./modele";
import { estRetirable } from "./regles";
import type { Instant } from "./temps";

/**
 * Les formes envoyées aux écrans, fabriquées champ par champ (jamais de copie d'une ligne stockée :
 * la référence du partenaire, l'agence, la version et le mandat ne sortent jamais).
 * Elles suivent `DossierFinancement` et `OffreFinancement` de `@afrimove/contrats` (patron) ; les tests
 * les valident avec ces schémas.
 */

export interface DossierVue {
  id: string;
  produit: "avance";
  statut: StatutDossier;
  partenaire: string | null;
  montant: number;
  envoyeA: string;
  reponseAvant: string;
  conditions: {
    remboursementPctVentesMomo: number;
    dureeEstimeeSemaines: number;
    coutTotalPct: number | null;
  };
  pieces: { nom: string; detail: string; format: PieceStockee["format"] }[];
  suivi: EtapeVue[];
  retirable: boolean;
}

export function vueDossier(d: DossierStocke, maintenant: Instant): DossierVue {
  return {
    id: d.id,
    produit: "avance",
    statut: d.statut,
    partenaire: d.partenaire,
    montant: d.montant,
    envoyeA: d.envoyeA,
    reponseAvant: d.reponseAvant,
    conditions: {
      remboursementPctVentesMomo: d.conditions.remboursementPctVentesMomo,
      dureeEstimeeSemaines: d.conditions.dureeEstimeeSemaines,
      coutTotalPct: d.conditions.coutTotalPct,
    },
    pieces: d.pieces.map((p) => ({ nom: p.nom, detail: p.detail, format: p.format })),
    suivi: suiviDuDossier(d, maintenant).map((e) => ({
      code: e.code,
      libelle: e.libelle,
      detail: e.detail,
      at: e.at,
      etat: e.etat,
    })),
    retirable: estRetirable(d.statut),
  };
}

export interface OffreVue {
  partenaire: string | null;
  conventionSignee: boolean;
  avance: {
    statut: "eligible" | "non_eligible" | "en_cours";
    plafond: number;
    equivalentJoursDeVentes: number;
    montantPropose: number;
    conditions: DossierVue["conditions"];
    versementSousHeures: number;
    /** Dossier de la demande ouverte (statut `en_cours`). */
    dossierId?: string;
  };
  creditMateriel: {
    description: string;
    montantTotal: number;
    mensualites: number;
    montantMensualite: number;
  };
  paie: { nbSalaires: number; jourDeVersement: string };
  billetEnDeuxFois: {
    actif: boolean;
    exemple: { prixBillet: number; reservation: number; veille: number };
  };
}

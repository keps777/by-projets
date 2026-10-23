// Étaler la part du patient : mensualité au taux du Pass, puis décision (score, règle des 33 %, employeur) via decider().
import { capaciteRestante, decider, niveauDuScore, partSalaire, tauxMensuel, type Controle, type Pass } from './credit.ts';
import { etalerPart } from './sante.ts';

export const MOIS_ETALEMENT = 3;
export const PART_MIN_ETALEMENT = 2_000;
/** Niveau START : l'étalement santé est ouvert à tous les membres. */
export const SEUIL_SCORE_SANTE = 500;
export interface EntreeEtalement { part: number; pass: Pass; score: number; salaire: number; mensualitesExistantes: number; employeur: string; anciennete: string }
export interface Etalement {
  mensualite: number; mois: number; taux: number; total: number; frais: number;
  /** Part du salaire occupée par toutes les mensualités, étalement compris. */
  partApres: number; capacite: number; approuve: boolean; motif: string | null; controles: Controle[];
}
export function evaluerEtalement(e: EntreeEtalement, mois = MOIS_ETALEMENT): Etalement {
  const taux = tauxMensuel(e.pass, niveauDuScore(e.score));
  const mensualite = e.part < PART_MIN_ETALEMENT ? 0 : etalerPart(e.part, mois, taux);
  const partenaire = e.employeur.trim().length > 0;
  const d = decider({
    score: e.score, seuilScore: SEUIL_SCORE_SANTE, salaire: e.salaire, mensualiteNouvelle: mensualite, mensualitesExistantes: e.mensualitesExistantes,
    employeurPartenaire: partenaire, ancienneteAns: parseInt(e.anciennete, 10) || 0, contratStable: partenaire,
    vehiculeControle: true, prix: e.part, financement: e.part
  });
  const controles = d.controles.filter((c) => c.id !== 'vehicule');
  const trop = e.part < PART_MIN_ETALEMENT;
  return {
    mensualite, mois, taux, total: mensualite * mois, frais: Math.max(0, mensualite * mois - e.part),
    partApres: partSalaire(mensualite + e.mensualitesExistantes, e.salaire), capacite: capaciteRestante(e.salaire, e.mensualitesExistantes),
    approuve: !trop && d.approuve && controles.every((c) => c.ok),
    motif: trop ? `L'étalement démarre à ${PART_MIN_ETALEMENT.toLocaleString('fr-FR')} FCFA de part patient.` : (controles.find((c) => !c.ok)?.titre ?? null),
    controles
  };
}

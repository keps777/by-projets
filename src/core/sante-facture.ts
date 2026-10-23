// Facture de santé : lignes, répartition AssureMe / patient par catégorie, échéance, suivi d'une ordonnance. Fonctions pures.
import { ajouterJours, type Jour } from './dates.ts';
import { repartirFacture, type Couverture, type ResultatLigne } from './sante.ts';

export type CategorieActe = 'consultation' | 'examen' | 'hospitalisation' | 'medicament' | 'ordonnance';
/** `pharmacie` : prise en charge au taux « pharmacie sur ordonnance » (70 % en Pass Famille) ; sinon taux général (80 %). */
export const CATEGORIES: Record<CategorieActe, { libelle: string; pharmacie: boolean }> = {
  consultation: { libelle: 'Consultation', pharmacie: false },
  examen: { libelle: 'Examen, analyses, imagerie', pharmacie: false },
  hospitalisation: { libelle: 'Hospitalisation', pharmacie: false },
  medicament: { libelle: 'Médicaments délivrés par la clinique', pharmacie: false },
  ordonnance: { libelle: 'Médicaments sur ordonnance (officine)', pharmacie: true }
};
export interface LigneActe { nom: string; sous: string; montant: number; categorie: CategorieActe }
export interface RepartitionActe { lignes: (ResultatLigne & LigneActe)[]; total: number; assureMe: number; patient: number; plafondDepasse: boolean }

export const MONTANT_MAX_LIGNE = 20_000_000;
export const DELAI_REGLEMENT_JOURS = 7;
export const echeanceDefaut = (date: Jour): Jour => ajouterJours(date, DELAI_REGLEMENT_JOURS);
export const tauxDe = (categorie: CategorieActe, c: Couverture) => (CATEGORIES[categorie].pharmacie ? c.pharmacie : c.taux);

/** Répartit ligne par ligne (chaque catégorie a son taux), le plafond restant s'épuisant dans l'ordre des lignes. */
export function repartirActes(lignes: LigneActe[], couverture: Couverture, plafondRestant: number): RepartitionActe {
  let restant = Math.max(0, plafondRestant), depasse = false;
  const res = lignes.map((l) => {
    const r = repartirFacture([{ montant: l.montant }], tauxDe(l.categorie, couverture), restant).lignes[0];
    restant -= r.assureMe; if (r.assureMe < Math.round(l.montant * tauxDe(l.categorie, couverture))) depasse = true;
    return { ...l, ...r };
  });
  const assureMe = res.reduce((s, l) => s + l.assureMe, 0), total = res.reduce((s, l) => s + l.montant, 0);
  return { lignes: res, total, assureMe, patient: total - assureMe, plafondDepasse: depasse };
}
/** Messages d'erreur des lignes saisies (liste vide : tout est valide). */
export function erreursLignes(lignes: LigneActe[]): string[] {
  if (!lignes.length) return ['Ajoutez au moins une ligne à la facture.'];
  const e: string[] = [];
  lignes.forEach((l, i) => {
    if (!l.nom.trim()) e.push(`Ligne ${i + 1} : indiquez le libellé de l'acte.`);
    if (!Number.isInteger(l.montant) || l.montant <= 0) e.push(`Ligne ${i + 1} : le montant doit être un nombre de francs supérieur à 0.`);
    else if (l.montant > MONTANT_MAX_LIGNE) e.push(`Ligne ${i + 1} : montant trop élevé (maximum ${MONTANT_MAX_LIGNE.toLocaleString('fr-FR')}).`);
  });
  return e;
}

export type StatutOrdonnance = 'recue' | 'preparation' | 'en_route' | 'prete' | 'livree';
export const ETAPES_LIVRAISON: StatutOrdonnance[] = ['recue', 'preparation', 'en_route', 'livree'];
export const ETAPES_RETRAIT: StatutOrdonnance[] = ['recue', 'preparation', 'prete'];
export const LIBELLE_STATUT: Record<StatutOrdonnance, string> = { recue: 'Reçue', preparation: 'En préparation', en_route: 'En route', prete: 'Prête au retrait', livree: 'Livrée' };
const MIN = 60_000;
/** Avancement simulé d'une ordonnance : préparation après 10 min, départ après 1 h, livraison promise en 2 h (retrait : prête après 1 h). */
export function statutOrdonnance(envoyeeA: number, now: number, livraison: boolean): StatutOrdonnance {
  const age = now - envoyeeA;
  if (age < 10 * MIN) return 'recue';
  if (age < 60 * MIN) return 'preparation';
  if (!livraison) return 'prete';
  return age < 120 * MIN ? 'en_route' : 'livree';
}

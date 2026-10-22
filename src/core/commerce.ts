// Commerce : encaisser avec AssureMe (payé le jour même, 1 % de frais) et crédit de stock remboursé sur les ventes.
export const FRAIS_ENCAISSEMENT = 0.01;
export const FRAIS_STOCK = 0.02;
export type ModeEncaissement = 'comptant' | 'trois' | 'salaire';
export const net = (montant: number) => Math.round(montant * (1 - FRAIS_ENCAISSEMENT));
export function modes(montant: number): { id: ModeEncaissement; court: string; valeur: number; fois: number; titre: string }[] {
  return [
    { id: 'comptant', court: '1 FOIS', valeur: montant, fois: 1, titre: 'Paiement comptant' },
    { id: 'trois', court: '3 FOIS', valeur: Math.round(montant / 3), fois: 3, titre: 'Paiement en 3 fois' },
    { id: 'salaire', court: 'SUR SALAIRE', valeur: Math.round(montant / 6), fois: 6, titre: 'Prélevé sur le salaire du client' }
  ];
}
/** Remboursement journalier d'une avance de stock : `taux` % des encaissements AssureMe du jour. */
export const remboursementJournalier = (ventesAssureMeParJour: number, tauxPct: number) => Math.round((ventesAssureMeParJour * tauxPct) / 100);
export const fraisStock = (montant: number) => Math.round(montant * FRAIS_STOCK);
export const semainesPourRembourser = (montant: number, journalier: number) => (journalier <= 0 ? Infinity : Math.ceil((montant + fraisStock(montant)) / journalier / 7));
/** Avance disponible : une part des encaissements hebdomadaires AssureMe, plafonnée par le niveau Business. */
export const avanceDisponible = (encaisseSemaine: number, partAssureMe: number, plafondNiveau: number) => Math.min(plafondNiveau, Math.round(encaisseSemaine * partAssureMe * 1.1 / 1000) * 1000);

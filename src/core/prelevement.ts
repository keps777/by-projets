// Prélèvement sur salaire : tout est prélevé le jour de paie, avant le versement du solde au membre.
export type TypePrelevement = 'pass' | 'credit' | 'coffre';
export interface LignePrelevement { id: string; type: TypePrelevement; libelle: string; detail: string; montant: number; reporte?: boolean }
export const totalPrelevement = (l: LignePrelevement[]) => l.filter((x) => !x.reporte).reduce((s, x) => s + x.montant, 0);
/** Ce qui arrive sur le compte du membre après les prélèvements. */
export const soldeVerse = (salaireNet: number, l: LignePrelevement[]) => Math.max(0, salaireNet - totalPrelevement(l));
export const partPrelevee = (l: LignePrelevement[], salaire: number) => (salaire > 0 ? totalPrelevement(l) / salaire : 0);
/** Part du Pass payée par le membre : l'employeur prend `partEmployeur` (0 à 1) du prix, dans la limite de `plafondEmployeur`. */
export const partMembrePass = (prix: number, partEmployeur: number, plafondEmployeur = 12_500) => prix - Math.min(Math.round(prix * partEmployeur), plafondEmployeur);
export const partEmployeurPass = (prix: number, partEmployeur: number, plafondEmployeur = 12_500) => Math.min(Math.round(prix * partEmployeur), plafondEmployeur);

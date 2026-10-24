// Colis : tarif par taille, options, code de retrait, chaîne d'étapes.
import type { StatutColis } from '../domain/types.ts';
export const TAILLES = { S: { nom: 'S · enveloppe', prix: 1000 }, M: { nom: 'M · carton', prix: 2500 }, L: { nom: 'L · sac', prix: 5000 } } as const;
export const SUPPLEMENT_MOTO = 1000, SUPPLEMENT_ASSURANCE = 500;
export const prixColis = (taille: keyof typeof TAILLES, o: { moto: boolean; assurance: boolean }) => TAILLES[taille].prix + (o.moto ? SUPPLEMENT_MOTO : 0) + (o.assurance ? SUPPLEMENT_ASSURANCE : 0);
export const ORDRE: StatutColis[] = ['cree', 'depose', 'en_route', 'au_relais', 'en_livraison', 'livre'];
export const LIBELLE: Record<StatutColis, string> = { cree: 'Colis créé', depose: 'Déposé au guichet', en_route: 'En route', au_relais: 'Arrivé au point relais', en_livraison: 'En livraison moto', livre: 'Livré', litige: 'Litige ouvert', annule: 'Annulé' };
export const suivant = (s: StatutColis): StatutColis | null => { const i = ORDRE.indexOf(s); return i >= 0 && i < ORDRE.length - 1 ? ORDRE[i + 1] : null; };
export const progression = (s: StatutColis) => { const i = ORDRE.indexOf(s); return i < 0 ? 0 : Math.round((i / (ORDRE.length - 1)) * 100); };
/** Code de retrait à 4 chiffres, remis au destinataire. */
export const codeRetrait = (n: number) => String(1000 + ((Math.abs(Math.floor(n)) * 7919) % 9000));
export const codeColis = (n: number) => { const A = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; let x = (Math.abs(Math.floor(n)) * 40503) % 65536, s = ''; for (let i = 0; i < 3; i++) { s += A[x % A.length]; x = Math.floor(x / A.length) + 31; } return `AM-C-${Math.floor((Math.abs(n) % 9) + 1)}${s.slice(0, 2)}`; };

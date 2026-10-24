// Plans de sièges : Classique en 2+2 (A B | C D), VIP en 1+2 (A | B C)… VIP : 3 sièges par rangée (A B C).
import type { ClasseBus } from '../domain/types.ts';
export interface Siege { id: string; rang: number; lettre: string; /** Colonne dans la grille (couloir au milieu). */ colonne: number; fenetre: boolean; devant: boolean }
export function planSieges(classe: ClasseBus, capacite: number): Siege[] {
  const lettres = classe === 'VIP' ? ['A', 'B', 'C'] : ['A', 'B', 'C', 'D'], colonnes = classe === 'VIP' ? [1, 2, 3] : [1, 2, 4, 5], res: Siege[] = [];
  for (let r = 1; res.length < capacite; r++) for (let i = 0; i < lettres.length && res.length < capacite; i++)
    res.push({ id: `${r}${lettres[i]}`, rang: r, lettre: lettres[i], colonne: colonnes[i], fenetre: i === 0 || i === lettres.length - 1, devant: r === 1 });
  return res;
}
export const SUPPLEMENT_DEVANT = 1500;
/** Supplément de siège : la première rangée d'un Classique est « confort » (+1 500 F). */
export const supplementSiege = (classe: ClasseBus, id: string) => (classe === 'Classique' && /^1[A-D]$/.test(id) ? SUPPLEMENT_DEVANT : 0);

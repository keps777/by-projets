// Disposition des blocs qui se chevauchent : chaque groupe de blocs qui se touchent est partagé en colonnes.

export interface Intervalle { debut: number; fin: number }
export interface Placement { col: number; cols: number }

/**
 * Retourne, pour chaque intervalle (dans l'ordre reçu), sa colonne et le nombre de colonnes de son groupe.
 * Un bloc prend la première colonne libre ; deux blocs bout à bout (fin = début) ne se chevauchent pas.
 */
export function disposer(items: Intervalle[]): Placement[] {
  const res: Placement[] = items.map(() => ({ col: 0, cols: 1 }));
  const ordre = items.map((_, i) => i).sort((a, b) => items[a].debut - items[b].debut || items[b].fin - items[a].fin);
  let colonnes: number[] = [];
  let groupe: number[] = [];
  let finGroupe = -Infinity;
  const clore = () => { for (const i of groupe) res[i].cols = colonnes.length; colonnes = []; groupe = []; };
  for (const i of ordre) {
    const { debut, fin } = items[i];
    if (debut >= finGroupe && groupe.length) clore();
    let col = colonnes.findIndex((f) => f <= debut);
    if (col < 0) { col = colonnes.length; colonnes.push(fin); } else colonnes[col] = fin;
    res[i].col = col;
    groupe.push(i);
    finGroupe = groupe.length === 1 ? fin : Math.max(finGroupe, fin);
  }
  if (groupe.length) clore();
  return res;
}

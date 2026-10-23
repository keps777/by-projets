// Identité de CET appareil (stockée à part de l'état, pour reconnaître un nouvel appareil).
import { nouvelId } from '../../data/store.svelte.ts';
import { nomAppareil } from '../../core/inscription.ts';

const CLE = 'assureme.appareil';
let enMemoire: string | null = null;
export function idAppareil(): string {
  if (enMemoire) return enMemoire;
  try { const v = localStorage.getItem(CLE); if (v) return (enMemoire = v); } catch { /* stockage indisponible */ }
  enMemoire = nouvelId('d');
  try { localStorage.setItem(CLE, enMemoire); } catch { /* idem */ }
  return enMemoire;
}
export const descriptionAppareil = () => nomAppareil(typeof navigator !== 'undefined' ? navigator.userAgent : '');

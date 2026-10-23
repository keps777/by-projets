import { synchroniser } from './actions.ts';
let fait = false;
/** À la connexion : constate les livraisons échues (le remboursement des avances se fait à chaque encaissement, pas sur la paie). */
export default function demarrage() {
  if (fait) return; fait = true;
  synchroniser();
  setInterval(() => synchroniser(), 60_000);
}

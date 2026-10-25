import { amorcerVille, } from './actions.ts';
import { amorcerCovoit } from './covoitActions.ts';
/** Au lancement : départs de covoiturage en ville à proposer, puis conducteurs, profils et offres de démonstration des 7 prochains jours (idempotent). */
export default function demarrage() {
  try { amorcerVille(); } catch { /* monde indisponible : l'écran réessaiera */ }
  try { amorcerCovoit(); } catch { /* idem */ }
}

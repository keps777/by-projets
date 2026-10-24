import { amorcerVille } from './actions.ts';
/** Au lancement : s'assure qu'il y a des départs de covoiturage en ville à proposer. */
export default function demarrage() { try { amorcerVille(); } catch { /* monde indisponible : l'écran réessaiera */ } }

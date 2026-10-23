// Enregistre les prélèvements du logement dans le moteur de paie (importé au démarrage de l'appli).
import { fournirPrelevements } from '../../data/paie.ts';
import { lignesLogement } from './prelevements.ts';

fournirPrelevements('logement', lignesLogement);
/** Rien à lancer à la connexion : le moteur de paie rattrape les prélèvements. */
export default function demarrage() {}

import { fournirPrelevements } from '../../data/paie.ts';
import { crediterInterets, lignesCoffres } from './actions.ts';
import { etatCoffres } from './etat.ts';

// Le versement automatique des coffres est prélevé le jour de paie (voir data/paie.ts).
fournirPrelevements('coffres', lignesCoffres);

let fait = false;
/** À la connexion : crée la tranche puis crédite les intérêts des mois écoulés. */
export default function demarrage() { if (fait) return; fait = true; etatCoffres(); crediterInterets(); }

import { fournirPrelevements } from '../../data/paie.ts';
import { app, maintenant } from '../../data/store.svelte.ts';
import { court } from '../../core/money.ts';
import { avancer } from './actions.ts';
import type { EtatProtection } from './etat.ts';

let fait = false;
/**
 * La protection n'est pas un crédit mais une prime mensuelle : elle passe dans le prélèvement de paie avec le type « credit »
 * (seul type adapté) et un libellé explicite. Lecture seule de la tranche : l'aperçu ne doit rien créer ni modifier.
 */
export default function demarrage() {
  if (fait) return; fait = true;
  fournirPrelevements('protection', (paie) => {
    const s = (app.tranches['protection'] as EtatProtection | undefined)?.souscription;
    if (!s || paie <= s.depuis) return [];
    return [{
      id: 'protection', type: 'credit', libelle: 'Protection famille · prime du mois', detail: `${s.assureIds.length} pers. · capital ${court(s.capital)}`, montant: s.prime,
      appliquer: () => { s.primesPayees++; }
    }];
  });
  avancer();
  setInterval(() => avancer(maintenant()), 60_000);
}

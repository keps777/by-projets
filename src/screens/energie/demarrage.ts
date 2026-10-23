import { fournirPrelevements } from '../../data/paie.ts';
import { app } from '../../data/store.svelte.ts';
import { mensualitePayee, mensualiteReportee } from './actions.ts';

let fait = false;
/** Mensualités des kits solaires : prélevées sur salaire (lecture seule des crédits ; l'aperçu ne modifie rien). */
export default function demarrage() {
  if (fait) return; fait = true;
  fournirPrelevements('energie', (paie) => app.credits
    .filter((c) => c.produit === 'solaire' && c.statut === 'actif' && c.prochaine <= paie)
    .map((c) => ({
      id: c.id, type: 'credit' as const, libelle: c.libelle, detail: `Mensualité ${c.payees + 1} / ${c.duree}`, montant: c.mensualite,
      appliquer: () => mensualitePayee(c.id, paie), reporter: () => mensualiteReportee(c.id, paie)
    })));
}

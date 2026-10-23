// Prélèvement sur salaire des parts de santé étalées (mensualités du crédit « santé »), enregistré dès le chargement du module
// pour que le rattrapage des paies manquées (socle) les voie aussi.
import { ajouterMois } from '../../core/dates.ts';
import { POINTS } from '../../core/score.ts';
import { ajouterPoints } from '../score/actions.ts';
import { fournirPrelevements, type LigneAvecEffet } from '../../data/paie.ts';
import { app } from '../../data/store.svelte.ts';

/** Une ligne par mensualité de santé échue à la paie `paie` (les crédits « c-pay-… », étalés depuis l'écran de paiement, sont prélevés par l'accueil). */
export function lignesSante(paie: string): LigneAvecEffet[] {
  return app.credits.filter((c) => c.produit === 'sante' && !c.id.startsWith('c-pay-') && c.statut === 'actif' && c.prochaine <= paie).map((c) => ({
    id: c.id, type: 'credit' as const, libelle: c.libelle, detail: `Mensualité ${c.payees + 1} / ${c.duree}`, montant: c.mensualite,
    appliquer: () => {
      c.payees += 1; ajouterPoints('Mensualité santé payée à l’heure', POINTS.mensualiteHeure, 'ponctualite');
      if (c.payees >= c.duree) c.statut = 'termine'; else c.prochaine = ajouterMois(c.prochaine, 1);
    },
    /** Solde insuffisant : reporté d'un mois, sans pénalité. */
    reporter: () => { c.prochaine = ajouterMois(c.prochaine, 1); }
  }));
}
fournirPrelevements('sante', lignesSante);
export default function demarrage() { /* l'enregistrement se fait à l'import */ }

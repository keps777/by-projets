// Prélèvement sur salaire des parts de santé étalées (mensualités du crédit « santé »), enregistré dès le chargement du module
// pour que le rattrapage des paies manquées (socle) les voie aussi.
import { ajouterMois } from '../../core/dates.ts';
import { POINTS, borner } from '../../core/score.ts';
import { fournirPrelevements, type LigneAvecEffet } from '../../data/paie.ts';
import { app } from '../../data/store.svelte.ts';

/** Une ligne par mensualité de santé échue à la paie `paie`. */
export function lignesSante(paie: string): LigneAvecEffet[] {
  return app.credits.filter((c) => c.produit === 'sante' && c.statut === 'actif' && c.prochaine <= paie).map((c) => ({
    id: c.id, type: 'credit' as const, libelle: c.libelle, detail: `Mensualité ${c.payees + 1} / ${c.duree}`, montant: c.mensualite,
    appliquer: () => {
      c.payees += 1; app.score.valeur = borner(app.score.valeur + POINTS.mensualiteHeure);
      if (c.payees >= c.duree) c.statut = 'termine'; else c.prochaine = ajouterMois(c.prochaine, 1);
    },
    /** Solde insuffisant : reporté d'un mois, sans pénalité. */
    reporter: () => { c.prochaine = ajouterMois(c.prochaine, 1); }
  }));
}
fournirPrelevements('sante', lignesSante);
export default function demarrage() { /* l'enregistrement se fait à l'import */ }

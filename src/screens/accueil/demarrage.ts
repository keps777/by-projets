// Prélèvement sur salaire des factures étalées (« Étaler sur 3 mois ») : un crédit court par facture, id « c-pay-… ».
import { app } from '../../data/store.svelte.ts';
import { fournirPrelevements, type LigneAvecEffet } from '../../data/paie.ts';
import { ajouterMois, enDate, type Jour } from '../../core/dates.ts';
import { POINTS } from '../../core/score.ts';
import { gagnerPoints } from './actions.ts';

const ecartMois = (a: Jour, b: Jour) => { const x = enDate(a), y = enDate(b); return (y.getFullYear() - x.getFullYear()) * 12 + y.getMonth() - x.getMonth(); };

export function lignesEtalement(paie: Jour): LigneAvecEffet[] {
  const jourPaie = app.compte?.jourPaie ?? 28;
  return app.credits.filter((c) => c.id.startsWith('c-pay-') && c.statut === 'actif').flatMap((c): LigneAvecEffet[] => {
    const rang = ecartMois(c.prochaine, paie);
    if (rang < 0 || rang >= c.duree - c.payees) return [];
    return [{
      id: c.id, type: 'credit', libelle: c.libelle, detail: `Étalement ${c.payees + rang + 1} / ${c.duree}`, montant: c.mensualite,
      appliquer: () => {
        c.payees += 1; c.prochaine = ajouterMois(c.prochaine, 1, jourPaie);
        if (c.payees >= c.duree) c.statut = 'termine';
        gagnerPoints(POINTS.mensualiteHeure, undefined, 'Mensualité payée à l’heure');
      },
      reporter: () => { c.prochaine = ajouterMois(c.prochaine, 1, jourPaie); }
    }];
  });
}
// Enregistré à l'import (avant tout démarrage) pour que le rattrapage des paies manquées voie déjà ces prélèvements.
fournirPrelevements('paiements', lignesEtalement);
export default function demarrage() { /* rien à lancer : le fournisseur est déjà enregistré */ }

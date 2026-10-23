// Le Pass est prélevé sur salaire : la part du membre (après la part de l'employeur) passe à chaque paie, ou une fois l'an en facturation annuelle.
import { app } from '../../data/store.svelte.ts';
import { fournirPrelevements } from '../../data/paie.ts';
import { ajouterMois, jourDe, prochainePaie } from '../../core/dates.ts';
import { planDe, tarifPass, trouverEmployeur } from '../../core/inscription.ts';
import { etatAuth } from './etat.ts';

fournirPrelevements('pass', (paie) => {
  const c = app.compte; if (!c) return [];
  const e = etatAuth();
  const echeance = e.passEcheance ?? prochainePaie(jourDe(new Date(c.cree)), c.jourPaie);
  if (paie < echeance) return [];
  const tarif = tarifPass(c.pass, e.facturation, trouverEmployeur(e.employeurCode));
  if (tarif.membre <= 0) return [];
  const pas = e.facturation === 'annuel' ? 12 : 1;
  return [{
    id: 'pass', type: 'pass', libelle: `Pass ${planDe(c.pass).nom}`, detail: e.facturation === 'annuel' ? 'Facturation annuelle' : 'Mensuel', montant: tarif.membre,
    appliquer: () => { etatAuth().passEcheance = ajouterMois(paie, pas, c.jourPaie); },
    reporter: () => { /* reporté d'un mois sans pénalité : l'échéance reste, le Pass sera repris à la prochaine paie */ }
  }];
});

/** Rien à relancer à la connexion : le prélèvement du Pass est enregistré à l'import. */
export default function demarrage() { /* idempotent */ }

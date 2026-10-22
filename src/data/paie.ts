// Moteur de paie : le jour de paie, le salaire est versé puis les prélèvements des fonctionnalités sont passés.
// Une fonctionnalité s'enregistre avec `fournirPrelevements(id, fn)` dans son `demarrage.ts`. Les paies manquées (appli fermée) sont rattrapées.
import { ajouterMois, jourDe, paiesEntre, prochainePaie, jourCourt, type Jour } from '../core/dates.ts';
import type { LignePrelevement } from '../core/prelevement.ts';
import { app, maintenant, mouvement, notifier } from './store.svelte.ts';

export interface LigneAvecEffet extends LignePrelevement {
  /** Appelé une fois le prélèvement passé (avance le crédit, crédite le coffre, renouvelle le Pass…). */
  appliquer: () => void;
  /** Appelé si le solde ne suffit pas (le prélèvement est reporté d'un mois, sans pénalité). */
  reporter?: () => void;
}
type Fournisseur = (paie: Jour) => LigneAvecEffet[];
const fournisseurs = new Map<string, Fournisseur>();
export const fournirPrelevements = (id: string, f: Fournisseur) => void fournisseurs.set(id, f);
const ORDRE: Record<string, number> = { pass: 0, credit: 1, coffre: 2 };

/** Lignes qui seront prélevées à la paie `paie` (aperçu inclus : n'applique rien). */
export const lignesDe = (paie: Jour): LigneAvecEffet[] => [...fournisseurs.values()].flatMap((f) => f(paie)).sort((a, b) => ORDRE[a.type] - ORDRE[b.type]);

/** Passe une paie : salaire, puis chaque prélèvement tant que le solde le permet. */
export function passerPaie(paie: Jour) {
  const c = app.compte; if (!c) return;
  mouvement({ titre: 'Salaire reçu', sous: c.employeur, montant: c.salaireNet, ini: 'SA', categorie: 'salaire', ts: Date.parse(paie + 'T09:00:00') });
  let total = 0; let reportes = 0;
  for (const l of lignesDe(paie)) {
    if (l.reporte || app.solde < l.montant) { l.reporter?.(); reportes++; continue; }
    mouvement({ titre: l.libelle, sous: l.detail, montant: -l.montant, ini: l.type === 'coffre' ? 'CO' : l.type === 'pass' ? 'PA' : 'CR', categorie: l.type, ts: Date.parse(paie + 'T09:01:00') });
    l.appliquer(); total += l.montant;
  }
  notifier({ titre: 'Salaire reçu, prélèvements faits', sous: `${total.toLocaleString('fr-FR')} prélevés${reportes ? ` · ${reportes} reporté${reportes > 1 ? 's' : ''}` : ''}`, ts: Date.parse(paie + 'T09:02:00'), lien: '/prelevement' });
  app.dernierePaie = paie;
}

/** Au démarrage : rattrape toutes les paies échues depuis la dernière traitée. */
export function rattraperPaies(now = maintenant()) {
  const c = app.compte; if (!c) return 0;
  const aujourdhui = jourDe(new Date(now));
  const depuis = app.dernierePaie ?? ajouterMois(prochainePaie(jourDe(new Date(c.cree)), c.jourPaie), -1);
  const dues = paiesEntre(depuis, aujourdhui, c.jourPaie);
  dues.forEach(passerPaie);
  return dues.length;
}
export const prochaine = (now = maintenant()): Jour | null => (app.compte ? prochainePaie(jourDe(new Date(now)), app.compte.jourPaie) : null);
export const libelleProchaine = () => { const p = prochaine(); return p ? jourCourt(p) : ''; };

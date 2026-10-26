// Pass NexG (abonnement, simulé) : avantages, niveaux (hypothèse), souscription et résiliation. Aucun paiement réel.
import { maintenant } from '../../data/store.svelte.ts';
import { fmt } from '../../core/argent.ts';
import { PRIX_PASS, TAUX_COMMISSION, TAUX_COMMISSION_PASS } from '../../core/regles.ts';
import { compteDe, notifier } from '../../domain/compte.ts';
import { ecrire } from '../../domain/marche.ts';
import type { Monde } from '../../domain/types.ts';

const NB = ' ', AN = 365 * 24 * 3_600_000;
/** « 12,5 % » / « 10 % » (espace insécable). */
export const pct = (taux: number): string => `${String(Math.round(taux * 1000) / 10).replace('.', ',')}${NB}%`;
export const prixPass = (): string => fmt(PRIX_PASS, { centimes: true });
/** Seuils de niveau (hypothèse, noms d'exemple) : transactions sur les 12 derniers mois. */
export const SEUIL_PRO = 5, SEUIL_PREMIUM = 20;
export interface Niveau { n: 1 | 2 | 3; nom: string; sous: string; commission: string }
export const NIVEAUX: Niveau[] = [
  { n: 1, nom: 'Pass', sous: 'Dès l’abonnement · drops membres, alertes', commission: pct(TAUX_COMMISSION_PASS) },
  { n: 2, nom: 'Pass Pro', sous: `Ex.${NB}: dès ${SEUIL_PRO} transactions / an · drops prioritaires, historique avancé`, commission: pct(TAUX_COMMISSION_PASS) },
  { n: 3, nom: 'Pass Premium', sous: `Ex.${NB}: dès ${SEUIL_PREMIUM} transactions / an · commission plus basse, drops prioritaires`, commission: `<${NB}${pct(TAUX_COMMISSION_PASS)}` }
];
export const AVANTAGES = [
  { icone: 'drops', titre: 'Accès aux Drops membres', texte: `Billets à prix réduit, mis en vente par petits lots. Réductions visées${NB}: −60 à −80${NB}% du prix équivalent — objectif à valider, jamais garanti.` },
  { icone: 'cloche', titre: 'Alertes de drops', texte: 'Prévenu à l’ouverture, par zone ou par trajet.' },
  { icone: 'piece', titre: 'Commission de revente réduite', texte: `${pct(TAUX_COMMISSION_PASS)} au lieu de ${pct(TAUX_COMMISSION)} sur chaque revente — hypothèse` },
  { icone: 'calendrier', titre: 'Historique de prix avancé', texte: 'L’évolution du prix équivalent, trajet par trajet.' }
];
export type Cellule = 'inclus' | 'non' | string;
export const COMPARAISON: { fonction: string; gratuit: Cellule; pass: Cellule; gras?: boolean }[] = [
  { fonction: 'Acheter, revendre, transférer', gratuit: 'inclus', pass: 'inclus' }, { fonction: 'Drops membres', gratuit: 'non', pass: 'inclus' }, { fonction: 'Alertes de drops', gratuit: 'non', pass: 'inclus' },
  { fonction: 'Commission de revente*', gratuit: pct(TAUX_COMMISSION), pass: pct(TAUX_COMMISSION_PASS) }, { fonction: 'Historique de prix avancé', gratuit: 'non', pass: 'inclus' },
  { fonction: 'Prix', gratuit: fmt(0), pass: fmt(PRIX_PASS, { centimes: true }), gras: true }
];
/** Transactions du compte sur les 12 derniers mois : achats, reventes, rachats et transferts de la chaîne de détention. */
export function transactionsAnnee(monde: Monde, compteId: string, now: number): number {
  let n = 0;
  for (const d of monde.droits) for (const m of d.chaine) if (m.quand >= now - AN && m.quand <= now && (m.de === compteId || m.vers === compteId) && m.type !== 'nommage' && m.type !== 'gel' && m.type !== 'degel') n++;
  return n;
}
export const niveauPour = (transactions: number): Niveau => (transactions >= SEUIL_PREMIUM ? NIVEAUX[2] : transactions >= SEUIL_PRO ? NIVEAUX[1] : NIVEAUX[0]);
/** « 000 412 » : numéro de membre tiré de l'identifiant du compte. */
export function numeroMembre(compteId: string): string { const n = compteId.replace(/\D/g, '').padStart(6, '0').slice(-6); return `${n.slice(0, 3)}${NB}${n.slice(3)}`; }
export type ResultatPass = { ok: true; mode: 'solde' | 'carte' } | { ok: false; message: string };
/** Active le Pass (simulé) : payé sur le solde NexG s'il suffit (ligne `pass` au grand livre), sinon par carte de démonstration. Exige un compte. */
export function souscrire(compteId: string | null | undefined): ResultatPass {
  const c = compteId ? compteDe(compteId) : undefined; if (!c) return { ok: false, message: 'Créez un compte pour activer le Pass.' };
  if (c.pass.actif) return { ok: false, message: 'Le Pass est déjà actif.' };
  const mode = c.solde >= PRIX_PASS ? 'solde' : 'carte';
  if (mode === 'solde') ecrire(c.id, 'pass', 'Pass NexG · abonnement', -PRIX_PASS, { sous: 'Abonnement mensuel · prix indicatif' });
  c.pass = { actif: true, depuis: maintenant() };
  notifier(c.id, { type: 'systeme', titre: 'Le Pass NexG est actif', sous: `Drops membres, alertes de drops et commission de revente à ${pct(TAUX_COMMISSION_PASS)}.`, essentielle: true, lien: '/pass' });
  return { ok: true, mode };
}
export function resilier(compteId: string): boolean {
  const c = compteDe(compteId); if (!c || !c.pass.actif) return false;
  c.pass = { actif: false, depuis: c.pass.depuis };
  notifier(c.id, { type: 'systeme', titre: 'Le Pass NexG est résilié', sous: `La commission de revente repasse à ${pct(TAUX_COMMISSION)}.`, essentielle: true, lien: '/pass' });
  return true;
}
/** Commission applicable à ce compte (pour l'affichage). */
export const commissionDe = (compteId: string): string => pct(compteDe(compteId)?.pass.actif ? TAUX_COMMISSION_PASS : TAUX_COMMISSION);

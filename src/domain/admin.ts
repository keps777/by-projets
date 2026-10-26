// Actions d'administration sur un droit de voyage : geler et dégeler. Toute action est consignée dans le journal d'audit et notifiée au détenteur.
// Un droit gelé ne peut être ni mis en vente, ni transféré, ni nommé (les transactions de revente.ts, transfert.ts et marche.ts le refusent déjà).
import { app, maintenant, nouvelId } from '../data/store.svelte.ts';
import { consigner } from './audit.ts';
import { compteDe, notifier } from './compte.ts';
import { droitDe, volDe } from './marche.ts';
import type { Droit, StatutDroit } from './types.ts';

export type CodeErreurAdmin = 'admin' | 'droit' | 'motif' | 'statut' | 'deja_gele' | 'pas_gele';
export class ErreurAdmin extends Error { constructor(public code: CodeErreurAdmin, message: string) { super(message); } }

/** Statuts d'un droit que l'on peut geler : détenu, en vente, nommé. Un droit cédé, racheté ou déjà parti ne se gèle plus. */
export const STATUTS_GELABLES: StatutDroit[] = ['detenu', 'en_vente', 'nomme'];
export const MOTIF_MAX = 200;

/** Statut d'un droit avant son gel, mémorisé dans la tranche `admin` (hors du type `Droit`, qui reste partagé). */
interface TrancheAdmin { avantGel: Record<string, StatutDroit> }
const lireAvantGel = (droitId: string): StatutDroit | undefined => (app.tranches['admin'] as TrancheAdmin | undefined)?.avantGel?.[droitId];
function memoire(): Record<string, StatutDroit> {
  const t = (app.tranches['admin'] ??= { avantGel: {} }) as TrancheAdmin;
  return (t.avantGel ??= {});
}
/** Statut que retrouvera le droit au dégel : celui d'avant le gel, ou, à défaut (gel d'avant la mémoire), déduit de son contenu. */
export function statutAvantGel(d: Droit): StatutDroit { return lireAvantGel(d.id) ?? (d.annonce ? 'en_vente' : d.voyageur ? 'nomme' : 'detenu'); }

function verifier(droitId: string, adminId: string, motif: string, verbe: 'gel' | 'dégel'): { d: Droit; m: string } {
  if (compteDe(adminId)?.role !== 'admin') throw new ErreurAdmin('admin', 'Action réservée aux comptes administrateurs.');
  const d = droitDe(droitId); if (!d) throw new ErreurAdmin('droit', 'Ce droit n’existe pas dans le registre.');
  const m = motif.trim().replace(/\s+/g, ' ');
  if (!m) throw new ErreurAdmin('motif', `Indiquez le motif du ${verbe}.`);
  if (m.length > MOTIF_MAX) throw new ErreurAdmin('motif', `Le motif est limité à ${MOTIF_MAX} caractères.`);
  return { d, m };
}
const trajet = (d: Droit): string => { const v = volDe(d.volId); return v ? `${v.de} → ${v.vers} · vol ${v.numero}` : d.ref; };

/** Gèle un droit : statut `gele` + raison, maillon `gel` ajouté à la chaîne, ligne d'audit (gravité « attention ») et notification au détenteur. */
export function geler(droitId: string, adminId: string, motif: string): Droit {
  const { d, m } = verifier(droitId, adminId, motif, 'gel');
  if (d.statut === 'gele') throw new ErreurAdmin('deja_gele', 'Ce droit est déjà gelé.');
  if (!STATUTS_GELABLES.includes(d.statut)) throw new ErreurAdmin('statut', 'Ce droit n’est plus actif : il ne peut pas être gelé.');
  memoire()[d.id] = d.statut; d.statut = 'gele'; d.gelRaison = m;
  d.chaine.push({ id: nouvelId('m'), quand: maintenant(), type: 'gel', de: adminId, vers: d.detenteurId, prix: 0, note: m });
  consigner(adminId, 'Gel du droit', d.ref, m, 'attention');
  notifier(d.detenteurId, { type: 'systeme', titre: `Votre droit ${d.ref} est gelé`, sous: `${trajet(d)} · aucune vente, aucun transfert ni nommage jusqu’au dégel.`, essentielle: true, lien: `/droit/${d.id}` });
  return d;
}

/** Dégèle un droit : il retrouve son statut d'avant le gel (annonce conservée), maillon `degel`, ligne d'audit, notification au détenteur. */
export function degeler(droitId: string, adminId: string, motif: string): Droit {
  const { d, m } = verifier(droitId, adminId, motif, 'dégel');
  if (d.statut !== 'gele') throw new ErreurAdmin('pas_gele', 'Ce droit n’est pas gelé.');
  const retour = statutAvantGel(d);
  d.statut = retour; delete d.gelRaison; delete memoire()[d.id];
  d.chaine.push({ id: nouvelId('m'), quand: maintenant(), type: 'degel', de: adminId, vers: d.detenteurId, prix: 0, note: m });
  consigner(adminId, 'Dégel du droit', d.ref, m, 'attention');
  notifier(d.detenteurId, { type: 'systeme', titre: `Votre droit ${d.ref} est dégelé`, sous: `${trajet(d)} · les ventes, transferts et le nommage sont de nouveau possibles.`, essentielle: true, lien: `/droit/${d.id}` });
  return d;
}

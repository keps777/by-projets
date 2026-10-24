// Vendeur ambulant : vend des billets de sa compagnie (canal « vendeur »), espèces gardées par lui ou MoMo versé directement à la compagnie.
import { commission } from '../../core/caisse.ts';
import { jourDe } from '../../core/dates.ts';
import { app } from '../../data/store.svelte.ts';
import { consigner, departEnMs, departParId, ligneDe, personne, placesLibres, regler, reserver } from '../../domain/actions.ts';
import type { Billet, Depart } from '../../domain/types.ts';
import { aujourdhui, maintenant } from './commun.ts';
import { lireTerrain, terrain } from './etat.ts';
import { tauxDe } from './convoyeur.ts';

/** Prochain départ de chaque destination (et classe) de la compagnie, depuis la ville du vendeur ; aujourd'hui d'abord, puis les jours suivants. */
export function departsVendables(compagnieId: string | undefined, ville = 'Yaoundé', max = 6): Depart[] {
  const now = maintenant(), vus = new Set<string>(), res: Depart[] = [];
  const candidats = app.monde.departs.filter((d) => { const l = ligneDe(d); return (!compagnieId || l.compagnieId === compagnieId) && l.de === ville && (d.statut === 'prevu' || d.statut === 'embarquement') && departEnMs(d) > now && placesLibres(d) > 0; }).sort((a, b) => departEnMs(a) - departEnMs(b));
  for (const d of candidats) { const l = ligneDe(d), k = `${l.vers}|${l.classe}`; if (vus.has(k)) continue; vus.add(k); res.push(d); if (res.length >= max) break; }
  return res.sort((a, b) => departEnMs(a) - departEnMs(b));
}
export const libelleDestination = (d: Depart) => { const l = ligneDe(d); return `${l.vers}${l.classe === 'VIP' ? ' VIP' : ''}`; };
export function vendreAmbulant(p: { agentId: string; departId: string; moyen: 'especes' | 'momo'; nom?: string; tel?: string }): Billet {
  const d = departParId(p.departId); if (!d) throw new Error('depart_inconnu');
  const r = reserver({ departId: p.departId, sieges: [null], passagers: [{ nom: p.nom?.trim() || 'Client du marché', tel: (p.tel ?? '').trim() }], acheteurId: p.agentId, canal: 'vendeur', moyen: p.moyen });
  if (p.moyen === 'momo') {
    regler(r.paiement.id, { ok: true });
    const n = app.monde.notifications[0]; if (n && n.destId === p.agentId && n.type === 'billet') app.monde.notifications.shift();
  }
  if (p.tel?.trim()) consigner('sms', `SMS au ${p.tel.trim()} : billet ${r.billets[0].code} · bus ${d.heure}`, p.agentId, r.billets[0].id);
  consigner('vente_vendeur', `Billet ${r.billets[0].code} vendu au marché · ${r.billets[0].prix} F · ${p.moyen === 'momo' ? 'MoMo compagnie' : 'espèces'}`, p.agentId, r.billets[0].id); return r.billets[0];
}
export interface BilanVendeur { n: number; total: number; especes: number; momo: number; commission: number; aRemettre: number; dernier?: Billet }
/** Bilan du jour : billets vendus, encaissements, commission (taux de la personne), espèces restant à remettre. */
export function bilanVendeur(agentId: string, jour = aujourdhui()): BilanVendeur {
  const bs = app.monde.billets.filter((b) => b.canal === 'vendeur' && b.acheteurId === agentId && jourDe(new Date(b.creeLe)) === jour && (b.statut === 'valide' || b.statut === 'scanne')).reverse().sort((a, b) => b.creeLe - a.creeLe);
  const moyen = (b: Billet) => app.monde.paiements.find((x) => x.id === b.paiementId)?.moyen;
  const especes = bs.filter((b) => moyen(b) === 'especes').reduce((s, b) => s + b.prix, 0), momo = bs.filter((b) => moyen(b) === 'momo').reduce((s, b) => s + b.prix, 0);
  const remis = lireTerrain().remises.filter((r) => r.agentId === agentId && r.jour === jour).reduce((s, r) => s + r.montant, 0), total = especes + momo;
  return { n: bs.length, total, especes, momo, commission: commission(total, tauxDe(agentId)), aRemettre: Math.max(0, especes - remis), dernier: bs[0] };
}
/** Remise du soir : les espèces encaissées sont rendues à la compagnie (la commission est versée en retour ce soir). */
export function remettreEspeces(agentId: string, jour = aujourdhui()): number {
  const b = bilanVendeur(agentId, jour); if (b.aRemettre <= 0) return 0;
  terrain().remises.push({ agentId, jour, montant: b.aRemettre, ts: maintenant() });
  consigner('remise', `${personne(agentId)?.prenom} remet ${b.aRemettre} F d'espèces · commission ${b.commission} F à verser`, agentId); return b.aRemettre;
}

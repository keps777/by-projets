// Achat d'un billet hors application (menu USSD, conversation WhatsApp) : choisir un siège libre, réserver, puis régler par MoMo.
import { aujourdhui } from '../../data/horloge.ts';
import { ajouterJours } from '../../core/dates.ts';
import { planSieges, supplementSiege } from '../../core/sieges.ts';
import { compagnieDe, departParId, departsDuJour, ligneDe, placesLibres, regler, reserver, siegesIndisponibles } from '../../domain/actions.ts';
import type { Billet, Canal, Depart, Paiement } from '../../domain/types.ts';
import { crediterBillets } from './actions.ts';

export const demain = () => ajouterJours(aujourdhui(), 1);
const sansAccent = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
/** Nom court de compagnie pour un petit écran : « Bêta Express » → « Beta ». */
export const nomCourt = (d: Depart) => sansAccent(compagnieDe(d).nom).split(' ')[0];
/** Départs réservables (encore des places, pas encore partis) d'une ligne, un jour donné. */
export function departsReservables(de: string, vers: string, jour: string): Depart[] {
  return departsDuJour(jour, de, vers).filter((d) => (d.statut === 'prevu' || d.statut === 'embarquement') && placesLibres(d) > 0);
}
/** Premier siège libre, en évitant les places à supplément (première rangée du Classique) tant qu'il en reste d'autres. */
export function premierSiegeLibre(d: Depart): string | null {
  const pris = siegesIndisponibles(d), libres = planSieges(ligneDe(d).classe, d.capacite).map((s) => s.id).filter((id) => !pris.has(id));
  return libres.find((id) => supplementSiege(ligneDe(d).classe, id) === 0) ?? libres[0] ?? null;
}
/** Prix du siège proposé (siège sans supplément si possible). */
export const prixPropose = (d: Depart) => { const s = premierSiegeLibre(d); return d.prix + (s ? supplementSiege(ligneDe(d).classe, s) : 0); };
export type ResultatAchat = { ok: true; billet: Billet; paiement: Paiement } | { ok: false; code: 'complet' | 'siege_pris' | 'depart_ferme' | 'inconnu'; message: string };
const MESSAGES = { complet: 'Ce depart est complet.', siege_pris: 'La place vient d’etre prise.', depart_ferme: 'Ce depart n’est plus disponible.', inconnu: 'Depart inconnu.' } as const;
/** Réserve une place pour `passager` : `payer` règle tout de suite par MoMo (billet valide), sinon la place est retenue 10 minutes. */
export function acheter(o: { departId: string; acheteurId: string; passager: { nom: string; tel: string }; canal: Extract<Canal, 'ussd' | 'whatsapp'>; payer: boolean }): ResultatAchat {
  try {
    const dep = departParId(o.departId); if (!dep) return { ok: false, code: 'inconnu', message: MESSAGES.inconnu };
    const siege = premierSiegeLibre(dep); if (!siege) return { ok: false, code: 'complet', message: MESSAGES.complet };
    const { paiement, billets } = reserver({ departId: dep.id, sieges: [siege], passagers: [o.passager], acheteurId: o.acheteurId, canal: o.canal, moyen: 'momo' });
    const final = o.payer ? regler(paiement.id, { ok: true }) : paiement;
    if (o.payer && final.statut !== 'ok') return { ok: false, code: 'depart_ferme', message: final.motif ?? 'Paiement refuse.' };
    if (o.payer) crediterBillets(o.acheteurId);
    return { ok: true, billet: billets[0], paiement: final };
  } catch (e) {
    const code = (e instanceof Error ? e.message : '') as keyof typeof MESSAGES;
    return code in MESSAGES ? { ok: false, code, message: MESSAGES[code] } : { ok: false, code: 'inconnu', message: MESSAGES.inconnu };
  }
}

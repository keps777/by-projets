// Données de démonstration du siège, ajoutées une seule fois au monde simulé : 4 transactions MoMo sans correspondance
// (paiement expiré, paiement sans billet, doublon) et quelques lignes de journal. Idempotent grâce au drapeau `demoInjectee`.
import { codeBillet, sceller } from '../../core/sceau.ts';
import { ajouterJours } from '../../core/dates.ts';
import { app, aujourdhui, maintenant } from '../../data/store.svelte.ts';
import type { Billet, Depart, Paiement } from '../../domain/types.ts';
import { etatSiege } from './etat.ts';

export function injecterDemo(): boolean {
  const e = etatSiege(); if (e.demoInjectee) return false;
  const m = app.monde, now = maintenant(), demain = ajouterJours(aujourdhui(), 1), min = (n: number) => now - n * 60_000;
  const depart = (ligne: string, heure: string, prix: number): Depart | undefined => m.departs.find((d) => d.jour === demain && d.ligneId === ligne && d.heure === heure) ?? m.departs.find((d) => d.jour >= demain && d.prix === prix && d.statut === 'prevu');
  const dVip = depart('l-BX-VIP-mvan-retour', '19:00', 7500), dBaf = depart('l-BX-bafoussam', '07:30', 5000);
  if (!dVip || !dBaf) { e.demoInjectee = true; return false; }
  const yymm = `${String(new Date(now).getFullYear()).slice(2)}${String(new Date(now).getMonth() + 1).padStart(2, '0')}`;
  let n = 0;
  const pay = (id: string, ref: string, ts: number, montant: number, statut: Paiement['statut'], payeurId: string, ids: string[], extra: Partial<Paiement> = {}) => {
    if (!m.paiements.some((p) => p.id === id)) m.paiements.push({ id, ts, montant, moyen: 'momo', statut, ref, canal: 'guichet', payeurId, pour: { type: 'billet', ids }, ...extra });
  };
  const bil = (id: string, d: Depart, nom: string, tel: string, paiementId: string, statut: Billet['statut'], acheteurId: string, ts: number) => {
    if (m.billets.some((b) => b.id === id)) return;
    const code = codeBillet(ts / 1000 + ++n * 17);
    m.billets.push({ id, code, departId: d.id, siege: null, passager: { nom, tel }, prix: d.prix, canal: 'guichet', acheteurId, paiementId, statut, creeLe: ts, sceau: sceller({ code, departId: d.id, siege: null, nom }) });
  };
  // 1. vente hors ligne au guichet de Douala : le client a payé, la vente n'est jamais revenue (paiement resté « attente », expiré)
  pay('pay-s1', 'MOMO-S4410', min(12), 7500, 'attente', 'p-joseph', ['b-s1'], { expireLe: min(2) }); bil('b-s1', dVip, 'Client guichet Akwa', '694101010', 'pay-s1', 'attente_paiement', 'p-joseph', min(12));
  // 2 et 4. paiements reçus d'un proche (Marie) et d'une cagnotte (Paul) sans billet lié ; un billet « expiré » attend d'être retrouvé
  pay('pay-s2', 'MOMO-S4388', min(39), 7500, 'ok', 'p-maman', [], { canal: 'app' }); pay('pay-s4', 'MOMO-S4190', min(70), 7500, 'ok', 'p-paul', [], { canal: 'app' });
  pay('pay-s5', 'MOMO-S4001', min(120), 7500, 'attente', 'p-maman', ['b-s2'], { canal: 'app', expireLe: min(110) }); bil('b-s2', dVip, 'Paul Ndiba', '699000222', 'pay-s5', 'expire', 'p-maman', min(120));
  // 3. doublon : le client a payé deux fois ; une seule vente en face
  pay('pay-s3', 'MOMO-S4195', min(65), 5000, 'ok', 'p-joseph', ['b-s3']); bil('b-s3', dBaf, 'Client Mvan', '655901102', 'pay-s3', 'valide', 'p-joseph', min(65));
  const ext = (ref: string, ts: number, numero: string, montant: number, paiementRef?: string) => ({ ref: `MP${yymm}-${ref}`, ts, numero, montant, operateur: 'MTN' as const, paiementRef });
  e.releveExterne = [ext('4410', min(12), '694101010', 7500, 'MOMO-S4410'), ext('4388', min(39), '677102233', 7500, 'MOMO-S4388'), ext('4195', min(65), '655901102', 5000, 'MOMO-S4195'), ext('4201', min(63), '655901102', 5000), ext('4190', min(70), '691004567', 7500, 'MOMO-S4190')];
  if (m.evenements.length === 0) {
    const ev = (ts: number, type: string, texte: string, acteurId?: string) => m.evenements.push({ id: `ev-s-${ts}`, ts, type, texte, acteurId });
    ev(min(95), 'ouverture', 'Ouverture des gares : caisses ouvertes, 12 guichets', 'p-abdou'); ev(min(75), 'colis', 'Colis AM-C-9Q2 chargé · bus 08:30 · relais Chez Mado', 'p-fatou');
    ev(min(52), 'acces', 'Guichet débloqué · visage de Joseph reconnu', 'p-abdou'); ev(min(30), 'caisse', 'Clôture validée · Mvan · écart −1 500 F imputé', 'p-abdou'); ev(min(17), 'vente', 'Vente en cadence · Mvan · 58 billets en 44 min', 'p-fatou');
    m.evenements.sort((a, b) => b.ts - a.ts);
  }
  e.incidentDepuis = min(22); e.demoInjectee = true; return true;
}

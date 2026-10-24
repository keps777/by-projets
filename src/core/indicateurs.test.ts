import { describe, expect, it } from 'vitest';
import type { Billet, Caisse, Depart, Ligne, Paiement } from '../domain/types.ts';
import { caissesDe, etatRapport, ficheGare, quais } from './fichegare.ts';
import { decaler, derniersJours, ecartsDuJour, fenetre, libelleVariation, parCompagnie, parGare, parLigne, remplissages, tableau, total, variation, ventes, type Donnees } from './indicateurs.ts';

const h = (jour: string, hhmm: string) => new Date(`${jour}T${hhmm}:00`).getTime();
const ligne = (id: string, compagnieId: string, gareDe: string, prix = 7000): Ligne => ({ id, de: 'Yaoundé', vers: 'Douala', gareDe, gareVers: 'akwa', compagnieId, classe: 'Classique', prix, dureeMin: 210, actif: true, horaires: ['07:00'] });
const depart = (id: string, ligneId: string, jour: string, prisAilleurs: string[] = [], capacite = 10): Depart => ({ id, ligneId, jour, heure: '07:00', busId: 'b', capacite, prix: 7000, statut: 'prevu', retardMin: 0, avancement: 0, prisAilleurs });
const billet = (id: string, departId: string, creeLe: number, prix = 7000, statut: Billet['statut'] = 'valide', siege: string | null = null): Billet => ({ id, code: id, departId, siege, passager: { nom: 'X', tel: '1' }, prix, canal: 'app', acheteurId: 'a', paiementId: `p-${id}`, statut, creeLe, sceau: 's' });
const pay = (id: string, moyen: Paiement['moyen'], montant = 7000): Paiement => ({ id: `p-${id}`, ts: 0, montant, moyen, statut: 'ok', ref: 'r', canal: 'app', payeurId: 'a', pour: { type: 'billet', ids: [id] } });

const JOUR = '2026-11-03', HIER7 = '2026-10-27';
function monde(): Donnees {
  const billets = [
    billet('b1', 'd1', h(JOUR, '06:00')), billet('b2', 'd1', h(JOUR, '07:00'), 8500, 'scanne'), billet('b3', 'd1', h(JOUR, '12:00')), // b3 après 08:00 : hors fenêtre « même heure »
    billet('b4', 'd1', h(JOUR, '06:30'), 7000, 'annule'), billet('b5', 'd1', h(JOUR, '06:40'), 7000, 'rembourse'), billet('b6', 'd1', h(JOUR, '06:50'), 7000, 'attente_paiement'),
    billet('r1', 'd1', h(HIER7, '06:30'), 7000), billet('r2', 'd1', h(HIER7, '07:30'), 7000), billet('r3', 'd1', h(HIER7, '15:00'), 7000),
    billet('f1', 'd2', h(JOUR, '06:10'), 5000)
  ];
  return {
    billets, paiements: billets.map((b, i) => pay(b.id, i % 2 ? 'momo' : 'especes', b.prix)), departs: [depart('d1', 'l1', JOUR), depart('d2', 'l2', JOUR, ['1A', '1B'])],
    lignes: [ligne('l1', 'BX', 'mvan'), ligne('l2', 'FX', 'nsam', 5000)], gares: [{ id: 'mvan', ville: 'Yaoundé', nom: 'Mvan' }, { id: 'nsam', ville: 'Yaoundé', nom: 'Nsam' }], colis: [], caisses: [], litiges: []
  };
}

describe('indicateurs du patron', () => {
  it('une vente = billet valide ou scanné ; annulés, remboursés et en attente sont exclus', () => {
    const v = ventes(monde());
    expect(v.map((x) => x.billet.id).sort()).toEqual(['b1', 'b2', 'b3', 'f1', 'r1', 'r2', 'r3']);
    expect(ventes(monde(), 'BX').map((x) => x.billet.id)).not.toContain('f1');
  });
  it('la recette est la somme des prix des billets vendus (supplément de siège compris)', () => {
    expect(total(fenetre(ventes(monde()), [JOUR]))).toBe(7000 + 8500 + 7000 + 5000);
  });
  it('comparaison à la même heure : la fenêtre s’arrête à l’heure courante sur le dernier jour', () => {
    const v = ventes(monde(), 'BX'), min = 8 * 60;
    expect(fenetre(v, [JOUR], min).map((x) => x.billet.id)).toEqual(['b1', 'b2']);
    expect(fenetre(v, [HIER7], min).map((x) => x.billet.id)).toEqual(['r1', 'r2']);
  });
  it('variation en % arrondi, null sans référence', () => {
    expect(variation(110, 100)).toBe(10); expect(variation(94, 100)).toBe(-6); expect(variation(5, 0)).toBeNull();
    expect(libelleVariation(11)).toBe('+11\u00a0%'); expect(libelleVariation(-6)).toBe('−6\u00a0%'); expect(libelleVariation(null)).toBe('pas de référence'); expect(libelleVariation(0)).toBe('0\u00a0%');
  });
  it('jours : les n derniers dans l’ordre, décalage d’une semaine', () => {
    expect(derniersJours('2026-11-03', 3)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']); expect(decaler(['2026-11-03'], -7)).toEqual(['2026-10-27']);
  });
  it('regroupements par gare, ligne et compagnie', () => {
    const v = fenetre(ventes(monde()), [JOUR]);
    expect(parGare(v)).toEqual([{ cle: 'mvan', recette: 22500, billets: 3 }, { cle: 'nsam', recette: 5000, billets: 1 }]);
    expect(parLigne(v)[0].cle).toBe('l1'); expect(parCompagnie(v).map((x) => x.cle)).toEqual(['BX', 'FX']);
  });
  it('remplissage : sièges pris ailleurs + billets actifs (valide, scanné, attente non expirée), sans double compte', () => {
    const m = monde(); m.billets.find((b) => b.id === 'b1')!.siege = '2A'; m.billets.find((b) => b.id === 'b2')!.siege = '2A';
    const now = h(JOUR, '08:00'), r = remplissages(m, now);
    expect(r.get('d2')).toBeCloseTo(0.3); // 2 sièges pris ailleurs + le billet sans siège f1
    // d1 : b1+b2 sur le même siège 2A (1) + 4 billets sans siège (b3, r1, r2, r3) ; b6 en attente sans échéance n'est pas actif
    expect(r.get('d1')).toBeCloseTo(5 / 10);
    m.paiements.find((p) => p.id === 'p-b6')!.expireLe = now + 60_000;
    expect(remplissages(m, now).get('d1')).toBeCloseTo(6 / 10);
  });
  it('tableau du jour : recette, billets, variation vs même jour de la semaine passée, gares triées', () => {
    const t = tableau(monde(), { jour: JOUR, now: h(JOUR, '08:00'), compagnieId: 'BX' });
    expect(t.recette).toBe(15500); expect(t.billets).toBe(2); expect(t.ref).toBe(14000); expect(t.variation).toBe(11);
    expect(t.gares.map((g) => g.gareId)).toEqual(['mvan']); expect(t.bus).toBe(1);
    const tout = tableau(monde(), { jour: JOUR, now: h(JOUR, '08:00') });
    expect(tout.gares.map((g) => g.gareId)).toEqual(['mvan', 'nsam']);
  });
  it('écarts de caisse du jour par gare, retards, annulations, litiges', () => {
    const m = monde(); m.departs[0].retardMin = 20; m.departs[1].statut = 'annule';
    const c: Caisse = { id: 'c', agentId: 'a', gareId: 'mvan', jour: JOUR, ouvertA: h(JOUR, '05:30'), fond: 20000, statut: 'validee', ecart: -1500, attendu: 30000 };
    m.caisses.push(c, { ...c, id: 'c2', statut: 'ouverte', ecart: undefined }); m.litiges.push({ id: 'l', ts: 0, auteurId: 'a', type: 't', objet: { type: 'billet', id: 'b1' }, texte: '', statut: 'ouvert' });
    expect(ecartsDuJour(m, JOUR).get('mvan')).toBe(-1500);
    const t = tableau(m, { jour: JOUR, now: h(JOUR, '08:00') });
    expect(t).toMatchObject({ retards: 1, annules: 1, ecart: -1500, litigesOuverts: 1, caissesOuvertes: 1 });
  });
});

describe('fiche d’une gare', () => {
  it('jour : recette, billets, répartition des paiements, barres par tranche', () => {
    const f = ficheGare(monde(), 'mvan', { periode: 'jour', jour: JOUR, now: h(JOUR, '23:00') });
    expect(f.recette).toBe(22500); expect(f.billets).toBe(3); expect(f.ref).toBe(21000); expect(f.variation).toBe(7);
    expect(f.serie).toHaveLength(12); expect(Math.max(...f.serie)).toBe(100); expect(f.paiements.reduce((s, p) => s + p.part, 0)).toBeGreaterThanOrEqual(99);
  });
  it('semaine : 7 barres ; mois : 4 barres ; sans vente, tout à zéro', () => {
    expect(ficheGare(monde(), 'mvan', { periode: 'semaine', jour: JOUR, now: h(JOUR, '23:00') }).serie).toHaveLength(7);
    expect(ficheGare(monde(), 'mvan', { periode: 'mois', jour: JOUR, now: h(JOUR, '23:00') }).serie).toHaveLength(4);
    expect(ficheGare(monde(), 'kribi', { periode: 'jour', jour: JOUR, now: h(JOUR, '23:00') })).toMatchObject({ recette: 0, billets: 0, variation: null });
  });
  it('quais : prochains départs de la gare avec leur remplissage', () => {
    const q = quais(monde(), 'mvan', { jour: JOUR, now: h(JOUR, '06:30') });
    expect(q).toHaveLength(1); expect(q[0]).toMatchObject({ heure: '07:00', vers: 'Douala', compagnieId: 'BX' });
    expect(quais(monde(), 'mvan', { jour: JOUR, now: h(JOUR, '15:00') })).toHaveLength(0);
  });
  it('rapport du soir : envoyé si toutes les caisses sont clôturées, en retard si l’une est ouverte après 21 h', () => {
    const c = (statut: Caisse['statut']): Caisse => ({ id: statut, agentId: 'a', gareId: 'mvan', jour: JOUR, ouvertA: h(JOUR, '05:30'), fond: 0, statut });
    expect(etatRapport([], h(JOUR, '12:00')).code).toBe('aucun'); expect(etatRapport([c('validee'), c('fermee')], h(JOUR, '12:00')).code).toBe('envoye');
    expect(etatRapport([c('ouverte')], h(JOUR, '12:00')).code).toBe('en_cours'); expect(etatRapport([c('ouverte')], h(JOUR, '21:30')).code).toBe('retard');
    const m = monde(); m.caisses.push(c('ouverte')); expect(caissesDe(m, 'mvan', JOUR)).toHaveLength(1); expect(caissesDe(m, 'nsam', JOUR)).toHaveLength(0);
  });
});

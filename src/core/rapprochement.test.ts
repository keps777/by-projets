import { describe, expect, it } from 'vitest';
import { operateurDe, rapprocher, releveDepuis, totalEcarts, type BilletR, type PaiementR, type TxOperateur } from './rapprochement.ts';

const NOW = Date.parse('2026-11-03T08:00:00');
const min = (n: number) => NOW - n * 60_000;
const pai = (id: string, ref: string, ts: number, montant: number, statut: string, ids: string[], extra: Partial<PaiementR> = {}): PaiementR => ({ id, ref, ts, montant, moyen: 'momo', statut, payeurId: 'p1', pour: { type: 'billet', ids }, ...extra });
const bil = (id: string, paiementId: string, prix: number, statut: string, creeLe = NOW): BilletR => ({ id, code: id.toUpperCase(), paiementId, prix, statut, creeLe });
const tx = (ref: string, ts: number, montant: number, extra: Partial<TxOperateur> = {}): TxOperateur => ({ ref, ts, numero: '691000000', montant, operateur: 'MTN', ...extra });

describe('relevé et rapprochement', () => {
  it('le relevé reconstitué ne reprend que les paiements mobile réglés', () => {
    const r = releveDepuis([pai('p1', 'MOMO-1', min(5), 7500, 'ok', ['b1']), pai('p2', 'OM-2', min(4), 5000, 'ok', ['b2'], { moyen: 'om' }), pai('p3', 'EC-3', min(3), 5000, 'ok', ['b3'], { moyen: 'especes' }), pai('p4', 'MOMO-4', min(2), 5000, 'attente', ['b4'])], () => '690000000');
    expect(r.map((x) => [x.ref, x.operateur])).toEqual([['MP-MOMO-1', 'MTN'], ['MP-OM-2', 'Orange']]); expect(operateurDe('carte')).toBeNull();
  });
  it('rapproche un paiement réglé et lié à un billet', () => {
    const p = pai('p1', 'MOMO-1', min(30), 7500, 'ok', ['b1']), r = rapprocher(releveDepuis([p], () => '69'), [p], [bil('b1', 'p1', 7500, 'valide')], NOW);
    expect(r).toMatchObject({ total: 1, rapproches: 1, ecarts: [] });
  });
  it('quatre sortes d’écarts : expiré, sans billet, doublon, inconnue', () => {
    const paiements = [pai('pe', 'MOMO-E', min(40), 7500, 'attente', ['be'], { expireLe: min(30) }), pai('ps', 'MOMO-S', min(70), 7500, 'ok', []), pai('po', 'MOMO-O', min(100), 5000, 'ok', ['bo'])];
    const billets = [bil('be', 'pe', 7500, 'expire', min(40)), bil('bo', 'po', 5000, 'valide'), bil('bx', 'zz', 7500, 'expire', min(65)), bil('bv', 'zz', 5000, 'expire')];
    const releve = [tx('R-E', min(40), 7500, { paiementRef: 'MOMO-E' }), tx('R-S', min(70), 7500, { paiementRef: 'MOMO-S', numero: '677' }), tx('R-O', min(100), 5000, { paiementRef: 'MOMO-O' }), tx('R-D', min(98), 5000), tx('R-I', min(10), 3000, { numero: '655' })];
    const r = rapprocher(releve, paiements, billets, NOW), par = Object.fromEntries(r.ecarts.map((e) => [e.tx.ref, e]));
    expect(r.total).toBe(5); expect(r.rapproches).toBe(1); expect(r.ecarts).toHaveLength(4);
    expect(par['R-E']).toMatchObject({ motif: 'expire', paiementId: 'pe' }); expect(par['R-E'].candidats[0]).toBe('be'); expect(par['R-E'].piste).toContain('expiré');
    expect(par['R-S']).toMatchObject({ motif: 'sans_billet' }); expect(par['R-S'].candidats).toEqual(['bx', 'be']);
    expect(par['R-D']).toMatchObject({ motif: 'doublon', candidats: [] }); expect(par['R-D'].piste).toContain('R-O'); expect(par['R-I'].motif).toBe('inconnue');
    expect(totalEcarts(r.ecarts)).toBe(7500 + 7500 + 5000 + 3000);
  });
  it('un paiement encore dans sa fenêtre de 10 minutes est « en cours », pas un écart', () => {
    const p = pai('p1', 'MOMO-1', min(3), 7500, 'attente', ['b1'], { expireLe: min(-7) }), r = rapprocher([tx('R', min(3), 7500, { paiementRef: 'MOMO-1' })], [p], [bil('b1', 'p1', 7500, 'attente_paiement')], NOW);
    expect(r.enCours).toBe(1); expect(r.ecarts).toHaveLength(0);
  });
  it('les transactions décidées (associées ou remboursées) sortent des écarts', () => {
    const r = rapprocher([tx('R-I', min(10), 3000)], [], [], NOW, new Set(['R-I'])); expect(r.ecarts).toHaveLength(0); expect(r.rapproches).toBe(1);
  });
  it('montant différent entre l’opérateur et AfriMove', () => {
    const p = pai('p1', 'MOMO-1', min(20), 7000, 'ok', ['b1']), r = rapprocher([tx('R', min(20), 7500, { paiementRef: 'MOMO-1' })], [p], [bil('b1', 'p1', 7000, 'valide')], NOW);
    expect(r.ecarts[0].motif).toBe('montant');
  });
});

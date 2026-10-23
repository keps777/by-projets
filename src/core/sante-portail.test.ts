import { describe, expect, it } from 'vitest';
import { releveCsv, statsClinique, statutPortail, type FacturePortail } from './sante-portail.ts';

const F = (o: Partial<FacturePortail>): FacturePortail => ({ numero: 'F-1', patient: 'A B', acte: 'Acte', date: '2026-10-10', echeance: '2026-10-17', total: 1000, assureMe: 800, partPatient: 200, statut: 'a_regler', ...o });
describe('portail clinique', () => {
  it('statuts affichés', () => {
    expect(statutPortail(F({ statut: 'brouillon' }), '2026-10-22')).toBe('a_valider');
    expect(statutPortail(F({}), '2026-10-17')).toBe('a_regler');
    expect(statutPortail(F({}), '2026-10-18')).toBe('en_retard');
    expect(statutPortail(F({ statut: 'etalee' }), '2026-12-01')).toBe('payee');
  });
  it('chiffres du mois, à encaisser, délai moyen', () => {
    const now = Date.parse('2026-10-22T10:00:00');
    const s = statsClinique([
      F({ statut: 'payee', paiement: { ts: Date.parse('2026-10-12T12:00:00') } }),
      F({ statut: 'etalee', date: '2026-10-05', paiement: { ts: Date.parse('2026-10-09T12:00:00') } }),
      F({ total: 5000, assureMe: 4000, partPatient: 1000 }),
      F({ statut: 'brouillon', assureMe: 99_999 }),
      F({ date: '2026-09-20', statut: 'payee', assureMe: 500, paiement: { ts: Date.parse('2026-09-25T12:00:00') } })
    ], now);
    expect(s.emises).toBe(4); expect(s.versee).toBe(800 + 800 + 4000); expect(s.aEncaisser).toBe(1000); expect(s.encaissee).toBe(600);
    expect(s.delaiMoyenJours).toBe(Math.round((2 + 4 + 5) / 3));
    expect(statsClinique([], now)).toMatchObject({ emises: 0, versee: 0, delaiMoyenJours: null });
  });
  it('relevé CSV échappé', () => {
    const csv = releveCsv([F({ patient: 'Jean "JB" Y', statut: 'payee' })], '2026-10-22').split('\r\n');
    expect(csv).toHaveLength(2); expect(csv[0].startsWith('"Facture";"Patient"')).toBe(true);
    expect(csv[1]).toContain('"Jean ""JB"" Y"'); expect(csv[1].endsWith('"Payée"')).toBe(true);
  });
});

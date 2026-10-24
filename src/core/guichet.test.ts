import { describe, expect, it } from 'vitest';
import { attenduGuichet, cadenceParMinute, codeBilletSaisi, estPointe, etatMontee, formaterCode, formaterTel, grilleBus, libelleErreur, montantsRapides, normaliserCodeColis, normaliserTel, rendu, supplementTaille } from './guichet.ts';
import { attendu } from './caisse.ts';

describe('mode cadence', () => {
  it('pointe du matin et du soir seulement', () => {
    expect(estPointe(7 * 60)).toBe(true); expect(estPointe(12 * 60)).toBe(false); expect(estPointe(17 * 60 + 30)).toBe(true); expect(estPointe(22 * 60)).toBe(false);
  });
  it('cadence par minute', () => { expect(cadenceParMinute(57, 44)).toBe(1.3); expect(cadenceParMinute(0, 10)).toBe(0); expect(cadenceParMinute(3, 0)).toBe(3); });
  it('comptage au quai : en cours, complet, écart', () => {
    expect(etatMontee(46, 58, 70)).toMatchObject({ texte: 'en cours', ton: 'inf', ecart: 12, message: '12 pas encore montés' });
    expect(etatMontee(58, 58, 70)).toMatchObject({ texte: 'en cours', message: 'tout le monde est là' });
    expect(etatMontee(70, 70, 70)).toMatchObject({ texte: 'complet', ton: 'ok' });
    expect(etatMontee(60, 58, 70)).toMatchObject({ texte: 'écart', ton: 'er', message: '2 de trop · vérifier' });
  });
});
describe('plan du bus', () => {
  it('Classique 2+2 avec couloir, VIP 1+2', () => {
    const c = grilleBus('Classique', 50); expect(c.colonnes).toBe(5); expect(c.cases).toHaveLength(50); expect(c.rangs).toBe(13);
    expect(new Set(c.cases.map((x) => x.col))).toEqual(new Set([1, 2, 4, 5]));
    const v = grilleBus('VIP', 30); expect(v.colonnes).toBe(4); expect(new Set(v.cases.map((x) => x.col))).toEqual(new Set([1, 3, 4])); expect(v.rangs).toBe(10);
  });
});
describe('formats', () => {
  it('code de billet et téléphone', () => {
    expect(formaterCode('AM7F3K22')).toBe('AM-7F3K-22'); expect(formaterCode('XYZ')).toBe('XYZ'); expect(formaterTel('691221008')).toBe('6 91 22 10 08');
    expect(normaliserTel('6 91 22 10 08')).toBe('691221008'); expect(normaliserTel('+237 691 22 10 08')).toBe('691221008'); expect(normaliserTel('12345')).toBeNull(); expect(normaliserTel('')).toBeNull();
  });
  it('code colis tolérant', () => {
    expect(normaliserCodeColis('am-c-9q2')).toBe('AM-C-9Q2'); expect(normaliserCodeColis('AMC9Q2')).toBe('AM-C-9Q2'); expect(normaliserCodeColis(' 9q2 ')).toBe('AM-C-9Q2'); expect(normaliserCodeColis('AM-C-12345')).toBeNull();
  });
  it('code de billet saisi ou lu dans un QR', () => { expect(codeBilletSaisi('am-7f3k-22')).toBe('AM7F3K22'); expect(codeBilletSaisi('AM7F3K22.0123456789ab')).toBe('AM7F3K22'); });
});
describe('monnaie et caisse', () => {
  it('rendu de monnaie', () => { expect(rendu(10000, 6000)).toBe(4000); expect(rendu(6000, 6000)).toBe(0); expect(rendu(5000, 6000)).toBeNull(); expect(montantsRapides(6000)).toEqual([6000, 10000, 20000, 50000]); expect(montantsRapides(60000)).toEqual([60000]); });
  it('supplément de taille : jamais de remboursement au dépôt', () => {
    expect(supplementTaille('M', 'L')).toBe(2500); expect(supplementTaille('S', 'L')).toBe(4000); expect(supplementTaille('L', 'S')).toBe(0); expect(supplementTaille('M', 'M')).toBe(0);
  });
  it('attendu : sans remboursement ni supplément, identique au calcul partagé', () => {
    expect(attenduGuichet({ fond: 20000, billetsEspeces: 30000, colisEspeces: 3000, supplements: 0, remboursements: 0 })).toBe(attendu(20000, 33000));
    expect(attenduGuichet({ fond: 20000, billetsEspeces: 30000, colisEspeces: 0, supplements: 2500, remboursements: 6300 })).toBe(46200);
  });
  it('messages d’erreur en français', () => { expect(libelleErreur(new Error('siege_pris'))).toContain('prise'); expect(libelleErreur(new Error('???'))).toContain('impossible'); });
});

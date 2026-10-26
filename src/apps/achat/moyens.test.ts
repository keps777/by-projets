import { describe, expect, it } from 'vitest';
import { erreurCvc, erreurExpiration, erreurMobile, erreurNumero, erreursCarte, formaterExpiration, formaterNumero, issueSimulee, luhn, quatreDerniers } from './moyens.ts';

const MAI = Date.parse('2026-10-12T09:00');
describe('Luhn et numéro de carte', () => {
  it('accepte les cartes de test et refuse une chiffre faux', () => {
    expect(luhn('4242 4242 4242 4242')).toBe(true); expect(luhn('4000000000000002')).toBe(true); expect(luhn('4242 4242 4242 4241')).toBe(false); expect(luhn('42a2')).toBe(false); expect(luhn('')).toBe(false);
  });
  it('formate par groupes de 4 et limite à 16 chiffres', () => {
    expect(formaterNumero('4242424242424242999')).toBe('4242 4242 4242 4242'); expect(formaterNumero('42424')).toBe('4242 4'); expect(formaterNumero('4a2')).toBe('42');
  });
  it('messages d’erreur du numéro', () => {
    expect(erreurNumero('')).toMatch(/Entrez/); expect(erreurNumero('4242 4242')).toBe('Le numéro compte 16 chiffres.'); expect(erreurNumero('4242 4242 4242 4241')).toMatch(/pas valide/); expect(erreurNumero('4242 4242 4242 4242')).toBe('');
  });
  it('ne retient que les 4 derniers chiffres', () => { expect(quatreDerniers('4242 4242 4242 4242')).toBe('4242'); expect(quatreDerniers('12')).toBe('12'); });
});
describe('expiration MM/AA', () => {
  it('insère la barre oblique', () => { expect(formaterExpiration('1228')).toBe('12/28'); expect(formaterExpiration('12')).toBe('12'); expect(formaterExpiration('123')).toBe('12/3'); });
  it('refuse un mois hors de 01 à 12 avec le message de la planche', () => {
    expect(erreurExpiration('13/27', MAI)).toBe('Mois invalide : de 01 à 12.'); expect(erreurExpiration('00/27', MAI)).toBe('Mois invalide : de 01 à 12.'); expect(erreurExpiration('13', MAI)).toBe('Mois invalide : de 01 à 12.');
  });
  it('exige le format complet et refuse une carte échue', () => {
    expect(erreurExpiration('', MAI)).toMatch(/Entrez/); expect(erreurExpiration('12/2', MAI)).toBe('Format attendu : MM/AA.'); expect(erreurExpiration('09/26', MAI)).toMatch(/échue/);
    expect(erreurExpiration('10/26', MAI)).toBe(''); expect(erreurExpiration('12/28', MAI)).toBe('');
  });
});
describe('code de sécurité, mobile money, formulaire complet', () => {
  it('code à 3 chiffres', () => { expect(erreurCvc('123')).toBe(''); expect(erreurCvc('12')).not.toBe(''); expect(erreurCvc('12a')).not.toBe(''); });
  it('numéro mobile money : 8 à 15 chiffres', () => { expect(erreurMobile('+1 514 555 0142')).toBe(''); expect(erreurMobile('')).toMatch(/Entrez/); expect(erreurMobile('123')).toMatch(/8 à 15/); expect(erreurMobile('abc 12345678')).toMatch(/8 à 15/); });
  it('rassemble les erreurs de la carte', () => {
    expect(erreursCarte({ numero: '4242 4242 4242 4242', exp: '12/28', cvc: '123', nom: 'ALEX T.' }, MAI)).toEqual({});
    expect(Object.keys(erreursCarte({ numero: '', exp: '13/27', cvc: '', nom: '' }, MAI))).toEqual(['numero', 'exp', 'cvc', 'nom']);
  });
});
describe('issue simulée du prestataire', () => {
  it('refuse la carte finissant par 0002', () => { expect(issueSimulee('carte', { numero: '4000 0000 0000 0002' }).ok).toBe(false); expect(issueSimulee('carte', { numero: '4242 4242 4242 4242' }).ok).toBe(true); });
  it('refuse le mobile money finissant par 00, accepte le wallet', () => { const r = issueSimulee('mobile', { mobile: '+1 514 555 0100' }); expect(r.ok).toBe(false); expect(issueSimulee('mobile', { mobile: '+1 514 555 0142' }).ok).toBe(true); expect(issueSimulee('wallet', {}).ok).toBe(true); });
});

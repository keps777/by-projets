import { describe, expect, it } from 'vitest';
import { aleaSur, chiffresTel, fiabilite, formaterTel, genererPin, pinTrivial, pinValide, quiValide, telValide, trierAlertes, type Alerte } from './supervision.ts';

describe('qui valide un écart', () => {
  it('juste, superviseur jusqu’à 2 000 F, patron au-delà', () => {
    expect(quiValide(0)).toBe('juste'); expect(quiValide(-1500)).toBe('superviseur'); expect(quiValide(2000)).toBe('superviseur');
    expect(quiValide(-2001)).toBe('patron'); expect(quiValide(5000)).toBe('patron');
  });
  it('fiabilité d’après les écarts sur 90 jours', () => {
    expect(fiabilite(2).niveau).toBe('fiable'); expect(fiabilite(3).niveau).toBe('surveiller'); expect(fiabilite(5)).toMatchObject({ niveau: 'risque', ton: 'er' });
  });
});
describe('PIN', () => {
  it('refuse les PIN triviaux', () => {
    for (const p of ['0000', '1111', '1234', '4321', '2468', '8642', '1212', '1122', '1991', '2024', '0852', '123', '12345', 'abcd', '1357']) expect(pinTrivial(p), p).toBe(true);
  });
  it('accepte un PIN ordinaire', () => { for (const p of ['7391', '5927', '4082', '6154']) expect(pinValide(p), p).toBe(true); });
  it('génère toujours un PIN valide, différent de l’ancien', () => {
    let i = 0; const alea = () => ((i = (i * 7 + 3) % 97) / 97);
    for (let k = 0; k < 300; k++) { const pin = genererPin(alea, ['7391']); expect(pinValide(pin)).toBe(true); expect(pin).not.toBe('7391'); }
    for (let k = 0; k < 300; k++) expect(pinValide(genererPin(aleaSur()))).toBe(true);
  });
  it('retombe sur un PIN sûr si le tirage ne donne rien', () => { expect(genererPin(() => 0)).toBe('7391'); expect(genererPin(() => 0, ['7391'])).toBe('5927'); });
});
describe('téléphone camerounais', () => {
  it('valide 9 chiffres commençant par 6, avec ou sans +237', () => {
    expect(telValide('670000101')).toBe(true); expect(telValide('+237 670 00 01 01')).toBe(true); expect(telValide('570000101')).toBe(false); expect(telValide('6700001')).toBe(false);
    expect(chiffresTel('237670000101')).toBe('670000101'); expect(formaterTel('670000101')).toBe('670 00 01 01');
  });
});
describe('tri des alertes', () => {
  const a = (id: string, gravite: number, ts = 0): Alerte & { ts: number } => ({ id, genre: 'caisse', ton: 'wa', etiquette: 'x', titre: id, sous: '', href: '/', gravite, ts });
  it('le plus grave d’abord, puis le plus récent', () => {
    expect(trierAlertes([a('b', 1, 9), a('a', 5, 1), a('c', 5, 7)]).map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });
});

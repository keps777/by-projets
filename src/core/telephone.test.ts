import { describe, expect, it } from 'vitest';
import { formaterSaisie, formaterTel, normaliserTel, telInternational } from './telephone.ts';

describe('numéros camerounais', () => {
  it('normalise les écritures usuelles', () => {
    for (const s of ['691221008', '6 91 22 10 08', '+237 6 91 22 10 08', '+237691221008', '00237 691 22 10 08', '237691221008']) expect(normaliserTel(s)).toBe('691221008');
  });
  it('refuse ce qui n’est pas un mobile camerounais', () => {
    for (const s of ['', '12345', '591221008', '69122100', '6912210089', '+33 6 12 34 56 78', 'abc']) expect(normaliserTel(s)).toBeNull();
  });
  it('formate pour l’affichage', () => {
    expect(formaterTel('691221008')).toBe('6 91 22 10 08'); expect(telInternational('+237691221008')).toBe('+237 6 91 22 10 08'); expect(formaterTel('abc')).toBe('abc');
  });
  it('met en forme pendant la frappe', () => { expect(formaterSaisie('69122')).toBe('6 91 22'); expect(formaterSaisie('+237 69')).toBe('6 9'); expect(formaterSaisie('6912210089999')).toBe('6 91 22 10 08'); });
});

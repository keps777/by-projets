import { describe, expect, it } from 'vitest';
import { AEROPORT_DEFAUT, LANGUES, REGIONS, TEXTES, codeAeroport, langueValide, regionDe, texte } from './dico.ts';

describe('mini-dictionnaire FR/EN', () => {
  it('a les mêmes clés dans les deux langues, sans texte vide', () => {
    expect(Object.keys(TEXTES.en).sort()).toEqual(Object.keys(TEXTES.fr).sort());
    for (const l of LANGUES) for (const [k, v] of Object.entries(TEXTES[l])) expect(v, `${l}.${k}`).toBeTruthy();
  });
  it('traduit le bouton et les libellés', () => {
    expect(texte('fr').continuer).toBe('Continuer'); expect(texte('en').continuer).toBe('Continue');
    expect(texte('en').aeroportLabel).toBe('Usual airport');
  });
  it('retombe sur le français pour une langue inconnue', () => {
    expect(texte('de')).toBe(TEXTES.fr); expect(langueValide('en')).toBe('en'); expect(langueValide('xx')).toBe('fr'); expect(langueValide(undefined)).toBe('fr');
  });
  it('propose trois régions avec devise, et une valeur par défaut', () => {
    expect(REGIONS.map((r) => r.code)).toEqual(['ca', 'us', 'fr']);
    expect(regionDe('us').compte).toBe('États-Unis · USD'); expect(regionDe('zz').code).toBe('ca');
    expect(regionDe('us').libelle.en).toBe('United States · $ US'); expect(regionDe('fr').libelle.fr).toBe('France · €');
  });
  it('lit le code d’aéroport entre parenthèses', () => {
    expect(codeAeroport(AEROPORT_DEFAUT)).toBe('YUL'); expect(codeAeroport('Paris (cdg)')).toBe('CDG');
    expect(codeAeroport('Montréal')).toBe(''); expect(codeAeroport('')).toBe('');
  });
});

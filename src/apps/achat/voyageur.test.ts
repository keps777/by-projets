import { describe, expect, it } from 'vitest';
import { etatInitial } from '../../data/seed.ts';
import { construireVoyageur, erreurDocument, erreurNaissance, erreursVoyageur, ligneVoyageur, nomEnCapitales, procheDe, saisieDuCompte, SAISIE_VIDE, type SaisieVoyageur } from './voyageur.ts';

const MAI = Date.parse('2026-10-12T09:00');
const ok: SaisieVoyageur = { nom: 'Tremblay', prenom: 'Alex', naissance: '1990-03-14', genre: 'M', document: 'ab 123456' };
describe('validation du voyageur', () => {
  it('accepte une saisie complète', () => { expect(erreursVoyageur('moi', ok, null, MAI)).toEqual({}); expect(erreursVoyageur('nouveau', { ...ok, document: '', genre: '' }, null, MAI)).toEqual({}); });
  it('exige nom, prénom et date de naissance', () => {
    const e = erreursVoyageur('nouveau', SAISIE_VIDE, null, MAI); expect(Object.keys(e)).toEqual(['nom', 'prenom', 'naissance']); expect(e.nom).toMatch(/passeport/);
  });
  it('refuse chiffres et symboles dans un nom, accepte accents, tirets et apostrophes', () => {
    expect(erreursVoyageur('nouveau', { ...ok, nom: 'R2D2' }, null, MAI).nom).toMatch(/lettres/); expect(erreursVoyageur('nouveau', { ...ok, prenom: 'Jean-François', nom: 'D’Amour' }, null, MAI)).toEqual({});
  });
  it('date de naissance : réelle, passée, après 1900', () => {
    expect(erreurNaissance('', MAI)).toMatch(/Indiquez/); expect(erreurNaissance('2027-01-01', MAI)).toMatch(/futur/); expect(erreurNaissance('2026-10-12', MAI)).toBe(''); expect(erreurNaissance('2026-02-31', MAI)).toMatch(/invalide/); expect(erreurNaissance('1850-01-01', MAI)).toMatch(/invalide/); expect(erreurNaissance('14/03/1990', MAI)).toMatch(/invalide/);
  });
  it('numéro de document facultatif, 6 à 12 caractères sinon', () => { expect(erreurDocument('')).toBe(''); expect(erreurDocument('AB 123 456')).toBe(''); expect(erreurDocument('AB1')).toMatch(/6 à 12/); expect(erreurDocument('AB-12345678901234')).toMatch(/6 à 12/); });
  it('un proche doit être choisi', () => { expect(erreursVoyageur('proche', SAISIE_VIDE, null, MAI).proche).toMatch(/Choisissez/); expect(erreursVoyageur('proche', SAISIE_VIDE, 'ACC-0187', MAI)).toEqual({}); });
});
describe('voyageur construit', () => {
  const moi = { id: 'ACC-0412', prenom: 'Alex', nom: 'Tremblay' };
  it('pour soi : lié au compte, document normalisé', () => {
    expect(construireVoyageur('moi', ok, moi)).toEqual({ prenom: 'Alex', nom: 'Tremblay', pourSoi: true, compteId: 'ACC-0412', naissance: '1990-03-14', genre: 'M', document: 'AB123456' });
  });
  it('nouveau voyageur : rognage, pas de compte, champs facultatifs absents', () => {
    expect(construireVoyageur('nouveau', { ...SAISIE_VIDE, nom: ' Roy ', prenom: ' Léa ', naissance: '2001-05-09' }, moi)).toEqual({ prenom: 'Léa', nom: 'Roy', pourSoi: false, naissance: '2001-05-09' });
  });
  it('proche enregistré : nom du compte du proche', () => { expect(construireVoyageur('proche', SAISIE_VIDE, moi, { id: 'ACC-0187', prenom: 'Camille', nom: 'Tremblay' })).toEqual({ prenom: 'Camille', nom: 'Tremblay', pourSoi: false, compteId: 'ACC-0187' }); });
  it('affichage en capitales et ligne du pied', () => {
    expect(nomEnCapitales({ prenom: 'Alex', nom: 'Exemple' })).toBe('ALEX EXEMPLE'); expect(ligneVoyageur('nouveau', SAISIE_VIDE)).toBe('À compléter'); expect(ligneVoyageur('moi', saisieDuCompte(moi))).toBe('ALEX TREMBLAY'); expect(ligneVoyageur('proche', ok)).toBe('À choisir');
    expect(ligneVoyageur('proche', ok, { prenom: 'Camille', nom: 'Tremblay' })).toBe('CAMILLE TREMBLAY');
  });
  it('proches du compte : les comptes enregistrés, dans l’ordre', () => {
    const m = etatInitial().monde, alex = m.comptes.find((c) => c.id === 'ACC-0412')!; expect(procheDe(alex, m.comptes).map((c) => c.prenom)).toEqual(['Camille', 'Paul']); expect(procheDe({ proches: ['ACC-9999'] }, m.comptes)).toEqual([]);
  });
});

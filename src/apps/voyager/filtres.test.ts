import { describe, expect, it } from 'vitest';
import { filtresVides, type Offre } from '../../core/recherche.ts';
import { basculer, compterDeparts, libellePrix, libelleVoir, nbReglages, prixDuCurseur, toutEffacer, valeurCurseur, type Reglages } from './filtres.ts';

const o = (id: string, heure: string, prix: number, extra: Partial<Offre> = {}): Offre => ({ id, genre: 'bus', heure, retardMin: 0, ab: 'BX', co: 'Bêta Express', col: '#3DE0FF', cl: 'Classique', gare: 'Mvan', prix, prixBase: prix, dureeMin: 210, places: 20, cap: 50, vip: false, compagnieId: 'BX', departId: id, confort: ['Climatisation'], complet: false, ...extra });
const BASE = [o('a', '06:00', 8000), o('b', '09:00', 6000), o('c', '10:00', 4500, { genre: 'cv', compagnieId: undefined }), o('d', '22:30', 5000)];
const reglages = (extra: Partial<Reglages> = {}): Reglages => ({ ...filtresVides(), tri: 'heure', ...extra });

describe('fenêtre de filtres', () => {
  it('basculer ajoute puis retire sans muter', () => {
    const l = ['Matin'] as const;
    expect(basculer(l, 'Nuit')).toEqual(['Matin', 'Nuit']);
    expect(basculer(['Matin', 'Nuit'], 'Matin')).toEqual(['Nuit']);
    expect(l).toEqual(['Matin']);
  });
  it('compte les réglages écartés de la valeur par défaut, type et tri compris', () => {
    expect(nbReglages(reglages())).toBe(0);
    expect(nbReglages(reglages({ genre: 'bus' }))).toBe(1);
    expect(nbReglages(reglages({ tri: 'prix' }))).toBe(1);
    expect(nbReglages(reglages({ prixMax: 6000, creneaux: ['Matin', 'Nuit'], tri: 'places', genre: 'covoit' }))).toBe(5);
  });
  it('tout effacer remet type, tri et filtres', () => {
    const r = reglages({ genre: 'bus', tri: 'confort', prixMax: 5000, creneaux: ['Aube'], compagnies: ['BX'], confort: ['Wi-Fi à bord'] });
    toutEffacer(r);
    expect(r).toEqual(reglages());
    expect(nbReglages(r)).toBe(0);
  });
  it('libellé et curseur du prix : à fond = sans limite', () => {
    expect(libellePrix(null)).toBe('Sans limite');
    expect(libellePrix(15000)).toBe('Sans limite');
    expect(libellePrix(7500)).toMatch(/7\s?500/);
    expect(prixDuCurseur(15000)).toBeNull();
    expect(prixDuCurseur(9500)).toBe(9500);
    expect(valeurCurseur(null)).toBe(15000);
    expect(valeurCurseur(6000)).toBe(6000);
  });
  it('le compteur est le vrai nombre de départs filtrés', () => {
    expect(compterDeparts(BASE, filtresVides())).toBe(4);
    expect(compterDeparts(BASE, { ...filtresVides(), genre: 'bus' })).toBe(3);
    expect(compterDeparts(BASE, { ...filtresVides(), prixMax: 5000 })).toBe(2);
    expect(compterDeparts(BASE, { ...filtresVides(), prixMax: 4000 })).toBe(0);
  });
  it('libellé du bouton principal', () => {
    expect(libelleVoir(0)).toBe('Aucun départ · élargis les filtres');
    expect(libelleVoir(1)).toBe('Voir 1 départ');
    expect(libelleVoir(19)).toBe('Voir 19 départs');
  });
});

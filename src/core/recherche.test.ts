import { describe, expect, it } from 'vitest';
import { classePrix, confortDe, creneauDe, departsProches, filtresVides, filtrer, grilleMois, nbFiltres, plusProche, prixCourt, type Offre } from './recherche.ts';
import { motosAutour, optionsVille, prixMoto, prixTaxi, prochainBusUrbain } from './ville.ts';

const o = (id: string, heure: string, prix: number, extra: Partial<Offre> = {}): Offre => ({ id, genre: 'bus', heure, retardMin: 0, ab: 'BX', co: 'Bêta Express', col: '#3DE0FF', cl: 'Classique', gare: 'Mvan', prix, prixBase: prix, dureeMin: 210, places: 20, cap: 50, vip: false, compagnieId: 'BX', departId: id, confort: confortDe('Classique'), complet: false, ...extra });
const OFFRES = [o('a', '06:00', 8000, { cl: 'VIP', vip: true, compagnieId: 'AV', confort: confortDe('VIP') }), o('b', '09:00', 6000), o('c', '10:00', 4500, { genre: 'cv', compagnieId: undefined, departId: undefined, covoitId: 'c', confort: ['Climatisation'] }), o('d', '22:30', 5000, { compagnieId: 'GE' })];

describe('créneaux et filtres', () => {
  it('range les heures dans Aube, Matin, Après-midi, Nuit', () => {
    expect(['03:59', '04:00', '07:59', '08:00', '11:59', '12:00', '20:59', '21:00', '00:30'].map(creneauDe)).toEqual(['Nuit', 'Aube', 'Aube', 'Matin', 'Matin', 'Après-midi', 'Après-midi', 'Nuit', 'Nuit']);
  });
  it('sans filtre, tout passe', () => { expect(filtrer(OFFRES, filtresVides())).toHaveLength(4); expect(nbFiltres(filtresVides())).toBe(0); });
  it('filtre par type', () => {
    expect(filtrer(OFFRES, { ...filtresVides(), genre: 'bus' }).map((x) => x.id)).toEqual(['a', 'b', 'd']);
    expect(filtrer(OFFRES, { ...filtresVides(), genre: 'covoit' }).map((x) => x.id)).toEqual(['c']);
  });
  it('filtre par prix maximum (inclus)', () => { expect(filtrer(OFFRES, { ...filtresVides(), prixMax: 5000 }).map((x) => x.id)).toEqual(['c', 'd']); });
  it('filtre par créneau, par compagnie (les covoiturages n’en ont pas) et par confort', () => {
    expect(filtrer(OFFRES, { ...filtresVides(), creneaux: ['Matin'] }).map((x) => x.id)).toEqual(['b', 'c']);
    expect(filtrer(OFFRES, { ...filtresVides(), compagnies: ['BX', 'GE'] }).map((x) => x.id)).toEqual(['b', 'd']);
    expect(filtrer(OFFRES, { ...filtresVides(), confort: ['Wi-Fi à bord'] }).map((x) => x.id)).toEqual(['a']);
    expect(filtrer(OFFRES, { ...filtresVides(), confort: ['Climatisation', 'Prise USB'] }).map((x) => x.id)).toEqual(['a']);
  });
  it('combine les filtres et les compte', () => {
    const f = { ...filtresVides(), prixMax: 6000, creneaux: ['Matin' as const, 'Nuit' as const], compagnies: ['BX'] };
    expect(filtrer(OFFRES, f).map((x) => x.id)).toEqual(['b']); expect(nbFiltres(f)).toBe(4);
  });
});
describe('calendrier des prix', () => {
  it('novembre 2026 commence un dimanche : 6 cases vides en semaine commençant lundi', () => { expect(grilleMois(2026, 10)).toEqual({ decalage: 6, jours: 30 }); expect(grilleMois(2026, 11)).toEqual({ decalage: 1, jours: 31 }); expect(grilleMois(2028, 1).jours).toBe(29); });
  it('classe les prix en bas / fort / moyen', () => {
    expect(classePrix(7000, 7000, 10000)).toBe('bas'); expect(classePrix(10000, 7000, 10000)).toBe('fort'); expect(classePrix(8500, 7000, 10000)).toBe(''); expect(classePrix(7000, 7000, 7000)).toBe(''); expect(classePrix(4500, 4500, 5000)).toBe('');
  });
  it('affiche le prix court', () => { expect(prixCourt(7500)).toBe('7,5k'); expect(prixCourt(8000)).toBe('8k'); });
  it('trouve les départs proches et le plus proche', () => {
    expect(departsProches('08:00', ['06:00', '07:00', '08:00', '08:00', '09:30', '22:00'])).toEqual(['07:00', '08:00', '09:30']);
    expect(departsProches('08:00', [])).toEqual([]);
    expect(plusProche(OFFRES, '09:40')?.id).toBe('c'); expect(plusProche([], '09:40')).toBeUndefined();
  });
});
describe('trajets en ville', () => {
  it('reproduit les prix de la maquette pour Bastos → Mvan', () => { expect(prixMoto(4.5)).toBe(700); expect(prixTaxi(4.5)).toBe(1500); });
  it('prochain bus urbain : toutes les 15 min à :10 :25 :40 :55', () => {
    expect(prochainBusUrbain(7 * 60 + 50)).toBe('07:55'); expect(prochainBusUrbain(7 * 60 + 55)).toBe('08:10'); expect(prochainBusUrbain(23 * 60 + 58)).toBe('00:10');
  });
  it('repère le plus rapide et le moins cher', () => {
    const opts = optionsVille(4.5, 'Bastos', 7 * 60 + 50, { nb: 4, minutes: 2 }, [{ id: 'cv', conducteur: 'Paul', depart: 'Bastos', heure: '07:50', places: 2, prix: 400 }]);
    expect(opts.map((x) => x.mode)).toEqual(['moto', 'taxi', 'covoit', 'bus']);
    expect(opts[0]).toMatchObject({ prix: 700, badge: 'le plus rapide' }); expect(opts[3]).toMatchObject({ prix: 250, badge: 'le moins cher' }); expect(opts[2].sous).toContain('Paul part de Bastos à 07:50 · 2 places');
  });
  it('sans covoiturage proposé, trois options', () => { expect(optionsVille(2, 'Essos', 600, motosAutour('Essos'), []).map((x) => x.mode)).toEqual(['moto', 'taxi', 'bus']); });
});

import { describe, expect, it } from 'vitest';
import { conseilPrix, conseilPrixVille, distanceKm, distanceVilleKm, dureeMin, heureArrivee, positionsJauge, repartition, texteDuree, verdictPrix, villeDuQuartier } from './covoitPrix.ts';

describe('aide au prix', () => {
  it('distances connues, symétriques, et estimation pour une ville inconnue', () => {
    expect(distanceKm('Yaoundé', 'Douala')).toBe(245); expect(distanceKm('Douala', 'Yaoundé')).toBe(245); expect(distanceKm('Douala', 'Kribi')).toBe(150);
    expect(distanceKm('Ville inconnue', 'Douala')).toBe(150);
  });
  it('fourchette conseillée selon la distance, arrondie à 500 F et bornée', () => {
    expect(conseilPrix(245)).toMatchObject({ bas: 3500, conseille: 4500, haut: 5000 });
    expect(conseilPrix(150)).toMatchObject({ bas: 2500, conseille: 2500, haut: 3000 });
    const c = conseilPrix(10); expect(c.bas).toBe(2000); expect(c.haut).toBeGreaterThanOrEqual(c.conseille);
    for (const km of [20, 100, 245, 365, 480, 900]) { const f = conseilPrix(km); expect(f.bas).toBeLessThanOrEqual(f.conseille); expect(f.conseille).toBeLessThanOrEqual(f.haut); expect(f.haut).toBeLessThanOrEqual(10000); expect(f.bas % 500).toBe(0); }
  });
  it('prix en ville : fourchette croissante avec la distance', () => {
    const a = conseilPrixVille(4), b = conseilPrixVille(10);
    expect(a.bas).toBeLessThan(b.bas); expect(a.bas).toBeLessThanOrEqual(a.conseille); expect(a.conseille).toBeLessThanOrEqual(a.haut); expect(a.bas % 50).toBe(0);
  });
  it('verdict et jauge', () => {
    const c = conseilPrix(245);
    expect(verdictPrix(3000, c)).toBe('bas'); expect(verdictPrix(4500, c)).toBe('juste'); expect(verdictPrix(7000, c)).toBe('haut');
    const j = positionsJauge(4500, c); expect(j.debut).toBeLessThan(j.curseur); expect(j.curseur).toBeLessThan(j.fin);
  });
  it('commission de 10 % : brut, commission, net', () => {
    expect(repartition(5000, 2)).toEqual({ brut: 10000, commission: 1000, net: 9000, parPlace: 4500, pourcent: 10 });
    expect(repartition(4500, 3).net + repartition(4500, 3).commission).toBe(13500);
  });
  it('durée et arrivée', () => {
    expect(dureeMin(245)).toBe(210); expect(texteDuree(210)).toBe('3 h 30'); expect(texteDuree(45)).toBe('45 min'); expect(texteDuree(240)).toBe('4 h');
    expect(heureArrivee('06:30', 210)).toEqual({ heure: '10:00', lendemain: false }); expect(heureArrivee('22:00', 180)).toEqual({ heure: '01:00', lendemain: true });
  });
  it('quartiers : ville et distance stables', () => {
    expect(villeDuQuartier('Bastos')).toBe('Yaoundé'); expect(villeDuQuartier('Akwa')).toBe('Douala'); expect(villeDuQuartier('Ailleurs')).toBeUndefined();
    expect(distanceVilleKm('Bastos', 'Essos')).toBe(distanceVilleKm('Essos', 'Bastos')); expect(distanceVilleKm('Bastos', 'Essos')).toBeGreaterThanOrEqual(3);
  });
});

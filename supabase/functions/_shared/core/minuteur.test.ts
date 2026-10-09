import { describe, expect, it } from 'vitest';
import { ecouleS, fixerEcoule, initial, lancer, pause, reprendre } from './minuteur.ts';

const T0 = Date.parse('2026-10-09T12:00:00Z');

describe('correction manuelle du temps écoulé', () => {
  it('un minuteur qui tourne repart du temps corrigé', () => {
    const m = lancer(T0);
    const maintenant = T0 + 600_000; // 10 min écoulées
    expect(ecouleS(m, maintenant)).toBe(600);
    const corrige = fixerEcoule(m, 3600, maintenant);
    expect(ecouleS(corrige, maintenant)).toBe(3600);
    expect(ecouleS(corrige, maintenant + 30_000)).toBe(3630);
    expect(corrige.etat).toBe('en_cours');
  });
  it('en pause, le temps reste figé à la valeur corrigée, et reprend de là', () => {
    const enPause = pause(lancer(T0), T0 + 1_800_000);
    const corrige = fixerEcoule(enPause, 4500, T0 + 5_000_000);
    expect(ecouleS(corrige, T0 + 9_000_000)).toBe(4500);
    expect(ecouleS(reprendre(corrige, T0 + 9_000_000), T0 + 9_060_000)).toBe(4560);
  });
  it('les pauses déjà prises ne faussent pas la correction', () => {
    const m = reprendre(pause(lancer(T0), T0 + 600_000), T0 + 900_000); // 10 min de travail, 5 min de pause
    const maintenant = T0 + 1_500_000;
    expect(ecouleS(m, maintenant)).toBe(1200);
    expect(ecouleS(fixerEcoule(m, 7200, maintenant), maintenant)).toBe(7200);
  });
  it('sans effet sur un bloc non lancé, et jamais négatif', () => {
    expect(fixerEcoule(initial(), 300, T0)).toEqual(initial());
    expect(ecouleS(fixerEcoule(lancer(T0), -50, T0 + 1000), T0 + 1000)).toBe(0);
  });
});

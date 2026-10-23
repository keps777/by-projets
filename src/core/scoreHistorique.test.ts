import { describe, expect, it } from 'vitest';
import { appliquerPoints, fractionJauge, gainDuMois, pousserSignal, synchroniserHistorique } from './scoreHistorique.ts';

const h = [{ mois: 'sept.', valeur: 724 }, { mois: 'oct.', valeur: 742 }];
describe('historique du score', () => {
  it('met à jour la barre du mois courant', () => {
    expect(synchroniserHistorique(h, 750, 'oct.')).toEqual([{ mois: 'sept.', valeur: 724 }, { mois: 'oct.', valeur: 750 }]);
  });
  it('crée la barre du nouveau mois et garde 6 mois', () => {
    const six = ['mai', 'juin', 'juil.', 'août', 'sept.', 'oct.'].map((mois, i) => ({ mois, valeur: 650 + i }));
    const r = synchroniserHistorique(six, 760, 'nov.');
    expect(r).toHaveLength(6); expect(r[0].mois).toBe('juin'); expect(r[5]).toEqual({ mois: 'nov.', valeur: 760 });
  });
  it('part d’un historique vide', () => expect(synchroniserHistorique([], 500, 'oct.')).toEqual([{ mois: 'oct.', valeur: 500 }]));
  it('applique des points et détecte la montée de niveau', () => {
    const r = appliquerPoints(742, 58, h, 'oct.');
    expect(r).toMatchObject({ apres: 800, reel: 58, niveauAvant: 'PRO', niveauApres: 'ELITE' });
    expect(r.historique[1].valeur).toBe(800);
  });
  it('borne à 900 et à 400, et signale une chute de niveau', () => {
    expect(appliquerPoints(895, 20, h, 'oct.')).toMatchObject({ apres: 900, reel: 5 });
    expect(appliquerPoints(410, -60, h, 'oct.')).toMatchObject({ apres: 400, reel: -10 });
    expect(appliquerPoints(702, -25, h, 'oct.')).toMatchObject({ niveauAvant: 'PRO', niveauApres: 'PLUS' });
  });
  it('gain du mois', () => { expect(gainDuMois(h)).toBe(18); expect(gainDuMois([h[0]])).toBeNull(); });
  it('jauge 400–900', () => { expect(fractionJauge(400)).toBe(0); expect(fractionJauge(900)).toBe(1); expect(fractionJauge(650)).toBe(0.5); expect(fractionJauge(1200)).toBe(1); });
  it('signal borné 0–100', () => { expect(pousserSignal(95, 10)).toBe(100); expect(pousserSignal(5, -25)).toBe(0); expect(pousserSignal(61, 5)).toBe(64); });
});

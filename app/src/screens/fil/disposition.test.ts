import { describe, expect, it } from 'vitest';
import { disposer } from './disposition.ts';
import { chrono, dateLongue, formatValeur, libelleCle, nomCourtRubrique, puceJour } from './format.ts';

describe('disposer', () => {
  it('laisse les blocs séparés sur une seule colonne', () => {
    expect(disposer([{ debut: 300, fin: 330 }, { debut: 330, fin: 375 }])).toEqual([{ col: 0, cols: 1 }, { col: 0, cols: 1 }]);
  });
  it('partage deux blocs qui se chevauchent', () => {
    expect(disposer([{ debut: 600, fin: 660 }, { debut: 630, fin: 700 }])).toEqual([{ col: 0, cols: 2 }, { col: 1, cols: 2 }]);
  });
  it('réutilise une colonne libérée dans le même groupe', () => {
    const p = disposer([{ debut: 0, fin: 100 }, { debut: 10, fin: 30 }, { debut: 40, fin: 60 }, { debut: 200, fin: 220 }]);
    expect(p).toEqual([{ col: 0, cols: 2 }, { col: 1, cols: 2 }, { col: 1, cols: 2 }, { col: 0, cols: 1 }]);
  });
  it('compte trois colonnes pour trois blocs simultanés, quel que soit l’ordre reçu', () => {
    const p = disposer([{ debut: 20, fin: 50 }, { debut: 0, fin: 60 }, { debut: 10, fin: 40 }]);
    expect(p.map((x) => x.cols)).toEqual([3, 3, 3]);
    expect(new Set(p.map((x) => x.col)).size).toBe(3);
    expect(p[1].col).toBe(0);
  });
});

describe('formats', () => {
  it('écrit les dates en français sans dépendre du fuseau', () => {
    expect(dateLongue('2026-10-05')).toBe('lundi 5 octobre');
    expect(puceJour('2026-10-05', '2026-10-05')).toBe('Aujourd’hui');
    expect(puceJour('2026-10-06', '2026-10-05')).toBe('Demain');
    expect(puceJour('2026-10-07', '2026-10-05')).toMatch(/^Mer\.? 7$/);
  });
  it('raccourcit les noms de rubriques', () => {
    expect(nomCourtRubrique('Ma relation avec Dieu')).toBe('Relation avec Dieu');
    expect(nomCourtRubrique('Mon travail et mes études')).toBe('Travail et études');
    expect(nomCourtRubrique('Transversal')).toBe('Transversal');
  });
  it('formate chronomètre et valeurs', () => {
    expect(chrono(252)).toBe('04:12');
    expect(chrono(3725)).toBe('1:02:05');
    expect(formatValeur('temps', 2700)).toBe('45 min');
    expect(formatValeur('nombre', 7, 'chapitres')).toBe('7 chapitres');
    expect(libelleCle('nombre:pages')).toBe('Pages');
    expect(libelleCle('temps')).toBe('Temps passé');
  });
});

import { describe, expect, it } from 'vitest';
import type { Metrique, ValeurSaisie } from '@core/types.ts';
import {
  barresDuMois, calculsProposes, champTexte, estFinances, jourAtteint, jourCourt, lireChamp, objectifTexte, parJour, periodePour,
  periodeTexte, problemesMetriques, realiseSurCible, resumeReprise, rolesFinances, textesParJour, valeurTexte, type Brouillon
} from './vues.ts';

const M = (p: Partial<Metrique>): Metrique => ({ id: 'm', cle: 'nombre:chapitres', type: 'nombre', nom: 'Chapitres lus', unite: 'chapitres', cible: 7, periode: 'jour', sens: 'plus', dansRapport: true, ...p });
const V = (cle: string, jour: string, valeur: number, texte?: string): ValeurSaisie => ({ cle, jour, valeur, texte });

describe('formats', () => {
  it('dates courtes et périodes', () => {
    expect(jourCourt('2026-10-01')).toBe('1er oct.');
    expect(jourCourt('2026-10-05')).toBe('5 oct.');
    expect(periodeTexte('2026-10-01', '2026-10-31')).toBe('1er – 31 octobre 2026');
    expect(periodeTexte('2026-10-15', '2026-11-23')).toBe('15 oct. – 23 nov. 2026');
    expect(periodeTexte('2026-10-03', null)).toBe('depuis le 3 oct. 2026');
  });
  it('valeurs selon le type', () => {
    expect(valeurTexte(M({}), 23, true)).toBe('23 ch.');
    expect(valeurTexte(M({ type: 'temps', unite: 'min' }), 9000)).toBe('2 h 30');
    expect(valeurTexte(M({ type: 'montant', unite: '$' }), 290000)).toMatch(/^2\s900\s\$$/);
    expect(valeurTexte(M({ type: 'heure' }), 310)).toBe('05:10');
    expect(realiseSurCible(M({}), 23, 217)).toBe('23 / 217 ch.');
    expect(realiseSurCible(M({ type: 'temps' }), 9000, 81000)).toBe('2 h 30 / 22 h 30');
  });
  it('texte de l’objectif', () => {
    expect(objectifTexte(M({}))).toBe('Objectif : 7 ch. par jour');
    expect(objectifTexte(M({ type: 'temps', cible: 2700 }))).toBe('Objectif : 45 min par jour');
    expect(objectifTexte(M({ type: 'heure', cible: 300, sens: 'moins' }))).toBe('Objectif : avant 05:00');
    expect(objectifTexte(M({ cible: null }))).toBe('Objectif à définir');
  });
  it('champs d’objectif en unités affichées, stockés en unités de base', () => {
    expect(champTexte('temps', 2700)).toBe('45');
    expect(lireChamp('temps', '45')).toBe(2700);
    expect(lireChamp('montant', '68,40')).toBe(6840);
    expect(lireChamp('distance', '5,5')).toBe(5500);
    expect(lireChamp('heure', '05:10')).toBe(310);
    expect(lireChamp('nombre', '')).toBeNull();
    expect(champTexte('poids', 75500)).toBe('75,5');
  });
});

describe('métriques à créer', () => {
  const b = (p: Partial<Brouillon>): Brouillon => ({ type: 'temps', nom: 'Temps', unite: 'min', cible: 1800, periode_cible: 'jour', sens: 'plus', dans_rapport: true, ...p });
  it('signale deux métriques qui liraient la même clé', () => {
    expect(problemesMetriques([b({}), b({ nom: 'Autre temps' })], null)).toHaveLength(1);
    expect(problemesMetriques([b({}), b({ type: 'nombre', unite: 'pages', nom: 'Pages' })], null)).toHaveLength(0);
  });
  it('refuse un total sans date de fin (spec §5)', () => {
    expect(problemesMetriques([b({ periode_cible: 'total' })], null)).toHaveLength(1);
    expect(problemesMetriques([b({ periode_cible: 'total' })], '2026-10-31')).toHaveLength(0);
  });
  it('propose les calculs du catalogue', () => {
    const c = calculsProposes([b({ type: 'montant', nom: 'Entrées', cible: 380000 }), b({ type: 'montant', nom: 'Sorties', sens: 'moins', cible: 240000 })]);
    expect(c[0]).toBe('Solde = Entrées − Sorties');
    expect(c[1]).toMatch(/^Reste du budget = 2\s400\s\$ − Sorties$/);
  });
  it('période d’un nouveau sous-projet', () => {
    expect(periodePour('mois', '2026-10-05')).toEqual({ debut: '2026-10-01', fin: '2026-10-31' });
    expect(periodePour('semaine', '2026-10-07')).toEqual({ debut: '2026-10-05', fin: '2026-10-11' });
    expect(periodePour('sans_fin', '2026-10-05').fin).toBeNull();
  });
});

describe('jour par jour', () => {
  const vals = [V('nombre:chapitres', '2026-10-01', 7), V('nombre:chapitres', '2026-10-02', 5), V('nombre:chapitres', '2026-10-02', 4),
    V('reference:passages', '2026-10-02', 0, 'Marc 1–9'), V('temps', '2026-10-02', 3120)];
  it('agrège par jour', () => {
    const p = parJour(vals, M({}), '2026-10-01', '2026-10-31');
    expect(p.get('2026-10-02')).toBe(9);
    expect(textesParJour(vals, 'reference:passages', '2026-10-01', '2026-10-31').get('2026-10-02')).toBe('Marc 1–9');
  });
  it('objectif du jour atteint selon le sens', () => {
    expect(jourAtteint(M({}), 7, 7)).toBe(true);
    expect(jourAtteint(M({ sens: 'moins' }), 320, 300)).toBe(false);
  });
  it('barres du mois', () => {
    const b = barresDuMois('2026-10', parJour(vals, M({}), '2026-10-01', '2026-10-31'), '2026-10-05', '2026-10-01', '2026-10-31', (v) => v >= 7);
    expect(b).toHaveLength(31);
    expect(b[0].etat).toBe('atteint');
    expect(b[2].etat).toBe('zero');
    expect(b[10].etat).toBe('avenir');
  });
});

describe('reprise du passé (US-17)', () => {
  it('annonce les jours et totaux repris', () => {
    const vals = [V('nombre:chapitres', '2026-10-01', 7), V('nombre:chapitres', '2026-10-03', 16), V('temps', '2026-10-01', 2700), V('temps', '2026-10-05', 6300), V('fois', '2026-10-02', 1)];
    const ms = [M({}), M({ cle: 'temps', type: 'temps', unite: 'min', nom: 'Temps' })];
    expect(resumeReprise(vals, ms, '2026-10-01', '2026-10-05')).toBe('3 jours de saisies trouvés du 1er au 5 oct. : 23 chapitres, 2 h 30.');
    expect(resumeReprise(vals, ms, '2026-10-06', '2026-10-06')).toBeNull();
  });
});

describe('finances', () => {
  const ms = [M({ type: 'montant', cle: 'montant:entrees', nom: 'Entrées' }), M({ type: 'montant', cle: 'montant:sorties', nom: 'Sorties', sens: 'moins' }), M({ type: 'montant', cle: 'montant:epargne', nom: 'Épargne' })];
  it('repère entrées, sorties et épargne', () => {
    const r = rolesFinances(ms);
    expect([r.entrees?.nom, r.sorties?.nom, r.epargne?.nom]).toEqual(['Entrées', 'Sorties', 'Épargne']);
    expect(estFinances(ms)).toBe(true);
    expect(estFinances([M({})])).toBe(false);
  });
});

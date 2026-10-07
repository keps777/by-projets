import { describe, expect, it } from 'vitest';
import type { Metrique } from '@core/types.ts';
import { besoinDuSousProjet, lienProposition, minutesPlanifieesParSemaine, parSemaine, proposerTaches } from './propositions-taches.ts';

const m = (p: Partial<Metrique>): Metrique => ({ id: 'm', cle: 'temps', type: 'temps', nom: 'Temps', unite: 'min', cible: null, periode: 'jour', sens: 'plus', dansRapport: true, ...p });
const sp = { debut: '2026-10-01', fin: null };
const tache = (duree_min: number, frequence: 'quotidien' | 'hebdo' | 'une_fois', jours?: number[]) => ({ duree_min, regle: { frequence, debut: '2026-10-01', fin: { type: 'aucune' as const }, jours } });

describe('propositions de tâches pour remplir un objectif', () => {
  it('traduit l’objectif en besoin par semaine', () => {
    expect(parSemaine(m({ cible: 1800, periode: 'jour' }), sp, '2026-10')).toBe(12600); // 30 min par jour
    expect(parSemaine(m({ cible: 7200, periode: 'semaine' }), sp, '2026-10')).toBe(7200);
    expect(Math.round(parSemaine(m({ cible: 31 * 600, periode: 'mois' }), sp, '2026-10')!)).toBe(4200); // 10 min par jour
    expect(parSemaine(m({ cible: 100, periode: 'total' }), sp, '2026-10')).toBeNull(); // sans date de fin
    expect(parSemaine(m({ type: 'poids', cible: 75000 }), sp, '2026-10')).toBeNull();
  });

  it('sans tâche : tous les jours, du lundi au vendredi, 3 fois par semaine, durées réparties', () => {
    const b = besoinDuSousProjet([m({ cible: 7200, periode: 'semaine' })], sp, '2026-10'); // 2 h par semaine
    const { manque, propositions } = proposerTaches(b, []);
    expect(manque).toBe('Aucune tâche ne nourrit ce sous-projet.');
    expect(propositions.map((p) => [p.quand, p.dureeMin])).toEqual([['Tous les jours', 20], ['Du lundi au vendredi', 25], ['3 fois par semaine', 40]]);
    expect(propositions[0].detail).toBe('20 min × 7 jours = 2 h 20 par semaine');
  });

  it('un objectif de pages : valeurs prévues par fois, durée par défaut', () => {
    const pages = m({ id: 'p', cle: 'nombre:pages', type: 'nombre', nom: 'Nombres', unite: 'pages', cible: 900, periode: 'mois' });
    const { propositions } = proposerTaches(besoinDuSousProjet([pages], sp, '2026-10'), []);
    // 900 pages sur 31 jours ≈ 203 par semaine : 29 par jour, 41 sur 5 jours, 68 sur 3 jours
    expect(propositions.map((p) => p.prevus['nombre:pages'])).toEqual([30, 41, 68]);
    expect(propositions[0].dureeMin).toBe(45);
  });

  it('avec des tâches qui couvrent déjà le temps, aucune proposition ; sinon, ce qui manque', () => {
    const b = besoinDuSousProjet([m({ cible: 3 * 3600, periode: 'semaine' })], sp, '2026-10'); // 3 h par semaine = 180 min
    expect(minutesPlanifieesParSemaine([tache(30, 'quotidien'), tache(60, 'une_fois')])).toBe(210);
    expect(proposerTaches(b, [tache(30, 'quotidien')]).propositions).toEqual([]);
    const reste = proposerTaches(b, [tache(30, 'hebdo', [0, 2])]); // 60 min planifiées, il manque 120
    expect(reste.manque).toBe('Les tâches planifient 1 h par semaine ; il en faut 3 h.');
    expect(reste.propositions.map((p) => p.dureeMin)).toEqual([20, 25, 40]);
  });

  it('une durée absurde n’est pas proposée', () => {
    const b = besoinDuSousProjet([m({ cible: 60 * 3600, periode: 'semaine' })], sp, '2026-10'); // 60 h par semaine
    expect(proposerTaches(b, []).propositions).toEqual([]);
  });

  it('le lien ouvre la nouvelle tâche prérenseignée', () => {
    const b = besoinDuSousProjet([m({ cible: 7200, periode: 'semaine' }), m({ id: 'p', cle: 'nombre:pages', type: 'nombre', nom: 'Pages', unite: 'pages', cible: 70, periode: 'semaine' })], sp, '2026-10');
    const p = proposerTaches(b, []).propositions[1];
    const lien = lienProposition(p, 'proj', 'sp1', 'Lecture');
    expect(lien).toContain('/tache/nouvelle?projet=proj&sous_projet=sp1&titre=Lecture&duree=25&rec=hebdo&jours=0%2C1%2C2%2C3%2C4');
    expect(decodeURIComponent(lien)).toContain('prevus=nombre:pages=14');
  });
});

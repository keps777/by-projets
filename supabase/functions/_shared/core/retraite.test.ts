import { describe, it, expect } from 'vitest';
import { minutesDeRetard, planifierRetraite, type BesoinRetraite } from './retraite.ts';

const besoin = (p: Partial<BesoinRetraite>): BesoinRetraite => ({
  cle: 'p|temps', projetId: 'p', projetNom: 'Prière seule', rubriqueId: 'r1', rubriqueNom: 'Ma relation avec Dieu', spId: 's', spNom: 'Prière', type: 'temps', cleMetrique: 'temps', unites: 3600, minutes: 60, detail: '1 h', ...p
});

describe('minutesDeRetard', () => {
  it('temps : le retard lui-même (secondes → minutes)', () => { expect(minutesDeRetard({ type: 'temps', cle: 'temps' }, 5400)).toBe(90); });
  it('chapitres : 12 min chacun, arrondi aux 5 min', () => { expect(minutesDeRetard({ type: 'nombre', cle: 'nombre:chapitres' }, 12)).toBe(145); });
  it('pages : 2 min chacune', () => { expect(minutesDeRetard({ type: 'nombre', cle: 'nombre:pages' }, 40)).toBe(80); });
  it('montant : un geste de 10 min', () => { expect(minutesDeRetard({ type: 'montant', cle: 'montant:don' }, 50000)).toBe(10); });
  it('pas de retard ou rien de rattrapable : 0', () => {
    expect(minutesDeRetard({ type: 'temps', cle: 'temps' }, 0)).toBe(0);
    expect(minutesDeRetard({ type: 'heure', cle: 'heure' }, 5)).toBe(0);
    expect(minutesDeRetard({ type: 'temps', cle: 'temps' }, 120)).toBe(0);
  });
});

describe('planifierRetraite', () => {
  it('une journée de 24 h : les blocs fixes couvrent 690 min, les plages libres 750', () => {
    const plan = planifierRetraite([]);
    expect(plan.blocs.reduce((s, b) => s + b.duree, 0)).toBe(690);
    expect(plan.blocs[0]).toMatchObject({ debut: 360, type: 'ouverture' });
    expect(plan.blocs.at(-1)).toMatchObject({ type: 'cloture', debut: 1770 });
  });

  it('place chaque besoin sans chevaucher les repas ni la nuit', () => {
    const plan = planifierRetraite([besoin({ minutes: 240 }), besoin({ cle: 'q|temps', rubriqueId: 'r2', rubriqueNom: 'Travail', projetNom: 'Étude', minutes: 120 })]);
    expect(plan.manque).toBe(0);
    expect(plan.place).toBe(360);
    const tout = [...plan.blocs].sort((a, b) => a.debut - b.debut);
    for (let i = 1; i < tout.length; i++) expect(tout[i].debut).toBeGreaterThanOrEqual(tout[i - 1].debut + tout[i - 1].duree);
    expect(plan.blocs.filter((b) => b.type === 'activite').every((b) => b.duree <= 90)).toBe(true);
  });

  it('trop de retard : tout est réduit proportionnellement, chaque thème garde sa part, le manque est annoncé', () => {
    const plan = planifierRetraite([besoin({ minutes: 900 }), besoin({ cle: 'q|temps', rubriqueId: 'r2', minutes: 300 })]);
    expect(plan.besoinTotal).toBe(1200);
    expect(plan.parTheme.every((t) => t.place > 0)).toBe(true);
    expect(plan.manque).toBeGreaterThan(400);
    expect(plan.place).toBeLessThanOrEqual(660);
  });

  it('les unités couvertes suivent le temps placé (12 ch en 145 min → 6 ch en 72 min)', () => {
    const b = besoin({ cle: 'p|nombre:chapitres', type: 'nombre', cleMetrique: 'nombre:chapitres', unites: 12, minutes: 145 });
    const plan = planifierRetraite([b]);
    const couvert = plan.blocs.filter((x) => x.besoin).reduce((s, x) => s + (x.unitesCouvertes ?? 0), 0);
    expect(couvert).toBeCloseTo(12, 5);
  });
});

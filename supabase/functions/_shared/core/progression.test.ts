import { describe, it, expect } from 'vitest';
import { cibleDuMois, fenetreDuMois, progressionDuMois, progressionPilotes, metriquesPilotes, moyennePct, doitEtreValide, joursEcoules } from './progression.ts';
import { agreger, cleMetrique } from './metriques.ts';
import type { Metrique, ValeurSaisie } from './types.ts';
import { solde, resteBudget, tauxEpargne, joursDeJeune, allure } from './calculs.ts';

const metrique = (p: Partial<Metrique>): Metrique => ({
  id: 'm', cle: 'nombre:chapitres', type: 'nombre', nom: 'Chapitres', unite: 'chapitres', cible: 7, periode: 'jour', sens: 'plus', dansRapport: true, ...p
});
const saisies = (jours: [string, number][], cle = 'nombre:chapitres'): ValeurSaisie[] => jours.map(([jour, valeur]) => ({ cle, jour, valeur }));

describe('exemples vérifiables de la spec §5', () => {
  const octobre = { debut: '2026-10-01', fin: '2026-10-31' };

  it('7 chapitres par jour en octobre : cible 217, 23 lus → 11 %, attendu 35 au 5 octobre', () => {
    const m = metrique({ cible: 7, periode: 'jour' });
    expect(cibleDuMois(m, octobre, '2026-10')).toBe(217);
    const v = saisies([['2026-10-01', 7], ['2026-10-02', 9], ['2026-10-03', 4], ['2026-10-04', 0], ['2026-10-05', 3]]);
    const p = progressionDuMois(m, octobre, v, '2026-10', '2026-10-05');
    expect(p.realise).toBe(23);
    expect(p.pct).toBe(11);
    expect(p.attendu).toBe(35);
    expect(p.retard).toBe(12);
    expect(p.etat).toBe('en_cours');
    expect(p.traitPct).toBe(16);
  });

  it('Nouveau Testament : 260 chapitres en octobre, attendu 42 au 5 octobre, à rattraper à 9,1 par jour', () => {
    const m = metrique({ cible: 260, periode: 'total' });
    expect(cibleDuMois(m, octobre, '2026-10')).toBe(260);
    const p = progressionDuMois(m, octobre, saisies([['2026-10-01', 23]]), '2026-10', '2026-10-05');
    expect(Math.round(p.attendu!)).toBe(42);
    expect(p.pct).toBe(9);
    expect(p.joursRestants).toBe(26);
    expect(p.parJourPourRattraper!.toFixed(1)).toBe('9.1');
  });

  it('jeûne de 40 jours du 15 octobre au 23 novembre : 17 jours en octobre, 23 en novembre', () => {
    const jeune = { debut: '2026-10-15', fin: '2026-11-23' };
    const m = metrique({ cible: 40, periode: 'total', type: 'choix', cle: 'choix:jeune' });
    expect(fenetreDuMois(jeune, '2026-10')!.jours).toBe(17);
    expect(cibleDuMois(m, jeune, '2026-10')).toBe(17);
    expect(cibleDuMois(m, jeune, '2026-11')).toBe(23);
    expect(cibleDuMois(m, jeune, '2026-12')).toBeNull();
  });

  it('un sous-projet de 7 jours ou de 21 jours suit la même règle', () => {
    const m = metrique({ cible: 21, periode: 'total' });
    expect(cibleDuMois(m, { debut: '2026-10-25', fin: '2026-10-31' }, '2026-10')).toBe(21);
    expect(cibleDuMois(m, { debut: '2026-10-25', fin: '2026-11-14' }, '2026-10')).toBeCloseTo(7);
    expect(cibleDuMois(m, { debut: '2026-10-25', fin: '2026-11-14' }, '2026-11')).toBeCloseTo(14);
  });

  it('cible par semaine et par mois', () => {
    expect(cibleDuMois(metrique({ cible: 5, periode: 'semaine' }), octobre, '2026-10')).toBeCloseTo((5 * 31) / 7);
    expect(cibleDuMois(metrique({ cible: 8, periode: 'mois' }), octobre, '2026-10')).toBe(8);
    expect(cibleDuMois(metrique({ cible: 8, periode: 'mois' }), { debut: '2026-10-16', fin: '2026-10-31' }, '2026-10')).toBeCloseTo((8 * 16) / 31);
  });

  it('période « au total » sans fin : pas de cible', () => {
    expect(cibleDuMois(metrique({ cible: 40, periode: 'total' }), { debut: '2026-10-01', fin: null }, '2026-10')).toBeNull();
  });
});

describe('cas particuliers', () => {
  it('sans objectif : à définir', () => {
    const p = progressionDuMois(metrique({ cible: null }), { debut: '2026-10-01', fin: null }, [], '2026-10', '2026-10-05');
    expect(p.etat).toBe('a_definir');
    expect(p.pct).toBeNull();
  });
  it("plafonne l'affichage à 100 % mais garde la valeur réelle", () => {
    const m = metrique({ cible: 10, periode: 'mois' });
    const p = progressionDuMois(m, { debut: '2026-10-01', fin: null }, saisies([['2026-10-02', 15]]), '2026-10', '2026-10-05');
    expect(p.pct).toBe(100);
    expect(p.ratio).toBe(1.5);
  });
  it('poids : avancement entre la valeur de départ et la cible', () => {
    const m = metrique({ type: 'poids', cle: 'poids', cible: 75000, periode: 'total', sens: 'moins' });
    const sp = { debut: '2026-10-01', fin: '2026-12-31' };
    const v = saisies([['2026-10-01', 80000], ['2026-10-20', 77500]], 'poids');
    const p = progressionDuMois(m, sp, v, '2026-10', '2026-10-20');
    expect(p.pct).toBe(50);
  });
  it("heure : part des jours où l'heure respecte la cible", () => {
    const m = metrique({ type: 'heure', cle: 'heure', cible: 300, periode: 'jour', sens: 'moins' });
    const v = saisies([['2026-10-01', 295], ['2026-10-02', 310], ['2026-10-03', 300], ['2026-10-04', 330]], 'heure');
    const p = progressionDuMois(m, { debut: '2026-10-01', fin: '2026-10-31' }, v, '2026-10', '2026-10-04');
    expect(p.pct).toBe(50);
  });
  it('compte les jours écoulés, aujourd’hui compris', () => {
    const f = { debut: '2026-10-01', fin: '2026-10-31', jours: 31 };
    expect(joursEcoules(f, '2026-09-30')).toBe(0);
    expect(joursEcoules(f, '2026-10-01')).toBe(1);
    expect(joursEcoules(f, '2026-11-02')).toBe(31);
  });
  it('moyenne les sous-projets et ignore ceux sans objectif', () => {
    expect(moyennePct([11, 9, null])).toBe(10);
    expect(moyennePct([null])).toBeNull();
  });
  it('propose de valider à la fin ou quand la cible est atteinte', () => {
    const m = metrique({ cible: 260, periode: 'total' });
    const sp = { debut: '2026-10-01', fin: '2026-10-31' };
    expect(doitEtreValide(m, sp, [], '2026-11-01')).toBe(true);
    expect(doitEtreValide(m, sp, saisies([['2026-10-20', 260]]), '2026-10-20')).toBe(true);
    expect(doitEtreValide(m, sp, saisies([['2026-10-20', 100]]), '2026-10-20')).toBe(false);
  });
});

describe('agrégation et clés', () => {
  it('somme, moyenne, dernière valeur', () => {
    expect(agreger('nombre', saisies([['2026-10-01', 2], ['2026-10-02', 3]]))).toBe(5);
    expect(agreger('note', saisies([['2026-10-01', 6], ['2026-10-02', 8]]))).toBe(7);
    expect(agreger('poids', saisies([['2026-10-02', 77000], ['2026-10-01', 80000]]))).toBe(77000);
    expect(agreger('poids', [])).toBeNull();
    expect(agreger('temps', [])).toBe(0);
  });
  it('construit des clés stables', () => {
    expect(cleMetrique('nombre', 'chapitres')).toBe('nombre:chapitres');
    expect(cleMetrique('nombre', 'Âmes')).toBe('nombre:ames');
    expect(cleMetrique('temps', 'min')).toBe('temps');
    expect(cleMetrique('montant', '$', 'Sorties')).toBe('montant:sorties');
  });
});

describe('calculs automatiques', () => {
  it('finances', () => {
    expect(solde(290000, 152000)).toBe(138000);
    expect(resteBudget(240000, 152000, 26)).toEqual({ reste: 88000, parJour: 3385 });
    expect(tauxEpargne(30000, 290000)).toBeCloseTo(0.103, 3);
  });
  it('jeûne et allure', () => {
    expect(joursDeJeune([1, 0.5, 1])).toBe(2.5);
    expect(allure(1800, 5000)).toBe(360);
  });
});

describe('plusieurs métriques pilotent ensemble la barre', () => {
  const m = (id: string, cle: string, type: Metrique['type'], cible: number | null): Metrique => ({ id, cle, type, nom: id, unite: '', cible, periode: 'jour', sens: 'plus', dansRapport: true });
  const temps = m('t', 'temps', 'temps', 3600), pages = m('p', 'nombre:pages', 'nombre', 10), libre = m('l', 'fois', 'fois', null);
  const sp = { debut: '2026-10-01', fin: null };
  const v = (cle: string, jour: string, valeur: number): ValeurSaisie => ({ cle, jour, valeur });
  // 6 jours écoulés au 6 oct. : cibles du mois 6 h (temps) et 60 pages (6 × 10).

  it('désigne les pilotes, sinon la seule pilote par défaut', () => {
    expect(metriquesPilotes([temps, pages, libre], ['p', 't'], null).map((x) => x.id)).toEqual(['t', 'p']);
    expect(metriquesPilotes([temps, pages, libre], [], 'p').map((x) => x.id)).toEqual(['p']);
    expect(metriquesPilotes([libre, pages], undefined, null).map((x) => x.id)).toEqual(['p']);
    expect(metriquesPilotes([libre], [], null)).toEqual([]);
  });
  it('la barre est la moyenne des progressions des pilotes', () => {
    const valeurs = [v('temps', '2026-10-03', 10 * 3600), v('nombre:pages', '2026-10-03', 155)]; // sur le mois : 31 h et 310 pages attendues
    const t = progressionPilotes([temps], sp, valeurs, '2026-10', '2026-10-06');
    const p = progressionPilotes([pages], sp, valeurs, '2026-10', '2026-10-06');
    const ensemble = progressionPilotes([temps, pages], sp, valeurs, '2026-10', '2026-10-06');
    expect(t.pct).toBe(32); // 10 h / 31 h
    expect(p.pct).toBe(50); // 155 / 310
    expect(ensemble.pct).toBe(41); // moyenne de 32 et 50
    // le reste (réalisé, cible) vient de la pilote principale
    expect(ensemble.realise).toBe(t.realise);
    expect(ensemble.cible).toBe(t.cible);
  });
  it('une pilote sans objectif ne compte pas dans la moyenne', () => {
    const valeurs = [v('nombre:pages', '2026-10-03', 30)];
    const a = progressionPilotes([pages], sp, valeurs, '2026-10', '2026-10-06');
    expect(progressionPilotes([libre, pages], sp, valeurs, '2026-10', '2026-10-06').pct).toBe(a.pct);
    expect(progressionPilotes([], sp, valeurs, '2026-10', '2026-10-06').etat).toBe('a_definir');
  });
});

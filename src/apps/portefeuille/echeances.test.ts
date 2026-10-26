import { beforeEach, describe, expect, it } from 'vitest';
import { etatInitial } from '../../data/seed.ts';
import type { Monde } from '../../domain/types.ts';
import { chronologie, decompte, echeances, phraseProchainRappel, prochaine, rappelsPlanifies, RAPPELS_DEFAUT, resumeEchelle, urgenceDe } from './echeances.ts';

const NOW = Date.parse('2026-10-12T09:00'), ALEX = 'ACC-0412';
let m: Monde;
beforeEach(() => { m = etatInitial().monde; });
const nbsp = (s: string) => s.replace(/ /g, ' ');

describe('echeances', () => {
  it('les quatre droits d’Alex, du plus proche au plus lointain, échéance 24 h avant le départ', () => {
    const l = echeances(m, ALEX, NOW);
    expect(l.map((e) => e.route)).toEqual(['YUL → CDG', 'YUL → HAV', 'YUL → PUJ', 'YUL → PPT']);
    expect(l[0]).toMatchObject({ droitId: 'd-812', quand: 'dim. 13 déc. · 18:05', quandLong: 'dim. 13 déc. 2026 · 18:05', jours: 62, urgence: 'proche', statutLib: 'Détenu', ville: 'Paris', numeroVol: 'AE 812', compagnie: 'Aérolys' });
    expect(new Date(l[2].echeanceMs).getHours()).toBe(7); expect(l[2].quand).toBe('sam. 20 févr. · 07:30');
  });
  it('un droit en vente porte son prix et son retrait automatique ; nommé : plus d’action', () => {
    const l = echeances(m, ALEX, NOW), h = l.find((e) => e.droitId === 'd-hav')!;
    expect(nbsp(h.statutLib)).toBe('En revente · 620 $'); expect(h.effet).toMatch(/Retrait automatique de l’annonce/); expect(l[0].effet).toMatch(/Nommer le voyageur/);
    m.droits.find((d) => d.id === 'd-812')!.statut = 'nomme'; const n = echeances(m, ALEX, NOW); expect(n[0]).toMatchObject({ statut: 'nomme', statutLib: 'Nommé' }); expect(prochaine(n, NOW)!.droitId).toBe('d-hav');
  });
  it('ignore les vols partis et les droits des autres comptes', () => { expect(echeances(m, ALEX, Date.parse('2027-03-01T00:00')).map((e) => e.droitId)).toEqual(['d-ppt']); expect(echeances(m, 'ACC-0999', NOW)).toEqual([]); });
  it('urgence : 90 j ou moins proche, 91 à 120 moyenne, au-delà lointaine', () => { expect([62, 90, 91, 120, 121].map(urgenceDe)).toEqual(['proche', 'proche', 'moyenne', 'moyenne', 'lointaine']); });
  it('la prochaine échéance est la première à agir', () => { expect(prochaine(echeances(m, ALEX, NOW), NOW)!.droitId).toBe('d-812'); expect(prochaine([], NOW)).toBeUndefined(); });
});
describe('rappels', () => {
  it('J-30 et J-7 par défaut, datés avant l’échéance, jamais dans le passé', () => {
    const p = rappelsPlanifies(echeances(m, ALEX, NOW), RAPPELS_DEFAUT, NOW);
    const cdg = p.filter((x) => x.route === 'YUL → CDG'); expect(cdg.map((x) => x.libelle)).toEqual(['J-30', 'J-7']); expect(new Date(cdg[0].dateMs).toDateString()).toBe(new Date(2026, 10, 13).toDateString());
    expect(p.every((x) => x.dateMs > Date.parse('2026-10-12T00:00'))).toBe(true); expect(p.some((x) => x.libelle === 'J-2')).toBe(false);
  });
  it('un rappel dont la date est passée est omis (échéance dans 20 jours : pas de J-30)', () => {
    const p = rappelsPlanifies(echeances(m, ALEX, Date.parse('2026-11-23T09:00')), { j30: true, j7: true, j2: true }, Date.parse('2026-11-23T09:00')).filter((x) => x.route === 'YUL → CDG'); expect(p.map((x) => x.libelle)).toEqual(['J-7', 'J-2']);
  });
  it('rien pour un droit nommé ; phrase du prochain rappel', () => {
    m.droits.filter((d) => d.detenteurId === ALEX).forEach((d) => (d.statut = 'nomme')); expect(rappelsPlanifies(echeances(m, ALEX, NOW), RAPPELS_DEFAUT, NOW)).toEqual([]);
    expect(phraseProchainRappel([])).toBe('Aucun rappel programmé : vous ne serez pas prévenu avant les échéances.');
    expect(phraseProchainRappel(rappelsPlanifies(echeances(etatInitial().monde, ALEX, NOW), RAPPELS_DEFAUT, NOW))).toBe('Prochain rappel : ven. 13 nov. · YUL → CDG (J-30)');
  });
});
describe('chronologie', () => {
  const l = () => echeances(m, ALEX, NOW), mois = () => chronologie(l(), RAPPELS_DEFAUT, NOW);
  it('de octobre 2026 à mai 2027, avec le marqueur du jour en premier', () => {
    const c = mois(); expect(c.map((x) => x.cle)).toEqual(['2026-10', '2026-11', '2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05']);
    expect(c[0]).toMatchObject({ label: 'oct.', annee: '2026', resume: 'Aucune échéance' }); expect(c[0].entrees).toEqual([{ genre: 'aujourdhui', dateMs: new Date(2026, 9, 12).getTime(), jour: '12' }]);
    expect(resumeEchelle(c, 4)).toBe('Oct. 2026 → mai 2027 · 4 droits de voyage');
  });
  it('résumé par mois : échéances et rappels ; échéance après ses rappels le même jour', () => {
    const c = mois(); expect(c[2].resume).toBe('1 échéance · 2 rappels'); expect(c[1].resume).toBe('1 rappel'); expect(c[3].resume).toBe('1 échéance · 2 rappels'); expect(c[4].resume).toBe('1 échéance · 1 rappel'); expect(c[5].resume).toBe('Aucune échéance'); expect(c[6].resume).toBe('1 rappel'); expect(c[7].resume).toBe('1 échéance · 1 rappel');
    expect(c[2].entrees.map((e) => e.genre)).toEqual(['rappel', 'echeance', 'rappel']); // J-7 (6 déc.), échéance (13 déc.), puis J-30 de La Havane (30 déc.)
    const e0 = c[2].entrees[1]; expect(e0.genre === 'echeance' && e0.e.droitId).toBe('d-812');
  });
  it('sans aucun droit : seulement le mois courant', () => { const c = chronologie([], RAPPELS_DEFAUT, NOW); expect(c).toHaveLength(1); expect(resumeEchelle(c, 0)).toBe('Oct. 2026 · 0 droit de voyage'); });
});
describe('décompte', () => { it('chiffres sur deux positions', () => { expect(decompte(62 * 86400_000 + 3_723_000)).toMatchObject({ j: '62', h: '01', m: '02', s: '03' }); expect(decompte(-5).j).toBe('00'); expect(decompte(5_377_277_000).phrase).toBe('Temps restant avant l’échéance : 62 jours, 5 heures, 41 minutes'); }); });

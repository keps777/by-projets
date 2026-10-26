import { describe, expect, it } from 'vitest';
import { fmtPct } from '../../core/argent.ts';
import { MAINTENANT_DEMO } from '../../data/constantes.ts';
import { monde } from '../../data/seed.ts';
import { arrivee, poseDe, reventesDeLaSemaine, tailleVille, trier } from './reventes.ts';

const NOW = Date.parse(MAINTENANT_DEMO);
describe('reventes de la semaine', () => {
  const l = reventesDeLaSemaine(monde(), NOW);
  it('seulement les droits en vente dont le vol part dans les 7 jours, du plus proche au plus lointain', () => {
    expect(l.map((r) => r.droitId)).toEqual(['d-r830', 'd-r611', 'd-r902', 'd-r150', 'd-r455', 'd-r071']);
    expect(l.every((r) => r.departMs > NOW && r.departMs <= NOW + 7 * 86_400_000)).toBe(true);
    expect(l.map((r) => r.droitId)).not.toContain('d-r816'); // départ en décembre
  });
  it('prix, prix équivalent barré, écart signé, échéance J-1', () => {
    const r = l[0]; expect(r).toMatchObject({ offreId: 'revente:d-r830', code: 'CDG', ville: 'Paris', numeroAffiche: 'Aérolys 830', prix: 870, prixEquivalent: 1210, joursAvantDepart: 2 });
    expect(fmtPct(r.ecart.pct)).toBe('−28,1\u00A0%'); expect(r.ecart.sens).toBe('baisse'); expect(r.echeanceMs).toBe(Date.parse('2026-10-13T19:20'));
  });
  it('écarte ses propres annonces et les vols dont l’échéance est passée', () => {
    expect(reventesDeLaSemaine(monde(), NOW, 'ACC-0356').map((r) => r.droitId)).toEqual(['d-r611', 'd-r902', 'd-r455', 'd-r071']);
    expect(reventesDeLaSemaine(monde(), Date.parse('2026-10-14T20:00')).map((r) => r.droitId)).not.toContain('d-r830');
    expect(reventesDeLaSemaine(monde(), Date.parse('2026-10-14T00:00')).map((r) => r.droitId)).not.toContain('d-r830');
  });
  it('tris : départ, prix, plus grand écart ; la liste d’origine est intacte', () => {
    const avant = l.map((r) => r.droitId);
    expect(trier(l, 'prix').map((r) => r.prix)).toEqual([470, 510, 540, 590, 870, 1490]);
    expect(trier(l, 'ecart')[0].ecart.pct).toBe(Math.min(...l.map((r) => r.ecart.pct)));
    expect(trier(l, 'depart').map((r) => r.droitId)).toEqual(avant); expect(l.map((r) => r.droitId)).toEqual(avant);
  });
  it('heure d’arrivée avec jour suivant', () => { expect(arrivee({ heureArrivee: '06:10', plusJours: 1 })).toBe('06:10 (+1)'); expect(arrivee({ heureArrivee: '10:25', plusJours: 0 })).toBe('10:25'); });
});

describe('pile de billets', () => {
  it('taille du nom de ville', () => { expect(tailleVille('Paris')).toBe(92); expect(tailleVille('Reykjavik')).toBeLessThan(92); expect(tailleVille('Punta Cana')).toBeLessThan(tailleVille('Reykjavik')); expect(tailleVille('Papeete et au-delà de tout')).toBe(52); });
  it('poses : devant, deux derrière, la dernière passée sort, les autres attendent', () => {
    expect([0, 1, 2, 3].map((r) => poseDe(r, 4))).toEqual(['devant', 'derriere1', 'derriere2', 'dernier']);
    expect([0, 1, 2, 3, 4, 5].map((r) => poseDe(r, 6))).toEqual(['devant', 'derriere1', 'derriere2', 'cachee', 'cachee', 'dernier']);
    expect([0, 1, 2].map((r) => poseDe(r, 3))).toEqual(['devant', 'derriere1', 'derriere2']); expect(poseDe(0, 1)).toBe('devant');
  });
});

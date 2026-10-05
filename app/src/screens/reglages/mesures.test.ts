import { describe, expect, it } from 'vitest';
import type { MetriqueLigne, PointRapportLigne, SousProjetLigne } from '@core/lignes.ts';
import { categorie, libelleCle, mesuresProposees, objectifLisible, sourceRetenue } from './mesures.ts';
import { accomplis, groupesParMois } from '../archive/accomplis.ts';

const b = (id: string) => ({ id, user_id: 'u', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', supprime_le: null });
const fiche = { quoi: '', pourquoi: '', qui: '', ou: '', quand: '', comment: '', combien: '' };
const sp = (id: string, debut: string, statut: SousProjetLigne['statut'] = 'en_cours', termine_le: string | null = null, projet = 'p1'): SousProjetLigne =>
  ({ ...b(id), projet_id: projet, nom: `SP ${id}`, debut, fin: null, statut, metrique_pilote_id: null, reprise_passe: false, fiche, bilan: null, termine_le });
const met = (id: string, spId: string, cle: string, type: MetriqueLigne['type'], cible: number | null, unite = ''): MetriqueLigne =>
  ({ ...b(id), sous_projet_id: spId, cle, type, nom: `Nom ${cle}`, unite, cible, periode_cible: 'jour', sens: 'plus', options: null, dans_rapport: true, ordre: 0 });

describe('mesures d’un point', () => {
  it('libellés et étiquettes', () => {
    expect(categorie('nombre:chapitres')).toBe('Quantité');
    expect(categorie('reference:passages')).toBe('Détail');
    expect(libelleCle('nombre:chapitres').label).toBe('Quantité · chapitres');
    expect(libelleCle('temps').label).toBe('Temps passé');
  });

  it('objectif lisible selon le type et la période', () => {
    expect(objectifLisible({ type: 'temps', cible: 7200, unite: 'min', periode_cible: 'jour' })).toBe('2h00 / jour');
    expect(objectifLisible({ type: 'nombre', cible: 7, unite: 'ch', periode_cible: 'jour' })).toBe('7 ch / jour');
    expect(objectifLisible({ type: 'montant', cible: 5000, unite: '$', periode_cible: 'mois' })).toBe('50 $ / mois');
    expect(objectifLisible({ type: 'fois', cible: null, unite: '', periode_cible: 'jour' })).toBeNull();
  });

  it('propose les mesures du point, puis celles des sous-projets, puis Fois et Temps', () => {
    const point: PointRapportLigne = { ...b('pt'), ordre: 0, code: 'BR', libelle: 'Bible', projet_id: 'p1', mesures: [{ cle: 'nombre:chapitres', sous_projet_id: null }], actif: true };
    const l = { sous_projets: [sp('a', '2026-09-01'), sp('b', '2026-10-01'), sp('x', '2026-10-01', 'termine')], metriques: [
      met('m1', 'a', 'nombre:chapitres', 'nombre', 3, 'ch'), met('m2', 'b', 'nombre:chapitres', 'nombre', 7, 'ch'), met('m3', 'b', 'reference:passages', 'reference', null), met('m4', 'x', 'distance', 'distance', 5000)] };
    const ms = mesuresProposees(point, l);
    expect(ms.map((m) => [m.cle, m.on])).toEqual([['nombre:chapitres', true], ['reference:passages', false], ['fois', false], ['temps', false]]);
    expect(ms[0].sources.map((s) => s.sp.id)).toEqual(['a', 'b']);
    expect(sourceRetenue(ms[0])?.metrique.cible).toBe(7);
    expect(sourceRetenue({ ...ms[0], sousProjetId: 'a' })?.metrique.cible).toBe(3);
    expect(sourceRetenue(ms[2])).toBeUndefined();
  });
});

describe('accomplis de l’Archive', () => {
  it('garde les sous-projets terminés, du plus récent au plus ancien, groupés par mois', () => {
    const l = {
      projets: [{ ...b('p1'), rubrique_id: 'r1', numero: 1, nom: 'Bible', ordre: 0, statut: 'actif' as const }],
      rubriques: [{ ...b('r1'), cle: 'dieu', nom: 'Dieu', couleur: '#9D8CFF', ordre: 0, archivee: false }],
      sous_projets: [sp('a', '2026-08-01', 'termine', '2026-08-22'), sp('b', '2026-09-01', 'termine', '2026-09-30'), sp('c', '2026-09-01'), sp('d', '2026-09-01', 'archive', '2026-09-14'), sp('e', '2026-09-01', 'archive')]
    };
    const a = accomplis(l);
    expect(a.map((x) => x.sp.id)).toEqual(['b', 'd', 'a']);
    expect(a[0].rubrique?.couleur).toBe('#9D8CFF');
    expect(groupesParMois(a).map((g) => [g.mois, g.items.length])).toEqual([['2026-09', 2], ['2026-08', 1]]);
  });
});

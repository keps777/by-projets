import { describe, expect, it } from 'vitest';
import { heureRecommandee, marge, NOM_MOYEN, MOYENS_COURSE } from './course.ts';
import { commissionCourse, detailPaiementCourse } from './courseCommission.ts';
import { APPROCHE_MAX_MIN, estimerArrivee, flotte, minutesApproche, TAILLE_FLOTTE, type Conducteur } from './courseFlotte.ts';
import { trouverLieu } from './lieux.ts';

const T = Date.parse('2026-11-03T07:00:00');
const pt = (nom: string) => trouverLieu(nom)!;
const cond = (id: string, x: number, y: number, mode: 'moto' | 'taxi' = 'moto', enLigne = true): Conducteur => ({ id, nom: id, mode, x, y, enLigne });

describe('flotte simulée', () => {
  it('est déterministe : même ville, mode et instant', () => { expect(flotte('Yaoundé', 'moto', T)).toEqual(flotte('Yaoundé', 'moto', T)); expect(flotte('Yaoundé', 'moto', T)).not.toEqual(flotte('Douala', 'moto', T)); });
  it('compte les conducteurs par mode, avec des connectés, et bouge avec le temps', () => {
    const f = flotte('Yaoundé', 'moto', T), g = flotte('Yaoundé', 'moto', T + 5 * 60_000);
    expect(f).toHaveLength(TAILLE_FLOTTE.moto); expect(flotte('Yaoundé', 'taxi', T)).toHaveLength(TAILLE_FLOTTE.taxi); expect(f.every((c) => c.mode === 'moto')).toBe(true);
    expect(f.some((c) => c.enLigne)).toBe(true);
    expect(g.some((c, i) => c.x !== f[i].x)).toBe(true);
  });
  it('un même créneau de 30 s donne les mêmes positions (estimation stable)', () => { expect(flotte('Douala', 'taxi', T + 3_000)).toEqual(flotte('Douala', 'taxi', T + 20_000)); });
});

describe('estimation d’arrivée', () => {
  it('temps d’approche du plus proche + marge : « Moto à 3 min » → « arrive dans ~4 min »', () => {
    const e = estimerArrivee('moto', { x: 0, y: 0 }, [cond('a', 1.0, 0), cond('b', 4, 4), cond('c', 2, 1.5)]);
    expect(e.plusProche?.id).toBe('a'); expect(e.approcheMin).toBe(3); expect(e.arriveeMin).toBe(4);
    expect(e.libelleProche).toBe('Moto à 3 min'); expect(e.libelleArrivee).toBe('Arrive dans ~4 min'); expect(e.disponible).toBe(true);
  });
  it('compte les motos à proximité (rayon 2,5 km) et accorde le pluriel', () => {
    const e = estimerArrivee('moto', { x: 0, y: 0 }, [cond('a', 1, 0), cond('b', 0, 2), cond('c', 5, 5)]);
    expect(e.proches).toBe(2); expect(e.libelleProches).toBe('2 motos à proximité');
    expect(estimerArrivee('moto', { x: 0, y: 0 }, [cond('a', 1, 0)]).libelleProches).toBe('1 moto à proximité');
    expect(estimerArrivee('taxi', { x: 0, y: 0 }, [cond('t1', 1, 0, 'taxi'), cond('t2', 0, 1, 'taxi')]).libelleProches).toBe('2 taxis à proximité');
  });
  it('ignore les conducteurs hors ligne et les autres modes', () => {
    const e = estimerArrivee('moto', { x: 0, y: 0 }, [cond('hors', 0.2, 0, 'moto', false), cond('taxi', 0.2, 0, 'taxi'), cond('loin', 3, 0)]);
    expect(e.plusProche?.id).toBe('loin'); expect(e.proches).toBe(0); expect(e.libelleProches).toBe('Aucune moto à proximité');
    const rien = estimerArrivee('taxi', { x: 0, y: 0 }, [cond('m', 0, 0)]);
    expect(rien.plusProche).toBeNull(); expect(rien.arriveeMin).toBeNull(); expect(rien.disponible).toBe(false); expect(rien.libelleProches).toBe('Aucun taxi à proximité');
  });
  it('le taxi est plus lent que la moto et a une marge plus large ; au moins 1 min ; trop loin = indisponible', () => {
    expect(minutesApproche('taxi', 2)).toBeGreaterThan(minutesApproche('moto', 2)); expect(minutesApproche('moto', 0)).toBe(1);
    const t = estimerArrivee('taxi', { x: 0, y: 0 }, [cond('t', 0, 0, 'taxi')]); expect(t.approcheMin).toBe(1); expect(t.arriveeMin).toBe(3);
    const loin = estimerArrivee('moto', { x: 0, y: 0 }, [cond('l', 40, 0)]); expect(loin.approcheMin!).toBeGreaterThan(APPROCHE_MAX_MIN); expect(loin.disponible).toBe(false);
  });
  it('se met à jour quand le lieu de départ change', () => {
    const f = flotte('Yaoundé', 'moto', T), a = estimerArrivee('moto', pt('Bastos'), f), b = estimerArrivee('moto', pt('Mendong'), f);
    expect(a.disponible && b.disponible).toBe(true);
    expect([a.plusProche?.id, a.approcheMin, a.proches]).not.toEqual([b.plusProche?.id, b.approcheMin, b.proches]);
    expect(a.arriveeMin).toBe(a.approcheMin! + 1);
  });
  it('au cœur de Yaoundé, une moto connectée est à moins de 15 minutes, et même en périphérie il y en a de disponibles (toutes les heures d’une journée)', () => {
    for (let h = 0; h < 24; h++) {
      const f = flotte('Yaoundé', 'moto', T + h * 3_600_000);
      for (const nom of ['Bastos', 'Essos']) expect(estimerArrivee('moto', pt(nom), f).approcheMin!, `${nom} ${h} h`).toBeLessThan(15);
      expect(estimerArrivee('moto', pt('Mendong'), f).disponible, `Mendong ${h} h`).toBe(true);
    }
  });
  it('marge et heure recommandée utilisent l’estimation quand on la donne', () => {
    expect(marge(T + 60 * 60_000, T, 'moto', 7, 4)).toBe(60 - 4 - 14); expect(marge(T + 60 * 60_000, T, 'moto', 7)).toBe(60 - 2 - 14);
    expect(heureRecommandee(T + 3_600_000, 'moto', 7, 4)).toBe(T + 3_600_000 - (25 + 4 + 14) * 60_000);
  });
});

describe('commission AfriMove sur les courses', () => {
  it('10 % de la course, arrondi au franc', () => { expect(commissionCourse(700)).toBe(70); expect(commissionCourse(1500)).toBe(150); expect(commissionCourse(2050)).toBe(205); expect(commissionCourse(333)).toBe(33); });
  it('espèces : le voyageur paie tout au conducteur, la commission est prélevée sur le compte du conducteur', () => {
    const d = detailPaiementCourse(700, 'especes');
    expect(d).toMatchObject({ commission: 70, netConducteur: 630, prelevee: 'sur_compte_conducteur', auConducteur: 700 });
    expect(d.texte).toBe('Tu paies 700 F au conducteur · commission AfriMove 70 F prélevée sur son compte');
  });
  it('MoMo, Orange Money, cagnotte : commission retenue sur le paiement', () => {
    for (const m of ['momo', 'om', 'cagnotte'] as const) expect(detailPaiementCourse(700, m)).toMatchObject({ commission: 70, netConducteur: 630, prelevee: 'sur_paiement', auConducteur: 0 });
    expect(detailPaiementCourse(1500, 'om').texte).toContain('retenue sur le paiement');
  });
  it('quatre moyens de paiement : MoMo, Orange Money, cagnotte, espèces', () => { expect([...MOYENS_COURSE].sort()).toEqual(['cagnotte', 'especes', 'momo', 'om']); expect(NOM_MOYEN.om).toBe('Orange Money'); });
});

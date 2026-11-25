import { describe, expect, it } from 'vitest';
import { formaterCroisade, jourDeCroisade, type Croisade } from './croisade.ts';

const c: Croisade = { titre: 'Croisade de 40jrs de Consolation « Bâtir la vie qui correspond à mon appel »', regle: 'un profil ZTF à écouter par jour', suivi: 'Un profil ZTF écouté', debut: '2026-11-23', jours: 40, heures: 6, codes: ['DDEWG', 'PA', 'BR', 'CL'] };

describe('croisade', () => {
  it('numéro du jour', () => {
    expect(jourDeCroisade(c, '2026-11-23')).toBe(1); expect(jourDeCroisade(c, '2026-12-02')).toBe(10);
    expect(jourDeCroisade(c, '2026-11-22')).toBeNull(); expect(jourDeCroisade(c, '2027-01-02')).toBeNull();
  });
  it('bloc du rapport comme dans le rapport du 23 novembre', () => {
    expect(formaterCroisade(c, { jour: 1, secondes: 6 * 3600 + 23 * 60, approx: true, suiviAujourdhui: true, suiviTotal: 1 })).toBe(
      '*_Croisade de 40jrs de Consolation « Bâtir la vie qui correspond à mon appel »_* (40jrs, recherche de Dieu seul au moins pendant 6h par jour, un profil ZTF à écouter par jour.)\n* Day : 1/40\n* Recherche de Dieu seul : ~6h23/6h\n* Un profil ZTF écouté : Oui, 1/40');
  });
});

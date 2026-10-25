import { describe, expect, it } from 'vitest';
import { cniValide, disposerSieges, erreursProfil, jaugeSieges, normaliserPlaque, permisValide, plaqueValide, profilComplet, profilDepuisSaisie, saisieDepuisProfil, saisieVide, statutVerification, DELAI_VERIFICATION_MS, type SaisieProfil } from './covoitProfil.ts';
import { CARROSSERIES } from './covoitTypes.ts';

const NOW = Date.parse('2026-11-03T07:00:00');
const bonne = (): SaisieProfil => ({ cni: '112233445', recto: 'data:image/jpeg;base64,AA', verso: 'data:image/jpeg;base64,BB', permis: 'CE-123456', validite: '2028-05-01', marque: 'Toyota', modele: 'Corolla', couleur: 'Gris', plaque: 'ce 482 km', places: 3, carrosserie: 'berline', photos: ['data:image/jpeg;base64,CC'] });

describe('profil conducteur', () => {
  it('une saisie vide a une erreur par champ obligatoire ; une saisie correcte aucune', () => {
    const e = erreursProfil(saisieVide(), NOW); for (const k of ['cni', 'recto', 'verso', 'permis', 'validite', 'marque', 'modele', 'couleur', 'plaque', 'carrosserie', 'photos']) expect(e, k).toHaveProperty(k);
    expect(erreursProfil(bonne(), NOW)).toEqual({});
  });
  it('formats camerounais plausibles', () => {
    expect(plaqueValide('LT 123 AB')).toBe(true); expect(plaqueValide('ce482km')).toBe(true); expect(normaliserPlaque('ce-482-km')).toBe('CE 482 KM'); expect(plaqueValide('123')).toBe(false);
    expect(cniValide('112 233 445')).toBe(true); expect(cniValide('12')).toBe(false); expect(permisValide('CE-123456')).toBe(true); expect(permisValide('x')).toBe(false);
  });
  it('permis expiré, places hors bornes', () => {
    expect(erreursProfil({ ...bonne(), validite: '2026-01-01' }, NOW).validite).toMatch(/plus valide/); expect(erreursProfil({ ...bonne(), places: 5 }, NOW).places).toBeDefined(); expect(erreursProfil({ ...bonne(), places: 0 }, NOW).places).toBeDefined();
  });
  it('complet / incomplet ; aller-retour saisie ↔ profil ; vérification simulée', () => {
    expect(profilComplet(undefined)).toBe(false);
    const p = profilDepuisSaisie(bonne(), NOW); expect(profilComplet(p)).toBe(true); expect(p.vehicule.plaque).toBe('CE 482 KM'); expect(p.statut).toBe('en_verification');
    expect(saisieDepuisProfil(p)).toMatchObject({ cni: '112233445', plaque: 'CE 482 KM', carrosserie: 'berline' });
    expect(profilComplet({ ...p, vehicule: { ...p.vehicule, plaque: '' } })).toBe(false);
    expect(statutVerification(p, NOW + 1000)).toBe('en_verification'); expect(statutVerification(p, NOW + DELAI_VERIFICATION_MS)).toBe('verifie');
  });
});

describe('sièges du véhicule', () => {
  const occ = (n: number) => Array.from({ length: n }, (_, i) => ({ nom: `P${i}`, initiales: `P${i}`, places: 1 }));
  it('1, 2, 3 et 4 places remplies sur 4 proposées, pour chaque carrosserie', () => {
    for (const c of CARROSSERIES) for (let n = 0; n <= 4; n++) {
      const s = disposerSieges(c, 4, occ(n)); expect(s).toHaveLength(5);
      expect(s[0].etat).toBe('conducteur'); expect(s.filter((x) => x.etat === 'occupe')).toHaveLength(n); expect(s.filter((x) => x.etat === 'libre')).toHaveLength(4 - n);
    }
  });
  it('les sièges non proposés sont fermés ; une réservation de 2 places occupe 2 sièges', () => {
    const s = disposerSieges('berline', 2, [{ nom: 'Aïcha', initiales: 'AN', places: 2 }]);
    expect(s.filter((x) => x.etat === 'occupe').map((x) => x.initiales)).toEqual(['AN', 'AN']); expect(s.filter((x) => x.etat === 'ferme')).toHaveLength(2); expect(s.filter((x) => x.etat === 'libre')).toHaveLength(0);
    expect(jaugeSieges(3, 2)).toBe('2/3'); expect(jaugeSieges(3, 5)).toBe('3/3');
  });
});

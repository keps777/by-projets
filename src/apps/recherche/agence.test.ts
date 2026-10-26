import { describe, expect, it } from 'vitest';
import { AEROPORTS, OFFRES_AGENCE, VOLS } from '../../data/seed.ts';
import { messageForfait, monogramme, specialitesTexte, zonesDe } from './agence.ts';

describe('vitrine agence', () => {
  it('monogramme : initiales des deux premiers mots', () => { expect(monogramme('Agence Horizon')).toBe('AH'); expect(monogramme('Cap Nord Voyages')).toBe('CN'); expect(monogramme('  voyages  ')).toBe('V'); expect(monogramme('')).toBe('·'); });
  it('spécialités : les zones de ses destinations, sans doublon', () => {
    const zones = zonesDe(OFFRES_AGENCE.filter((o) => o.agenceId === 'horizon'), VOLS, AEROPORTS); expect(zones).toEqual(['Europe']); expect(specialitesTexte(zones)).toBe('Europe'); expect(specialitesTexte([])).toBe('À préciser');
    expect(zonesDe([{ id: 'x', agenceId: 'a', volId: 'v-no905', prix: 1 }, ...OFFRES_AGENCE.filter((o) => o.agenceId === 'horizon')], VOLS, AEROPORTS)).toEqual(['Caraïbes', 'Europe']);
  });
  it('message de forfait prérempli', () => { expect(messageForfait({ nom: 'Agence Horizon' })).toMatch(/forfait vol \+ hôtel avec Agence Horizon/); });
});

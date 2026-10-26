import { describe, expect, it } from 'vitest';
import { DROITS } from '../../data/seed.ts';
import { chaineDe, ordinal, rangDetenteur } from './chaine.ts';

const droit = (id: string) => DROITS.find((d) => d.id === id)!;
const m = (type: string) => ({ id: type, quand: 0, type: type as never, de: null, vers: 'x', prix: 0 });
describe('chaîne de détention', () => {
  it('ordinaux français', () => { expect([1, 2, 3, 4].map(ordinal)).toEqual(['1er', '2e', '3e', '4e']); });
  it('compte seulement les changements de détenteur', () => {
    expect(rangDetenteur(droit('d-r816'))).toBe(1); expect(rangDetenteur(droit('d-ppt'))).toBe(3); expect(rangDetenteur({ chaine: [m('achat_neuf'), m('nommage'), m('gel'), m('revente')] })).toBe(2); expect(rangDetenteur({ chaine: [] })).toBe(1);
  });
  it('revente d’un 1er détenteur : Émission → 1er · vendeur → Vous', () => {
    const c = chaineDe('revente', { droit: droit('d-r816') }); expect(c.titre).toBe('Détenteur vérifié'); expect(c.sous).toBe('1er détenteur de ce billet'); expect(c.etapes.map((e) => e.libelle)).toEqual(['Émission', '1er · vendeur', 'Vous']);
  });
  it('revente d’un 2e détenteur : les quatre étapes de la maquette', () => {
    const c = chaineDe('revente', { droit: { chaine: [m('achat_neuf'), m('revente')] } }); expect(c.sous).toBe('2e détenteur de ce billet'); expect(c.etapes.map((e) => e.libelle)).toEqual(['Émission', '1er détenteur', '2e · vendeur', 'Vous']); expect(c.etapes.map((e) => e.etat)).toEqual(['origine', 'passe', 'vendeur', 'vous']);
  });
  it('au-delà de trois détenteurs, le début est abrégé', () => {
    const c = chaineDe('revente', { droit: droit('d-ppt') }); expect(c.etapes.map((e) => e.libelle)).toEqual(['Émission', '1er détenteur', '2e détenteur', '3e · vendeur', 'Vous']);
    const long = chaineDe('revente', { droit: { chaine: [m('achat_neuf'), m('revente'), m('revente'), m('revente'), m('revente')] } }); expect(long.etapes.map((e) => e.libelle)).toEqual(['Émission', '…', '4e détenteur', '5e · vendeur', 'Vous']); expect(long.etapes).toHaveLength(5);
  });
  it('neuf et agence', () => {
    expect(chaineDe('neuf').etapes.map((e) => e.libelle)).toEqual(['Émission', 'NexG-TT · vendeur', 'Vous']); expect(chaineDe('neuf').sous).toMatch(/émis via NexG-TT/);
    expect(chaineDe('agence', { agence: 'Agence Horizon' })).toMatchObject({ titre: 'Agence Horizon' });
  });
});

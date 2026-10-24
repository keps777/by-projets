import { describe, expect, it } from 'vitest';
import { PART_MAX, PART_MIN, aRegler, bilanMois, borner, couvre, lignesCouvertes, repartition, villesDuColis, type ColisPartenaire } from './interagences.ts';

const lignes = [
  { compagnieId: 'AV', de: 'Yaoundé', vers: 'Douala', actif: true }, { compagnieId: 'AV', de: 'Douala', vers: 'Yaoundé', actif: true },
  { compagnieId: 'BX', de: 'Yaoundé', vers: 'Bafoussam', actif: true }, { compagnieId: 'AV', de: 'Douala', vers: 'Kribi', actif: false }
];
describe('inter-agences', () => {
  it('répartition du prix client : la part du partenaire est arrondie, le total est conservé', () => {
    expect(repartition(2500, 60)).toEqual({ beta: 1500, partenaire: 1000 });
    const r = repartition(3333, 55); expect(r.beta + r.partenaire).toBe(3333); expect(r.partenaire).toBe(1500);
  });
  it('la part de Bêta reste entre 30 et 70 %, par pas de 5', () => {
    expect(borner(25)).toBe(PART_MIN); expect(borner(80)).toBe(PART_MAX); expect(borner(62)).toBe(60); expect(borner(63)).toBe(65);
  });
  it('villes d’un colis et couverture du partenaire (dans les deux sens, lignes actives seulement)', () => {
    expect(villesDuColis('Yaoundé · Mvan', 'Douala · relais Chez Mado')).toEqual(['Yaoundé', 'Douala']);
    expect(couvre(lignes, 'AV', 'Yaoundé', 'Douala')).toBe(true); expect(couvre(lignes, 'AV', 'Douala', 'Yaoundé')).toBe(true);
    expect(couvre(lignes, 'AV', 'Yaoundé', 'Bafoussam')).toBe(false); expect(couvre(lignes, 'AV', 'Douala', 'Kribi')).toBe(false);
    expect(lignesCouvertes(lignes, 'AV')).toEqual(['Douala ↔ Yaoundé']);
  });
  it('bilan du mois : à payer = parts des partenaires non réglées, règlement le 5 du mois suivant', () => {
    const t = (j: string) => new Date(`${j}T10:00:00`).getTime();
    const liens: ColisPartenaire[] = [
      { colisId: 'a', partenaireId: 'AV', confieLe: t('2026-11-03'), partBetaPct: 60, prix: 2500 }, { colisId: 'b', partenaireId: 'AV', confieLe: t('2026-11-10'), partBetaPct: 50, prix: 5000, regleLe: t('2026-11-12') },
      { colisId: 'c', partenaireId: 'TR', confieLe: t('2026-11-11'), partBetaPct: 60, prix: 1000 }, { colisId: 'd', partenaireId: 'AV', confieLe: t('2026-10-30'), partBetaPct: 60, prix: 9999 }
    ];
    const b = bilanMois(liens, '2026-11-15', 'AV');
    expect(b).toMatchObject({ colis: 2, chiffre: 7500, aPayer: 1000, net: -1000, echeance: '2026-12-05' });
    expect(aRegler(liens, 'AV')).toBe(1000 + 4000); // tous mois confondus : 2 500 × 40 % et 9 999 × 40 % arrondi
    expect(bilanMois(liens, '2026-11-15').colis).toBe(3); expect(bilanMois(liens, '2026-12-01').colis).toBe(0);
  });
});

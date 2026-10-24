import { describe, expect, it } from 'vitest';
import { amende, arretsDeLigne, codeAffiche, codeBrut, dureeArret, hash, prixDepuisArret, retardReel, supportBillet, trajetBillet, verdictControle } from './terrain.ts';

const YD = { de: 'Yaoundé', vers: 'Douala', gareDe: 'Mvan', gareVers: 'Akwa' };
describe('arrêts d’une ligne', () => {
  it('Yaoundé → Douala 08:00 : reprend les heures de la maquette (Edéa 10:20, terminus 11:30)', () => {
    const a = arretsDeLigne(YD, '08:00', 210);
    expect(a.map((x) => x.nom)).toEqual(['Yaoundé Mvan', 'Mbankomo', 'Boumnyebel', 'Pouma', 'Edéa', 'Yassa', 'Douala Akwa']);
    expect(a.find((x) => x.nom === 'Edéa')?.prevu).toBe('10:20'); expect(a.at(-1)).toMatchObject({ prevu: '11:30', type: 'terminus' }); expect(a[0].type).toBe('depart');
  });
  it('le retard décale toutes les heures prévues', () => { expect(arretsDeLigne(YD, '08:00', 210, 15).find((x) => x.nom === 'Edéa')?.prevu).toBe('10:35'); });
  it('sens inverse : les arrêts sont dans l’ordre du trajet', () => {
    const a = arretsDeLigne({ de: 'Douala', vers: 'Yaoundé', gareDe: 'Akwa', gareVers: 'Mvan' }, '07:00', 210);
    expect(a[1].nom).toBe('Yassa'); expect(a.at(-2)?.nom).toBe('Mbankomo'); expect(a.map((x) => x.offsetMin)).toEqual([...a.map((x) => x.offsetMin)].sort((p, q) => p - q));
  });
  it('axe inconnu : un arrêt de mi-parcours', () => { expect(arretsDeLigne({ de: 'A', vers: 'B', gareDe: 'a', gareVers: 'b' }, '10:00', 100).map((x) => x.nom)).toEqual(['A a', 'Mi-parcours', 'B b']); });
});
describe('prix en route', () => {
  it('diminue avec la distance restante, par pas de 500 F, et vaut 0 au terminus', () => {
    expect(prixDepuisArret(7500, 0, 210)).toBe(7500); expect(prixDepuisArret(7500, 80, 210)).toBe(4500); expect(prixDepuisArret(7500, 185, 210)).toBe(1000); expect(prixDepuisArret(7500, 210, 210)).toBe(0);
    for (const o of [35, 80, 110, 140, 185]) { const p = prixDepuisArret(6000, o, 210); expect(p % 500).toBe(0); expect(p).toBeGreaterThanOrEqual(500); expect(p).toBeLessThanOrEqual(6000); }
  });
});
describe('montées et descentes', () => {
  it('déterministe ; on descend après être monté ; la majorité va jusqu’au terminus', () => {
    expect(trajetBillet('AM7F3K22', 7)).toEqual(trajetBillet('AM7F3K22', 7));
    let terminus = 0; const N = 300;
    for (let i = 0; i < N; i++) { const t = trajetBillet(`AM${i}XYZ`, 7); expect(t.descend).toBeGreaterThan(t.monte); expect(t.descend).toBeLessThanOrEqual(6); if (t.descend === 6 && t.monte === 0) terminus++; }
    expect(terminus / N).toBeGreaterThan(0.55);
    expect(trajetBillet('AM7F3K22', 2)).toEqual({ monte: 0, descend: 1 });
  });
  it('hash stable', () => { expect(hash('a')).toBe(hash('a')); expect(hash('a')).not.toBe(hash('b')); });
});
describe('contrôle inopiné', () => {
  it('écart positif : fraude probable ; juste ou négatif : conforme', () => {
    expect(verdictControle(42, 40)).toMatchObject({ ecart: 2, niveau: 'fraude', texte: '2 passagers de plus que de billets', pct: 95 });
    expect(verdictControle(41, 40).texte).toBe('1 passager de plus que de billets');
    expect(verdictControle(40, 40)).toMatchObject({ niveau: 'conforme', texte: 'Compte juste', pct: 100 });
    expect(verdictControle(38, 40)).toMatchObject({ niveau: 'conforme', texte: '2 places sans voyageur' });
    expect(verdictControle(0, 0).pct).toBe(100);
  });
  it('amende, supports', () => { expect(amende(7500)).toBe(7500); expect(supportBillet('app')).toBe('app'); expect(supportBillet('guichet')).toBe('papier'); expect(supportBillet('convoyeur')).toBe('sms'); });
});
describe('formats', () => {
  it('code affiché et saisie', () => { expect(codeAffiche('AM7F3K22')).toBe('AM-7F3K-22'); expect(codeBrut('am-7f3k-22')).toBe('AM7F3K22'); });
  it('retard réel et durée d’arrêt', () => { expect(retardReel('08:00', 8 * 60 + 12)).toBe(12); expect(retardReel('08:00', 7 * 60 + 55)).toBe(-5); expect(dureeArret(222_000)).toBe('3:42'); expect(dureeArret(-5)).toBe('0:00'); });
});

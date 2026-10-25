import { describe, expect, it } from 'vitest';
import { kmVersGare, LIEUX, lieuLibre, lieuxFrequents, normaliser, suggerer, surligner, trouverLieu } from './lieux.ts';

describe('lieux : autocomplétion', () => {
  it('normalise accents, casse, apostrophes et tirets', () => { expect(normaliser('  Hôpital d’Essos-Nord ')).toBe('hopital d essos nord'); expect(normaliser('ÉDÉA')).toBe('edea'); });
  it('la liste couvre Yaoundé et Douala : quartiers, gares, marchés, hôpitaux', () => {
    for (const ville of ['Yaoundé', 'Douala']) for (const type of ['quartier', 'gare', 'marché', 'hôpital']) expect(LIEUX.some((l) => l.ville === ville && l.type === type), `${ville} ${type}`).toBe(true);
    expect(new Set(LIEUX.map((l) => `${l.ville}|${normaliser(l.nom)}`)).size).toBe(LIEUX.length);
  });
  it('dès la première lettre : propositions par préfixe, avant les débuts de mot puis les sous-chaînes', () => {
    const r = suggerer('ba', { ville: 'Yaoundé' }).map((l) => l.nom);
    expect(r[0]).toBe('Bastos'); expect(r.length).toBeGreaterThan(0);
    const m = suggerer('mar', { ville: 'Yaoundé', limite: 20 }).map((l) => l.nom);
    expect(m.every((n) => normaliser(n).includes('mar'))).toBe(true);
    // « central » : aucun nom ne commence ainsi, mais « Marché central » le contient comme mot
    const c = suggerer('central', { ville: 'Yaoundé' }).map((l) => l.nom); expect(c).toContain('Marché central'); expect(c).toContain('Hôpital Central');
  });
  it('préfixe d’abord, puis sous-chaîne', () => {
    const r = suggerer('sa', { limite: 30 }).map((l) => l.nom), iPrefixe = r.findIndex((n) => normaliser(n).startsWith('sa')), iSous = r.findIndex((n) => !normaliser(n).startsWith('sa'));
    expect(iPrefixe).toBe(0); expect(iSous).toBeGreaterThan(0);
    for (let i = 0; i < iSous; i++) expect(normaliser(r[i]).startsWith('sa')).toBe(true);
    expect(r.slice(iSous).every((n) => !normaliser(n).startsWith('sa'))).toBe(true);
  });
  it('insensible aux accents et à la casse', () => {
    expect(suggerer('HOPITAL', { ville: 'Douala' }).map((l) => l.nom)).toContain('Hôpital Laquintinie');
    expect(suggerer('hôpital laq')[0].nom).toBe('Hôpital Laquintinie');
    expect(suggerer('bonapri')[0].nom).toBe('Bonapriso');
    expect(suggerer('essos', { ville: 'Yaoundé' }).map((l) => l.nom)).toEqual(expect.arrayContaining(['Essos', 'Marché d’Essos']));
  });
  it('filtre par ville, limite, saisie vide ou inconnue', () => {
    expect(suggerer('a', { ville: 'Douala', limite: 3 })).toHaveLength(3);
    expect(suggerer('a', { ville: 'Douala', limite: 50 }).every((l) => l.ville === 'Douala')).toBe(true);
    expect(suggerer('')).toEqual([]); expect(suggerer('   ')).toEqual([]); expect(suggerer('zzzzqq')).toEqual([]);
  });
  it('trouve un lieu par son nom exact ; propose des lieux fréquents', () => {
    expect(trouverLieu('bastos')?.ville).toBe('Yaoundé'); expect(trouverLieu('Bastos', 'Douala')).toBeUndefined();
    expect(lieuxFrequents('Yaoundé').map((l) => l.nom)).toContain('Bastos'); expect(lieuxFrequents('Douala').every((l) => l.type === 'quartier')).toBe(true);
  });
});

describe('lieux : distance jusqu’à la gare', () => {
  it('garde les distances de la maquette vers Mvan (Bastos 7 km, Essos 5, Mendong 10)', () => {
    expect(kmVersGare('Bastos', 'mvan')).toBe(7); expect(kmVersGare('Essos', 'mvan')).toBe(5); expect(kmVersGare('Nlongkak', 'mvan')).toBe(6); expect(kmVersGare('Biyem-Assi', 'mvan')).toBe(9); expect(kmVersGare('Mendong', 'mvan')).toBe(10);
  });
  it('dépend de la gare de départ ; au moins 1 km ; 6 km par défaut (autre ville, lieu libre, gare inconnue)', () => {
    expect(kmVersGare('Bastos', 'nsam')).not.toBe(kmVersGare('Bastos', 'mvan'));
    expect(kmVersGare('Gare routière de Mvan', 'mvan')).toBe(1);
    expect(kmVersGare('Akwa', 'mvan')).toBe(6); expect(kmVersGare(lieuLibre('chez ma tante', 'Yaoundé'), 'mvan')).toBe(6); expect(kmVersGare('Bastos', 'inconnue')).toBe(6); expect(kmVersGare(undefined, 'mvan')).toBe(6);
    expect(kmVersGare('New Bell', 'akwa')).toBeGreaterThanOrEqual(2);
  });
});

describe('lieux : mise en évidence de la saisie', () => {
  it('découpe le nom autour de la saisie, sans tenir compte des accents ni de la casse', () => {
    expect(surligner('Bastos', 'bas')).toEqual(['', 'Bas', 'tos']); expect(surligner('Hôpital Central', 'hopital')).toEqual(['', 'Hôpital', ' Central']);
    expect(surligner('Marché d’Essos', 'ess')).toEqual(['Marché d’', 'Ess', 'os']); expect(surligner('Bastos', 'zz')).toEqual(['Bastos', '', '']); expect(surligner('Bastos', '')).toEqual(['Bastos', '', '']);
  });
});

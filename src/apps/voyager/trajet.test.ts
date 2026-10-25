import { beforeEach, describe, expect, it } from 'vitest';
import { app, aujourdhui, reinitialiser } from '../../data/store.svelte.ts';
import { ajouterJours } from '../../core/dates.ts';
import { VILLES_CARTE } from '../../core/cameroun.ts';
import { demain, rechercheParDefaut } from './etat.ts';
import { destinations, villesDeDepart } from './offres.ts';
import { appliquerTrajet, desservies, garesDepart, haut, infoInvite, infoSansLigne, infoVille, libelleDate, ligneExiste, pointsCarte, sousDestination, texteGares, trancheDe, TRANCHES_3H, voisine } from './trajet.ts';

describe('villes de la carte', () => {
  beforeEach(() => reinitialiser());
  it('le départ porte l’étoile, les villes desservies sont allumées, les autres grisées', () => {
    const pts = pointsCarte('Yaoundé', null, destinations('Yaoundé', demain())), etat = (n: string) => pts.find((p) => p.nom === n)!.etat;
    expect(pts).toHaveLength(VILLES_CARTE.length);
    expect(etat('Yaoundé')).toBe('depart'); expect(etat('Douala')).toBe('desservie'); expect(etat('Bamenda')).toBe('desservie'); expect(etat('Bafoussam')).toBe('desservie');
    expect(etat('Kribi')).toBe('grisee'); expect(etat('Garoua')).toBe('grisee'); expect(etat('Limbé')).toBe('grisee');
    expect(pts.filter((p) => p.etat === 'depart')).toHaveLength(1);
  });
  it('l’arrivée choisie est marquée ; une ville sans ligne ne peut pas l’être', () => {
    const d = destinations('Yaoundé', demain());
    expect(pointsCarte('Yaoundé', 'Douala', d).find((p) => p.nom === 'Douala')!.etat).toBe('choisie');
    expect(pointsCarte('Yaoundé', 'Garoua', d).find((p) => p.nom === 'Garoua')!.etat).toBe('grisee');
    expect(pointsCarte('Douala', null, destinations('Douala', demain())).find((p) => p.nom === 'Kribi')!.etat).toBe('desservie');
  });
  it('toutes les villes du réseau sont sur la carte', () => { const sur = new Set(VILLES_CARTE.map((v) => v.nom)); for (const g of app.monde.gares) expect(sur.has(g.ville), g.ville).toBe(true); expect(desservies(destinations('Yaoundé', demain()))).toHaveLength(3); });
});

describe('textes de la fenêtre', () => {
  beforeEach(() => reinitialiser());
  it('« Pour aller à Douala : 5 compagnies · dès 5 000 F · 3 h 15 » (le jour choisi donne le prix)', () => {
    const d = destinations('Yaoundé', demain()).find((x) => x.ville === 'Douala')!;
    expect(infoVille(d)).toBe('Pour aller à Douala : 5 compagnies · dès\u00a05\u00a0000\u00a0F · 3\u00a0h\u00a015'); // espaces insécables : le prix ne se coupe pas en fin de ligne
    expect(infoVille({ ...d, compagnies: 1, prix: null })).toContain('1 compagnie · aucun départ ce jour-là');
    expect(sousDestination(d)).toBe('5 compagnies · gare Akwa');
  });
  it('sans ligne pour la paire : le message nomme les villes desservies', () => {
    const d = destinations('Yaoundé', demain());
    expect(infoSansLigne('Yaoundé', 'Garoua', d)).toBe('Pas encore de ligne Yaoundé → Garoua. Villes desservies depuis Yaoundé : Douala, Bafoussam, Bamenda.');
    expect(infoSansLigne('Garoua', 'Maroua', [])).toContain('Aucune ligne ne part de Garoua');
    expect(infoInvite('Yaoundé', 3)).toContain('Touche une ville allumée'); expect(infoInvite('Garoua', 0)).toContain('change de ville de départ');
  });
  it('gares de départ de la ligne ou de la ville ; lignes dans les deux sens', () => {
    expect(garesDepart('Yaoundé', 'Douala').sort()).toEqual(['Mvan', 'Nsam', 'Tongolo']); expect(garesDepart('Yaoundé', 'Bamenda')).toEqual(['Mvan']); expect(garesDepart('Douala', null)).toEqual(['Akwa']);
    expect(texteGares(['Mvan', 'Nsam', 'Tongolo'])).toBe('Mvan +2'); expect(texteGares(['Akwa'])).toBe('Akwa'); expect(texteGares([])).toBe('—');
    expect(ligneExiste('Yaoundé', 'Douala')).toBe(true); expect(ligneExiste('Douala', 'Yaoundé')).toBe(true); expect(ligneExiste('Yaoundé', 'Kribi')).toBe(false);
    expect(villesDeDepart()).toContain('Kribi');
  });
  it('date et heure en clair', () => {
    expect(libelleDate('2026-11-04', '08:00')).toBe('mer. 4 nov. · 08:00'); expect(libelleDate('2026-11-04', null)).toBe('mer. 4 nov. · toute la journée');
    expect(TRANCHES_3H).toHaveLength(8); expect(TRANCHES_3H[0]).toEqual({ debut: '00:00', libelle: '00–03 h' }); expect(TRANCHES_3H[7]).toEqual({ debut: '21:00', libelle: '21–24 h' });
    expect(trancheDe('08:15')).toBe(2); expect(trancheDe('00:00')).toBe(0); expect(trancheDe('23:45')).toBe(7); expect(trancheDe(null)).toBe(-1);
  });
});

describe('clavier et position', () => {
  const noms = ['Douala', 'Bafoussam', 'Bamenda'];
  it('les flèches parcourent les villes en boucle, Début et Fin vont aux extrémités', () => {
    expect(voisine(noms, 'Douala', 'ArrowDown')).toBe('Bafoussam'); expect(voisine(noms, 'Bamenda', 'ArrowDown')).toBe('Douala'); expect(voisine(noms, 'Douala', 'ArrowUp')).toBe('Bamenda');
    expect(voisine(noms, 'Bafoussam', 'ArrowLeft')).toBe('Douala'); expect(voisine(noms, 'Bafoussam', 'ArrowRight')).toBe('Bamenda');
    expect(voisine(noms, null, 'ArrowDown')).toBe('Douala'); expect(voisine(noms, null, 'ArrowUp')).toBe('Bamenda');
    expect(voisine(noms, 'Bafoussam', 'Home')).toBe('Douala'); expect(voisine(noms, 'Douala', 'End')).toBe('Bamenda');
    expect(voisine(noms, 'Douala', 'a')).toBeNull(); expect(voisine([], null, 'ArrowDown')).toBeNull();
  });
  it('la fenêtre s’ouvre au niveau de la ligne de trajet, sans quitter l’écran', () => {
    expect(haut({ top: 118, bottom: 172 }, 844)).toBe(112); expect(haut(null, 844)).toBe(108); expect(haut({ top: 2, bottom: 40 }, 844)).toBe(8); expect(haut({ top: 700, bottom: 750 }, 844)).toBe(404);
  });
});

describe('validation', () => {
  beforeEach(() => reinitialiser());
  it('met à jour la recherche partagée : trajet, jour et heure souhaitée', () => {
    const r = rechercheParDefaut(), j = ajouterJours(aujourdhui(), 3);
    appliquerTrajet(r, 'Yaoundé', 'Bamenda', j, '09:00');
    expect(r).toMatchObject({ de: 'Yaoundé', vers: 'Bamenda', jour: j, heureCible: '09:00' });
    appliquerTrajet(r, 'Douala', 'Kribi', j, null); expect(r).toMatchObject({ de: 'Douala', vers: 'Kribi', heureCible: null });
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../data/store.svelte.ts';
import { etatInitial } from '../../data/seed.ts';
import { connecter, compteCourant } from '../../domain/compte.ts';
import { choisirLangue, enregistrerRegion, entree, marquerTutoVu } from './etat.ts';

beforeEach(() => { for (const k of Object.keys(app)) delete (app as unknown as Record<string, unknown>)[k]; Object.assign(app, etatInitial()); });
describe('actions de l’entrée', () => {
  it('écrit la langue de la session, puis celle du compte connecté', () => {
    choisirLangue('en'); expect(app.session.langue).toBe('en');
    connecter('ACC-0412'); choisirLangue('fr'); expect(app.session.langue).toBe('fr'); expect(compteCourant()?.langue).toBe('fr');
  });
  it('mémorise la région et l’aéroport sans compte (tranche), sans toucher aux comptes', () => {
    enregistrerRegion('fr', ' Paris (CDG) '); expect(entree()).toEqual({ region: 'fr', aeroport: 'Paris (CDG)' });
    expect(app.monde.comptes.every((c) => c.region === 'Canada · CAD')).toBe(true);
  });
  it('écrit la région et l’aéroport du compte courant', () => {
    connecter('ACC-0412'); enregistrerRegion('us', 'Boston (BOS)');
    expect(compteCourant()?.region).toBe('États-Unis · USD'); expect(compteCourant()?.aeroport).toBe('BOS');
    enregistrerRegion('ca', 'Montréal'); expect(compteCourant()?.region).toBe('Canada · CAD'); expect(compteCourant()?.aeroport).toBe('BOS');
  });
  it('marque le tutoriel comme vu', () => { app.session.vuTuto = false; marquerTutoVu(); expect(app.session.vuTuto).toBe(true); });
});

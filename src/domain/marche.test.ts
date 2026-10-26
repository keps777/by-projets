import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../data/store.svelte.ts';
import { etatInitial } from '../data/seed.ts';
import { acheter, avancerMonde, droitDe, droitsDe, ErreurMarche, meilleureOffre, nommerVoyageur, offresDuVol } from './marche.ts';

beforeEach(() => { for (const k of Object.keys(app)) delete (app as unknown as Record<string, unknown>)[k]; Object.assign(app, etatInitial()); });
const ALEX = 'ACC-0412', CAMILLE = 'ACC-0187';

describe('offres d’un vol', () => {
  it('liste neuf, reventes et agence, la moins chère d’abord', () => {
    const o = offresDuVol('v-ae816'); expect(o.map((x) => x.type)).toEqual(['revente', 'revente', 'revente', 'revente', 'neuf']);
    expect(o[0].prix).toBe(1500); expect(o[0].ecartPct).toBe(-26.8); expect(o.at(-1)!.prix).toBe(2050);
    expect(offresDuVol('v-no220').map((x) => x.type)).toContain('agence');
  });
  it('masque le drop sans Pass et le montre avec', () => {
    expect(offresDuVol('v-no905', false).find((x) => x.type === 'drop')?.masquee).toBe(true); expect(offresDuVol('v-no905', true).find((x) => x.type === 'drop')?.masquee).toBe(false);
    expect(meilleureOffre('v-no905', false)?.type).toBe('neuf');
  });
});
describe('acheter', () => {
  it('une revente : le droit change de mains, le vendeur est payé net de commission, la chaîne s’allonge', () => {
    const offre = offresDuVol('v-ae816').find((x) => x.type === 'revente' && x.prix === 1500)!; const d = acheter(offre, ALEX);
    expect(d.detenteurId).toBe(ALEX); expect(d.statut).toBe('detenu'); expect(d.prixPaye).toBe(1500); expect(d.annonce).toBeUndefined(); expect(d.chaine.at(-1)!.type).toBe('revente');
    const vendeur = app.monde.comptes.find((c) => c.id === 'ACC-0301')!; expect(vendeur.solde).toBe(1500 - 187.5);
    expect(app.monde.ecritures.filter((e) => e.compteId === 'ACC-0301').map((e) => e.montant)).toEqual([1500, -187.5]);
    expect(() => acheter(offre, CAMILLE)).toThrow(ErreurMarche);
  });
  it('le neuf crée un droit à nom de l’acheteur avec référence et PNR', () => {
    const d = acheter(offresDuVol('v-ae816').find((x) => x.type === 'neuf')!, CAMILLE); expect(d.origine).toBe('neuf'); expect(d.prixPaye).toBe(2050); expect(d.ref).toMatch(/^NXG-/); expect(d.pnr).toHaveLength(7); expect(droitsDe(CAMILLE)).toContain(d);
  });
  it('l’offre d’agence est étiquetée et crée un droit « agence »', () => { const d = acheter(offresDuVol('v-no220').find((x) => x.type === 'agence')!, ALEX); expect(d.origine).toBe('agence'); expect(d.agenceId).toBe('horizon'); expect(d.prixPaye).toBe(1690); });
  it('refuse son propre billet, un drop masqué, un solde insuffisant', () => {
    const mien = offresDuVol('v-no156').find((x) => x.type === 'revente')!; expect(() => acheter(mien, ALEX)).toThrow(/propre annonce/);
    expect(() => acheter(offresDuVol('v-no905').find((x) => x.type === 'drop')!, ALEX)).toThrow(ErreurMarche);
    expect(() => acheter(offresDuVol('v-ae816').find((x) => x.type === 'neuf')!, CAMILLE, 'solde')).toThrow(/Solde/);
  });
});
describe('nommer le voyageur et avancer le temps', () => {
  it('nomme avant l’échéance et ferme les échanges', () => {
    const d = nommerVoyageur('d-812', ALEX, { prenom: ' Alex ', nom: 'Exemple', pourSoi: true, compteId: ALEX }); expect(d.statut).toBe('nomme'); expect(d.voyageur?.prenom).toBe('Alex');
    expect(() => nommerVoyageur('d-812', ALEX, { prenom: 'A', nom: 'B', pourSoi: true })).toThrow(ErreurMarche); expect(() => nommerVoyageur('d-812', CAMILLE, { prenom: 'A', nom: 'B', pourSoi: false })).toThrow(/portefeuille/);
  });
  it('exige un prénom et un nom', () => { expect(() => nommerVoyageur('d-812', ALEX, { prenom: '', nom: 'X', pourSoi: true })).toThrow(/passeport/); });
  it('à J-1 retire les annonces et nomme par défaut ; après le départ le droit est voyagé', () => {
    expect(avancerMonde(Date.parse('2026-10-12T09:00'))).toBe(0);
    expect(avancerMonde(Date.parse('2027-01-29T09:00'))).toBeGreaterThan(0); const hav = droitDe('d-hav')!; expect(hav.statut).toBe('nomme'); expect(hav.annonce).toBeUndefined(); expect(hav.voyageur?.pourSoi).toBe(true);
    avancerMonde(Date.parse('2026-12-15T00:00')); expect(droitDe('d-812')!.statut).toBe('voyage'); expect(avancerMonde(Date.parse('2026-12-15T00:00'))).toBe(0);
  });
});

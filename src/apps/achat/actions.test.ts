import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../data/store.svelte.ts';
import { etatInitial } from '../../data/seed.ts';
import { droitDe } from '../../domain/marche.ts';
import { droitDuCompte, payer, pnrDe, transmettreVoyageur } from './actions.ts';

beforeEach(() => { for (const k of Object.keys(app)) delete (app as unknown as Record<string, unknown>)[k]; Object.assign(app, etatInitial()); });
const CARTE = { numero: '4242 4242 4242 4242' };

describe('payer', () => {
  it('achète une revente : le droit change de mains, la chaîne s’allonge, le vendeur est réglé', () => {
    const avant = app.monde.comptes.find((c) => c.id === 'ACC-0301')!.solde;
    const r = payer('revente:d-r816', 'ACC-0412', 'carte', CARTE); expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.droit).toMatchObject({ id: 'd-r816', detenteurId: 'ACC-0412', statut: 'detenu', prixPaye: 1500 }); expect(r.droit.chaine.at(-1)?.type).toBe('revente'); expect(app.monde.comptes.find((c) => c.id === 'ACC-0301')!.solde).toBeGreaterThan(avant);
  });
  it('achète du neuf : un nouveau droit avec référence NXG-', () => {
    const n = app.monde.droits.length, r = payer('neuf:v-ae816', 'ACC-0412', 'wallet', {}); expect(r.ok).toBe(true); if (!r.ok) return;
    expect(app.monde.droits).toHaveLength(n + 1); expect(r.droit.ref).toMatch(/^NXG-/); expect(r.droit.origine).toBe('neuf'); expect(r.droit.pnr).toBeTruthy();
  });
  it('achète une offre d’agence', () => { const r = payer('agence:oa-1', 'ACC-0412', 'carte', CARTE); expect(r.ok && r.droit.origine).toBe('agence'); });
  it('refus simulé : carte 0002 ou mobile …00, rien n’est acheté', () => {
    const n = app.monde.droits.length;
    expect(payer('neuf:v-ae816', 'ACC-0412', 'carte', { numero: '4000 0000 0000 0002' })).toMatchObject({ ok: false, motif: 'refus' }); expect(payer('neuf:v-ae816', 'ACC-0412', 'mobile', { mobile: '+1 514 555 0100' })).toMatchObject({ ok: false, motif: 'refus' });
    expect(app.monde.droits).toHaveLength(n); expect(droitDe('d-r816')!.statut).toBe('en_vente');
  });
  it('offre devenue indisponible : annonce vendue entre-temps', () => {
    expect(payer('revente:d-r816', 'ACC-0187', 'carte', CARTE).ok).toBe(true);
    const r = payer('revente:d-r816', 'ACC-0412', 'carte', CARTE); expect(r).toMatchObject({ ok: false, motif: 'indisponible' }); if (!r.ok) expect(r.message).toMatch(/plus disponible/);
  });
  it('refuse l’achat de sa propre annonce, d’un identifiant inconnu et sans compte', () => {
    expect(payer('revente:d-hav', 'ACC-0412', 'carte', CARTE)).toMatchObject({ ok: false, message: 'Vous ne pouvez pas acheter votre propre annonce.' }); expect(payer('revente:zzz', 'ACC-0412', 'carte', CARTE)).toMatchObject({ ok: false, motif: 'indisponible' }); expect(payer('neuf:v-ae816', 'ACC-9999', 'carte', CARTE)).toMatchObject({ ok: false });
  });
  it('échéance passée : plus aucune transaction', () => {
    app.monde.vols.find((v) => v.id === 'v-ae816')!.jour = '2026-10-12'; const r = payer('neuf:v-ae816', 'ACC-0412', 'carte', CARTE); expect(r).toMatchObject({ ok: false, motif: 'echeance' });
  });
});
describe('nommer', () => {
  const lea = { prenom: 'Léa', nom: 'Roy', pourSoi: false, naissance: '2001-05-09' };
  it('rend le billet nominatif, ajoute le maillon de nommage et la référence compagnie', () => {
    const r = transmettreVoyageur('d-812', 'ACC-0412', lea); expect(r.ok).toBe(true); const d = droitDe('d-812')!;
    expect(d.statut).toBe('nomme'); expect(d.voyageur).toMatchObject({ prenom: 'Léa', nom: 'Roy' }); expect(d.chaine.at(-1)?.type).toBe('nommage'); expect(d.pnr).toMatch(/^[2-9A-Z]{6}$/);
  });
  it('refuse un droit qui n’est pas à soi ou un nom vide', () => {
    expect(transmettreVoyageur('d-8wc2', 'ACC-0412', lea)).toMatchObject({ ok: false }); expect(transmettreVoyageur('d-812', 'ACC-0412', { ...lea, nom: ' ' })).toMatchObject({ ok: false });
  });
  it('refuse après l’échéance', () => {
    const v = app.monde.vols.find((x) => x.id === 'v-ae812')!; v.jour = '2026-10-12'; v.heureDepart = '10:00'; // départ dans une heure : échéance J-1 déjà passée
    const r = transmettreVoyageur('d-812', 'ACC-0412', lea); expect(r).toMatchObject({ ok: false, message: 'L’échéance est passée.' }); expect(droitDe('d-812')!.statut).toBe('detenu');
  });
  it('référence compagnie stable et propre à chaque droit', () => { expect(pnrDe({ ref: 'NXG-7Q2M' })).toBe(pnrDe({ ref: 'NXG-7Q2M' })); expect(pnrDe({ ref: 'NXG-7Q2M' })).not.toBe(pnrDe({ ref: 'NXG-4PUJ' })); expect(pnrDe({ ref: 'x', pnr: '6K4P9X' })).toBe('6K4P9X'); });
  it('droit du compte : seulement le sien', () => { expect(droitDuCompte('d-812', 'ACC-0412')?.id).toBe('d-812'); expect(droitDuCompte('d-8wc2', 'ACC-0412')).toBeUndefined(); expect(droitDuCompte('d-812', null)).toBeUndefined(); });
});

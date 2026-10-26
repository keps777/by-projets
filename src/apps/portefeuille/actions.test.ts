import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../data/store.svelte.ts';
import { etatInitial } from '../../data/seed.ts';
import { vuePortefeuille } from './portefeuille.ts';
import { basculerRappel, importerBillet, lireRappels } from './actions.ts';
import { lirePrix, memeNom, normaliserPnr, valider, verifier, type DemandeImport } from './import.ts';
import { RAPPELS_DEFAUT } from './echeances.ts';

beforeEach(() => { for (const k of Object.keys(app)) delete (app as unknown as Record<string, unknown>)[k]; Object.assign(app, etatInitial()); });
const ALEX = 'ACC-0412', OK: DemandeImport = { compagnie: 'aerolys', pnr: 'Q7RT2M', nom: 'Exemple', prix: '1 250' };
const nbsp = (s: string) => s.replace(/ /g, ' ');

describe('saisie', () => {
  it('normalise la référence et le prix', () => {
    expect(normaliserPnr(' q7-rt2m9 ')).toBe('Q7RT2M'); expect(lirePrix('1 250')).toBe(1250); expect(lirePrix('1250,5 $')).toBe(1250.5); expect(lirePrix('12.345')).toBeNaN(); expect(lirePrix('abc')).toBeNaN(); expect(lirePrix('')).toBeNaN();
    expect(memeNom('Exemple', ' EXEMPLE ')).toBe(true); expect(memeNom('Tremblay', 'Trèmblay')).toBe(true); expect(memeNom('', '')).toBe(false); expect(memeNom('Dupont', 'Durand')).toBe(false);
  });
  it('valide champ par champ', () => {
    expect(valider(OK)).toEqual({}); const e = valider({ compagnie: '', pnr: 'AB', nom: '  ', prix: '' });
    expect(e).toEqual({ compagnie: 'Choisissez la compagnie qui a émis le billet.', pnr: 'La référence compte 6 lettres ou chiffres.', nom: 'Indiquez le nom tel qu’il figure sur la réservation.', prix: 'Indiquez le prix que vous avez payé.' });
    expect(valider({ ...OK, prix: '-5' }).prix).toMatch(/montant en dollars/); expect(valider({ ...OK, prix: '0' }).prix).toMatch(/montant en dollars/); expect(nbsp(valider({ ...OK, prix: '999999' }).prix!)).toMatch(/dépasser 20 000/);
  });
});
describe('verifier (simulation de la compagnie)', () => {
  const NOW = Date.parse('2026-10-12T09:00'), m = () => app.monde;
  it('Aérolys, réservation connue : éligible sous réserve d’accord', () => { const r = verifier(m(), OK, NOW); expect(r.ok).toBe(true); if (r.ok) { expect(r.vol.numero).toBe('AE 822'); expect(r.compagnie).toBe('Aérolys'); } });
  it('compagnie non partenaire (Nordelle, autre) : refus', () => { for (const c of ['nordelle', 'autre'] as const) expect(verifier(m(), { ...OK, compagnie: c }, NOW)).toMatchObject({ ok: false, motif: 'non_partenaire', titre: 'Compagnie pas encore partenaire' }); });
  it('référence inconnue ou nom différent : introuvable', () => { expect(verifier(m(), { ...OK, pnr: 'ZZZZZZ' }, NOW)).toMatchObject({ ok: false, motif: 'introuvable' }); expect(verifier(m(), { ...OK, nom: 'Autre' }, NOW)).toMatchObject({ ok: false, motif: 'introuvable' }); });
  it('tarif non transférable et échéance passée', () => {
    expect(verifier(m(), { ...OK, pnr: 'T9R2NF', nom: 'Durand' }, NOW)).toMatchObject({ ok: false, motif: 'tarif' });
    expect(verifier(m(), OK, Date.parse('2027-01-11T20:00'))).toMatchObject({ ok: false, motif: 'echeance' });
  });
});
describe('importerBillet', () => {
  it('crée un droit détenu d’origine « import », chaîne « import », au prix saisi, dans le compte', () => {
    const n = app.monde.droits.length, r = importerBillet(OK, ALEX); expect(r.ok).toBe(true); if (!r.ok) return;
    expect(app.monde.droits).toHaveLength(n + 1);
    expect(r.droit).toMatchObject({ detenteurId: ALEX, statut: 'detenu', origine: 'import', prixPaye: 1250, volId: 'v-ae822', pnr: 'Q7RT2M', bagagesInclus: 2 }); expect(r.droit.ref).toMatch(/^NXG-/);
    expect(r.droit.chaine).toHaveLength(1); expect(r.droit.chaine[0]).toMatchObject({ type: 'import', de: null, vers: ALEX, prix: 1250 }); expect(r.droit.chaine[0].note).toContain('Q7RT2M');
    expect(app.monde.notifications[0]).toMatchObject({ compteId: ALEX, lien: `/droit/${r.droit.id}` });
  });
  it('le droit importé apparaît dans le portefeuille (actifs, agrégats, historique)', () => {
    const now = Date.parse('2026-10-12T09:00'), avant = vuePortefeuille(app.monde, ALEX, now); importerBillet(OK, ALEX); const v = vuePortefeuille(app.monde, ALEX, now);
    expect(v.actifs).toHaveLength(avant.actifs.length + 1); expect(v.actifs.find((c) => c.origine === 'Billet importé')).toMatchObject({ prixPaye: 1250, equivalent: 1080, vers: 'CDG' });
    expect(v.agregat.paye).toBe(avant.agregat.paye + 1250); expect(v.transactions.some((t) => t.titre === 'Billet importé')).toBe(true);
  });
  it('refus : rien n’est créé', () => {
    const n = app.monde.droits.length;
    expect(importerBillet({ ...OK, compagnie: 'nordelle' }, ALEX)).toMatchObject({ ok: false, motif: 'non_partenaire' }); expect(importerBillet({ ...OK, pnr: 'ZZZZZZ' }, ALEX)).toMatchObject({ ok: false, motif: 'introuvable' });
    expect(importerBillet({ ...OK, prix: '' }, ALEX)).toMatchObject({ ok: false, motif: 'saisie' }); expect(importerBillet(OK, null)).toMatchObject({ ok: false, motif: 'compte' }); expect(importerBillet(OK, 'ACC-9999')).toMatchObject({ ok: false, motif: 'compte' });
    expect(app.monde.droits).toHaveLength(n);
  });
  it('un billet ne s’importe qu’une fois', () => { expect(importerBillet(OK, ALEX).ok).toBe(true); expect(importerBillet(OK, ALEX)).toMatchObject({ ok: false, motif: 'deja_importe' }); });
});
describe('rappels', () => {
  it('valeurs par défaut sans tranche, puis bascule persistée dans la tranche « portefeuille »', () => {
    expect(lireRappels()).toEqual(RAPPELS_DEFAUT); expect(app.tranches.portefeuille).toBeDefined();
    expect(basculerRappel('j2')).toBe(true); expect(lireRappels()).toEqual({ j30: true, j7: true, j2: true }); expect(basculerRappel('j30')).toBe(false); expect(lireRappels().j30).toBe(false);
    expect((app.tranches.portefeuille as { rappels: unknown }).rappels).toEqual({ j30: false, j7: true, j2: true });
  });
});

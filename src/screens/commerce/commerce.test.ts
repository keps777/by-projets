import { beforeEach, describe, expect, it } from 'vitest';
import { app, reinitialiser } from '../../data/store.svelte.ts';
import { appuyer, disponible, journalierPour, montantDe, montantsProposes, retenues, rouler, suiviHebdo, totalSemaine, verifierMontant } from './calcul.ts';
import { commanderAvance, disponibleMaintenant, encaisser, genererQr, synchroniser } from './actions.ts';
import { etat } from './etat.ts';

describe('commerce : clavier et montants', () => {
  it('clavier de caisse', () => {
    let s = ''; for (const k of ['0', '2', '4', '5', '000']) s = appuyer(s, k);
    expect(s).toBe('245000'); expect(appuyer(s, '⌫')).toBe('24500');
    expect(appuyer('12345678', '1')).toBe('12345678');
    expect(appuyer('1234567', '000')).toBe('1234567');
    expect(montantDe('')).toBe(0); expect(verifierMontant(0)).not.toBeNull(); expect(verifierMontant(50)).toMatch(/minimum/); expect(verifierMontant(24_500)).toBeNull();
  });
  it('semaine de démo : 1 240 000, 62 %, avance 846 000, 13 179 / jour', () => {
    reinitialiser('demo'); const s = etat().semaine;
    expect(totalSemaine(s)).toBe(1_240_000);
    expect(disponible(s, 850_000, [])).toBe(846_000);
    expect(journalierPour(s, 12)).toBe(13_179);
    expect(montantsProposes(846_000)).toEqual([300_000, 500_000, 846_000]);
    expect(montantsProposes(400_000)).toEqual([300_000, 400_000]);
    expect(montantsProposes(50_000)).toEqual([]);
  });
  it('nouvelle semaine : la précédente est mémorisée', () => {
    reinitialiser('demo'); const s = etat().semaine;
    const r = rouler(s, new Date(s.lundi + 'T12:00:00').getTime() + 8 * 86_400_000);
    expect(r.precedente).toBe(1_240_000); expect(totalSemaine(r)).toBe(0);
    expect(rouler(s, new Date(s.lundi + 'T12:00:00').getTime())).toBe(s);
  });
});

describe('commerce : encaisser et stock', () => {
  beforeEach(() => { reinitialiser('demo'); });
  it('encaisser 24 500 : net 24 255 sur le solde, QR expiré refusé', () => {
    const e = etat(); const t = Date.now();
    expect(encaisser(t).ok).toBe(false); // pas de QR
    expect(genererQr(t).ok).toBe(true);
    expect(encaisser(t + 301_000).ok).toBe(false);
    expect(genererQr(t).ok).toBe(true);
    const r = encaisser(t + 5000); expect(r.ok).toBe(true);
    expect(app.solde).toBe(86_500 + 24_255);
    expect(e.encaissements[0]).toMatchObject({ montant: 24_500, net: 24_255, frais: 245, retenue: 0 });
    expect(e.qr).toBeNull();
    expect(e.semaine.total.reduce((a, b) => a + b, 0)).toBe(1_240_000 + 24_500);
    e.saisie = ''; expect(genererQr().ok).toBe(false);
  });
  it('avance 500 000 à 12 % : frais 10 000, 6 sem., crédit commerce, remboursement sur les ventes', () => {
    const e = etat(); const t = Date.now();
    const r = commanderAvance(500_000, 12, t); expect(r.ok).toBe(true);
    const a = e.avances[0];
    expect(a).toMatchObject({ frais: 10_000, journalier: 13_179, semaines: 6, statut: 'en_cours' });
    expect(app.credits.find((c) => c.id === a.creditId)).toMatchObject({ produit: 'commerce', mensualite: 0, capital: 500_000, statut: 'actif' });
    expect(app.solde).toBe(86_500); // payé au grossiste, pas au membre
    expect(disponibleMaintenant()).toBe(846_000 - 510_000);
    e.saisie = '100000'; genererQr(t); encaisser(t + 1000);
    expect(a.rembourse).toBe(12_000);
    expect(app.solde).toBe(86_500 + 99_000 - 12_000);
    expect(retenues(100_000, e.avances)[0].montant).toBe(12_000);
    synchroniser(t + 49 * 3_600_000); expect(a.livre).toBe(true);
    expect(suiviHebdo(a, t + 8 * 86_400_000).length).toBe(2);
  });
  it('avance soldée : le crédit se termine', () => {
    const e = etat(); const t = Date.now();
    commanderAvance(300_000, 20, t); const a = e.avances[0];
    a.rembourse = a.montant + a.frais - 1000;
    e.saisie = '100000'; genererQr(t); encaisser(t + 10);
    expect(a.rembourse).toBe(a.montant + a.frais); expect(a.statut).toBe('soldee');
    expect(app.credits.find((c) => c.id === a.creditId)!.statut).toBe('termine');
  });
  it('refus : trop gros, niveau Start, compte vierge', () => {
    expect(commanderAvance(900_000, 12).ok).toBe(false);
    expect(commanderAvance(500_000, 15).ok).toBe(false);
    app.score.valeur = 520;
    const r = commanderAvance(100_000, 12); expect(r.ok).toBe(false);
    reinitialiser('vierge'); app.compte = { salaireNet: 200_000, anciennete: '', employeur: '' } as never;
    expect(disponibleMaintenant()).toBe(0);
  });
  it('règle des 33 % : un crédit existant trop lourd bloque l\'avance', () => {
    app.credits[0].mensualite = 200_000;
    const r = commanderAvance(300_000, 12);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.decision?.controles.find((c) => c.id === 'part')?.ok).toBe(false);
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { app, reinitialiser } from '../../data/store.svelte.ts';
import { lignesDe } from '../../data/paie.ts';
import demarrage from './demarrage.ts';
import { activer, ajouterAssure, avancer, basculer, declarer, definirAge, resilier } from './actions.ts';
import { aChange, etapesSinistre, primeSelection, verifierSouscription } from './calcul.ts';
import { etat } from './etat.ts';

describe('protection famille', () => {
  beforeEach(() => reinitialiser('demo'));
  it('démo : 4 personnes, 2 M, prime 4 600 comme la maquette', () => {
    const e = etat();
    expect(e.assures.filter((a) => a.couvert).length).toBe(4);
    expect(primeSelection(e)).toBe(4600);
    e.capital = 1_000_000; expect(primeSelection(e)).toBe(2300);
    e.capital = 5_000_000; expect(primeSelection(e)).toBe(11_500);
  });
  it('âge maximum 75 à l\'entrée', () => {
    expect(ajouterAssure('Grand-père', 'parent', 76, '').ok).toBe(false);
    expect(ajouterAssure('Grand-père', 'parent', 75, '').ok).toBe(true);
    expect(ajouterAssure('Grand-père', 'parent', 70, '').ok).toBe(false); // doublon
    expect(ajouterAssure('', 'parent', 70, '').ok).toBe(false);
    expect(ajouterAssure('Tante', 'autre', null, '').ok).toBe(false);
  });
  it('« Vous » reste couvert ; capital limité par le niveau', () => {
    expect(basculer('moi').ok).toBe(false);
    expect(basculer('papa').ok).toBe(true);
    const e = etat(); e.capital = 5_000_000;
    app.score.valeur = 520;
    expect(verifierSouscription(e, 'START')).toMatch(/Capital limité/);
    expect(activer().ok).toBe(false);
  });
  it('compte vierge : il faut renseigner son âge', () => {
    reinitialiser('vierge');
    expect(etat().capital).toBe(1_000_000);
    expect(activer()).toMatchObject({ ok: false });
    expect(definirAge('moi', 80).ok).toBe(false);
    expect(definirAge('moi', 30).ok).toBe(true);
    expect(activer()).toMatchObject({ ok: true, prime: 750 });
  });
  it('souscription : prélèvement mensuel dans la paie, mise à jour, résiliation', () => {
    demarrage();
    expect(lignesDe('2026-11-28').find((l) => l.id === 'protection')).toBeUndefined();
    const r = activer(Date.parse('2026-10-22T10:00:00'));
    expect(r).toMatchObject({ ok: true, prime: 4600 });
    const l = lignesDe('2026-10-28').find((x) => x.id === 'protection')!;
    expect(l).toMatchObject({ type: 'credit', montant: 4600 });
    expect(l.libelle).toContain('Protection famille');
    expect(lignesDe('2026-10-22').find((x) => x.id === 'protection')).toBeUndefined(); // pas le jour même
    l.appliquer(); expect(etat().souscription!.primesPayees).toBe(1);
    expect(aChange(etat())).toBe(false);
    basculer('marc'); expect(aChange(etat())).toBe(true);
    expect(activer()).toMatchObject({ ok: true, prime: 5000 });
    expect(etat().souscription!.primesPayees).toBe(1);
    expect(resilier().ok).toBe(true);
    expect(lignesDe('2026-11-28').find((x) => x.id === 'protection')).toBeUndefined();
  });
  it('déclaration : dossier D-48210, sortie de la couverture, capital versé après 48 h', () => {
    const t = Date.parse('2026-10-22T10:00:00');
    expect(declarer('maman', 'Douala', 'hier', t).ok).toBe(false); // protection non activée
    activer(t);
    expect(declarer('moi', 'Douala', 'hier', t).ok).toBe(false);
    expect(declarer('papa', 'Douala', 'hier', t).ok).toBe(false); // non couvert
    expect(declarer('maman', ' ', 'hier', t).ok).toBe(false);
    const r = declarer('maman', 'Douala', 'hier', t); expect(r).toMatchObject({ ok: true, numero: 'D-48210' });
    expect(declarer('maman', 'Douala', 'hier', t).ok).toBe(false);
    const e = etat();
    expect(e.souscription!.assureIds).not.toContain('maman');
    expect(e.souscription!.prime).toBe(2800);
    const s = e.sinistres[0];
    const solde = app.solde;
    avancer(t + 10 * 3_600_000); expect(app.solde).toBe(solde);
    expect(etapesSinistre(s, t + 2 * 3_600_000).map((x) => x.atteinte)).toEqual([true, true, false]);
    avancer(t + 49 * 3_600_000); avancer(t + 60 * 3_600_000);
    expect(app.solde).toBe(solde + 2_000_000);
    expect(s.verse).toBe(true);
    expect(declarer('lisa', 'Douala', 'semaine', t + 50 * 3_600_000)).toMatchObject({ numero: 'D-48211' });
  });
});

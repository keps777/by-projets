import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../data/store.svelte.ts';
import { etatInitial } from '../data/seed.ts';
import { codeValide, compteCourant, connecter, courrielValide, creerCompte, deconnecter, notifier, telephoneValide, trouverCompte } from './compte.ts';

beforeEach(() => { for (const k of Object.keys(app)) delete (app as unknown as Record<string, unknown>)[k]; Object.assign(app, etatInitial()); });
describe('comptes et session', () => {
  it('retrouve Alex par courriel ou téléphone, sans égard à la mise en forme', () => {
    expect(trouverCompte(' ALEX.Tremblay@exemple.test ')?.id).toBe('ACC-0412'); expect(trouverCompte('(514) 555-0142')?.id).toBe('ACC-0412'); expect(trouverCompte('x@y.zz')).toBeUndefined(); expect(trouverCompte('123')).toBeUndefined();
  });
  it('connecte et déconnecte', () => { expect(compteCourant()).toBeUndefined(); expect(connecter('ACC-0412')).toBe(true); expect(compteCourant()?.prenom).toBe('Alex'); deconnecter(); expect(compteCourant()).toBeUndefined(); expect(connecter('inconnu')).toBe(false); });
  it('crée un compte sans carte ni identité', () => { const c = creerCompte({ prenom: 'Léa', nom: 'Roy', email: 'lea@exemple.test' }); expect(c.id).toMatch(/^ACC-\d{4}$/); expect(c.carte4).toBeUndefined(); expect(c.identiteVerifiee).toBeUndefined(); expect(trouverCompte('lea@exemple.test')?.id).toBe(c.id); });
  it('valide courriel, téléphone et code de démonstration', () => { expect(courrielValide('a@b.co')).toBe(true); expect(courrielValide('a@b')).toBe(false); expect(telephoneValide('514 555 0142')).toBe(true); expect(telephoneValide('555')).toBe(false); expect(codeValide('482915')).toBe(true); expect(codeValide('000000')).toBe(false); });
  it('respecte les préférences de notification', () => {
    const n0 = app.monde.notifications.length;
    notifier('ACC-0412', { type: 'prix', titre: 'x', sous: 'y', essentielle: false }); expect(app.monde.notifications.length).toBe(n0);
    notifier('ACC-0412', { type: 'echeance', titre: 'x', sous: 'y', essentielle: true }); expect(app.monde.notifications.length).toBe(n0 + 1);
  });
});

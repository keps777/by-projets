import { beforeEach, describe, expect, it, vi } from 'vitest';
import { app } from '../../data/store.svelte.ts';
import { etatInitial } from '../../data/seed.ts';
import { compteCourant } from '../../domain/compte.ts';
import { CODE_DEMO } from '../../data/constantes.ts';
import { CODE_ERRONE, DUREE_BLOCAGE_S, ESSAIS_MAX, codeAffiche, commencerBrouillon, compteDeLAppareil, confirmerCleAcces, creerOuConnecter, demanderCode, essaisNeufs, formaterTelephone,
  identifiantDuBrouillon, identifiantValide, initiales, memoriserAppareil, minuteur, nettoyerCode, normaliserIdentifiant, oublierAppareil, secondesRestantes, typeDe, verifierCode } from './actions.ts';

beforeEach(() => { for (const k of Object.keys(app)) delete (app as unknown as Record<string, unknown>)[k]; Object.assign(app, etatInitial()); });

describe('identifiants', () => {
  it('formate le téléphone au fil de la frappe', () => {
    expect(formaterTelephone('5145550142')).toBe('514 555 0142'); expect(formaterTelephone('+1 (514) 555-0142')).toBe('514 555 0142');
    expect(formaterTelephone('514')).toBe('514'); expect(formaterTelephone('51455')).toBe('514 55'); expect(formaterTelephone('514555014299')).toBe('514 555 0142'); expect(formaterTelephone('')).toBe('');
  });
  it('reconnaît et valide courriel et téléphone', () => {
    expect(typeDe('a@b.co')).toBe('email'); expect(typeDe('514 555 0142')).toBe('tel');
    expect(identifiantValide('email', 'alex@exemple.test')).toBe(true); expect(identifiantValide('email', 'alex@')).toBe(false);
    expect(identifiantValide('tel', '514 555 0142')).toBe(true); expect(identifiantValide('tel', '514 555')).toBe(false);
  });
  it('normalise', () => { expect(normaliserIdentifiant('email', '  Alex@Exemple.TEST ')).toBe('alex@exemple.test'); expect(normaliserIdentifiant('tel', '5145550142')).toBe('514 555 0142'); });
  it('nettoie le code collé, affiche et minute', () => {
    expect(nettoyerCode('482 915')).toBe('482915'); expect(nettoyerCode('a4-8b2c9d1e5f6g7')).toBe('482915'); expect(codeAffiche('482915')).toBe('482 915'); expect(initiales({ prenom: 'Alex', nom: 'Tremblay' })).toBe('AT');
    expect(minuteur(30)).toBe('0:30'); expect(minuteur(65)).toBe('1:05'); expect(secondesRestantes(10_500, 10_000)).toBe(1); expect(secondesRestantes(9_000, 10_000)).toBe(0);
  });
});

describe('demander un code (simulé)', () => {
  it('attend puis réussit', async () => { vi.useFakeTimers(); const p = demanderCode({ delai: 800 }); await vi.advanceTimersByTimeAsync(800); expect(await p).toEqual({ ok: true }); vi.useRealTimers(); });
  it('refuse hors ligne sans attendre, et signale un échec', async () => {
    expect(await demanderCode({ enLigne: false })).toEqual({ ok: false, raison: 'hors-ligne' }); expect(await demanderCode({ echec: true, delai: 0 })).toEqual({ ok: false, raison: 'echec' });
  });
});

describe('vérifier avec limite d’essais', () => {
  it('attend six chiffres sans consommer d’essai', () => { const r = verifierCode('4829', essaisNeufs(), 0); expect(r.etat).toBe('incomplet'); expect(r.essais.restants).toBe(ESSAIS_MAX); });
  it('accepte le code de démonstration', () => expect(verifierCode(CODE_DEMO, essaisNeufs(), 0).etat).toBe('ok'));
  it('compte les essais puis bloque, et annonce la durée', () => {
    let e = essaisNeufs(); let r = verifierCode(CODE_ERRONE, e, 0); expect(r.etat).toBe('incorrect'); expect(r.essais.restants).toBe(2);
    r = verifierCode(CODE_ERRONE, r.essais, 1); expect(r.essais.restants).toBe(1);
    r = verifierCode(CODE_ERRONE, r.essais, 2); expect(r.etat).toBe('bloque'); expect(r.secondesBlocage).toBe(DUREE_BLOCAGE_S); e = r.essais;
    expect(verifierCode(CODE_DEMO, e, 5_000).etat).toBe('bloque'); // même le bon code est refusé pendant le blocage
  });
  it('rend les essais quand le blocage est échu', () => {
    const bloque = { restants: 0, bloqueJusqua: 30_000 }; const r = verifierCode(CODE_DEMO, bloque, 30_000); expect(r.etat).toBe('ok'); expect(r.essais.restants).toBe(ESSAIS_MAX);
  });
});

describe('créer ou connecter, mémoire de l’appareil', () => {
  it('crée un compte avec un identifiant inconnu, le connecte, mémorise l’appareil et passe à l’étape 2', () => {
    commencerBrouillon('email', ' Lea@Exemple.test '); expect(identifiantDuBrouillon()).toEqual({ type: 'email', valeur: 'lea@exemple.test' });
    const r = creerOuConnecter('creation'); expect(r?.creation).toBe(true); expect(compteCourant()?.email).toBe('lea@exemple.test');
    expect(compteDeLAppareil()?.id).toBe(r?.compteId); expect(app.session.inscription.etape).toBe(2);
  });
  it('crée par téléphone', () => { commencerBrouillon('tel', '4385550199'); creerOuConnecter('creation'); expect(compteCourant()?.tel).toBe('438 555 0199'); expect(compteCourant()?.email).toBe(''); });
  it('connecte le compte existant au lieu d’en créer un', () => {
    const n = app.monde.comptes.length; commencerBrouillon('tel', '514 555 0142'); const r = creerOuConnecter('creation');
    expect(r).toEqual({ compteId: 'ACC-0412', creation: false }); expect(app.monde.comptes.length).toBe(n); expect(compteCourant()?.prenom).toBe('Alex');
  });
  it('en mode connexion, un identifiant inconnu ne crée rien', () => { const n = app.monde.comptes.length; commencerBrouillon('email', 'inconnu@exemple.test'); expect(creerOuConnecter('connexion')).toBeUndefined(); expect(app.monde.comptes.length).toBe(n); expect(compteCourant()).toBeUndefined(); });
  it('sans brouillon, rien', () => expect(creerOuConnecter('creation')).toBeUndefined());
  it('mémorise puis oublie l’appareil', () => { expect(compteDeLAppareil()).toBeUndefined(); memoriserAppareil('ACC-0412'); expect(compteDeLAppareil()?.prenom).toBe('Alex'); oublierAppareil(); expect(compteDeLAppareil()).toBeUndefined(); });
  it('clé d’accès simulée : connecte après le délai, ou échoue si refusée', async () => {
    expect(await confirmerCleAcces('ACC-0412', { delai: 0, refuser: true })).toBe(false); expect(compteCourant()).toBeUndefined();
    expect(await confirmerCleAcces('ACC-0412', { delai: 0 })).toBe(true); expect(compteCourant()?.id).toBe('ACC-0412');
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../data/store.svelte.ts';
import { etatInitial } from '../../data/seed.ts';
import { compteDe, creerCompte } from '../../domain/compte.ts';
import {
  basculerInteret, cvcValide, enregistrerCarte, enregistrerNotifications, enregistrerPartage, enregistrerProfil, erreursCarte, expirationValide, formaterExpiration, formaterNumeroCarte,
  lirePartage, luhn, masquerCarte, numeroCarteValide, numeroDocumentValide, phraseBonjour, phraseChoix, profil, recapitulatif, resultatIdentite, resumePartage, retirerCarte, retourSur,
  terminerInscription, trouverAeroport, verifierIdentite
} from './actions.ts';

const MAI = Date.parse('2026-10-12T09:00');
beforeEach(() => { for (const k of Object.keys(app)) delete (app as unknown as Record<string, unknown>)[k]; Object.assign(app, etatInitial()); });
const nouveau = () => { const c = creerCompte({ email: 'x@exemple.test' }); app.session.compteId = c.id; return c; };

describe('étape 2 : profil', () => {
  it('reconnaît un aéroport par code, par ville ou par libellé complet', () => {
    expect(trouverAeroport('Montréal (YUL)')?.code).toBe('YUL'); expect(trouverAeroport('yul')?.code).toBe('YUL'); expect(trouverAeroport('montreal')?.code).toBe('YUL');
    expect(trouverAeroport('Paris (CDG)')?.code).toBe('CDG'); expect(trouverAeroport('')?.code).toBe('YUL'); expect(trouverAeroport('Atlantide')).toBeUndefined();
  });
  it('écrit prénom, nom, aéroport et intérêts sur le compte courant, et avance le brouillon', () => {
    const c = nouveau();
    const r = enregistrerProfil(c.id, { prenom: ' Léa ', nom: 'Roy', aeroport: 'Paris (CDG)', interets: ['family', 'inconnu'] });
    expect(r.ok).toBe(true);
    const m = compteDe(c.id)!; expect([m.prenom, m.nom, m.aeroport, m.ville]).toEqual(['Léa', 'Roy', 'CDG', 'Paris']);
    expect(profil().interets).toEqual(['family']); expect(app.session.inscription.etape).toBe(3);
  });
  it('refuse un aéroport inconnu sans rien écrire', () => {
    const c = nouveau(); const r = enregistrerProfil(c.id, { prenom: 'Zoé', nom: '', aeroport: 'Atlantide', interets: [] });
    expect(r.ok).toBe(false); expect(compteDe(c.id)!.prenom).toBe('');
  });
  it('tout est facultatif', () => { const c = nouveau(); expect(enregistrerProfil(c.id, { prenom: '', nom: '', aeroport: '', interets: [] }).ok).toBe(true); expect(compteDe(c.id)!.aeroport).toBe('YUL'); });
  it('phrases et bascule des intérêts', () => {
    expect(phraseBonjour('Alex')).toBe('Nous vous dirons « Bonjour Alex ».'); expect(phraseBonjour('  ')).toBe('Facultatif : laissez vide si vous préférez.');
    expect(phraseChoix(0)).toBe('Aucun choix pour l’instant : c’est permis.'); expect(phraseChoix(1)).toBe('1 choix sélectionné sur 6'); expect(phraseChoix(3)).toBe('3 choix sélectionnés sur 6');
    expect(basculerInteret(['a'], 'b')).toEqual(['a', 'b']); expect(basculerInteret(['a', 'b'], 'a')).toEqual(['b']);
  });
});

describe('étape 3 : partage', () => {
  it('range les réglages : alertes → offres, audience → analyses, partenaires, rappel J-1 dans la tranche', () => {
    const c = nouveau();
    enregistrerPartage(c.id, { alertes: false, rappelsJ1: false, partenaires: true, audience: true });
    expect(compteDe(c.id)!.partage).toEqual({ offres: false, analyses: true, partenaires: true }); expect(profil().rappelsJ1).toBe(false); expect(app.session.inscription.etape).toBe(4);
    expect(lirePartage(compteDe(c.id))).toEqual({ alertes: false, rappelsJ1: false, partenaires: true, audience: true });
  });
  it('valeurs par défaut de la maquette et phrase de résumé', () => {
    const c = nouveau(); expect(lirePartage(c)).toEqual({ alertes: true, rappelsJ1: true, partenaires: false, audience: false });
    expect(resumePartage({ alertes: true, rappelsJ1: true, partenaires: false, audience: false })).toBe('Activés : le nécessaire, plus 2 réglages facultatifs sur 4.');
    expect(resumePartage({ alertes: false, rappelsJ1: true, partenaires: false, audience: false })).toBe('Activés : le nécessaire, plus 1 réglage facultatif sur 4.');
  });
});

describe('étape 4 : notifications', () => {
  it('enregistre la fréquence et la permission simulée', () => {
    const c = nouveau(); enregistrerNotifications(c.id, 'tout', 'accordee');
    expect(compteDe(c.id)!.prefsNotif).toBe('tout'); expect(profil().permission).toBe('accordee');
    enregistrerNotifications(c.id, 'rien', 'refusee'); expect(compteDe(c.id)!.prefsNotif).toBe('rien');
  });
});

describe('carte de démonstration', () => {
  it('contrôle de Luhn', () => {
    expect(luhn('4242424242424242')).toBe(true); expect(luhn('4242424242424241')).toBe(false); expect(luhn('79927398713')).toBe(true); expect(luhn('abcd')).toBe(false); expect(luhn('')).toBe(false);
    expect(numeroCarteValide('4242 4242 4242 4242')).toBe(true); expect(numeroCarteValide('4242 4242 4242')).toBe(false); expect(numeroCarteValide('5555 5555 5555 4444')).toBe(true);
  });
  it('formate numéro et expiration', () => {
    expect(formaterNumeroCarte('42424242424242429999')).toBe('4242 4242 4242 4242'); expect(formaterNumeroCarte('4242a42')).toBe('4242 42'); expect(formaterExpiration('1228')).toBe('12/28'); expect(formaterExpiration('1')).toBe('1');
  });
  it('valide expiration et code de sécurité', () => {
    expect(expirationValide('12/28', MAI)).toBe(true); expect(expirationValide('10/26', MAI)).toBe(true); expect(expirationValide('09/26', MAI)).toBe(false);
    expect(expirationValide('13/28', MAI)).toBe(false); expect(expirationValide('00/28', MAI)).toBe(false); expect(expirationValide('1228', MAI)).toBe(false);
    expect(cvcValide('123')).toBe(true); expect(cvcValide('12')).toBe(false); expect(cvcValide('12a')).toBe(false);
  });
  it('ne garde que les 4 derniers chiffres, rien d’autre', () => {
    const c = nouveau(); const avant = JSON.stringify(c);
    const r = enregistrerCarte(c.id, { numero: '4242 4242 4242 4242', exp: '12/28', cvc: '123' });
    expect(r).toEqual({ ok: true, carte4: '4242' }); expect(compteDe(c.id)!.carte4).toBe('4242');
    const brut = JSON.stringify(app); expect(brut).not.toContain('4242 4242'); expect(brut).not.toContain('4242424242424242'); expect(brut).not.toContain('"cvc"');
    expect(Object.keys(compteDe(c.id)!).sort()).toEqual([...Object.keys(JSON.parse(avant)), 'carte4'].sort());
    expect(masquerCarte('4242')).toBe('•••• •••• •••• 4242');
    retirerCarte(c.id); expect(compteDe(c.id)!.carte4).toBeUndefined();
  });
  it('refuse une carte invalide sans rien écrire', () => {
    const c = nouveau(); const r = enregistrerCarte(c.id, { numero: '4242 4242 4242 4241', exp: '01/20', cvc: '1' });
    expect(r.ok).toBe(false); if (!r.ok) expect(Object.keys(r.erreurs)).toEqual(['numero', 'exp', 'cvc']); expect(compteDe(c.id)!.carte4).toBeUndefined();
    expect(erreursCarte({ numero: '1234', exp: '12/28', cvc: '123' }).numero).toMatch(/16 chiffres/);
  });
});

describe('identité simulée', () => {
  it('valide le numéro de document et décide du résultat', () => {
    expect(numeroDocumentValide('AB123456')).toBe(true); expect(numeroDocumentValide('AB 123-456')).toBe(true); expect(numeroDocumentValide('abc')).toBe(false); expect(numeroDocumentValide('éé12345')).toBe(false);
    expect(resultatIdentite('AB123456')).toBe('ok'); expect(resultatIdentite('000000')).toBe('refuse');
  });
  it('horodate la vérification au « maintenant » de la démo', () => { const c = nouveau(); verifierIdentite(c.id); expect(compteDe(c.id)!.identiteVerifiee).toBeGreaterThan(MAI - 1000); });
});

describe('écran prêt', () => {
  it('assainit le chemin de retour (jamais d’adresse externe)', () => {
    expect(retourSur('/achat/42')).toBe('/achat/42'); expect(retourSur('/pret?x=1')).toBe('/pret?x=1'); expect(retourSur(null)).toBe('/pret'); expect(retourSur('')).toBe('/pret');
    expect(retourSur('https://evil.test')).toBe('/pret'); expect(retourSur('//evil.test')).toBe('/pret'); expect(retourSur('/\\evil')).toBe('/pret'); expect(retourSur('x', '/')).toBe('/');
  });
  it('récapitule le compte, avec carte et identité en attente puis faites', () => {
    const c = nouveau(); enregistrerProfil(c.id, { prenom: 'Léa', nom: 'Roy', aeroport: 'YUL', interets: [] });
    let r = recapitulatif(compteDe(c.id)!); expect(r.map((l) => l.cle)).toEqual(['compte', 'notifications', 'partage', 'carte', 'identite']);
    expect(r[0].valeur).toBe('Léa Roy · YUL'); expect(r[1].valeur).toBe('L’essentiel'); expect(r[2].valeur).toBe('2 réglages activés'); expect([r[3].valeur, r[3].fait, r[4].valeur, r[4].fait]).toEqual(['plus tard', false, 'plus tard', false]);
    enregistrerCarte(c.id, { numero: '4242424242424242', exp: '12/28', cvc: '123' }); verifierIdentite(c.id);
    r = recapitulatif(compteDe(c.id)!); expect([r[3].valeur, r[3].fait, r[4].valeur, r[4].fait]).toEqual(['•••• •••• •••• 4242', true, 'vérifiée', true]);
  });
  it('remet le brouillon d’inscription à l’étape 1', () => { app.session.inscription = { prenom: 'Léa', etape: 4 }; terminerInscription(); expect(app.session.inscription).toEqual({ etape: 1 }); });
});

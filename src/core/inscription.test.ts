import { describe, expect, it } from 'vitest';
import { ageAu, cetAppareil, capitaliser, codeEstNaissance, codeParrain, codePaiementRequis, dureeCourte, ilYa, initiales, lireNaissance, minutesSecondes, nomAppareil, numerosMembre, scoreDepart, separerNom, statutEmployeur, tarifPass, trouverEmployeur, validiteCarte, verifierIdentite } from './inscription.ts';
import { depuisBase64url, optionsAuthentification, optionsCreation, versBase64url } from './webauthn.ts';

const MAINTENANT = new Date(2026, 9, 22, 10, 0).getTime();

describe('employeur', () => {
  it('reconnaît le code sans tenir compte de la casse ni des espaces', () => {
    expect(trouverEmployeur(' ndiba-2026 ')?.nom).toBe('Groupe Ndiba Logistique');
    expect(statutEmployeur('')).toBe('vide');
    expect(statutEmployeur('ndiba-2026')).toBe('valide');
    expect(statutEmployeur('XYZ-1')).toBe('inconnu');
  });
  it('score de départ : 610 avec Ndiba, 500 sans code', () => {
    expect(scoreDepart(trouverEmployeur('NDIBA-2026'))).toBe(610);
    expect(scoreDepart(null)).toBe(500);
  });
});

describe('tarif du Pass', () => {
  const ndiba = trouverEmployeur('NDIBA-2026');
  it('mensuel avec employeur : 50 % plafonnés à 12 500', () => {
    expect(tarifPass('essentiel', 'mensuel', ndiba)).toEqual({ total: 9000, employeur: 4500, membre: 4500, unite: 'mois' });
    expect(tarifPass('famille', 'mensuel', ndiba)).toEqual({ total: 25_000, employeur: 12_500, membre: 12_500, unite: 'mois' });
    expect(tarifPass('premium', 'mensuel', ndiba)).toEqual({ total: 60_000, employeur: 12_500, membre: 47_500, unite: 'mois' });
  });
  it('sans employeur : le membre paie tout', () => {
    expect(tarifPass('famille', 'mensuel', null)).toEqual({ total: 25_000, employeur: 0, membre: 25_000, unite: 'mois' });
  });
  it('annuel : 12 mois moins 10 %, part employeur sur 12 mois', () => {
    expect(tarifPass('essentiel', 'annuel', null).total).toBe(97_200);
    expect(tarifPass('famille', 'annuel', ndiba)).toEqual({ total: 270_000, employeur: 150_000, membre: 120_000, unite: 'an' });
  });
});

describe('identité', () => {
  it('sépare le nom (capitales) des prénoms', () => {
    expect(separerNom('NGONO Aïcha Marthe')).toEqual({ nom: 'Ngono', prenom: 'Aïcha' });
    expect(separerNom('DE LA CRUZ Marie')).toEqual({ nom: 'De La Cruz', prenom: 'Marie' });
    expect(separerNom('NGONO AÏCHA')).toEqual({ nom: 'Ngono', prenom: 'Aïcha' });
    expect(separerNom('Aïcha')).toEqual({ nom: 'Aïcha', prenom: '' });
    expect(separerNom('  ')).toEqual({ nom: '', prenom: '' });
    expect(capitaliser('JEAN-PIERRE')).toBe('Jean-Pierre');
  });
  it('lit la date de naissance et refuse les dates impossibles', () => {
    expect(lireNaissance('14 · 03 · 1991')).toBe('1991-03-14');
    expect(lireNaissance('14/03/1991')).toBe('1991-03-14');
    expect(lireNaissance('14031991')).toBe('1991-03-14');
    expect(lireNaissance('31/02/1991')).toBeNull();
    expect(lireNaissance('hier')).toBeNull();
  });
  it('calcule l\'âge au jour près', () => {
    expect(ageAu('1991-10-22', MAINTENANT)).toBe(35);
    expect(ageAu('1991-10-23', MAINTENANT)).toBe(34);
  });
  it('valide les trois champs', () => {
    expect(verifierIdentite({ nomComplet: 'NGONO Aïcha Marthe', cni: '1162 ···· ···· 07', naissance: '14 · 03 · 1991' }, MAINTENANT).ok).toBe(true);
    const r = verifierIdentite({ nomComplet: 'Aïcha', cni: '12', naissance: '14/03/2015' }, MAINTENANT);
    expect(r.ok).toBe(false);
    expect(Object.keys(r.erreurs).sort()).toEqual(['cni', 'naissance', 'nom']);
    expect(verifierIdentite({ nomComplet: 'NGONO Aïcha', cni: '1162000007', naissance: 'x' }, MAINTENANT).erreurs.naissance).toMatch(/JJ/);
  });
  it('repère un code qui est une date de naissance', () => {
    expect(codeEstNaissance('140391', '1991-03-14')).toBe(true);
    expect(codeEstNaissance('910314', '1991-03-14')).toBe(true);
    expect(codeEstNaissance('482915', '1991-03-14')).toBe(false);
    expect(codeEstNaissance('140391', null)).toBe(false);
  });
  it('initiales', () => { expect(initiales('Aïcha', 'Ngono')).toBe('AN'); expect(initiales('', '')).toBe('?'); });
});

describe('numéros de membre', () => {
  it('stables pour un même numéro, bien formés', () => {
    const a = numerosMembre('691224821');
    expect(a).toEqual(numerosMembre('691224821'));
    expect(a.membre).toMatch(/^AM[1-9]\d{3}$/);
    expect(a.fin).toMatch(/^\d{4}$/);
    expect(numerosMembre('690123456').membre).not.toBe(a.membre);
  });
  it('code parrain sans accent', () => { expect(codeParrain('Aïcha', 'AM4821')).toBe('AICHA-4821'); expect(codeParrain('', 'AM4821')).toBe('AMI-4821'); });
  it('validité de la carte : trois ans', () => { expect(validiteCarte(MAINTENANT)).toBe('10 / 2029'); });
});

describe('appareils et durées', () => {
  it('nomme l\'appareil depuis le user-agent', () => {
    expect(nomAppareil('Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X)')).toEqual({ nom: 'iPhone', systeme: 'iOS 17' });
    expect(nomAppareil('Mozilla/5.0 (Linux; Android 15; Pixel 7) Chrome/130').nom).toBe('Pixel 7');
    expect(nomAppareil('Mozilla/5.0 (Linux; Android 10; K) Chrome/130')).toEqual({ nom: 'Téléphone Android', systeme: 'Android 10' });
    expect(nomAppareil('Mozilla/5.0 (X11; Linux x86_64) Chrome').nom).toBe('Ordinateur Linux');
    expect(nomAppareil('').nom).toBe('Cet appareil');
  });
  it('nom de l\'appareil courant', () => {
    expect(cetAppareil('iPhone')).toBe('Cet iPhone');
    expect(cetAppareil('Téléphone Android')).toBe('Ce téléphone Android');
    expect(cetAppareil('Ordinateur Linux')).toBe('Cet ordinateur Linux');
    expect(cetAppareil('Mac')).toBe('Ce Mac');
    expect(cetAppareil('Cet appareil')).toBe('Cet appareil');
  });
  it('il y a…', () => {
    expect(ilYa(MAINTENANT - 5_000, MAINTENANT)).toBe("à l'instant");
    expect(ilYa(MAINTENANT - 12 * 60_000, MAINTENANT)).toBe('il y a 12 min');
    expect(ilYa(MAINTENANT - 2 * 3600_000, MAINTENANT)).toBe('il y a 2 h');
    expect(ilYa(MAINTENANT - 6 * 86400_000, MAINTENANT)).toBe('il y a 6 jours');
    expect(ilYa(MAINTENANT - 86400_000, MAINTENANT)).toBe('il y a 1 jour');
    expect(ilYa(MAINTENANT - 65 * 86400_000, MAINTENANT)).toBe('il y a 2 mois');
  });
  it('compte à rebours et durée', () => {
    expect(minutesSecondes(892)).toBe('14:52'); expect(minutesSecondes(0)).toBe('00:00');
    expect(dureeCourte(112_000)).toBe('1 MIN 52 S');
  });
  it('code demandé pour les paiements au-dessus de 50 000', () => {
    expect(codePaiementRequis(50_000, true)).toBe(false);
    expect(codePaiementRequis(50_001, true)).toBe(true);
    expect(codePaiementRequis(200_000, false)).toBe(false);
  });
});

describe('WebAuthn', () => {
  it('base64url aller-retour sans remplissage', () => {
    const o = new Uint8Array([251, 255, 254, 0, 1, 2, 3]);
    const t = versBase64url(o);
    expect(t).not.toMatch(/[+/=]/);
    expect([...depuisBase64url(t)]).toEqual([...o]);
  });
  it('options de création : clé de plateforme, vérification obligatoire', () => {
    const o = optionsCreation({ defi: new Uint8Array(32), idUtilisateur: new Uint8Array(8), nom: 'u-1', affichage: 'Aïcha' });
    expect(o.authenticatorSelection?.userVerification).toBe('required');
    expect(o.authenticatorSelection?.authenticatorAttachment).toBe('platform');
    expect(o.rp.name).toBe('AssureMe');
  });
  it('options de connexion : cible la clé enregistrée', () => {
    const id = versBase64url(new Uint8Array([9, 8, 7]));
    const o = optionsAuthentification(new Uint8Array(32), id);
    expect([...(o.allowCredentials?.[0].id as Uint8Array)]).toEqual([9, 8, 7]);
  });
});

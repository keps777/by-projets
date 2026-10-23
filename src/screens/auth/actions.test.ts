import { beforeEach, describe, expect, it } from 'vitest';
import { app, reinitialiser } from '../../data/store.svelte.ts';
import { CODE_DEMO } from '../../data/constantes.ts';
import { lignesDe, rattraperPaies } from '../../data/paie.ts';
import { DUREE_VERROU_MS } from '../../core/auth.ts';
import './demarrage.ts';
import { activerDemo, ajouterProche, changerCode, changerPass, controlerOtp, creerCompte, deconnecter, envoyerOtp, mettreAJourInfos, reinitialiserCode, securiserCompte, tenterCode, verifierCode } from './actions.ts';
import { brouillonVide, etatAuth } from './etat.ts';
import { idAppareil } from './appareil.ts';
import { sms, temp } from './memoire.svelte.ts';

async function compteVierge(avecEmployeur = true) {
  reinitialiser('vierge');
  const b = etatAuth().brouillon;
  Object.assign(b, brouillonVide(), { tel: '691224821', employeur: avecEmployeur ? 'NDIBA-2026' : '', nomComplet: 'NGONO Aïcha Marthe', cni: '1162000007', naissance: '14/03/1991', pass: 'famille', etape: 4 });
  await creerCompte('482915');
}

describe('inscription : création du compte', () => {
  it('remplit le compte, connecte, ne garde que le hash PBKDF2, compte vierge sans solde ni crédit', async () => {
    await compteVierge();
    expect(app.compte).toMatchObject({ prenom: 'Aïcha', nom: 'Ngono', telephone: '691224821', pass: 'famille', employeur: 'NDIBA LOGISTIQUE', salaireNet: 0 });
    expect(app.compte?.numeroMembre).toMatch(/^AM\d{4}$/);
    expect(app.auth.connecte).toBe(true);
    expect(app.auth.hash).toHaveLength(64);
    expect(app.auth.sel).toBeTruthy();
    expect(JSON.stringify(app)).not.toContain('482915');
    expect(app.solde).toBe(0); expect(app.credits).toEqual([]); expect(app.mouvements).toEqual([]);
    expect(app.score.valeur).toBe(610);
    expect(app.auth.appareils).toHaveLength(1);
    expect(app.auth.appareils[0].id).toBe(idAppareil());
    expect(etatAuth().employeurCode).toBe('NDIBA-2026');
  });
  it('sans code employeur : score 500, niveau Start', async () => {
    await compteVierge(false);
    expect(app.score.valeur).toBe(500);
    expect(app.compte?.employeur).toBe('');
    expect(etatAuth().employeurCode).toBe('');
  });
});

describe('connexion et verrouillage', () => {
  beforeEach(async () => { await compteVierge(); deconnecter('ici'); });
  it('bon code : session ouverte', async () => {
    expect(await tenterCode('482915')).toBe('ok');
    expect(app.auth.connecte).toBe(true);
    expect(app.auth.verrou.echecs).toBe(0);
  });
  it('trois codes faux : verrouillé 15 minutes, même le bon code est refusé', async () => {
    expect(await tenterCode('000001')).toBe('faux');
    expect(await tenterCode('000002')).toBe('faux');
    expect(await tenterCode('000003')).toBe('verrouille');
    expect(app.auth.verrou.verrouJusqua! - Date.now()).toBeGreaterThan(DUREE_VERROU_MS - 5000);
    expect(await tenterCode('482915')).toBe('verrouille');
    expect(app.auth.connecte).toBe(false);
  });
  it('après les 15 minutes : trois essais neufs', async () => {
    for (const c of ['000001', '000002', '000003']) await tenterCode(c);
    app.auth.verrou.verrouJusqua = Date.now() - 1000;
    expect(await tenterCode('000004')).toBe('faux');
    expect(app.auth.verrou.echecs).toBe(1);
    expect(await tenterCode('482915')).toBe('ok');
  });
  it('appareil inconnu : le code ne suffit pas, il faut le parcours « nouvel appareil »', async () => {
    app.auth.appareils = [{ id: 'd-ancien', nom: 'iPhone', lieu: 'Douala', quand: Date.now(), actuel: true }];
    expect(await tenterCode('482915')).toBe('nouvel_appareil');
    expect(app.auth.connecte).toBe(false);
    expect(temp.codeVerifie).toBe(true);
  });
  it('« ce n\'est pas moi » : appareil bloqué, appareils retirés, connexion refusée', async () => {
    securiserCompte();
    expect(etatAuth().bloques).toContain(idAppareil());
    expect(app.auth.appareils).toEqual([]);
    expect(await tenterCode('482915')).toBe('bloque');
  });
  it('verifierCode compte aussi les échecs', async () => {
    expect(await verifierCode('000001')).toBe('faux');
    expect(await verifierCode('482915')).toBe('ok');
    expect(app.auth.verrou.echecs).toBe(0);
  });
  it('déconnexion globale : ne garde que cet appareil', () => {
    app.auth.appareils.push({ id: 'd-autre', nom: 'Pixel 7', lieu: 'Douala', quand: Date.now(), actuel: false });
    deconnecter('tous');
    expect(app.auth.appareils.map((a) => a.id)).toEqual([idAppareil()]);
  });
});

describe('changement et oubli du code', () => {
  beforeEach(async () => { await compteVierge(); });
  it('changerCode : ancien faux, trop simple, identique, puis ok', async () => {
    expect(await changerCode('000001', '246813')).toBe('ancien_faux');
    expect(await changerCode('482915', '123456')).toBe('simple');
    expect(await changerCode('482915', '482915')).toBe('identique');
    expect(await changerCode('482915', '246813')).toBe('ok');
    expect(await tenterCode('246813')).toBe('ok');
    expect(etatAuth().codeModifieLe).not.toBeNull();
  });
  it('code oublié : nouveau code, autres appareils déconnectés, blocage levé, verrou remis à zéro', async () => {
    securiserCompte(); app.auth.verrou = { echecs: 3, verrouJusqua: Date.now() + 60_000 };
    expect(await reinitialiserCode('123456')).toBe('simple');
    expect(await reinitialiserCode('482915')).toBe('identique');
    expect(await reinitialiserCode('975310')).toBe('ok');
    expect(etatAuth().bloques).toEqual([]);
    expect(app.auth.appareils).toEqual([]);
    expect(app.auth.verrou).toEqual({ echecs: 0, verrouJusqua: null });
    expect(await tenterCode('975310')).toBe('ok');
  });
});

describe('code SMS simulé', () => {
  it('affiche le code dans le bandeau et accepte 123456 ; refuse un autre code ; 5 essais maximum', async () => {
    await envoyerOtp('6 91 22 48 21');
    expect(app.auth.telephoneEnCours).toBe('691224821');
    expect(sms.visible).toBe(true); expect(sms.texte).toContain('123456');
    expect(app.auth.otp?.hash).toBeTruthy(); expect(JSON.stringify(app.auth.otp)).not.toContain('123456');
    expect(await controlerOtp('000000')).toBe('faux');
    expect(await controlerOtp('123456')).toBe('ok');
    expect(app.auth.otp).toBeNull(); expect(sms.visible).toBe(false);
    await envoyerOtp('691224821');
    for (let i = 0; i < 4; i++) expect(await controlerOtp('000000')).toBe('faux');
    expect(await controlerOtp('000000')).toBe('trop_d_essais');
    expect(await controlerOtp('123456')).toBe('trop_d_essais');
  });
  it('code expiré après 5 minutes', async () => {
    await envoyerOtp('691224821');
    app.auth.otp!.expire = Date.now() - 1;
    expect(await controlerOtp('123456')).toBe('expire');
  });
});

describe('compte de démonstration', () => {
  it('Aïcha se connecte avec le code démo', async () => {
    await activerDemo();
    expect(app.mode).toBe('demo'); expect(app.compte?.prenom).toBe('Aïcha'); expect(app.solde).toBe(86_500);
    expect(app.auth.appareils).toHaveLength(3);
    deconnecter('ici');
    expect(await tenterCode('000001')).toBe('faux');
    expect(await tenterCode(CODE_DEMO)).toBe('ok');
  });
});

describe('Pass prélevé sur salaire', () => {
  it('démo : 12 500 (25 000 moins 50 % employeur) à la prochaine paie, puis échéance +1 mois', async () => {
    await activerDemo();
    const l = lignesDe('2026-10-28').find((x) => x.id === 'pass')!;
    expect(l.montant).toBe(12_500);
    expect(l.type).toBe('pass');
    app.solde = 100_000; app.dernierePaie = '2026-09-28'; app.compte!.cree = Date.parse('2026-06-01');
    etatAuth().passEcheance = '2026-10-28';
    rattraperPaies(Date.parse('2026-10-29T10:00:00'));
    expect(etatAuth().passEcheance).toBe('2026-11-28');
    expect(app.mouvements.some((m) => m.categorie === 'pass' && m.montant === -12_500)).toBe(true);
  });
  it('rien avant l\'échéance ; annuel : 12 mois remisés moins la part employeur', async () => {
    await activerDemo();
    etatAuth().passEcheance = '2026-12-28';
    expect(lignesDe('2026-11-28').some((x) => x.id === 'pass')).toBe(false);
    changerPass('famille', 'annuel');
    expect(lignesDe('2026-12-28').find((x) => x.id === 'pass')!.montant).toBe(120_000);
  });
  it('compte vierge sans salaire : le Pass est dû mais sera reporté sans pénalité (solde 0)', async () => {
    await compteVierge();
    const l = lignesDe(etatAuth().passEcheance!)[0];
    expect(l.montant).toBe(12_500); expect(l.reporter).toBeTypeOf('function');
  });
});

describe('profil', () => {
  it('infos de paie : validation et code employeur', async () => {
    await compteVierge(false);
    expect(mettreAJourInfos({ employeur: 'Mon entreprise', codeEmployeur: '', salaireNet: -1, jourPaie: 28 })).toMatch(/Salaire/);
    expect(mettreAJourInfos({ employeur: '', codeEmployeur: '', salaireNet: 300_000, jourPaie: 40 })).toMatch(/Jour/);
    expect(mettreAJourInfos({ employeur: '', codeEmployeur: 'XXX', salaireNet: 300_000, jourPaie: 25 })).toMatch(/inconnu/);
    expect(mettreAJourInfos({ employeur: 'Mon entreprise', codeEmployeur: '', salaireNet: 300_000, jourPaie: 25 })).toBeNull();
    expect(app.compte).toMatchObject({ salaireNet: 300_000, jourPaie: 25, employeur: 'Mon entreprise' });
    expect(mettreAJourInfos({ employeur: '', codeEmployeur: 'ndiba-2026', salaireNet: 300_000, jourPaie: 25 })).toBeNull();
    expect(app.compte?.employeur).toBe('NDIBA LOGISTIQUE'); expect(etatAuth().employeurCode).toBe('NDIBA-2026');
  });
  it('carte famille : plafond de 5 proches, pas de doublon, rien avec le Pass Essentiel', async () => {
    await compteVierge();
    expect(ajouterProche('P', 'Enfant')).toMatch(/prénom/);
    for (const n of ['Paul', 'Lisa', 'Junior', 'Mireille', 'Joël']) expect(ajouterProche(n, 'Enfant')).toBeNull();
    expect(ajouterProche('Extra', 'Enfant')).toMatch(/6 personnes/);
    changerPass('essentiel', 'mensuel');
    expect(etatAuth().proches).toEqual([]);
    expect(ajouterProche('Paul', 'Conjoint')).toMatch(/Essentiel/);
  });
  it('doublon refusé', async () => {
    await compteVierge();
    expect(ajouterProche('Paul', 'Conjoint')).toBeNull();
    expect(ajouterProche(' paul ', 'Conjoint')).toMatch(/déjà/);
  });
});

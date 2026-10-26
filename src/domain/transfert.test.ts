import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../data/store.svelte.ts';
import { etatInitial } from '../data/seed.ts';
import { droitDe, avancerMonde } from './marche.ts';
import { brouillonDe, dernierTransfert, delaiHM, effacerBrouillon, ErreurTransfert, etatTransfert, identifiantPublic, initialesDe, inviterProche, jourHeure, majBrouillon, nomCourt, prochesEnregistres, prochesSansCompte, rechercherProche, transferer, trancheTransferts } from './transfert.ts';

beforeEach(() => { for (const k of Object.keys(app)) delete (app as unknown as Record<string, unknown>)[k]; Object.assign(app, etatInitial()); });
const ALEX = 'ACC-0412', CAMILLE = 'ACC-0187', PAUL = 'ACC-0233';
const T = (s: string) => Date.parse(s);
const code = (f: () => unknown) => { try { f(); } catch (e) { return e instanceof ErreurTransfert ? e.code : `autre:${(e as Error).message}`; } return 'aucune'; };

describe('recherche d’un proche', () => {
  it('identifiant public : @prenom.nom sans accent, nom court et initiales', () => {
    const c = app.monde.comptes.find((x) => x.id === 'ACC-0402')!; expect(identifiantPublic(c)).toBe('@ines.moreau'); expect(nomCourt(c)).toBe('Inès M.'); expect(initialesDe(c)).toBe('IM');
    expect(nomCourt({ prenom: 'Léa', nom: 'ailleurs' })).toBe('Léa A.');
  });
  it('recherche exacte par identifiant (avec ou sans @, casse ignorée), courriel et numéro de compte', () => {
    expect(rechercherProche('@camille.tremblay')).toEqual({ id: CAMILLE, nom: 'Camille T.', ini: 'CT', ident: '@camille.tremblay' });
    expect(rechercherProche(' Camille.Tremblay ')?.id).toBe(CAMILLE); expect(rechercherProche('ALEX.TREMBLAY@exemple.test')?.id).toBe(ALEX); expect(rechercherProche('acc-0233')?.id).toBe(PAUL);
  });
  it('rien d’approché : ni préfixe, ni prénom seul, ni vide, ni administrateur, ni compte inactif', () => {
    for (const q of ['', '  ', '@', 'camille', '@camille.trem', 'camille.tremblay@exemple', '@maya.lefebvre', 'maya.lefebvre@nexg-tt.test']) expect(rechercherProche(q), q).toBeUndefined();
    app.monde.comptes.find((c) => c.id === PAUL)!.actif = false; expect(rechercherProche('@paul.roy')).toBeUndefined();
  });
  it('ne montre que le prénom et l’initiale : aucun courriel, téléphone ni nom de famille', () => {
    const p = rechercherProche('@paul.roy')!; expect(Object.keys(p).sort()).toEqual(['id', 'ident', 'ini', 'nom']); expect(JSON.stringify(p)).not.toMatch(/555|exemple|Roy"/);
  });
  it('les proches enregistrés sont les comptes actifs de la liste du compte', () => {
    expect(prochesEnregistres(ALEX).map((p) => p.nom)).toEqual(['Camille T.', 'Paul R.']); app.monde.comptes.find((c) => c.id === CAMILLE)!.actif = false; expect(prochesEnregistres(ALEX).map((p) => p.nom)).toEqual(['Paul R.']); expect(prochesEnregistres('ACC-0000')).toEqual([]);
  });
});

describe('faisabilité', () => {
  it('un droit détenu avant l’avertissement est transférable', () => { expect(etatTransfert('d-812', ALEX)).toMatchObject({ ok: true, phase: 'ouvert', avertissement: false }); });
  it('averti à moins de 72 h du départ (48 h avant l’échéance), bloqué à l’échéance', () => {
    const e = T('2026-12-13T18:05'); expect(etatTransfert('d-812', ALEX, e - 60_000)).toMatchObject({ ok: true, phase: 'avertissement', avertissement: true, msRestant: 60_000 });
    expect(etatTransfert('d-812', ALEX, T('2026-12-11T18:05'))).toMatchObject({ ok: true, avertissement: true }); expect(etatTransfert('d-812', ALEX, T('2026-12-11T18:04'))).toMatchObject({ ok: true, avertissement: false });
    expect(etatTransfert('d-812', ALEX, e)).toMatchObject({ ok: false, motif: 'echeance', phase: 'ferme' }); expect(etatTransfert('d-812', ALEX, T('2026-12-15T00:00'))).toMatchObject({ ok: false, motif: 'echeance', phase: 'parti' });
  });
  it('refuse un droit en vente, nommé, gelé, d’un autre ou inconnu, avec la raison', () => {
    expect(etatTransfert('d-hav', ALEX)).toMatchObject({ ok: false, motif: 'en_vente' }); expect(etatTransfert('d-8wc2', CAMILLE)).toMatchObject({ ok: false, motif: 'nomme' }); expect(etatTransfert('d-gele', 'ACC-0402')).toMatchObject({ ok: false, motif: 'gele' });
    expect(etatTransfert('d-812', CAMILLE)).toMatchObject({ ok: false, motif: 'detenteur' }); expect(etatTransfert('d-inconnu', ALEX)).toMatchObject({ ok: false, motif: 'detenteur' }); expect(etatTransfert('d-hav', ALEX).raison).toMatch(/annonce/);
  });
});

describe('transferer', () => {
  it('le droit passe au proche : chaîne « transfert », Transfert enregistré, notifications aux deux, proche mémorisé', () => {
    const avant = droitDe('d-812')!.chaine.length; const t = transferer('d-812', ALEX, CAMILLE); const d = droitDe('d-812')!;
    expect(d).toMatchObject({ detenteurId: CAMILLE, statut: 'detenu', origine: 'transfert' }); expect(d.chaine).toHaveLength(avant + 1); expect(d.chaine.at(-1)).toMatchObject({ type: 'transfert', de: ALEX, vers: CAMILLE, prix: 0 });
    expect(t).toMatchObject({ droitId: 'd-812', de: ALEX, vers: CAMILLE, statut: 'fait' }); expect(app.monde.transferts).toEqual([t]); expect(dernierTransfert('d-812', ALEX)).toBe(t); expect(dernierTransfert('d-812', CAMILLE)).toBeUndefined();
    const recu = app.monde.notifications.find((n) => n.compteId === CAMILLE && n.type === 'transfert'); expect(recu?.titre).toBe('Droit de voyage reçu'); expect(recu?.sous).toMatch(/^Alex T\. vous a transféré YUL → CDG\. Nommez le voyageur avant le 13 déc\. 18:05\.$/); expect(recu?.lien).toBe('/droit/d-812');
    const envoye = app.monde.notifications.find((n) => n.compteId === ALEX && n.type === 'transfert'); expect(envoye?.titre).toBe('Droit transféré à Camille T.');
    expect(app.monde.comptes.find((c) => c.id === ALEX)!.proches).toContain(CAMILLE);
  });
  it('l’annonce n’existe plus ; aucun écrit au grand livre sans frais', () => {
    const n = app.monde.ecritures.length; transferer('d-812', ALEX, PAUL); expect(droitDe('d-812')!.annonce).toBeUndefined(); expect(app.monde.ecritures).toHaveLength(n);
  });
  it('en phase d’avertissement le transfert passe, noté et signalé au proche', () => {
    const e = T('2026-12-13T11:20'); expect(etatTransfert('d-812', ALEX, e).avertissement).toBe(true);
    // l'horloge est celle de la démo : on rapproche le départ pour rester dans la phase d'avertissement
    const v = app.monde.vols.find((x) => x.id === 'v-ae812')!; v.jour = '2026-10-13'; v.heureDepart = '11:00';
    const t = transferer('d-812', ALEX, CAMILLE); expect(t.note).toBe('Échéance proche'); expect(app.monde.notifications.find((n) => n.compteId === CAMILLE && n.type === 'transfert')?.sous).toMatch(/Échéance proche : il reste (1 h 59|2 h 00)\./);
  });
  it('refuse : soi-même, destinataire inconnu, inactif ou administrateur', () => {
    expect(code(() => transferer('d-812', ALEX, ALEX))).toBe('soi_meme'); expect(code(() => transferer('d-812', ALEX, 'ACC-9999'))).toBe('destinataire'); expect(code(() => transferer('d-812', ALEX, 'adm-01'))).toBe('destinataire');
    app.monde.comptes.find((c) => c.id === CAMILLE)!.actif = false; expect(code(() => transferer('d-812', ALEX, CAMILLE))).toBe('destinataire'); expect(droitDe('d-812')!.detenteurId).toBe(ALEX); expect(app.monde.transferts).toEqual([]);
  });
  it('refuse : droit d’un autre, en vente, nommé, après l’échéance ; compte expéditeur inactif', () => {
    expect(code(() => transferer('d-812', CAMILLE, PAUL))).toBe('droit'); expect(code(() => transferer('d-hav', ALEX, CAMILLE))).toBe('droit'); expect(code(() => transferer('d-8wc2', CAMILLE, PAUL))).toBe('droit');
    avancerMonde(T('2026-12-13T18:05')); expect(droitDe('d-812')!.statut).toBe('nomme'); expect(code(() => transferer('d-812', ALEX, CAMILLE))).toBe('droit');
    app.monde.comptes.find((c) => c.id === ALEX)!.actif = false; expect(code(() => transferer('d-puj', ALEX, CAMILLE))).toBe('compte');
  });
  it('après l’échéance sans nommage automatique, le code est « echeance »', () => {
    const v = app.monde.vols.find((x) => x.id === 'v-ae812')!; v.jour = '2026-10-12'; v.heureDepart = '12:00'; expect(code(() => transferer('d-812', ALEX, CAMILLE))).toBe('echeance');
  });
  it('un transfert ne peut pas être refait par l’ancien détenteur (pas de double transfert)', () => {
    transferer('d-812', ALEX, CAMILLE); expect(code(() => transferer('d-812', ALEX, PAUL))).toBe('droit'); expect(etatTransfert('d-812', ALEX)).toMatchObject({ ok: false, motif: 'vendu' }); expect(app.monde.transferts).toHaveLength(1);
  });
  it('le nouveau détenteur peut à son tour transférer', () => { transferer('d-812', ALEX, CAMILLE); transferer('d-812', CAMILLE, PAUL); expect(droitDe('d-812')!.chaine.filter((m) => m.type === 'transfert')).toHaveLength(2); expect(droitDe('d-812')!.detenteurId).toBe(PAUL); });
});

describe('inviter un proche sans compte', () => {
  it('enregistre une invitation simulée et marque le proche invité', () => {
    const marc = prochesSansCompte(ALEX)[0]; expect(marc.nom).toBe('Marc T.'); expect(marc.invite).toBeUndefined();
    const inv = inviterProche(' marc@exemple.com ', { compteId: ALEX, procheId: marc.id, nom: 'Marc T.' }); expect(inv).toMatchObject({ courriel: 'marc@exemple.com', compteId: ALEX });
    expect(trancheTransferts().invitations).toEqual([inv]); expect(prochesSansCompte(ALEX)[0]).toMatchObject({ courriel: 'marc@exemple.com', invite: inv.quand });
  });
  it('refuse un courriel invalide, ou déjà celui d’un compte ; rien n’est mis en attente', () => {
    expect(code(() => inviterProche('pas-un-courriel'))).toBe('courriel'); expect(code(() => inviterProche(''))).toBe('courriel'); expect(code(() => inviterProche('alex.tremblay@exemple.test'))).toBe('existe');
    expect(trancheTransferts().invitations).toEqual([]); expect(droitDe('d-812')!.detenteurId).toBe(ALEX);
  });
});

describe('brouillon et formats', () => {
  it('le brouillon appartient à un droit à la fois', () => {
    expect(brouillonDe('d-812')).toBeUndefined(); majBrouillon('d-812', { versId: CAMILLE }); expect(brouillonDe('d-812')).toMatchObject({ droitId: 'd-812', versId: CAMILLE }); expect(brouillonDe('d-puj')).toBeUndefined();
    majBrouillon('d-812', { erreur: { cas: 'reseau', quand: 1 } }); expect(brouillonDe('d-812')).toMatchObject({ versId: CAMILLE, erreur: { cas: 'reseau' } });
    majBrouillon('d-puj', { versId: PAUL }); expect(brouillonDe('d-812')).toBeUndefined(); expect(brouillonDe('d-puj')?.versId).toBe(PAUL); effacerBrouillon(); expect(brouillonDe('d-puj')).toBeUndefined();
  });
  it('formats français : « 13 déc. 18:05 », « 6 h 45 », « 3 j 4 h »', () => {
    expect(jourHeure(T('2026-12-13T18:05'))).toBe('13 déc. 18:05'); expect(jourHeure(T('2027-03-02T07:09'))).toBe('2 mars 07:09');
    expect(delaiHM(6 * 3_600_000 + 45 * 60_000 + 59_000)).toBe('6 h 45'); expect(delaiHM(0)).toBe('0 min'); expect(delaiHM(-5)).toBe('0 min'); expect(delaiHM(45 * 60_000)).toBe('45 min'); expect(delaiHM(3_600_000)).toBe('1 h 00'); expect(delaiHM(51 * 3_600_000)).toBe('2 j 3 h');
  });
});

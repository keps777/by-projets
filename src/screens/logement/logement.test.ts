import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app, reinitialiser } from '../../data/store.svelte.ts';
import { lignesDe, rattraperPaies } from '../../data/paie.ts';
import './demarrage.ts';
import {
  accordBailleur, ajouterPiece, avanceEnCours, blocage, commanderEquipement, dossier, enregistrerCompte, envoyerPourDecision, envoyerSms, majInfos, majSimulation, manques, verifierSms
} from './actions.ts';
import { logement } from './etat.ts';

const pdf = (nom: string) => new File([new Uint8Array(200)], nom, { type: 'application/pdf' });

async function dossierComplet() {
  majInfos({ logement: 'Studio Bonamoussadi', bailleur: 'Jean-Pierre Essomba', entree: '2026-11-01' });
  expect(await ajouterPiece('bail', pdf('bail.pdf'))).toBeNull();
  expect(await ajouterPiece('cni', pdf('cni.pdf'))).toBeNull();
  expect(await ajouterPiece('photos', pdf('p1.pdf'))).toBeNull();
  expect(enregistrerCompte({ type: 'orange', numero: '690123456', telephone: '', titulaire: 'ESSOMBA Jean-Pierre' })).toBe(true);
  await envoyerSms();
  expect(await verifierSms('123456')).toBe('ok');
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-22T10:00:00')); reinitialiser('demo'); });
afterEach(() => vi.useRealTimers());

describe('niveau et compte', () => {
  it('compte vierge : pas de compte, pas d’avance', () => {
    reinitialiser('vierge');
    expect(blocage()).toMatch(/Créez votre compte/);
  });
  it('niveau Start : explique que l’avance s’ouvre au niveau Plus', () => {
    app.score.valeur = 550;
    expect(blocage()).toMatch(/niveau Plus/);
  });
  it('Aïcha (Pro, 742) peut demander ; la tranche démo contient le bail Makepe et 6 loyers payés', () => {
    expect(blocage()).toBeNull();
    const b = logement().bail!;
    expect(b.libelle).toBe('Appartement Makepe'); expect(b.loyers).toHaveLength(6); expect(b.prelevement).toBe(false);
  });
  it('compte vierge : tranche sans bail', () => { reinitialiser('vierge'); expect(logement().bail).toBeNull(); });
});

describe('dossier', () => {
  it('liste ce qui manque, puis plus rien quand tout est fourni', async () => {
    expect(manques(dossier())).toHaveLength(6);
    await dossierComplet();
    expect(manques(logement().dossier)).toEqual([]);
  });
  it('refuse un fichier d’un mauvais format ou trop lourd', async () => {
    dossier();
    expect(await ajouterPiece('bail', new File(['x'], 'a.zip', { type: 'application/zip' }))).toMatch(/Format non accepté/);
    expect(await ajouterPiece('bail', new File([new Uint8Array(11 * 1024 * 1024)], 'gros.pdf', { type: 'application/pdf' }))).toMatch(/trop lourd/);
    expect(logement().dossier!.bail).toBeNull();
  });
  it('un code SMS faux ne vérifie pas le compte ; modifier le compte annule la vérification', async () => {
    dossier();
    enregistrerCompte({ type: 'mtn', numero: '670123456', telephone: '', titulaire: 'Essomba Paul' }); await envoyerSms();
    expect(await verifierSms('000000')).toBe('faux'); expect(logement().dossier!.compte!.verifie).toBe(false);
    expect(await verifierSms('123456')).toBe('ok'); expect(logement().dossier!.compte!.verifie).toBe(true);
    enregistrerCompte({ type: 'mtn', numero: '670123457', telephone: '', titulaire: 'Essomba Paul' });
    expect(logement().dossier!.compte!.verifie).toBe(false);
  });
  it('numéro invalide : compte refusé', () => {
    dossier();
    expect(enregistrerCompte({ type: 'orange', numero: '12345', telephone: '', titulaire: 'Essomba Paul' })).toBe(false);
    expect(enregistrerCompte({ type: 'banque', numero: 'CM21 1234', telephone: '', titulaire: 'Essomba Paul' })).toBe(false);
    expect(logement().dossier!.compte).toBeNull();
  });
});

describe('décision et paiement', () => {
  it('80 000 × 6 sur 10 mois : refusé (33,9 %), le dossier reste en brouillon', async () => {
    await dossierComplet();
    const dec = envoyerPourDecision()!;
    expect(dec.approuve).toBe(false); expect(logement().dossier!.statut).toBe('brouillon');
    expect(accordBailleur()).toBeNull();
  });
  it('sur 12 mois : approuvé, le bailleur accepte, l’avance est versée sans toucher au solde', async () => {
    await dossierComplet();
    majSimulation({ duree: 12 });
    const dec = envoyerPourDecision()!;
    expect(dec.approuve).toBe(true); expect(logement().dossier!.statut).toBe('accord_attendu');
    const solde = app.solde;
    const r = accordBailleur();
    expect(r && 'preuve' in r).toBe(true);
    expect(app.solde).toBe(solde);
    const credit = app.credits.find((c) => c.produit === 'logement')!;
    expect(credit).toMatchObject({ capital: 480_000, duree: 12, payees: 0, statut: 'actif', prochaine: '2026-10-28' });
    expect(app.mouvements[0]).toMatchObject({ montant: -480_000, categorie: 'logement' }); expect(app.mouvements[1].montant).toBe(480_000);
    expect(app.notifications[1].titre).toBe('Avance de loyer versée');
    const l = logement();
    expect(l.dossier).toBeNull(); expect(l.preuves).toHaveLength(1); expect(l.preuves[0].reference).toMatch(/^AL-261022-/);
    expect(l.bail).toMatchObject({ libelle: 'Studio Bonamoussadi', prelevement: true, avanceId: credit.id, loyer: 80_000 });
    expect(avanceEnCours()?.id).toBe(credit.id);
    expect(blocage()).toMatch(/déjà en cours/);
  });
  it('un changement de simulation ou de pièce annule la décision et la demande d’accord', async () => {
    await dossierComplet(); majSimulation({ duree: 12 }); envoyerPourDecision();
    expect(logement().dossier!.statut).toBe('accord_attendu');
    majSimulation({ mois: 3 });
    expect(logement().dossier!.statut).toBe('brouillon'); expect(logement().dossier!.decision).toBeNull();
  });
  it('si les crédits ont augmenté entre-temps, le paiement est refusé au dernier moment', async () => {
    await dossierComplet(); majSimulation({ duree: 12 }); envoyerPourDecision();
    app.credits.push({ id: 'c-x', produit: 'auto', libelle: 'Auto', capital: 1, mensualite: 30_000, duree: 12, payees: 0, prochaine: '2026-10-28', statut: 'actif' });
    const r = accordBailleur();
    expect(r && 'refus' in r).toBe(true); expect(app.credits.filter((c) => c.produit === 'logement')).toHaveLength(0);
  });
});

describe('prélèvements à la paie', () => {
  async function avanceAccordee() {
    await dossierComplet(); majSimulation({ duree: 12 }); envoyerPourDecision(); accordBailleur();
  }
  it('aperçu : loyer + remboursement, sans rien modifier', async () => {
    await avanceAccordee();
    const l = lignesDe('2026-10-28').filter((x) => x.id.startsWith('logement'));
    expect(l).toHaveLength(1); expect(l[0].montant).toBe(80_000 + app.credits.find((c) => c.produit === 'logement')!.mensualite);
    expect(app.credits.find((c) => c.produit === 'logement')!.payees).toBe(0);
  });
  it('deux paies : mensualités, loyers du 1er, +6 points chacun', async () => {
    await avanceAccordee();
    const score = app.score.valeur; const c = app.credits.find((x) => x.produit === 'logement')!;
    expect(rattraperPaies(Date.parse('2026-11-29T10:00:00'))).toBe(2);
    expect(c.payees).toBe(2); expect(c.prochaine).toBe('2026-12-28');
    const b = logement().bail!;
    expect(b.loyers.map((x) => x.mois)).toEqual(['2026-11', '2026-12']); expect(b.prochaine).toBe('2026-12-28');
    expect(app.score.valeur).toBe(score + 12);
    expect(app.mouvements.filter((m) => m.categorie === 'credit' && m.titre.startsWith('Logement'))).toHaveLength(2);
  });
  it('après la dernière mensualité : crédit terminé, puis le loyer seul', async () => {
    await avanceAccordee();
    const c = app.credits.find((x) => x.produit === 'logement')!;
    rattraperPaies(Date.parse('2027-10-29T10:00:00'));
    expect(c.payees).toBe(12); expect(c.statut).toBe('termine');
    const suite = lignesDe('2027-11-28').filter((x) => x.id.startsWith('logement'));
    expect(suite).toHaveLength(1); expect(suite[0].montant).toBe(80_000);
  });
  it('prélèvement reporté : le loyer est garanti, puis régularisé à la paie suivante sans points', async () => {
    await avanceAccordee();
    const c = app.credits.find((x) => x.produit === 'logement')!; const b = logement().bail!;
    const ligne = lignesDe('2026-10-28').find((x) => x.id.startsWith('logement-bail'))!;
    ligne.reporter!();
    expect(b.arrieres).toBe(1); expect(b.loyers[0]).toMatchObject({ mois: '2026-11', statut: 'garanti' }); expect(c.prochaine).toBe('2026-11-28'); expect(c.payees).toBe(0);
    const score = app.score.valeur;
    const suivante = lignesDe('2026-11-28').find((x) => x.id.startsWith('logement-bail'))!;
    expect(suivante.montant).toBe(2 * 80_000 + c.mensualite);
    suivante.appliquer();
    expect(b.arrieres).toBe(0); expect(b.loyers.map((x) => x.statut)).toEqual(['garanti', 'paye']); expect(app.score.valeur).toBe(score + 6); expect(c.payees).toBe(1);
  });
  it('sans bail prélevé (démo), rien n’est ajouté à la paie', () => {
    logement();
    expect(lignesDe('2026-10-28').filter((x) => x.id.startsWith('logement'))).toHaveLength(0);
  });
});

describe('équipement du logement', () => {
  // 3 mois d'avance : il reste de la place sous les 33 % (avec 6 mois sur 12, il n'en reste presque pas).
  async function avanceAccordee() { await dossierComplet(); majSimulation({ mois: 3, duree: 12 }); envoyerPourDecision(); accordBailleur(); }
  it('commande : second crédit logement sur 12 mois, une seule commande par logement', async () => {
    await avanceAccordee();
    const r = commanderEquipement(['frigo']);
    expect(r.ok).toBe(true);
    const eq = app.credits.find((c) => c.id === logement().bail!.equipement!.creditId)!;
    expect(eq).toMatchObject({ produit: 'logement', capital: 185_000, mensualite: 16_961, duree: 12 });
    expect(commanderEquipement(['matelas']).ok).toBe(false); // une seule commande
    expect(app.solde).toBe(86_500);
    expect(lignesDe('2026-10-28').filter((x) => x.id.startsWith('logement-equip'))).toHaveLength(1);
  });
  it('refusée au-dessus de 33 % et sans article', async () => {
    await avanceAccordee();
    const r = commanderEquipement(['frigo', 'matelas', 'solaire']);
    expect(r.ok).toBe(false); expect(!r.ok && r.message).toMatch(/33 %/);
    const v = commanderEquipement([]); expect(!v.ok && v.message).toMatch(/article/);
    expect(logement().bail!.equipement).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app, reinitialiser, totalMensualites } from '../../data/store.svelte.ts';
import { lignesDe, passerPaie } from '../../data/paie.ts';
import { hacher } from '../../core/auth.ts';
import './demarrage.ts';
import { auto, dossierDe, monDossier } from './etat.ts';
import {
  annuler, avancer, basculerPiece, choisirCreneau, choisirVehicule, confirmerLivraison, creneauxProposes, demander, publierVehicule, refuserDossier, releveCsv, reglerBrouillon, signer, supprimerVehicule, statsMois
} from './actions.ts';

async function preparer() {
  reinitialiser('demo');
  vi.setSystemTime(new Date('2026-10-22T10:00:00'));
  app.auth.sel = 'sel-de-test'; app.auth.hash = await hacher('482916', 'sel-de-test');
  auto();
}
const approuver = () => {
  expect(choisirVehicule('v-yaris19')).toBeNull();
  reglerBrouillon({ duree: 48, apport: 1_200_000 });
  const r = demander(); if ('erreur' in r) throw new Error(r.erreur);
  return r.dossier;
};
const TRACE = 'M10 10 L 50 50 L 90 20 L 120 60 L 150 30 L 190 70';

beforeEach(async () => { vi.useFakeTimers({ toFake: ['Date'] }); await preparer(); });
afterEach(() => vi.useRealTimers());

describe('décision de crédit auto (compte démo)', () => {
  it('Yaris 36 mois / 500 000 : refusée à 40 % à cause du crédit scolaire', () => {
    choisirVehicule('v-yaris19');
    expect(auto().brouillon).toMatchObject({ apport: 500_000, duree: 36, assurance: 'tous_risques' });
    const r = demander();
    expect('dossier' in r && r.dossier.etape).toBe('refusee');
    const d = monDossier()!;
    expect(d.motifRefus).toContain('40 % du salaire');
    expect(d.mensualite).toBe(162_610);
    expect(app.credits.filter((c) => c.produit === 'auto')).toHaveLength(0);
    expect(app.notifications[0].titre).toBe('Crédit auto refusé');
  });
  it('Yaris 48 mois / 1,2 M d’apport : approuvée, pièces transmises, offre de 7 jours', () => {
    const d = approuver();
    expect(d.etape).toBe('nouvelle');
    expect(d.mensualite).toBe(114_937);
    expect(d.financement).toBe(3_300_000);
    expect(d.docs).toEqual([true, true, true]);
    expect(d.offreJusqua).toBe('2026-10-29');
    expect(d.decision?.controles.map((c) => c.ok)).toEqual([true, true, true, true]);
  });
  it('une nouvelle demande remplace le dossier non signé au lieu d’en ajouter un', () => {
    choisirVehicule('v-yaris19'); demander();
    approuver();
    expect(auto().dossiers.filter((x) => x.membre)).toHaveLength(1);
  });
  it('refuse en dessous de l’apport minimum (Tucson 8,8 M) et au-delà du coffre', () => {
    choisirVehicule('v-tucson18');
    const b = auto().brouillon!;
    expect(b.apport).toBe(2_800_000);
    const r = demander();
    expect('erreur' in r && r.erreur).toContain('coffre voiture');
    reglerBrouillon({ apport: 100_000 });
    expect('erreur' in demander()).toBe(true);
  });
  it('niveau insuffisant : pas de crédit auto', () => {
    app.score.valeur = 650;
    expect('erreur' in demander()).toBe(true);
    choisirVehicule('v-yaris19');
    expect((demander() as { erreur: string }).erreur).toContain('niveau Pro');
  });
  it('véhicule non contrôlé : refusé avec ce motif', () => {
    auto().vehicules.find((v) => v.id === 'v-yaris19')!.controle = false;
    approuverSansControle();
    expect(monDossier()!.motifRefus).toContain('non contrôlé');
  });
});
function approuverSansControle() {
  choisirVehicule('v-yaris19'); reglerBrouillon({ duree: 48, apport: 1_200_000 }); demander();
}

describe('signature', () => {
  it('code faux : refus et compteur d’échecs ; bon code : crédit enregistré, apport pris au coffre', async () => {
    approuver();
    expect(await signer(TRACE, '000000')).toBe('Code incorrect.');
    expect(app.auth.verrou.echecs).toBe(1);
    expect(await signer('', '482916')).toContain('Signez');
    expect(await signer(TRACE, '482916')).toBeNull();
    expect(app.auth.verrou.echecs).toBe(0);
    const c = app.credits.find((x) => x.produit === 'auto')!;
    expect(c).toMatchObject({ capital: 3_300_000, mensualite: 114_937, duree: 48, payees: 0, prochaine: '2026-11-28', statut: 'actif', libelle: 'Auto · Toyota Yaris 2019' });
    expect(auto().coffreVoiture).toBe(0);
    expect(monDossier()!.signeLe).not.toBeNull();
    expect(totalMensualites()).toBe(44_000 + 114_937);
    expect(await signer(TRACE, '482916')).toContain('déjà signé');
  });
  it('3 échecs verrouillent', async () => {
    approuver();
    for (let i = 0; i < 3; i++) await signer(TRACE, '111111');
    expect(await signer(TRACE, '482916')).toContain("Trop d'essais");
  });
  it('l’offre expirée ne se signe plus', async () => {
    approuver();
    vi.setSystemTime(new Date('2026-10-31T10:00:00'));
    expect(await signer(TRACE, '482916')).toContain('expiré');
  });
  it('revérifie les 33 % : un autre crédit pris entre-temps fait échouer la signature', async () => {
    approuver();
    app.credits.push({ id: 'c-x', produit: 'logement', libelle: 'x', capital: 1, mensualite: 30_000, duree: 12, payees: 0, prochaine: '2026-11-28', statut: 'actif' });
    expect(await signer(TRACE, '482916')).toContain('situation a changé');
    expect(app.credits.some((c) => c.produit === 'auto')).toBe(false);
    expect(auto().coffreVoiture).toBe(1_200_000);
  });
});

describe('livraison et paie', () => {
  async function jusquaLaSignature() { const d = approuver(); expect(await signer(TRACE, '482916')).toBeNull(); return d; }
  it('rien n’est prélevé avant la remise des clés, puis une mensualité par paie', async () => {
    const d = await jusquaLaSignature();
    expect(lignesDe('2026-11-28').filter((l) => l.id.startsWith('c-auto'))).toHaveLength(0);
    expect(confirmerLivraison(d.id)).toContain('accordée');
    expect('ok' in avancer(d.id)).toBe(true); // en étude
    expect('ok' in avancer(d.id)).toBe(true); // accordée
    expect(choisirCreneau(creneauxProposes()[0])).toBeNull();
    expect(confirmerLivraison(d.id)).toBeNull();
    expect(d.etape).toBe('livree');
    expect(auto().vehicules.find((v) => v.id === 'v-yaris19')).toMatchObject({ vendu: true, publie: false });
    const credit = app.credits.find((c) => c.produit === 'auto')!;
    expect(credit.prochaine).toBe('2026-11-28');
    expect(lignesDe('2026-10-28').filter((l) => l.id === credit.id)).toHaveLength(0);
    const ligne = lignesDe('2026-11-28').find((l) => l.id === credit.id)!;
    expect(ligne).toMatchObject({ montant: 114_937, libelle: 'Mensualité auto 1 / 48' });
    app.solde = 500_000;
    passerPaie('2026-11-28');
    expect(credit.payees).toBe(1);
    expect(credit.prochaine).toBe('2026-12-28');
    expect(app.mouvements.some((m) => m.titre === 'Mensualité auto 1 / 48' && m.montant === -114_937)).toBe(true);
  });
  it('solde insuffisant : la mensualité est reportée d’un mois, sans être prélevée', async () => {
    const d = await jusquaLaSignature();
    avancer(d.id); avancer(d.id); confirmerLivraison(d.id);
    const credit = app.credits.find((c) => c.produit === 'auto')!;
    app.solde = -520_000 + 50_000; // après le salaire il reste 50 000 : trop peu
    passerPaie('2026-11-28');
    expect(credit.payees).toBe(0);
    expect(credit.prochaine).toBe('2026-12-28');
  });
  it('la dernière mensualité solde le crédit', async () => {
    const d = await jusquaLaSignature();
    avancer(d.id); avancer(d.id); confirmerLivraison(d.id);
    const credit = app.credits.find((c) => c.produit === 'auto')!;
    credit.payees = 47; credit.prochaine = '2026-11-28'; app.solde = 1_000_000;
    passerPaie('2026-11-28');
    expect(credit.statut).toBe('termine');
  });
  it('la concession ne livre pas un contrat non signé', () => {
    const d = approuver();
    avancer(d.id); avancer(d.id);
    expect(confirmerLivraison(d.id)).toContain('signer');
  });
  it('rétractation : le crédit disparaît et l’apport revient au coffre', async () => {
    const d = await jusquaLaSignature();
    expect(annuler(d.id)).toBeNull();
    expect(d.etape).toBe('annulee');
    expect(app.credits.some((c) => c.produit === 'auto')).toBe(false);
    expect(auto().coffreVoiture).toBe(1_200_000);
    expect(monDossier()).toBeUndefined();
    expect(annuler(d.id)).toContain('plus être annulé');
  });
  it('refus du concessionnaire après signature : mêmes remboursements, le membre est prévenu', async () => {
    const d = await jusquaLaSignature();
    expect(refuserDossier(d.id)).toBeNull();
    expect(d.etape).toBe('refusee');
    expect(auto().coffreVoiture).toBe(1_200_000);
    expect(app.credits.some((c) => c.produit === 'auto')).toBe(false);
    expect(app.notifications[0].titre).toContain('refusé');
  });
});

describe('portail concessionnaire', () => {
  it('exemples de démo : 7 dossiers répartis dans les 4 colonnes, 5 ventes en octobre', () => {
    const t = auto();
    expect(['nouvelle', 'etude', 'accordee', 'livree'].map((e) => t.dossiers.filter((d) => d.etape === e).length)).toEqual([2, 2, 1, 2]);
    expect(statsMois()).toEqual({ ventes: 5, montant: 31_400_000 });
  });
  it('les règles de transition s’appliquent aux dossiers d’exemple', () => {
    expect(avancer('d-ex3')).toEqual({ erreur: 'Il manque des pièces au dossier.' });
    basculerPiece('d-ex3', 1); basculerPiece('d-ex3', 2);
    expect(avancer('d-ex3')).toEqual({ ok: 'Financement accordé à Paul' });
    expect(dossierDe('d-ex3')!.etape).toBe('accordee');
    expect(refuserDossier('d-ex3')).toContain('plus être refusé');
    expect(avancer('d-ex6')).toEqual({ erreur: 'Cette demande est terminée.' });
  });
  it('livrer un dossier d’exemple signé compte une vente de plus', () => {
    const r = avancer('d-ex5');
    expect(r).toEqual({ ok: 'Livraison confirmée : AssureMe vous paie 9 200 000 FCFA' });
    expect(statsMois()).toEqual({ ventes: 6, montant: 40_600_000 });
    expect(releveCsv().split('\n')).toHaveLength(1 + 3);
  });
  it('publier un véhicule : validation puis ajout en tête du stock', () => {
    const base = { titre: 'Toyota Corolla', annee: '2018', prix: '5 000 000', type: 'voiture' as const, etat: 'occasion' as const, controle: true };
    expect(publierVehicule({ ...base, titre: ' ' })).toContain('marque');
    expect(publierVehicule({ ...base, annee: '18' })).toContain('année');
    expect(publierVehicule({ ...base, annee: '2099' })).toContain('année');
    expect(publierVehicule({ ...base, prix: '' })).toContain('prix');
    const n = auto().vehicules.length;
    expect(publierVehicule(base)).toBeNull();
    expect(auto().vehicules).toHaveLength(n + 1);
    expect(auto().vehicules[0]).toMatchObject({ titre: 'Toyota Corolla 2018', prix: 5_000_000, publie: true, controle: true });
  });
  it('on ne retire pas un véhicule qui a un dossier en cours', () => {
    expect(supprimerVehicule('v-corolla17')).toContain('dossier');
    expect(supprimerVehicule('v-yaris19')).toBeNull();
  });
  it('compte vierge : tranche d’exemples pour le portail, coffre voiture vide', () => {
    reinitialiser('vierge'); delete app.tranches['auto'];
    const t = auto();
    expect(t.coffreVoiture).toBe(0);
    expect(t.signatureEnregistree).toBeNull();
    expect(t.dossiers.length).toBe(7);
  });
});

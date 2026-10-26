import { beforeEach, describe, expect, it } from 'vitest';
import { app, maintenant } from '../data/store.svelte.ts';
import { etatInitial } from '../data/seed.ts';
import { annoncesDuVol, cumuler, carnetDuVol, ecartCarnet, transactionsDuVol } from './carnet.ts';
import { droitDe } from './marche.ts';
import { accepterRachat, annulerOrdre, blocageDe, ErreurRevente, executerOrdres, expirationOrdre, mettreEnVente, modifierAnnonce, offreDeRachat, placerOrdre, prixRachat, retirerAnnonce, retirerProposition } from './revente.ts';

beforeEach(() => { for (const k of Object.keys(app)) delete (app as unknown as Record<string, unknown>)[k]; Object.assign(app, etatInitial()); });
const ALEX = 'ACC-0412', CAMILLE = 'ACC-0187', SOPHIE = 'ACC-0301';
const code = (f: () => unknown): string | undefined => { try { f(); } catch (e) { return e instanceof ErreurRevente ? e.code : 'autre'; } return undefined; };

describe('mettre en vente', () => {
  it('met un droit détenu en vente, au plafond au plus', () => {
    const d = mettreEnVente('d-812', ALEX, 1640); expect(d.statut).toBe('en_vente'); expect(d.annonce?.prix).toBe(1640);
    expect(app.monde.notifications.some((n) => n.compteId === ALEX && n.titre.startsWith('En vente à'))).toBe(false); // préférence « l’essentiel »
    expect(mettreEnVente('d-puj', ALEX, 940).annonce?.prix).toBe(940);
  });
  it('refuse 0, un prix au-dessus du plafond, un droit déjà en vente, nommé, gelé, ou qui n’est pas le sien', () => {
    expect(code(() => mettreEnVente('d-812', ALEX, 0))).toBe('prix'); expect(code(() => mettreEnVente('d-812', ALEX, 2001))).toBe('plafond');
    expect(code(() => mettreEnVente('d-hav', ALEX, 600))).toBe('statut'); expect(code(() => mettreEnVente('d-8wc2', CAMILLE, 900))).toBe('statut');
    expect(code(() => mettreEnVente('d-gele', 'ACC-0402', 500))).toBe('gele'); expect(code(() => mettreEnVente('d-812', CAMILLE, 900))).toBe('droit');
    expect(droitDe('d-812')!.statut).toBe('detenu');
  });
  it('refuse après l’échéance J-1', () => {
    const v = app.monde.vols.find((x) => x.id === 'v-ae812')!; v.jour = '2026-10-12'; v.heureDepart = '20:00';
    expect(code(() => mettreEnVente('d-812', ALEX, 1500))).toBe('echeance'); expect(blocageDe('d-812', ALEX)).toBe('echeance');
  });
  it('explique pourquoi un droit ne peut pas être revendu', () => {
    expect(blocageDe('d-812', ALEX)).toBeUndefined(); expect(blocageDe('d-hav', ALEX)).toBeUndefined(); expect(blocageDe('d-8wc2', CAMILLE)).toBe('nomme');
    expect(blocageDe('d-gele', 'ACC-0402')).toBe('gele'); expect(blocageDe('d-812', CAMILLE)).toBe('autre'); expect(blocageDe('zzz', ALEX)).toBe('introuvable');
  });
  it('modifie puis retire l’annonce', () => {
    expect(modifierAnnonce('d-hav', ALEX, 600).annonce?.prix).toBe(600); expect(code(() => modifierAnnonce('d-hav', ALEX, 651))).toBe('plafond');
    expect(code(() => modifierAnnonce('d-812', ALEX, 1000))).toBe('statut');
    const d = retirerAnnonce('d-hav', ALEX); expect(d.statut).toBe('detenu'); expect(d.annonce).toBeUndefined(); expect(code(() => retirerAnnonce('d-hav', ALEX))).toBe('statut');
  });
});

describe('rachat par NexG-TT', () => {
  it('offre ferme : 64 % du prix équivalent (hypothèse), arrondie à 10 $', () => {
    expect(prixRachat(2000)).toBe(1280); expect(offreDeRachat('d-812')).toMatchObject({ prix: 1280, net: 1280 }); expect(offreDeRachat('d-hav')?.prix).toBe(420);
    expect(offreDeRachat('d-8wc2')).toBeUndefined(); expect(offreDeRachat('d-gele')).toBeUndefined();
  });
  it('accepter : le droit passe à rachete, chaîne « rachat », versement sur le solde, annonce retirée', () => {
    const avant = app.monde.comptes.find((c) => c.id === ALEX)!.solde, nb = app.monde.ecritures.length;
    const r = accepterRachat('d-812', ALEX, 1280); expect(r.prix).toBe(1280);
    const d = droitDe('d-812')!; expect(d.statut).toBe('rachete'); expect(d.chaine.at(-1)).toMatchObject({ type: 'rachat', de: ALEX, vers: 'nexgtt', prix: 1280 });
    expect(app.monde.comptes.find((c) => c.id === ALEX)!.solde).toBe(avant + 1280); expect(app.monde.ecritures.length).toBe(nb + 1); expect(app.monde.ecritures.at(-1)).toMatchObject({ type: 'rachat', montant: 1280, droitId: 'd-812' });
    expect(app.monde.notifications.some((n) => n.compteId === ALEX && n.titre.startsWith('Rachat accepté'))).toBe(true);
    accepterRachat('d-hav', ALEX); expect(droitDe('d-hav')!.annonce).toBeUndefined();
    expect(code(() => accepterRachat('d-812', ALEX))).toBe('droit');
  });
  it('refuse une offre qui a changé, ou le droit d’autrui', () => {
    expect(code(() => accepterRachat('d-812', ALEX, 1300))).toBe('rachat'); expect(code(() => accepterRachat('d-812', CAMILLE))).toBe('droit'); expect(droitDe('d-812')!.statut).toBe('detenu');
  });
});

describe('ordres à cours limité', () => {
  it('place un ordre qui attend, et valide seuil et plafond', () => {
    const o = placerOrdre(CAMILLE, 'v-ae816', 1400, 'semaine'); expect(o).toMatchObject({ statut: 'actif', limite: 1400, compteId: CAMILLE });
    expect(code(() => placerOrdre(CAMILLE, 'v-ae816', 2060, 'jour'))).toBe('plafond'); expect(code(() => placerOrdre(CAMILLE, 'v-ae816', 1405, 'jour'))).toBe('prix'); expect(code(() => placerOrdre(CAMILLE, 'v-ae816', 0, 'jour'))).toBe('prix');
    expect(code(() => placerOrdre('ACC-9999', 'v-ae816', 1400, 'jour'))).toBe('compte');
  });
  it('un seuil au niveau d’une revente achète tout de suite, la moins chère, via acheter()', () => {
    const o = placerOrdre(CAMILLE, 'v-ae816', 1520, 'jour'); expect(o.statut).toBe('execute'); const d = droitDe(o.droitId!)!;
    expect(d).toMatchObject({ id: 'd-r816', detenteurId: CAMILLE, prixPaye: 1500, statut: 'detenu' }); expect(d.chaine.at(-1)!.type).toBe('revente');
  });
  it('une nouvelle annonce ou un nouveau prix à la baisse déclenche l’exécution (ordre d’Alex à 1 450 $)', () => {
    expect(app.monde.ordres[0]).toMatchObject({ id: 'o-1', statut: 'actif' });
    modifierAnnonce('d-r816', SOPHIE, 1440); const o = app.monde.ordres[0]!; expect(o.statut).toBe('execute'); expect(droitDe('d-r816')).toMatchObject({ detenteurId: ALEX, prixPaye: 1440 });
    expect(executerOrdres()).toEqual([]);
  });
  it('ne rachète jamais sa propre annonce et reste actif', () => {
    const o = placerOrdre(ALEX, 'v-ae812', 1800, 'jour'); mettreEnVente('d-812', ALEX, 1700); expect(app.monde.ordres.find((x) => x.id === o.id)!.statut).toBe('actif'); expect(droitDe('d-812')!.detenteurId).toBe(ALEX);
  });
  it('expire à la date de validité', () => {
    const o = placerOrdre(CAMILLE, 'v-ae816', 1400, 'jour'); app.monde.ordres.find((x) => x.id === o.id)!.creeLe = maintenant() - 2 * 86_400_000;
    executerOrdres(); expect(app.monde.ordres.find((x) => x.id === o.id)!.statut).toBe('expire');
    expect(expirationOrdre('depart', 0, app.monde.vols.find((v) => v.id === 'v-ae816')!)).toBe(Date.parse('2026-12-16T18:05'));
  });
  it('annule un ordre actif, une seule fois', () => {
    expect(annulerOrdre('o-1', ALEX).statut).toBe('annule'); expect(code(() => annulerOrdre('o-1', ALEX))).toBe('ordre'); expect(code(() => annulerOrdre('o-1', CAMILLE))).toBe('ordre');
  });
});

describe('carnet d’ordres', () => {
  it('regroupe et cumule du meilleur prix vers le moins bon', () => {
    expect(cumuler([{ prix: 1700, qte: 1 }, { prix: 1520, qte: 1 }, { prix: 1520, qte: 1 }, { prix: 1500, qte: 1 }], 'vente')).toEqual([{ prix: 1500, qte: 1, cumul: 1 }, { prix: 1520, qte: 2, cumul: 3 }, { prix: 1700, qte: 1, cumul: 4 }]);
    expect(cumuler([{ prix: 1350, qte: 4 }, { prix: 1420, qte: 3 }, { prix: 1400, qte: 2 }], 'achat').map((n) => [n.prix, n.cumul])).toEqual([[1420, 3], [1400, 5], [1350, 9]]);
    expect(cumuler([], 'vente')).toEqual([]);
  });
  it('écart entre meilleure offre et meilleure demande', () => { expect(ecartCarnet(1500, 1420)).toEqual({ abs: 80, pct: 5.3 }); expect(ecartCarnet(1500, undefined)).toBeUndefined(); });
  it('lit offres, ordres et intentions du monde simulé', () => {
    const c = carnetDuVol('v-ae816'); expect(c.offres.map((n) => [n.prix, n.cumul])).toEqual([[1500, 1], [1520, 2], [1610, 3], [1700, 4]]);
    expect(c.demandes.map((n) => [n.prix, n.cumul])).toEqual([[1450, 1], [1300, 2]]); expect(c.meilleureOffre).toBe(1500); expect(c.meilleureDemande).toBe(1450); expect(c.ecart).toEqual({ abs: 50, pct: 3.3 });
    expect(annoncesDuVol('v-ae816', 'd-r816')).toEqual([1520, 1610, 1700]); expect(carnetDuVol('v-inconnu')).toEqual({ offres: [], demandes: [] });
  });
  it('compte les annulations et les exécutions', () => { annulerOrdre('o-1', ALEX); expect(carnetDuVol('v-ae816').demandes.map((n) => n.prix)).toEqual([1300]); });
  it('dernières transactions depuis les chaînes de détention, avec variation', () => {
    const t = transactionsDuVol('v-ae410'); expect(t.map((x) => [x.prix, x.variation])).toEqual([[1850, 50], [1800, undefined]]); expect(transactionsDuVol('v-ae816')).toEqual([]);
  });
});

describe('retirer une proposition', () => {
  it('retire la proposition du vendeur et garde son billet', () => {
    retirerProposition(SOPHIE, 'INT-4F7K', 'p-1'); expect(app.monde.intentions[0]!.propositions.map((p) => p.id)).toEqual(['p-2', 'p-3']); expect(droitDe('d-r816')!.statut).toBe('en_vente');
    expect(code(() => retirerProposition(SOPHIE, 'INT-4F7K', 'p-2'))).toBe('proposition');
  });
});

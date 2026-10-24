import { beforeEach, describe, expect, it } from 'vitest';
import { app, reinitialiser } from '../../data/store.svelte.ts';
import { planSieges } from '../../core/sieges.ts';
import { ajouterJours } from '../../core/dates.ts';
import { remboursement } from '../../core/tarif.ts';
import { placesRestantes } from '../../core/covoit.ts';
import { annulerBillet, billetsDe, connecter, creerColis, minutesAvant, placesLibres, reserver, siegesIndisponibles } from '../../domain/actions.ts';
import { bonsDisponibles, preparerFidelite, utiliserPoints } from '../entree/actions.ts';
import { crediterCagnotte } from '../route/actions.ts';
import { cagnotteDe } from '../route/etat.ts';
import { brouillonVide, cagnotte, etat } from './etat.ts';
import {
  ajouterParticipantDemo, bloquerPourGuichet, billetsDuPaiement, choisirTaille, confirmerPaiement, lancerPaiement, libererReservation, maPart, montantBrouillon, nbPayes, partagerBillet, partagerCagnotte,
  partCagnotte, paiementActif, paiementDe, payerPartCagnotte, purgerBrouillonTermine, recommencerCagnotte, refuserPaiement, remiseDe, reprendreColis, reprendrePaiement, reserverCovoit, reglerCovoit, siegesRetenus, totalBillets, verifierCagnotte
} from './actions.ts';

const demain = () => new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
const unDepart = () => app.monde.departs.find((d) => d.statut === 'prevu' && d.capacite === 50 && d.jour >= demain())!;
const libres = (d: ReturnType<typeof unDepart>, n: number, apres = 4) => planSieges('Classique', d.capacite).map((x) => x.id).filter((id) => !siegesIndisponibles(d).has(id) && !/^1/.test(id)).slice(apres, apres + n);
function brouillon(n = 2) {
  const d = unDepart(), sieges = libres(d, n);
  const b = brouillonVide({ departId: d.id, sieges, passagers: sieges.map((_, i) => ({ nom: `Voyageur ${i}`, tel: '690000000' })), tel: '691221008' });
  etat().brouillon = b; return { d, b: etat().brouillon! };
}

describe('tunnel billet', () => {
  beforeEach(() => { reinitialiser(); connecter('p-aicha'); });
  it('lancer le paiement réserve (attente 10 min) ; relancer avec un autre moyen reprend la même réservation', () => {
    const { d, b } = brouillon(); const avant = placesLibres(d);
    lancerPaiement(b, 'p-aicha'); const p = paiementDe(b)!;
    expect(p.statut).toBe('attente'); expect(p.moyen).toBe('momo'); expect(placesLibres(d)).toBe(avant - 2); expect(montantBrouillon(b)).toBe(p.montant);
    b.moyen = 'om'; lancerPaiement(b, 'p-aicha'); expect(paiementDe(b)!.id).toBe(p.id); expect(p.moyen).toBe('om'); expect(app.monde.paiements.filter((x) => x.statut === 'attente')).toHaveLength(1);
    expect(siegesRetenus(b)).toEqual(b.sieges);
  });
  it('confirmer : billets valides, visibles chez Aïcha, notification', () => {
    const { b } = brouillon(); lancerPaiement(b, 'p-aicha'); const r = confirmerPaiement(b);
    expect(r.ok).toBe(true); const bs = billetsDuPaiement(r.paiement!.id); expect(bs.every((x) => x.statut === 'valide')).toBe(true);
    expect(billetsDe('p-aicha').filter((x) => bs.some((y) => y.id === x.id))).toHaveLength(2); expect(app.monde.notifications[0].titre).toBe('Billet confirmé');
    purgerBrouillonTermine(); expect(etat().brouillon).toBeNull();
  });
  it('refus : places toujours retenues jusqu’à l’échéance d’origine, puis réessai avec un autre moyen', () => {
    const { d, b } = brouillon(); lancerPaiement(b, 'p-aicha'); const p1 = paiementDe(b)!, echeance = p1.expireLe!, avant = placesLibres(d);
    refuserPaiement(b, 'Solde insuffisant');
    expect(p1.statut).toBe('refuse'); expect(p1.motif).toBe('Solde insuffisant'); expect(b.refus).toMatchObject({ motif: 'Solde insuffisant', moyen: 'momo', paiementId: p1.id });
    const p2 = paiementDe(b)!; expect(p2.id).not.toBe(p1.id); expect(p2.statut).toBe('attente'); expect(p2.expireLe).toBe(echeance); expect(placesLibres(d)).toBe(avant);
    b.moyen = 'om'; lancerPaiement(b, 'p-aicha'); expect(paiementDe(b)!.id).toBe(p2.id); expect(b.refus).toBeNull(); expect(confirmerPaiement(b).ok).toBe(true);
  });
  it('refus après l’échéance : les places sont libérées', () => {
    const { d, b } = brouillon(); const avant = placesLibres(d); lancerPaiement(b, 'p-aicha'); paiementDe(b)!.expireLe = 1;
    refuserPaiement(b, 'Réservation expirée'); expect(paiementDe(b)).toBeUndefined(); expect(placesLibres(d)).toBe(avant + 0);
    expect(siegesIndisponibles(d).has(b.sieges[0])).toBe(false);
  });
  it('un siège pris entre-temps lève siege_pris ; modifier les places libère l’ancienne réservation', () => {
    const { d, b } = brouillon(1); lancerPaiement(b, 'p-aicha');
    b.sieges = libres(d, 1, 12).filter((s) => s !== b.sieges[0]); b.passagers = [{ nom: 'X Y', tel: '690000000' }]; lancerPaiement(b, 'p-aicha');
    expect(app.monde.paiements.filter((p) => p.statut === 'attente')).toHaveLength(1); expect(siegesIndisponibles(d).has(b.sieges[0])).toBe(true);
    const autre = brouillonVide({ departId: d.id, sieges: [b.sieges[0]], passagers: [{ nom: 'Z', tel: '1' }] });
    expect(() => lancerPaiement(autre, 'p-aicha')).toThrow('siege_pris');
  });
  it('abandon : places libérées', () => {
    const { d, b } = brouillon(); const avant = placesLibres(d); lancerPaiement(b, 'p-aicha'); libererReservation(b); expect(placesLibres(d)).toBe(avant); expect(b.paiementId).toBeNull();
  });
  it('payer au guichet : places bloquées 2 h en espèces', () => {
    const { d, b } = brouillon(); lancerPaiement(b, 'p-aicha'); refuserPaiement(b, 'Solde insuffisant'); const avant = placesLibres(d);
    const bs = bloquerPourGuichet(b, 'p-aicha'); const p = paiementDe(b)!;
    expect(p.moyen).toBe('especes'); expect(paiementActif(p)).toBe(true); expect(p.expireLe! - Date.now()).toBeGreaterThan(110 * 60_000);
    expect(bs.every((x) => x.statut === 'attente_paiement')).toBe(true); expect(placesLibres(d)).toBe(avant);
  });
  it('un proche paie : le billet est au nom du proche, acheté par Aïcha, moyen « proche »', () => {
    const { b } = brouillon(1); b.qui = 'paie_pour'; b.proche = { id: 'p-maman', nom: 'Marie', tel: '677000111' }; b.passagers[0] = { nom: 'Marie Ndiba', tel: '677000111' };
    lancerPaiement(b, 'p-aicha'); const p = paiementDe(b)!; expect(p.moyen).toBe('proche'); expect(p.payeurId).toBe('p-aicha');
    confirmerPaiement(b); const bs = billetsDuPaiement(p.id); expect(bs[0].passager.nom).toBe('Marie Ndiba'); expect(bs[0].acheteurId).toBe('p-aicha');
    expect(billetsDe('p-maman').some((x) => x.id === bs[0].id)).toBe(true); expect(etat().partages[0].texte).toContain('a payé ton billet'); expect(app.monde.notifications.some((n) => n.destId === 'p-maman' && n.titre === 'Message AfriMove')).toBe(true);
  });
  it('un proche règle pour moi : acheteur = proche, passagère = Aïcha', () => {
    const { b } = brouillon(1); b.qui = 'demande'; b.proche = { id: 'p-paul', nom: 'Paul', tel: '699000222' }; b.passagers[0] = { nom: 'Aïcha Ndiba', tel: '691221008' };
    lancerPaiement(b, 'p-paul'); const p = paiementDe(b)!; expect(p.payeurId).toBe('p-paul'); confirmerPaiement(b);
    expect(billetsDe('p-aicha').some((x) => x.paiementId === p.id)).toBe(true); expect(app.monde.notifications.some((n) => n.destId === 'p-aicha' && n.titre === 'Paul a payé ton billet')).toBe(true);
  });
  it('totaux : supplément de la première rangée en Classique', () => {
    const d = unDepart(); expect(totalBillets(d.id, ['1B', '5A'])).toBe(d.prix * 2 + 1500);
  });
});

describe('annulation et remboursement', () => {
  beforeEach(() => { reinitialiser(); connecter('p-aicha'); });
  it('l’aperçu de l’écran suit exactement ce que rend annulerBillet', () => {
    const b = billetsDe('p-aicha')[0], d = app.monde.departs.find((x) => x.id === b.departId)!;
    const apercu = remboursement(b.prix, minutesAvant(d)); const r = annulerBillet(b.id); expect(r.rembourse).toBe(apercu.rembourse); expect(r.frais).toBe(apercu.frais); expect(b.statut).toBe('rembourse');
  });
});

describe('covoiturage', () => {
  beforeEach(() => { reinitialiser(); connecter('p-aicha'); });
  it('réserver : places décrémentées, paiement covoit en attente ; régler : confirmé et conducteur prévenu', () => {
    const o = app.monde.covoits[0], avant = placesRestantes(o); const { paiement } = reserverCovoit(o.id, 2, 'p-aicha', 'momo');
    expect(placesRestantes(o)).toBe(avant - 2); expect(paiement).toMatchObject({ statut: 'attente', montant: o.prix * 2, pour: { type: 'covoit', ids: [o.id] } }); expect(o.reservations[0]).toMatchObject({ voyageurId: 'p-aicha', places: 2 });
    reglerCovoit(paiement.id, { ok: true }); expect(paiement.statut).toBe('ok'); expect(placesRestantes(o)).toBe(avant - 2); expect(o.places).toBe(avant); // la capacité de l'offre ne bouge pas
    expect(app.monde.notifications.some((n) => n.destId === o.conducteurId && n.titre === 'Nouvelle réservation')).toBe(true);
  });
  it('refus ou expiration : les places retournent à l’offre', () => {
    const o = app.monde.covoits[1], avant = placesRestantes(o); const a = reserverCovoit(o.id, 1, 'p-aicha', 'om'); reglerCovoit(a.paiement.id, { refus: 'Solde insuffisant' });
    expect(a.paiement.statut).toBe('refuse'); expect(placesRestantes(o)).toBe(avant); expect(o.reservations).toHaveLength(0);
    const c = reserverCovoit(o.id, 1, 'p-aicha', 'om'); c.paiement.expireLe = 1; reglerCovoit(c.paiement.id, { ok: true }); expect(c.paiement.motif).toBe('Réservation expirée'); expect(placesRestantes(o)).toBe(avant);
  });
  it('refuse trop de places, zéro place et une offre fermée', () => {
    const o = app.monde.covoits[0];
    expect(() => reserverCovoit(o.id, o.places + 1, 'p-aicha', 'momo')).toThrow('complet'); expect(() => reserverCovoit(o.id, 0, 'p-aicha', 'momo')).toThrow('demande_invalide');
    expect(() => reserverCovoit('inconnue', 1, 'p-aicha', 'momo')).toThrow('offre_inconnue'); o.statut = 'annulee'; expect(() => reserverCovoit(o.id, 1, 'p-aicha', 'momo')).toThrow('offre_fermee');
  });
  it('par le tunnel : brouillon covoit, refus puis nouvelle réservation', () => {
    const o = app.monde.covoits[0], avant = placesRestantes(o); const b = brouillonVide({ nature: 'covoit', covoitId: o.id, places: 2 }); etat().brouillon = b;
    const e = etat().brouillon!; lancerPaiement(e, 'p-aicha'); expect(placesRestantes(o)).toBe(avant - 2); expect(montantBrouillon(e)).toBe(o.prix * 2);
    refuserPaiement(e, 'Solde insuffisant'); expect(placesRestantes(o)).toBe(avant); expect(e.paiementId).toBeNull(); lancerPaiement(e, 'p-aicha'); expect(confirmerPaiement(e).ok).toBe(true);
  });
});

describe('cagnotte bus entier', () => {
  beforeEach(() => { reinitialiser(); connecter('p-aicha'); });
  it('état initial et tarif', () => { const c = cagnotte(); expect(c).toMatchObject({ taille: 50, statut: 'brouillon' }); expect(partCagnotte(c)).toBe(5200); });
  it('la taille se change tant que personne n’a payé, puis se verrouille', () => {
    expect(choisirTaille(30)).toBe(true); expect(partCagnotte(cagnotte())).toBe(6000); partagerCagnotte(); expect(payerPartCagnotte()).toBe(true); expect(choisirTaille(70)).toBe(false); expect(cagnotte().taille).toBe(30);
  });
  it('partager ouvre la cagnotte et donne un lien ; payer sa part une seule fois', () => {
    const m = partagerCagnotte(); const c = cagnotte(); expect(c.statut).toBe('ouverte'); expect(c.lien).toMatch(/^afrimove\.app\/g\//); expect(m).toContain(c.lien);
    expect(payerPartCagnotte()).toBe(true); expect(payerPartCagnotte()).toBe(false); expect(maPart(c)!.paye).toBe(true); expect(nbPayes(c)).toBe(1);
  });
  it('bus plein : la cagnotte est complète et Aïcha est prévenue', () => {
    choisirTaille(30); payerPartCagnotte(); while (ajouterParticipantDemo()) { /* jusqu'au bus plein */ }
    const c = cagnotte(); expect(c.participants).toHaveLength(30); expect(c.statut).toBe('complete'); expect(app.monde.notifications.some((n) => n.titre === 'Bus entier réservé')).toBe(true);
    expect(ajouterParticipantDemo()).toBe(false); expect(payerPartCagnotte()).toBe(false);
  });
  it('pas plein à J-2 : tout le monde est remboursé', () => {
    const c = cagnotte(); c.jour = ajouterJours(new Date().toISOString().slice(0, 10), 5); payerPartCagnotte(); ajouterParticipantDemo(); ajouterParticipantDemo();
    expect(verifierCagnotte()).toBe('ouverte'); c.jour = ajouterJours(new Date().toISOString().slice(0, 10), 1);
    expect(verifierCagnotte()).toBe('remboursee'); expect(c.rembourse).toBe(3 * 5200); expect(c.participants.every((p) => p.rembourse)).toBe(true); expect(nbPayes(c)).toBe(0);
    expect(app.monde.notifications.some((n) => n.titre === 'Cagnotte non complète : remboursement')).toBe(true);
    recommencerCagnotte(); expect(cagnotte().statut).toBe('brouillon'); expect(cagnotte().participants).toHaveLength(1);
  });
  it('payer sa part par le tunnel (nature groupe)', () => {
    const b = brouillonVide({ nature: 'groupe' }); etat().brouillon = b; const e = etat().brouillon!; e.montant = partCagnotte(cagnotte());
    lancerPaiement(e, 'p-aicha'); expect(e.paiementId).toBeNull(); expect(e.expireLe).toBeGreaterThan(Date.now()); expect(confirmerPaiement(e).ok).toBe(true); expect(maPart(cagnotte())!.paye).toBe(true);
  });
});

describe('partage de billet', () => {
  beforeEach(() => { reinitialiser(); connecter('p-aicha'); });
  it('le message part vers le proche avec le code, le billet reste à Aïcha', () => {
    const b = billetsDe('p-aicha')[0]; const t = partagerBillet(b.id, { id: 'p-maman', nom: 'Marie', tel: '677000111' });
    expect(t).toContain('AM-7F3K-22'); expect(t).toContain('place 3C'); expect(etat().partages).toHaveLength(1); expect(b.statut).toBe('valide'); expect(b.passager.nom).toBe('Aïcha Ndiba');
    expect(app.monde.notifications.some((n) => n.destId === 'p-maman')).toBe(true); expect(() => partagerBillet('x', { nom: 'a', tel: 'b' })).toThrow('billet_inconnu');
  });
});

describe('reprise d’un paiement en attente (?paiement=)', () => {
  beforeEach(() => { reinitialiser(); connecter('p-aicha'); });
  const enAttenteSansSiege = () => {
    const d = unDepart(); const r = reserver({ departId: d.id, sieges: [null], passagers: [{ nom: 'Aïcha Ndiba', tel: '691221008' }], acheteurId: 'p-aicha', canal: 'app', moyen: 'momo', prixUnitaire: 2150 });
    return { d, ...r };
  };
  it('un billet sans siège (montée en route) est repris, au prix fixé, et se règle', () => {
    const { paiement } = enAttenteSansSiege();
    expect(reprendrePaiement(paiement.id, 'p-aicha')).toBe('ok');
    const b = etat().brouillon!; expect(b.sansSiege).toBe(true); expect(b.paiementId).toBe(paiement.id); expect(montantBrouillon(b)).toBe(2150);
    b.moyen = 'om'; lancerPaiement(b, 'p-aicha'); expect(paiementDe(b)!.id).toBe(paiement.id); expect(app.monde.paiements.filter((p) => p.statut === 'attente')).toHaveLength(1);
    expect(confirmerPaiement(b).ok).toBe(true); expect(billetsDuPaiement(paiement.id)[0].statut).toBe('valide');
  });
  it('un refus garde la place sans siège pour le réessai, au même prix', () => {
    const { paiement } = enAttenteSansSiege(); reprendrePaiement(paiement.id, 'p-aicha'); const b = etat().brouillon!;
    refuserPaiement(b, 'Solde insuffisant'); const p2 = paiementDe(b)!; expect(p2.id).not.toBe(paiement.id); expect(p2.statut).toBe('attente'); expect(p2.montant).toBe(2150);
  });
  it('paiement expiré, déjà réglé, d’un autre ou inconnu : refusé', () => {
    const { paiement } = enAttenteSansSiege();
    expect(reprendrePaiement('inconnu', 'p-aicha')).toBe('introuvable'); expect(reprendrePaiement(paiement.id, 'p-maman')).toBe('introuvable');
    paiement.expireLe = 1; expect(reprendrePaiement(paiement.id, 'p-aicha')).toBe('expire');
    expect(reprendrePaiement('pay-aicha1', 'p-aicha')).toBe('deja_regle');
  });
  it('un covoiturage en attente se reprend aussi', () => {
    const o = app.monde.covoits.find((c) => c.statut === 'ouverte')!; const { paiement } = reserverCovoit(o.id, 2, 'p-aicha', 'momo');
    expect(reprendrePaiement(paiement.id, 'p-aicha')).toBe('ok'); const b = etat().brouillon!; expect(b.nature).toBe('covoit'); expect(b.places).toBe(2); expect(montantBrouillon(b)).toBe(o.prix * 2);
  });
});

describe('avantages au paiement : bons de fidélité et cagnotte', () => {
  beforeEach(() => { reinitialiser(); connecter('p-aicha'); preparerFidelite('p-aicha'); });
  it('un bon de 500 F se déduit du total, n’est consommé qu’à l’acceptation, et une seule fois', () => {
    expect(utiliserPoints('p-aicha')).toMatchObject({ ok: true, montant: 500 });
    const { b, d } = brouillon(1); const brut = montantBrouillon(b); expect(remiseDe(b, 'p-aicha').total).toBe(500);
    lancerPaiement(b, 'p-aicha'); const p = paiementDe(b)!; expect(p.montant).toBe(brut - 500); expect(p.remise?.bon).toBe(500);
    expect(bonsDisponibles('p-aicha')).toHaveLength(1); // pas encore consommé
    expect(confirmerPaiement(b).ok).toBe(true); expect(bonsDisponibles('p-aicha')).toHaveLength(0);
    expect(billetsDuPaiement(p.id)[0].prix).toBe(brut); expect(d.id).toBe(b.departId);
    const { b: b2 } = brouillon(1); expect(remiseDe(b2, 'p-aicha').total).toBe(0);
  });
  it('refus : le bon reste utilisable', () => {
    utiliserPoints('p-aicha'); const { b } = brouillon(1); lancerPaiement(b, 'p-aicha'); refuserPaiement(b, 'Solde insuffisant');
    expect(bonsDisponibles('p-aicha')).toHaveLength(1); expect(paiementDe(b)!.remise?.bon).toBe(500); expect(paiementDe(b)!.montant).toBe(montantBrouillon(b) - 500);
  });
  it('la cagnotte de gestes commerciaux est débitée à l’acceptation, bornée au solde', () => {
    crediterCagnotte('p-aicha', 1200); const { b } = brouillon(1); const brut = montantBrouillon(b);
    lancerPaiement(b, 'p-aicha'); expect(paiementDe(b)!.montant).toBe(brut - 1200); confirmerPaiement(b); expect(cagnotteDe('p-aicha')).toBe(0);
  });
  it('désactiver les avantages : plein tarif', () => {
    utiliserPoints('p-aicha'); const { b } = brouillon(1); b.avantages = false; lancerPaiement(b, 'p-aicha'); expect(paiementDe(b)!.montant).toBe(montantBrouillon(b)); expect(paiementDe(b)!.remise).toBeUndefined();
  });
});

describe('paiement d’un colis (?colis=)', () => {
  beforeEach(() => { reinitialiser(); connecter('p-aicha'); });
  it('le colis créé à l’envoi se règle : paiement accepté, l’expéditrice est prévenue', () => {
    const c = app.monde.colis.find((x) => x.id === 'col-1')!; const { colis, paiement } = creerColis({ expediteurId: 'p-aicha', destinataire: { nom: 'Marie', tel: '677000111' }, taille: 'M', options: { moto: false, assurance: true, contreRemboursement: false }, depart: 'Yaoundé · Mvan', arrivee: 'Douala · relais', moyen: 'momo', canal: 'app' });
    expect(c.id).not.toBe(colis.id); expect(paiement!.statut).toBe('attente');
    expect(reprendreColis(colis.id, 'p-aicha')).toBe('ok'); const b = etat().brouillon!; expect(b.nature).toBe('colis'); expect(montantBrouillon(b)).toBe(colis.prix);
    lancerPaiement(b, 'p-aicha'); expect(paiementDe(b)!.id).toBe(paiement!.id); expect(confirmerPaiement(b).ok).toBe(true);
    expect(app.monde.paiements.find((p) => p.id === paiement!.id)!.statut).toBe('ok'); expect(app.monde.notifications.some((n) => n.titre === `Colis ${colis.code} payé`)).toBe(true);
    expect(reprendreColis(colis.id, 'p-aicha')).toBe('deja_regle');
  });
  it('un paiement refusé est remplacé par un nouveau au réessai ; contre-remboursement et colis d’autrui refusés', () => {
    const { colis, paiement } = creerColis({ expediteurId: 'p-aicha', destinataire: { nom: 'Marie', tel: '677000111' }, taille: 'S', options: { moto: false, assurance: false, contreRemboursement: false }, depart: 'a', arrivee: 'b', moyen: 'momo', canal: 'app' });
    reprendreColis(colis.id, 'p-aicha'); const b = etat().brouillon!; lancerPaiement(b, 'p-aicha'); refuserPaiement(b, 'Solde insuffisant');
    expect(paiement!.statut).toBe('refuse'); expect(b.paiementId).toBeNull(); expect(b.refus?.nature).toBe('colis');
    lancerPaiement(b, 'p-aicha'); expect(paiementDe(b)!.id).not.toBe(paiement!.id); expect(colis.paiementId).toBe(paiementDe(b)!.id); expect(paiementDe(b)!.statut).toBe('attente');
    expect(reprendreColis(colis.id, 'p-maman')).toBe('introuvable');
    const cod = creerColis({ expediteurId: 'p-aicha', destinataire: { nom: 'Marie', tel: '677000111' }, taille: 'S', options: { moto: false, assurance: false, contreRemboursement: true }, depart: 'a', arrivee: 'b', moyen: 'momo', canal: 'app' });
    expect(reprendreColis(cod.colis.id, 'p-aicha')).toBe('sans_paiement');
  });
});

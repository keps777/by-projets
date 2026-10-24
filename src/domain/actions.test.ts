import { beforeEach, describe, expect, it } from 'vitest';
import { reinitialiser, app } from '../data/store.svelte.ts';
import { contenuQr } from '../core/sceau.ts';
import { planSieges } from '../core/sieges.ts';
import { annoncerRetard, annulerBillet, annulerDepart, attenduDeCaisse, avancerColis, billetsDe, caisseOuverte, connecter, creerColis, departsDuJour, fermerCaisse, ouvrirCaisse, placesLibres, regler, reserver, scannerBillet, siegesIndisponibles, validerCaisse, verifierPin } from './actions.ts';

const demain = () => { const d = new Date(Date.now() + 86_400_000); return d.toISOString().slice(0, 10); };
const libres = (d: ReturnType<typeof unDepart>, n: number, apres = 4) => planSieges(d.ligneId.includes('VIP') ? 'VIP' : 'Classique', d.capacite).map((x) => x.id).filter((id) => !siegesIndisponibles(d).has(id)).slice(apres, apres + n);
const unDepart = () => app.monde.departs.find((d) => d.statut === 'prevu' && d.capacite === 50 && d.jour >= demain())!;

describe('monde de démonstration', () => {
  beforeEach(() => reinitialiser());
  it('contient les compagnies, des départs sur 15 jours et l’équipe', () => {
    expect(app.monde.compagnies).toHaveLength(5); expect(app.monde.departs.length).toBeGreaterThan(400);
    expect(departsDuJour(demain(), 'Yaoundé', 'Douala').length).toBe(14);
    expect(app.monde.personnes.filter((p) => p.role === 'guichet')).toHaveLength(2);
    expect(verifierPin('p-fatou', '4821')).toBe(true); expect(verifierPin('p-fatou', '0000')).toBe(false);
  });
  it('Aïcha a un billet valide pour demain 08:00, place 3C', () => {
    const b = billetsDe('p-aicha')[0]; expect(b).toMatchObject({ siege: '3C', statut: 'valide', code: 'AM7F3K22' });
    const r = scannerBillet(contenuQr(b.code, b.sceau), 'p-ibrahim', b.departId); expect(r.statut).toBe('ok');
    expect(scannerBillet(contenuQr(b.code, b.sceau), 'p-ibrahim').statut).toBe('deja_scanne');
  });
});
describe('réservation et paiement', () => {
  beforeEach(() => reinitialiser());
  it('réserver puis régler : places retenues, billets valides, notification', () => {
    const d = unDepart(), avantLibres = placesLibres(d), seat = libres(d, 2, 6);
    const { paiement, billets } = reserver({ departId: d.id, sieges: seat, passagers: seat.map((_, i) => ({ nom: `Test ${i}`, tel: '690000000' })), acheteurId: 'p-aicha', canal: 'app', moyen: 'momo' });
    expect(paiement.statut).toBe('attente'); expect(billets.every((b) => b.statut === 'attente_paiement')).toBe(true); expect(placesLibres(d)).toBe(avantLibres - seat.length);
    expect(() => reserver({ departId: d.id, sieges: [seat[0]], passagers: [{ nom: 'X', tel: '1' }], acheteurId: 'p-aicha', canal: 'app', moyen: 'momo' })).toThrow('siege_pris');
    regler(paiement.id, { ok: true }); expect(billets.every((b) => b.statut === 'valide')).toBe(true); expect(app.monde.notifications[0].titre).toBe('Billet confirmé');
  });
  it('refus : les billets expirent et les places sont libérées', () => {
    const d = unDepart(), avant = placesLibres(d), { paiement, billets } = reserver({ departId: d.id, sieges: libres(d, 1, 10), passagers: [{ nom: 'Z', tel: '1' }], acheteurId: 'p-aicha', canal: 'app', moyen: 'om' });
    regler(paiement.id, { refus: 'Solde insuffisant' }); expect(paiement.statut).toBe('refuse'); expect(billets[0].statut).toBe('expire'); expect(placesLibres(d)).toBe(avant);
  });
  it('vente au guichet en espèces : valide tout de suite, entre dans la caisse', () => {
    const c = caisseOuverte('p-fatou')!, d = unDepart();
    const { billets } = reserver({ departId: d.id, sieges: libres(d, 2), passagers: [{ nom: 'A', tel: '1' }, { nom: 'B', tel: '2' }], acheteurId: 'p-fatou', canal: 'guichet', moyen: 'especes', caisseId: c.id });
    expect(billets.every((b) => b.statut === 'valide')).toBe(true); expect(attenduDeCaisse(c)).toBe(20_000 + billets.reduce((s, b) => s + b.prix, 0));
  });
  it('supplément de la première rangée en classe Classique', () => {
    const d = unDepart(); d.prisAilleurs = d.prisAilleurs.filter((s) => s !== '1B');
    const { billets } = reserver({ departId: d.id, sieges: ['1B'], passagers: [{ nom: 'A', tel: '1' }], acheteurId: 'p-aicha', canal: 'app', moyen: 'momo' }); expect(billets[0].prix).toBe(d.prix + 1500);
  });
});
describe('annulation, retard, scan', () => {
  beforeEach(() => reinitialiser());
  it('annuler le billet d’Aïcha : 10 % de frais, place libérée', () => {
    const b = billetsDe('p-aicha')[0], r = annulerBillet(b.id); expect(r.possible).toBe(true); expect(r.frais).toBe(750); expect(r.rembourse).toBe(6750); expect(b.statut).toBe('rembourse');
    expect(annulerBillet(b.id).possible).toBe(false);
  });
  it('départ annulé par la compagnie : remboursement intégral', () => { const b = billetsDe('p-aicha')[0]; expect(annulerDepart(b.departId)).toBe(1); expect(b.statut).toBe('rembourse'); });
  it('retard : notifie les voyageurs', () => { const b = billetsDe('p-aicha')[0]; annoncerRetard(b.departId, 45); expect(app.monde.notifications[0].titre).toBe('Retard +45 min'); });
  it('scan : faux sceau, inconnu, mauvais départ', () => {
    const b = billetsDe('p-aicha')[0];
    expect(scannerBillet(`${b.code}.000000000000`, 'p-ibrahim').statut).toBe('faux'); expect(scannerBillet('ZZZZZZZZ', 'p-ibrahim').statut).toBe('inconnu'); expect(scannerBillet(b.code, 'p-ibrahim', 'autre').statut).toBe('mauvais_depart');
  });
});
describe('caisse et colis', () => {
  beforeEach(() => reinitialiser());
  it('fermeture avec écart > 1 000 F : le superviseur est prévenu puis valide avec son PIN', () => {
    const c = caisseOuverte('p-fatou')!, r = fermerCaisse(c.id, { 10000: 1 }); expect(r.niveau).toBe('a_valider'); expect(r.montant).toBe(10_000 - 20_000);
    expect(app.monde.notifications.some((n) => n.destId === 'p-abdou' && n.titre === 'Clôture à valider')).toBe(true);
    expect(validerCaisse(c.id, 'p-abdou', '0000')).toBe(false); expect(validerCaisse(c.id, 'p-abdou', '1357')).toBe(true); expect(c.statut).toBe('validee');
  });
  it('colis : création, paiement, avancement jusqu’à la livraison', () => {
    const { colis, paiement } = creerColis({ expediteurId: 'p-aicha', destinataire: { nom: 'Maman', tel: '677000111' }, taille: 'M', options: { moto: true, assurance: true, contreRemboursement: false }, depart: 'Yaoundé · Mvan', arrivee: 'Douala', moyen: 'momo', canal: 'app' });
    expect(colis.prix).toBe(4000); expect(paiement?.montant).toBe(4000); expect(colis.codeRetrait).toMatch(/^\d{4}$/);
    for (const s of ['depose', 'en_route', 'au_relais', 'en_livraison', 'livre'] as const) avancerColis(colis.id, undefined, 'lieu'); expect(colis.statut).toBe('livre');
  });
  it('connexion : le rôle de la session suit la personne', () => { connecter('p-fatou'); expect(app.session.role).toBe('guichet'); });
});

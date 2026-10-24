import { beforeEach, describe, expect, it } from 'vitest';
import { app, reinitialiser } from '../../data/store.svelte.ts';
import { billetsDe, connecter, personne } from '../../domain/actions.ts';
import { demain, departsReservables } from './achat.ts';
import { preferences } from './etat.ts';
import { preparerFidelite } from './actions.ts';
import { affichage, appuyer, codeLisible, ecranCourant, nouvelleSession, retourUssd, saisir } from './ussd.ts';
import { nouvelleConversation, repondre } from './whatsapp.ts';

const suivre = (s: ReturnType<typeof nouvelleSession>, ...touches: string[]) => { for (const t of touches) appuyer(s, t); return s; };

describe('menu USSD *123#', () => {
  beforeEach(() => { reinitialiser(); preferences(); preparerFidelite('p-aicha'); });
  it('menu principal et retour avec 0', () => {
    const s = nouvelleSession(); expect(affichage(s).texte).toMatch(/^AfriMove \*123#\n1 Voyager/); expect(affichage(s).touches).toEqual(['1', '2', '3', '4', '5']);
    suivre(s, '2'); expect(ecranCourant(s).t).toBe('billets'); retourUssd(s); expect(ecranCourant(s).t).toBe('racine'); retourUssd(s); expect(ecranCourant(s).t).toBe('fin'); expect(retourUssd(s).pile).toHaveLength(1);
  });
  it('une touche inexistante est ignorée', () => { const s = nouvelleSession(); suivre(s, '9'); expect(ecranCourant(s).t).toBe('racine'); });
  it('Voyager : villes avec prix « dès », départs de demain triés', () => {
    const s = suivre(nouvelleSession(), '1'); const texte = affichage(s).texte; expect(texte).toContain('1 Douala des 5 000 F'); expect(texte).toContain('2 Bafoussam des 5 000 F'); expect(texte).toContain('3 Bamenda des 7 000 F');
    suivre(s, '1'); const a = affichage(s); expect(a.texte).toMatch(/Yaounde > Douala/); expect(a.touches.length).toBeGreaterThanOrEqual(3);
  });
  it('acheter un billet : réserver + régler MoMo, le billet existe dans le monde, avec points de fidélité', () => {
    const avant = billetsDe('p-aicha').length, pts = personne('p-aicha')!.points!, d1 = departsReservables('Yaoundé', 'Douala', demain())[0];
    const s = suivre(nouvelleSession(), '1', '1', '1'); expect(affichage(s).texte).toContain('par MoMo'); expect(affichage(s).touches).toEqual(['1', '2']);
    suivre(s, '1'); const a = affichage(s); expect(a.texte).toContain('Paiement en cours'); expect(a.texte).toMatch(/Billet AM-[A-Z0-9]{4}-[A-Z0-9]{2}/);
    const bs = billetsDe('p-aicha'); expect(bs).toHaveLength(avant + 1); const b = bs[0]; expect(b).toMatchObject({ statut: 'valide', canal: 'ussd', departId: d1.id }); expect(b.paiementId).toBeTruthy();
    expect(app.monde.paiements.find((p) => p.id === b.paiementId)).toMatchObject({ statut: 'ok', moyen: 'momo', canal: 'ussd' }); expect(personne('p-aicha')!.points).toBe(pts + Math.floor(b.prix / 100));
    expect(a.texte).toContain(codeLisible(b.code)); expect(a.touches).toEqual([]);
  });
  it('« Réserver, payer au guichet » retient la place sans la payer', () => {
    suivre(nouvelleSession(), '1', '2', '1', '2'); const b = billetsDe('p-aicha')[0]; expect(b.statut).toBe('attente_paiement'); expect(app.monde.paiements.find((p) => p.id === b.paiementId)!.statut).toBe('attente');
  });
  it('Mes billets : le billet d’Aïcha puis son détail', () => {
    const s = suivre(nouvelleSession(), '2'); expect(affichage(s).texte).toContain('AM-7F3K-22'); suivre(s, '1'); expect(affichage(s).texte).toContain('AM-7F3K-22 VALIDE'); expect(affichage(s).texte).toContain('3C');
    retourUssd(s); suivre(s, '2'); expect(affichage(s).texte).toContain('Aucun voyage passe');
  });
  it('Vérifier un billet : dernier billet, code saisi, code inconnu', () => {
    let s = suivre(nouvelleSession(), '3'); expect(affichage(s).saisie).toBe('code'); suivre(s, '1'); expect(affichage(s).texte).toContain('AM-7F3K-22 VALIDE');
    s = suivre(nouvelleSession(), '3'); saisir(s, 'am-7f3k-22'); expect(affichage(s).texte).toContain('VALIDE'); s = suivre(nouvelleSession(), '3'); saisir(s, 'ZZZZ-9999'); expect(affichage(s).texte).toContain('INCONNU');
    app.monde.billets[0].sceau = '000000000000'; s = suivre(nouvelleSession(), '3'); saisir(s, 'AM7F3K22'); expect(affichage(s).texte).toContain('FAUX');
  });
  it('Colis : suivi du colis, relais proches', () => {
    let s = suivre(nouvelleSession(), '4', '1'); expect(affichage(s).texte).toContain('AM-C-9Q2'); expect(affichage(s).texte).toContain('En route');
    s = suivre(nouvelleSession(), '4', '3'); expect(affichage(s).texte).toContain('Mado');
  });
  it('Payer pour un proche : billet au nom du proche, payé par Aïcha', () => {
    let s = suivre(nouvelleSession(), '5'); expect(affichage(s).texte).toContain('1 Marie 6 77 00 01 11'); expect(affichage(s).texte).toContain('3 Autre numero');
    suivre(s, '1', '1', '1', '1'); const b = billetsDe('p-aicha')[0]; expect(b.passager).toMatchObject({ tel: '677000111' }); expect(b.acheteurId).toBe('p-aicha'); expect(b.statut).toBe('valide');
    s = suivre(nouvelleSession(), '5', '3'); expect(affichage(s).saisie).toBe('numero'); saisir(s, '12'); expect(affichage(s).texte).toContain('invalide'); s = suivre(nouvelleSession(), '5', '3'); saisir(s, '6 55 00 12 34'); expect(ecranCourant(s).t).toBe('villes'); expect(affichage(s).texte).toContain('6 55 00 12 34');
  });
  it('départ complet : message clair, aucun billet créé', () => {
    const s = suivre(nouvelleSession(), '1', '1', '1'), id = (ecranCourant(s) as { departId: string }).departId, d = app.monde.departs.find((x) => x.id === id)!;
    d.prisAilleurs = Array.from({ length: 80 }, (_, i) => `${1 + Math.floor(i / 4)}${'ABCD'[i % 4]}`); const avant = billetsDe('p-aicha').length;
    suivre(s, '1'); expect(billetsDe('p-aicha')).toHaveLength(avant);
  });
  it('utilise le numéro de la voyageuse connectée', () => {
    connecter('p-aicha'); expect(affichage(suivre(nouvelleSession(), '2')).texte).toContain('AM-7F3K-22');
  });
});

describe('WhatsApp AfriMove', () => {
  beforeEach(() => { reinitialiser(); preferences(); preparerFidelite('p-aicha'); });
  it('« Douala demain » propose des départs, « 1 » réserve et paie', () => {
    const c = nouvelleConversation(), r = repondre(c, 'Douala demain'); expect(r[0]).toContain('Yaoundé → Douala'); expect(c.propositions.length).toBeGreaterThanOrEqual(3);
    const avant = billetsDe('p-aicha').length, ok = repondre(c, '1'); expect(ok[0]).toContain('Paiement MoMo'); expect(billetsDe('p-aicha')).toHaveLength(avant + 1); expect(billetsDe('p-aicha')[0].canal).toBe('whatsapp'); expect(c.propositions).toEqual([]);
    expect(repondre(c, '2')[0]).toContain('Écris d’abord une ville');
  });
  it('code colis, mon billet, aide', () => {
    const c = nouvelleConversation(); expect(repondre(c, 'am-c-9q2')[0]).toContain('AM-C-9Q2'); expect(repondre(c, 'AM-C-ZZZ')[0]).toContain('ne trouve pas'); expect(repondre(c, 'mon billet')[0]).toContain('AM-7F3K-22'); expect(repondre(c, 'salut')[0]).toContain('Je peux');
  });
});

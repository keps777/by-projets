import { beforeEach, describe, expect, it } from 'vitest';
import { app, aujourdhui, reinitialiser } from '../../data/store.svelte.ts';
import { attenduDeCaisse, caisseOuverte, creerColis, placesLibres, scannerBillet, validerCaisse } from '../../domain/actions.ts';
import { contenuQr } from '../../core/sceau.ts';
import { planSieges } from '../../core/sieges.ts';
import { COUPURES } from '../../core/caisse.ts';
import { alertes, annulerDerniereVente, attenduDeLaCaisse, basculerReseau, cloturerCaisse, compterMontee, contexte, departsDeLaGare, deposerColisPrepaye, enregistrerColis, finaliserPaiement, lireBillet, lireColis, ouvrirLaCaisse, paiementsEnAttente, rembourserAuGuichet, resumeCaisse, statsCadence, statsDuJour, totalVente, vendre, vendreCadence } from './actions.ts';
import { etat } from './etat.ts';

const FATOU = 'p-fatou';
/** Un départ de Mvan dans plus de 2 h (remboursable), jour de la démo. */
const depart = () => departsDeLaGare('mvan', 200).find((d) => d.capacite === 50 && d.jour > aujourdhui())!;
const libres = (d: ReturnType<typeof depart>, n: number) => { const pris = new Set(d.prisAilleurs); return planSieges('Classique', d.capacite).map((s) => s.id).filter((i) => !pris.has(i)).slice(0, n); };
const pax = (n = 1) => Array.from({ length: n }, (_, i) => ({ nom: `Client ${i + 1}`, tel: '690000000' }));
beforeEach(() => { reinitialiser(); etat(); });

describe('vente au guichet', () => {
  it('refuse de vendre sans caisse ouverte, ou pour un autre rôle', () => {
    app.monde.caisses = []; const d = depart();
    expect(() => vendre({ agentId: FATOU, departId: d.id, sieges: libres(d, 1), passagers: pax(), moyen: 'especes' })).toThrow('caisse_fermee');
    ouvrirLaCaisse(FATOU, 10000);
    expect(() => vendre({ agentId: 'p-ibrahim', departId: d.id, sieges: libres(d, 1), passagers: pax(), moyen: 'especes' })).toThrow('droit_refuse');
  });
  it('espèces : billet valide tout de suite, caisse renseignée, monnaie rendue, visible du voyageur par son numéro', () => {
    const d = depart(), avant = placesLibres(d), s = libres(d, 2);
    const r = vendre({ agentId: FATOU, departId: d.id, sieges: s, passagers: [{ nom: 'Aïcha Ndiba', tel: '691221008' }, ...pax()], moyen: 'especes', recu: 20000 });
    const c = caisseOuverte(FATOU)!;
    expect(r.billets.every((b) => b.statut === 'valide' && b.canal === 'guichet' && b.caisseId === c.id)).toBe(true);
    expect(r.paiement).toMatchObject({ statut: 'ok', moyen: 'especes', canal: 'guichet' });
    expect(r.rendu).toBe(20000 - totalVente(d, s)); expect(placesLibres(d)).toBe(avant - 2);
    expect(app.monde.evenements[0].type).toBe('vente'); expect(app.monde.notifications.some((n) => n.destId === 'p-aicha' && n.titre === 'Billet confirmé' && n.sous.includes('guichet'))).toBe(true);
    expect(attenduDeCaisse(c)).toBe(20000 + r.paiement.montant);
  });
  it('siège pris, complet, reçu insuffisant', () => {
    const d = depart(), s = libres(d, 1);
    vendre({ agentId: FATOU, departId: d.id, sieges: s, passagers: pax(), moyen: 'especes' });
    expect(() => vendre({ agentId: FATOU, departId: d.id, sieges: s, passagers: pax(), moyen: 'especes' })).toThrow('siege_pris');
    expect(() => vendre({ agentId: FATOU, departId: d.id, sieges: libres(d, 2).slice(1), passagers: pax(), moyen: 'especes', recu: 100 })).toThrow('recu_insuffisant');
    d.prisAilleurs = planSieges('Classique', 50).map((x) => x.id); expect(() => vendre({ agentId: FATOU, departId: d.id, sieges: [null], passagers: pax(), moyen: 'especes' })).toThrow('complet');
  });
  it('MoMo : paiement en attente, puis accepté ou refusé', () => {
    const d = depart(), [a, b] = libres(d, 2);
    const r = vendre({ agentId: FATOU, departId: d.id, sieges: [a], passagers: pax(), moyen: 'momo' });
    expect(r.paiement.statut).toBe('attente'); expect(paiementsEnAttente(FATOU)).toHaveLength(1); expect(alertes(app.monde.personnes.find((p) => p.id === FATOU)!).some((x) => x.texte.includes('MoMo'))).toBe(true);
    expect(resumeCaisse(caisseOuverte(FATOU)!).billets).toBe(0);
    finaliserPaiement(FATOU, r.paiement.id, { ok: true }); expect(r.billets[0].statut).toBe('valide'); expect(paiementsEnAttente(FATOU)).toHaveLength(0);
    expect(resumeCaisse(caisseOuverte(FATOU)!)).toMatchObject({ billets: 1, mobile: r.paiement.montant, attendu: 20000 });
    const r2 = vendre({ agentId: FATOU, departId: d.id, sieges: [b], passagers: pax(), moyen: 'om' });
    finaliserPaiement(FATOU, r2.paiement.id, { refus: 'Solde insuffisant' }); expect(r2.billets[0].statut).toBe('expire'); expect(r2.paiement.motif).toBe('Solde insuffisant');
  });
  it('hors ligne : espèces seulement, ventes à synchroniser puis synchronisées', () => {
    const d = depart(), [a, b] = libres(d, 2); basculerReseau();
    expect(() => vendre({ agentId: FATOU, departId: d.id, sieges: [a], passagers: pax(), moyen: 'momo' })).toThrow('hors_ligne');
    vendre({ agentId: FATOU, departId: d.id, sieges: [b], passagers: pax(), moyen: 'especes' }); expect(etat().aSynchroniser).toHaveLength(1);
    expect(basculerReseau()).toEqual({ ligne: true, synchronises: 1 }); expect(etat().aSynchroniser).toHaveLength(0);
  });
  it('annuler la dernière vente rend tout l’argent et libère la place', () => {
    const d = depart(), avant = placesLibres(d), s = libres(d, 1);
    const r = vendre({ agentId: FATOU, departId: d.id, sieges: s, passagers: pax(), moyen: 'especes' });
    expect(annulerDerniereVente(FATOU)).toEqual({ montant: r.paiement.montant, billets: 1 }); expect(r.billets[0].statut).toBe('annule'); expect(placesLibres(d)).toBe(avant);
    expect(attenduDeCaisse(caisseOuverte(FATOU)!)).toBe(20000); expect(annulerDerniereVente(FATOU)).toBeNull();
    expect(scannerBillet(contenuQr(r.billets[0].code, r.billets[0].sceau), 'p-ibrahim').statut).toBe('annule');
  });
});

describe('mode cadence', () => {
  it('billets sans siège, en espèces, par quantité, comptés dans la caisse', () => {
    const d = depart(), avant = placesLibres(d), r = vendreCadence(FATOU, d.id, 3);
    expect(r.billets).toHaveLength(3); expect(r.billets.every((b) => b.siege === null && b.statut === 'valide')).toBe(true); expect(placesLibres(d)).toBe(avant - 3);
    const st = statsCadence(FATOU); expect(st.billets).toBe(3); expect(st.encaisse).toBe(3 * d.prix);
    expect(annulerDerniereVente(FATOU)).toMatchObject({ billets: 3 }); expect(statsCadence(FATOU).billets).toBe(0);
  });
  it('refusé quand le patron désactive la règle', () => { app.monde.params.regles.cadence = false; expect(() => vendreCadence(FATOU, depart().id)).toThrow('cadence_desactivee'); });
  it('comptage des montées borné', () => { expect(compterMontee('x', -1, 50)).toBe(0); expect(compterMontee('x', 60, 50)).toBe(50); expect(compterMontee('x', -3, 50)).toBe(47); });
});

describe('colis', () => {
  it('colis au guichet : encaissé en espèces dans la caisse, déposé, étiquette AM-C', () => {
    const d = depart(), c = enregistrerColis({ agentId: FATOU, expediteur: { nom: 'Aïcha N.', tel: '691221008' }, destinataire: { nom: 'Maman E.', tel: '6 77 10 22 33' }, taille: 'M', options: { moto: false, assurance: true }, vers: 'Douala', relaisId: 'p-mado', departId: d.id });
    expect(c).toMatchObject({ statut: 'depose', prix: 3000, expediteurId: 'p-aicha', caisseId: caisseOuverte(FATOU)!.id, departId: d.id }); expect(c.code).toMatch(/^AM-C-/); expect(c.arrivee).toBe('Douala · relais Chez Mado'); expect(c.depart).toBe('Yaoundé · Mvan');
    expect(app.monde.paiements.find((p) => p.id === c.paiementId)).toMatchObject({ statut: 'ok', moyen: 'especes' }); expect(attenduDeCaisse(caisseOuverte(FATOU)!)).toBe(23000); expect(resumeCaisse(caisseOuverte(FATOU)!).colis).toBe(1);
    expect(etat().expediteurs[c.id].nom).toBe('Aïcha N.');
  });
  it('destinataire illisible refusé', () => { expect(() => enregistrerColis({ agentId: FATOU, expediteur: { nom: '', tel: '' }, destinataire: { nom: 'X', tel: '123' }, taille: 'S', options: { moto: false, assurance: false }, vers: 'Douala' })).toThrow('destinataire_invalide'); });
  const prepaye = () => { const { colis, paiement } = creerColis({ expediteurId: 'p-aicha', destinataire: { nom: 'Marie', tel: '677000111' }, taille: 'M', options: { moto: false, assurance: true, contreRemboursement: false }, depart: 'Yaoundé · Mvan', arrivee: 'Douala · relais Chez Mado', moyen: 'momo', canal: 'app' }); return { colis, paiement: paiement! }; };
  it('dépôt prépayé : seulement un colis créé et payé', () => {
    const { colis, paiement } = prepaye();
    expect(lireColis(colis.code.toLowerCase())).toMatchObject({ ok: false, raison: expect.stringContaining('en attente') });
    paiement.statut = 'ok'; expect(lireColis(colis.code)).toMatchObject({ ok: true });
    expect(lireColis('AM-C-ZZZ')).toMatchObject({ ok: false }); expect(lireColis('???')).toMatchObject({ ok: false });
    const r = deposerColisPrepaye(FATOU, colis.id); expect(r.supplement).toBe(0); expect(colis.statut).toBe('depose'); expect(colis.departId).toBeTruthy();
    expect(lireColis(colis.code)).toMatchObject({ ok: false, raison: expect.stringContaining('déjà déposé') }); expect(attenduDeCaisse(caisseOuverte(FATOU)!)).toBe(20000);
  });
  it('plus gros que déclaré : supplément encaissé en caisse, taille et prix corrigés', () => {
    const { colis, paiement } = prepaye(); paiement.statut = 'ok';
    const r = deposerColisPrepaye(FATOU, colis.id, 'L'); expect(r.supplement).toBe(2500); expect(colis).toMatchObject({ taille: 'L', prix: 5500 });
    expect(attenduDeLaCaisse(caisseOuverte(FATOU)!)).toBe(22500); expect(app.monde.evenements.some((e) => e.texte.includes('Supplément'))).toBe(true);
  });
  it('supplément impossible sans caisse ouverte', () => { const { colis, paiement } = prepaye(); paiement.statut = 'ok'; app.monde.caisses = []; expect(() => deposerColisPrepaye(FATOU, colis.id, 'L')).toThrow('caisse_fermee'); expect(colis.statut).toBe('cree'); });
});

describe('remboursement au guichet', () => {
  it('billet espèces : frais 10 %, somme rendue déduite de la caisse, attendu juste', () => {
    const d = depart(), s = libres(d, 1), r = vendre({ agentId: FATOU, departId: d.id, sieges: s, passagers: pax(), moyen: 'especes' }), b = r.billets[0];
    const lu = lireBillet(b.code.toLowerCase())!; expect(lu.especes).toBe(true); expect(lu.apercu.possible).toBe(true);
    const out = rembourserAuGuichet(FATOU, b.id); expect(out).toMatchObject({ especes: true, rembourse: b.prix - out.frais }); expect(out.frais).toBeGreaterThan(0); expect(out.frais).toBeLessThan(b.prix / 5); expect(b.statut).toBe('rembourse');
    const c = caisseOuverte(FATOU)!; expect(attenduDeLaCaisse(c)).toBe(20000 + out.frais);
    expect(() => rembourserAuGuichet(FATOU, b.id)).toThrow(); expect(lireBillet(b.code)!.dejaAccorde).toBe(false);
  });
  it('billet MoMo : remboursé sur le compte, rien ne sort de la caisse', () => {
    const d = depart(), r = vendre({ agentId: FATOU, departId: d.id, sieges: libres(d, 1), passagers: pax(), moyen: 'momo' }); finaliserPaiement(FATOU, r.paiement.id, { ok: true });
    expect(rembourserAuGuichet(FATOU, r.billets[0].id).especes).toBe(false); expect(attenduDeLaCaisse(caisseOuverte(FATOU)!)).toBe(20000);
  });
  it('trop tard : refusé sans toucher à la caisse', () => {
    const d = depart(), r = vendre({ agentId: FATOU, departId: d.id, sieges: libres(d, 1), passagers: pax(), moyen: 'especes' }); d.heure = '00:00'; d.jour = '2000-01-01';
    expect(() => rembourserAuGuichet(FATOU, r.billets[0].id)).toThrow(/remboursable/); expect(r.billets[0].statut).toBe('valide');
  });
  it('départ annulé : remboursement accordé, à payer en espèces une fois', () => {
    const d = depart(), r = vendre({ agentId: FATOU, departId: d.id, sieges: libres(d, 1), passagers: pax(), moyen: 'especes' }), b = r.billets[0];
    d.statut = 'annule'; b.statut = 'rembourse'; expect(lireBillet(b.code)!.dejaAccorde).toBe(true);
    expect(rembourserAuGuichet(FATOU, b.id)).toMatchObject({ rembourse: b.prix, frais: 0 }); expect(lireBillet(b.code)!.dejaAccorde).toBe(false);
  });
});

describe('clôture de caisse', () => {
  const compter = (total: number) => { const q: Record<string, number> = {}; let reste = total; for (const v of COUPURES) { q[String(v)] = Math.floor(reste / v); reste -= q[String(v)] * v; } return q; };
  it('sans ventes : attendu = fond ; caisse juste → fermée, en attente de validation puis validée par le superviseur', () => {
    app.monde.params.regles.bordereau = false; const c = caisseOuverte(FATOU)!;
    const r = cloturerCaisse({ agentId: FATOU, caisseId: c.id, compte: compter(20000) }); expect(r.niveau).toBe('juste'); expect(c).toMatchObject({ statut: 'fermee', attendu: 20000, ecart: 0 });
    expect(caisseOuverte(FATOU)).toBeUndefined(); expect(validerCaisse(c.id, 'p-abdou', '1357')).toBe(true); expect(c.statut).toBe('validee');
  });
  it('écart toléré : justification obligatoire ; écart > 1 000 F : le superviseur est prévenu', () => {
    app.monde.params.regles.bordereau = false; const c = caisseOuverte(FATOU)!;
    expect(() => cloturerCaisse({ agentId: FATOU, caisseId: c.id, compte: compter(19500) })).toThrow('justification_requise');
    const r = cloturerCaisse({ agentId: FATOU, caisseId: c.id, compte: compter(15000), justification: 'Monnaie rendue en trop' });
    expect(r).toMatchObject({ niveau: 'a_valider', montant: -5000 }); expect(c.justification).toBe('Monnaie rendue en trop');
    expect(app.monde.notifications.some((n) => n.destId === 'p-abdou' && n.titre === 'Clôture à valider')).toBe(true);
  });
  it('bordereau de dépôt obligatoire si la règle est active, conservé ensuite', () => {
    const c = caisseOuverte(FATOU)!; expect(app.monde.params.regles.bordereau).toBe(true);
    expect(() => cloturerCaisse({ agentId: FATOU, caisseId: c.id, compte: compter(20000) })).toThrow('bordereau_requis'); expect(c.statut).toBe('ouverte');
    cloturerCaisse({ agentId: FATOU, caisseId: c.id, compte: compter(20000), bordereau: 'data:image/jpeg;base64,AAAA' }); expect(etat().bordereaux[c.id]).toContain('data:image');
  });
  it('journée complète : ventes, annulation, remboursement, colis → attendu exact, clôture juste', () => {
    app.monde.params.regles.bordereau = false; const d = depart(), c = caisseOuverte(FATOU)!;
    const [a, b, e] = libres(d, 3);
    vendre({ agentId: FATOU, departId: d.id, sieges: [a, b], passagers: pax(2), moyen: 'especes' });
    const x = vendre({ agentId: FATOU, departId: d.id, sieges: [e], passagers: pax(), moyen: 'especes' }); const rb = rembourserAuGuichet(FATOU, x.billets[0].id);
    enregistrerColis({ agentId: FATOU, expediteur: { nom: '', tel: '' }, destinataire: { nom: 'Paul', tel: '699000222' }, taille: 'S', options: { moto: false, assurance: false }, vers: 'Douala' });
    // fond + 2 billets + billet remboursé (encaissé) + colis − somme rendue (prix − frais) = + frais
    expect(attenduDeLaCaisse(c)).toBe(20000 + totalVente(d, [a, b]) + 1000 + rb.frais);
    // les frais de remboursement sont des multiples de 50 F alors que la plus petite coupure comptée est 500 F : l’écart reste sous 500 F, toléré
    const fin = cloturerCaisse({ agentId: FATOU, caisseId: c.id, compte: compter(attenduDeLaCaisse(c)), justification: 'Pièces non comptées' });
    expect(Math.abs(fin.montant)).toBeLessThan(500); expect(['juste', 'tolere']).toContain(fin.niveau);
  });
});

describe('accueil et droits', () => {
  it('départs de la gare : Mvan seulement, triés, ni parti ni annulé', () => {
    const l = departsDeLaGare('mvan', 10); expect(l.length).toBe(10); expect(l.every((d) => app.monde.lignes.find((x) => x.id === d.ligneId)!.gareDe === 'mvan' && ['prevu', 'embarquement'].includes(d.statut))).toBe(true);
    const ts = l.map((d) => `${d.jour} ${d.heure}`); expect([...ts].sort()).toEqual(ts);
  });
  it('statistiques du jour et alertes', () => {
    const d = depart(); vendre({ agentId: FATOU, departId: d.id, sieges: libres(d, 2), passagers: pax(2), moyen: 'especes' });
    expect(statsDuJour(FATOU)).toMatchObject({ billets: 2, especes: 2 * d.prix, colis: 0 });
    const fatou = app.monde.personnes.find((p) => p.id === FATOU)!; expect(alertes(fatou)).toEqual([]); app.monde.caisses = []; expect(alertes(fatou)[0].texte).toContain('Caisse fermée');
  });
  it('contexte : l’agent est lui-même ; superviseur et patron consultent en lecture seule', () => {
    app.session.personneId = FATOU; app.session.role = 'guichet'; expect(contexte()).toMatchObject({ lecture: false, agent: { id: FATOU } });
    app.session.personneId = 'p-abdou'; app.session.role = 'superviseur'; expect(contexte()).toMatchObject({ lecture: true, agent: { gareId: 'mvan', role: 'guichet' } });
    app.session.personneId = 'p-luther'; app.session.role = 'patron'; expect(contexte().lecture).toBe(true);
  });
});

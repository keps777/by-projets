import { beforeEach, describe, expect, it } from 'vitest';
import { app, reinitialiser } from '../../data/store.svelte.ts';
import { ajouterJours } from '../../core/dates.ts';
import { contenuQr } from '../../core/sceau.ts';
import { planSieges } from '../../core/sieges.ts';
import { billetsDuDepart, connecter, departParId, regler, reserver, siegesIndisponibles } from '../../domain/actions.ts';
import * as T from './actions.ts';
import { aujourdhui, arretsDe, mouvementsArret, nbABord } from './commun.ts';
import { lireConvoyeur, lireControle, lireTerrain } from './etat.ts';

const demain = () => ajouterJours(aujourdhui(), 1);
const bus08 = (jour = demain()) => app.monde.departs.find((d) => d.jour === jour && d.heure === '08:00' && d.chauffeurId === 'p-emile')!;
/** Départ de 19:00 d'Émile : aucun billet au départ du monde de démonstration (contrairement à 08:00 qui a celui d'Aïcha). */
const bus19 = (jour = demain()) => app.monde.departs.find((d) => d.jour === jour && d.heure === '19:00' && d.chauffeurId === 'p-emile')!;
const siegesLibres = (departId: string, n: number) => { const d = departParId(departId)!, pris = siegesIndisponibles(d); return planSieges(d.ligneId.includes('VIP') ? 'VIP' : 'Classique', d.capacite).map((s) => s.id).filter((id) => !pris.has(id)).slice(0, n); };
function vendreAuGuichet(departId: string, n = 3) {
  const sieges = siegesLibres(departId, n);
  return reserver({ departId, sieges, passagers: sieges.map((_, i) => ({ nom: `Voyageur ${i + 1}`, tel: `69000010${i}` })), acheteurId: 'p-fatou', canal: 'guichet', moyen: 'especes' }).billets;
}
beforeEach(() => { reinitialiser(); T.affecterEquipages(); });

describe('équipages de démonstration', () => {
  it('Émile conduit et Youssouf convoie les départs de 08:00 VIP, 13:00 Bafoussam et 19:00 VIP', () => {
    const d = bus08(); expect(d).toBeTruthy(); expect(d.convoyeurId).toBe('p-youssouf');
    expect(T.feuilleDuJour('p-emile', 'chauffeur', demain()).map((x) => x.heure)).toEqual(['08:00', '13:00', '19:00']);
    expect(T.feuilleDuJour('p-youssouf', 'convoyeur', demain())).toHaveLength(3);
    const avant = JSON.stringify(app.monde.departs.map((x) => x.chauffeurId)); T.affecterEquipages(); expect(JSON.stringify(app.monde.departs.map((x) => x.chauffeurId))).toBe(avant);
  });
});

describe('quai', () => {
  it('scan : valide, déjà scanné, faux sceau, inconnu ; le compteur et les passages suivent', () => {
    const d = bus08(), [b1, b2] = vendreAuGuichet(d.id, 2);
    expect(T.compteurABord(d.id)).toBe(0);
    const p1 = T.scanQuai(contenuQr(b1.code, b1.sceau), 'p-ibrahim', d.id, 'qr'); expect(p1).toMatchObject({ statut: 'ok', billetId: b1.id, via: 'qr' }); expect(T.compteurABord(d.id)).toBe(1);
    const p2 = T.scanQuai(contenuQr(b1.code, b1.sceau), 'p-ibrahim', d.id, 'qr'); expect(p2.statut).toBe('deja_scanne'); expect(p2.message).toMatch(/^Déjà scanné à \d\d:\d\d$/); expect(T.compteurABord(d.id)).toBe(1);
    expect(T.scanQuai(`${b2.code}.000000000000`, 'p-ibrahim', d.id).statut).toBe('faux'); expect(b2.statut).toBe('valide');
    expect(T.scanQuai('zzzz9999', 'p-ibrahim', d.id).statut).toBe('inconnu');
    expect(T.scanQuai(b2.code.toLowerCase(), 'p-ibrahim', d.id, 'code').statut).toBe('ok');
    expect(T.passagesDuDepart(d.id).map((p) => p.statut)).toEqual(['ok', 'inconnu', 'faux', 'deja_scanne', 'ok']); expect(T.passageParId(null)?.id).toBe(T.passagesDuDepart(d.id)[0].id);
  });
  it('billet d’un autre départ refusé sans être consommé', () => {
    const d = bus08(), autre = app.monde.departs.find((x) => x.jour === demain() && x.id !== d.id && x.statut === 'prevu')!, [b] = vendreAuGuichet(autre.id, 1);
    expect(T.scanQuai(b.code, 'p-ibrahim', d.id).statut).toBe('mauvais_depart'); expect(b.statut).toBe('valide');
  });
  it('départ par défaut et choix du départ à embarquer', () => {
    const ibrahim = app.monde.personnes.find((p) => p.id === 'p-ibrahim')!, liste = T.departsDeLaGare(ibrahim, demain());
    expect(liste.length).toBeGreaterThan(3); expect(liste.every((d) => d.jour === demain())).toBe(true);
    const un = liste[2]; T.choisirDepart(un.id); expect(T.departDuQuai(ibrahim)?.id).toBe(un.id);
    un.statut = 'annule'; expect(T.departDuQuai(ibrahim)?.id).not.toBe(un.id);
  });
  it('appeler le superviseur : notification vers /superviseur/voir, une seule fois dans le journal', () => {
    const d = bus08(), [b] = vendreAuGuichet(d.id, 1); T.scanQuai(b.code, 'p-ibrahim', d.id); const p = T.scanQuai(b.code, 'p-ibrahim', d.id);
    const sup = T.appelerSuperviseur(p.id, 'p-ibrahim'); expect(sup.map((s) => s.id)).toEqual(['p-abdou']);
    expect(app.monde.notifications.find((n) => n.destId === 'p-abdou' && n.type === 'quai')).toMatchObject({ lien: `/superviseur/voir?billet=${b.id}`, titre: 'Quai · billet déjà scanné' });
    expect(T.passageParId(p.id)?.superviseurAppele).toBeTypeOf('number');
    T.verifierIdentite(p.id, false, 'p-ibrahim'); expect(T.passageParId(p.id)).toMatchObject({ identite: 'non', refuse: true });
  });
  it('billets de démonstration et scans simulables', () => {
    const d = bus19(); const bs = T.genererBilletsDemo(d.id, 'p-ibrahim', 4); expect(bs).toHaveLength(4);
    const s = T.scansSimulables(d.id); expect(s.valides).toHaveLength(4); expect(s.essais.some((e) => e.id === 'faux')).toBe(true);
    expect(T.scanQuai(s.valides[0].contenu, 'p-ibrahim', d.id, 'liste').statut).toBe('ok');
  });
});

describe('chauffeur', () => {
  /** Rejoue « maintenant = heure du départ + minutes » en déplaçant le départ dans le temps. */
  function departEnRetard(minutesRetard: number) {
    const d = bus08(aujourdhui()), t = new Date(Date.now() - minutesRetard * 60_000), p = (n: number) => String(n).padStart(2, '0');
    d.jour = aujourdhui(); d.heure = `${p(t.getHours())}:${p(t.getMinutes())}`; d.statut = 'embarquement'; d.retardMin = 0; return d;
  }
  it('départ bloqué tant que l’embarquement est fermé ou que la check-list est incomplète', () => {
    const d = bus08(); expect(T.blocageDepart(d)).toBe('pas_ouvert'); expect(() => T.partir(d.id, 'p-emile')).toThrow('pas_ouvert');
    const e = departEnRetard(0); expect(T.blocageDepart(e)).toBe('checklist');
    for (const c of T.CHECKLIST) T.cocher(e.id, c.id); expect(T.checklistComplete(lireTerrain().suivis[e.id])).toBe(true); expect(T.blocageDepart(e)).toBeNull();
  });
  it('Départ : le bus passe à « parti », le retard réel est annoncé aux voyageurs', () => {
    const d = departEnRetard(12), [b] = vendreAuGuichet(d.id, 2); T.scanQuai(b.code, 'p-ibrahim', d.id);
    for (const c of T.CHECKLIST) T.cocher(d.id, c.id);
    T.partir(d.id, 'p-emile'); expect(d.statut).toBe('parti'); expect(d.retardMin).toBe(12);
    expect(app.monde.notifications.some((n) => n.titre === 'Retard +12 min')).toBe(true); expect(T.etapeDe(d)).toBe('route'); expect(lireTerrain().suivis[d.id]).toMatchObject({ k: 1, etape: 'route' });
    expect(() => T.partir(d.id, 'p-emile')).toThrow('deja_parti');
  });
  it('annoncer un retard sans partir', () => { const d = bus08(); T.declarerRetard(d.id, 20, 'p-emile'); expect(d.retardMin).toBe(20); expect(d.statut).toBe('prevu'); });
  it('arrêt : arrivée, descentes, montée au scan, incident, départ de l’arrêt', () => {
    const d = bus08(), bs = vendreAuGuichet(d.id, 5); for (const b of bs) T.scanQuai(b.code, 'p-ibrahim', d.id);
    d.statut = 'parti'; expect(T.etapeDe(d)).toBe('route'); T.accelerer(d.id);
    const n = arretsDe(d).length; expect(n).toBe(7);
    // on cherche un arrêt avec au moins un voyageur qui descend ou monte
    const s = T.etapeDe(d); expect(s).toBe('route');
    T.arriverArret(d.id, 'p-emile'); expect(lireTerrain().suivis[d.id]).toMatchObject({ etape: 'arret', vitesse: 0 });
    const avant = nbABord(d.id); T.basculerDescente(d.id, bs[0].id); expect(nbABord(d.id)).toBe(avant - 1); T.basculerDescente(d.id, bs[0].id); expect(nbABord(d.id)).toBe(avant);
    T.prolongerArret(d.id); const t0 = lireTerrain().suivis[d.id].arriveeArretA; expect(t0).toBeLessThan(Date.now());
    T.signalerIncident(d.id, 'Panne', 'pneu', 'p-emile'); expect(app.monde.notifications.find((x) => x.type === 'incident')).toMatchObject({ destId: 'p-abdou', titre: 'Incident · Panne' });
    T.repartir(d.id, 'p-emile'); expect(lireTerrain().suivis[d.id]).toMatchObject({ k: 2, etape: 'route' });
    expect(mouvementsArret(d, 0, {}).montent).toEqual([]);
  });
  it('excès de vitesse : prévient la gare une seule fois', () => {
    const d = bus08(); T.suiviDe(d.id).vitesse = 78; for (let i = 0; i < 3; i++) T.accelerer(d.id);
    expect(lireTerrain().suivis[d.id].vitesse).toBe(102); expect(app.monde.notifications.filter((n) => n.type === 'vitesse')).toHaveLength(1);
  });
  it('terminus : le trajet est terminé sans toucher au statut du monde', () => {
    const d = bus08(), n = arretsDe(d).length; d.statut = 'parti'; T.suiviDe(d.id).k = n - 1; T.arriverArret(d.id, 'p-emile'); expect(T.etapeDe(d)).toBe('termine'); expect(d.statut).toBe('parti');
  });
  it('monter à un arrêt : le chauffeur scanne le billet', () => {
    const d = bus08(), [b] = vendreAuGuichet(d.id, 1); expect(T.monterAuArret(d.id, b.id, 'p-emile').statut).toBe('ok'); expect(b.statut).toBe('scanne'); expect(T.monterAuArret(d.id, b.id, 'p-emile').statut).toBe('ok');
    expect(() => T.monterAuArret('autre', b.id, 'p-emile')).toThrow();
  });
});

describe('convoyeur', () => {
  it('vente en espèces : billet canal convoyeur, scanné à bord, prix de l’arrêt, commission 5 %', () => {
    const d = bus19(), prix = T.prixAuDepart(d.id, 2); expect(prix).toBeGreaterThan(0); expect(prix).toBeLessThan(d.prix);
    const { vente, enFile } = T.vendreEnRoute({ agentId: 'p-youssouf', departId: d.id, arret: 2, moyen: 'especes', tel: '690000000', nom: 'Mireille' }); expect(enFile).toBe(false);
    const b = app.monde.billets.find((x) => x.code === vente.code)!; expect(b).toMatchObject({ canal: 'convoyeur', statut: 'scanne', prix, acheteurId: 'p-youssouf', siege: null }); expect(lireTerrain().montees[b.id]).toBe(2);
    expect(app.monde.paiements.find((p) => p.id === b.paiementId)).toMatchObject({ moyen: 'especes', statut: 'ok' });
    const bil = T.bilanVentes('p-youssouf', d.id); expect(bil).toMatchObject({ n: 1, especes: prix, momo: 0, total: prix, commission: Math.round(prix * 0.05) }); expect(nbABord(d.id)).toBe(1);
  });
  it('vente MoMo confirmée sur le champ, sans notification parasite pour le convoyeur', () => {
    const d = bus19(), avant = app.monde.notifications.length; T.vendreEnRoute({ agentId: 'p-youssouf', departId: d.id, arret: 1, moyen: 'momo' });
    const b = billetsDuDepart(d.id)[0]; expect(b.statut).toBe('scanne'); expect(app.monde.paiements.find((p) => p.id === b.paiementId)?.moyen).toBe('momo'); expect(app.monde.notifications.length).toBe(avant);
    expect(T.bilanVentes('p-youssouf', d.id).momo).toBe(b.prix);
  });
  it('hors ligne : les ventes partent en file avec un code, puis la synchronisation crée les billets avec les mêmes codes', () => {
    const d = bus19(); T.reglerHorsLigne(true); expect(lireConvoyeur().horsLigne).toBe(true);
    const a = T.vendreEnRoute({ agentId: 'p-youssouf', departId: d.id, arret: 1, moyen: 'especes', tel: '691111111' }), b = T.vendreEnRoute({ agentId: 'p-youssouf', departId: d.id, arret: 3, moyen: 'momo' });
    expect(a.enFile && b.enFile).toBe(true); expect(a.vente.code).not.toBe(b.vente.code); expect(billetsDuDepart(d.id)).toHaveLength(0); expect(lireConvoyeur().file).toHaveLength(2);
    expect(T.bilanVentes('p-youssouf', d.id)).toMatchObject({ n: 2, enFile: 2 });
    const r = T.reglerHorsLigne(false); expect(r).toEqual({ envoyees: 2, echecs: 0 }); expect(lireConvoyeur().file).toHaveLength(0);
    const codes = billetsDuDepart(d.id).map((x) => x.code).sort(); expect(codes).toEqual([a.vente.code, b.vente.code].sort()); expect(billetsDuDepart(d.id).every((x) => x.statut === 'scanne')).toBe(true);
    expect(T.bilanVentes('p-youssouf', d.id).enFile).toBe(0); expect(lireConvoyeur().derniereSync).toBeTypeOf('number');
  });
  it('bus complet : refus, y compris à cause de la file hors ligne ; échec de synchronisation conservé', () => {
    const d = bus19(); d.prisAilleurs = d.prisAilleurs.slice(0, 0); const libres = d.capacite; d.prisAilleurs = Array.from({ length: libres - 1 }, (_, i) => `x${i}`);
    T.reglerHorsLigne(true); T.vendreEnRoute({ agentId: 'p-youssouf', departId: d.id, arret: 1, moyen: 'especes' });
    expect(() => T.vendreEnRoute({ agentId: 'p-youssouf', departId: d.id, arret: 1, moyen: 'especes' })).toThrow('complet');
    d.prisAilleurs.push('y'); const r = T.reglerHorsLigne(false); expect(r).toEqual({ envoyees: 0, echecs: 1 });
    const f = lireConvoyeur().file[0]; expect(f).toMatchObject({ etat: 'echec', erreur: 'Bus complet : plus aucune place libre' }); T.abandonnerVente(f.id); expect(lireConvoyeur().file).toHaveLength(0);
  });
  it('terminus : pas de vente', () => { const d = bus19(), n = arretsDe(d).length; expect(() => T.vendreEnRoute({ agentId: 'p-youssouf', departId: d.id, arret: n - 1, moyen: 'especes' })).toThrow('terminus'); });
  it('remise des espèces : une seule fois', () => {
    const d = bus19(); T.vendreEnRoute({ agentId: 'p-youssouf', departId: d.id, arret: 1, moyen: 'especes' }); const m = T.bilanVentes('p-youssouf', d.id).especes;
    expect(T.remettreEspecesConvoyeur('p-youssouf', d.id, aujourdhui())).toBe(m); expect(T.remettreEspecesConvoyeur('p-youssouf', d.id, aujourdhui())).toBe(0); expect(app.monde.notifications.some((n) => n.titre === 'Remise du convoyeur')).toBe(true);
  });
});

describe('vendeuse ambulante', () => {
  it('propose le prochain départ de chaque destination', () => {
    const l = T.departsVendables('BX', 'Yaoundé'); expect(l.length).toBeGreaterThanOrEqual(3); const cles = l.map((d) => `${d.ligneId}`); expect(new Set(cles).size).toBe(l.length);
  });
  it('espèces à elle ou MoMo compagnie : billet canal vendeur, commission 5 % du jour, remise du soir', () => {
    const d = T.departsVendables('BX', 'Yaoundé')[0], a = T.vendreAmbulant({ agentId: 'p-brigitte', departId: d.id, moyen: 'especes', tel: '690123456' }), b = T.vendreAmbulant({ agentId: 'p-brigitte', departId: d.id, moyen: 'momo' });
    expect(a).toMatchObject({ canal: 'vendeur', statut: 'valide', acheteurId: 'p-brigitte', siege: null }); expect(b.statut).toBe('valide');
    const bil = T.bilanVendeur('p-brigitte'); expect(bil).toMatchObject({ n: 2, total: a.prix + b.prix, especes: a.prix, momo: b.prix, commission: Math.round((a.prix + b.prix) * 0.05), aRemettre: a.prix }); expect(bil.dernier?.id).toBe(b.id);
    expect(app.monde.notifications.filter((n) => n.destId === 'p-brigitte')).toHaveLength(0);
    expect(T.remettreEspeces('p-brigitte')).toBe(a.prix); expect(T.remettreEspeces('p-brigitte')).toBe(0); expect(T.bilanVendeur('p-brigitte').aRemettre).toBe(0);
  });
  it('jour sans vente : bilan à zéro', () => { expect(T.bilanVendeur('p-brigitte')).toMatchObject({ n: 0, total: 0, commission: 0, aRemettre: 0 }); });
});

describe('contrôleur', () => {
  it('comptage, écart et fraude probable', () => {
    const d = bus19(); vendreAuGuichet(d.id, 3); T.compter(d.id, 4); const c = T.chiffresControle(d.id);
    expect(c).toMatchObject({ valides: 3, comptes: 4, papier: 3 }); expect(c.verdict).toMatchObject({ ecart: 1, niveau: 'fraude' }); T.compter(d.id, -10); expect(T.chiffresControle(d.id).comptes).toBe(0); T.compter(d.id, 2); T.remettreAZero(d.id); expect(lireControle(d.id).comptes).toBe(0);
  });
  it('scan de contrôle : compte une fois, refuse faux / autre départ / inconnu', () => {
    const d = bus19(), [b] = vendreAuGuichet(d.id, 1), autre = app.monde.departs.find((x) => x.jour === demain() && x.id !== d.id && x.statut === 'prevu')!, [o] = vendreAuGuichet(autre.id, 1);
    expect(T.controlerBillet(d.id, contenuQr(b.code, b.sceau), 'p-clarisse').resultat).toBe('ok'); expect(T.controlerBillet(d.id, b.code, 'p-clarisse').resultat).toBe('deja'); expect(lireControle(d.id).comptes).toBe(1);
    expect(T.controlerBillet(d.id, `${b.code}.000000000000`, 'p-clarisse').resultat).toBe('faux'); expect(T.controlerBillet(d.id, o.code, 'p-clarisse').resultat).toBe('autre_depart'); expect(T.controlerBillet(d.id, 'ZZZZ9999', 'p-clarisse').resultat).toBe('inconnu');
    T.controleBascule(d.id, b.id); expect(lireControle(d.id).comptes).toBe(0);
  });
  it('voyageur sans billet : vente sur place + amende, ou geste sans amende ; l’écart se résorbe', () => {
    const d = bus19(); vendreAuGuichet(d.id, 2); T.compter(d.id, 3); expect(T.chiffresControle(d.id).verdict.ecart).toBe(1);
    const s = T.verbaliser({ departId: d.id, agentId: 'p-clarisse', nom: 'Hervé', tel: '690000000', geste: false, moyen: 'especes' });
    expect(s).toMatchObject({ prix: d.prix, amende: d.prix, geste: false }); expect(T.chiffresControle(d.id).verdict.ecart).toBe(0); expect(T.totalAmendes(d.id)).toBe(d.prix);
    const g = T.verbaliser({ departId: d.id, agentId: 'p-clarisse', nom: 'Anne', tel: '', geste: true, moyen: 'momo' }); expect(g.amende).toBe(0); expect(T.totalAmendes(d.id)).toBe(d.prix);
    T.signalerSansBillet(d.id, 'p-clarisse', 'Fuyard', ''); expect(T.anomalies(d.id).some((a) => a.titre === '1 voyageur sans billet')).toBe(true);
  });
  it('anomalies : refus au quai, ventes du convoyeur non synchronisées', () => {
    const d = bus19(), [b] = vendreAuGuichet(d.id, 1); T.scanQuai(b.code, 'p-ibrahim', d.id); T.scanQuai(b.code, 'p-ibrahim', d.id);
    T.reglerHorsLigne(true); T.vendreEnRoute({ agentId: 'p-youssouf', departId: d.id, arret: 1, moyen: 'especes' });
    const titres = T.anomalies(d.id).map((a) => a.titre); expect(titres.some((t) => /déjà scanné/.test(t))).toBe(true); expect(titres.some((t) => /pas synchronisée/.test(t))).toBe(true);
  });
  it('rapport à la gare et litige chauffeur', () => {
    const d = bus19(); vendreAuGuichet(d.id, 1); T.compter(d.id, 3);
    const r = T.envoyerRapport(d.id, 'p-clarisse'); expect(r).toEqual({ superviseurs: 1, ecart: 2 }); expect(app.monde.notifications.find((n) => n.type === 'controle')).toMatchObject({ destId: 'p-abdou', lien: '/superviseur/voir' }); expect(lireControle(d.id).rapportA).toBeTypeOf('number');
    const l = T.ouvrirLitigeChauffeur(d.id, 'p-clarisse', ''); expect(app.monde.litiges[0]).toMatchObject({ id: l.id, type: 'chauffeur', statut: 'ouvert', auteurId: 'p-clarisse', objet: { type: 'depart', id: d.id } }); expect(l.texte).toMatch(/3 comptés/);
  });
  it('bus à contrôler : un bus en route de préférence', () => {
    const d = bus08(aujourdhui()); d.statut = 'parti'; expect(T.departAControler('BX', aujourdhui())?.statut).toBe('parti');
  });
});

describe('conducteur de covoiturage', () => {
  it('démarrer, terminer, gains versés ; refus d’une réservation avant le départ', () => {
    const o = app.monde.covoits.find((x) => x.conducteurId === 'p-moussa')!; expect(T.trajetCourant('p-moussa')?.id).toBe(o.id);
    T.simulerReservation(o.id); T.simulerReservation(o.id, 'p-maman'); expect(T.placesReservees(o)).toBe(2); expect(app.monde.notifications.filter((n) => n.destId === 'p-moussa')).toHaveLength(2);
    T.refuserReservation(o.id, 1, 'p-moussa'); expect(T.placesReservees(o)).toBe(1); expect(app.monde.notifications.find((n) => n.destId === 'p-maman')?.titre).toBe('Réservation refusée');
    expect(() => T.terminerCovoit(o.id, 'p-moussa')).toThrow('pas_en_route'); T.demarrerCovoit(o.id, 'p-moussa'); expect(o.statut).toBe('en_route'); expect(() => T.demarrerCovoit(o.id, 'p-moussa')).toThrow('deja_demarre'); expect(() => T.refuserReservation(o.id, 0, 'p-moussa')).toThrow('trop_tard');
    expect(T.terminerCovoit(o.id, 'p-moussa')).toBe(o.prix); expect(o.statut).toBe('terminee');
    const g = T.gainsConducteur('p-moussa', new Date(`${o.jour}T12:00:00`).getTime()); expect(g).toMatchObject({ mois: o.prix, passagersMois: 1, verse: o.prix, aVenir: 0, trajetsMois: 1 });
  });
  it('un autre conducteur ne peut pas agir sur ce trajet ; complet', () => {
    const o = app.monde.covoits.find((x) => x.conducteurId === 'p-moussa')!; expect(() => T.demarrerCovoit(o.id, 'p-aminata')).toThrow('offre_inconnue');
    for (let i = 0; i < o.places; i++) T.simulerReservation(o.id); expect(() => T.simulerReservation(o.id)).toThrow('complet'); expect(T.gainPotentiel(o)).toBe(o.places * o.prix);
  });
});

describe('moi', () => {
  it('notifications lues, déconnexion', () => {
    connecter('p-ibrahim'); T.appelerSuperviseur(T.scanQuai('ZZZZ9999', 'p-ibrahim', bus08().id).id, 'p-ibrahim');
    const n = app.monde.notifications.find((x) => x.destId === 'p-abdou')!; T.marquerLue(n.id); expect(n.lu).toBe(true); T.toutMarquerLu('p-abdou'); expect(app.monde.notifications.filter((x) => x.destId === 'p-abdou').every((x) => x.lu)).toBe(true);
    T.deconnecter(); expect(app.session.personneId).toBeNull();
  });
  it('un billet payé hors terrain reste cohérent avec regler()', () => { const d = bus08(); const r = reserver({ departId: d.id, sieges: siegesLibres(d.id, 1), passagers: [{ nom: 'X', tel: '1' }], acheteurId: 'p-aicha', canal: 'app', moyen: 'momo' }); regler(r.paiement.id, { ok: true }); expect(T.scanQuai(r.billets[0].code, 'p-ibrahim', d.id).statut).toBe('ok'); });
});

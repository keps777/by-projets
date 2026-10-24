import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app, reinitialiser } from '../../data/store.svelte.ts';
import { billetParId, billetsDe, departParId, placesLibres } from '../../domain/actions.ts';
import { alternativeAuRetard, amorcerVille, annulerCourse, annulerOffre, avancerCourse, billetASuivre, choisirRetard, commanderCourse, courseActive, crediterCagnotte, demarrerTrajet, leverRetard, monterEnRoute,
  offresVilleProches, publierOffre, refuserReservation, simulerReservation, terminerTrajet, versementDe, arretsDuDepart } from './actions.ts';
import { annoncerRetard } from '../../domain/actions.ts';
import { cagnotteDe, lire } from './etat.ts';
import { lignesReseau, busEnRoute } from './reseau.ts';

const HORS = { femmes: false, bagages: true, arrets: false };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-02T20:00:00')); reinitialiser(); });
afterEach(() => vi.useRealTimers());
const bAicha = () => billetsDe('p-aicha')[0];

describe('suivi du bus', () => {
  it('le billet à suivre est le prochain billet valide ; plus rien après remboursement', () => {
    expect(billetASuivre('p-aicha')?.code).toBe('AM7F3K22'); const b = bAicha(); b.statut = 'rembourse'; expect(billetASuivre('p-aicha')).toBeUndefined();
  });
  it('un billet scanné dont le bus est parti reste suivi, puis disparaît 3 h après l’arrivée', () => {
    const b = bAicha(), d = departParId(b.departId)!; b.statut = 'scanne'; d.statut = 'parti';
    vi.setSystemTime(new Date('2026-11-03T09:00:00')); expect(billetASuivre('p-aicha')?.id).toBe(b.id);
    d.statut = 'arrive'; vi.setSystemTime(new Date('2026-11-03T11:30:00')); expect(billetASuivre('p-aicha')?.id).toBe(b.id);
    vi.setSystemTime(new Date('2026-11-03T15:00:00')); expect(billetASuivre('p-aicha')).toBeUndefined();
  });
  it('arrêts du départ d’Aïcha : horaires du VIP de 08:00 (195 min)', () => {
    const a = arretsDuDepart(departParId(bAicha().departId)!); expect(a[0].heure).toBe('08:00'); expect(a.at(-1)!.heure).toBe('11:15'); expect(a).toHaveLength(7);
  });
});

describe('retard et geste commercial', () => {
  it('garder sa place : geste de 500 F crédité une seule fois', () => {
    const b = bAicha(); annoncerRetard(b.departId, 45);
    const r = choisirRetard(b.id, 'attendre'); expect(r).toMatchObject({ geste: 500, rembourse: 0, redirection: `/pass?billet=${b.id}` }); expect(cagnotteDe('p-aicha')).toBe(500); expect(b.statut).toBe('valide');
    expect(choisirRetard(b.id, 'attendre').geste).toBe(0); expect(cagnotteDe('p-aicha')).toBe(500);
    expect(app.monde.notifications.some((n) => n.titre === 'Geste commercial')).toBe(true);
  });
  it('changer de départ : annulation sans frais, retour à l’accueil, geste ajouté', () => {
    const b = bAicha(), d = departParId(b.departId)!, libresAvant = placesLibres(d); annoncerRetard(b.departId, 45);
    const r = choisirRetard(b.id, 'changer'); expect(r.redirection).toBe('/'); expect(r.rembourse).toBe(b.prix); expect(b.statut).toBe('rembourse'); expect(placesLibres(d)).toBe(libresAvant + 1); expect(cagnotteDe('p-aicha')).toBe(500);
    expect(lire().gestes[b.id].choix).toBe('changer');
  });
  it('rembourser : remboursement total vers /pass/annule', () => {
    const b = bAicha(); annoncerRetard(b.departId, 60); const r = choisirRetard(b.id, 'rembourser');
    expect(r.redirection).toBe(`/pass/annule?billet=${b.id}`); expect(r.rembourse).toBe(7500); expect(app.monde.paiements.find((p) => p.id === b.paiementId)!.statut).toBe('rembourse');
  });
  it('moins de 30 min : pas de geste ; sans retard : refus ; billet déjà scanné : pas de remboursement', () => {
    const b = bAicha(); expect(() => choisirRetard(b.id, 'attendre')).toThrow('pas_de_retard');
    annoncerRetard(b.departId, 20); expect(choisirRetard(b.id, 'attendre').geste).toBe(0); expect(cagnotteDe('p-aicha')).toBe(0);
    annoncerRetard(b.departId, 45); b.statut = 'scanne'; expect(() => choisirRetard(b.id, 'rembourser')).toThrow('billet_non_remboursable'); expect(choisirRetard(b.id, 'attendre').geste).toBe(500);
  });
  it('lever le retard prévient les voyageurs', () => { const b = bAicha(); annoncerRetard(b.departId, 45); leverRetard(b.departId); expect(departParId(b.departId)!.retardMin).toBe(0); expect(app.monde.notifications[0].titre).toBe('Ton bus repart à l’heure'); });
  it('alternative : un autre départ de la ligne, à l’heure, avec des places', () => {
    const b = bAicha(), d = departParId(b.departId)!; annoncerRetard(d.id, 45); const alt = alternativeAuRetard(d)!;
    expect(alt).toBeDefined(); expect(alt.id).not.toBe(d.id); expect(alt.jour).toBe(d.jour); expect(alt.retardMin).toBe(0);
  });
});

describe('monter en route', () => {
  const depart = () => departParId(bAicha().departId)!;
  it('billet sans siège au prix prorata, enregistré dans la tranche', () => {
    const d = depart(), avant = placesLibres(d), r = monterEnRoute(d.id, 'edea', 'p-aicha');
    expect(r.billet.siege).toBeNull(); expect(r.prix).toBeLessThan(d.prix); expect(r.billet.prix).toBe(r.prix); expect(r.paiement.statut).toBe('attente'); expect(placesLibres(d)).toBe(avant - 1);
    expect(lire().montees[r.billet.id]).toMatchObject({ arret: 'Edéa', prix: r.prix }); expect(billetParId(r.billet.id)!.statut).toBe('attente_paiement');
  });
  it('arrêt déjà passé ou inconnu : refus', () => {
    const d = depart(); d.statut = 'parti'; vi.setSystemTime(new Date('2026-11-03T08:40:00'));
    expect(() => monterEnRoute(d.id, 'mbankomo', 'p-aicha')).toThrow('arret_passe'); expect(() => monterEnRoute(d.id, 'nulle-part', 'p-aicha')).toThrow('arret_inconnu');
    expect(monterEnRoute(d.id, 'pouma', 'p-aicha').arret.nom).toBe('Pouma');
  });
  it('bus complet ou arrivé : refus', () => {
    const d = depart(); d.prisAilleurs = Array.from({ length: d.capacite }, (_, i) => `x${i}`); expect(() => monterEnRoute(d.id, 'edea', 'p-aicha')).toThrow('complet');
    d.statut = 'arrive'; expect(() => monterEnRoute(d.id, 'edea', 'p-aicha')).toThrow();
  });
});

describe('course vers la gare', () => {
  const dId = () => bAicha().departId;
  it('commande en MoMo puis suivi en 4 étapes jusqu’à la gare', () => {
    const c = commanderCourse({ personneId: 'p-aicha', departId: dId(), mode: 'moto', quartier: 'Bastos', moyen: 'momo' });
    expect(c.prix).toBe(700); expect(courseActive('p-aicha')?.id).toBe(c.id);
    avancerCourse(c.id); avancerCourse(c.id); expect(c.etape).toBe(2); expect(c.statut).toBe('en_cours'); avancerCourse(c.id); expect(c.etape).toBe(3); expect(c.statut).toBe('terminee'); expect(courseActive('p-aicha')).toBeUndefined();
    expect(app.monde.notifications[0].titre).toBe('Course terminée');
  });
  it('cagnotte : refusée si insuffisante, débitée sinon, rendue à l’annulation', () => {
    const base = { personneId: 'p-aicha', departId: dId(), mode: 'moto' as const, quartier: 'Bastos', moyen: 'cagnotte' as const };
    expect(() => commanderCourse(base)).toThrow('solde_insuffisant'); crediterCagnotte('p-aicha', 1000);
    const c = commanderCourse(base); expect(cagnotteDe('p-aicha')).toBe(300); annulerCourse(c.id); expect(c.statut).toBe('annulee'); expect(cagnotteDe('p-aicha')).toBe(1000);
  });
  it('une seule course à la fois ; annulation impossible une fois commencée ; bus parti refusé', () => {
    const c = commanderCourse({ personneId: 'p-aicha', departId: dId(), mode: 'taxi', quartier: 'Mendong', moyen: 'especes' });
    expect(() => commanderCourse({ personneId: 'p-aicha', departId: dId(), mode: 'moto', quartier: 'Bastos', moyen: 'momo' })).toThrow('course_en_cours');
    avancerCourse(c.id); expect(() => annulerCourse(c.id)).toThrow('course_commencee'); avancerCourse(c.id); avancerCourse(c.id);
    departParId(dId())!.statut = 'parti'; expect(() => commanderCourse({ personneId: 'p-aicha', departId: dId(), mode: 'moto', quartier: 'Bastos', moyen: 'momo' })).toThrow('depart_ferme');
  });
});

describe('covoiturage', () => {
  const saisie = { de: 'Yaoundé', vers: 'Douala', jour: '2026-11-03', heure: '07:30', places: 3, prix: 5000, vehicule: 'Toyota Corolla' };
  it('publier une offre l’ajoute au monde ; saisie invalide refusée', () => {
    const n = app.monde.covoits.length, o = publierOffre({ ...saisie, pointDepart: 'Bastos' }, 'p-aicha', HORS);
    expect(app.monde.covoits).toHaveLength(n + 1); expect(o).toMatchObject({ conducteurId: 'p-aicha', depart: 'Bastos', statut: 'ouverte', enVille: false, places: 3 });
    expect(() => publierOffre({ ...saisie, vers: 'Yaoundé' }, 'p-aicha', HORS)).toThrow('différents'); expect(() => publierOffre({ ...saisie, jour: '2026-11-01' }, 'p-aicha', HORS)).toThrow('passé');
  });
  it('réservations reçues, refus remboursé, départ puis arrivée : 10 % de commission', () => {
    const o = publierOffre(saisie, 'p-aicha', HORS);
    simulerReservation(o.id, 'p-maman', 2); simulerReservation(o.id, 'p-paul', 1); expect(() => simulerReservation(o.id, 'p-maman', 1)).toThrow('complet');
    expect(app.monde.notifications.filter((n) => n.destId === 'p-aicha' && n.titre === 'Nouvelle réservation')).toHaveLength(2);
    refuserReservation(o.id, 'p-aicha', 'p-paul'); expect(o.reservations).toHaveLength(1); expect(app.monde.paiements.filter((p) => p.pour.type === 'covoit' && p.statut === 'rembourse')).toHaveLength(1);
    expect(() => terminerTrajet(o.id, 'p-aicha')).toThrow('offre_non_demarree'); expect(() => demarrerTrajet(o.id, 'p-moussa')).toThrow('pas_ton_trajet');
    demarrerTrajet(o.id, 'p-aicha'); expect(o.statut).toBe('en_route'); expect(() => annulerOffre(o.id, 'p-aicha')).toThrow('offre_fermee');
    expect(terminerTrajet(o.id, 'p-aicha')).toBe(9000); expect(o.statut).toBe('terminee'); expect(versementDe(o.id)?.montant).toBe(9000);
  });
  it('annuler le trajet rembourse tous les voyageurs', () => {
    const o = publierOffre(saisie, 'p-aicha', HORS); simulerReservation(o.id, 'p-maman', 1); annulerOffre(o.id, 'p-aicha');
    expect(o.statut).toBe('annulee'); expect(o.reservations).toHaveLength(0); expect(app.monde.notifications.some((n) => n.destId === 'p-maman' && n.sous.includes('remboursés'))).toBe(true);
  });
  it('covoiturage en ville : trois départs créés une fois, renouvelés quand ils sont passés', () => {
    expect(amorcerVille()).toBe(3); expect(offresVilleProches()).toHaveLength(3); expect(amorcerVille()).toBe(0);
    vi.setSystemTime(new Date('2026-11-02T22:00:00')); expect(offresVilleProches()).toHaveLength(0); expect(amorcerVille()).toBe(3); expect(offresVilleProches()).toHaveLength(3);
    expect(app.monde.covoits.filter((o) => o.enVille)).toHaveLength(3);
  });
});

describe('réseau', () => {
  it('bus en route et lignes du jour avec leur état', () => {
    vi.setSystemTime(new Date('2026-11-02T09:00:00')); reinitialiser();
    const enRoute = busEnRoute(); expect(enRoute.length).toBeGreaterThan(3); expect(enRoute.every((d) => d.statut === 'parti')).toBe(true);
    expect(busEnRoute('BX').every((d) => d.id.includes('BX'))).toBe(true);
    const l = lignesReseau(undefined)[0]; expect(l.enRoute).toBeGreaterThan(0); expect(l.etat).toBe('fluide');
    const d = enRoute[0]; const cle = app.monde.lignes.find((x) => x.id === d.ligneId)!; annoncerRetard(d.id, 30);
    expect(lignesReseau().find((x) => x.cle === `${cle.de}|${cle.vers}`)!.etat).toBe('perturbe');
    expect(lignesReseau('GE').every((x) => x.compagnies.every((c) => c === 'GE'))).toBe(true);
  });
});

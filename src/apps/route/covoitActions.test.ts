import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app, reinitialiser } from '../../data/store.svelte.ts';
import { encoder } from '../../data/codec.ts';
import { placesRestantes } from '../../core/covoit.ts';
import { saisieVide, type SaisieProfil } from '../../core/covoitProfil.ts';
import { codePriseEnCharge } from '../../core/covoitRegles.ts';
import { etat as etatReglement } from '../reglement/etat.ts';
import { demarrerTrajet, simulerReservation, terminerTrajet } from './actions.ts';
import {
  amorcerCovoit, annulerReservation, aNote, basculerPartage, choisirMode, confirmerMontee, declencherSOS, enregistrerProfil, estMonte, gainsDuMois, infoOffre, joursDePublication, mesReservations, mesTrajets, modeCovoit, noterTrajet,
  occupantsDe, partageActif, preparerPaiement, profilDe, profilEstComplet, publierTrajets, remboursementAnnulation, signalerCovoit
} from './covoitActions.ts';
import { lire } from './etat.ts';

const OPTS = { femmes: false, bagages: true, arrets: false };
const bonne = (): SaisieProfil => ({ ...saisieVide(), cni: '112233445', recto: 'data:image/jpeg;base64,AA', verso: 'data:image/jpeg;base64,BB', permis: 'CE-123456', validite: '2029-05-01', marque: 'Toyota', modele: 'Yaris', couleur: 'Blanc', plaque: 'ce 100 aa', places: 3, carrosserie: 'citadine', photos: ['data:image/jpeg;base64,CC'] });
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-02T20:00:00')); reinitialiser(); });
afterEach(() => vi.useRealTimers());
/** Une offre d'Aïcha conductrice (profil complet) à `jour` 09:00, avec une réservation payée de Marie. */
function offreAvecResa(jour = '2026-11-04') {
  enregistrerProfil('p-aicha', bonne());
  const [o] = publierTrajets({ enVille: false, de: 'Yaoundé', vers: 'Douala', point: 'Mvan', jour, heure: '09:00', places: 3, prix: 5000, recurrent: false }, 'p-aicha', OPTS);
  simulerReservation(o.id, 'p-maman', 1); return o;
}

describe('démonstration', () => {
  it('amorcerCovoit : conducteurs, profils et offres sur 7 jours, sans doublon au second appel', () => {
    const avant = app.monde.covoits.length, n = amorcerCovoit();
    expect(n).toBeGreaterThanOrEqual(15); expect(app.monde.covoits).toHaveLength(avant + n); expect(amorcerCovoit()).toBe(0);
    expect(new Set(app.monde.covoits.map((o) => o.id)).size).toBe(app.monde.covoits.length);
    expect(app.monde.personnes.filter((p) => p.id.startsWith('p-cv-')).length).toBeGreaterThanOrEqual(6); expect(profilEstComplet('p-moussa')).toBe(true);
    expect(app.monde.covoits.every((o) => app.monde.personnes.some((p) => p.id === o.conducteurId))).toBe(true);
  });
  it('le stockage grossit de moins de 30 Ko et les anciens départs sans réservation sont purgés', () => {
    const avant = encoder(app).length; amorcerCovoit(); const apres = encoder(app).length; expect(apres - avant).toBeLessThan(30_000);
    vi.setSystemTime(new Date('2026-11-06T20:00:00')); amorcerCovoit();
    expect(app.monde.covoits.filter((o) => o.id.startsWith('cvd-') && o.jour < '2026-11-06')).toHaveLength(0); expect(app.monde.covoits.some((o) => o.id.startsWith('cvd-') && o.jour === '2026-11-12')).toBe(true);
  });
  it('infoOffre : vérifié, non-fumeur, entre femmes', () => {
    amorcerCovoit(); const ruth = app.monde.covoits.find((o) => o.conducteurId === 'p-cv-ruth')!, boris = app.monde.covoits.find((o) => o.conducteurId === 'p-boris')!;
    expect(infoOffre(ruth)).toMatchObject({ verifie: true, fumeur: false, femmes: true }); expect(infoOffre(boris).fumeur).toBe(true);
  });
  it('mode Voyageur / Conducteur mémorisé par personne', () => { expect(modeCovoit('p-aicha')).toBe('voyageur'); choisirMode('conducteur', 'p-aicha'); expect(modeCovoit('p-aicha')).toBe('conducteur'); expect(modeCovoit('p-maman')).toBe('voyageur'); expect(lire().modesCovoit['p-aicha']).toBe('conducteur'); });
});

describe('profil conducteur', () => {
  it('sans profil complet, publier est impossible ; une fois enregistré, c’est possible', () => {
    expect(profilEstComplet('p-aicha')).toBe(false);
    expect(() => publierTrajets({ enVille: false, de: 'Yaoundé', vers: 'Douala', point: '', jour: '2026-11-04', heure: '09:00', places: 2, prix: 4500, recurrent: false }, 'p-aicha', OPTS)).toThrow('profil conducteur');
    expect(() => enregistrerProfil('p-aicha', { ...bonne(), plaque: 'zz' })).toThrow('Plaque');
    const p = enregistrerProfil('p-aicha', bonne()); expect(p).toMatchObject({ statut: 'en_verification', vehicule: { plaque: 'CE 100 AA', carrosserie: 'citadine' } });
    expect(profilEstComplet('p-aicha')).toBe(true); expect(profilDe('p-aicha')?.vehicule.places).toBe(3);
  });
  it('modifier le profil garde l’historique ; le véhicule vient du profil ; les places sont bornées', () => {
    const o = offreAvecResa(); expect(o.vehicule).toBe('Toyota Yaris'); expect(o.depart).toBe('Mvan');
    expect(() => publierTrajets({ enVille: false, de: 'Yaoundé', vers: 'Douala', point: '', jour: '2026-11-04', heure: '10:00', places: 4, prix: 4500, recurrent: false }, 'p-aicha', OPTS)).toThrow('3 places');
    const p = enregistrerProfil('p-aicha', { ...bonne(), couleur: 'Rouge' }); expect(p.vehicule.couleur).toBe('Rouge');
  });
});

describe('publier', () => {
  it('trajet récurrent : cinq jours de semaine, le week-end est sauté', () => {
    expect(joursDePublication('2026-11-06', true)).toEqual(['2026-11-06', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12']); expect(joursDePublication('2026-11-06', false)).toEqual(['2026-11-06']);
    enregistrerProfil('p-aicha', bonne()); const l = publierTrajets({ enVille: false, de: 'Yaoundé', vers: 'Douala', point: 'Mvan', jour: '2026-11-06', heure: '07:30', places: 2, prix: 4500, recurrent: true }, 'p-aicha', OPTS);
    expect(l).toHaveLength(5); expect(new Set(Object.values(lire().seriesCovoit)).size).toBe(1); expect(lire().optionsCovoit[l[0].id]).toMatchObject({ bagages: true });
  });
  it('trajet en ville : prix de 200 à 3 000 F, validations (heure, départ ≠ arrivée)', () => {
    enregistrerProfil('p-aicha', bonne());
    const base = { enVille: true, de: 'Bastos', vers: 'Essos', point: 'Bastos', jour: '2026-11-03', heure: '07:30', places: 2, prix: 400, recurrent: false };
    expect(publierTrajets(base, 'p-aicha', OPTS)[0]).toMatchObject({ enVille: true, prix: 400 });
    expect(() => publierTrajets({ ...base, prix: 5000 }, 'p-aicha', OPTS)).toThrow('prix en ville'); expect(() => publierTrajets({ ...base, vers: 'Bastos' }, 'p-aicha', OPTS)).toThrow('différents');
    expect(() => publierTrajets({ ...base, heure: '09h' }, 'p-aicha', OPTS)).toThrow('Heure'); expect(() => publierTrajets({ ...base, jour: '2026-11-01' }, 'p-aicha', OPTS)).toThrow('passé');
  });
  it('mesTrajets, gains du mois après terminaison (net de 10 %)', () => {
    const o = offreAvecResa(); expect(mesTrajets('p-aicha').aVenir.map((x) => x.id)).toEqual([o.id]); expect(gainsDuMois('p-aicha').aVenir).toBe(4500);
    vi.setSystemTime(new Date('2026-11-04T09:05:00')); demarrerTrajet(o.id, 'p-aicha'); terminerTrajet(o.id, 'p-aicha');
    expect(gainsDuMois('p-aicha')).toMatchObject({ mois: 4500, trajets: 1, passagers: 1, aVenir: 0 }); expect(mesTrajets('p-aicha').passes).toHaveLength(1);
  });
});

describe('réserver et annuler', () => {
  it('preparerPaiement pose le bon nombre de places dans le tunnel', () => {
    const o = offreAvecResa(); const url = preparerPaiement(o.id, 2, 'p-paul'); expect(url).toBe(`/paiement?covoit=${o.id}&places=2`);
    expect(etatReglement().brouillon).toMatchObject({ nature: 'covoit', covoitId: o.id, places: 2 });
    expect(preparerPaiement(o.id, 9, 'p-paul')).toContain('places=2'); // plus que 2 places libres (3 − 1)
    o.statut = 'annulee'; expect(() => preparerPaiement(o.id, 1, 'p-paul')).toThrow('offre_fermee');
  });
  it('mesReservations : seulement les paiements acceptés, code de prise en charge stable', () => {
    const o = offreAvecResa(); const r = mesReservations('p-maman'); expect(r).toHaveLength(1); expect(r[0]).toMatchObject({ phase: 'a_venir', places: 1, code: codePriseEnCharge(o.id, 'p-maman') });
    app.monde.paiements.find((p) => p.id === o.reservations[0].paiementId)!.statut = 'attente'; expect(mesReservations('p-maman')).toHaveLength(0);
  });
  it('annulation : plus de 24 h = remboursement intégral, place rendue, conducteur prévenu', () => {
    const o = offreAvecResa('2026-11-05'), r = mesReservations('p-maman')[0]; expect(remboursementAnnulation(r).pourcent).toBe(100);
    const res = annulerReservation(o.id, 'p-maman'); expect(res).toMatchObject({ rembourse: 5000, frais: 0 }); expect(placesRestantes(o)).toBe(3);
    expect(app.monde.paiements.find((p) => p.pour.ids[0] === o.id && p.payeurId === 'p-maman')!.statut).toBe('rembourse'); expect(lire().annulationsCovoit).toHaveLength(1);
    expect(app.monde.notifications.some((n) => n.destId === 'p-aicha' && n.titre === 'Réservation annulée')).toBe(true); expect(() => annulerReservation(o.id, 'p-maman')).toThrow('reservation_inconnue');
  });
  it('annulation tardive : 50 % à moins de 2 h ; impossible une fois démarré', () => {
    const o = offreAvecResa('2026-11-03'); vi.setSystemTime(new Date('2026-11-03T08:00:00'));
    expect(annulerReservation(o.id, 'p-maman')).toMatchObject({ pourcent: 50, rembourse: 2500, frais: 2500 });
    simulerReservation(o.id, 'p-paul', 1); demarrerTrajet(o.id, 'p-aicha'); expect(() => annulerReservation(o.id, 'p-paul')).toThrow('trajet_demarre');
  });
});

describe('avis, sécurité', () => {
  it('avis du passager sur le conducteur puis du conducteur sur le passager : une seule fois, la note bouge', () => {
    const o = offreAvecResa(); expect(() => noterTrajet({ offreId: o.id, deId: 'p-maman', pourId: 'p-aicha', note: 5 })).toThrow('trajet_non_termine');
    vi.setSystemTime(new Date('2026-11-04T09:05:00')); demarrerTrajet(o.id, 'p-aicha'); terminerTrajet(o.id, 'p-aicha');
    const r = noterTrajet({ offreId: o.id, deId: 'p-maman', pourId: 'p-aicha', note: 4, tags: ['Ponctuel'], texte: 'Très bien' }); expect(r).toEqual({ note: 4, nbAvis: 1 });
    expect(app.monde.personnes.find((p) => p.id === 'p-aicha')!.note).toBe(4); expect(aNote(o.id, 'p-maman', 'p-aicha')).toBe(true);
    expect(() => noterTrajet({ offreId: o.id, deId: 'p-maman', pourId: 'p-aicha', note: 5 })).toThrow('deja_note'); expect(() => noterTrajet({ offreId: o.id, deId: 'p-paul', pourId: 'p-aicha', note: 5 })).toThrow('avis_non_autorise');
    expect(noterTrajet({ offreId: o.id, deId: 'p-aicha', pourId: 'p-maman', note: 5 }).note).toBe(5); expect(() => noterTrajet({ offreId: o.id, deId: 'p-aicha', pourId: 'p-maman', note: 9 })).toThrow('note_invalide');
  });
  it('la note d’un conducteur de démonstration est pondérée par ses avis', () => {
    amorcerCovoit(); const o = app.monde.covoits.find((x) => x.conducteurId === 'p-moussa')!; o.statut = 'terminee'; o.reservations.push({ voyageurId: 'p-aicha', places: 1, paiementId: 'x' });
    const r = noterTrajet({ offreId: o.id, deId: 'p-aicha', pourId: 'p-moussa', note: 3 }); expect(r.nbAvis).toBe(165); expect(r.note).toBe(4.9);
  });
  it('code de prise en charge, partage en direct, SOS, signalement', () => {
    const o = offreAvecResa(); expect(confirmerMontee(o.id, 'p-aicha', 'p-maman', '0000')).toBe(false); expect(estMonte(o.id, 'p-maman')).toBe(false);
    expect(confirmerMontee(o.id, 'p-aicha', 'p-maman', codePriseEnCharge(o.id, 'p-maman'))).toBe(true); expect(estMonte(o.id, 'p-maman')).toBe(true);
    expect(basculerPartage(o.id, 'p-aicha')).toBe(true); expect(partageActif(o.id, 'p-aicha')).toBe(true); expect(basculerPartage(o.id, 'p-aicha')).toBe(false);
    const n = declencherSOS(o.id, 'p-aicha'); expect(n).toBeGreaterThanOrEqual(1); expect(lire().alertesCovoit.some((a) => a.type === 'sos')).toBe(true); expect(app.monde.evenements.some((e) => e.type === 'sos')).toBe(true);
    const id = signalerCovoit(o.id, 'p-maman', 'Le conducteur est en retard', 'Plus de 20 min'); expect(id).toMatch(/^S-/); expect(() => signalerCovoit(o.id, 'p-maman', '', '')).toThrow('motif_requis');
    expect(app.monde.notifications.some((x) => x.destId === 'p-luther' && x.titre.startsWith('Covoiturage signalé'))).toBe(true);
    expect(occupantsDe(o)).toEqual([{ nom: 'Marie Ndiba', initiales: 'MN', places: 1 }]);
  });
});

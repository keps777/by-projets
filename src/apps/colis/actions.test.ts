import { beforeEach, describe, expect, it } from 'vitest';
import { app, reinitialiser } from '../../data/store.svelte.ts';
import { avancerColis, colisDe, creerColis, personne } from '../../domain/actions.ts';
import { prixColis } from '../../core/colis.ts';
import { prixColisLigne } from '../../core/prixColis.ts';
import { ligneDe } from '../../domain/actions.ts';
import { accepterCourse, annulerColis, avancerCourse, basculerDispo, busQuiArrivent, candidatureDe, candidaterLivreur, candidaterRelais, colisAttendus, colisEnRayon, colisPourRemise, coursesDisponibles, coursesEnCours, envoyerColis, garantirRelais, gainsLivreur, gainsRelais, livrerCourse, messageWhatsApp, modifierBoutique, partager, prochainDepartColis, recevoirColis, relaisDuMonde, remettreColis, repondreCandidature, retournerCourse, simulerEtapeSuivante, validerEnvoi, type ErreursEnvoi, prixEnvoi, trajetColis } from './actions.ts';
import { brouillonVide, boutiqueDe, trancheColis, type Brouillon, type FicheRelais } from './etat.ts';

const brouillon = (o: Partial<Brouillon> = {}): Brouillon => ({ ...brouillonVide(), nom: 'Maman', tel: '6 77 10 22 33', relaisId: 'p-mado', ...o });
const envoyer = (o: Partial<Brouillon> = {}) => { const r = envoyerColis(brouillon(o), 'p-aicha'); if (!r.ok) throw new Error(JSON.stringify(r.erreurs)); return r.colis; };
/** Fait arriver un colis au relais comme le ferait la chaîne réelle (guichet → bus → relais). */
const auRelais = (c: ReturnType<typeof envoyer>, relaisId = 'p-mado') => { avancerColis(c.id, 'depose', 'Guichet', 'p-fatou'); avancerColis(c.id, 'en_route', 'Bus', 'p-emile'); const r = recevoirColis(c.code, relaisId); expect(r.ok).toBe(true); };
const ficheRelais = (o: Partial<FicheRelais> = {}): FicheRelais => ({ boutique: { nom: 'Chez Awa', type: 'Boutique', adresse: 'Bonapriso, rue des Palmiers', ouverture: 7, fermeture: 21, h24: false, jours: [1, 2, 3, 4, 5, 6] }, titulaire: 'Madeleine Essomba', moyen: 'momo', tel: '6 77 45 00 12', photos: 3, cni: true, colisParJour: 8, ...o });

beforeEach(() => { reinitialiser(); garantirRelais(); });

describe('le monde des relais', () => {
  it('liste les quatre relais actifs du plus proche au plus loin', () => {
    const r = relaisDuMonde(); expect(r.map((x) => x.boutique.nom)).toEqual(['Chez Mado', 'Pharmacie du Port', 'Station Total Bali', 'Librairie Ndom']);
    expect(r[0].personne.id).toBe('p-mado'); expect(r.every((x) => x.distance > 0)).toBe(true);
  });
  it('garantirRelais est idempotent', () => { garantirRelais(); garantirRelais(); expect(app.monde.personnes.filter((p) => p.role === 'relais')).toHaveLength(4); });
  it('un relais désactivé n’apparaît pas', () => { personne('p-relais-bali')!.actif = false; expect(relaisDuMonde().map((r) => r.personne.id)).not.toContain('p-relais-bali'); });
});

describe('envoyer un colis', () => {
  it('prend le prochain bus Bêta Express Yaoundé → Douala', () => { const d = prochainDepartColis()!; expect(d).toBeTruthy(); expect(d.statut).toBe('prevu'); });
  it('crée le colis avec le bon prix, le relais, le bus et prévient le relais', () => {
    const colis = envoyer({ taille: 'L', moto: true, assurance: true, quartier: 'Bonapriso' });
    expect(colis.prix).toBe(prixColis('L', { moto: true, assurance: true })); expect(colis.prix).toBe(6500);
    expect(colis).toMatchObject({ statut: 'cree', relaisId: 'p-mado', destinataire: { nom: 'Maman', tel: '677102233' }, expediteurId: 'p-aicha' });
    expect(colis.departId).toBe(prochainDepartColis()!.id); expect(colis.arrivee).toContain('Chez Mado');
    expect(colisDe('p-aicha').map((c) => c.id)).toContain(colis.id);
    const pay = app.monde.paiements.find((p) => p.id === colis.paiementId)!; expect(pay).toMatchObject({ montant: 6500, statut: 'attente', pour: { type: 'colis', ids: [colis.id] } });
    expect(trancheColis().courses[colis.id]).toMatchObject({ quartier: 'Bonapriso', etape: 0 });
    expect(app.monde.notifications.find((n) => n.destId === 'p-mado' && n.titre === 'Colis attendu')).toBeTruthy();
    expect(colisAttendus('p-mado').map((c) => c.id)).toContain(colis.id);
  });
  it('« Maman paie » : pas de paiement à l’envoi', () => {
    const r = envoyerColis(brouillon({ cod: true }), 'p-aicha'); expect(r.ok).toBe(true);
    if (r.ok) { expect(r.payer).toBe(false); expect(r.colis.paiementId).toBeUndefined(); expect(r.colis.options.contreRemboursement).toBe(true); expect(app.monde.paiements.some((p) => p.pour.ids.includes(r.colis.id))).toBe(false); expect(r.colis.prix).toBe(3000); }
  });
  it('remet le brouillon à zéro après l’envoi', () => { const t = trancheColis(); Object.assign(t.brouillon, brouillon()); envoyerColis(t.brouillon, 'p-aicha'); expect(t.brouillon.nom).toBe(''); expect(t.brouillon.relaisId).toBeNull(); });
  it('refuse un destinataire ou un relais invalide', () => {
    const e = (o: Partial<Brouillon>) => { const r = envoyerColis(brouillon(o), 'p-aicha'); return r.ok ? ({} as ErreursEnvoi) : r.erreurs; };
    expect(e({ nom: '' }).nom).toBeTruthy(); expect(e({ tel: '12345' }).tel).toContain('invalide'); expect(e({ relaisId: null }).relais).toBeTruthy(); expect(e({ relaisId: 'p-inconnu' }).relais).toBeTruthy();
    expect(e({ moto: true, quartier: 'Ailleurs' }).quartier).toBeTruthy();
    const avant = app.monde.colis.length; envoyerColis(brouillon({ nom: '' }), 'p-aicha'); expect(app.monde.colis).toHaveLength(avant);
  });
  it('refuse hors ligne', () => { app.session.hors_ligne = true; expect(validerEnvoi(brouillon()).general).toContain('hors ligne'); });
  it('annulation : seulement avant le dépôt et le paiement', () => {
    const c = envoyer(); expect(annulerColis(c.id, 'p-aicha')).toEqual({ ok: true }); expect(c.statut).toBe('annule');
    expect(app.monde.paiements.find((p) => p.id === c.paiementId)!.statut).toBe('refuse');
    const d = envoyer(); avancerColis(d.id, 'depose', 'Guichet', 'p-fatou'); expect(annulerColis(d.id, 'p-aicha').ok).toBe(false);
    const e = envoyer(); app.monde.paiements.find((p) => p.id === e.paiementId)!.statut = 'ok'; expect(annulerColis(e.id, 'p-aicha').ok).toBe(false);
  });
  it('partage WhatsApp simulé : message avec le code de retrait, compté', () => {
    const c = envoyer(); const m = partager(c.id, 'p-aicha'); expect(m).toContain(c.codeRetrait); expect(m).toContain('Chez Mado'); expect(m).toBe(messageWhatsApp(c, 'p-aicha')); expect(trancheColis().partages[c.id]).toBe(1);
  });
});

describe('le relais reçoit et remet', () => {
  it('le colis de démo (AM-C-9Q2) est attendu chez Mado et se reçoit par son code', () => {
    expect(colisAttendus('p-mado').map((c) => c.code)).toContain('AM-C-9Q2');
    const r = recevoirColis('am c 9q2', 'p-mado'); expect(r.ok).toBe(true);
    expect(app.monde.colis.find((c) => c.code === 'AM-C-9Q2')).toMatchObject({ statut: 'au_relais' });
    expect(colisEnRayon('p-mado').map((c) => c.code)).toContain('AM-C-9Q2');
    expect(app.monde.notifications.find((n) => n.destId === 'p-aicha' && n.titre === 'Colis AM-C-9Q2')).toBeTruthy();
  });
  it('refuse les cas limites de réception', () => {
    const c = envoyer();
    expect(recevoirColis('???', 'p-mado')).toMatchObject({ ok: false, message: expect.stringContaining('illisible') });
    expect(recevoirColis('AM-C-ZZZ', 'p-mado')).toMatchObject({ ok: false, message: expect.stringContaining('inconnu') });
    expect(recevoirColis(c.code, 'p-mado')).toMatchObject({ ok: false, message: expect.stringContaining('pas encore été déposé') });
    avancerColis(c.id, 'depose', 'Guichet', 'p-fatou');
    expect(recevoirColis(c.code, 'p-relais-port')).toMatchObject({ ok: false, message: expect.stringContaining('attendu chez Chez Mado') });
    expect(recevoirColis(c.code, 'p-mado').ok).toBe(true);
    expect(recevoirColis(c.code, 'p-mado')).toMatchObject({ ok: false, message: expect.stringContaining('déjà reçu') });
    expect(recevoirColis(c.code, 'p-fatou').ok).toBe(false);
  });
  it('refuse un colis annulé ou en litige', () => { const c = envoyer(); avancerColis(c.id, 'annule', '', 'p-aicha'); expect(recevoirColis(c.code, 'p-mado').ok).toBe(false); });
  it('remise : code de retrait + pièce vérifiée, commission 300 F, journal du colis', () => {
    const c = envoyer(); auRelais(c);
    expect(colisPourRemise('p-mado', c.codeRetrait).map((x) => x.id)).toContain(c.id); expect(colisPourRemise('p-mado', '0000')).toHaveLength(0);
    expect(remettreColis(c.id, '0000', 'p-mado', true)).toMatchObject({ ok: false, message: expect.stringContaining('incorrect') });
    expect(remettreColis(c.id, c.codeRetrait, 'p-mado', false)).toMatchObject({ ok: false, message: expect.stringContaining('pièce') });
    expect(remettreColis(c.id, c.codeRetrait, 'p-relais-port', true).ok).toBe(false);
    const r = remettreColis(c.id, c.codeRetrait, 'p-mado', true); expect(r).toMatchObject({ ok: true, gain: 300, aEncaisser: 0 });
    expect(c.statut).toBe('livre'); expect(c.etapes.at(-1)).toMatchObject({ statut: 'livre', par: 'p-mado' });
    expect(remettreColis(c.id, c.codeRetrait, 'p-mado', true).ok).toBe(false);
    expect(gainsRelais('p-mado')).toMatchObject({ nbJour: 1, gainJour: 300, nbSemaine: 1, gainSemaine: 300 }); expect(gainsRelais('p-mado').parJour).toHaveLength(7);
    expect(gainsRelais('p-relais-port').gainJour).toBe(0);
  });
  it('contre-remboursement : le relais encaisse le prix du colis', () => {
    const r0 = envoyerColis(brouillon({ cod: true, taille: 'L' }), 'p-aicha'); if (!r0.ok) throw new Error(); const c = r0.colis; auRelais(c);
    const r = remettreColis(c.id, c.codeRetrait, 'p-mado', true); expect(r).toMatchObject({ ok: true, aEncaisser: 5500 });
  });
});

describe('livraison moto', () => {
  it('une course n’existe qu’une fois le colis moto arrivé au relais', () => {
    const c = envoyer({ moto: true }); expect(coursesDisponibles()).toHaveLength(0); avancerColis(c.id, 'depose', 'Guichet', 'p-fatou'); expect(coursesDisponibles()).toHaveLength(0);
    auRelais(c); expect(coursesDisponibles().map((x) => x.id)).toEqual([c.id]);
    expect(app.monde.notifications.find((n) => n.destId === 'p-samuel' && n.titre === 'Course disponible')).toBeTruthy();
    const sans = envoyer({ moto: false }); auRelais(sans); expect(coursesDisponibles().map((x) => x.id)).toEqual([c.id]);
  });
  it('accepter, avancer, livrer avec le bon code : gains du livreur', () => {
    const c = envoyer({ moto: true, quartier: 'Bonapriso' }); auRelais(c);
    expect(accepterCourse(c.id, 'p-mado').ok).toBe(false);
    const a = accepterCourse(c.id, 'p-samuel'); expect(a.ok).toBe(true); expect(c).toMatchObject({ statut: 'en_livraison', livreurId: 'p-samuel' });
    expect(coursesDisponibles()).toHaveLength(0); expect(coursesEnCours('p-samuel').map((x) => x.id)).toEqual([c.id]);
    expect(accepterCourse(c.id, 'p-samuel').ok).toBe(false);
    expect(livrerCourse(c.id, c.codeRetrait, 'p-samuel')).toMatchObject({ ok: false, message: expect.stringContaining('Arrive d’abord') });
    expect(avancerCourse(c.id, 'p-samuel')).toEqual({ ok: true, etape: 1 }); expect(avancerCourse(c.id, 'p-samuel')).toEqual({ ok: true, etape: 2 }); expect(avancerCourse(c.id, 'p-samuel')).toEqual({ ok: true, etape: 2 });
    expect(livrerCourse(c.id, '0000', 'p-samuel')).toMatchObject({ ok: false, message: expect.stringContaining('2 essais') });
    expect(livrerCourse(c.id, c.codeRetrait, 'p-fatou').ok).toBe(false);
    expect(livrerCourse(c.id, c.codeRetrait, 'p-samuel')).toMatchObject({ ok: true, gain: 1000 });
    expect(c).toMatchObject({ statut: 'livre' }); expect(c.etapes.at(-1)!.par).toBe('p-samuel');
    expect(gainsLivreur('p-samuel')).toMatchObject({ nbJour: 1, gainJour: 1000 });
  });
  it('trois codes faux : le colis revient au relais et redevient disponible', () => {
    const c = envoyer({ moto: true }); auRelais(c); accepterCourse(c.id, 'p-samuel'); avancerCourse(c.id, 'p-samuel'); avancerCourse(c.id, 'p-samuel');
    livrerCourse(c.id, '0000', 'p-samuel'); livrerCourse(c.id, '0000', 'p-samuel');
    expect(livrerCourse(c.id, '0000', 'p-samuel')).toMatchObject({ ok: false, retour: true });
    expect(c.statut).toBe('au_relais'); expect(c.livreurId).toBeUndefined(); expect(coursesDisponibles().map((x) => x.id)).toEqual([c.id]);
  });
  it('remise impossible : retour manuel au relais', () => {
    const c = envoyer({ moto: true }); auRelais(c); accepterCourse(c.id, 'p-samuel');
    expect(retournerCourse(c.id, 'p-samuel')).toEqual({ ok: true }); expect(c.statut).toBe('au_relais'); expect(retournerCourse(c.id, 'p-samuel').ok).toBe(false);
  });
  it('un livreur en pause n’accepte pas ; au plus 3 courses en même temps', () => {
    const cs = [1, 2, 3, 4].map(() => { const c = envoyer({ moto: true }); auRelais(c); return c; });
    expect(basculerDispo('p-samuel')).toBe(false); expect(accepterCourse(cs[0].id, 'p-samuel')).toMatchObject({ ok: false, message: expect.stringContaining('disponible') });
    expect(basculerDispo('p-samuel')).toBe(true);
    for (const c of cs.slice(0, 3)) expect(accepterCourse(c.id, 'p-samuel').ok).toBe(true);
    expect(accepterCourse(cs[3].id, 'p-samuel')).toMatchObject({ ok: false, message: expect.stringContaining('3 courses') });
  });
  it('« simuler l’étape suivante » du client mène jusqu’à la remise', () => {
    const c = envoyer({ moto: true }); auRelais(c); expect(simulerEtapeSuivante(c.id).ok).toBe(false); accepterCourse(c.id, 'p-samuel');
    expect(simulerEtapeSuivante(c.id)).toEqual({ ok: true, livre: false }); expect(simulerEtapeSuivante(c.id)).toEqual({ ok: true, livre: false }); expect(simulerEtapeSuivante(c.id)).toEqual({ ok: true, livre: true }); expect(c.statut).toBe('livre');
  });
  it('liste les bus qui arrivent à Douala dans les 3 prochaines heures', () => { const b = busQuiArrivent(); for (const x of b) expect(x.heure).toMatch(/^\d\d:\d\d$/); expect(busQuiArrivent(0)).toHaveLength(0); expect(busQuiArrivent(48).length).toBeGreaterThanOrEqual(b.length); });
});

describe('candidatures', () => {
  it('devenir relais : compte inactif + candidature en attente, puis activation', () => {
    const r = candidaterRelais('p-aicha', ficheRelais()); expect(r.ok).toBe(true); if (!('candidature' in r)) return;
    const c = r.candidature, compte = personne(c.personneId)!;
    expect(compte).toMatchObject({ role: 'relais', actif: false, prenom: 'Madeleine', nom: 'Essomba', tel: '677450012' }); expect(compte.pin).toBeUndefined();
    expect(boutiqueDe(compte.id)).toMatchObject({ nom: 'Chez Awa' }); expect(relaisDuMonde().map((x) => x.personne.id)).not.toContain(compte.id);
    expect(candidatureDe('p-aicha', 'relais')?.id).toBe(c.id);
    expect(candidaterRelais('p-aicha', ficheRelais())).toMatchObject({ ok: false, message: expect.stringContaining('déjà') });
    const rep = repondreCandidature(c.id, true); expect(rep.ok).toBe(true);
    expect(compte.actif).toBe(true); expect(compte.pin).toMatch(/^\d{4}$/); expect(c.statut).toBe('acceptee'); expect(relaisDuMonde().map((x) => x.personne.id)).toContain(compte.id);
    expect(repondreCandidature(c.id, false).ok).toBe(false);
    expect(app.monde.notifications.find((n) => n.destId === 'p-aicha' && n.titre.includes('activé'))).toBeTruthy();
  });
  it('valide la fiche relais', () => {
    const e = (o: Partial<FicheRelais>) => { const r = candidaterRelais('p-aicha', ficheRelais(o)); return 'erreurs' in r ? r.erreurs : {}; };
    expect(e({ photos: 2 }).photos).toBeTruthy(); expect(e({ cni: false }).cni).toBeTruthy(); expect(e({ tel: '123' }).tel).toBeTruthy(); expect(e({ titulaire: ' ' }).titulaire).toBeTruthy();
    expect(e({ boutique: { ...ficheRelais().boutique, nom: '' } }).boutique?.nom).toBeTruthy();
    expect(app.monde.personnes.filter((p) => p.role === 'relais')).toHaveLength(4);
  });
  it('une candidature refusée laisse le compte inactif et permet de recandidater', () => {
    const r = candidaterRelais('p-aicha', ficheRelais()); if (!('candidature' in r)) throw new Error();
    repondreCandidature(r.candidature.id, false); expect(personne(r.candidature.personneId)!.actif).toBe(false); expect(candidatureDe('p-aicha', 'relais')).toBeUndefined();
    expect(candidaterRelais('p-aicha', ficheRelais()).ok).toBe(true);
  });
  it('devenir livreur : 4 conditions obligatoires', () => {
    const f = { conditions: [true, true, false, true], titulaire: 'Roger Tchinda', tel: '699112233' };
    expect(candidaterLivreur('p-aicha', f)).toMatchObject({ ok: false, message: expect.stringContaining('4 conditions') });
    expect(candidaterLivreur('p-aicha', { ...f, conditions: [true, true, true, true], tel: '12' }).ok).toBe(false);
    const r = candidaterLivreur('p-aicha', { ...f, conditions: [true, true, true, true] }); expect(r.ok).toBe(true); if (!('candidature' in r)) return;
    expect(personne(r.candidature.personneId)).toMatchObject({ role: 'livreur', actif: false });
    expect(candidaterLivreur('p-aicha', { ...f, conditions: [true, true, true, true] }).ok).toBe(false);
    repondreCandidature(r.candidature.id, true); expect(personne(r.candidature.personneId)!.actif).toBe(true);
  });
  it('modifier sa fiche boutique garde la position', () => {
    const avant = boutiqueDe('p-mado')!, { est, nord, ...champs } = avant;
    expect(modifierBoutique('p-mado', { ...champs, fermeture: 22 }).ok).toBe(true); expect(boutiqueDe('p-mado')).toMatchObject({ fermeture: 22, est, nord });
    expect(modifierBoutique('p-mado', { ...champs, nom: '' }).ok).toBe(false);
  });
});

describe('colis déposés par un autre agent', () => {
  it('un colis sans relais désigné est attendu par tous les relais de Douala et attribué à celui qui le reçoit', () => {
    const { colis } = creerColis({ expediteurId: 'p-aicha', destinataire: { nom: 'Jean', tel: '677000999' }, taille: 'S', options: { moto: false, assurance: false, contreRemboursement: false }, depart: 'Yaoundé · Mvan', arrivee: 'Douala · Akwa', moyen: 'especes', canal: 'guichet' });
    const vivant = app.monde.colis.find((c) => c.id === colis.id)!;
    avancerColis(vivant.id, 'depose', 'Guichet Mvan', 'p-fatou');
    expect(colisAttendus('p-mado').map((c) => c.id)).toContain(vivant.id); expect(colisAttendus('p-relais-bali').map((c) => c.id)).toContain(vivant.id);
    expect(recevoirColis(vivant.code, 'p-relais-bali').ok).toBe(true); expect(vivant.relaisId).toBe('p-relais-bali');
    expect(colisAttendus('p-mado').map((c) => c.id)).not.toContain(vivant.id); expect(colisEnRayon('p-relais-bali').map((c) => c.id)).toEqual([vivant.id]);
    expect(remettreColis(vivant.id, vivant.codeRetrait, 'p-relais-bali', true).ok).toBe(true);
  });
});

describe('envoi depuis l’accueil (mode Colis)', () => {
  it('trajetColis lit le départ ou le covoiturage, seulement Yaoundé → Douala', () => {
    const d = prochainDepartColis()!;
    expect(trajetColis(d.id)).toMatchObject({ departId: d.id, heure: d.heure });
    expect(trajetColis('inconnu')).toBeUndefined();
    const lointain = app.monde.departs.find((x) => ligneDe(x).vers !== 'Douala')!;
    expect(trajetColis(lointain.id)).toBeUndefined();
    const cv = app.monde.covoits.find((c) => c.de === 'Yaoundé' && c.vers === 'Douala')!;
    expect(trajetColis(null, cv.id)).toMatchObject({ covoitId: cv.id });
  });
  it('le prix payé est celui de la ligne (options en plus) et le départ choisi est retenu', () => {
    const d = prochainDepartColis()!, t = trajetColis(d.id)!;
    const attendu = prixColisLigne('M', ligneDe(d).dureeMin) + 500; // assurance par défaut
    expect(prixEnvoi(brouillon({ taille: 'M' }), t)).toBe(attendu);
    const r = envoyerColis(brouillon({ taille: 'M' }), 'p-aicha', t); expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.colis.prix).toBe(attendu); expect(r.colis.departId).toBe(d.id);
    expect(app.monde.paiements.find((p) => p.id === r.colis.paiementId)!.montant).toBe(attendu);
  });
  it('sans trajet, le tarif de base est conservé', () => { expect(prixEnvoi(brouillon({ taille: 'M' }))).toBe(prixColis('M', { moto: false, assurance: true })); });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { app, reinitialiser, totalMensualites } from '../../data/store.svelte.ts';
import { lignesDe, passerPaie, rattraperPaies } from '../../data/paie.ts';
import { epargneDuGenre } from '../coffres/actions.ts';
import { accepterPlan, alertes, ajouterEnfant, basculerEnfant, bulletinDe, coffreRentree, enfantParId, payerDemande, planDe, recap, rentreeCible, repartir, reserverSoutien, simuler } from './actions.ts';
import { ecole } from './etat.ts';
import { encaisse, envoyerAuxParents, famillesAvecPlan, paiementsRecus, publierEvaluation, publierGrille, saisirNote } from '../../portals/ecole/actions.ts';
import './demarrage.ts';

const NOW = Date.parse('2026-10-22T10:00:00');
beforeEach(() => { reinitialiser('demo'); });

describe('rentrée visée et récapitulatif de la démo', () => {
  it('prochain 1er septembre', () => {
    expect(rentreeCible(NOW)).toBe('2027-09-01');
    expect(rentreeCible(Date.parse('2027-03-01T10:00:00'))).toBe('2027-09-01');
    expect(rentreeCible(Date.parse('2027-09-01T10:00:00'))).toBe('2028-09-01');
  });
  it('3 enfants, 600 000 de frais, coffre 160 000, 440 000 à financer', () => {
    const r = recap();
    expect(r.inclus).toHaveLength(3); expect(r.total).toBe(600_000); expect(r.coffre).toBe(160_000); expect(r.aFinancer).toBe(440_000);
    expect(coffreRentree()).toEqual({ montant: 160_000, source: 'coffres' }); // le vrai coffre Rentrée de la démo, pas un montant saisi
  });
  it('décocher un enfant recalcule ; tous décochés : rien à financer', () => {
    basculerEnfant('e-marc');
    expect(recap().total).toBe(400_000); expect(recap().aFinancer).toBe(240_000);
    basculerEnfant('e-lisa'); basculerEnfant('e-junior');
    expect(recap().aFinancer).toBe(0);
    expect(accepterPlan(10).ok).toBe(false);
  });
  it('le coffre de la tranche « coffres » prime sur le montant saisi (lecture seule)', () => {
    app.tranches.coffres = { coffres: [{ nom: 'Coffre Rentrée 2027', solde: 250_000 }] };
    expect(coffreRentree()).toEqual({ montant: 250_000, source: 'coffres' });
    expect(recap().aFinancer).toBe(350_000);
    expect(JSON.stringify(app.tranches.coffres)).toContain('250000');
  });
  it('ajout d’enfant : validations', () => {
    expect(ajouterEnfant({ prenom: ' ', ecoleId: 'bambins', niveau: 'CP' }).ok).toBe(false);
    expect(ajouterEnfant({ prenom: 'Zoé', ecoleId: 'bambins', niveau: '3e' }).ok).toBe(false);
    expect(ajouterEnfant({ prenom: 'Zoé', ecoleId: 'bambins', niveau: 'CP' })).toMatchObject({ ok: true });
    expect(recap().total).toBe(720_000);
    expect(ajouterEnfant({ prenom: 'Autre', ecoleId: 'bambins', niveau: 'CP' }).ok).toBe(false); // 4 enfants au maximum
  });
});

describe('acceptation du plan (règle des 33 %)', () => {
  it('démo : 440 000 sur 10 mois = 47 711, crédit « ecole » créé, frais payés aux écoles le jour de l’accord', () => {
    const solde = app.solde; const n = app.credits.length;
    const sim = simuler(10)!;
    expect(sim.resultat.mensualite).toBe(47_711); expect(sim.resultat.approuve).toBe(true);
    const r = accepterPlan(10);
    expect(r.ok).toBe(true);
    expect(app.credits).toHaveLength(n + 1);
    const c = app.credits.at(-1)!;
    expect(c).toMatchObject({ produit: 'ecole', capital: 440_000, mensualite: 47_711, duree: 10, payees: 0, prochaine: '2027-09-28', statut: 'actif' });
    expect(app.solde).toBe(solde); // le crédit paie l'école directement
    // les 160 000 du coffre Rentrée partent aussi aux écoles : le coffre est vidé (et l'école ne les compte plus deux fois)
    expect(epargneDuGenre('Rentrée')).toBe(0);
    expect(coffreRentree().montant).toBe(0);
    expect(totalMensualites()).toBe(44_000 + 47_711);
    const plan = planDe('2027-09-01')!;
    expect(plan.tauxLancement).toBe(false); expect(plan.taux).toBe(0.015); expect(plan.total).toBe(600_000);
    // chaque école reçoit les frais de son enfant
    expect(paiementsRecus('la-rochelle')[0]).toMatchObject({ montant: 250_000, planId: plan.id });
    expect(paiementsRecus('bambins')[0].montant).toBe(150_000); expect(paiementsRecus('lycee-bilingue')[0].montant).toBe(200_000);
    expect(app.notifications[0].titre).toBe('Plan de paiement accepté');
    // les mouvements de l'accord se compensent
    expect(app.mouvements.slice(0, 4).reduce((s, m) => s + m.montant, 0)).toBe(0);
  });
  it('un seul plan par rentrée', () => {
    expect(accepterPlan(10).ok).toBe(true);
    expect(accepterPlan(8)).toMatchObject({ ok: false });
    expect(basculerEnfant('e-lisa').ok).toBe(false);
  });
  it('le plan existant de la démo garde le taux de lancement 0 % (44 000 × 10)', () => {
    const p = ecole().plans[0];
    expect(p).toMatchObject({ tauxLancement: true, taux: 0, mensualite: 44_000, duree: 10, creditId: 'c-ecole', capital: 440_000 });
    expect(app.credits[0].mensualite).toBe(p.mensualite);
  });
  it('refus au-dessus de 33 % : durée plus longue proposée, rien n’est créé', () => {
    app.compte!.salaireNet = 300_000; // 33 % = 99 000 ; 44 000 déjà prélevés → reste 55 000
    const sim6 = simuler(6)!;
    expect(sim6.resultat.approuve).toBe(false); expect(sim6.resultat.part).toBeGreaterThan(0.33);
    expect(sim6.alternative).toBe(10); // reste 55 000 : 8 mois = 58 8xx (trop), 10 mois = 47 711
    const n = app.credits.length; const solde = app.solde;
    const r = accepterPlan(6);
    expect(r).toMatchObject({ ok: false }); expect(app.credits).toHaveLength(n); expect(app.solde).toBe(solde); expect(planDe('2027-09-01')).toBeUndefined();
    expect(paiementsRecus('bambins')).toHaveLength(1); // seulement le paiement 2026
  });
  it('une durée plus longue peut sauver le dossier', () => {
    app.compte!.salaireNet = 350_000; // 33 % = 115 500 ; reste 71 500 (6 mois : 77 300, 8 mois : 58 700)
    const s6 = simuler(6)!;
    expect(s6.resultat.approuve).toBe(false);
    expect(s6.alternative).not.toBeNull();
    expect(accepterPlan(s6.alternative!).ok).toBe(true);
  });
  it('compte vierge : tranche vide, pas de plan possible sans enfant', () => {
    reinitialiser('vierge');
    expect(ecole().enfants).toHaveLength(0); expect(recap().aFinancer).toBe(0); expect(accepterPlan(10)).toMatchObject({ ok: false });
    expect(ecole().plans).toHaveLength(0); expect(alertes()).toEqual([]);
  });
  it('compte vierge avec un compte créé : parcours réel jusqu’à l’accord', () => {
    reinitialiser('vierge');
    app.compte = { id: 'u', prenom: 'Awa', nom: 'Kone', telephone: '', ville: '', quartier: '', employeur: 'X', salaireNet: 400_000, jourPaie: 25, anciennete: '', pass: 'essentiel', numeroMembre: '', cree: Date.now() };
    app.score.valeur = 520;
    expect(ajouterEnfant({ prenom: 'Awa', ecoleId: 'la-rochelle', niveau: '6e' }).ok).toBe(true);
    ecole().coffreSaisi = 50_000;
    expect(recap().aFinancer).toBe(140_000);
    const sim = simuler(10)!;
    expect(sim.resultat.taux).toBe(0.018);
    const r = accepterPlan(10);
    expect(r.ok).toBe(true);
    expect(app.credits[0].prochaine).toBe('2027-09-25');
  });
});

describe('prélèvements sur salaire', () => {
  it('le crédit de démo est prélevé à la paie du 28 oct. (3 / 10) puis la suivante', () => {
    app.solde = 1_000_000;
    expect(lignesDe('2026-10-28').filter((l) => l.libelle.startsWith('Mensualité école'))[0]).toMatchObject({ montant: 44_000, libelle: 'Mensualité école 3 / 10' });
    passerPaie('2026-10-28');
    expect(app.credits[0].payees).toBe(3); expect(app.credits[0].prochaine).toBe('2026-11-28');
    expect(lignesDe('2026-10-28').filter((l) => l.libelle.startsWith('Mensualité école'))).toHaveLength(0); // plus dû
  });
  it('un nouveau plan n’est prélevé qu’à partir de sa première échéance, puis se solde', () => {
    app.credits = []; app.compte!.salaireNet = 5_000_000; expect(accepterPlan(2).ok).toBe(true);
    const c = app.credits[0]; expect(c.prochaine).toBe('2027-09-28');
    expect(lignesDe('2026-10-28')).toHaveLength(0);
    app.solde = 10_000_000;
    passerPaie('2027-09-28'); passerPaie('2027-10-28');
    expect(c.payees).toBe(2); expect(c.statut).toBe('termine'); expect(ecole().plans.find((p) => p.creditId === c.id)!.statut).toBe('termine');
    expect(lignesDe('2027-11-28')).toHaveLength(0);
  });
  it('solde insuffisant : mensualité reportée d’un mois, sans pénalité', () => {
    app.solde = 0; app.compte!.salaireNet = 10_000;
    passerPaie('2026-10-28');
    expect(app.credits[0].payees).toBe(2); expect(app.credits[0].prochaine).toBe('2026-11-28');
  });
  it('rattrapage de deux paies manquées', () => {
    app.dernierePaie = '2026-09-28'; app.solde = 5_000_000;
    expect(rattraperPaies(Date.parse('2026-11-29T10:00:00'))).toBe(2);
    expect(app.credits[0].payees).toBe(4);
  });
});

describe('paiements à l’école, soutien, répartition', () => {
  it('payer la sortie : solde débité, reçu à l’école ; double paiement refusé', () => {
    const s = app.solde;
    expect(payerDemande('d-sortie').ok).toBe(true);
    expect(app.solde).toBe(s - 5_000); expect(paiementsRecus('la-rochelle')[0]).toMatchObject({ montant: 5_000, objet: 'Sortie pédagogique du 7 nov.' });
    expect(payerDemande('d-sortie')).toMatchObject({ ok: false });
    expect(app.solde).toBe(s - 5_000);
  });
  it('solde insuffisant', () => {
    app.solde = 1_000;
    const r = payerDemande('d-examen'); expect(r).toMatchObject({ ok: false }); expect(app.solde).toBe(1_000);
    expect(reserverSoutien('e-lisa', 'x')).toMatchObject({ ok: false });
  });
  it('soutien : débité une fois, changement de créneau gratuit', () => {
    const s = app.solde;
    expect(reserverSoutien('e-lisa', 'A').ok).toBe(true); expect(app.solde).toBe(s - 20_000);
    expect(reserverSoutien('e-lisa', 'B').ok).toBe(true); expect(app.solde).toBe(s - 20_000);
    expect(ecole().soutiens[0].creneau).toBe('B');
  });
  it('répartition exacte du capital entre les écoles', () => {
    const p = repartir(440_000, [250_000, 150_000, 200_000]);
    expect(p.reduce((a, b) => a + b, 0)).toBe(440_000);
    expect(repartir(100, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(100);
  });
});

describe('portail école ↔ membre', () => {
  it('l’école publie sa grille : les frais de la famille suivent ; un plan déjà signé ne bouge pas', () => {
    expect(recap().total).toBe(600_000);
    const r = publierGrille('la-rochelle', ecole().ecoles[0].grille.map((g) => ({ niveau: g.niveau, montant: String(g.montant + (g.niveau === '3e' ? 10_000 : 0)) })));
    expect(r.ok).toBe(true);
    expect(recap().total).toBe(610_000);
    expect(app.notifications[0].titre).toMatch(/mis à jour/);
    accepterPlan(10);
    publierGrille('la-rochelle', ecole().ecoles[0].grille.map((g) => ({ niveau: g.niveau, montant: '300000' })));
    expect(planDe('2027-09-01')!.total).toBe(610_000);
  });
  it('grille : montants invalides refusés, rien n’est modifié', () => {
    const avant = JSON.stringify(ecole().ecoles[0].grille);
    const r = publierGrille('la-rochelle', [{ niveau: '6e', montant: 'abc' }, { niveau: '5e', montant: '500' }, { niveau: '4e', montant: '220000' }]);
    expect(r.ok).toBe(false); expect(r).toHaveProperty('erreurs'); expect(JSON.stringify(ecole().ecoles[0].grille)).toBe(avant);
  });
  it('familles avec plan et encaissements', () => {
    const avant = encaisse(ecole().ecoles[0]);
    expect(famillesAvecPlan('la-rochelle').map((f) => f.famille)).toContain('Famille Mballa');
    accepterPlan(10);
    expect(famillesAvecPlan('la-rochelle').filter((f) => f.famille === 'Famille Ndiba')).toHaveLength(2); // 2026 et 2027
    expect(encaisse(ecole().ecoles[0])).toBe(avant + 250_000);
  });
  it('notes : bulletin de Lisa, brouillon invisible tant que non publié, note invalide bloquante', () => {
    const lisa = enfantParId('e-lisa')!;
    const b = bulletinDe(lisa);
    expect(b.classe).toBe('4e B');
    const maths = b.synthese.matieres.find((m) => m.matiere === 'Mathématiques')!;
    expect(maths.moyenne).toBe(17); expect(maths.details).toHaveLength(1); // le devoir 2 n'est pas publié
    expect(b.synthese.effectif).toBe(6);
    const ev = ecole().evaluations.find((e) => e.id.includes('Mathématiques') && e.publie === false && e.classe === '4e B')!;
    saisirNote(ev.id, 'Essomba Junior', '25');
    expect(publierEvaluation(ev.id)).toMatchObject({ ok: false });
    saisirNote(ev.id, 'Essomba Junior', '11,5');
    expect(publierEvaluation(ev.id).ok).toBe(true);
    expect(bulletinDe(lisa).synthese.matieres.find((m) => m.matiere === 'Mathématiques')!.moyenne).toBe(16);
    expect(app.notifications[0].titre).toBe('Nouvelle note · Lisa');
    expect(publierEvaluation(ev.id)).toMatchObject({ ok: false });
  });
  it('messages aux parents : la famille concernée les reçoit', () => {
    expect(envoyerAuxParents('la-rochelle', { classe: '4e B' }, ' ', 'x')).toMatchObject({ ok: false });
    expect(envoyerAuxParents('la-rochelle', {}, 'Bonjour', 'x')).toMatchObject({ ok: false });
    expect(envoyerAuxParents('la-rochelle', { classe: '4e B' }, 'Réunion vendredi', 'Parents de 4e B').ok).toBe(true);
    expect(app.notifications[0].titre).toBe('Message de Collège La Rochelle');
  });
});

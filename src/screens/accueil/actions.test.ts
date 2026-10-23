import { beforeEach, describe, expect, it } from 'vitest';
import { app, reinitialiser, totalMensualites } from '../../data/store.svelte.ts';
import { lignesDe, passerPaie, fournirPrelevements, type LigneAvecEffet } from '../../data/paie.ts';
import { executerPaiement, noterRecu, plafondSanteRestant, preparerEnvoi, preparerFacture, preparerPaiementLibre, recharger, reporterLigne, peutReporterLigne, repartitionFacture, mensualiteEtalement, marquerLue, toutMarquerLu } from './actions.ts';
import { FACTURE_PALMIERS, factureParId, facturesAPayer, paiements, toutesFactures } from './etat.ts';
import { emettreFacture } from '../sante/actions.ts';
import { facturesARegler, sante } from '../sante/etat.ts';
import '../sante/demarrage.ts';
import './demarrage.ts';

const MAINTENANT = Date.parse('2026-10-22T10:00:00');
const palmiers = () => facturesAPayer()[0];

beforeEach(() => { reinitialiser('demo'); });

describe('recharge du solde', () => {
  it('crédite le solde et crée un mouvement', () => {
    const r = recharger(25_000, 'orange', MAINTENANT);
    expect(r).toEqual({ ok: true, frais: 0 });
    expect(app.solde).toBe(111_500);
    expect(app.mouvements[0]).toMatchObject({ titre: 'Recharge Orange Money', montant: 25_000, categorie: 'recharge' });
  });
  it('carte Visa : 1 % de frais indiqué, solde crédité du montant demandé', () => {
    const r = recharger(50_000, 'visa', MAINTENANT);
    expect(r).toEqual({ ok: true, frais: 500 });
    expect(app.solde).toBe(136_500);
    expect(app.mouvements[0].sous).toContain('500');
  });
  it('refuse un montant invalide sans rien modifier', () => {
    expect(recharger(null, 'mtn').ok).toBe(false); expect(recharger(100, 'mtn').ok).toBe(false); expect(recharger(5_000_000, 'mtn').ok).toBe(false);
    expect(app.solde).toBe(86_500); expect(app.mouvements).toHaveLength(5);
  });
  it('fonctionne sur un compte vierge', () => {
    reinitialiser('vierge');
    expect(app.solde).toBe(0);
    recharger(10_000, 'mtn');
    expect(app.solde).toBe(10_000);
  });
});

describe('notifications', () => {
  it('marque lue, puis tout lu', () => {
    expect(app.notifications.filter((n) => !n.lu)).toHaveLength(2);
    marquerLue('n1'); expect(app.notifications.filter((n) => !n.lu)).toHaveLength(1);
    toutMarquerLu(); expect(app.notifications.every((n) => n.lu)).toBe(true);
  });
});

describe('facture Les Palmiers (démo)', () => {
  it('est proposée en démo, pas en compte vierge', () => {
    expect(facturesAPayer().map((f) => f.id)).toEqual(['f-1190']);
    reinitialiser('vierge'); expect(facturesAPayer()).toEqual([]);
  });
  it('répartit 35 500 : 28 400 AssureMe, 7 100 pour le membre', () => {
    const r = repartitionFacture(palmiers());
    expect([r.total, r.assureMe, r.patient]).toEqual([35_500, 28_400, 7100]);
    expect(mensualiteEtalement(palmiers())).toBe(2438);
  });
  it('paiement comptant : débite, mouvement, notification, +4 points, reçu, plafond', () => {
    preparerFacture(palmiers(), 'comptant');
    const r = executerPaiement(MAINTENANT);
    if (!r.ok) throw new Error(r.message);
    expect(app.solde).toBe(79_400);
    expect(app.mouvements[0]).toMatchObject({ titre: 'Clinique Les Palmiers', montant: -7100, categorie: 'sante' });
    expect(app.notifications[0].titre).toContain('payée'); expect(app.notifications[0].lien).toBe(`/pay/recu?ref=${r.recu.ref}`);
    expect(app.score.valeur).toBe(746); expect(app.score.historique.at(-1)).toMatchObject({ mois: 'oct.', valeur: 746 });
    expect(r.recu).toMatchObject({ paye: 7100, priseEnCharge: 28_400, soldeApres: 79_400, points: 4, scoreApres: 746, plafondRestant: 985_600 });
    expect(plafondSanteRestant()).toBe(985_600);
    expect(facturesAPayer()).toEqual([]); expect(paiements().enCours).toBeNull(); expect(paiements().recus).toHaveLength(1);
    noterRecu(r.recu.ref, 5); expect(paiements().recus[0].note).toBe(5);
  });
  it("ne se paie pas deux fois", () => {
    preparerFacture(palmiers(), 'comptant'); executerPaiement(MAINTENANT);
    paiements().enCours = { type: 'facture', factureId: 'f-1190', partenaire: 'x', ini: 'x', categorie: 'sante', lieu: '', montant: 7100, mode: 'comptant' };
    const r = executerPaiement(MAINTENANT);
    expect(r).toMatchObject({ ok: false, raison: 'deja' });
    expect(app.solde).toBe(79_400);
  });
  it('solde insuffisant : refus, rien ne bouge, on dit combien il manque', () => {
    app.solde = 5000;
    preparerFacture(palmiers(), 'comptant');
    const r = executerPaiement(MAINTENANT);
    expect(r).toMatchObject({ ok: false, raison: 'solde', manque: 2100 });
    expect(app.solde).toBe(5000); expect(app.mouvements).toHaveLength(5); expect(app.score.valeur).toBe(742); expect(palmiers().statut).toBe('a_payer');
  });
  it("après l'échéance : payée mais sans point", () => {
    preparerFacture(palmiers(), 'comptant');
    const r = executerPaiement(Date.parse('2026-10-26T10:00:00'));
    expect(r.ok && r.recu.points).toBe(0); expect(app.score.valeur).toBe(742);
  });
  it('plafond santé presque atteint : le reste passe à la charge du membre', () => {
    paiements().plafondSanteUtilise = 1_200_000 - 10_000;
    paiements().factures.push(FACTURE_PALMIERS()); // facture propre aux paiements (celle de la santé est répartie à son émission)
    const r = repartitionFacture(factureParId('f-palmiers')!);
    expect(r.assureMe).toBe(10_000); expect(r.patient).toBe(25_500); expect(r.plafondDepasse).toBe(true);
  });
  it('étalement sur 3 mois : crédit créé, solde intact, mensualité prélevée sur salaire', () => {
    preparerFacture(palmiers(), 'etale');
    const r = executerPaiement(MAINTENANT);
    if (!r.ok) throw new Error(r.message);
    expect(app.solde).toBe(86_500);
    const c = app.credits.find((x) => x.id.startsWith('c-pay-'))!;
    expect(c).toMatchObject({ mensualite: 2438, duree: 3, payees: 0, capital: 7100, statut: 'actif', prochaine: '2026-10-28' });
    expect(totalMensualites()).toBe(44_000 + 2438);
    expect(r.recu).toMatchObject({ mode: 'etale', mensualite: 2438, mois: 3, points: 0 });
    expect(palmiers()).toBeUndefined(); expect(toutesFactures()[0].statut).toBe('etalee');
    // aperçu des 4 prochaines paies : 3 mensualités puis plus rien
    expect(['2026-10-28', '2026-11-28', '2026-12-28', '2027-01-28'].map((p) => lignesDe(p).filter((l) => l.id === c.id).length)).toEqual([1, 1, 1, 0]);
    expect(lignesDe('2026-11-28').find((l) => l.id === c.id)).toMatchObject({ montant: 2438, detail: 'Étalement 2 / 3' });
    // la paie du 28 oct. passe la 1re mensualité et rapporte des points
    app.solde = 100_000;
    passerPaie('2026-10-28');
    expect(c.payees).toBe(1); expect(c.prochaine).toBe('2026-11-28');
    expect(app.mouvements.some((m) => m.titre.startsWith('Soins') && m.montant === -2438)).toBe(true);
    expect(app.score.valeur).toBe(744);
  });
  it('étalement refusé au-delà de 33 % du salaire', () => {
    app.compte!.salaireNet = 140_000; // 44 000 + 2 440 = 33,2 %
    preparerFacture(palmiers(), 'etale');
    const r = executerPaiement(MAINTENANT);
    expect(r).toMatchObject({ ok: false, raison: 'trente_trois' });
    expect(app.credits.some((c) => c.id.startsWith('c-pay-'))).toBe(false); expect(palmiers().statut).toBe('a_payer');
  });
});

describe('paiement libre et envoi', () => {
  const pharmacie = { code: 'PRP-0112', nom: 'Pharmacie du Rond-Point', ini: 'PH', lieu: 'caisse 1', categorie: 'sante' };
  it('paiement chez un partenaire : débit exact, pas de points', () => {
    preparerPaiementLibre(pharmacie, 4500);
    const r = executerPaiement(MAINTENANT);
    expect(r.ok).toBe(true); expect(app.solde).toBe(82_000); expect(app.mouvements[0]).toMatchObject({ montant: -4500, titre: 'Pharmacie du Rond-Point' }); expect(app.score.valeur).toBe(742);
  });
  it('refuse un montant supérieur au solde ou nul', () => {
    preparerPaiementLibre(pharmacie, 90_000); expect(executerPaiement(MAINTENANT)).toMatchObject({ ok: false, raison: 'solde', manque: 3500 });
    preparerPaiementLibre(pharmacie, 0); expect(executerPaiement(MAINTENANT)).toMatchObject({ ok: false, raison: 'montant' });
    expect(app.solde).toBe(86_500);
  });
  it('envoi à un proche', () => {
    preparerEnvoi('Maman', 'MA', 10_000);
    const r = executerPaiement(MAINTENANT);
    expect(r.ok && r.recu.mode).toBe('envoi'); expect(app.solde).toBe(76_500); expect(app.mouvements[0]).toMatchObject({ titre: 'Envoi à Maman', categorie: 'envoi' });
  });
  it('compte vierge (solde 0) : tout paiement est refusé proprement', () => {
    reinitialiser('vierge');
    preparerEnvoi('Paul', 'PA', 5000);
    expect(executerPaiement(MAINTENANT)).toMatchObject({ ok: false, raison: 'solde', manque: 5000 });
    expect(app.mouvements).toEqual([]);
    expect(executerPaiement(MAINTENANT)).toMatchObject({ ok: false });
  });
  it("aucun paiement préparé", () => { expect(executerPaiement(MAINTENANT)).toMatchObject({ ok: false, raison: 'aucun' }); });
});

describe('report d’un prélèvement', () => {
  it('une seule fois par an et par prélèvement', () => {
    let reporte = 0;
    fournirPrelevements('test-report', () => [{ id: 'ecole', type: 'credit', libelle: 'Crédit scolaire', detail: '', montant: 44_000, appliquer: () => {}, reporter: () => { reporte++; } } as LigneAvecEffet]);
    const l = lignesDe('2026-10-28').find((x) => x.id === 'ecole')!;
    expect(peutReporterLigne(l, '2026-10-28')).toBe(true);
    expect(reporterLigne(l, '2026-10-28')).toBe(true);
    expect(reporte).toBe(1); expect(paiements().reports.ecole).toBe('2026-10-28');
    expect(reporterLigne(l, '2026-11-28')).toBe(false);
    expect(reporte).toBe(1);
    expect(app.notifications[0].titre).toContain('reportée');
    fournirPrelevements('test-report', () => []);
  });
  it("une ligne sans `reporter` n'est jamais reportable", () => {
    expect(peutReporterLigne({ id: 'x', type: 'pass', libelle: 'x', detail: '', montant: 1, appliquer: () => {} }, '2026-10-28')).toBe(false);
  });
});

describe('factures issues de la tranche santé', () => {
  const emettre = () => {
    const r = emettreFacture({ beneficiaire: 'Aïcha', medecin: 'Dr Essomba', acte: 'Radiographie', lignes: [{ nom: 'Radio', sous: 'Poumons', montant: 20_000, categorie: 'examen' }] });
    if (!r.ok) throw new Error(r.erreur);
    return r.facture;
  };
  it("la facture émise par la clinique apparaît dans les paiements, avec la part et l'échéance de la clinique", () => {
    const f = emettre();
    expect(facturesAPayer().map((x) => x.id)).toEqual(['f-1190', f.id]);
    const h = factureParId(f.id)!;
    expect(h).toMatchObject({ partenaire: 'Clinique Les Palmiers', origine: 'sante', echeance: f.echeance, beneficiaire: f.patient });
    expect(repartitionFacture(h).patient).toBe(f.partPatient);
  });
  it('ne montre que les factures du membre, jamais les brouillons ni celles des autres', () => {
    const f = emettre();
    sante().factures.push({ ...f, id: 'autre', numeroMembre: 'AM0000' }, { ...f, id: 'brouillon', statut: 'brouillon' });
    expect(facturesAPayer().map((x) => x.id)).toEqual(['f-1190', f.id]);
    reinitialiser('vierge'); expect(facturesAPayer()).toEqual([]);
  });
  it("payer depuis l'accueil règle aussi la facture côté Santé (pas de double paiement)", () => {
    const f = emettre(); const avant = app.solde;
    preparerFacture(factureParId(f.id)!, 'comptant');
    const r = executerPaiement(MAINTENANT);
    expect(r.ok).toBe(true); expect(app.solde).toBe(avant - f.partPatient);
    expect(sante().factures.find((x) => x.id === f.id)).toMatchObject({ statut: 'payee', paiement: { mode: 'comptant' } });
    expect(facturesARegler().map((x) => x.id)).toEqual(['f-1190']);
    expect(factureParId(f.id)).toMatchObject({ statut: 'payee' });
  });
  it("étaler depuis l'accueil : la facture santé passe à « étalée » et la mensualité n'est prélevée qu'une fois", () => {
    preparerFacture(palmiers(), 'etale');
    const r = executerPaiement(MAINTENANT);
    expect(r.ok).toBe(true);
    expect(sante().factures.find((x) => x.id === 'f-1190')).toMatchObject({ statut: 'etalee' });
    const lignes = lignesDe('2026-10-28').filter((l) => l.type === 'credit' && l.libelle.startsWith('Soins'));
    expect(lignes).toHaveLength(1);
    expect(lignes[0].montant).toBe(2438);
  });
});

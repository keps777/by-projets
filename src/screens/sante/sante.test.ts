import { beforeEach, describe, expect, it } from 'vitest';
import { codeCarte } from '../../core/sante.ts';
import { rattraperPaies } from '../../data/paie.ts';
import { app, maintenant, reinitialiser, totalMensualites } from '../../data/store.svelte.ts';
import { annulerOrdonnance, ajouterBeneficiaire, emettreFacture, envoyerOrdonnance, etalerFacture, payerFacture, teleconsulter, validerBrouillon, verifierPatient } from './actions.ts';
import './demarrage.ts';
import { facturesARegler, facturesDuMembre, sante, utilisation, type FactureSante } from './etat.ts';

const lignes = [{ nom: 'Consultation générale', sous: 'Dr Ewane', montant: 20_000, categorie: 'consultation' as const }];
beforeEach(() => { reinitialiser('demo'); });

describe('données d’exemple (démo)', () => {
  it('7 100 de part patient sur 35 500 à Les Palmiers, 186 000 sur 1 200 000 utilisés avant elle', () => {
    const f = facturesARegler(); expect(f).toHaveLength(1);
    expect(f[0]).toMatchObject({ etablissement: 'Clinique Les Palmiers', total: 35_500, assureMe: 28_400, partPatient: 7_100, statut: 'a_regler' });
    expect(f[0].echeance > f[0].date).toBe(true);
    expect(utilisation().utilise).toBe(186_000 + 28_400);
    expect(utilisation().restant).toBe(1_200_000 - 214_400);
    expect(app.notifications.some((n) => n.titre.includes('Les Palmiers'))).toBe(true);
  });
  it('un compte vierge démarre sans facture ni ordonnance', () => {
    reinitialiser('vierge'); expect(sante().factures).toEqual([]); expect(sante().ordonnances).toEqual([]); expect(facturesDuMembre()).toEqual([]);
    expect(utilisation().utilise).toBe(0);
  });
});

describe('portail : identifier le patient', () => {
  it('accepte le code courant, refuse un mauvais code ou un inconnu', () => {
    const now = maintenant(), code = codeCarte('AM4821', now);
    const d = verifierPatient('AM4821', code, now);
    expect(d).toMatchObject({ ok: true, taux: 0.8, pharmacie: 0.7, titulaire: 'Aïcha Ndiba' });
    expect(verifierPatient('690123456', code, now).ok).toBe(true);
    expect(verifierPatient('AM4821', '000000', now)).toMatchObject({ ok: false });
    expect(verifierPatient('AM0000', code, now)).toMatchObject({ ok: false });
  });
  it('sans compte, aucun membre', () => { reinitialiser('vierge'); expect(verifierPatient('AM4821', '123456').ok).toBe(false); });
});

describe('portail : émettre une facture', () => {
  it('apparaît chez le membre à payer, avec notification et plafond mis à jour', () => {
    const avant = utilisation().utilise;
    const r = emettreFacture({ beneficiaire: 'Paul', medecin: 'Dr Ewane', acte: 'Consultation générale', lignes });
    expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.facture).toMatchObject({ patient: 'Paul Ndiba', total: 20_000, assureMe: 16_000, partPatient: 4_000, statut: 'a_regler' });
    expect(facturesARegler().map((f) => f.id)).toContain(r.facture.id);
    expect(utilisation().utilise).toBe(avant + 16_000);
    expect(app.notifications[0].lien).toBe(`/sante/facture/${r.facture.id}`);
  });
  it('refuse patient inconnu, acte vide, ligne invalide', () => {
    expect(emettreFacture({ beneficiaire: 'Zoé', medecin: '', acte: 'X', lignes }).ok).toBe(false);
    expect(emettreFacture({ beneficiaire: 'Paul', medecin: '', acte: ' ', lignes }).ok).toBe(false);
    expect(emettreFacture({ beneficiaire: 'Paul', medecin: '', acte: 'X', lignes: [{ ...lignes[0], montant: -5 }] }).ok).toBe(false);
    expect(emettreFacture({ beneficiaire: 'Paul', medecin: '', acte: 'X', lignes: [] }).ok).toBe(false);
  });
  it('un brouillon n’est pas visible du membre ni compté au plafond avant validation', () => {
    const r = emettreFacture({ beneficiaire: 'Lisa', medecin: '', acte: 'Pédiatrie', lignes }, true); if (!r.ok) throw new Error(r.erreur);
    expect(facturesARegler().map((f) => f.id)).not.toContain(r.facture.id); expect(utilisation().utilise).toBe(214_400);
    expect(validerBrouillon(r.facture.id).ok).toBe(true);
    expect(facturesARegler().map((f) => f.id)).toContain(r.facture.id);
  });
  it('plafond presque épuisé : AssureMe paie le reste du plafond, le patient l’excédent', () => {
    sante().plafondInitial += utilisation().restant - 10_000; // il reste 10 000 de plafond
    const r = emettreFacture({ beneficiaire: 'Paul', medecin: '', acte: 'Hospitalisation', lignes: [{ nom: 'Chambre', sous: '', montant: 100_000, categorie: 'hospitalisation' }] });
    if (!r.ok) throw new Error(r.erreur);
    expect(r.facture).toMatchObject({ assureMe: 10_000, partPatient: 90_000, plafondDepasse: true }); expect(utilisation().restant).toBe(0);
  });
});

describe('membre : régler sa part', () => {
  const premiere = () => facturesARegler()[0];
  it('paiement comptant : solde, mouvement, score +4 à temps, statut payée', () => {
    const f = premiere(), solde = app.solde, score = app.score.valeur;
    const r = payerFacture(f.id); expect(r.ok).toBe(true);
    expect(app.solde).toBe(solde - 7_100); expect(app.mouvements[0]).toMatchObject({ montant: -7_100, categorie: 'sante' });
    expect(app.score.valeur).toBe(score + 4);
    expect(sante().factures.find((x) => x.id === f.id)).toMatchObject({ statut: 'payee', paiement: { mode: 'comptant', aTemps: true } });
    expect(payerFacture(f.id).ok).toBe(false); // pas deux fois
  });
  it('solde insuffisant : rien n’est débité', () => {
    app.solde = 5_000; const r = payerFacture(premiere().id);
    expect(r).toMatchObject({ ok: false }); expect(app.solde).toBe(5_000); expect(premiere().statut).toBe('a_regler');
  });
  it('en retard : payable, mais sans point de score', () => {
    const f = sante().factures.find((x) => x.id === premiere().id)!; f.echeance = '2020-01-01';
    const score = app.score.valeur; expect(payerFacture(f.id).ok).toBe(true); expect(app.score.valeur).toBe(score);
  });
  it('étalement : crédit santé accordé, pas de débit immédiat, prélevé à la paie', () => {
    const f = premiere(), solde = app.solde, avant = totalMensualites();
    const r = etalerFacture(f.id); expect(r.ok).toBe(true); if (!r.ok) return;
    const c = app.credits.find((x) => x.produit === 'sante')!;
    expect(c).toMatchObject({ capital: 7_100, duree: 3, payees: 0, statut: 'actif', mensualite: r.mensualite });
    expect(app.solde).toBe(solde); expect(totalMensualites()).toBe(avant + r.mensualite);
    expect(sante().factures.find((x) => x.id === f.id)).toMatchObject({ statut: 'etalee', paiement: { mode: 'etale', creditId: c.id } });
    // trois paies : le crédit est soldé
    app.dernierePaie = '2000-01-28'; app.compte!.cree = Date.parse('2000-01-01'); app.solde = 1_000_000; app.credits.forEach((x) => { if (x.produit !== 'sante') x.statut = 'termine'; });
    c.prochaine = '2026-10-28'; rattraperPaies(Date.parse('2026-12-29T10:00:00'));
    expect(c.payees).toBe(3); expect(c.statut).toBe('termine');
  });
  it('refus si les mensualités dépasseraient 33 % du net', () => {
    app.credits.push({ id: 'gros', produit: 'logement', libelle: 'Avance', capital: 1, mensualite: 170_000, duree: 12, payees: 0, prochaine: '2026-11-28', statut: 'actif' });
    const r = etalerFacture(premiere().id);
    expect(r.ok).toBe(false); if (!r.ok) expect(r.erreur).toContain('33 %');
    expect(app.credits.filter((c) => c.produit === 'sante')).toHaveLength(0); expect(premiere().statut).toBe('a_regler');
  });
  it('mensualité reportée si le solde ne suffit pas', () => {
    etalerFacture(premiere().id);
    const c = app.credits.find((x) => x.produit === 'sante')!; c.prochaine = '2026-10-28';
    app.dernierePaie = '2026-09-28'; app.credits.forEach((x) => { if (x.produit !== 'sante') x.statut = 'termine'; });
    app.compte!.salaireNet = 0; app.solde = 0; rattraperPaies(Date.parse('2026-10-29T10:00:00'));
    expect(c.payees).toBe(0); expect(c.prochaine).toBe('2026-11-28');
  });
});

describe('téléconsultation, ordonnance, bénéficiaires', () => {
  it('téléconsultation : 400 à charge, 1 600 au plafond ; quota du Pass Essentiel', () => {
    const solde = app.solde, u = utilisation().utilise;
    const r = teleconsulter('Lisa'); expect(r.ok).toBe(true);
    expect(app.solde).toBe(solde - 400); expect(utilisation().utilise).toBe(u + 1_600);
    app.compte!.pass = 'essentiel'; sante().beneficiaires = [];
    expect(teleconsulter('Aïcha').ok).toBe(true); // 2e sur 2
    const t = teleconsulter('Aïcha'); expect(t.ok).toBe(false);
  });
  it('ordonnance avec livraison : 1 000 débités, annulation remboursée', () => {
    const solde = app.solde;
    const r = envoyerOrdonnance({ beneficiaire: 'Lisa', pharmacieId: 'rond-point', pharmacie: 'Pharmacie du Rond-Point', medicaments: 'Sirop', livraison: true });
    expect(r.ok).toBe(true); if (!r.ok) return; expect(app.solde).toBe(solde - 1_000);
    expect(annulerOrdonnance(r.ordonnance.id).ok).toBe(true); expect(app.solde).toBe(solde); expect(annulerOrdonnance(r.ordonnance.id).ok).toBe(false);
  });
  it('ordonnance : champs et solde contrôlés', () => {
    const base = { beneficiaire: 'Lisa', pharmacieId: 'rond-point', pharmacie: 'P', medicaments: 'Sirop', livraison: true };
    expect(envoyerOrdonnance({ ...base, medicaments: '' }).ok).toBe(false);
    expect(envoyerOrdonnance({ ...base, beneficiaire: 'Zoé' }).ok).toBe(false);
    app.solde = 500; expect(envoyerOrdonnance(base).ok).toBe(false); expect(envoyerOrdonnance({ ...base, livraison: false }).ok).toBe(true);
  });
  it('bénéficiaires limités par le Pass', () => {
    expect(ajouterBeneficiaire('Maman').ok).toBe(true); expect(ajouterBeneficiaire('Tante').ok).toBe(true); // 4 + 2 = 6
    expect(ajouterBeneficiaire('Cousin')).toMatchObject({ ok: false });
    expect(ajouterBeneficiaire('lisa')).toMatchObject({ ok: false });
  });
});
export type { FactureSante };

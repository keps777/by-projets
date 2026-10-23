import { beforeEach, describe, expect, it } from 'vitest';
import { app, reinitialiser } from '../../data/store.svelte.ts';
import { ajouterFacture, ajouterProche, avancer, payer } from './actions.ts';
import { etapesVue, lignesRecu, totalEnvoye, totalSelection, verifierFacture, verifierPaiement } from './calcul.ts';
import { etat } from './etat.ts';

describe('diaspora : calculs', () => {
  it('plafond et sélection vide refusés', () => {
    expect(verifierPaiement(0, 0, 500_000)).toMatch(/au moins une facture/);
    expect(verifierPaiement(1, 500_001, 500_000)).toMatch(/plafond/);
    expect(verifierPaiement(2, 500_000, 500_000)).toBeNull();
  });
  it('facture invalide', () => {
    expect(verifierFacture('', 100)).not.toBeNull();
    expect(verifierFacture('Clinique', null)).not.toBeNull();
    expect(verifierFacture('Clinique', 0)).not.toBeNull();
    expect(verifierFacture('Clinique', 35_500)).toBeNull();
  });
});

describe('diaspora : paiement', () => {
  beforeEach(() => reinitialiser('demo'));
  it('compte vierge : aucun proche', () => {
    reinitialiser('vierge');
    expect(etat().proches).toEqual([]);
    expect(ajouterProche('', 'Douala').ok).toBe(false);
    const r = ajouterProche('Maman', 'Douala');
    expect(r.ok).toBe(true);
    expect(ajouterProche('maman', 'Douala').ok).toBe(false);
    if (r.ok) {
      expect(ajouterFacture(r.id, { prestataire: 'Clinique', detail: '', montant: 0, categorie: 'sante' }).ok).toBe(false);
      expect(ajouterFacture(r.id, { prestataire: 'Clinique', detail: '', montant: 20_000, categorie: 'sante' }).ok).toBe(true);
    }
  });
  it('35 500 FCFA : 54,12 €, 4 étapes, reçu CLP-2026-1187, plafond santé 364 500', () => {
    const e = etat(); const maman = e.proches[0];
    const t0 = new Date(2026, 9, 21, 14, 2).getTime();
    const r = payer(maman.id, ['f-clinique'], 'visa');
    expect(r.ok).toBe(true);
    const p = e.paiements[0]; p.debut = t0;
    expect(p.montantFcfa).toBe(35_500);
    expect(p.lignes[0].recu).toMatch(/^CLP-\d{4}-1187$/);
    expect(maman.consommeSante).toBe(35_500);
    expect(app.solde).toBe(86_500); // payé en euros : le solde FCFA ne bouge pas
    expect(etapesVue(p, t0 + 5 * 60_000).map((s) => s.atteinte)).toEqual([true, true, true, false]);
    expect(etapesVue(p, t0 + 29 * 60_000).map((s) => s.heure)).toEqual(['14:02', '14:02', '14:03', '14:31']);
    expect(totalEnvoye(e.avantEuro, e.paiements, 2026)).toBeCloseTo(1240, 2);
    expect(maman.factures.find((f) => f.id === 'f-clinique')!.payee).toBe(true);
    expect(payer(maman.id, ['f-clinique'], 'visa').ok).toBe(false); // déjà payée
  });
  it('le reçu se signe après 29 minutes et prévient une seule fois', () => {
    const e = etat(); payer(e.proches[0].id, ['f-clinique', 'f-loyer'], 'sepa');
    const p = e.paiements[0]; const n0 = app.notifications.length;
    expect(p.lignes.length).toBe(2);
    avancer(p.debut + 10 * 60_000); expect(p.signe).toBe(false);
    avancer(p.debut + 30 * 60_000); expect(p.signe).toBe(true);
    avancer(p.debut + 60 * 60_000);
    expect(app.notifications.length).toBe(n0 + 1);
    expect(lignesRecu(p, true).join('\n')).toContain('signé par Dr Mbarga');
    expect(totalSelection(e.proches[0].factures, ['f-pharma'])).toBe(8_200);
  });
  it('plafond du niveau Start dépassé', () => {
    app.score.valeur = 520;
    const e = etat(); const paul = e.proches[1];
    paul.factures.push({ id: 'gros', prestataire: 'Collège', detail: 'x', montant: 600_000, categorie: 'ecole', payee: false });
    const r = payer(paul.id, ['gros'], 'visa');
    expect(r.ok).toBe(false);
    expect(totalSelection(paul.factures, ['f-ecole', 'f-eneo'])).toBe(164_300);
    expect(payer(paul.id, ['f-ecole', 'f-eneo'], 'applepay').ok).toBe(true);
  });
});

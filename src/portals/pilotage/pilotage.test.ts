import { beforeEach, describe, expect, it } from 'vitest';
import { calculer, csvPilotage } from '../../core/pilotage.ts';
import { app, reinitialiser } from '../../data/store.svelte.ts';
import { basculerConformite, basculerRelance, choisirPeriode, choisirProduit, demanderLigne, regler, signerConvention } from './actions.ts';
import { BASE } from './base.ts';
import { lirePilotage, pilotage } from './etat.ts';
import { lireEntree, sourcesPresentes } from './lecture.ts';

const instantane = () => JSON.stringify(app);
const maintenant = new Date(2026, 9, 23, 10).getTime();

describe('portail pilotage : lecture seule', () => {
  beforeEach(() => reinitialiser('demo'));
  it('lire les données ne crée aucune tranche et ne modifie rien', () => {
    const avant = instantane();
    const e = lireEntree(); expect(lirePilotage().panneau).toBe('ensemble'); sourcesPresentes();
    calculer(e, BASE, { periode: 0, produit: 'tous' }, maintenant);
    expect(instantane()).toBe(avant); expect('pilotage' in app.tranches).toBe(false);
  });
  it('lecture tolérante : tranches absentes, vides ou mal formées', () => {
    app.tranches.sante = { factures: 'oups' }; app.tranches.coffres = null; app.tranches.ecole = { paiements: [null, 3, { montant: 'x' }] }; app.tranches.entreprise = { entreprise: 5 };
    const e = lireEntree();
    expect(e.factures).toEqual([]); expect(e.coffres).toEqual([]);
    expect(() => calculer(e, BASE, { periode: 0, produit: 'tous' }, maintenant)).not.toThrow();
    expect(sourcesPresentes().find((s) => s.cle === 'auto')!.presente).toBe(false);
  });
  it('le compte démo apparaît (score 742, 44 000 de mensualité) ; le compte vierge est vide', () => {
    let i = calculer(lireEntree(), BASE, { periode: 0, produit: 'tous' }, maintenant);
    expect(i.compteLocal).toBe(true); expect(i.niveaux.lignes.find((l) => l.niveau === 'PRO')!.local).toBe(1);
    expect(i.encours.local).toBe(352_000);
    reinitialiser('vierge');
    i = calculer(lireEntree(), BASE, { periode: 0, produit: 'tous' }, maintenant);
    expect(i.compteLocal).toBe(false); expect(i.encours.local).toBe(0); expect(i.membres.total).toBe(18_420);
  });
  it('coffres, factures et partenaires lus quand les tranches existent', () => {
    app.tranches.coffres = { coffres: [{ epargne: 12_500, objectif: 80_000, mensuel: 12_500, auto: true }] };
    app.tranches.sante = { factures: [{ statut: 'payee', date: '2026-10-02', echeance: '2026-10-20', total: 20_000, assureMe: 14_000, partPatient: 6_000, paiement: { aTemps: true } }] };
    app.tranches.commerce = { encaissements: [{ ts: maintenant - 3600_000, montant: 24_500 }] };
    const i = calculer(lireEntree(), BASE, { periode: 0, produit: 'tous' }, maintenant);
    expect(i.coffres.local).toEqual({ nb: 1, epargne: 12_500 }); expect(i.sante.local.factures).toBe(1);
    expect(i.activite.find((a) => a.cle === 'commerces')!.local).toBe(1); expect(i.activite.find((a) => a.cle === 'hopitaux')!.local).toBe(1);
    expect(csvPilotage(i)).toContain('Total épargné');
  });
});

describe('portail pilotage : réglages dans sa propre tranche', () => {
  beforeEach(() => reinitialiser('demo'));
  it('seule la tranche « pilotage » est écrite', () => {
    const { tranches, ...avant } = JSON.parse(instantane());
    choisirPeriode(2); choisirProduit('auto'); regler('seuil', 3.5); regler('ligne', 2.04); basculerRelance(2); basculerConformite(1); signerConvention(0); demanderLigne();
    const { tranches: t2, ...apres } = JSON.parse(instantane());
    expect(apres).toEqual(avant); expect(Object.keys(t2)).toEqual(Object.keys(tranches).concat('pilotage'));
    expect(lirePilotage()).toMatchObject({ periode: 2, produit: 'auto', seuil: 3.5, ligne: 2, ligneDemandee: true });
    expect(pilotage().relances[2]).toBe(true); expect(pilotage().conformite[1]).toBe(true); expect(pilotage().conventions[0].statut).toBe(3);
  });
  it('valeurs invalides ignorées ou bornées', () => {
    choisirPeriode(9); choisirPeriode(-1); choisirPeriode(1.5); choisirProduit('nimporte' as never); regler('seuil', NaN); regler('seuil', 99); regler('ligne', 0);
    expect(lirePilotage()).toMatchObject({ periode: 0, produit: 'tous', seuil: 5, ligne: 0.5 });
    basculerRelance(10); basculerConformite(-3); expect(pilotage().relances).toHaveLength(3);
  });
  it('changer la ligne annule la demande ; une demande ne part qu\'une fois', () => {
    expect(demanderLigne()).toBe(true); expect(demanderLigne()).toBe(false); regler('ligne', 2); expect(lirePilotage().ligneDemandee).toBe(false);
  });
  it('une tranche d\'une version plus ancienne est complétée', () => {
    app.tranches.pilotage = { periode: 1 };
    expect(pilotage()).toMatchObject({ periode: 1, seuil: 3, panneau: 'ensemble' }); expect(lirePilotage().conformite).toHaveLength(5);
  });
});

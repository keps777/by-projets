import { describe, expect, it } from 'vitest';
import {
  ancienneteEnAnnees, apportMinimum, apportNecessaire, creneaux, dureeSuffisante, employeurPartenaire, etapesSuivi, premierPrelevement, simuler,
  statistiquesVentes, validerDemande, verifierTransition, peutRefuser, type EntreeSimulation
} from './auto.ts';
import { decider } from './credit.ts';

const yaris: EntreeSimulation = { prix: 4_500_000, apport: 500_000, duree: 36, assurance: 'tous_risques', tauxMensuel: 0.015, salaire: 520_000, mensualitesExistantes: 44_000 };

describe('simulation', () => {
  it('Yaris : 4 M financés sur 36 mois = 144 610 + 18 000 d’assurance = 162 610', () => {
    const s = simuler(yaris);
    expect(s.financement).toBe(4_000_000);
    expect(s.mensualiteCredit).toBe(144_610);
    expect(s.mensualite).toBe(162_610);
    expect(s.total).toBe(162_610 * 36);
    expect(s.cout).toBe(144_610 * 36 - 4_000_000);
  });
  it('avec le crédit scolaire, la part totale est de 40 % : refusé (jamais « 31 % »)', () => {
    const s = simuler(yaris);
    expect(s.partNouvelle).toBeCloseTo(0.3127, 3);
    expect(s.partTotale).toBeCloseTo(0.3973, 3);
    expect(s.respecte33).toBe(false);
    expect(s.etat).toBe('trop_lourd');
  });
  it('sans autre crédit, la même mensualité passe (31 %) mais reste « limite »', () => {
    const s = simuler({ ...yaris, mensualitesExistantes: 0 });
    expect(s.respecte33).toBe(true);
    expect(s.etat).toBe('limite');
  });
  it('taux nul et apport total donnent des montants sains', () => {
    expect(simuler({ ...yaris, tauxMensuel: 0, apport: 0, prix: 360_000, duree: 12 }).mensualiteCredit).toBe(30_000);
    expect(simuler({ ...yaris, apport: 4_500_000 }).mensualiteCredit).toBe(0);
  });
});

describe('conseils pour passer sous 33 %', () => {
  it('apport nécessaire : le plus petit, au pas de 10 000, et il suffit', () => {
    const a = apportNecessaire({ ...yaris })!;
    expect(a % 10_000).toBe(0);
    expect(simuler({ ...yaris, apport: a }).respecte33).toBe(true);
    expect(simuler({ ...yaris, apport: a - 10_000 }).respecte33).toBe(false);
  });
  it('rien ne marche si l’assurance et les autres crédits mangent déjà la marge', () => {
    expect(apportNecessaire({ ...yaris, mensualitesExistantes: 160_000 })).toBeNull();
  });
  it('durée suffisante : 48 mois avec 1,2 M d’apport', () => {
    expect(dureeSuffisante({ ...yaris, apport: 500_000 })).toBeNull();
    expect(dureeSuffisante({ ...yaris, apport: 1_200_000 })).toBe(48);
  });
});

describe('plafond et validation', () => {
  it('apport minimum selon le plafond du niveau', () => {
    expect(apportMinimum(4_500_000, 'PRO')).toBe(0);
    expect(apportMinimum(8_800_000, 'PRO')).toBe(2_800_000);
    expect(apportMinimum(8_800_000, 'ELITE')).toBe(0);
  });
  const ok = { prix: 4_500_000, apport: 500_000, duree: 36, assurance: 'tous_risques' as const, niveau: 'PRO' as const, coffre: 1_200_000 };
  it('accepte une demande saine', () => expect(validerDemande(ok)).toBeNull());
  it('refuse le niveau insuffisant, l’apport trop bas, trop haut ou plus gros que le coffre', () => {
    expect(validerDemande({ ...ok, niveau: 'PLUS' })).toContain('niveau Pro');
    expect(validerDemande({ ...ok, prix: 8_800_000, apport: 1_000_000 })).toContain('Apport minimum 2 800 000');
    expect(validerDemande({ ...ok, apport: 1_300_000 })).toContain('coffre voiture');
    expect(validerDemande({ ...ok, apport: 4_500_000, coffre: 9e6 })).toContain('aucun crédit');
    expect(validerDemande({ ...ok, apport: -1 })).toContain('entier');
    expect(validerDemande({ ...ok, duree: 30 })).toContain('durée');
  });
});

describe('décision avec les vraies règles', () => {
  const entree = (s: ReturnType<typeof simuler>, extra = {}) => ({
    score: 742, seuilScore: 700, salaire: 520_000, mensualiteNouvelle: s.mensualite, mensualitesExistantes: 44_000, employeurPartenaire: true, ancienneteAns: 4, contratStable: true,
    vehiculeControle: true, valeurExpertisee: 4_800_000, prix: 4_500_000, financement: s.financement, ...extra
  });
  it('Yaris 36 mois / 500 000 d’apport avec le crédit école : refusée à 40 %', () => {
    const d = decider(entree(simuler(yaris)));
    expect(d.approuve).toBe(false);
    expect(d.motif).toContain('40 % du salaire');
  });
  it('Yaris 48 mois / 1,2 M d’apport : approuvée sous 33 %', () => {
    const d = decider(entree(simuler({ ...yaris, apport: 1_200_000, duree: 48 }), { financement: 3_300_000 }));
    expect(d.approuve).toBe(true);
  });
});

describe('employeur et ancienneté', () => {
  it('reconnaît l’employeur partenaire sans casse ni accent', () => {
    expect(employeurPartenaire('Ndiba Logistique')).toBe(true);
    expect(employeurPartenaire('Autre SA')).toBe(false);
    expect(employeurPartenaire(null)).toBe(false);
  });
  it('lit l’ancienneté', () => {
    expect(ancienneteEnAnnees('4 ans')).toBe(4);
    expect(ancienneteEnAnnees('6 mois')).toBe(0.5);
    expect(ancienneteEnAnnees('')).toBe(0);
  });
});

describe('calendrier', () => {
  it('créneaux : samedi matin, samedi après-midi, lundi', () => {
    const c = creneaux('2026-10-22');
    expect(c.map((x) => x.jour)).toEqual(['2026-10-24', '2026-10-24', '2026-10-26']);
    expect(c[0].label).toBe('Samedi 24 octobre · 10 h');
    expect(c[2].label).toBe('Lundi 26 octobre · 9 h');
  });
  it('un jeudi 22 le samedi proche (24) est pris ; un vendredi 23 décale au 31', () => {
    expect(creneaux('2026-10-23')[0].jour).toBe('2026-10-31');
  });
  it('premier prélèvement 20 jours après : 22 oct → 28 nov (la paie du 28 oct est trop proche)', () => {
    expect(premierPrelevement('2026-10-22', 28)).toBe('2026-11-28');
    expect(premierPrelevement('2026-10-01', 28)).toBe('2026-10-28');
  });
});

describe('transitions du dossier', () => {
  const d = (etape: 'nouvelle' | 'etude' | 'accordee' | 'livree' | 'refusee', docs = [true, true, true], signeLe: number | null = 1) => ({ etape, docs, signeLe });
  it('avance d’une étape à la fois, sans retour', () => {
    expect(verifierTransition(d('nouvelle', []), 'etude')).toBeNull();
    expect(verifierTransition(d('nouvelle', []), 'accordee')).toContain('en étude');
    expect(verifierTransition(d('accordee'), 'etude')).toContain('pas en arrière');
    expect(verifierTransition(d('etude'), 'livree')).toContain("d'abord être accordée");
  });
  it('exige les pièces pour accorder et la signature pour livrer', () => {
    expect(verifierTransition(d('etude', [true, false, false]), 'accordee')).toContain('pièces');
    expect(verifierTransition(d('etude'), 'accordee')).toBeNull();
    expect(verifierTransition(d('accordee', [true, true, true], null), 'livree')).toContain('signer');
    expect(verifierTransition(d('accordee'), 'livree')).toBeNull();
  });
  it('un dossier refusé ne bouge plus ; on ne refuse plus un dossier accordé', () => {
    expect(verifierTransition(d('refusee'), 'etude')).toContain('refusée');
    expect(peutRefuser(d('etude'))).toBe(true);
    expect(peutRefuser(d('accordee'))).toBe(false);
  });
});

describe('suivi de livraison', () => {
  const base = { signe: false, accorde: false, livre: false, rdv: null, mensualiteAPayer: 162_610, premierPrelevement: '28 nov.', payees: 0 };
  it('la première étape non faite est « en cours »', () => {
    expect(etapesSuivi(base).map((e) => e.statut)).toEqual(['encours', 'afaire', 'afaire', 'afaire', 'afaire', 'afaire']);
    expect(etapesSuivi({ ...base, signe: true, accorde: true }).map((e) => e.statut)).toEqual(['fait', 'fait', 'fait', 'encours', 'afaire', 'afaire']);
    expect(etapesSuivi({ ...base, signe: true, accorde: true, livre: true }).map((e) => e.statut)).toEqual(['fait', 'fait', 'fait', 'fait', 'fait', 'encours']);
  });
  it('affiche le rendez-vous et la mensualité', () => {
    const e = etapesSuivi({ ...base, rdv: 'Samedi 24 octobre · 10 h' });
    expect(e[4].sous).toContain('Samedi 24 octobre');
    expect(e[5].sous).toBe('28 nov. · 162 610 FCFA sur salaire');
  });
});

describe('statistiques du portail', () => {
  it('compte les livraisons du mois en plus de la base', () => {
    const maintenant = new Date(2026, 9, 22).getTime();
    const s = statistiquesVentes([
      { montant: 5_100_000, livreLe: new Date(2026, 9, 8).getTime(), etape: 'livree' },
      { montant: 7_900_000, livreLe: new Date(2026, 8, 30).getTime(), etape: 'livree' },
      { montant: 1, livreLe: null, etape: 'accordee' }
    ], { ventes: 3, montant: 18_400_000 }, maintenant);
    expect(s).toEqual({ ventes: 4, montant: 23_500_000 });
  });
});

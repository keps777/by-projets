import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../data/store.svelte.ts';
import { etatInitial } from '../../data/seed.ts';
import { compteDe } from '../../domain/compte.ts';
import { aideFenetre, aideOptions, aideValidite, billetsCompatibles, bornesPrix, brouillonValide, calerPrix, codeAeroport, erreursBrouillon, fenetreAutour, jourValide, libelleVendeurs, prixNeufRef, prixParDefaut, reperes, totalReserve, volsCompatibles } from './compat.ts';
import { ecartNeuf, ecartProposition, lignesPropositions, comptesOnglets, dansOnglet, libelleSource, ouvertes, titreVol, vendeurLibelle, vueVendeurs } from './vues.ts';
import { expirationDe, intentionDe, ordinal, rangDetenteur } from './modele.ts';
import { horloge, horlogeAria, joursRestants } from './temps.ts';
import type { Brouillon } from './modele.ts';

const ALEX = 'ACC-0412';
beforeEach(() => { for (const k of Object.keys(app)) delete (app as unknown as Record<string, unknown>)[k]; Object.assign(app, etatInitial()); /* la proposition p-1 date de plus de 48 h : expirée dès l'ouverture */ app.monde.intentions[0].propositions[0].quand = Date.parse('2026-10-09T10:00'); });
const crit = { de: 'YUL', vers: 'CDG', du: '2026-12-15', au: '2026-12-20', flexible: true };
const b = (o: Partial<Brouillon> = {}): Brouillon => ({ ...crit, aller: 'simple', voyageurs: 1, budget: 1300, validite: '30', auto: true, auDessus: true, anonyme: true, ...o });

describe('trajet et fenêtre', () => {
  it('reconnaît un aéroport par code, ville ou libellé', () => {
    expect([codeAeroport('Montréal (YUL)'), codeAeroport('yul'), codeAeroport('paris'), codeAeroport('Paris (CDG)')]).toEqual(['YUL', 'YUL', 'CDG', 'CDG']); expect(codeAeroport('')).toBeUndefined(); expect(codeAeroport('Atlantide')).toBeUndefined();
  });
  it('la fenêtre autour d’un jour : 3 jours avant, 2 jours après', () => { expect(fenetreAutour('2026-12-18')).toEqual({ du: '2026-12-15', au: '2026-12-20' }); expect(jourValide('2026-12-18')).toBe(true); expect(jourValide('18 déc.')).toBe(false); expect(jourValide(null)).toBe(false); });
  it('vols et billets compatibles : trajet + fenêtre, moins cher d’abord, jamais ses propres billets', () => {
    expect(volsCompatibles(crit).map((v) => v.numero).sort()).toEqual(['AE 816', 'NO 220', 'NO 224']);
    expect(billetsCompatibles(crit).map((x) => x.prix)).toEqual([1380, 1500, 1520, 1610, 1700]); expect(billetsCompatibles(crit, 'ACC-0301').map((x) => x.droit.id)).not.toContain('d-r816');
    expect(billetsCompatibles({ ...crit, du: '2026-12-18', au: '2026-12-18' }).length).toBe(5); expect(billetsCompatibles({ ...crit, flexible: false }).length).toBe(0); // 15 et 20 déc. exactement : aucun vol
    expect(billetsCompatibles({ ...crit, vers: 'LIS' })).toEqual([]);
  });
});

describe('prix maximum', () => {
  it('prix neuf de référence, bornes du curseur et prix par défaut', () => {
    expect(prixNeufRef(crit)).toBe(1890); expect(prixNeufRef({ ...crit, du: '2030-01-01', au: '2030-01-02' })).toBe(1080); expect(prixNeufRef({ ...crit, vers: 'XXX' })).toBeUndefined();
    expect(bornesPrix(2050)).toEqual({ min: 600, max: 2050 }); expect(bornesPrix(1890)).toEqual({ min: 550, max: 1890 }); expect(prixParDefaut(2050)).toBe(1300); expect(prixParDefaut(1890)).toBe(1200);
    expect(calerPrix(1234, 1890)).toBe(1230); expect(calerPrix(5, 1890)).toBe(550); expect(calerPrix(99999, 1890)).toBe(1890);
  });
  it('repères et chances d’accord, jamais une garantie', () => {
    const r = reperes(crit, 1300); expect(r).toMatchObject({ vendeurs: 5, auPrix: 0, meilleure: 1380, neuf: 1890, niveau: 1, chance: 'faibles' }); expect(libelleVendeurs(r)).toBe('5 vendeurs compatibles · 0 à votre prix ou moins');
    expect(reperes(crit, 1400)).toMatchObject({ auPrix: 1, niveau: 2, chance: 'moyennes' }); expect(reperes(crit, 1550)).toMatchObject({ auPrix: 3, niveau: 3, chance: 'bonnes' }); expect(reperes(crit, 1550).aide).toBe('3 billets compatibles sont déjà à votre prix ou en dessous.');
    expect(reperes({ ...crit, vers: 'LIS' }, 500).aide).toContain('Aucun billet compatible n’est en vente'); expect(libelleVendeurs(reperes({ ...crit, vers: 'LIS' }, 500))).toBe('Aucun vendeur compatible pour l’instant');
    expect(reperes(crit, 1500, 'ACC-0233').vendeurs).toBe(4);
  });
  it('textes d’aide selon les choix', () => {
    expect(aideFenetre(true, '2026-12-15', '2026-12-20')).toBe('Tout départ du 15 au 20 déc. vous convient : un vendeur peut proposer n’importe quel jour de la fenêtre.'); expect(aideFenetre(false, '2026-12-15', '2026-12-20')).toContain('exactement du 15 déc. ou du 20 déc.');
    const o = { auto: true, auDessus: false, anonyme: false }; expect(aideOptions(o, '1\u00A0300\u00A0$', 'A.', 'Alex T.')).toEqual({ auto: 'Une proposition à 1\u00A0300\u00A0$ ou moins conclut l’accord sans attendre.', auDessus: 'Seules les propositions à votre prix ou moins vous parviendront.', anonyme: 'Les vendeurs voient « Alex T. », votre trajet et votre prix max.' });
    expect(aideValidite('30', Date.parse('2026-11-21T12:00'))).toBe('Expire le 21 nov. 2026. Fonds libérés automatiquement à cette date si aucun accord.'); expect(aideValidite('j3', Date.parse('2026-12-12T23:59'))).toContain('trois jours avant');
    expect(expirationDe('7', '2026-12-15', Date.parse('2026-10-22T10:00')) - Date.parse('2026-10-22T10:00')).toBe(7 * 86_400_000);
  });
});

describe('validation du brouillon', () => {
  it('un brouillon valide', () => { expect(erreursBrouillon(b())).toEqual({}); expect(brouillonValide(b())).toBe(true); expect(totalReserve(b({ budget: 1300, voyageurs: 2 }))).toBe(2600); });
  it('signale chaque erreur à son champ', () => {
    expect(erreursBrouillon(b({ de: 'ZZZ' })).de).toContain('inconnu'); expect(erreursBrouillon(b({ vers: 'YUL' })).vers).toContain('différents'); expect(erreursBrouillon(b({ du: '2026-10-01' })).du).toContain('passé');
    expect(erreursBrouillon(b({ au: '2026-12-10' })).au).toContain('après'); expect(erreursBrouillon(b({ voyageurs: 0 })).voyageurs).toBeDefined(); expect(erreursBrouillon(b({ voyageurs: 10 })).voyageurs).toBeDefined();
    expect(erreursBrouillon(b({ budget: 100 })).budget).toBe('Le prix maximum se règle entre 550 $ et 1890 $.'); expect(erreursBrouillon(b({ vers: 'LIS', budget: 800 })).trajet).toBeUndefined(); expect(erreursBrouillon(b({ de: 'CDG', vers: 'YUL' })).trajet).toContain('Aucun vol');
    expect(erreursBrouillon(b({ aller: 'retour', retour: { du: '2026-12-10', au: '2026-12-12' } })).retour).toBeDefined(); expect(erreursBrouillon(b({ aller: 'retour', retour: { du: '2027-01-02', au: '2027-01-09' } })).retour).toBeUndefined();
  });
});

describe('propositions affichées', () => {
  it('écart signé au prix maximum, en $ et en %', () => {
    expect(ecartProposition(1380, 1300)).toMatchObject({ libelle: '+80\u00A0$', pct: '+6\u00A0%', sens: 'dessus', court: '+80\u00A0$ vs votre max' }); expect(ecartProposition(1300, 1300)).toMatchObject({ libelle: '= votre prix', sens: 'egal' });
    expect(ecartProposition(1250, 1300)).toMatchObject({ libelle: '−50\u00A0$', sens: 'dessous' }); expect(ecartNeuf(1380, app.monde.vols.find((v) => v.id === 'v-ae816')!)).toBe('−33\u00A0%');
  });
  it('les lignes de INT-4F7K : de la moins chère à la plus chère, badges, billets du monde simulé', () => {
    const l = lignesPropositions(intentionDe('INT-4F7K')!); expect(l.map((x) => x.prix)).toEqual([1300, 1380, 1500]);
    expect(l[0]).toMatchObject({ delta: '= votre prix', badge: 'Au prix : accord automatique en cours', ton: 'vert', ouverte: true, titre: 'Aérolys 816 · direct', sous: 'ven. 18 déc. · détenteur vérifié' });
    expect(l[1]).toMatchObject({ delta: '+80\u00A0$', badge: 'Au-dessus de votre prix', ton: 'gris', titre: 'Nordelle 224 · 1 escale (KEF)' }); expect(l[1].aria).toContain('80\u00A0$ au-dessus de votre prix');
    expect(l[2]).toMatchObject({ ouverte: false, badge: 'Expirée', ton: 'neutre' }); expect(ouvertes(intentionDe('INT-4F7K')!).map((p) => p.id)).toEqual(['p-2', 'p-3']);
  });
  it('libellés : vendeur, vol, rang, source des fonds', () => {
    expect([vendeurLibelle(1), vendeurLibelle(2)]).toEqual(['détenteur vérifié', '2e détenteur, vérifié']); expect([ordinal(1), ordinal(3)]).toEqual(['1er', '3e']);
    expect(titreVol(app.monde.vols.find((v) => v.id === 'v-no220')!)).toBe('Nordelle 220 · 1 escale (KEF)'); expect(rangDetenteur(app.monde.droits.find((d) => d.id === 'd-ppt')!)).toBe(3);
    expect(libelleSource('carte', compteDe(ALEX))).toBe('Carte •••• 4821 (test)'); expect(libelleSource('solde', compteDe(ALEX))).toBe('Solde NexG'); expect(libelleSource('wallet', undefined)).toBe('Wallet du téléphone');
  });
  it('ce que voient les vendeurs : initiale, trajet, fenêtre, prix max, jamais le nom', () => {
    const v = vueVendeurs(intentionDe('INT-4F7K')!, compteDe(ALEX)); expect(v).toEqual({ initiale: 'A.', trajet: 'YUL → CDG', fenetre: '15–20 déc.', max: '1\u00A0300\u00A0$', fonds: true }); expect(JSON.stringify(v)).not.toMatch(/Tremblay|4821/);
  });
  it('onglets : actives, conclues, expirées', () => {
    const o = comptesOnglets(ALEX); expect([o.actives.length, o.conclues.length, o.expirees.length]).toEqual([1, 1, 0]); expect(dansOnglet(intentionDe('INT-2B9X')!, 'conclues')).toBe(true);
  });
});

describe('temps', () => {
  it('compte à rebours et jours restants', () => {
    expect(horloge(169_956_000)).toBe('47:12:36'); expect(horloge(-5)).toBe('00:00:00'); expect(horlogeAria(3_723_000)).toBe('Valide encore 1 heures 2 minutes 3 secondes'); expect(joursRestants(30 * 86_400_000, 0)).toBe(30); expect(joursRestants(0, 5)).toBe(0);
  });
});

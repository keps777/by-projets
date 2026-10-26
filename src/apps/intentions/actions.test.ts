import { beforeEach, describe, expect, it } from 'vitest';
import { app, jourDe, maintenant } from '../../data/store.svelte.ts';
import { etatInitial } from '../../data/seed.ts';
import { compteDe } from '../../domain/compte.ts';
import { ErreurIntention, accepterProposition, actualiser, contreProposer, creerIntention, diffuser, enregistrerBrouillon, recevoirProposition, refuserProposition, retirerIntention } from './actions.ts';
import { accordDe, contreDe, detailDe, intentionDe, lire, motifFin, trancheIntentions, type Brouillon } from './modele.ts';

const ALEX = 'ACC-0412', J = 86_400_000;
beforeEach(() => { for (const k of Object.keys(app)) delete (app as unknown as Record<string, unknown>)[k]; Object.assign(app, etatInitial()); });
const alex = () => compteDe(ALEX)!;
const brouillon = (o: Partial<Brouillon> = {}): Brouillon => ({ de: 'YUL', vers: 'CDG', aller: 'simple', du: '2026-12-15', au: '2026-12-20', flexible: true, voyageurs: 1, budget: 1300, validite: '30', auto: true, auDessus: true, anonyme: true, ...o });
const code = (f: () => unknown): string | undefined => { try { f(); } catch (e) { return (e as ErreurIntention).code ?? (e as Error).message; } return undefined; };
const ledger = (id = ALEX) => app.monde.ecritures.filter((e) => e.compteId === id).map((e) => [e.type, e.montant]);

describe('monde de départ', () => {
  it('INT-4F7K : 3 propositions, fonds réservés, détail déduit', () => {
    const i = intentionDe('INT-4F7K')!; expect(i.propositions.map((p) => p.prix)).toEqual([1500, 1380, 1300]); expect(i.fondsReserves).toBe(1300);
    const d = detailDe(i); expect([d.du, d.au, d.voyageurs, d.validite, d.source]).toEqual(['2026-12-15', '2026-12-20', 1, '30', 'carte']); expect(d.expire).toBeGreaterThan(maintenant());
  });
  it('INT-2B9X : accord déduit sur le droit du compte au prix maximum', () => {
    const a = accordDe(intentionDe('INT-2B9X')!)!; expect(a).toMatchObject({ droitId: 'd-hav', prix: 350, enPlus: 0 }); expect(accordDe(intentionDe('INT-4F7K')!)).toBeUndefined();
  });
});

describe('publier et réserver les fonds', () => {
  it('sur la carte : intention publiée, fonds « réservés », aucun mouvement du solde', () => {
    const avant = alex().solde; const i = creerIntention(ALEX, brouillon({ budget: 1000 }), 'carte');
    expect(i).toMatchObject({ compteId: ALEX, de: 'YUL', vers: 'CDG', budget: 1000, fondsReserves: 1000, statut: 'publiee', propositions: [] }); expect(i.id).toMatch(/^INT-[A-Z0-9]{4}$/);
    expect(alex().solde).toBe(avant); expect(alex().enAttente).toBe(0); expect(detailDe(i)).toMatchObject({ source: 'carte', auto: true, anonyme: true }); expect(Math.abs(detailDe(i).expire - (maintenant() + 30 * J))).toBeLessThan(5000);
  });
  it('sur le solde NexG : le montant passe en « réservé » et le grand livre le dit', () => {
    const i = creerIntention(ALEX, brouillon({ budget: 550, voyageurs: 2 }), 'solde');
    expect(i.fondsReserves).toBe(1100); expect(alex().solde).toBe(52); expect(alex().enAttente).toBe(1100); expect(app.monde.ecritures.at(-1)).toMatchObject({ type: 'fonds_reserves', montant: -1100, solde: 52 });
  });
  it('refuse : solde insuffisant, carte absente, brouillon invalide, fenêtre trop proche pour J-3', () => {
    expect(code(() => creerIntention(ALEX, brouillon({ budget: 1300 }), 'solde'))).toBe('solde'); expect(alex().solde).toBe(1152);
    alex().carte4 = undefined; expect(code(() => creerIntention(ALEX, brouillon(), 'carte'))).toBe('carte'); expect(creerIntention(ALEX, brouillon(), 'wallet').fondsReserves).toBe(1300);
    expect(code(() => creerIntention(ALEX, brouillon({ de: 'CDG' }), 'wallet'))).toBe('brouillon'); expect(code(() => creerIntention(ALEX, brouillon({ budget: 5 }), 'wallet'))).toBe('brouillon');
    expect(code(() => creerIntention(ALEX, brouillon({ du: '2026-10-13', au: '2026-10-14', validite: 'j3' }), 'wallet'))).toBe('brouillon');
    expect(code(() => creerIntention('inconnu', brouillon(), 'wallet'))).toBe('compte');
  });
  it('« jusqu’à J-3 » expire 3 jours avant la fenêtre', () => {
    const i = creerIntention(ALEX, brouillon({ validite: 'j3' }), 'carte'); expect(jourDe(detailDe(i).expire)).toBe('2026-12-12'); expect(detailDe(i).expire).toBeLessThan(Date.parse('2026-12-15'));
  });
  it('le brouillon survit d’un écran à l’autre puis disparaît à la création', () => {
    enregistrerBrouillon(brouillon({ budget: 1200 })); expect(lire().brouillon?.budget).toBe(1200); creerIntention(ALEX, lire().brouillon!, 'carte'); expect(lire().brouillon).toBeUndefined();
  });
});

describe('retirer une intention : les fonds sont libérés', () => {
  it('sur le solde : tout revient, rien n’est prélevé, les propositions sont déclinées', () => {
    alex().solde = 3000; const i = creerIntention(ALEX, brouillon({ budget: 1000, auto: false }), 'solde'); expect(alex().solde).toBe(2000);
    recevoirProposition(i.id, 'd-r224', 1380); // au-dessus du prix max, facultative
    expect(retirerIntention(ALEX, i.id)).toBe(1000);
    expect(alex().solde).toBe(3000); expect(alex().enAttente).toBe(0); expect(i.statut).toBe('annulee'); expect(i.fondsReserves).toBe(0); expect(i.propositions.map((p) => p.statut)).toEqual(['refusee']); expect(motifFin(i.id)).toBe('retiree');
    expect(ledger().slice(-2)).toEqual([['fonds_reserves', -1000], ['fonds_reserves', 1000]]);
  });
  it('INT-4F7K (carte) : 1 300 $ libérés, 3 propositions déclinées, le solde ne bouge pas', () => {
    const i = intentionDe('INT-4F7K')!; expect(retirerIntention(ALEX, i.id)).toBe(1300); expect(i.fondsReserves).toBe(0); expect(i.propositions.every((p) => p.statut === 'refusee')).toBe(true); expect(alex().solde).toBe(1152);
  });
  it('refuse de retirer deux fois, une intention conclue ou celle d’un autre', () => {
    retirerIntention(ALEX, 'INT-4F7K'); expect(code(() => retirerIntention(ALEX, 'INT-4F7K'))).toBe('statut'); expect(code(() => retirerIntention(ALEX, 'INT-2B9X'))).toBe('statut');
    expect(code(() => retirerIntention('ACC-0301', 'INT-4F7K'))).toBe('introuvable');
  });
});

describe('expiration', () => {
  it('à l’échéance de la validité : intention expirée, fonds libérés, propositions expirées', () => {
    alex().solde = 3000; const i = creerIntention(ALEX, brouillon({ budget: 1000, validite: '7' }), 'solde');
    expect(actualiser(ALEX, maintenant() + 6 * J)).toEqual({ intentions: 0, propositions: 3 }); expect(i.statut).toBe('publiee');
    expect(actualiser(ALEX, maintenant() + 8 * J)).toEqual({ intentions: 1, propositions: 0 }); expect(i.statut).toBe('annulee'); expect(motifFin(i.id)).toBe('expiree'); expect(alex().solde).toBe(3000); expect(alex().enAttente).toBe(0);
    expect(actualiser(ALEX, maintenant() + 9 * J)).toEqual({ intentions: 0, propositions: 0 }); // idempotent
  });
  it('une proposition n’engage son vendeur que 48 h', () => {
    expect(actualiser(ALEX).propositions).toBe(1); expect(intentionDe('INT-4F7K')!.propositions.map((p) => p.statut)).toEqual(['expiree', 'recue', 'recue']); // p-1 date du 9 oct.
    expect(actualiser(ALEX, maintenant() + 2 * J).propositions).toBe(2);
  });
});

describe('propositions : plafond et options', () => {
  it('refuse un prix au-dessus du plafond de revente (prix neuf équivalent) ou un billet hors trajet', () => {
    const i = creerIntention(ALEX, brouillon({ budget: 1000, auto: false }), 'carte');
    expect(code(() => recevoirProposition(i.id, 'd-r816', 2051))).toBe('plafond'); expect(code(() => recevoirProposition(i.id, 'd-r830', 800))).toBe('droit'); expect(code(() => recevoirProposition(i.id, 'd-812', 800))).toBe('droit');
    expect(recevoirProposition(i.id, 'd-r816', 2050)?.prix).toBe(2050);
  });
  it('au-dessus du prix max : reçue seulement si l’option est activée', () => {
    const non = creerIntention(ALEX, brouillon({ budget: 1000, auDessus: false }), 'carte'); expect(recevoirProposition(non.id, 'd-r224', 1380)).toBeUndefined(); expect(non.propositions).toHaveLength(0);
    const oui = creerIntention(ALEX, brouillon({ budget: 1000 }), 'carte'); expect(recevoirProposition(oui.id, 'd-r224', 1380)?.statut).toBe('recue');
  });
  it('à publication, les billets déjà à ce prix sont proposés ; accord automatique sur le moins cher', () => {
    alex().solde = 3000; const i = creerIntention(ALEX, brouillon({ budget: 1400 }), 'solde');
    expect(i.statut).toBe('accord'); expect(accordDe(i)).toMatchObject({ droitId: 'd-r224', prix: 1380, capture: 1380, enPlus: 0, reserve: 1400 });
    expect(app.monde.droits.find((d) => d.id === 'd-r224')).toMatchObject({ detenteurId: ALEX, prixPaye: 1380, statut: 'detenu', origine: 'revente' });
    expect(alex().solde).toBe(3000 - 1380); expect(alex().enAttente).toBe(0); expect(ledger().slice(-3)).toEqual([['fonds_reserves', -1400], ['fonds_reserves', 1400], ['achat', -1380]]);
  });
  it('sans accord automatique : proposé mais pas conclu', () => {
    const i = creerIntention(ALEX, brouillon({ budget: 1400, auto: false }), 'carte'); expect(i.statut).toBe('publiee'); expect(i.propositions.map((p) => [p.prix, p.statut])).toEqual([[1380, 'recue']]);
    expect(diffuser(i.id)).toHaveLength(1); expect(i.propositions).toHaveLength(1); // pas de doublon
  });
});

describe('accepter une proposition', () => {
  it('vend immédiatement le droit via acheter() au prix proposé, capture la réserve, débite la différence', () => {
    const a = accepterProposition(ALEX, 'INT-4F7K', 'p-2'); const i = intentionDe('INT-4F7K')!;
    expect(a).toMatchObject({ prix: 1380, reserve: 1300, capture: 1300, enPlus: 80, source: 'carte' }); expect(i.statut).toBe('accord'); expect(i.fondsReserves).toBe(0);
    const d = app.monde.droits.find((x) => x.id === 'd-r224')!; expect([d.detenteurId, d.prixPaye, d.statut, d.annonce]).toEqual([ALEX, 1380, 'detenu', undefined]);
    expect(d.chaine.at(-1)).toMatchObject({ type: 'revente', de: 'ACC-0233', vers: ALEX, prix: 1380, commission: 138 }); // vendeur membre du Pass : 10 %
    expect(compteDe('ACC-0233')!.solde).toBe(1242); expect(i.propositions.map((p) => p.statut)).toEqual(['refusee', 'acceptee', 'refusee']); expect(a.refusees).toBe(2);
    expect(accordDe(i)).toEqual(a); expect(app.monde.droits.find((x) => x.id === 'd-r816b')!.statut).toBe('en_vente'); // les autres billets restent en vente
  });
  it('une proposition au prix maximum conclut sans rien débiter en plus', () => {
    const a = accepterProposition(ALEX, 'INT-4F7K', 'p-3'); expect(a).toMatchObject({ prix: 1300, enPlus: 0, droitId: 'd-r816b' }); expect(app.monde.droits.find((x) => x.id === 'd-r816b')!.prixPaye).toBe(1300);
  });
  it('refuse une proposition expirée, déjà traitée, ou dont le billet est vendu', () => {
    expect(code(() => accepterProposition(ALEX, 'INT-4F7K', 'p-1'))).toBe('expiree'); expect(intentionDe('INT-4F7K')!.propositions[0].statut).toBe('expiree'); expect(code(() => accepterProposition(ALEX, 'INT-4F7K', 'p-1'))).toBe('statut');
    app.monde.droits.find((d) => d.id === 'd-r224')!.statut = 'detenu'; expect(code(() => accepterProposition(ALEX, 'INT-4F7K', 'p-2'))).toBe('droit'); expect(intentionDe('INT-4F7K')!.statut).toBe('publiee');
    expect(code(() => accepterProposition('ACC-0301', 'INT-4F7K', 'p-3'))).toBe('introuvable'); expect(code(() => accepterProposition(ALEX, 'INT-4F7K', 'zzz'))).toBe('introuvable');
  });
  it('plafond : un prix au-dessus du prix neuf équivalent ne s’accepte pas', () => {
    intentionDe('INT-4F7K')!.propositions[2].prix = 9999; expect(code(() => accepterProposition(ALEX, 'INT-4F7K', 'p-3'))).toBe('plafond');
  });
  it('sur le solde : la différence au-dessus de la réserve est débitée en plus ; échec = réserve rétablie', () => {
    alex().solde = 3000; const i = creerIntention(ALEX, brouillon({ budget: 1000, auto: false }), 'solde'); const p = recevoirProposition(i.id, 'd-r224', 1380)!;
    expect(accepterProposition(ALEX, i.id, p.id)).toMatchObject({ reserve: 1000, capture: 1000, enPlus: 380 }); expect(alex().solde).toBe(3000 - 1380);
    alex().solde = 2000; const j = creerIntention(ALEX, brouillon({ budget: 1000, auto: false }), 'solde'); const q = recevoirProposition(j.id, 'd-r816', 1500)!;
    alex().solde = 400; // 400 $ disponibles + 1 000 réservés < 1 500
    expect(code(() => accepterProposition(ALEX, j.id, q.id))).toBe('solde'); expect(alex().solde).toBe(400); expect(j.statut).toBe('publiee'); expect(j.fondsReserves).toBe(1000);
  });
});

describe('refuser et contre-proposer', () => {
  it('refuser décline la proposition, l’intention reste active', () => {
    expect(refuserProposition(ALEX, 'INT-4F7K', 'p-2')).toBe(1); // reste p-3 (p-1 a expiré avec le temps)
    const i = intentionDe('INT-4F7K')!; expect(i.statut).toBe('publiee'); expect(i.propositions[1].statut).toBe('refusee'); expect(code(() => refuserProposition(ALEX, 'INT-4F7K', 'p-2'))).toBe('statut');
  });
  it('contre-proposer : entre le prix max et la proposition, par pas de 10 $, remplaçable ; la proposition reste acceptable', () => {
    expect(contreProposer(ALEX, 'INT-4F7K', 'p-2', 1340)).toMatchObject({ propositionId: 'p-2', prix: 1340 });
    expect(code(() => contreProposer(ALEX, 'INT-4F7K', 'p-2', 1290))).toBe('prix'); expect(code(() => contreProposer(ALEX, 'INT-4F7K', 'p-2', 1385))).toBe('prix'); expect(code(() => contreProposer(ALEX, 'INT-4F7K', 'p-2', 1390))).toBe('prix');
    contreProposer(ALEX, 'INT-4F7K', 'p-2', 1360); expect(trancheIntentions().contres).toHaveLength(1); expect(contreDe('p-2')?.prix).toBe(1360);
    expect(accepterProposition(ALEX, 'INT-4F7K', 'p-2').prix).toBe(1380);
  });
  it('notifie le vendeur', () => {
    compteDe('ACC-0233')!.prefsNotif = 'tout'; contreProposer(ALEX, 'INT-4F7K', 'p-2', 1340); expect(app.monde.notifications.some((n) => n.compteId === 'ACC-0233' && n.titre.startsWith('Contre-proposition'))).toBe(true);
  });
});

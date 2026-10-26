import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../data/store.svelte.ts';
import { etatInitial } from '../../data/seed.ts';
import { compteDe } from '../../domain/compte.ts';
import { ecrire } from '../../domain/marche.ts';
import type { Ecriture } from '../../domain/types.ts';
import { DELAI_VERSEMENT_JOURS, dateCourte, dateLongue, ecrituresDe, enCours, filtrer, grouperParMois, jourLong, montantVersable, periode, reglerVersements, reinitialiserDemo, soldeOuverture, totaux, verifierVersement, verser } from './actions.ts';

const ALEX = 'ACC-0412', MAINTENANT = Date.parse('2026-10-12T09:00'), J = 86_400_000;
beforeEach(() => { for (const k of Object.keys(app)) delete (app as unknown as Record<string, unknown>)[k]; Object.assign(app, etatInitial()); app.session.compteId = ALEX; });
const e = (id: string, quand: string, type: Ecriture['type'], montant: number, solde: number, extra: Partial<Ecriture> = {}): Ecriture => ({ id, compteId: ALEX, quand: Date.parse(quand), type, libelle: id, montant, solde, ...extra });

describe('grand livre', () => {
  it('ne garde que les écritures du compte, dans l’ordre du temps', () => {
    app.monde.ecritures.push(e('autre', '2026-08-01T10:00', 'achat', -5, 0, { compteId: 'ACC-0187' }));
    const l = ecrituresDe(app.monde.ecritures, ALEX); expect(l.map((x) => x.id)).toEqual(['e-1', 'e-2']);
  });
  it('place chaque commission juste sous la revente du même droit', () => {
    const brut = [e('r1', '2026-08-10T10:00', 'revente', 1000, 1000, { droitId: 'a' }), e('r2', '2026-08-10T10:00', 'revente', 500, 1500, { droitId: 'b' }), e('c1', '2026-08-10T10:00', 'commission', -100, 1400, { droitId: 'a' }), e('c2', '2026-08-10T10:00', 'commission', -50, 1350, { droitId: 'b' })];
    expect(ecrituresDe(brut, ALEX).map((x) => x.id)).toEqual(['r1', 'c1', 'r2', 'c2']);
  });
  it('une commission sans revente connue reste dans l’ordre du temps', () => {
    const brut = [e('a', '2026-08-01T10:00', 'revente', 100, 100), e('c', '2026-08-02T10:00', 'commission', -10, 90, { droitId: 'zz' }), e('b', '2026-08-03T10:00', 'achat', -20, 70)];
    expect(ecrituresDe(brut, ALEX).map((x) => x.id)).toEqual(['a', 'c', 'b']);
  });
  it('filtre les entrées et les sorties sans changer les soldes affichés', () => {
    const l = ecrituresDe(app.monde.ecritures, ALEX);
    expect(filtrer(l, 'tout')).toHaveLength(2); expect(filtrer(l, 'entrees').map((x) => x.id)).toEqual(['e-1']); expect(filtrer(l, 'sorties').map((x) => x.id)).toEqual(['e-2']);
    expect(filtrer(l, 'sorties')[0].solde).toBe(1152);
  });
  it('totalise entrées et sorties et trouve le solde d’ouverture', () => {
    const l = ecrituresDe(app.monde.ecritures, ALEX);
    expect(totaux(l)).toEqual({ entrees: 1280, sorties: -128 }); expect(soldeOuverture(l)).toBe(0);
    expect(totaux([])).toEqual({ entrees: 0, sorties: 0 }); expect(soldeOuverture([])).toBe(0);
    expect(soldeOuverture([e('x', '2026-09-01T10:00', 'achat', -50, 150)])).toBe(200);
  });
  it('regroupe par mois et formate la période', () => {
    const l = [e('a', '2026-08-28T10:00', 'revente', 1, 1), e('b', '2026-09-03T10:00', 'achat', -1, 0), e('c', '2026-09-20T10:00', 'achat', -1, -1)];
    expect(grouperParMois(l).map((g) => [g.nom, g.lignes.length])).toEqual([['Août 2026', 1], ['Septembre 2026', 2]]);
    expect(jourLong(Date.parse('2026-08-01T10:00'))).toBe('1er août'); expect(jourLong(Date.parse('2026-08-14T10:00'))).toBe('14 août'); expect(dateLongue(Date.parse('2026-08-28T10:00'))).toBe('28 août 2026'); expect(dateLongue(Date.parse('2026-08-28'))).toBe('28 août 2026'); expect(dateCourte(Date.parse('2026-01-14'))).toBe('14 janv. 2026'); expect(dateLongue(Date.parse('2026-09-01T10:00'))).toBe('1er septembre 2026');
    expect(periode(ecrituresDe(app.monde.ecritures, ALEX), MAINTENANT)).toBe('14 août → 12 oct. 2026');
  });
});

describe('versement simulé', () => {
  it('le versable est le solde moins les frais, jamais négatif', () => { expect(montantVersable(1152)).toBe(1152); expect(montantVersable(1152, 2)).toBe(1150); expect(montantVersable(1, 2)).toBe(0); });
  it('exige l’identité vérifiée', () => {
    compteDe(ALEX)!.identiteVerifiee = undefined;
    const r = verifierVersement(ALEX); expect(r.ok).toBe(false); if (!r.ok) expect(r.code).toBe('identite');
    expect(verser(ALEX).ok).toBe(false); expect(compteDe(ALEX)!.solde).toBe(1152); expect(app.monde.ecritures.filter((x) => x.type === 'versement')).toHaveLength(0);
  });
  it('refuse un solde nul, un compte sans compte bancaire et un compte inconnu', () => {
    compteDe(ALEX)!.solde = 0; const a = verifierVersement(ALEX); expect(!a.ok && a.code).toBe('solde');
    compteDe(ALEX)!.solde = 10; compteDe(ALEX)!.carte4 = undefined; const b = verifierVersement(ALEX); expect(!b.ok && b.code).toBe('carte');
    const c = verifierVersement('ACC-9999'); expect(!c.ok && c.code).toBe('compte');
  });
  it('écrit un versement négatif, vide le solde et suit le montant en attente', () => {
    const r = verser(ALEX); expect(r.ok).toBe(true);
    const c = compteDe(ALEX)!; expect(c.solde).toBe(0); expect(c.enAttente).toBe(1152);
    const dernier = app.monde.ecritures.at(-1)!; expect(dernier).toMatchObject({ type: 'versement', montant: -1152, solde: 0, compteId: ALEX });
    expect(enCours(ALEX)).toHaveLength(1); expect(app.monde.notifications.some((n) => n.compteId === ALEX && n.titre.includes('Versement en cours'))).toBe(true);
    expect(verser(ALEX).ok).toBe(false); // plus rien à verser
  });
  it('règle le versement après le délai simulé seulement', () => {
    verser(ALEX); const arrive = enCours(ALEX)[0].arrive;
    expect(reglerVersements(ALEX, arrive - 1)).toBe(0); expect(compteDe(ALEX)!.enAttente).toBe(1152);
    expect(reglerVersements(ALEX, arrive)).toBe(1); expect(compteDe(ALEX)!.enAttente).toBe(0); expect(enCours(ALEX)).toHaveLength(0);
    expect(arrive - MAINTENANT).toBeGreaterThanOrEqual(DELAI_VERSEMENT_JOURS * J - 10_000);
  });
  it('le grand livre garde le solde après chaque mouvement, versement compris', () => {
    ecrire(ALEX, 'achat', 'Achat', -52, {}); verser(ALEX);
    const l = ecrituresDe(app.monde.ecritures, ALEX); expect(l.map((x) => x.solde)).toEqual([1280, 1152, 1100, 0]);
  });
  it('réinitialise la démo et garde le compte connecté', () => {
    verser(ALEX); reinitialiserDemo(ALEX);
    expect(app.session.compteId).toBe(ALEX); expect(compteDe(ALEX)!.solde).toBe(1152); expect(app.monde.ecritures.filter((x) => x.type === 'versement')).toHaveLength(0);
  });
});

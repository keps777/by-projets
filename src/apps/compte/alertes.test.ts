import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../data/store.svelte.ts';
import { etatInitial } from '../../data/seed.ts';
import { compteDe } from '../../domain/compte.ts';
import { BUDGET_MAX, basculerAlerte, correspondances, creerAlerte, etat, evaluerAlertes, historiqueDe, libelleActives, metaDe, sousTitreAlerte, supprimerAlerte, titreAlerte, trouverAeroport, trouverDestination, typesEffectifs, validerAlerte, type Brouillon } from './alertes.ts';

const ALEX = 'ACC-0412', MAINTENANT = Date.parse('2026-10-12T09:00');
beforeEach(() => { for (const k of Object.keys(app)) delete (app as unknown as Record<string, unknown>)[k]; Object.assign(app, etatInitial()); app.session.compteId = ALEX; });
const base = (p: Partial<Brouillon> = {}): Brouillon => ({ depart: 'Montréal (YUL)', destination: 'Partout', budget: 600, types: ['drop', 'revente'], flexible: true, date: '', canaux: ['notification'], ...p });

describe('lieux', () => {
  it('reconnaît un aéroport par code, ville ou libellé complet', () => { expect(trouverAeroport('Montréal (YUL)')).toBe('YUL'); expect(trouverAeroport('yul')).toBe('YUL'); expect(trouverAeroport('montreal')).toBe('YUL'); expect(trouverAeroport('Atlantide')).toBeUndefined(); });
  it('la destination peut être « Partout », une zone ou un aéroport', () => { expect(trouverDestination(' partout ')).toBe('Partout'); expect(trouverDestination('europe')).toBe('Europe'); expect(trouverDestination('Paris (CDG)')).toBe('CDG'); expect(trouverDestination('zzz')).toBeUndefined(); });
});

describe('validation', () => {
  it('accepte un brouillon complet', () => expect(validerAlerte(base(), true)).toEqual({}));
  it('refuse départ inconnu, même départ et destination, budget absurde', () => {
    expect(validerAlerte(base({ depart: 'Nulle part' }), true).depart).toBeTruthy(); expect(validerAlerte(base({ destination: 'YUL' }), true).destination).toContain('différer');
    expect(validerAlerte(base({ budget: 0 }), true).budget).toBeTruthy(); expect(validerAlerte(base({ budget: Number.NaN }), true).budget).toBeTruthy(); expect(BUDGET_MAX).toBe(2000);
  });
  it('exige un type, un canal et une date quand les dates ne sont pas flexibles', () => {
    expect(validerAlerte(base({ types: [] }), true).types).toBe('Choisissez au moins un type d’offre.'); expect(validerAlerte(base({ canaux: [] }), true).canaux).toBe('Choisissez au moins un canal.');
    expect(validerAlerte(base({ flexible: false, date: '' }), true).date).toBeTruthy(); expect(validerAlerte(base({ flexible: false, date: '2027-02-21' }), true).date).toBeUndefined();
  });
  it('les drops seuls sont réservés au Pass', () => { expect(validerAlerte(base({ types: ['drop'] }), false).types).toContain('Pass NexG'); expect(validerAlerte(base({ types: ['drop'] }), true).types).toBeUndefined(); expect(typesEffectifs(['drop', 'revente'], false)).toEqual(['revente']); });
});

describe('création, bascule, suppression', () => {
  it('crée une alerte active avec ses préférences', () => {
    const r = creerAlerte(ALEX, base({ destination: 'Paris (CDG)', budget: 1600, types: ['revente'] })); expect(r.ok).toBe(true); if (!r.ok) return;
    expect(app.monde.alertes.at(-1)).toMatchObject({ compteId: ALEX, de: 'YUL', vers: 'CDG', prixMax: 1600, actif: true }); expect(metaDe(r.alerte).types).toEqual(['revente']);
    expect(titreAlerte(r.alerte, metaDe(r.alerte))).toBe('YUL → CDG'); expect(sousTitreAlerte(r.alerte, metaDe(r.alerte))).toBe('En revente · ≤ 1 600 $');
  });
  it('renvoie les erreurs sans rien écrire', () => { const n = app.monde.alertes.length; const r = creerAlerte(ALEX, base({ types: [] })); expect(r.ok).toBe(false); expect(app.monde.alertes).toHaveLength(n); expect(creerAlerte('ACC-9999', base()).ok).toBe(false); });
  it('une alerte de zone en drops s’appelle « Drops Europe »', () => { const r = creerAlerte(ALEX, base({ destination: 'Europe', types: ['drop'] })); if (r.ok) { expect(titreAlerte(r.alerte, metaDe(r.alerte))).toBe('Drops Europe'); expect(sousTitreAlerte(r.alerte, metaDe(r.alerte))).toBe('Au départ de Montréal · à l’ouverture'); } else throw new Error('refusée'); });
  it('active, désactive et supprime', () => {
    const a = app.monde.alertes[0]; expect(a.actif).toBe(true); basculerAlerte(a.id); expect(app.monde.alertes[0].actif).toBe(false); basculerAlerte(a.id); expect(app.monde.alertes[0].actif).toBe(true);
    expect(supprimerAlerte(a.id)).toBe(true); expect(app.monde.alertes.find((x) => x.id === a.id)).toBeUndefined(); expect(supprimerAlerte(a.id)).toBe(false); expect(basculerAlerte('inconnue')).toBe(false);
  });
  it('compte les alertes actives', () => { expect(libelleActives(0)).toBe('Aucune active'); expect(libelleActives(1)).toBe('1 active'); expect(libelleActives(3)).toBe('3 actives'); });
});

describe('déclenchement', () => {
  it('« YUL → Partout, ≤ 600 $ » trouve des reventes sous le plafond, jamais plus chères', () => {
    const a = app.monde.alertes[0], k = correspondances(a, metaDe(a), true, MAINTENANT);
    expect(k.length).toBeGreaterThan(0); expect(k.every((x) => x.prix <= 600)).toBe(true); expect(k.map((x) => x.prix)).toEqual([...k.map((x) => x.prix)].sort((x, y) => x - y));
  });
  it('n’offre jamais à quelqu’un ses propres billets en revente', () => {
    const a = app.monde.alertes[0]; a.prixMax = 700; const k = correspondances(a, metaDe(a), true, MAINTENANT); expect(k.some((x) => x.offreId === 'revente:d-hav')).toBe(false);
  });
  it('un plafond bas ne trouve rien ; une date fixe filtre sur le jour du vol', () => {
    const a = app.monde.alertes[0]; a.prixMax = 50; expect(correspondances(a, metaDe(a), true, MAINTENANT)).toEqual([]);
    a.actif = false; const r = creerAlerte(ALEX, base({ budget: 700, flexible: false, date: '2000-01-01' })); expect(r.ok && r.declenchees).toBe(0);
  });
  it('notifie et enregistre une seule fois chaque offre', () => {
    compteDe(ALEX)!.prefsNotif = 'tout'; const avant = app.monde.notifications.length;
    const n1 = evaluerAlertes(ALEX, MAINTENANT); expect(n1.length).toBeGreaterThan(0); expect(app.monde.notifications.length).toBe(avant + n1.length);
    expect(app.monde.notifications[0].type).toBe('prix'); expect(app.monde.notifications[0].lien).toMatch(/^\/offre\/(revente|neuf):/);
    expect(evaluerAlertes(ALEX, MAINTENANT)).toEqual([]); expect(historiqueDe(ALEX)).toHaveLength(n1.length); expect(etat().historique.length).toBe(n1.length);
  });
  it('une alerte désactivée ne se déclenche pas', () => { app.monde.alertes[0].actif = false; expect(evaluerAlertes(ALEX, MAINTENANT)).toEqual([]); });
  it('sans Pass, les drops sont écartés', () => {
    const a = app.monde.alertes[0], m = { ...metaDe(a), types: ['drop' as const] }; a.prixMax = 5000;
    expect(correspondances(a, m, false, MAINTENANT)).toEqual([]);
  });
});

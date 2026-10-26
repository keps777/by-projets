import { beforeEach, describe, expect, it } from 'vitest';
import { app, maintenant } from '../data/store.svelte.ts';
import { etatInitial } from '../data/seed.ts';
import { acheterDrop, alerterDrop, dropAffiche, dropDe, dureeEpuisement, ErreurDrop, estAlerte, etatDrop, prises, prochainDrop, prochainsDrops, retirerAlerteDrop } from './drop.ts';
import { droitDe, offresDuVol } from './marche.ts';

beforeEach(() => { for (const k of Object.keys(app)) delete (app as unknown as Record<string, unknown>)[k]; Object.assign(app, etatInitial()); });
const ALEX = 'ACC-0412', CAMILLE = 'ACC-0187', PAUL = 'ACC-0233', INES = 'ACC-0402';
const code = (f: () => unknown) => { try { f(); } catch (e) { return e instanceof ErreurDrop ? e.code : `autre:${(e as Error).message}`; } return 'aucune'; };

describe('état d’un drop', () => {
  it('le drop du seed est en direct, puis terminé à sa fin, épuisé sans place', () => {
    const d = dropDe('drop-128')!; expect(etatDrop(d)).toBe('direct'); expect(dropAffiche()?.id).toBe('drop-128');
    expect(etatDrop(d, d.fin + 1)).toBe('termine'); expect(etatDrop(d, d.ouvre - 1)).toBe('avenir');
    d.restantes = 0; expect(etatDrop(d)).toBe('epuise'); expect(dropAffiche()?.id).toBe('drop-128');
  });
  it('un drop épuisé ou terminé reste affiché ; aucun drop ouvert : rien', () => {
    app.monde.drops = []; expect(dropAffiche()).toBeUndefined();
    app.monde.drops = [{ ...etatInitial().monde.drops[0], ouvre: maintenant() + 1000, fin: maintenant() + 9000 }]; expect(dropAffiche()).toBeUndefined();
  });
  it('la jauge compte les places prises ; la durée d’épuisement est stable (0,8 s pour le n° 128)', () => {
    expect(prises(dropDe('drop-128')!)).toBe(3); expect(prises({ places: 6, restantes: 0 })).toBe(6); expect(dureeEpuisement({ n: 128 })).toBe(800); expect(dureeEpuisement({ n: 128 })).toBe(dureeEpuisement({ n: 128 }));
  });
});

describe('acheterDrop', () => {
  it('un membre du Pass obtient une place : restantes −1, droit « drop », chaîne « drop », notification', () => {
    const avant = dropDe('drop-128')!.restantes; const d = acheterDrop('drop-128', ALEX);
    expect(dropDe('drop-128')!.restantes).toBe(avant - 1); expect(dropDe('drop-128')!.servis).toEqual([ALEX]);
    expect(d).toMatchObject({ detenteurId: ALEX, statut: 'detenu', origine: 'drop', dropId: 'drop-128', prixPaye: 200, volId: 'v-no905' }); expect(d.ref).toMatch(/^NXG-/); expect(d.pnr).toHaveLength(7);
    expect(d.chaine).toHaveLength(1); expect(d.chaine[0]).toMatchObject({ type: 'drop', de: 'nexgtt', vers: ALEX, prix: 200 }); expect(droitDe(d.id)).toBe(d);
    const n = app.monde.notifications.find((x) => x.type === 'drop' && x.lien === `/droit/${d.id}`); expect(n?.titre).toMatch(/n° 128.*confirmée/); expect(n?.compteId).toBe(ALEX);
  });
  it('une place par membre et par drop', () => { acheterDrop('drop-128', ALEX); expect(code(() => acheterDrop('drop-128', ALEX))).toBe('deja'); expect(dropDe('drop-128')!.restantes).toBe(2); });
  it('exige le Pass, un compte actif et un drop existant', () => {
    expect(code(() => acheterDrop('drop-128', CAMILLE))).toBe('pass'); expect(code(() => acheterDrop('drop-128', 'ACC-9999'))).toBe('compte'); expect(code(() => acheterDrop('drop-999', ALEX))).toBe('drop');
    app.monde.comptes.find((c) => c.id === PAUL)!.actif = false; expect(code(() => acheterDrop('drop-128', PAUL))).toBe('compte'); expect(dropDe('drop-128')!.restantes).toBe(3);
  });
  it('premier arrivé : la dernière place part, puis le drop est épuisé', () => {
    const dr = dropDe('drop-128')!; dr.restantes = 1; acheterDrop('drop-128', ALEX); expect(dr.restantes).toBe(0); expect(etatDrop(dr)).toBe('epuise');
    expect(code(() => acheterDrop('drop-128', PAUL))).toBe('epuise'); expect(dr.servis).toEqual([ALEX]);
  });
  it('refuse hors de la fenêtre d’ouverture', () => {
    const dr = dropDe('drop-128')!; dr.fin = maintenant() - 1; expect(code(() => acheterDrop('drop-128', ALEX))).toBe('termine');
    dr.fin = maintenant() + 60_000; dr.ouvre = maintenant() + 5_000; expect(code(() => acheterDrop('drop-128', ALEX))).toBe('pas_ouvert'); expect(dr.restantes).toBe(3);
  });
  it('paiement par le solde NexG : écriture au grand livre ; solde insuffisant refusé', () => {
    const alex = app.monde.comptes.find((c) => c.id === ALEX)!, avant = alex.solde; const d = acheterDrop('drop-128', ALEX, 'solde');
    expect(alex.solde).toBe(avant - 200); expect(app.monde.ecritures.at(-1)).toMatchObject({ compteId: ALEX, type: 'achat', montant: -200, droitId: d.id });
    const ines = app.monde.comptes.find((c) => c.id === INES)!; expect(ines.solde).toBeLessThan(200); expect(code(() => acheterDrop('drop-128', INES, 'solde'))).toBe('solde'); expect(dropDe('drop-128')!.servis).not.toContain(INES);
  });
  it('par carte, le solde ne bouge pas ; le drop sort des offres une fois épuisé', () => {
    const alex = app.monde.comptes.find((c) => c.id === ALEX)!, avant = alex.solde; dropDe('drop-128')!.restantes = 1; acheterDrop('drop-128', ALEX, 'carte');
    expect(alex.solde).toBe(avant); expect(offresDuVol('v-no905', true).some((o) => o.type === 'drop')).toBe(false);
  });
  it('refuse après l’échéance du vol', () => {
    const v = app.monde.vols.find((x) => x.id === 'v-no905')!; v.jour = '2026-10-12'; v.heureDepart = '12:00'; expect(code(() => acheterDrop('drop-128', ALEX))).toBe('echeance');
  });
});

describe('prochains drops et alertes', () => {
  it('les prochains drops sont triés ; le prochain est le plus proche', () => {
    const l = prochainsDrops(); expect(l.map((d) => d.id)).toEqual(['dv-1', 'dv-2', 'dv-3']); expect(prochainDrop()?.id).toBe('dv-1'); expect(prochainsDrops(l[0].ouvre).map((d) => d.id)).toEqual(['dv-2', 'dv-3']);
  });
  it('m’alerter est idempotent et se retire', () => {
    expect(alerterDrop('dv-1', ALEX)).toBe(true); expect(alerterDrop('dv-1', ALEX)).toBe(true);
    const d = app.monde.dropsAVenir.find((x) => x.id === 'dv-1')!; expect(d.alerteIds).toEqual([ALEX]); expect(estAlerte(d, ALEX)).toBe(true); expect(estAlerte(d, PAUL)).toBe(false);
    retirerAlerteDrop('dv-1', ALEX); expect(d.alerteIds).toEqual([]); expect(alerterDrop('dv-inconnu', ALEX)).toBe(false); expect(alerterDrop('dv-1', 'ACC-9999')).toBe(false);
  });
});

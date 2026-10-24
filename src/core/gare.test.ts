import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app, reinitialiser } from '../data/store.svelte.ts';
import { attenduDeCaisse, fermerCaisse, reserver, scannerBillet, siegesIndisponibles, ligneDe } from '../domain/actions.ts';
import { planSieges } from './sieges.ts';
import { texteRapport } from './rapport.ts';
import { attenduCaisseMonde, construireRapport, departsGare, recetteDuJour } from './gare.ts';
import type { Depart } from '../domain/types.ts';

const MAINT = new Date('2026-11-03T07:30:00').getTime(), JOUR = '2026-11-03';
const sieges = (d: Depart, n: number) => { const pris = siegesIndisponibles(d); return planSieges(ligneDe(d).classe, d.capacite).map((x) => x.id).filter((s) => !pris.has(s)).slice(6, 6 + n); };
const departMvan = (heure: string) => app.monde.departs.find((d) => d.jour === JOUR && ligneDe(d).gareDe === 'mvan' && d.heure === heure)!;
function vendre(d: Depart, caisseId: string, n: number, moyen: 'especes' | 'momo' = 'especes') {
  const s = sieges(d, n); return reserver({ departId: d.id, sieges: s, passagers: s.map((_, i) => ({ nom: `P${i}`, tel: '690000000' })), acheteurId: 'p-fatou', canal: moyen === 'especes' ? 'guichet' : 'app', moyen, caisseId });
}

describe('vue d’une gare', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(MAINT); reinitialiser(); });
  afterEach(() => vi.useRealTimers());
  it('liste les départs du jour de la gare avec statut, occupation et retard', () => {
    const v = departsGare(app.monde, 'mvan', JOUR, MAINT);
    expect(v.length).toBeGreaterThan(8); expect(v.every((x) => x.heure >= '00:00')).toBe(true);
    expect(v.map((x) => x.heure)).toEqual([...v.map((x) => x.heure)].sort());
    const sept = v.find((x) => x.heure === '07:00')!; expect(sept.statut).toBe('parti'); expect(sept.vers).toBe('Douala'); expect(sept.occupes).toBe(50 - 14);
    expect(departsGare(app.monde, 'akwa', JOUR, MAINT).every((x) => x.de === 'Douala')).toBe(true);
  });
  it('compte les billets scannés et le retard', () => {
    const d = departMvan('09:00'), r = vendre(d, 'c-fatou', 2);
    expect(scannerBillet(r.billets[0].code, 'p-ibrahim', d.id).statut).toBe('ok');
    let v = departsGare(app.monde, 'mvan', JOUR, MAINT).find((x) => x.id === d.id)!; expect(v.scannes).toBe(1); expect(v.occupes).toBe(50 - 35 + 2);
    d.retardMin = 20; d.statut = 'prevu'; v = departsGare(app.monde, 'mvan', JOUR, MAINT + 3 * 3_600_000).find((x) => x.id === d.id)!; expect(v.enRetard).toBe(true); expect(v.heureReelle).toBe('09:20');
    expect(departsGare(app.monde, 'mvan', JOUR, MAINT).find((x) => x.id === d.id)!.enRetard).toBe(false);
  });
  it('recette et ventes par guichet suivent les billets par caisseId', () => {
    const d = departMvan('09:00'); vendre(d, 'c-fatou', 3); vendre(departMvan('12:00'), 'c-fatou', 1);
    const r = construireRapport(app.monde, { gareId: 'mvan', jour: JOUR, now: MAINT, superviseur: 'Abdou' });
    // + le billet d'Aïcha (7 500 F, vendu dans l'application une heure plus tôt, départ de Mvan demain)
    expect(r.billets).toBe(5); expect(r.recette).toBe(3 * 6000 + 5500 + 7500); expect(r.recetteColis).toBe(0);
    expect(r.guichets).toHaveLength(1); expect(r.guichets[0]).toMatchObject({ billets: 4, especes: 23_500, ecart: null }); expect(r.guichets[0].libelle).toBe('Fatou · G1');
    expect(r.enLigne).toMatchObject({ billets: 1, total: 7500, especes: 0 }); expect(r.caisses).toMatchObject({ ouvertes: 1, aValider: 0 }); expect(r.reserves.join()).toContain('caisse(s) encore ouverte(s)');
    expect(r.parHeure.reduce((s, x) => s + x.ventes, 0)).toBe(5); expect(r.pic).toMatch(/^pic \d\d–\d\d h$/);
  });
  it('les billets annulés ou remboursés sont exclus, les ventes en ligne comptées à part', () => {
    const d = departMvan('12:00'); vendre(d, 'c-fatou', 1);
    const en = vendre(d, 'c-fatou', 1, 'momo'); en.billets[0].statut = 'valide'; en.billets[0].caisseId = undefined;
    const gone = vendre(d, 'c-fatou', 1); gone.billets[0].statut = 'rembourse';
    const r = construireRapport(app.monde, { gareId: 'mvan', jour: JOUR, now: MAINT, superviseur: 'Abdou' });
    expect(r.guichets[0].billets).toBe(1); expect(r.enLigne.billets).toBe(2); expect(r.billets).toBe(3); expect(r.recette).toBe(5500 + 5500 + 7500);
  });
  it('même attendu que le domaine, écarts et caisses à valider après clôture', () => {
    const c = app.monde.caisses[0]; vendre(departMvan('09:00'), c.id, 2);
    expect(attenduCaisseMonde(app.monde, c)).toBe(attenduDeCaisse(c)); expect(attenduCaisseMonde(app.monde, c)).toBe(20_000 + 12_000);
    fermerCaisse(c.id, { 10000: 3, 1000: 1 }, 'rendu');
    const r = construireRapport(app.monde, { gareId: 'mvan', jour: JOUR, now: MAINT, superviseur: 'Abdou' });
    expect(r.caisses).toMatchObject({ aValider: 1, ecartTotal: -1000, ecarts: [{ agent: 'Fatou', montant: -1000 }] }); expect(r.guichets[0].ecart).toBe(-1000);
    expect(texteRapport(r)).toContain('Fatou · G1 : 2 billets');
  });
  it('journée vide : tout à zéro, évolution inconnue, texte propre', () => {
    const r = construireRapport(app.monde, { gareId: 'bafoussam', jour: JOUR, now: MAINT, superviseur: 'Pascal' });
    expect(r).toMatchObject({ recette: 0, billets: 0, evolutionPct: null, guichets: [] }); expect(texteRapport(r)).not.toMatch(/NaN|undefined/);
  });
  it('évolution par rapport au même jour de la semaine dernière', () => {
    vendre(departMvan('12:00'), 'c-fatou', 1);
    const semaine = app.monde.billets.at(-1)!; semaine.creeLe = MAINT - 7 * 86_400_000 + 3_600_000;
    expect(recetteDuJour(app.monde, 'mvan', '2026-10-27')).toBe(5500);
    const r = construireRapport(app.monde, { gareId: 'mvan', jour: JOUR, now: MAINT, superviseur: 'A' });
    expect(r.recette).toBe(7500); expect(r.evolutionPct).toBe(36); expect(r.reference).toBe('vs mardi dernier');
  });
});

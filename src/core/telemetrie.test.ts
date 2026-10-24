import { describe, expect, it } from 'vitest';
import { distanceKm, etapesRoute, excesVitesse, LIMITE_VITESSE, profilVitesse, prochaineEtape, telemetrieBus, vitesseA } from './telemetrie.ts';
import { niveau, sante, services } from './sante.ts';

describe('télémétrie des bus', () => {
  it('le profil de vitesse est stable, borné et part de la gare à vitesse réduite', () => {
    const p = profilVitesse('d-1'); expect(p).toEqual(profilVitesse('d-1')); expect(p).toHaveLength(14); expect(p[0].v).toBeLessThan(45); expect(p.every((x) => x.v >= 0 && x.v <= 110)).toBe(true);
  });
  it('certains départs dépassent 90 km/h au moins 3 fois, d’autres jamais', () => {
    const ids = Array.from({ length: 60 }, (_, i) => `dep-${i}`), exces = ids.map((i) => excesVitesse(profilVitesse(i)));
    expect(exces.some((n) => n >= 3)).toBe(true); expect(exces.filter((n) => n === 0).length).toBeGreaterThan(20);
    const pressee = ids.find((i) => excesVitesse(profilVitesse(i)) >= 3)!; expect(profilVitesse(pressee).filter((x) => x.v > LIMITE_VITESSE).length).toBeGreaterThanOrEqual(3);
    expect(vitesseA(pressee, 0.5)).toBeGreaterThan(0);
  });
  it('étapes dans le sens du trajet et prochaine étape', () => {
    expect(etapesRoute('Yaoundé', 'Douala').map((e) => e.nom)).toEqual(['Mbankomo', 'Boumnyebel', 'Edéa', 'Yassa', 'Douala']);
    expect(etapesRoute('Douala', 'Yaoundé').map((e) => e.nom)).toEqual(['Yassa', 'Edéa', 'Boumnyebel', 'Mbankomo', 'Yaoundé']);
    expect(prochaineEtape('Yaoundé', 'Douala', 0.5, 200)).toEqual({ nom: 'Edéa', minutes: 50 }); expect(prochaineEtape('Yaoundé', 'Douala', 1, 200)).toBeNull();
  });
  it('distances et entretien déterministes', () => {
    expect(distanceKm('Douala', 'Yaoundé')).toBe(245); expect(distanceKm('A', 'B')).toBe(200);
    const t = telemetrieBus('bus-BX-V1', '2026-11-03'); expect(t).toEqual(telemetrieBus('bus-BX-V1', '2026-11-03')); expect(t.entretienJours).toBeGreaterThanOrEqual(3); expect(t.controles[1].jour > '2026-11-03').toBe(true);
  });
});
describe('santé du système', () => {
  it('Orange Money lent tant que l’incident n’est pas relancé', () => {
    const s = services(100, false), om = s.find((x) => x.id === 'om')!; expect(om.statut).toBe('lent'); expect(om.latenceMs!).toBeGreaterThan(8000);
    const apres = services(100, true).find((x) => x.id === 'om')!; expect(apres.statut).toBe('ok'); expect(apres.latenceMs!).toBeLessThan(3000);
    expect(s.find((x) => x.id === 'sync')!.latenceMs).toBeNull();
  });
  it('incident : statut dégradé, 12 erreurs, file hors ligne ; relancé : tout est ok', () => {
    const a = sante({ minute: 600, omRelancee: false, paiementsAttente: 2, horsLigneLocal: false }), b = sante({ minute: 600, omRelancee: true, paiementsAttente: 2, horsLigneLocal: true });
    expect(a).toMatchObject({ statut: 'degrade', erreurs1h: 12, horsLigne: 6, incident: true }); expect(b).toMatchObject({ statut: 'ok', erreurs1h: 3, horsLigne: 3, incident: false });
    expect(a.latenceP95).toBeGreaterThanOrEqual(160); expect(a.latenceP95).toBeLessThanOrEqual(200);
  });
  it('niveau de jauge', () => { expect(niveau(100, 200, 400)).toBe('ok'); expect(niveau(300, 200, 400)).toBe('wa'); expect(niveau(500, 200, 400)).toBe('er'); });
});

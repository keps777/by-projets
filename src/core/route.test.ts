import { describe, expect, it } from 'vitest';
import { arretPasse, axeDe, distanceKm, parcours, prixArret, prochainArret, quaiDe } from './arrets.ts';
import { meilleureAlternative } from './alternative.ts';
import { ecarter, etatLigne, positionBus } from './carte.ts';
import { gainConducteur, erreurOffre, placesRestantes, pourcentObjectif } from './covoit.ts';
import { attenteMin, heureRecommandee, marge, prixCourse, trajetMin } from './course.ts';
import { delai, phaseTrajet, texteIlot, vitesseKmh, minutesDepuisMinuit } from './suivi.ts';
import { estimer } from './retard.ts';

const p = { de: 'Yaoundé', vers: 'Douala', gareDe: 'Mvan', gareVers: 'Akwa', heure: '08:00', dureeMin: 210, retardMin: 0 };

describe('arrêts de la ligne', () => {
  it('Yaoundé → Douala : 7 arrêts, horaires proportionnels à la distance', () => {
    const a = parcours(p);
    expect(a.map((x) => x.nom)).toEqual(['Yaoundé · Mvan', 'Mbankomo', 'Boumnyebel', 'Pouma', 'Edéa', 'Yassa', 'Douala · Akwa']);
    expect(a[0].heure).toBe('08:00'); expect(a[6].heure).toBe('11:30'); expect(a[4].heure).toBe('10:30'); // 175/245 × 210 = 150 min
    expect(a.every((x, i) => i === 0 || x.min >= a[i - 1].min)).toBe(true);
  });
  it('le retard décale tous les horaires', () => { const a = parcours({ ...p, retardMin: 45 }); expect(a[0].heure).toBe('08:45'); expect(a[6].heure).toBe('12:15'); });
  it('sens inverse : arrêts en miroir', () => {
    const a = parcours({ ...p, de: 'Douala', vers: 'Yaoundé', gareDe: 'Akwa', gareVers: 'Mvan' });
    expect(a.map((x) => x.nom).slice(1, -1)).toEqual(['Yassa', 'Edéa', 'Pouma', 'Boumnyebel', 'Mbankomo']); expect(a[1].km).toBe(15);
    expect(distanceKm('Douala', 'Yaoundé')).toBe(245);
  });
  it('ligne inconnue : pas d’arrêt intermédiaire', () => { expect(axeDe('A', 'B').arrets).toEqual([]); expect(parcours({ ...p, de: 'A', vers: 'B' })).toHaveLength(2); });
  it('prix prorata : plein au départ, dégressif, minimum 1 000 F, rien à l’arrivée', () => {
    const a = parcours(p), prix = a.map((x) => prixArret(7500, x));
    expect(prix[0]).toBe(7500); expect(prix[6]).toBe(0);
    for (let i = 2; i < 6; i++) expect(prix[i]).toBeLessThan(prix[i - 1]);
    expect(prix[5]).toBe(1000); expect(prix[2]).toBe(4600); expect(prix.every((x) => x % 50 === 0)).toBe(true);
  });
  it('arrêt passé et prochain arrêt', () => {
    const a = parcours(p), now = 8 * 60 + 40;
    expect(a.filter((x) => arretPasse(x, now)).map((x) => x.nom)).toEqual(['Yaoundé · Mvan', 'Mbankomo']);
    const n = prochainArret(a, now)!; expect(n.arret.nom).toBe('Boumnyebel'); expect(n.dansMin).toBe(n.arret.min - now);
    expect(prochainArret(a, 20 * 60)).toBeNull();
  });
  it('quai stable entre 1 et 6', () => { const q = quaiDe('d-2026-11-03-BX-V-mvan-aller-0800'); expect(q).toBeGreaterThanOrEqual(1); expect(q).toBeLessThanOrEqual(6); expect(quaiDe('d-2026-11-03-BX-V-mvan-aller-0800')).toBe(q); });
});

describe('suivi du bus', () => {
  it('phases du trajet', () => {
    const e = (nowMin: number) => estimer('08:00', 210, 0, nowMin);
    expect(phaseTrajet(8 * 60 - 7 * 60 + 0 - 0, e(60))).toBe('avant'); // à 01:00, 7 h avant
    expect(phaseTrajet(20, e(7 * 60 + 40))).toBe('embarquement');
    expect(phaseTrajet(-60, e(9 * 60))).toBe('route');
    expect(phaseTrajet(-300, e(13 * 60))).toBe('arrive');
  });
  it('délais lisibles', () => { expect(delai(12)).toBe('12 min'); expect(delai(125)).toBe('2 h 05'); expect(delai(1620)).toBe('1 j 3 h'); expect(delai(-4)).toBe('0 min'); });
  it('vitesse : 0 hors route, plausible en route', () => {
    expect(vitesseKmh('avant', 0, 245, 210)).toBe(0);
    const v = vitesseKmh('route', 0.4, 245, 210); expect(v).toBeGreaterThan(50); expect(v).toBeLessThan(110);
  });
  it('texte de l’îlot', () => {
    expect(texteIlot('avant', 32, 210)).toBe('embarquement dans 12 min'); expect(texteIlot('embarquement', 12, 210)).toBe('embarquement en cours'); expect(texteIlot('avant', 1300, 210)).toBe('départ dans 21 h 40'); expect(texteIlot('route', -100, 100, { nom: 'Edéa', dansMin: 22 })).toBe('en route · Edéa dans 22 min');
    expect(texteIlot('route', -200, 6)).toBe('arrivée dans 6 min'); expect(texteIlot('arrive', 0, 0)).toContain('arrivé');
  });
  it('minutes depuis minuit du jour du départ', () => { expect(minutesDepuisMinuit(new Date('2026-11-03T09:30:00').getTime(), '2026-11-03')).toBe(570); expect(minutesDepuisMinuit(new Date('2026-11-03T09:30:00').getTime(), '2026-11-02')).toBe(570 + 1440); });
});

describe('carte du réseau', () => {
  it('position d’un bus sur son axe', () => {
    expect(positionBus('Yaoundé', 'Douala', 0)).toEqual({ x: 225, y: 118 }); expect(positionBus('Yaoundé', 'Douala', 1)).toEqual({ x: 105, y: 165 });
    expect(positionBus('Yaoundé', 'Douala', 0.5)).toEqual({ x: 165, y: 141.5 }); expect(positionBus('Yaoundé', 'Douala', 7)).toEqual({ x: 105, y: 165 }); expect(positionBus('X', 'Douala', 0.5)).toBeNull();
  });
  it('état d’une ligne', () => { expect(etatLigne({ retardes: 0, annules: 0, remplissageMax: 0.5 })).toBe('fluide'); expect(etatLigne({ retardes: 1, annules: 0, remplissageMax: 0.5 })).toBe('perturbe'); expect(etatLigne({ retardes: 0, annules: 0, remplissageMax: 0.95 })).toBe('charge'); });
});

describe('course vers la gare', () => {
  it('tarifs de la maquette : Bastos → Mvan', () => { expect(prixCourse('moto', 7)).toBe(700); expect(prixCourse('taxi', 7)).toBe(1500); expect(trajetMin('moto', 7)).toBe(14); });
  it('marge avant le bus', () => {
    const now = new Date('2026-11-03T07:30:00').getTime(), dep = new Date('2026-11-03T08:00:00').getTime();
    expect(marge(dep, now, 'moto', 7)).toBe(30 - 2 - 14); expect(marge(dep, now + 20 * 60_000, 'taxi', 7)).toBeLessThan(0);
    expect(attenteMin('taxi')).toBeGreaterThan(attenteMin('moto'));
    expect(new Date(heureRecommandee(dep, 'moto', 7)).toTimeString().slice(0, 5)).toBe('07:19');
  });
});

describe('covoiturage et alternative', () => {
  it('gain du conducteur avec 10 % de commission', () => { expect(gainConducteur(3, 5000)).toBe(13500); expect(pourcentObjectif(13500)).toBe(68); expect(pourcentObjectif(40000)).toBe(100); });
  it('places restantes', () => { expect(placesRestantes({ places: 3, reservations: [{ voyageurId: 'a', places: 2, paiementId: 'p' }] })).toBe(1); expect(placesRestantes({ places: 1, reservations: [{ voyageurId: 'a', places: 2, paiementId: 'p' }] })).toBe(0); });
  it('validation d’une offre', () => {
    const now = new Date('2026-11-02T20:00:00').getTime(), ok = { de: 'Yaoundé', vers: 'Douala', jour: '2026-11-03', heure: '07:30', places: 3, prix: 5000, vehicule: 'Toyota Corolla' };
    expect(erreurOffre(ok, now)).toBeNull(); expect(erreurOffre({ ...ok, vers: 'Yaoundé' }, now)).toMatch(/différents/); expect(erreurOffre({ ...ok, heure: '7h30' }, now)).toMatch(/Heure/);
    expect(erreurOffre({ ...ok, jour: '2026-11-01' }, now)).toMatch(/passé/); expect(erreurOffre({ ...ok, places: 5 }, now)).toMatch(/places/); expect(erreurOffre({ ...ok, prix: 500 }, now)).toMatch(/prix/); expect(erreurOffre({ ...ok, vehicule: ' ' }, now)).toMatch(/véhicule/);
  });
  it('meilleure alternative : proche de la nouvelle heure, avec des places, autre compagnie à égalité', () => {
    const h = (s: string) => new Date(`2026-11-03T${s}:00`).getTime(), now = h('07:00');
    const c = [{ id: 'a', departMs: h('07:10'), places: 5, compagnieId: 'AV' }, { id: 'b', departMs: h('08:30'), places: 3, compagnieId: 'AV' }, { id: 'c', departMs: h('08:30'), places: 3, compagnieId: 'BX' }, { id: 'd', departMs: h('08:45'), places: 0, compagnieId: 'FX' }];
    expect(meilleureAlternative(h('08:45'), 'BX', c, now)?.id).toBe('b'); expect(meilleureAlternative(h('08:45'), 'BX', c.filter((x) => x.places === 0), now)).toBeUndefined();
  });
});

import { pointSurRoute } from './carte.ts';
describe('route du bus', () => {
  it('commence au départ, finit à l’arrivée, avance régulièrement', () => {
    expect(pointSurRoute(0)).toEqual({ x: 34, y: 205 }); const fin = pointSurRoute(1); expect(fin.x).toBeCloseTo(335, 0); expect(fin.y).toBeCloseTo(34, 0);
    const a = pointSurRoute(0.3), b = pointSurRoute(0.6); expect(b.x).toBeGreaterThan(a.x); expect(b.y).toBeLessThan(a.y); expect(pointSurRoute(-2)).toEqual(pointSurRoute(0));
  });
});

describe('séparation des marqueurs', () => {
  it('les deux sens d’un axe ne se superposent pas, les bus identiques sont écartés', () => {
    const a = positionBus('Yaoundé', 'Douala', 0.5, 1)!, b = positionBus('Douala', 'Yaoundé', 0.5, 1)!;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(12);
    const e = ecarter([{ x: 100, y: 100 }, { x: 100, y: 100 }, { x: 103, y: 101 }]);
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(Math.hypot(e[i].x - e[j].x, e[i].y - e[j].y)).toBeGreaterThan(25);
    expect(ecarter([{ x: 0, y: 0 }, { x: 100, y: 0 }])).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
  });
});

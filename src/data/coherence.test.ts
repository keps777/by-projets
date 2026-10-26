import { describe, expect, it } from 'vitest';
import { etatInitial } from './seed.ts';
import { departDe, plafond } from '../core/regles.ts';

const { monde } = etatInitial();
describe('cohérence du monde de démonstration', () => {
  it('chaque droit, offre, drop et bagage vise un vol et un compte qui existent', () => {
    const vols = new Set(monde.vols.map((v) => v.id)), comptes = new Set(monde.comptes.map((c) => c.id));
    for (const d of monde.droits) { expect(vols.has(d.volId), d.id).toBe(true); expect(comptes.has(d.detenteurId), d.id).toBe(true); }
    for (const o of monde.offresAgence) expect(vols.has(o.volId)).toBe(true);
    for (const b of monde.bagages) { expect(vols.has(b.volId)).toBe(true); expect(comptes.has(b.detenteurId)).toBe(true); }
    for (const x of monde.drops) expect(vols.has(x.volId)).toBe(true);
  });
  it('les références de droits sont uniques et les annonces respectent le plafond', () => {
    const refs = monde.droits.map((d) => d.ref); expect(new Set(refs).size).toBe(refs.length);
    for (const d of monde.droits.filter((x) => x.annonce)) { const v = monde.vols.find((x) => x.id === d.volId)!; expect(d.annonce!.prix, d.id).toBeLessThanOrEqual(plafond(v.prixNeuf)); }
  });
  it('les vols ont une courbe de 90 points qui se termine sur le prix équivalent', () => {
    for (const v of monde.vols) { expect(v.courbe).toHaveLength(90); expect(v.courbe[89]).toBe(v.prixNeuf); expect(v.heureArrivee).toMatch(/^\d\d:\d\d$/); }
  });
  it('Alex détient 3 droits actifs et en revend un ; son solde suit le grand livre', () => {
    const alex = monde.comptes.find((c) => c.id === 'ACC-0412')!;
    const siens = monde.droits.filter((d) => d.detenteurId === alex.id);
    expect(siens.filter((d) => d.statut === 'detenu')).toHaveLength(3); expect(siens.filter((d) => d.statut === 'en_vente')).toHaveLength(1);
    const dernier = monde.ecritures.filter((e) => e.compteId === alex.id).at(-1)!; expect(dernier.solde).toBe(alex.solde);
    expect(siens.find((d) => d.id === 'd-812')!.prixPaye).toBe(1000);
  });
  it('le vol 812 part le 14 décembre à 18:05 (J-63 depuis le 12 octobre)', () => { const v = monde.vols.find((x) => x.id === 'v-ae812')!; expect(departDe(v.jour, v.heureDepart)).toBe(Date.parse('2026-12-14T18:05')); expect(v.heureArrivee).toBe('07:10'); });
  it('le drop n° 128 est en direct avec 3 places sur 6', () => { const x = monde.drops[0]; expect(x.n).toBe(128); expect(x.restantes).toBe(3); expect(x.places).toBe(6); expect(x.fin).toBeGreaterThan(x.ouvre); });
});

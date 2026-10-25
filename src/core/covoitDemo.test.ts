import { describe, expect, it } from 'vitest';
import { avisDemo, genererDemo } from './covoitDemo.ts';
import { chercher, comptesParJour, premierJour, villesDesOffres, type Recherche } from './covoitRecherche.ts';
import { profilComplet } from './covoitProfil.ts';
import { departOffreMs } from './covoit.ts';

const NOW = Date.parse('2026-11-03T07:00:00');
const demo = () => genererDemo('2026-11-03', NOW);

describe('données de démonstration', () => {
  it('déterministe : deux générations identiques', () => { expect(JSON.stringify(demo())).toBe(JSON.stringify(demo())); });
  it('au moins 15 offres entre villes sur 7 jours et plusieurs axes, sans doublon, aucune déjà partie', () => {
    const { offres } = demo(), inter = offres.filter((o) => !o.enVille);
    expect(inter.length).toBeGreaterThanOrEqual(15); expect(new Set(offres.map((o) => o.id)).size).toBe(offres.length);
    expect(new Set(inter.map((o) => o.jour)).size).toBe(7);
    const axes = new Set(inter.map((o) => `${o.de}>${o.vers}`));
    for (const a of ['Yaoundé>Douala', 'Douala>Yaoundé', 'Yaoundé>Bafoussam', 'Douala>Kribi', 'Douala>Bafoussam']) expect(axes.has(a), a).toBe(true);
    expect(offres.every((o) => departOffreMs(o) >= NOW)).toBe(true);
  });
  it('trajets en ville à Yaoundé et à Douala, conducteurs et véhicules variés, profils complets', () => {
    const { offres, profils, conducteurs } = demo(), ville = offres.filter((o) => o.enVille);
    expect(ville.some((o) => ['Bastos', 'Essos', 'Mokolo'].includes(o.de))).toBe(true); expect(ville.some((o) => ['Akwa', 'Bonapriso', 'Makepe'].includes(o.de))).toBe(true);
    expect(new Set(offres.map((o) => o.conducteurId)).size).toBeGreaterThanOrEqual(10); expect(new Set(offres.map((o) => o.vehicule)).size).toBeGreaterThanOrEqual(10);
    for (const o of offres) { expect(profilComplet(profils[o.conducteurId]), o.conducteurId).toBe(true); expect(o.places).toBeLessThanOrEqual(profils[o.conducteurId].vehicule.places); }
    expect(conducteurs.every((c) => c.role === 'conducteur')).toBe(true);
  });
  it('le jour même, seuls les départs à venir existent', () => {
    const tard = genererDemo('2026-11-03', Date.parse('2026-11-03T20:00:00')); expect(tard.offres.filter((o) => o.jour === '2026-11-03')).toHaveLength(0);
    expect(tard.offres.length).toBeGreaterThan(0);
  });
  it('taille raisonnable (JSON < 30 Ko avec les profils)', () => { expect(JSON.stringify(demo()).length).toBeLessThan(30_000); });
  it('avis stables', () => { expect(avisDemo('p-moussa')).toEqual(avisDemo('p-moussa')); expect(avisDemo('p-moussa', 3)).toHaveLength(3); });
});

describe('recherche', () => {
  const { offres, profils } = demo();
  const info = (o: typeof offres[number]) => ({ note: 4.5, verifie: true, fumeur: profils[o.conducteurId].fumeur, femmes: profils[o.conducteurId].femmes });
  const r = (x: Partial<Recherche> = {}): Recherche => ({ de: 'Yaoundé', vers: 'Douala', jour: '', filtres: [], tri: 'heure', ...x });
  it('trajet + jour, trié par heure ; vide = partout', () => {
    const l = chercher(offres, r({ jour: '2026-11-05' }), info, NOW); expect(l.length).toBeGreaterThan(0); expect(l.every((o) => o.de === 'Yaoundé' && o.vers === 'Douala' && o.jour === '2026-11-05')).toBe(true);
    expect(l.map((o) => o.heure)).toEqual([...l.map((o) => o.heure)].sort());
    expect(chercher(offres, r({ de: '', vers: '' }), info, NOW).length).toBeGreaterThan(l.length);
  });
  it('filtres rapides et tri par prix', () => {
    const tot = chercher(offres, r({ filtres: ['tot'] }), info, NOW); expect(tot.every((o) => o.heure < '09:00')).toBe(true);
    const nf = chercher(offres, r({ de: '', vers: '', filtres: ['non_fumeur'] }), info, NOW); expect(nf.every((o) => !profils[o.conducteurId].fumeur)).toBe(true);
    const fem = chercher(offres, r({ de: '', vers: '', filtres: ['femmes'] }), info, NOW); expect(fem.length).toBeGreaterThan(0);
    const p = chercher(offres, r({ tri: 'prix' }), info, NOW).map((o) => o.prix); expect(p).toEqual([...p].sort((a, b) => a - b));
    const pc = chercher(offres, r({ filtres: ['pas_cher'] }), info, NOW); expect(pc.length).toBeGreaterThan(0); expect(pc.length).toBeLessThanOrEqual(chercher(offres, r(), info, NOW).length);
  });
  it('comptes par jour, villes, premier jour', () => {
    expect(Object.keys(comptesParJour(offres, r(), NOW)).length).toBeGreaterThanOrEqual(5); expect(villesDesOffres(offres.filter((o) => !o.enVille), 'de', NOW)[0].n).toBeGreaterThan(0);
    expect(premierJour(offres, r(), NOW)).toBe('2026-11-03');
  });
  it('les offres complètes ou annulées ne sortent pas (statut)', () => { const o = { ...offres[0], statut: 'annulee' as const }; expect(chercher([o], r({ de: '', vers: '' }), info, NOW)).toHaveLength(0); });
});

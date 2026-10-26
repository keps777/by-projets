import { describe, expect, it } from 'vitest';
import { etatInitial } from '../../data/seed.ts';
import { alternatives, annoncePalier, chiffresRebours, chronologieEpuise, dureeParti, horodatage, ligneProchain, palier, phraseProchain } from './vues.ts';

describe('compte à rebours', () => {
  it('minutes et secondes sur deux chiffres : 4 min 31 s', () => {
    const r = chiffresRebours(271_000); expect(r.groupes).toEqual([{ unite: 'Minutes', chiffres: ['0', '4'] }, { unite: 'Secondes', chiffres: ['3', '1'] }]); expect(r.libelle).toBe('Fin du drop dans 4 min 31 s'); expect(r.secondes).toBe(271);
  });
  it('les heures s’ajoutent seulement s’il en reste ; jamais négatif ; fractions de seconde ignorées', () => {
    expect(chiffresRebours(3_725_900).groupes.map((g) => g.unite + g.chiffres.join(''))).toEqual(['Heures01', 'Minutes02', 'Secondes05']); expect(chiffresRebours(3_725_900).libelle).toBe('Fin du drop dans 1 h 2 min 5 s');
    expect(chiffresRebours(-5000).groupes.map((g) => g.chiffres.join(''))).toEqual(['00', '00']); expect(chiffresRebours(45_000).libelle).toBe('Fin du drop dans 45 s'); expect(chiffresRebours(100 * 3_600_000).groupes[0].chiffres).toEqual(['1', '0', '0']);
  });
});
describe('paliers annoncés', () => {
  it('rien au-delà de 10 minutes ; un seul message par palier, pas à chaque seconde', () => {
    expect(palier(601_000)).toBeNull(); expect(annoncePalier(601_000)).toBe('');
    expect(palier(600_000)).toBe(600); expect(palier(301_000)).toBe(600); expect(palier(300_000)).toBe(300); expect(palier(271_000)).toBe(300); expect(palier(61_000)).toBe(300); expect(palier(60_000)).toBe(60);
    expect(palier(30_000)).toBe(30); expect(palier(11_000)).toBe(30); expect(palier(10_000)).toBe(10); expect(palier(1)).toBe(10); expect(palier(0)).toBe(0); expect(palier(-4000)).toBe(0);
    const messages = new Set(Array.from({ length: 271 }, (_, i) => annoncePalier((271 - i) * 1000))); expect([...messages]).toEqual(['Moins de 5 minutes avant la fin du drop.', 'Moins d’une minute avant la fin du drop.', 'Moins de 30 secondes avant la fin du drop.', 'Moins de 10 secondes avant la fin du drop.']);
  });
  it('le drop terminé est annoncé', () => { expect(annoncePalier(0)).toBe('Le drop est terminé.'); });
});
describe('prochains drops', () => {
  it('jour, heure, zone et alerte du compte', () => {
    const d = etatInitial().monde.dropsAVenir[0]; const l = ligneProchain({ ...d, alerteIds: ['ACC-0412'] }, 'ACC-0412');
    expect(l).toMatchObject({ jour: 'mer.', jourLong: 'mercredi', heure: '12:00', zone: 'Europe', alerte: true }); expect(ligneProchain(d, 'ACC-0412').alerte).toBe(false); expect(ligneProchain(d, null).alerte).toBe(false);
    expect(phraseProchain(l)).toBe('mer. 12:00 · Europe · destination masquée');
  });
});
describe('drop épuisé', () => {
  it('horodatage à la dixième de seconde', () => { const t = Date.parse('2026-10-11T19:00:00'); expect(horodatage(t)).toBe('19:00:00,0'); expect(horodatage(t, 800)).toBe('19:00:00,8'); expect(horodatage(t, 1300)).toBe('19:00:01,3'); });
  it('« 0,8 seconde », « 1,5 seconde », « 3,2 secondes »', () => { expect(dureeParti(800)).toEqual({ valeur: '0,8', unite: 'seconde' }); expect(dureeParti(1500).unite).toBe('seconde'); expect(dureeParti(3200)).toEqual({ valeur: '3,2', unite: 'secondes' }); expect(dureeParti(2000).unite).toBe('secondes'); });
  it('la chronologie ne montre la demande que si elle a eu lieu', () => {
    const t = Date.parse('2026-10-11T19:00:00'), d = { ouvre: t, places: 6 };
    expect(chronologieEpuise(d, 800, true).map((e) => `${e.heure} ${e.texte}`)).toEqual(['19:00:00,0 Ouverture du drop', '19:00:00,8 6 places sur 6 attribuées', '19:00:01,3 Votre demande — non retenue']);
    expect(chronologieEpuise(d, 800, false)).toHaveLength(2); expect(chronologieEpuise(d, 800, true)[1].fort).toBe(true);
  });
});
describe('reventes du même trajet', () => {
  const monde = etatInitial().monde, vol = (id: string) => monde.vols.find((v) => v.id === id)!;
  it('le même vol d’abord, puis les dates les plus proches ; jamais mes annonces', () => {
    const cdg = alternatives(monde, vol('v-ae816'), 'ACC-0412', 10); expect(cdg.map((a) => a.droitId)).toEqual(['d-r816', 'd-r816b', 'd-r816c', 'd-r816d', 'd-r224', 'd-r820', 'd-r830']); expect(cdg[0]).toMatchObject({ memeVol: true, etiquette: 'Même vol que le drop', prix: 1500, prixEquivalent: 2050, offreId: 'revente:d-r816' });
    expect(alternatives(monde, vol('v-ae816'), 'ACC-0301', 10).map((a) => a.droitId)).not.toContain('d-r816'); expect(alternatives(monde, vol('v-ae816'), 'ACC-0412')).toHaveLength(2);
  });
  it('un autre jour : étiquette « Plus tôt » ; aucun résultat sur un trajet sans revente', () => {
    const puj = alternatives(monde, vol('v-no905'), 'ACC-0412'); expect(puj.map((a) => a.droitId)).toEqual(['d-r902']); expect(puj[0]).toMatchObject({ memeVol: false, etiquette: 'Plus tôt', escales: 'direct' });
    expect(alternatives(monde, vol('v-no906'), 'ACC-0412').map((a) => a.droitId)).toEqual(['d-r902']); expect(alternatives(monde, vol('v-ae410'), 'ACC-0301')).toEqual([]);
  });
  it('« Une semaine plus tard » entre 5 et 9 jours d’écart', () => {
    const m = etatInitial().monde; m.vols.find((v) => v.id === 'v-ae830')!.jour = '2026-12-21'; const l = alternatives(m, m.vols.find((v) => v.id === 'v-ae812')!, 'ACC-0412', 20).find((a) => a.droitId === 'd-r830')!; expect(l.etiquette).toBe('Une semaine plus tard');
  });
});

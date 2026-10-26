import { beforeEach, describe, expect, it } from 'vitest';
import { etatInitial } from '../../data/seed.ts';
import type { Droit, Monde } from '../../domain/types.ts';
import { achatDe, avancementChaine, bagagesVue, chaineDe, courbeValeur, dureeVol, jourVol, serieValeur, vueDroit } from './droit.ts';

const NOW = Date.parse('2026-10-12T09:00');
let m: Monde;
beforeEach(() => { m = etatInitial().monde; });
const d = (id: string): Droit => m.droits.find((x) => x.id === id)!;
const nbsp = (s: string) => s.replace(/ /g, ' ');

describe('vueDroit : droit détenu à nommer', () => {
  it('billet, statut, plafond et écart viennent du vol et du droit', () => {
    const v = vueDroit(m, d('d-812'), NOW)!;
    expect(v).toMatchObject({ statut: 'a_nommer', jEcheance: 'J-62', ouvert: true, echeancePassee: false, plafondRevente: 2000 }); expect(v.ecart).toMatchObject({ abs: 1000, pct: 100, sens: 'hausse' });
    expect(v.puce).toEqual({ texte: 'À nommer avant le 13 déc. 18:05', ton: 'signal' }); expect(v.ligneStatut).toBe('Statut : détenu · Alex T.');
    expect(v.vol.numero).toBe('AE 812'); expect(jourVol(v.vol)).toBe('Lun. 14 déc. 2026'); expect(dureeVol(v.vol)).toBe('Direct · 7 h 05');
  });
  it('quatre actions dans l’ordre de la maquette ; Nommer est l’action principale ; chaque lien vise l’écran du tableau des routes', () => {
    const a = vueDroit(m, d('d-812'), NOW)!.actions;
    expect(a.map((x) => [x.id, x.href, x.principale])).toEqual([['revendre', '/revendre/d-812', false], ['nommer', '/nommer/d-812', true], ['transferer', '/transferer/d-812', false], ['liquidite', '/liquidite/d-812', false]]);
    expect(nbsp(a[0].sous)).toBe('Vous fixez le prix, plafond 2 000 $'); expect(a[1].sous).toBe('Avant le 13 déc. 18:05'); expect(a[2].volet).toBe(true);
  });
  it('plafond de revente = prix équivalent du vol d’aujourd’hui', () => { m.vols.find((v) => v.id === 'v-ae812')!.prixNeuf = 1750; expect(nbsp(vueDroit(m, d('d-812'), NOW)!.actions[0].sous)).toBe('Vous fixez le prix, plafond 1 750 $'); });
});
describe('vueDroit : autres états', () => {
  it('en vente : retirer l’annonce mène à /revendre, pas de transfert', () => {
    const v = vueDroit(m, d('d-hav'), NOW)!; expect(v.statut).toBe('en_vente'); expect(nbsp(v.puce.texte)).toBe('En revente · 620 $'); expect(v.retirerAnnonce).toEqual({ prix: 620, href: '/revendre/d-hav' });
    expect(v.actions.map((x) => x.id)).toEqual(['revendre', 'nommer', 'liquidite']); expect(v.actions[0].titre).toBe('Retirer l’annonce'); expect(v.actions[0].href).toBe('/revendre/d-hav');
  });
  it('nommé : actions fermées et liens vers le voyage', () => {
    const x = d('d-812'); x.statut = 'nomme'; x.voyageur = { prenom: 'Alex', nom: 'Exemple', pourSoi: true };
    const v = vueDroit(m, x, NOW)!; expect(v.actions).toEqual([]); expect(v.ouvert).toBe(false); expect(v.puce.texte).toBe('Voyageur nommé · Alex Exemple'); expect(v.message!.liens.map((l) => l.href)).toEqual(['/voyage/d-812', '/pret-a-voyager/d-812']);
  });
  it('gelé : message avec la raison, aucune action', () => { const x = d('d-gele'); x.detenteurId = 'ACC-0412'; const v = vueDroit(m, x, NOW)!; expect(v.actions).toEqual([]); expect(v.message).toMatchObject({ titre: 'Ce droit est gelé', ton: 'err' }); expect(v.message!.texte).toContain('Vérification d’identité en cours'); });
  it('voyagé et échéance passée', () => {
    const x = d('d-812'); x.statut = 'voyage'; expect(vueDroit(m, x, NOW)!.message!.titre).toBe('Voyage effectué');
    const y = d('d-puj'); const v = vueDroit(m, y, Date.parse('2027-02-20T12:00'))!; expect(v.echeancePassee).toBe(true); expect(v.actions).toEqual([]); expect(v.message!.titre).toBe('Échéance passée');
  });
  it('acheteurs qui cherchent ce vol (intentions des autres comptes)', () => { m.intentions.push({ id: 'I-1', compteId: 'ACC-0301', de: 'YUL', vers: 'CDG', volId: 'v-ae812', budget: 1300, fondsReserves: 1300, creeLe: NOW, statut: 'publiee', propositions: [] }); expect(vueDroit(m, d('d-812'), NOW)!.acheteurs).toEqual({ n: 1, max: 1300, fonds: true }); expect(vueDroit(etatInitial().monde, d('d-812'), NOW)!.acheteurs).toBeUndefined(); });
});
describe('valeur indicative', () => {
  it('série : prix payé puis relevés de la courbe, dernier = prix équivalent', () => {
    const s = serieValeur(d('d-812'), m.vols.find((v) => v.id === 'v-ae812')!); expect(s).toHaveLength(9); expect(s[0]).toBe(1000); expect(s.at(-1)).toBe(2000);
    const c = courbeValeur(d('d-812'), m.vols.find((v) => v.id === 'v-ae812')!)!; expect(c.fin.y).toBeLessThan(c.debutY);
  });
  it('achat : date et intitulé', () => { expect(achatDe(d('d-812'))).toEqual({ quand: Date.parse('2026-01-12T10:14'), titre: 'Achat neuf' }); expect(achatDe(d('d-puj')).titre).toBe('Drop membre'); expect(achatDe(d('d-ppt')).titre).toBe('Achat en revente'); });
});
describe('chaîne de détention', () => {
  it('maillons, aujourd’hui, échéance et départ dans l’ordre', () => {
    const c = chaineDe(m, d('d-812'), NOW); expect(c.map((e) => e.titre)).toEqual(['Achat neuf', 'Aujourd’hui', 'Échéance de finalisation', 'Départ YUL → CDG']);
    expect(c[0]).toMatchObject({ date: '12 janv.', detail: expect.stringMatching(/^Alex T\. \(vous\) · 1\s000\s\$$/) }); expect(c[1]).toMatchObject({ date: '12 oct.', repere: 'aujourdhui' }); expect(nbsp(c[1].detail)).toBe('Détenu · prix équivalent 2 000 $ (indicatif)');
    expect(c[2]).toMatchObject({ date: '13 déc.', heure: '18:05', repere: 'echeance' }); expect(c[3]).toMatchObject({ date: '14 déc.', heure: '18:05', detail: 'AE 812 · voyageur à nommer' });
  });
  it('un droit revendu plusieurs fois garde toute sa chaîne', () => { const c = chaineDe(m, d('d-ppt'), NOW); expect(c.filter((e) => e.repere === 'passe').map((e) => e.titre)).toEqual(['Achat neuf', 'Achat en revente', 'Achat en revente']); expect(c[2].detail).toMatch(/^Alex T\. \(vous\)/); });
  it('après l’échéance : pas de ligne « échéance » à venir', () => { expect(chaineDe(m, d('d-812'), Date.parse('2026-12-13T20:00')).some((e) => e.repere === 'echeance')).toBe(false); });
  it('avancement : entre le premier maillon et le départ', () => { const a = avancementChaine(d('d-812'), m.vols.find((v) => v.id === 'v-ae812')!, NOW); expect(a.pct).toBeGreaterThan(70); expect(a.pct).toBeLessThan(90); expect(a.joursAvantEcheance).toBe(62); });
});
describe('bagages du droit', () => {
  it('un bagage prévu, un en vente, prix d’entrée de la soute', () => { const b = bagagesVue(m, d('d-812')); expect(b).toMatchObject({ prevus: 1, enVente: 1, vendable: false, dePrix: 90, kg: 23 }); expect(b.resume.inclus).toBe(2); });
  it('rien en vente : un bagage inutilisé peut être revendu', () => { m.bagages = m.bagages.filter((x) => x.id !== 'b-alex'); expect(bagagesVue(m, d('d-812'))).toMatchObject({ prevus: 2, enVente: 0, vendable: true }); });
});

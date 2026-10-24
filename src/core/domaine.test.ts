import { describe, expect, it } from 'vitest';
import { codeBillet, contenuQr, hex, hmacSha256, lireQr, sceauValide, sceller, sha256 } from './sceau.ts';
import { planSieges, supplementSiege } from './sieges.ts';
import { prixDynamique, prixEtudiant, remboursement, fmtF } from './tarif.ts';
import { badge, indexTranche, parTranche, trier, duree, heureApres } from './tranches.ts';
import { codeColis, codeRetrait, prixColis, progression, suivant } from './colis.ts';
import { attendu, commission, evaluerEcart, totalCompte } from './caisse.ts';
import { estimer, gesteRetard } from './retard.ts';

describe('sceau', () => {
  it('SHA-256 et HMAC-SHA256 : vecteurs connus', () => {
    const e = (s: string) => new TextEncoder().encode(s);
    expect(hex(sha256(e('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(hex(sha256(e('')))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(hex(hmacSha256(e('key'), e('The quick brown fox jumps over the lazy dog')))).toBe('f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');
    expect(hex(sha256(e('a'.repeat(1000))))).toBe('41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3');
  });
  it('un billet scellé se vérifie, une modification le rend invalide', () => {
    const b = { code: 'AM7F3K22', departId: 'd1', siege: '3C', nom: 'Aïcha Ndiba' };
    const sceau = sceller(b);
    expect(sceau).toMatch(/^[0-9a-f]{12}$/);
    expect(sceauValide({ ...b, sceau })).toBe(true);
    expect(sceauValide({ ...b, nom: ' aïcha ndiba ', sceau })).toBe(true);
    expect(sceauValide({ ...b, siege: '3D', sceau })).toBe(false);
    expect(sceauValide({ ...b, sceau: 'aaaaaaaaaaaa' })).toBe(false);
  });
  it('contenu du QR : lecture aller-retour', () => { const s = contenuQr('AM7F3K22', 'abcdef012345'); expect(lireQr(s)).toEqual({ code: 'AM7F3K22', sceau: 'abcdef012345' }); expect(lireQr('n’importe quoi')).toBeNull(); });
  it('codes de billet : 8 caractères, sans caractères ambigus, distincts', () => {
    const cs = new Set(Array.from({ length: 200 }, (_, i) => codeBillet(i)));
    expect(cs.size).toBe(200); for (const c of cs) expect(c).toMatch(/^AM[2-9A-HJ-NP-Z]{6}$/);
  });
});
describe('sièges et tarifs', () => {
  it('Classique : 4 par rangée, couloir ; VIP : 3 par rangée', () => {
    const c = planSieges('Classique', 50); expect(c).toHaveLength(50); expect(c[0].id).toBe('1A'); expect(c[3].colonne).toBe(5); expect(c[49].id).toBe('13B');
    const v = planSieges('VIP', 30); expect(v).toHaveLength(30); expect(v[29].id).toBe('10C'); expect(new Set(v.map((s) => s.id)).size).toBe(30);
    expect(supplementSiege('Classique', '1B')).toBe(1500); expect(supplementSiege('Classique', '2B')).toBe(0); expect(supplementSiege('VIP', '1A')).toBe(0);
  });
  it('prix dynamique et étudiant', () => {
    expect(prixDynamique(7000, 0.3, 1, true)).toBe(6500); expect(prixDynamique(7000, 0.3, 5, true)).toBe(7000); expect(prixDynamique(7000, 0.95, 5, true)).toBe(7500); expect(prixDynamique(7000, 0.95, 1, false)).toBe(7000);
    expect(prixEtudiant(7500)).toBe(6000); expect(fmtF(1240000)).toBe('1 240 000 F');
  });
  it('remboursement : 10 % de frais avant 2 h, rien après, tout si la compagnie annule', () => {
    expect(remboursement(7500, 600)).toMatchObject({ possible: true, frais: 750, rembourse: 6750 });
    expect(remboursement(7500, 119).possible).toBe(false);
    expect(remboursement(7500, 30, true)).toMatchObject({ rembourse: 7500, frais: 0 });
  });
});
describe('panorama des départs', () => {
  const dep = (heure: string, prix: number, places: number, dureeMin = 210, vip = false) => ({ heure, prix, places, dureeMin, vip });
  it('8 tranches de 3 h', () => { expect(indexTranche('00:30')).toBe(0); expect(indexTranche('08:00')).toBe(2); expect(indexTranche('23:59')).toBe(7); expect(parTranche([dep('07:00', 1, 1), dep('08:00', 1, 1), dep('22:30', 1, 1)]).map((t) => t.items.length)).toEqual([0, 0, 2, 0, 0, 0, 0, 1]); });
  it('tris : prix, places, confort', () => {
    const l = [dep('09:00', 6000, 35), dep('06:00', 8000, 4, 195, true), dep('07:00', 7000, 14)];
    expect(trier(l, 'heure')[0].heure).toBe('06:00'); expect(trier(l, 'prix')[0].prix).toBe(6000); expect(trier(l, 'places')[0].places).toBe(35); expect(trier(l, 'confort')[0].vip).toBe(true);
  });
  it('badges', () => {
    const g = [dep('06:00', 8000, 4, 195, true), dep('06:15', 6000, 22, 225), dep('07:00', 7000, 14, 210)];
    expect(badge(g[0], g).texte).toBe('+ que 4 pl.'); expect(badge(g[1], g).texte).toBe('moins cher'); expect(badge(g[2], g).texte).toBe('14 places');
    expect(badge({ ...dep('07:30', 4500, 1), covoit: true }, g).texte).toBe('dernière pl.');
    expect(duree(210)).toBe('3 h 30'); expect(heureApres('22:30', 210)).toBe('02:00'); expect(heureApres('00:20', -30)).toBe('23:50');
  });
});
describe('colis, caisse, retard', () => {
  it('prix des colis et chaîne de statuts', () => {
    expect(prixColis('M', { moto: true, assurance: true })).toBe(4000); expect(prixColis('S', { moto: false, assurance: false })).toBe(1000);
    expect(suivant('cree')).toBe('depose'); expect(suivant('livre')).toBeNull(); expect(progression('au_relais')).toBe(60); expect(codeRetrait(3)).toMatch(/^\d{4}$/); expect(codeColis(5)).toMatch(/^AM-C-/);
  });
  it('caisse : 162 500 attendu, comptage et tolérance', () => {
    const q = { 10000: 9, 5000: 11, 2000: 7, 1000: 6, 500: 5 }; expect(totalCompte(q)).toBe(167_500);
    expect(evaluerEcart(162_500, 162_500).niveau).toBe('juste'); expect(evaluerEcart(163_000, 162_500).niveau).toBe('tolere'); expect(evaluerEcart(167_500, 162_500)).toMatchObject({ niveau: 'a_valider', montant: 5000 });
    expect(attendu(20_000, 150_000, 7_500)).toBe(162_500); expect(commission(100_000, 5)).toBe(5000);
  });
  it('estimation en route avec retard de 45 min', () => {
    const e = estimer('08:00', 210, 45, 9 * 60); expect(e.depart).toBe('08:45'); expect(e.arrivee).toBe('12:15'); expect(e.enRoute).toBe(true); expect(e.avancement).toBeCloseTo(15 / 210); expect(estimer('08:00', 210, 0, 7 * 60).enRoute).toBe(false);
    expect(estimer('08:00', 210, 0, 13 * 60).termine).toBe(true); expect(gesteRetard(45)).toBe(500); expect(gesteRetard(10)).toBe(0);
  });
});

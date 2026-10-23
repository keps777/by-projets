import { describe, expect, it } from 'vitest';
import { COUVERTURES, codeCarte } from './sante.ts';
import { CRENEAU_MS, contenuQr, estCeMembre, grouperCode, masquerNumero, verifierCode } from './sante-carte.ts';
import { echeanceDefaut, erreursLignes, repartirActes, statutOrdonnance, type LigneActe } from './sante-facture.ts';
import { evaluerEtalement } from './sante-etalement.ts';
import { libelleKm, projeter, trierParDistance, type Lieu } from './reseau.ts';
import { LIEUX, POSITION_PAR_DEFAUT } from '../screens/sante/reseau.ts';

const L = (nom: string, montant: number, categorie: LigneActe['categorie']): LigneActe => ({ nom, sous: '', montant, categorie });
const FAMILLE = COUVERTURES.famille;

describe('carte de santé', () => {
  it('masque et groupe', () => {
    expect(masquerNumero('AM4821')).toBe('AM ···· 4821');
    expect(masquerNumero('AM-482210')).toBe('AM ···· 2210');
    expect(grouperCode('048291')).toBe('048 291');
    expect(contenuQr('AM4821', '123456')).toBe('AM1|AM4821|123456');
  });
  it('reconnaît le membre par numéro ou téléphone', () => {
    expect(estCeMembre('am-4821', 'AM4821', '690123456')).toBe(true);
    expect(estCeMembre('AM 4821', 'AM4821', '690123456')).toBe(true);
    expect(estCeMembre('+237 690 12 34 56', 'AM4821', '690123456')).toBe(true);
    expect(estCeMembre('690123456', 'AM4821', '690123456')).toBe(true);
    expect(estCeMembre('AM9999', 'AM4821', '690123456')).toBe(false);
    expect(estCeMembre('', 'AM4821', '690123456')).toBe(false);
    expect(estCeMembre('6901', 'AM4821', '690123456')).toBe(false);
  });
  it('le code tourne toutes les 30 s et la vérification tolère le créneau précédent', () => {
    const t = Date.parse('2026-10-22T10:00:10');
    const code = codeCarte('AM4821', t);
    expect(codeCarte('AM4821', t + 5000)).toBe(code);
    expect(codeCarte('AM4821', t + 30_000)).not.toBe(code);
    expect(verifierCode('AM4821', code, t)).toEqual({ ok: true });
    expect(verifierCode('AM4821', grouperCode(code), t)).toEqual({ ok: true });
    expect(verifierCode('AM4821', code, t + CRENEAU_MS)).toEqual({ ok: true });
    expect(verifierCode('AM4821', code, t + 2 * CRENEAU_MS).ok).toBe(false);
    expect(verifierCode('AM4821', '12345', t)).toMatchObject({ ok: false });
    expect(verifierCode('AM9999', code, t).ok).toBe(false);
  });
});

describe('répartition d’une facture par lignes', () => {
  it('7 100 de part patient sur 35 500 (Clinique Les Palmiers)', () => {
    const r = repartirActes([L('Consultation', 15_000, 'consultation'), L('Analyses', 12_000, 'examen'), L('Médicaments', 8_500, 'medicament')], FAMILLE, 1_014_000);
    expect(r.total).toBe(35_500); expect(r.assureMe).toBe(28_400); expect(r.patient).toBe(7_100); expect(r.plafondDepasse).toBe(false);
  });
  it('les médicaments sur ordonnance suivent le taux pharmacie (70 %)', () => {
    const r = repartirActes([L('Antibiotique', 10_000, 'ordonnance')], FAMILLE, 1_000_000);
    expect(r.assureMe).toBe(7_000); expect(r.patient).toBe(3_000);
    expect(repartirActes([L('Consultation', 10_000, 'consultation')], COUVERTURES.premium, 1_000_000).assureMe).toBe(9_000);
  });
  it('le plafond restant s’épuise dans l’ordre des lignes, le reste va au patient', () => {
    const r = repartirActes([L('Accouchement', 100_000, 'hospitalisation'), L('Suites', 50_000, 'hospitalisation')], FAMILLE, 90_000);
    expect(r.lignes.map((l) => l.assureMe)).toEqual([80_000, 10_000]);
    expect(r.assureMe).toBe(90_000); expect(r.patient).toBe(60_000); expect(r.plafondDepasse).toBe(true);
  });
  it('plafond épuisé : le patient paie tout', () => {
    const r = repartirActes([L('Radio', 36_000, 'examen')], FAMILLE, 0);
    expect(r.assureMe).toBe(0); expect(r.patient).toBe(36_000); expect(r.plafondDepasse).toBe(true);
  });
  it('valide les lignes saisies', () => {
    expect(erreursLignes([])).toHaveLength(1);
    expect(erreursLignes([L('', 1000, 'examen')])[0]).toContain('libellé');
    expect(erreursLignes([L('Radio', 0, 'examen')])[0]).toContain('supérieur à 0');
    expect(erreursLignes([L('Radio', 12.5, 'examen')])).toHaveLength(1);
    expect(erreursLignes([L('Radio', 99_000_000, 'examen')])[0]).toContain('trop élevé');
    expect(erreursLignes([L('Radio', 12_000, 'examen')])).toEqual([]);
  });
  it('échéance à 7 jours', () => { expect(echeanceDefaut('2026-10-25')).toBe('2026-11-01'); });
});

describe('ordonnance', () => {
  const t = Date.parse('2026-10-22T10:00:00'), min = 60_000;
  it('avance dans le temps', () => {
    expect(statutOrdonnance(t, t + 5 * min, true)).toBe('recue');
    expect(statutOrdonnance(t, t + 30 * min, true)).toBe('preparation');
    expect(statutOrdonnance(t, t + 90 * min, true)).toBe('en_route');
    expect(statutOrdonnance(t, t + 121 * min, true)).toBe('livree');
    expect(statutOrdonnance(t, t + 300 * min, false)).toBe('prete');
  });
});

describe('étalement sur 3 mois', () => {
  const base = { part: 7_100, pass: 'famille' as const, score: 742, salaire: 520_000, mensualitesExistantes: 44_000, employeur: 'NDIBA LOGISTIQUE', anciennete: '4 ans' };
  it('accordé : ~2 440 par mois à 1,5 %', () => {
    const e = evaluerEtalement(base);
    expect(e.approuve).toBe(true); expect(e.taux).toBe(0.015);
    expect(e.mensualite).toBeGreaterThan(2_400); expect(e.mensualite).toBeLessThan(2_460);
    expect(e.total).toBe(e.mensualite * 3); expect(e.frais).toBe(e.total - 7_100);
    expect(e.partApres).toBeCloseTo((44_000 + e.mensualite) / 520_000, 5);
  });
  it('refusé au-delà de 33 % du salaire net', () => {
    const e = evaluerEtalement({ ...base, mensualitesExistantes: 170_000 });
    expect(e.approuve).toBe(false); expect(e.motif).toContain('Mensualités totales'); expect(e.partApres).toBeGreaterThan(0.33);
  });
  it('pile à 33 % : accordé ; un franc de plus : refusé', () => {
    const sans = evaluerEtalement({ ...base, mensualitesExistantes: 0 }).mensualite, limite = Math.floor(520_000 * 0.33);
    expect(evaluerEtalement({ ...base, mensualitesExistantes: limite - sans }).approuve).toBe(true);
    expect(evaluerEtalement({ ...base, mensualitesExistantes: limite - sans + 1 }).approuve).toBe(false);
  });
  it('refusé sans employeur (pas de retenue sur salaire), score trop bas ou part trop petite', () => {
    expect(evaluerEtalement({ ...base, employeur: '  ' }).approuve).toBe(false);
    expect(evaluerEtalement({ ...base, score: 480 }).approuve).toBe(false);
    const p = evaluerEtalement({ ...base, part: 1_500 }); expect(p.approuve).toBe(false); expect(p.mensualite).toBe(0);
  });
  it('le Pass Premium a un taux réduit', () => { expect(evaluerEtalement({ ...base, pass: 'premium' }).taux).toBe(0.012); });
});

describe('réseau de soins', () => {
  it('trie par distance depuis la position par défaut', () => {
    const t = trierParDistance(LIEUX, POSITION_PAR_DEFAUT);
    expect(t.map((l) => l.id)).toEqual(['rond-point', 'palmiers', 'bioplus', 'horizon', 'saint-raphael']);
    expect(t[0].km).toBeGreaterThan(0.5); expect(t[0].km).toBeLessThan(0.7);
    expect(t[1].km).toBeGreaterThan(1.1); expect(t[1].km).toBeLessThan(1.3);
    expect(t[4].km).toBeGreaterThan(4.7); expect(t[4].km).toBeLessThan(4.9);
  });
  it('trie depuis une autre position', () => {
    const akwa = { lat: 4.0563, lng: 9.703 };
    expect(trierParDistance(LIEUX, akwa)[0].id).toBe('saint-raphael');
  });
  it('libellés de distance', () => { expect(libelleKm(1.234)).toBe('1,2 km'); expect(libelleKm(0.05)).toBe('50 m'); });
  it('projette sur le plan dans [4 %, 96 %]', () => {
    const p = projeter(LIEUX as Lieu[], POSITION_PAR_DEFAUT);
    for (const q of p) { expect(q.x).toBeGreaterThanOrEqual(4); expect(q.x).toBeLessThanOrEqual(96); expect(q.y).toBeGreaterThanOrEqual(4); expect(q.y).toBeLessThanOrEqual(96); }
    expect(projeter([], POSITION_PAR_DEFAUT)).toEqual([]);
  });
});

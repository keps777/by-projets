import { describe, expect, it } from 'vitest';
import type { MetriqueLigne, PointRapportLigne, Projet, Rubrique, Saisie, SaisieValeur, SousProjetLigne } from '@core/lignes.ts';
import { calculerPoints, configDeMesure, contenuDuJour, modifieDepuis, preparer, ratioPoint, resumeCourt, texteDuContenu, texteDuRapport, type DonneesRapport } from './calcul.ts';
import { calculerJours, niveau, pctJours, ratiosDuPoint } from './syntheses.ts';
import { decaler, intervalle, libelleJourLong, libelleMois, libelleSemaine, periodeDe, semaineIso } from './periodes.ts';

const b = (id: string) => ({ id, user_id: 'u', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', supprime_le: null });
const min = (n: number) => n * 60;

const rubrique: Rubrique = { ...b('r1'), cle: 'dieu', nom: 'Ma relation avec Dieu', couleur: '#9D8CFF', ordre: 0, archivee: false };
const bible: Projet = { ...b('p1'), rubrique_id: 'r1', numero: 1, nom: 'La lecture de la Bible', ordre: 0, statut: 'actif' };
const priere: Projet = { ...b('p2'), rubrique_id: 'r1', numero: 3, nom: 'La prière seule', ordre: 1, statut: 'actif' };
const fiche = { quoi: '', pourquoi: '', qui: '', ou: '', quand: '', comment: '', combien: '' };
const sp = (id: string, projet: string, debut: string, fin: string | null, statut: SousProjetLigne['statut'] = 'en_cours'): SousProjetLigne =>
  ({ ...b(id), projet_id: projet, nom: id, debut, fin, statut, metrique_pilote_id: null, reprise_passe: true, fiche, bilan: null, termine_le: null });
const met = (id: string, spId: string, cle: string, type: MetriqueLigne['type'], cible: number | null, unite = ''): MetriqueLigne =>
  ({ ...b(id), sous_projet_id: spId, cle, type, nom: id, unite, cible, periode_cible: 'jour', sens: 'plus', options: null, dans_rapport: true, ordre: 0 });
const point = (id: string, ordre: number, code: string, projet: string | null, cles: string[]): PointRapportLigne =>
  ({ ...b(id), ordre, code, libelle: code, projet_id: projet, mesures: cles.map((cle) => ({ cle, sous_projet_id: null })), actif: true });
const saisie = (id: string, projet: string, jour: string, approx = false): Saisie => ({ ...b(id), projet_id: projet, occurrence_id: null, jour, source: 'manuel', note: null, approx });
const val = (id: string, saisieId: string, cle: string, n: number | null, txt: string | null = null): SaisieValeur => ({ ...b(id), saisie_id: saisieId, cle, valeur_num: n, valeur_txt: txt, detail: null });

function donnees(): DonneesRapport {
  return {
    rubriques: [rubrique], projets: [bible, priere],
    sousProjets: [sp('nt', 'p1', '2026-10-01', '2026-10-31'), sp('ancien', 'p1', '2026-09-01', '2026-09-30'), sp('pa', 'p2', '2026-09-01', null)],
    metriques: [
      met('m1', 'nt', 'nombre:chapitres', 'nombre', 7, 'ch'), met('m2', 'nt', 'temps', 'temps', min(45)),
      met('m0', 'ancien', 'nombre:chapitres', 'nombre', 3, 'ch'), met('m3', 'pa', 'temps', 'temps', min(120))
    ],
    points: [point('pt-pa', 1, 'PA', 'p2', ['temps']), point('pt-br', 0, 'BR', 'p1', ['nombre:chapitres', 'reference:passages', 'temps'])],
    saisies: [saisie('s1', 'p1', '2026-10-05'), saisie('s2', 'p2', '2026-10-05', true), saisie('s3', 'p2', '2026-10-04'), saisie('s4', 'p1', '2026-09-30')],
    valeurs: [
      val('v1', 's1', 'nombre:chapitres', 3), val('v2', 's1', 'temps', min(22)), val('v3', 's1', 'reference:passages', null, 'Matthieu 8–10'),
      val('v4', 's2', 'temps', min(135)), val('v5', 's3', 'temps', min(60)), val('v6', 's4', 'nombre:chapitres', 3)
    ]
  };
}

describe('rapport du jour calculé dans l’app', () => {
  const d = donnees();
  const prep = preparer(d);

  it('range les points dans l’ordre et prend la couleur de la rubrique', () => {
    expect(prep.map((p) => p.point.code)).toEqual(['BR', 'PA']);
    expect(prep[0].couleur).toBe('#9D8CFF');
  });

  it('prend l’objectif du sous-projet qui couvre la période (le plus récent)', () => {
    const br = d.points.find((p) => p.code === 'BR')!;
    expect(configDeMesure(br.mesures[0], br, d, '2026-10-05', '2026-10-05').metrique.cible).toBe(7);
    expect(configDeMesure(br.mesures[0], br, d, '2026-09-30', '2026-09-30').metrique.cible).toBe(3);
    expect(configDeMesure({ cle: 'nombre:chapitres', sous_projet_id: 'ancien' }, br, d, '2026-10-05', '2026-10-05').metrique.cible).toBe(3);
    expect(configDeMesure({ cle: 'fois', sous_projet_id: null }, br, d, '2026-10-05', '2026-10-05').metrique).toMatchObject({ type: 'fois', cible: null });
  });

  it('compose le texte WhatsApp au format de l’utilisateur', () => {
    const pts = calculerPoints(prep, d, '2026-10-05', '2026-10-05');
    expect(texteDuRapport({ periode: periodeDe('jour', '2026-10-05'), nom: 'Luther Kevin K.', langue: 'en', points: pts })).toBe([
      '*Report · October 5, 2026 · Luther Kevin K.*', '', '1. *BR* : 3/7 ch; ref. Matthieu 8–10; 0h22/0h45', '', '2. *PA* : ~2h15/2h00'
    ].join('\n'));
    expect(pts.map((p) => p.ratio)).toEqual([3 / 7, 135 / 120]);
    expect(resumeCourt(pts)).toBe('BR 3/7 ch · PA ~2h15/2h00');
  });

  it('cumule fait et attendu sur la semaine', () => {
    const s = periodeDe('semaine', '2026-10-05');
    const pts = calculerPoints(prep, d, s.debut, s.fin);
    const pa = pts.find((p) => p.point.code === 'PA')!;
    expect(pa.mesures[0]).toMatchObject({ fait: min(135), attendu: min(120) * 7 });
    expect(texteDuRapport({ periode: s, nom: 'Luther', langue: 'fr', points: [pa] })).toBe('*Rapport de la semaine · 5 oct. – 11 oct. 2026 · Luther*\n\n1. *PA* : ~2h15/14h00');
  });

  it('calcule chaque jour d’un mois, sans les jours futurs', () => {
    const jours = calculerJours(prep, d, '2026-10-01', '2026-10-31', '2026-10-05');
    expect(jours).toHaveLength(31);
    expect(jours.filter((j) => j.futur)).toHaveLength(26);
    const j4 = jours.find((j) => j.jour === '2026-10-04')!;
    expect(j4.atteints).toBe(0);
    expect(ratiosDuPoint(jours, 'pt-pa').slice(3, 6)).toEqual([0.5, 135 / 120, null]);
    expect(pctJours(jours)).toBe(10); // 1 point atteint sur 10 points-jours comptés
  });

  it('détecte un rapport modifié depuis l’envoi et garde l’ancien texte', () => {
    const pts = calculerPoints(prep, d, '2026-10-05', '2026-10-05');
    const envoye = contenuDuJour('2026-10-05', pts);
    expect(modifieDepuis(envoye, contenuDuJour('2026-10-05', pts))).toBe(false);
    const d2 = donnees();
    d2.valeurs = d2.valeurs.map((v) => (v.id === 'v1' ? { ...v, valeur_num: 7 } : v));
    const apres = calculerPoints(preparer(d2), d2, '2026-10-05', '2026-10-05');
    expect(modifieDepuis(envoye, contenuDuJour('2026-10-05', apres))).toBe(true);
    expect(texteDuContenu(envoye, 'Luther', 'fr')).toContain('1. *BR* : 3/7 ch; réf. Matthieu 8–10; 0h22/0h45');
  });
});

describe('part de l’objectif d’un point', () => {
  it('prend la mesure la plus faible ; sans objectif, compte ce qui est fait', () => {
    expect(ratioPoint([{ type: 'fois', fait: 2, attendu: 3 }, { type: 'temps', fait: min(28) }])).toBeCloseTo(2 / 3);
    expect(ratioPoint([{ type: 'nombre', fait: 0, attendu: 7 }, { type: 'temps', fait: 0, attendu: min(45) }])).toBe(0);
    expect(ratioPoint([{ type: 'oui_non', fait: 1 }])).toBe(1);
    expect(ratioPoint([{ type: 'temps', fait: 0 }])).toBe(0);
    expect(ratioPoint([{ type: 'reference', fait: null, texte: '' }])).toBeNull();
    expect(ratioPoint([])).toBeNull();
    expect([niveau(null), niveau(0), niveau(0.3), niveau(0.6), niveau(1.2)]).toEqual([0, 0, 1, 2, 3]);
  });
});

describe('périodes', () => {
  it('semaine ISO et libellés', () => {
    expect(semaineIso('2026-10-04')).toBe(40);
    expect(semaineIso('2026-09-28')).toBe(40);
    expect(semaineIso('2026-01-01')).toBe(1);
    expect(semaineIso('2027-01-01')).toBe(53);
    expect(libelleSemaine('2026-09-28')).toBe('Semaine 40 · 28 sept. – 4 oct.');
    expect(intervalle('2026-09-21', '2026-09-27')).toBe('21 – 27 sept.');
    expect(libelleJourLong('2026-10-04')).toBe('Dimanche 4 octobre 2026');
    expect(libelleMois('2026-09')).toBe('Septembre 2026');
  });
  it('avance et recule d’une période', () => {
    expect(periodeDe('semaine', '2026-10-04')).toEqual({ vue: 'semaine', debut: '2026-09-28', fin: '2026-10-04' });
    expect(decaler(periodeDe('mois', '2026-03-15'), -1)).toEqual({ vue: 'mois', debut: '2026-02-01', fin: '2026-02-28' });
    expect(decaler(periodeDe('mois', '2026-01-31'), 1).debut).toBe('2026-02-01');
    expect(decaler(periodeDe('jour', '2026-10-01'), -1).debut).toBe('2026-09-30');
  });
});

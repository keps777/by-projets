import { describe, it, expect } from 'vitest';
import { formaterRapport, type MetriqueLigne, type PointRapportLigne, type Saisie, type SaisieValeur, type SousProjetLigne } from '../_shared/core/index.ts';
import { construireContenu, type DonneesJour } from './contenu.ts';
import {
  genererRapports, idRapport, idRappelServeur, jourARapporter, rappelsRecap,
  type DepotRapports, type ProfilRapport, type RapportNouveau, type RappelServeur
} from './logique.ts';

const U = 'u1';
const base = { user_id: U, created_at: '', updated_at: '', supprime_le: null };
const toronto: ProfilRapport = { id: U, fuseau: 'America/Toronto', heure_rapport: '21:15' };

describe('choix du moment selon l’heure locale', () => {
  it('produit le rapport à 21:15 heure de Toronto, en heure d’été comme en heure normale', () => {
    // 30 oct. (EDT, UTC−4) : 21:15 = 01:15 UTC le 31.
    expect(jourARapporter(toronto, Date.parse('2026-10-31T01:14:00Z'))).toBeNull();
    expect(jourARapporter(toronto, Date.parse('2026-10-31T01:15:00Z'))).toBe('2026-10-30');
    // 1er nov. : retour à l'heure normale (EST, UTC−5) ; 21:15 = 02:15 UTC le 2.
    expect(jourARapporter(toronto, Date.parse('2026-11-02T01:15:00Z'))).toBeNull();
    expect(jourARapporter(toronto, Date.parse('2026-11-02T02:15:00Z'))).toBe('2026-11-01');
    // Rattrapage limité à deux heures.
    expect(jourARapporter(toronto, Date.parse('2026-11-02T04:14:00Z'))).toBe('2026-11-01');
    expect(jourARapporter(toronto, Date.parse('2026-11-02T04:15:00Z'))).toBeNull();
  });

  it('suit le fuseau de chaque profil', () => {
    const paris: ProfilRapport = { id: 'u2', fuseau: 'Europe/Paris', heure_rapport: '07:30' };
    expect(jourARapporter(paris, Date.parse('2026-10-05T05:30:00Z'))).toBe('2026-10-05');
    // Le 26 oct., Paris est passé à l'heure normale (UTC+1) : 05:30 UTC = 06:30, trop tôt.
    expect(jourARapporter(paris, Date.parse('2026-10-26T05:30:00Z'))).toBeNull();
    expect(jourARapporter(paris, Date.parse('2026-10-26T06:30:00Z'))).toBe('2026-10-26');
  });

  it('rappels de récapitulatif : dimanche 20:00 et le 1er à 08:00, heure locale', () => {
    // Dimanche 11 oct. 2026, 20:00 EDT = 00:00 UTC le 12.
    expect(rappelsRecap(toronto, Date.parse('2026-10-11T23:59:00Z'))).toEqual([]);
    const [s] = rappelsRecap(toronto, Date.parse('2026-10-12T00:05:00Z'));
    expect(s).toMatchObject({ type: 'recap_semaine', cle_unique: 'recap_semaine:2026-10-05', envoyer_a: '2026-10-12T00:00:00.000Z', id: idRappelServeur(U, 'recap_semaine:2026-10-05') });
    // 1er nov. 2026 (dimanche, passage à l'heure normale) 08:00 EST = 13:00 UTC.
    const m = rappelsRecap(toronto, Date.parse('2026-11-01T13:00:00Z'));
    expect(m).toEqual([expect.objectContaining({ type: 'recap_mois', cle_unique: 'recap_mois:2026-10', envoyer_a: '2026-11-01T13:00:00.000Z' })]);
  });
});

const sp: SousProjetLigne = { ...base, id: 'sp1', projet_id: 'p1', nom: '7 chapitres par jour', debut: '2026-10-01', fin: '2026-10-31', statut: 'en_cours',
  metrique_pilote_id: null, reprise_passe: false, fiche: { quoi: '', pourquoi: '', qui: '', ou: '', quand: '', comment: '', combien: '' }, bilan: null, termine_le: null };
const met = (cle: string, type: MetriqueLigne['type'], unite: string, cible: number | null): MetriqueLigne =>
  ({ ...base, id: `m-${cle}`, sous_projet_id: 'sp1', cle, type, nom: cle, unite, cible, periode_cible: 'jour', sens: 'plus', options: null, dans_rapport: true, ordre: 0 });
const point = (id: string, code: string, projet_id: string | null, cles: string[], ordre: number): PointRapportLigne =>
  ({ ...base, id, code, libelle: code, projet_id, ordre, actif: true, mesures: cles.map((cle) => ({ cle, sous_projet_id: null })) });
const saisie = (id: string, projet_id: string, approx = false): Saisie =>
  ({ ...base, id, projet_id, occurrence_id: null, jour: '2026-10-04', source: 'bloc', note: null, approx });
const val = (saisie_id: string, cle: string, valeur_num: number | null, valeur_txt: string | null = null): SaisieValeur =>
  ({ ...base, id: `${saisie_id}-${cle}`, saisie_id, cle, valeur_num, valeur_txt, detail: null });

const donnees: DonneesJour = {
  points: [point('pt-br', 'BR', 'p1', ['nombre:chapitres', 'reference:passages', 'temps'], 1), point('pt-pa', 'PA', 'p3', ['temps'], 0),
    { ...point('pt-x', 'X', null, ['temps'], 2), actif: false }],
  sousProjets: [sp],
  metriques: [met('nombre:chapitres', 'nombre', 'ch', 7), met('temps', 'temps', 'min', 2700), met('reference:passages', 'reference', '', null)],
  saisies: [saisie('s1', 'p1'), saisie('s2', 'p3'), saisie('s3', 'p3', true)],
  valeurs: [val('s1', 'nombre:chapitres', 3), val('s1', 'reference:passages', null, 'Jean 1-3'), val('s1', 'temps', 1500),
    val('s2', 'temps', 720), val('s3', 'temps', 960)]
};

describe('construireContenu', () => {
  it('calcule chaque point actif avec le noyau, objectifs lus dans les sous-projets', () => {
    const c = construireContenu(donnees, '2026-10-04');
    expect(c.points.map((p) => p.code)).toEqual(['PA', 'BR']);
    expect(formaterRapport({ nom: 'Luther', entete: c.entete, points: c.points })).toBe(
      '*Rapport · 4 octobre 2026 · Luther*\n\n1. *PA* : ~0h28\n\n2. *BR* : 3/7 ch; réf. Jean 1-3; 0h25/0h45');
  });
});

describe('genererRapports', () => {
  function depotMemoire(profils: ProfilRapport[]) {
    const rapports: RapportNouveau[] = [];
    const rappels: RappelServeur[] = [];
    const depot: DepotRapports = {
      profils: async () => profils,
      rapportExiste: async (u, j) => rapports.some((r) => r.user_id === u && r.jour === j),
      donnees: async () => donnees,
      insererRapport: async (r) => { if (!rapports.some((x) => x.id === r.id)) rapports.push(r); },
      insererRappels: async (l) => l.filter((r) => !rappels.some((x) => x.id === r.id) && rappels.push(r)).map((r) => r.id)
    };
    return { depot, rapports, rappels };
  }

  it('un rapport par profil et par jour local, avec son rappel, sans doublon à la minute suivante', async () => {
    const m = depotMemoire([toronto, { id: 'u2', fuseau: 'Europe/Paris', heure_rapport: '21:15' }]);
    const t = Date.parse('2026-10-06T01:15:00Z'); // lundi 5 à 21:15 à Toronto ; mardi 6 à 03:15 à Paris.
    expect(await genererRapports(m.depot, t)).toMatchObject({ profils: 2, rapports: 1, rappels: 1 });
    expect(m.rapports[0]).toMatchObject({ id: idRapport(U, '2026-10-05'), jour: '2026-10-05', envoye_a: null });
    expect(m.rappels[0]).toMatchObject({ type: 'rapport', rapport_id: idRapport(U, '2026-10-05'), cle_unique: 'rapport:2026-10-05' });
    expect(await genererRapports(m.depot, t + 60_000)).toMatchObject({ rapports: 0, rappels: 0 });
  });

  it('le dimanche soir, ajoute le rappel du récapitulatif de la semaine', async () => {
    const m = depotMemoire([toronto]);
    await genererRapports(m.depot, Date.parse('2026-10-05T01:15:00Z')); // dimanche 4 à 21:15
    expect(m.rappels.map((r) => r.type).sort()).toEqual(['rapport', 'recap_semaine']);
  });
});

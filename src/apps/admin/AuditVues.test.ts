import { describe, expect, it } from 'vitest';
import type { Audit } from '../../domain/types.ts';
import { categorie, celluleCsv, filtrer, FILTRES_INITIAUX, nbPages, page, trier, versCsv } from './AuditVues.ts';

const H = 3_600_000, NOW = Date.parse('2026-10-12T18:00Z');
const l = (id: string, h: number, acteur: string, action: string, cible: string, gravite: Audit['gravite'] = 'info', detail = ''): Audit => ({ id, quand: NOW - h * H, acteur, action, cible, detail, gravite });
const JOURNAL = [l('1', 0.5, 'adm-01', 'Création de drop', 'Drop N° 129', 'info', '8 places'), l('2', 5, 'adm-02', 'Gel du droit', 'NXG-0GEL', 'attention', 'Vérification d’identité'), l('3', 30, 'système', 'Rapprochement quotidien', 'Registre'), l('4', 24 * 10, 'adm-01', 'Suspension d’agence', 'Agence Horizon (exemple)', 'critique', 'Motif : permis')];

describe('catégories', () => { it('classe les actions', () => { expect(['Gel du droit', 'Création de drop', 'Ajout d’une offre d’agence', 'Connexion à la console', 'Export du journal', 'Rapprochement quotidien', 'Autre'].map(categorie)).toEqual(['gel', 'drops', 'agences', 'connexions', 'exports', 'rapprochement', 'autres']); }); });
describe('filtrer', () => {
  it('7 jours par défaut : écarte les lignes plus anciennes', () => { expect(filtrer(JOURNAL, FILTRES_INITIAUX, NOW).map((x) => x.id)).toEqual(['1', '2', '3']); });
  it('période : dernière heure, 24 heures, tout', () => {
    expect(filtrer(JOURNAL, { ...FILTRES_INITIAUX, periode: 'heure' }, NOW).map((x) => x.id)).toEqual(['1']); expect(filtrer(JOURNAL, { ...FILTRES_INITIAUX, periode: 'jour' }, NOW).map((x) => x.id)).toEqual(['1', '2']);
    expect(filtrer(JOURNAL, { ...FILTRES_INITIAUX, periode: 'tout' }, NOW)).toHaveLength(4);
  });
  it('gravité, acteur (partiel), catégorie d’action', () => {
    const t = { ...FILTRES_INITIAUX, periode: 'tout' as const };
    expect(filtrer(JOURNAL, { ...t, gravite: 'critique' }, NOW).map((x) => x.id)).toEqual(['4']); expect(filtrer(JOURNAL, { ...t, acteur: 'ADM-0' }, NOW)).toHaveLength(3); expect(filtrer(JOURNAL, { ...t, acteur: 'système' }, NOW)).toHaveLength(1);
    expect(filtrer(JOURNAL, { ...t, action: 'agences' }, NOW).map((x) => x.id)).toEqual(['4']);
  });
  it('recherche sans accents ni casse sur objet, action et détail', () => {
    const t = { ...FILTRES_INITIAUX, periode: 'tout' as const };
    expect(filtrer(JOURNAL, { ...t, recherche: 'drop n° 129' }, NOW).map((x) => x.id)).toEqual(['1']); expect(filtrer(JOURNAL, { ...t, recherche: 'verification d identite' }, NOW)).toHaveLength(0); expect(filtrer(JOURNAL, { ...t, recherche: 'identité' }, NOW).map((x) => x.id)).toEqual(['2']);
    expect(filtrer(JOURNAL, { ...t, recherche: 'zzz' }, NOW)).toEqual([]);
  });
});
describe('trier et paginer', () => {
  it('par date (défaut : récent d’abord), par gravité, par acteur', () => {
    expect(trier(JOURNAL, 'quand', 'desc').map((x) => x.id)).toEqual(['1', '2', '3', '4']); expect(trier(JOURNAL, 'quand', 'asc').map((x) => x.id)).toEqual(['4', '3', '2', '1']);
    expect(trier(JOURNAL, 'gravite', 'desc').map((x) => x.id)).toEqual(['4', '2', '1', '3']); expect(trier(JOURNAL, 'acteur', 'asc').map((x) => x.acteur)).toEqual(['adm-01', 'adm-01', 'adm-02', 'système']);
  });
  it('ne modifie pas le journal', () => { const avant = JOURNAL.map((x) => x.id); trier(JOURNAL, 'action', 'asc'); expect(JOURNAL.map((x) => x.id)).toEqual(avant); });
  it('pagination par 10', () => { const n = Array.from({ length: 23 }, (_, i) => i); expect(nbPages(23)).toBe(3); expect(nbPages(0)).toBe(1); expect(page(n, 3)).toEqual([20, 21, 22]); expect(page(n, 1)).toHaveLength(10); });
});
describe('CSV', () => {
  it('en-tête, ISO UTC, gravité en clair, retours de ligne CRLF', () => {
    const csv = versCsv([JOURNAL[0]]).split('\r\n'); expect(csv[0]).toBe('horodatage_utc,acteur,action,objet,detail,gravite'); expect(csv[1]).toBe('2026-10-12T17:30:00.000Z,adm-01,Création de drop,Drop N° 129,8 places,Info'); expect(csv[2]).toBe('');
  });
  it('échappe guillemets, virgules et formules de tableur', () => {
    expect(celluleCsv('a, "b"')).toBe('"a, ""b"""'); expect(celluleCsv('=1+1')).toBe("'=1+1"); expect(celluleCsv('-2')).toBe("'-2"); expect(celluleCsv('ok')).toBe('ok');
  });
});

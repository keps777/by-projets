import { describe, expect, it } from 'vitest';
import { compterEtats, construireLignes, dureeCourte, etatAvancement, etatMetrique, hmCourt, htmlJournee, type DocumentJournee, type EntreeFait } from './pdf-journee.ts';

const E = (debut: number, fin: number, titre: string, projets: string[] = [], detail: string[] = []): EntreeFait => ({ debut, fin, titre, secondes: (fin - debut) * 60, detail, projets });
const h = (heures: number, minutes = 0) => heures * 60 + minutes;

describe('formats du PDF de la journée', () => {
  it('heures comme on les dit', () => {
    expect(hmCourt(h(1, 12))).toBe('1h12');
    expect(hmCourt(0)).toBe('0h00');
    expect(hmCourt(h(14, 5))).toBe('14h05');
    expect(hmCourt(1440)).toBe('24h00');
  });
  it('durées', () => {
    expect(dureeCourte(61 * 60)).toBe('1h01');
    expect(dureeCourte(45 * 60)).toBe('45 min');
    expect(dureeCourte(3 * 3600)).toBe('3h00');
  });
});

describe('lignes du tableau', () => {
  it('l’exemple : un créneau effectué, puis les vides avant et après', () => {
    const l = construireLignes([E(h(1, 12), h(2, 13), 'Prière seule', ['Projet 3H de prière en moyenne par jour', 'Croisade de 40 jours de prière']), E(h(3, 16), h(4), 'Bible')], h(5));
    expect(l.map((x) => [x.creneau, x.activite, x.projets])).toEqual([
      ['0h00–1h11', 'vide', '--'],
      ['1h12–2h13', '1h01 de Prière seule', 'Projet 3H de prière en moyenne par jour + Croisade de 40 jours de prière'],
      ['2h14–3h15', 'vide', '--'],
      ['3h16–4h00', '44 min de Bible', '--'],
      ['4h01–5h00', 'vide', '--']
    ]);
  });
  it('un vide de 33 minutes (2h14–2h47) est une ligne', () => {
    const l = construireLignes([E(h(1, 12), h(2, 13), 'A'), E(h(2, 48), h(3), 'B')], h(3));
    expect(l.filter((x) => x.type === 'vide').map((x) => x.creneau)).toEqual(['0h00–1h11', '2h14–2h47']);
  });
  it('les petits trous (moins de 5 min) ne sont pas des lignes', () => {
    const l = construireLignes([E(h(8), h(9), 'A'), E(h(9, 3), h(10), 'B')], h(10));
    expect(l.filter((x) => x.type === 'vide').map((x) => x.creneau)).toEqual(['0h00–7h59']);
  });
  it('des blocs qui se chevauchent comptent ensemble ; l’ordre est celui de la journée', () => {
    const l = construireLignes([E(h(10), h(12), 'Long'), E(h(9), h(11), 'Début'), E(h(10, 30), h(11), 'Dans le long')], h(13));
    expect(l.map((x) => [x.type, x.creneau])).toEqual([
      ['vide', '0h00–8h59'], ['fait', '9h00–11h00'], ['fait', '10h00–12h00'], ['fait', '10h30–11h00'], ['vide', '12h01–13h00']
    ]);
  });
  it('un jour sans rien de fait : un seul vide, jusqu’à la fin de la journée', () => {
    expect(construireLignes([], 1440).map((x) => [x.type, x.creneau])).toEqual([['vide', '0h00–24h00']]);
  });
  it('un bloc qui finit à la borne n’est pas suivi d’un vide', () => {
    expect(construireLignes([E(0, 1440, 'Tout')], 1440).map((x) => x.type)).toEqual(['fait']);
  });
});

const doc: DocumentJournee = {
  metriques: [{ code: 'RDQD', libelle: 'Rencontre', mesures: '7 ch./7', ratio: 1, couleur: '#8E7CFF' }], etats: { atteint: 0, rythme: 1, leger: 0, retard: 0, neutre: 0 },
  notes: [{ numero: 12, provenance: 'Note libre · 14:03', blocs: [{ type: 'h2', segments: [{ texte: 'Culte' }] }, { type: 'p', segments: [{ texte: 'Un <mot>', gras: true }] }, { type: 'liste', ordonnee: false, items: [{ segments: [{ texte: 'un' }], niveau: 0 }] }, { type: 'media', id: 'x', media: 'image' }] }],
  titre: 'Ma journée · Vendredi 20 novembre', sousTitre: 'Créneaux effectués', nom: 'Luther Life', moyenne: 75, nbFaits: 1, totalSecondes: 3660, genereLe: '20 novembre 2026',
  groupes: [{ nom: 'Relation avec Dieu', couleur: '#8E7CFF', projets: [{ nom: 'Prière', pct: 75, trait: 70, etat: 'rythme', sousProjets: [{ nom: '3H de prière par jour', pct: 60, trait: 80, etat: 'leger', texte: '36 h sur 62 h' }] }] }],
  lignes: construireLignes([E(h(1, 12), h(2, 13), 'Prière <seule>', ['Projet "A"'])], h(3))
};

describe('page imprimable', () => {
  const html = htmlJournee(doc);
  it('recap avec barres de pourcentage, tableau, vides et total à la fin', () => {
    expect(html).toContain('Suivi des projets en cours');
    expect(html).toContain('Avancement moyen des projets en cours');
    expect(html).toContain('75 %');
    expect(html).toContain('width:75%');
    expect(html).toContain('36 h sur 62 h');
    expect(html).toContain('<th>Créneau</th><th>Activité effectuée</th><th>Projets en cours impliqués</th>');
    expect(html).toContain('1h12–2h13');
    expect(html).toContain('1h01 de Prière &lt;seule&gt;');
    expect(html).toContain('<tr class="vide"><td class="c">2h14–3h00</td><td>vide</td><td>--</td></tr>');
    expect(html.indexOf('Temps total de travail investi sur 24 h')).toBeGreaterThan(html.indexOf('</tbody>'));
    expect(html).toContain('<b>1h01</b></td></tr></tfoot>');
  });
  it('notes du jour : numéro, provenance, titres, paragraphes, listes, médias signalés', () => {
    expect(html).toContain('<h2>Notes du jour</h2>');
    expect(html).toContain('<b>n° 12</b> · Note libre · 14:03');
    expect(html).toContain('<h2>Culte</h2>');
    expect(html).toContain('<p>Un &lt;mot&gt;</p>');
    expect(html).toContain('<ul><li>un</li></ul>');
    expect(html).toContain('[Image]');
  });
  it('échappe le contenu saisi', () => {
    expect(html).not.toContain('Prière <seule>');
    expect(html).toContain('Projet &quot;A&quot;');
  });
});

describe('état d’avancement et métriques', () => {
  it('atteint à 100 %, sinon comparé au repère « où je devrais être »', () => {
    expect(etatAvancement(100, 80)).toBe('atteint');
    expect(etatAvancement(120, null)).toBe('atteint');
    expect(etatAvancement(70, 70)).toBe('rythme');
    expect(etatAvancement(68, 70)).toBe('rythme'); // -2 : encore dans le rythme
    expect(etatAvancement(60, 70)).toBe('leger');
    expect(etatAvancement(55, 70)).toBe('leger'); // -15
    expect(etatAvancement(54, 70)).toBe('retard');
    expect(etatAvancement(40, null)).toBe('neutre');
    expect(etatAvancement(null, 50)).toBe('neutre');
  });
  it('compte les projets par état', () => {
    const p = (etat: 'atteint' | 'rythme' | 'leger' | 'retard' | 'neutre') => ({ nom: 'x', pct: 1, trait: 1, etat });
    expect(compterEtats([{ nom: 'a', couleur: '#000', projets: [p('rythme'), p('retard'), p('rythme')] }, { nom: 'b', couleur: '#000', projets: [p('neutre')] }])).toEqual({ atteint: 0, rythme: 2, leger: 0, retard: 1, neutre: 1 });
  });
  it('état d’un point du rapport', () => {
    expect(etatMetrique(1)).toEqual({ texte: 'Atteint', classe: 'bon' });
    expect(etatMetrique(1.4).classe).toBe('bon');
    expect(etatMetrique(0.664)).toEqual({ texte: '66 %', classe: 'moyen' });
    expect(etatMetrique(0)).toEqual({ texte: 'À reprendre', classe: 'mauvais' });
    expect(etatMetrique(null)).toEqual({ texte: '--', classe: 'neutre' });
  });
  it('page de secours : le tableau d’abord, puis les métriques, puis le suivi des projets', () => {
    const h = htmlJournee({ ...doc, metriques: [{ code: 'RDQD', libelle: 'Rencontre', mesures: '7 ch./7', ratio: 1, couleur: null }] });
    expect(h.indexOf('Créneaux effectués')).toBeLessThan(h.indexOf('Métriques du jour'));
    expect(h.indexOf('Métriques du jour')).toBeLessThan(h.indexOf('Suivi des projets en cours'));
    expect(h.indexOf('Suivi des projets en cours')).toBeLessThan(h.indexOf('Notes du jour'));
    expect(h).toContain('<b>RDQD</b>');
  });
});

// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { compterEtats, construireLignes, etatAvancement, type BarreProjet, type DocumentJournee } from './pdf-journee.ts';
import { genererPdf, rgbDe, versWinAnsi, type ImagePdf } from './pdf-journee-fichier.ts';
import { blocsDeNote } from '../carnet/riche.ts';

const h = (heures: number, minutes = 0) => heures * 60 + minutes;
const ID = '3f1c2b8e-9a47-4d65-8b1e-0c7a5d2e9f41';
// Un JPEG minimal de 1×1 pixel.
const JPEG = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

const B = (nom: string, pct: number | null, trait: number | null, texte?: string, sousProjets?: BarreProjet[]): BarreProjet => ({ nom, pct, trait, etat: etatAvancement(pct, trait), texte, sousProjets });

function document(): DocumentJournee {
  const entrees = [
    { debut: h(1, 12), fin: h(2, 13), titre: 'Prière seule', secondes: 61 * 60, detail: ['Chapitres lus : 7 ch.'], projets: ['Projet 3H de prière en moyenne par jour', 'Croisade de 40 jours de prière'] },
    { debut: h(3, 16), fin: h(4), titre: 'Lecture de la Bible', secondes: 44 * 60, detail: [], projets: [] }
  ];
  const d: DocumentJournee = {
    titre: 'Ma journée · Samedi 21 novembre', sousTitre: 'Créneaux effectués et avancement des projets en cours', nom: 'Luther Life', moyenne: 62, nbFaits: 2, totalSecondes: 105 * 60, genereLe: '21 novembre 2026 à 12 h 30',
    groupes: [
      { nom: 'Ma relation avec Dieu', couleur: '#8E7CFF', projets: [
        B('La prière seule', 75, 70, undefined, [B('Projet 3H de prière en moyenne par jour', 60, 80, '36 h sur 62 h'), B('Croisade de 40 jours', 100, 100, '40 jours sur 40')]),
        B('Lecture de la Bible', null, null),
        B('Mémoriser les Écritures', 40, 70, undefined, [B('Un verset par jour', 40, 70, '12 versets sur 30')])
      ] },
      { nom: 'Mon service à Dieu', couleur: 'rgb(30, 160, 120)', projets: [B('L’évangélisation', 20, 60, undefined, [B('Rencontres', 20, 60, '12 rencontres sur 60')]), B('Formation des disciples', 55, 50)] }
    ],
    metriques: [
      { code: 'RDQD', libelle: 'Rencontre quotidienne', mesures: '7 ch./7; 45 min/45 min', ratio: 1, couleur: '#8E7CFF' },
      { code: 'PA', libelle: 'Prière seule', mesures: '3h08/3h00', ratio: 1, couleur: '#8E7CFF' },
      { code: 'PWO', libelle: 'Prière avec d’autres', mesures: '0h40/1h00', ratio: 0.66, couleur: '#8E7CFF' },
      { code: 'LLC', libelle: 'Littérature chrétienne', mesures: '0/10 p', ratio: 0, couleur: '#8E7CFF' },
      { code: 'EV', libelle: 'Évangélisation', mesures: '--', ratio: null, couleur: null }
    ],
    etats: { atteint: 0, rythme: 0, leger: 0, retard: 0, neutre: 0 },
    lignes: construireLignes(entrees, h(6)),
    notes: [
      { numero: 12, provenance: 'Note libre · 14:03', blocs: blocsDeNote(`<h1>Culte du dimanche « œuvre »</h1><p>Un paragraphe avec du <strong>gras</strong>, de l’<em>italique</em>, du <u>souligné</u> et un <a href="https://exemple.org">lien</a>. ${'Beaucoup de texte pour passer à la ligne. '.repeat(6)}</p><ul><li>Premier point<ul><li>Sous-point</li></ul></li><li>Deuxième point</li></ul><ol><li>Un</li><li>Deux</li></ol><blockquote>Une parole importante à retenir.</blockquote><hr><figure><img data-media="${ID}"></figure><figure><video data-media="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"></video></figure><p>Fin de la note ᵉ ✓ émoji 😀.</p>`) },
      { numero: 13, provenance: 'Focus · RDQD du matin · 05:12', blocs: [{ type: 'p', segments: [{ texte: 'Une note simple.' }] }] }
    ]
  };
  d.etats = compterEtats(d.groupes);
  return d;
}

describe('PDF de la journée (fichier)', () => {
  it('ramène le texte au latin des polices de base', () => {
    expect(versWinAnsi('Prière « œuvre » – 2ᵉ lundi ’ … •')).toBe('Prière « œuvre » – 2e lundi ’ … •');
    expect(versWinAnsi('A B 😀 ✓')).toBe('A B  ');
  });
  it('couleurs', () => {
    expect(rgbDe('#8E7CFF')).toEqual([142, 124, 255]);
    expect(rgbDe('rgb(30, 160, 120)')).toEqual([30, 160, 120]);
    expect(rgbDe('n’importe quoi')).toEqual([85, 87, 94]);
  });
  it('fabrique un vrai PDF, avec recap, tableau, notes et image', async () => {
    const images = new Map<string, ImagePdf>([[ID, { donnees: `data:image/jpeg;base64,${JPEG}`, largeur: 400, hauteur: 300 }]]);
    const blob = await genererPdf(document(), images);
    const octets = new Uint8Array(await blob.arrayBuffer());
    const texte = new TextDecoder('latin1').decode(octets);
    expect(texte.slice(0, 5)).toBe('%PDF-');
    expect(octets.length).toBeGreaterThan(3000);
    expect(texte).toContain('%%EOF');
  });
  it('un jour sans rien : un PDF quand même', async () => {
    const d = document();
    const blob = await genererPdf({ ...d, groupes: [], moyenne: null, notes: [], nbFaits: 0, totalSecondes: 0, lignes: construireLignes([], 1440) });
    expect(blob.size).toBeGreaterThan(1500);
  });
  it('beaucoup de métriques et de projets : le PDF reste valide, sur plusieurs pages', async () => {
    const d = document();
    const metriques = Array.from({ length: 45 }, (_, i) => ({ code: `P${i}`, libelle: `Point ${i}`, mesures: `${i} ch./10; 1h00/1h00`, ratio: (i % 4) / 3, couleur: '#8E7CFF' }));
    const groupes = Array.from({ length: 6 }, (_, g) => ({ nom: `Rubrique ${g}`, couleur: '#8E7CFF', projets: Array.from({ length: 5 }, (_, p) => B(`Projet ${g}.${p}`, 10 + p * 20, 50, undefined, [B('Sous-projet A', 30, 50, '3 sur 10'), B('Sous-projet B', 90, 50, '9 sur 10')])) }));
    const blob = await genererPdf({ ...d, metriques, groupes, etats: compterEtats(groupes) });
    const txt = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
    expect(txt.slice(0, 5)).toBe('%PDF-');
    expect((txt.match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBeGreaterThan(2);
  });
  it('beaucoup de lignes : plusieurs pages', async () => {
    const d = document();
    const lignes = construireLignes(Array.from({ length: 60 }, (_, i) => ({ debut: i * 20, fin: i * 20 + 10, titre: `Activité ${i}`, secondes: 600, detail: [], projets: ['Un projet'] })), 1440);
    const blob = await genererPdf({ ...d, lignes });
    const txt = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
    expect((txt.match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBeGreaterThan(1);
  });
});

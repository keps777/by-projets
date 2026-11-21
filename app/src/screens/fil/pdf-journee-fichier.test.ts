// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { construireLignes, type DocumentJournee } from './pdf-journee.ts';
import { genererPdf, rgbDe, versWinAnsi, type ImagePdf } from './pdf-journee-fichier.ts';
import { blocsDeNote } from '../carnet/riche.ts';

const h = (heures: number, minutes = 0) => heures * 60 + minutes;
const ID = '3f1c2b8e-9a47-4d65-8b1e-0c7a5d2e9f41';
// Un JPEG minimal de 1×1 pixel.
const JPEG = '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==';

function document(): DocumentJournee {
  const entrees = [
    { debut: h(1, 12), fin: h(2, 13), titre: 'Prière seule', secondes: 61 * 60, detail: ['Chapitres lus : 7 ch.'], projets: ['Projet 3H de prière en moyenne par jour', 'Croisade de 40 jours de prière'] },
    { debut: h(3, 16), fin: h(4), titre: 'Lecture de la Bible', secondes: 44 * 60, detail: [], projets: [] }
  ];
  return {
    titre: 'Ma journée · Samedi 21 novembre', sousTitre: 'Créneaux effectués et avancement des projets en cours', nom: 'Luther Life', moyenne: 62, nbFaits: 2, totalSecondes: 105 * 60, genereLe: '21 novembre 2026 à 12 h 30',
    groupes: [
      { nom: 'Ma relation avec Dieu', couleur: '#8E7CFF', projets: [{ nom: 'La prière seule', pct: 75, sousProjets: [{ nom: 'Projet 3H de prière en moyenne par jour', pct: 60, texte: '36 h sur 62 h' }, { nom: 'Croisade de 40 jours', pct: 100, texte: '40 jours sur 40' }] }, { nom: 'Lecture de la Bible', pct: null, sousProjets: [] }] },
      { nom: 'Mon service à Dieu', couleur: 'rgb(30, 160, 120)', projets: [{ nom: 'L’évangélisation', pct: 20, sousProjets: [] }] }
    ],
    lignes: construireLignes(entrees, h(6)),
    notes: [
      { numero: 12, provenance: 'Note libre · 14:03', blocs: blocsDeNote(`<h1>Culte du dimanche « œuvre »</h1><p>Un paragraphe avec du <strong>gras</strong>, de l’<em>italique</em>, du <u>souligné</u> et un <a href="https://exemple.org">lien</a>. ${'Beaucoup de texte pour passer à la ligne. '.repeat(6)}</p><ul><li>Premier point<ul><li>Sous-point</li></ul></li><li>Deuxième point</li></ul><ol><li>Un</li><li>Deux</li></ol><blockquote>Une parole importante à retenir.</blockquote><hr><figure><img data-media="${ID}"></figure><figure><video data-media="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"></video></figure><p>Fin de la note ᵉ ✓ émoji 😀.</p>`) },
      { numero: 13, provenance: 'Focus · RDQD du matin · 05:12', blocs: [{ type: 'p', segments: [{ texte: 'Une note simple.' }] }] }
    ]
  };
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
  it('beaucoup de lignes : plusieurs pages', async () => {
    const d = document();
    const lignes = construireLignes(Array.from({ length: 60 }, (_, i) => ({ debut: i * 20, fin: i * 20 + 10, titre: `Activité ${i}`, secondes: 600, detail: [], projets: ['Un projet'] })), 1440);
    const blob = await genererPdf({ ...d, lignes });
    const txt = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
    expect((txt.match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBeGreaterThan(1);
  });
});

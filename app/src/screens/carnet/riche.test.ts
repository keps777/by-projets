// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { blocsDeNote, estVide, mediasDe, nettoyer, texteBrut, texteVersHtml } from './riche.ts';

const ID = '3f1c2b8e-9a47-4d65-8b1e-0c7a5d2e9f41';
const ID2 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('nettoyage du HTML des notes riches', () => {
  it('garde les paragraphes, titres, listes, citation et mise en forme', () => {
    const h = nettoyer('<h1>Titre</h1><p>Un <b>gras</b>, un <i>italique</i> et un <u>souligné</u>.</p><ul><li>un</li><li>deux</li></ul><ol><li>a</li></ol><blockquote>Parole</blockquote><hr>');
    expect(h).toBe('<h1>Titre</h1><p>Un <strong>gras</strong>, un <em>italique</em> et un <u>souligné</u>.</p><ul><li>un</li><li>deux</li></ul><ol><li>a</li></ol><blockquote>Parole</blockquote><hr>');
  });
  it('les <div> du presse-papiers deviennent des paragraphes ; le texte nu est rangé dans un paragraphe', () => {
    expect(nettoyer('<div>Premier</div><div>Deuxième</div>')).toBe('<p>Premier</p><p>Deuxième</p>');
    expect(nettoyer('Bonjour <b>toi</b>')).toBe('<p>Bonjour <strong>toi</strong></p>');
    expect(nettoyer('Ligne 1<br>Ligne 2')).toBe('<p>Ligne 1<br>Ligne 2</p>');
  });
  it('jette scripts, styles, iframes, attributs et gestionnaires d’événements', () => {
    const h = nettoyer('<p style="color:red" onclick="x()">Salut<script>alert(1)</script></p><iframe src="https://x"></iframe><style>p{}</style><span class="a">texte</span>');
    expect(h).toBe('<p>Salut</p><p>texte</p>');
    expect(h).not.toMatch(/script|onclick|style|iframe/i);
  });
  it('liens : http(s), mailto et tel seulement, avec rel="noopener"', () => {
    expect(nettoyer('<p><a href="https://exemple.org/x?a=1&b=2" onclick="x">lien</a></p>')).toBe('<p><a href="https://exemple.org/x?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">lien</a></p>');
    expect(nettoyer('<p><a href="javascript:alert(1)">piège</a></p>')).toBe('<p>piège</p>');
    expect(nettoyer('<p><a href="data:text/html;base64,AAA">piège</a></p>')).toBe('<p>piège</p>');
  });
  it('médias : seulement par identifiant ; une image venue d’ailleurs est jetée', () => {
    expect(nettoyer(`<figure><img data-media="${ID}" src="blob:x" alt="a"></figure>`)).toBe(`<figure><img data-media="${ID}" alt=""></figure>`);
    expect(nettoyer(`<figure><video data-media="${ID2}" src="blob:y" controls></video></figure>`)).toBe(`<figure><video data-media="${ID2}" controls playsinline preload="metadata"></video></figure>`);
    expect(nettoyer('<img src="https://tracker.example/pixel.gif">')).toBe('');
    expect(nettoyer('<figure><img data-media="pas-un-id"></figure>')).toBe('');
  });
  it('un média inséré dans une liste ou un titre passe au premier niveau, dans l’ordre', () => {
    const h = nettoyer(`<ul><li>Point<figure><img data-media="${ID}"></figure><figure><video data-media="${ID2}"></video></figure></li></ul><h2>Titre<figure><img data-media="${ID}"></figure></h2>`);
    expect(h).toBe(`<ul><li>Point</li></ul><figure><img data-media="${ID}" alt=""></figure><figure><video data-media="${ID2}" controls playsinline preload="metadata"></video></figure><h2>Titre</h2><figure><img data-media="${ID}" alt=""></figure>`);
  });
  it('listes imbriquées, items vides et paragraphes vides de fin', () => {
    expect(nettoyer('<ul><li>a<ul><li>b</li></ul></li><li></li></ul>')).toBe('<ul><li>a<ul><li>b</li></ul></li></ul>');
    expect(nettoyer('<p>Un</p><p><br></p><p>Deux</p><p><br></p><p><br></p>')).toBe('<p>Un</p><p><br></p><p>Deux</p>');
  });
  it('contenu de Google Docs : spans, titres h4+, tableaux', () => {
    const h = nettoyer('<b id="docs"><p><span style="font-weight:700">Gras</span></p><h4>Petit titre</h4></b>');
    expect(h).toContain('<strong>');
    expect(nettoyer('<h4>Petit titre</h4>')).toBe('<h3>Petit titre</h3>');
  });
  it('vide ou null', () => {
    expect(nettoyer(null)).toBe('');
    expect(nettoyer('')).toBe('');
    expect(nettoyer('<p><br></p>')).toBe('');
  });
});

describe('texte brut et médias', () => {
  const html = `<h2>Culte</h2><p>Premier <strong>paragraphe</strong></p><ul><li>un</li><li>deux</li></ul><ol><li>a</li><li>b</li></ol><figure><img data-media="${ID}"></figure><blockquote>Verset</blockquote><figure><video data-media="${ID2}"></video></figure>`;
  it('texte brut : un paragraphe par ligne, listes, médias signalés', () => {
    expect(texteBrut(html)).toBe('Culte\nPremier paragraphe\n• un\n• deux\n1. a\n2. b\n[Image]\n« Verset »\n[Vidéo]');
  });
  it('listes imbriquées en texte brut', () => {
    expect(texteBrut('<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>')).toBe('• a\n  • b\n• c');
  });
  it('médias cités, dans l’ordre et sans doublon', () => {
    expect(mediasDe(html + `<figure><img data-media="${ID}"></figure>`)).toEqual([{ id: ID, type: 'image' }, { id: ID2, type: 'video' }]);
  });
  it('estVide : ni texte ni média', () => {
    expect(estVide('<p><br></p>')).toBe(true);
    expect(estVide('')).toBe(true);
    expect(estVide('<p>a</p>')).toBe(false);
    expect(estVide(`<figure><img data-media="${ID}"></figure>`)).toBe(false);
  });
});

describe('du texte brut au HTML', () => {
  it('une ligne par paragraphe, caractères échappés', () => {
    expect(texteVersHtml('Un <b>texte</b> & plus\n\nDeuxième')).toBe('<p>Un &lt;b&gt;texte&lt;/b&gt; &amp; plus</p><p><br></p><p>Deuxième</p>');
    expect(nettoyer(texteVersHtml('a\nb'))).toBe('<p>a</p><p>b</p>');
  });
});

describe('structure d’une note pour le PDF', () => {
  it('titres, paragraphes mis en forme, listes imbriquées, citation, séparateur, médias', () => {
    const b = blocsDeNote(`<h1>Titre</h1><p>Un <strong>gras</strong> et <em>italique</em><br>ligne <a href="https://x.org">lien</a></p><ul><li>a<ul><li>b</li></ul></li></ul><ol><li>un</li></ol><blockquote>Parole</blockquote><hr><figure><img data-media="${ID}"></figure><figure><video data-media="${ID2}"></video></figure>`);
    expect(b.map((x) => x.type)).toEqual(['h1', 'p', 'liste', 'liste', 'citation', 'sep', 'media', 'media']);
    const p = b[1] as { segments: { texte: string; gras?: boolean; italique?: boolean; lien?: string; souligne?: boolean }[] };
    expect(p.segments.map((s) => s.texte)).toEqual(['Un ', 'gras', ' et ', 'italique', '\n', 'ligne ', 'lien']);
    expect(p.segments[1].gras).toBe(true);
    expect(p.segments[3].italique).toBe(true);
    expect(p.segments[6]).toMatchObject({ lien: 'https://x.org', souligne: true });
    expect(b[2]).toMatchObject({ type: 'liste', ordonnee: false });
    expect((b[2] as { items: { niveau: number }[] }).items.map((i) => i.niveau)).toEqual([0, 1]);
    expect(b[6]).toEqual({ type: 'media', id: ID, media: 'image' });
    expect(b[7]).toEqual({ type: 'media', id: ID2, media: 'video' });
  });
  it('contenu vide', () => { expect(blocsDeNote('')).toEqual([]); });
});

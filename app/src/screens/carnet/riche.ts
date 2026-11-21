// Notes riches du Carnet (spec §18, nov. 2026) : nettoyage du HTML (liste blanche), texte brut équivalent, médias cités.
// Utilise DOMParser (navigateur ; jsdom dans les tests). Rien de ce qui vient de l'éditeur, du presse-papiers ou du serveur n'est affiché sans passer par `nettoyer`.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIEN_SUR = /^(https?:\/\/|mailto:|tel:)/i;
/** Balises dont le contenu est jeté avec elles. */
const A_JETER = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript', 'svg', 'math', 'form', 'input', 'button', 'textarea', 'select', 'link', 'meta', 'head', 'title']);
const BLOCS = new Set(['p', 'h1', 'h2', 'h3', 'ul', 'ol', 'blockquote', 'hr', 'figure']);
/** Balises de bloc d'ailleurs (Google Docs, Word, Safari) rangées dans un paragraphe. */
const COMME_PARAGRAPHE = new Set(['div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'pre', 'address', 'dd', 'dt', 'dl', 'table', 'thead', 'tbody', 'tr', 'td', 'th']);
const COMME_TITRE: Record<string, string> = { h4: 'h3', h5: 'h3', h6: 'h3' };
const COMME_ENTRE_BLOCS = new Set(['figcaption']);

export type TypeMedia = 'image' | 'video';
export interface MediaCite { id: string; type: TypeMedia }

const echapper = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const echapperAttr = (t: string) => echapper(t).replace(/"/g, '&quot;');

/** Un média inséré au milieu d'un item de liste, d'un titre ou d'une citation passe au premier niveau, juste après le bloc qui le contenait. */
function remonterMedias(corps: HTMLElement): void {
  const curseurs = new Map<Element, Element>();
  for (const m of Array.from(corps.querySelectorAll<HTMLElement>('figure, img[data-media], video[data-media]'))) {
    if (m.tagName !== 'FIGURE' && m.closest('figure')) continue; // dans une figure : c'est elle qu'on déplace
    let bloc: Element = m;
    while (bloc.parentElement && bloc.parentElement !== corps) bloc = bloc.parentElement;
    if (bloc === m) continue;
    const apres = curseurs.get(bloc) ?? bloc;
    apres.after(m);
    curseurs.set(bloc, m);
  }
}

function racine(html: string): HTMLElement {
  const corps = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html').body;
  remonterMedias(corps);
  return corps;
}

/** Contenu en ligne (texte, gras, italique, souligné, barré, lien, saut de ligne), rendu en HTML propre. */
function enLigne(noeud: Node): string {
  let sortie = '';
  for (const n of Array.from(noeud.childNodes)) {
    if (n.nodeType === 3) { sortie += echapper((n.textContent ?? '').replace(/ /g, ' ').replace(/[\r\n\t]+/g, ' ')); continue; }
    if (n.nodeType !== 1) continue;
    const el = n as HTMLElement;
    const t = el.tagName.toLowerCase();
    if (A_JETER.has(t)) continue;
    const interieur = enLigne(el);
    if (t === 'br') sortie += '<br>';
    else if (t === 'strong' || t === 'b') sortie += interieur ? `<strong>${interieur}</strong>` : '';
    else if (t === 'em' || t === 'i') sortie += interieur ? `<em>${interieur}</em>` : '';
    else if (t === 'u' || t === 'ins') sortie += interieur ? `<u>${interieur}</u>` : '';
    else if (t === 's' || t === 'strike' || t === 'del') sortie += interieur ? `<s>${interieur}</s>` : '';
    else if (t === 'a') {
      const href = (el.getAttribute('href') ?? '').trim();
      sortie += LIEN_SUR.test(href) && interieur ? `<a href="${echapperAttr(href)}" target="_blank" rel="noopener noreferrer">${interieur}</a>` : interieur;
    } else if (t === 'img' || t === 'video' || BLOCS.has(t) || COMME_PARAGRAPHE.has(t) || /^h[1-6]$/.test(t) || t === 'li') sortie += ' ' + interieur + ' ';
    else sortie += interieur; // span, font, mark, sup… : on garde le texte, pas la forme
  }
  return sortie;
}

const figure = (n: HTMLElement): string => {
  const t = n.tagName.toLowerCase();
  const media = t === 'figure' ? (n.querySelector('img[data-media], video[data-media]') as HTMLElement | null) : n;
  const id = media?.getAttribute('data-media') ?? '';
  if (!media || !UUID.test(id)) return '';
  return media.tagName.toLowerCase() === 'video'
    ? `<figure><video data-media="${id}" controls playsinline preload="metadata"></video></figure>`
    : `<figure><img data-media="${id}" alt=""></figure>`;
};

const paragrapheVide = (h: string) => !h.replace(/<br>/g, '').trim();

function listes(el: HTMLElement, t: 'ul' | 'ol'): string {
  const items: string[] = [];
  for (const li of Array.from(el.children)) {
    const lt = li.tagName.toLowerCase();
    if (lt === 'ul' || lt === 'ol') { const sous = listes(li as HTMLElement, lt); if (sous) items.push(`<li>${sous}</li>`); continue; }
    if (lt !== 'li') continue;
    // Le texte de l'item, puis ses sous-listes (elles sont dans le <li>).
    const propres = Array.from(li.childNodes).filter((c) => !(c.nodeType === 1 && ['ul', 'ol'].includes((c as HTMLElement).tagName.toLowerCase())));
    const h = enLigne({ childNodes: propres } as unknown as Node).replace(/\s+/g, ' ').trim();
    const sous = Array.from(li.children).filter((c) => ['ul', 'ol'].includes(c.tagName.toLowerCase())).map((c) => listes(c as HTMLElement, c.tagName.toLowerCase() as 'ul' | 'ol')).join('');
    if (!paragrapheVide(h) || sous) items.push(`<li>${paragrapheVide(h) ? '' : h}${sous}</li>`);
  }
  return items.length ? `<${t}>${items.join('')}</${t}>` : '';
}

/** Blocs de premier niveau d'un nœud : un bloc par paragraphe, titre, liste, citation, séparateur ou média. Le texte « libre » est rangé dans un paragraphe. */
function blocs(parent: Node): string[] {
  const res: string[] = [];
  let enAttente = '';
  const vider = () => { const h = enAttente.replace(/\s+/g, ' ').replace(/^( ?<br> ?)+|( ?<br> ?)+$/g, '').trim(); if (!paragrapheVide(h)) res.push(`<p>${h}</p>`); enAttente = ''; };
  for (const n of Array.from(parent.childNodes)) {
    if (n.nodeType === 3) { enAttente += enLigne({ childNodes: [n] } as unknown as Node); continue; }
    if (n.nodeType !== 1) continue;
    const el = n as HTMLElement;
    let t = el.tagName.toLowerCase();
    if (A_JETER.has(t)) continue;
    t = COMME_TITRE[t] ?? t;
    if (t === 'br') { enAttente += '<br>'; continue; }
    if (t === 'p') { vider(); const h = enLigne(el).replace(/\s+/g, ' ').trim(); res.push(paragrapheVide(h) ? '<p><br></p>' : `<p>${h}</p>`); }
    else if (t === 'h1' || t === 'h2' || t === 'h3') { vider(); const h = enLigne(el).replace(/\s+/g, ' ').trim(); if (!paragrapheVide(h)) res.push(`<${t}>${h}</${t}>`); }
    else if (t === 'ul' || t === 'ol') { vider(); const l = listes(el, t); if (l) res.push(l); }
    else if (t === 'blockquote') { vider(); const h = enLigne(el).replace(/\s+/g, ' ').trim(); if (!paragrapheVide(h)) res.push(`<blockquote>${h}</blockquote>`); }
    else if (t === 'hr') { vider(); res.push('<hr>'); }
    else if (t === 'figure' || t === 'img' || t === 'video') { vider(); const f = figure(el); if (f) res.push(f); }
    else if (COMME_PARAGRAPHE.has(t) || COMME_ENTRE_BLOCS.has(t)) {
      vider();
      // Un conteneur (div…) : ses enfants sont des blocs ; sans bloc dedans, c'est un paragraphe.
      const aDesBlocs = Array.from(el.children).some((c) => BLOCS.has(c.tagName.toLowerCase()) || COMME_PARAGRAPHE.has(c.tagName.toLowerCase()) || /^h[1-6]$/.test(c.tagName.toLowerCase()));
      if (aDesBlocs) res.push(...blocs(el));
      else { const h = enLigne(el).replace(/\s+/g, ' ').trim(); res.push(paragrapheVide(h) ? '<p><br></p>' : `<p>${h}</p>`); }
    } else enAttente += enLigne({ childNodes: [el] } as unknown as Node); // en ligne (strong, em, a, span…)
  }
  vider();
  return res;
}

/** Le HTML d'une note, ramené à la liste blanche : jamais de script, de style, d'attribut inconnu ni d'image venue d'ailleurs. */
export function nettoyer(html: string | null | undefined): string {
  if (!html) return '';
  const b = blocs(racine(html));
  // Pas de paragraphes vides en fin de note.
  while (b.length && b[b.length - 1] === '<p><br></p>') b.pop();
  return b.join('');
}

function lignesDeListe(el: Element, t: string, niveau: number, texteDe: (n: Node) => string): string[] {
  const res: string[] = [];
  let i = 0;
  for (const li of Array.from(el.children)) {
    const propre = Array.from(li.childNodes).filter((c) => !(c.nodeType === 1 && ['UL', 'OL'].includes(c.nodeName))).map((c) => (c.nodeType === 3 ? c.textContent ?? '' : texteDe(c))).join('').trim();
    if (propre) res.push(`${'  '.repeat(niveau)}${t === 'ol' ? `${++i}. ` : '• '}${propre}`);
    for (const sous of Array.from(li.children).filter((c) => ['UL', 'OL'].includes(c.nodeName))) res.push(...lignesDeListe(sous, sous.nodeName.toLowerCase(), niveau + 1, texteDe));
  }
  return res;
}

/** Texte brut équivalent : un paragraphe par ligne, listes à puces ou numérotées, médias signalés. */
export function texteBrut(html: string | null | undefined): string {
  const r = racine(nettoyer(html));
  const lignes: string[] = [];
  const texteDe = (n: Node): string => Array.from(n.childNodes).map((c) => (c.nodeType === 3 ? c.textContent ?? '' : c.nodeName === 'BR' ? '\n' : texteDe(c))).join('');
  for (const el of Array.from(r.children)) {
    const t = el.tagName.toLowerCase();
    if (t === 'ul' || t === 'ol') lignes.push(...lignesDeListe(el, t, 0, texteDe));
    else if (t === 'figure') lignes.push(el.querySelector('video') ? '[Vidéo]' : '[Image]');
    else if (t === 'hr') lignes.push('---');
    else if (t === 'blockquote') lignes.push(`« ${texteDe(el).trim()} »`);
    else lignes.push(texteDe(el).trim());
  }
  return lignes.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Médias cités dans une note (dans l'ordre), sans doublon. */
export function mediasDe(html: string | null | undefined): MediaCite[] {
  const vus = new Set<string>();
  const res: MediaCite[] = [];
  for (const m of Array.from(racine(nettoyer(html)).querySelectorAll('[data-media]'))) {
    const id = m.getAttribute('data-media')!;
    if (vus.has(id)) continue;
    vus.add(id);
    res.push({ id, type: m.tagName.toLowerCase() === 'video' ? 'video' : 'image' });
  }
  return res;
}

/** Une note riche sans texte ni média est vide. */
export const estVide = (html: string | null | undefined): boolean => !texteBrut(html) && mediasDe(html).length === 0;

/** Un texte brut devient du HTML de note : une ligne = un paragraphe (les lignes vides restent des paragraphes vides). */
export function texteVersHtml(texte: string): string {
  const lignes = texte.replace(/\r\n?/g, '\n').split('\n');
  return lignes.map((l) => (l.trim() ? `<p>${echapper(l)}</p>` : '<p><br></p>')).join('');
}

// ------------------------------------------------------------------ structure d'une note (PDF)

export interface Segment { texte: string; gras?: boolean; italique?: boolean; souligne?: boolean; barre?: boolean; lien?: string }
export interface ItemListe { segments: Segment[]; niveau: number }
export type BlocNote =
  | { type: 'p' | 'h1' | 'h2' | 'h3' | 'citation'; segments: Segment[] }
  | { type: 'liste'; ordonnee: boolean; items: ItemListe[] }
  | { type: 'sep' }
  | { type: 'media'; id: string; media: TypeMedia };

function segmentsDe(noeud: Node, style: Omit<Segment, 'texte'> = {}): Segment[] {
  const res: Segment[] = [];
  for (const n of Array.from(noeud.childNodes)) {
    if (n.nodeType === 3) { const t = n.textContent ?? ''; if (t) res.push({ texte: t, ...style }); continue; }
    if (n.nodeType !== 1) continue;
    const el = n as HTMLElement;
    const t = el.tagName.toLowerCase();
    if (t === 'br') res.push({ texte: '\n', ...style });
    else if (t === 'strong') res.push(...segmentsDe(el, { ...style, gras: true }));
    else if (t === 'em') res.push(...segmentsDe(el, { ...style, italique: true }));
    else if (t === 'u') res.push(...segmentsDe(el, { ...style, souligne: true }));
    else if (t === 's') res.push(...segmentsDe(el, { ...style, barre: true }));
    else if (t === 'a') res.push(...segmentsDe(el, { ...style, lien: el.getAttribute('href') ?? undefined, souligne: true }));
    else if (t !== 'ul' && t !== 'ol') res.push(...segmentsDe(el, style));
  }
  return res;
}

function itemsDe(liste: Element, niveau: number): ItemListe[] {
  const res: ItemListe[] = [];
  for (const li of Array.from(liste.children)) {
    if (li.tagName === 'LI') {
      const propres = Array.from(li.childNodes).filter((c) => !(c.nodeType === 1 && ['UL', 'OL'].includes(c.nodeName)));
      const segs = segmentsDe({ childNodes: propres } as unknown as Node);
      if (segs.some((s) => s.texte.trim())) res.push({ segments: segs, niveau });
      for (const sous of Array.from(li.children).filter((c) => ['UL', 'OL'].includes(c.tagName))) res.push(...itemsDe(sous, niveau + 1));
    } else if (['UL', 'OL'].includes(li.tagName)) res.push(...itemsDe(li, niveau + 1));
  }
  return res;
}

/** Les blocs d'une note riche (HTML nettoyé), prêts à être dessinés : paragraphes et titres en segments mis en forme, listes, séparateurs, médias. */
export function blocsDeNote(html: string | null | undefined): BlocNote[] {
  const res: BlocNote[] = [];
  for (const el of Array.from(racine(nettoyer(html)).children)) {
    const t = el.tagName.toLowerCase();
    if (t === 'p' || t === 'h1' || t === 'h2' || t === 'h3') res.push({ type: t, segments: segmentsDe(el) });
    else if (t === 'blockquote') res.push({ type: 'citation', segments: segmentsDe(el) });
    else if (t === 'ul' || t === 'ol') res.push({ type: 'liste', ordonnee: t === 'ol', items: itemsDe(el, 0) });
    else if (t === 'hr') res.push({ type: 'sep' });
    else if (t === 'figure') {
      const m = el.querySelector('[data-media]');
      if (m) res.push({ type: 'media', id: m.getAttribute('data-media')!, media: m.tagName.toLowerCase() === 'video' ? 'video' : 'image' });
    }
  }
  return res;
}

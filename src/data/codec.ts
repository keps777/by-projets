// Codec de stockage. Les grandes listes du monde (billets, paiements, départs, journal…) sont des tableaux d'objets qui répètent les mêmes clés et les mêmes valeurs :
// on les écrit par colonnes (clés une seule fois), les colonnes de texte très répétitif (identifiants de départ, statuts…) en dictionnaire, et les listes de codes courts
// (sièges, horaires) en une seule chaîne. Sans aucune perte, et le résultat reste du JSON. Cela ramène le monde de démonstration (historique compris) sous les 400 Ko.
// `decoder` accepte aussi l'ancien format (objets complets) : un état injecté à la main ou une ancienne sauvegarde se charge sans conversion.
const ABSENT = '∅';
const LISTE = '⟦';
const ECHAPPE = '⟧';
const SEUIL = 8;
type Objet = Record<string, unknown>;
const estObjet = (v: unknown): v is Objet => typeof v === 'object' && v !== null && !Array.isArray(v);
interface Table { _n: number; _cols: Record<string, unknown> }
const estTable = (v: unknown): v is Table => estObjet(v) && typeof v._n === 'number' && estObjet(v._cols);
const reserve = (s: string) => s === ABSENT || s.startsWith(LISTE) || s.startsWith(ECHAPPE);
const codeCourt = (v: unknown) => typeof v === 'string' && v.length > 0 && v.length <= 8 && !/\s/.test(v) && !reserve(v);
const listeDeCodes = (v: unknown): v is string[] => Array.isArray(v) && v.length > 1 && v.every(codeCourt);

function colonne(valeurs: unknown[]): unknown {
  const v = valeurs.map((x) => (x === undefined ? ABSENT : listeDeCodes(x) ? LISTE + x.join(' ') : typeof x === 'string' && reserve(x) ? ECHAPPE + x : x));
  if (v.every((x) => typeof x === 'string')) {
    const dico = [...new Set(v as string[])];
    if (dico.length * 4 < v.length) { const pos = new Map(dico.map((d, i) => [d, i])); return { $: dico, i: v.map((x) => pos.get(x as string)) }; }
  }
  return v;
}
function valeurs(col: unknown, n: number): unknown[] {
  const v = estObjet(col) && Array.isArray(col.$) ? (col.i as number[]).map((i) => (col.$ as unknown[])[i]) : (col as unknown[]);
  return Array.from({ length: n }, (_, i) => { const x = v[i]; return typeof x === 'string' ? (x.startsWith(LISTE) ? x.slice(1).split(' ') : x.startsWith(ECHAPPE) ? x.slice(1) : x) : x; });
}
function empaqueter(lignes: Objet[]): Table {
  const cles: string[] = [], vues = new Set<string>();
  for (const o of lignes) for (const k of Object.keys(o)) if (!vues.has(k)) { vues.add(k); cles.push(k); }
  return { _n: lignes.length, _cols: Object.fromEntries(cles.map((k) => [k, colonne(lignes.map((o) => o[k]))])) };
}
function depaqueter(t: Table): Objet[] {
  const cols = Object.entries(t._cols).map(([k, c]) => [k, valeurs(c, t._n)] as const);
  return Array.from({ length: t._n }, (_, i) => { const o: Objet = {}; for (const [k, v] of cols) if (v[i] !== ABSENT) o[k] = v[i]; return o; });
}

/** Texte à écrire dans le stockage pour un état (instantané non réactif). */
export function encoder(etat: unknown): string {
  const e = etat as Objet;
  if (!estObjet(e.monde)) return JSON.stringify(etat);
  const monde: Objet = {};
  for (const [k, v] of Object.entries(e.monde)) monde[k] = Array.isArray(v) && v.length >= SEUIL && v.every(estObjet) ? empaqueter(v as Objet[]) : v;
  return JSON.stringify({ ...e, monde });
}
/** État relu depuis le stockage (format compact ou complet). */
export function decoder(brut: string): unknown {
  const e = JSON.parse(brut) as Objet;
  if (!estObjet(e.monde)) return e;
  const monde: Objet = {};
  for (const [k, v] of Object.entries(e.monde)) monde[k] = estTable(v) ? depaqueter(v) : v;
  return { ...e, monde };
}

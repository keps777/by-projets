// Paramètres de recherche : lecture et écriture de l'adresse `/resultats?de=YUL&vers=CDG&jour=2026-12-18&n=1`, validation du formulaire, autocomplétion des aéroports.
// Fonctions pures (aucun accès au magasin) : tout ce qu'il faut est passé en argument.
import type { Aeroport } from '../../domain/types.ts';
import { ajouterJours, fmtMoisAnnee, fmtVoyageurs, jourValide } from './dates.ts';

export type Source = 'neuf' | 'revente' | 'agence' | 'drop';
export const SOURCES: Source[] = ['neuf', 'revente', 'agence', 'drop'];
/** Valeur de `vers` pour « n'importe quelle destination ». */
export const PARTOUT = 'partout';
export const DEPART_PAR_DEFAUT = 'YUL';
export const VOYAGEURS_MAX = 9;
/** Écart des dates flexibles (jours de part et d'autre). */
export const FLEX_JOURS = 3;

export interface Recherche {
  de: string; /** Code d'aéroport, `partout` ou vide (pas encore choisi). */ vers: string; /** Jour précis ; absent = toutes les dates. */ jour?: string; flex: boolean; n: number;
  /** Date de retour : présente = aller-retour. */ retour?: string; sources: Source[]; /** Seulement les billets encore revendables (échéance J-1 non passée). */ revendable: boolean;
}
export const rechercheVide = (de = DEPART_PAR_DEFAUT): Recherche => ({ de, vers: '', flex: false, n: 1, sources: [...SOURCES], revendable: false });

export interface ProblemesAdresse { de?: string; vers?: string; jour?: string; retour?: string }
const code = (s: string | null): string => (s ?? '').trim().toUpperCase();

/** Lit l'adresse de la page de résultats. Les valeurs inconnues sont corrigées quand c'est sans risque (voyageurs, sources) et signalées sinon (départ, destination, dates). */
export function lireParams(recherche: string, codes: string[]): { recherche: Recherche; problemes: ProblemesAdresse } {
  const p = new URLSearchParams(recherche), problemes: ProblemesAdresse = {}, r = rechercheVide();
  const de = code(p.get('de')); if (de) { if (codes.includes(de)) r.de = de; else { r.de = de; problemes.de = `Aéroport de départ inconnu : ${de}.`; } }
  const vers = (p.get('vers') ?? '').trim();
  if (!vers) problemes.vers = 'Aucune destination choisie.';
  else if (vers.toLowerCase() === PARTOUT) r.vers = PARTOUT;
  else if (codes.includes(vers.toUpperCase())) r.vers = vers.toUpperCase();
  else { r.vers = vers.toUpperCase(); problemes.vers = `Destination inconnue : ${vers.toUpperCase()}.`; }
  const jour = p.get('jour'); if (jour) { if (jourValide(jour)) r.jour = jour; else problemes.jour = 'Date non reconnue (format attendu : 2026-12-18).'; }
  const retour = p.get('retour'); if (retour) { if (jourValide(retour)) r.retour = retour; else problemes.retour = 'Date de retour non reconnue.'; }
  const n = Number.parseInt(p.get('n') ?? '1', 10); r.n = Number.isFinite(n) ? Math.min(VOYAGEURS_MAX, Math.max(1, n)) : 1;
  r.flex = p.get('flex') === '1' && !!r.jour;
  const src = p.get('src'); if (src !== null) { const l = src.split(',').filter((s): s is Source => (SOURCES as string[]).includes(s)); r.sources = SOURCES.filter((s) => l.includes(s)); }
  r.revendable = p.get('rev') === '1';
  return { recherche: r, problemes };
}

/** L'adresse de résultats d'une recherche : les trois premiers paramètres comme dans la maquette, puis seulement ce qui s'écarte des valeurs par défaut. */
export function versUrl(r: Recherche): string {
  const p = new URLSearchParams(); p.set('de', r.de); p.set('vers', r.vers);
  if (r.jour) p.set('jour', r.jour);
  p.set('n', String(r.n));
  if (r.flex && r.jour) p.set('flex', '1');
  if (r.retour) p.set('retour', r.retour);
  if (r.sources.length !== SOURCES.length) p.set('src', r.sources.join(','));
  if (r.revendable) p.set('rev', '1');
  return `/resultats?${p.toString()}`;
}
/** Même recherche, pour préremplir le formulaire (« Modifier la recherche »). */
export const versFormulaire = (r: Recherche): string => versUrl(r).replace('/resultats', '/rechercher');

export interface ErreursRecherche { de?: string; vers?: string; jour?: string; retour?: string; sources?: string; n?: string }
/** Valide le formulaire : chaque erreur dit quoi faire. `aujourdhui` : `YYYY-MM-DD`. */
export function validerRecherche(r: Recherche, aeroports: Pick<Aeroport, 'code'>[], aujourdhui: string, allerRetour = !!r.retour): ErreursRecherche {
  const e: ErreursRecherche = {}, codes = aeroports.map((a) => a.code);
  if (!r.de) e.de = 'Choisissez un aéroport de départ.'; else if (!codes.includes(r.de)) e.de = 'Choisissez un aéroport dans la liste.';
  if (!r.vers) e.vers = 'Choisissez une destination, ou « Partout ».'; else if (r.vers !== PARTOUT && !codes.includes(r.vers)) e.vers = 'Choisissez un aéroport dans la liste.';
  else if (r.vers === r.de) e.vers = 'Le départ et l’arrivée sont identiques.';
  if (r.jour && !jourValide(r.jour)) e.jour = 'Date non reconnue.'; else if (r.jour && r.jour < aujourdhui) e.jour = 'Cette date est passée : choisissez un jour à partir d’aujourd’hui.';
  if (allerRetour) {
    if (!r.retour) e.retour = 'Choisissez la date de retour.';
    else if (!jourValide(r.retour)) e.retour = 'Date de retour non reconnue.';
    else if (r.retour < (r.jour ?? aujourdhui)) e.retour = r.jour ? 'Le retour ne peut pas précéder le départ.' : 'Cette date est passée.';
  }
  if (!r.sources.length) e.sources = 'Cochez au moins une source de billets.';
  if (!Number.isInteger(r.n) || r.n < 1 || r.n > VOYAGEURS_MAX) e.n = `Entre 1 et ${VOYAGEURS_MAX} voyageurs.`;
  return e;
}
export const ordreErreurs: (keyof ErreursRecherche)[] = ['de', 'vers', 'jour', 'retour', 'sources', 'n'];

// --- Aéroports : texte saisi, suggestions, résolution ---
/** Minuscules sans accents ni ponctuation : « Montréal (YUL) » → « montrealyul ». */
export const normaliser = (s: string): string => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const libelleAeroport = (a: Pick<Aeroport, 'ville' | 'code'>): string => `${a.ville} (${a.code})`;
export const PARTOUT_LIBELLE = 'Partout';

export interface Suggestion { valeur: string; ville: string; code: string; pays: string }
/** Suggestions pour un texte : code exact d'abord, puis début de code, de ville, de pays, enfin contenu. `partout` ajoute « Partout » en tête quand il correspond. */
export function suggerer(aeroports: Aeroport[], saisie: string, opts: { exclure?: string; partout?: boolean } = {}): Suggestion[] {
  const q = normaliser(saisie), sortie: { s: Suggestion; score: number }[] = [];
  for (const a of aeroports) {
    if (a.code === opts.exclure) continue;
    const c = normaliser(a.code), v = normaliser(a.ville), pa = normaliser(a.pays), lib = normaliser(libelleAeroport(a));
    const score = !q ? 5 : c === q ? 0 : lib === q || v === q ? 0 : c.startsWith(q) ? 1 : v.startsWith(q) ? 2 : pa.startsWith(q) ? 3 : (v + pa + c).includes(q) ? 4 : -1;
    if (score >= 0) sortie.push({ score, s: { valeur: a.code, ville: a.ville, code: a.code, pays: a.pays } });
  }
  sortie.sort((x, y) => x.score - y.score || x.s.ville.localeCompare(y.s.ville, 'fr'));
  const liste = sortie.map((x) => x.s);
  if (opts.partout && (!q || normaliser(PARTOUT_LIBELLE).startsWith(q))) liste.unshift({ valeur: PARTOUT, ville: PARTOUT_LIBELLE, code: '', pays: 'Toutes les destinations' });
  return liste;
}
/** Le texte saisi désigne-t-il exactement un aéroport (code, ville ou « Ville (CODE) ») ? Renvoie sa valeur (`YUL`, `partout`) ou `undefined`. */
export function resoudreSaisie(aeroports: Aeroport[], saisie: string, opts: { partout?: boolean } = {}): string | undefined {
  const q = normaliser(saisie); if (!q) return undefined;
  if (opts.partout && q === normaliser(PARTOUT_LIBELLE)) return PARTOUT;
  return aeroports.find((a) => normaliser(a.code) === q || normaliser(a.ville) === q || normaliser(libelleAeroport(a)) === q)?.code;
}
/** Texte affiché dans le champ pour une valeur (`CDG` → « Paris (CDG) », `partout` → « Partout »). */
export function texteDe(aeroports: Aeroport[], valeur: string): string {
  if (valeur === PARTOUT) return PARTOUT_LIBELLE;
  const a = aeroports.find((x) => x.code === valeur); return a ? libelleAeroport(a) : '';
}
/** Grand code à droite du champ (maquette : « YUL »). « Partout » : trois points. */
export const grosCode = (valeur: string): string => (valeur === PARTOUT ? '···' : valeur);

// --- Recherches récentes ---
export interface Recente { de: string; vers: string; jour?: string; flex: boolean; n: number }
export const RECENTES_MAX = 5;
export const memeRecherche = (a: Recente, b: Recente): boolean => a.de === b.de && a.vers === b.vers && a.jour === b.jour && a.flex === b.flex && a.n === b.n;
export const enRecente = (r: Recherche): Recente => ({ de: r.de, vers: r.vers, ...(r.jour ? { jour: r.jour } : {}), flex: r.flex && !!r.jour, n: r.n });
/** Ajoute en tête, sans doublon, `RECENTES_MAX` au plus. */
export const ajouterRecente = (liste: Recente[], r: Recente): Recente[] => [r, ...liste.filter((x) => !memeRecherche(x, r))].slice(0, RECENTES_MAX);
export interface LigneRecente { code: string; titre: string; sous: string; url: string }
/** Une ligne de « Recherches récentes » : « PUJ · Montréal → Punta Cana · févr. 2027 · 2 voyageurs ». */
export function ligneRecente(r: Recente, aeroports: Aeroport[]): LigneRecente {
  const ville = (c: string) => (c === PARTOUT ? PARTOUT_LIBELLE : aeroports.find((a) => a.code === c)?.ville ?? c);
  const quand = r.jour ? fmtMoisAnnee(r.jour) : 'Toutes les dates';
  return { code: grosCode(r.vers), titre: `${ville(r.de)} → ${ville(r.vers)}`, sous: [quand, fmtVoyageurs(r.n), r.flex ? `±${FLEX_JOURS} jours` : ''].filter(Boolean).join(' · '),
    url: versUrl({ ...rechercheVide(r.de), vers: r.vers, jour: r.jour, flex: r.flex, n: r.n }) };
}
/** Fenêtre de dates d'une recherche : [début, fin] inclus, ou `undefined` si toutes les dates. */
export function fenetre(r: Pick<Recherche, 'jour' | 'flex'>): [string, string] | undefined {
  if (!r.jour) return undefined; return r.flex ? [ajouterJours(r.jour, -FLEX_JOURS), ajouterJours(r.jour, FLEX_JOURS)] : [r.jour, r.jour];
}

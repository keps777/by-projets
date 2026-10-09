// Lecture d'un historique de rapports WhatsApp collés en texte (« Report · September 8, 2026 », « CR · 6 août 2026 ») : un rapport par jour,
// les valeurs de chaque point, les passages de la Bible et les livres de CL. Fonctions pures, sans dépendance : sert à importer
// l'historique dans les saisies et les rapports envoyés (voir docs/journal.md).
import { localVersUtc } from '../../functions/_shared/core/dates.ts';

export interface Duree { secondes: number; approx: boolean }

/** Un livre tel qu'il figure dans un rapport : « Le chemin de la vie (ZTF) : 124/124 pages (+124 today) ✅ ». */
export interface LivreLu { titre: string; auteur: string; cumul: number; total: number; plus: number | null; termine: boolean }

export interface PointLu {
  /** Code normalisé : DDEWG, PA, BR, CL, PWO ; sinon le code tel qu'écrit (MW, Soul Winning…). */
  code: string;
  brut: string;
  fois?: number;
  attenduFois?: number;
  temps?: Duree;
  chapitres?: number;
  attenduChapitres?: number;
  passages?: string;
  pages?: number;
  livres: LivreLu[];
}

export interface RapportLu { jour: string; envoyeA: string; points: PointLu[] }

const MOIS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12
};
const sansAccents = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Codes écrits dans les rapports (anglais ou ancien français) → codes des points de l'app. */
const CODES: Record<string, string> = { DDEWG: 'DDEWG', RDQD: 'DDEWG', PA: 'PA', PS: 'PA', BR: 'BR', LB: 'BR', CL: 'CL', LLC: 'CL', PWO: 'PWO', PAA: 'PWO' };

const pad = (n: number) => String(n).padStart(2, '0');

/** « September 8, 2026 » ou « 6 août 2026 » → « 2026-09-08 », ou null. */
export function lireDate(t: string): string | null {
  const en = /^([A-Za-zÀ-ÿ]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(t.trim());
  const fr = /^(\d{1,2})(?:er)?\s+([A-Za-zÀ-ÿ]+)\.?\s+(\d{4})$/.exec(t.trim());
  const [m, j, a] = en ? [en[1], en[2], en[3]] : fr ? [fr[2], fr[1], fr[3]] : [];
  const mois = m ? MOIS[sansAccents(m)] : undefined;
  return mois && j && a ? `${a}-${pad(mois)}-${pad(+j)}` : null;
}

/** « 1h33 », « ~0h45 » → secondes, approximatif ou non. */
export function lireDuree(t: string): Duree | undefined {
  const m = /(~)?\s*(\d+)\s*h\s*(\d{2})/.exec(t);
  return m ? { secondes: (+m[2]) * 3600 + (+m[3]) * 60, approx: !!m[1] } : undefined;
}

const ENTETE = /^\[(\d{1,2})\/(\d{1,2})\/(\d{2}),\s*(\d{1,2}):(\d{2}):(\d{2})[\s ]*(AM|PM)\]\s*[^:\n]+?:\s?(.*)$/;

function horodatage(m: RegExpExecArray, fuseau: string): string {
  const [, mo, j, a, h, mi, s, ampm] = m;
  let heure = (+h) % 12 + (ampm === 'PM' ? 12 : 0);
  const jour = `20${a}-${pad(+mo)}-${pad(+j)}`;
  return new Date(localVersUtc(jour, heure * 60 + (+mi), fuseau) + (+s) * 1000).toISOString();
}

function ligneDePoint(brut: string): { code: string; nom: string; reste: string } | null {
  const m = /^\s*\d+\.\s*\*?([^*:]+?)\*?\s*:\s*(.*)$/.exec(brut);
  if (!m) return null;
  const nom = m[1].trim();
  return { code: CODES[nom.toUpperCase()] ?? nom, nom, reste: m[2].trim() };
}

function lireLivre(ligne: string): LivreLu | null {
  const m = /^\s*[•·-]\s*_?(.+?)_?\s*\(([^()]+)\)\s*:\s*(\d+)\s*\/\s*(\d+)\s*(?:pages|p)\b(.*)$/.exec(ligne);
  if (!m) return null;
  const queue = m[5];
  const plus = /\(\+\s*(\d+)/.exec(queue);
  return { titre: m[1].replace(/^_+|_+$/g, '').trim(), auteur: m[2].trim(), cumul: +m[3], total: +m[4], plus: plus ? +plus[1] : null, termine: queue.includes('✅') };
}

function remplirPoint(p: PointLu, reste: string): void {
  const sansDetails = reste.replace(/\([^)]*\)/g, ' ');
  switch (p.code) {
    case 'DDEWG': {
      const f = /(\d+)\s*\/\s*(\d+)/.exec(sansDetails);
      if (f) { p.fois = +f[1]; p.attenduFois = +f[2]; }
      p.temps = lireDuree(sansDetails.replace(/(\d+)\s*\/\s*(\d+)/, '')) ?? { secondes: 0, approx: false };
      break;
    }
    case 'BR': {
      const c = /(\d+)\s*\/\s*(\d+)\s*(?:ch|chap)/i.exec(sansDetails);
      if (c) { p.chapitres = +c[1]; p.attenduChapitres = +c[2]; }
      p.temps = lireDuree(sansDetails.replace(/(\d+)\s*\/\s*(\d+)\s*(?:ch|chap)\w*/i, '')) ?? { secondes: 0, approx: false };
      break;
    }
    case 'CL': {
      const pg = /(\d+)\s*p\b/.exec(sansDetails);
      if (pg) p.pages = +pg[1];
      p.temps = lireDuree(sansDetails) ?? { secondes: 0, approx: false };
      break;
    }
    case 'PA': case 'PWO':
      p.temps = lireDuree(sansDetails) ?? { secondes: 0, approx: false };
      break;
    default: break;
  }
}

/** Lit tous les rapports du texte ; les récapitulatifs (mois, semaine) et les points inconnus de l'app sont ignorés plus tard par l'appelant. */
export function analyserHistorique(texte: string, fuseau = 'America/Toronto'): RapportLu[] {
  const lignes = texte.replace(/\r/g, '').split('\n');
  const rapports = new Map<string, RapportLu>();
  let courant: RapportLu | null = null;
  let point: PointLu | null = null;

  const ouvrir = (envoyeA: string, ligne: string): void => {
    const titre = /^\*?\s*(?:Report|CR|Rapport)\s*·\s*(.+?)\s*·/.exec(ligne.trim());
    const jour = titre ? lireDate(titre[1]) : null;
    courant = jour ? { jour, envoyeA, points: [] } : null;
    point = null;
    if (courant) rapports.set(courant.jour, courant);
  };

  for (const brut of lignes) {
    const e = ENTETE.exec(brut);
    if (e) { ouvrir(horodatage(e, fuseau), e[8]); continue; }
    if (!courant) continue;
    const p = ligneDePoint(brut);
    if (p) {
      point = { code: p.code, brut: brut.trim(), livres: [] };
      remplirPoint(point, p.reste);
      courant.points.push(point);
      continue;
    }
    if (!point) continue;
    const puce = /^\s*[•·]\s*(.*)$/.exec(brut);
    if (!puce) continue;
    if (point.code === 'CL') {
      const l = lireLivre(brut);
      if (l) point.livres.push(l);
    } else if (point.code === 'BR') {
      point.passages = point.passages ? `${point.passages} · ${puce[1].trim()}` : puce[1].trim();
    }
  }
  return [...rapports.values()].sort((a, b) => (a.jour < b.jour ? -1 : 1));
}

export interface LivreSuiviLu { titre: string; auteur: string; total: number; depart: number; premierJour: string; dernierJour: string; termine: boolean }
export interface LectureLue { jour: string; titre: string; pages: number }

const cleTitre = (t: string) => sansAccents(t).replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Les livres de CL à travers les rapports : le cumul d'un jour moins celui du rapport précédent donne les pages lues ce jour-là ;
 * à la première apparition, « (+N) » dit combien ont été lues ce jour-là (le reste est « déjà lu », le départ).
 */
export function deduireLivres(rapports: RapportLu[]): { livres: LivreSuiviLu[]; lectures: LectureLue[] } {
  const livres = new Map<string, LivreSuiviLu & { cumul: number }>();
  const lectures: LectureLue[] = [];
  for (const r of rapports) {
    for (const l of r.points.filter((p) => p.code === 'CL').flatMap((p) => p.livres)) {
      const cle = cleTitre(l.titre);
      const connu = livres.get(cle);
      if (!connu) {
        const lues = Math.min(l.plus ?? 0, l.cumul);
        livres.set(cle, { titre: l.titre, auteur: l.auteur, total: l.total, depart: l.cumul - lues, premierJour: r.jour, dernierJour: r.jour, termine: l.termine, cumul: l.cumul });
        if (lues > 0) lectures.push({ jour: r.jour, titre: l.titre, pages: lues });
        continue;
      }
      const delta = l.cumul - connu.cumul;
      if (delta > 0) lectures.push({ jour: r.jour, titre: connu.titre, pages: delta });
      connu.cumul = Math.max(connu.cumul, l.cumul);
      connu.dernierJour = r.jour;
      connu.total = l.total;
      connu.termine = l.termine || l.cumul >= l.total;
    }
  }
  return { livres: [...livres.values()].map(({ cumul: _c, ...l }) => l), lectures };
}

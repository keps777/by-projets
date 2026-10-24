// « Dis où tu vas » : comprend une phrase libre (français, anglais, pidgin) comme « Je veux aller à Douala demain matin ».
// Fonction pure : la date de référence est passée en paramètre (jamais d'horloge ici).
import { ajouterJours, ecartJours, enDate, jourDe, jourSemaineCourt, type Jour } from './dates.ts';

export type Periode = 'aube' | 'matin' | 'midi' | 'apres-midi' | 'soir' | 'nuit';
/** Fenêtre horaire d'une période de la journée. `nuit` enjambe minuit (21:00 → 04:00). */
export const FENETRES: Record<Periode, [string, string]> = {
  aube: ['04:00', '08:00'], matin: ['06:00', '12:00'], midi: ['11:00', '14:00'], 'apres-midi': ['12:00', '18:00'], soir: ['17:00', '24:00'], nuit: ['21:00', '04:00']
};
export const NOM_PERIODE: Record<Periode, string> = { aube: 'à l’aube', matin: 'le matin', midi: 'à midi', 'apres-midi': 'l’après-midi', soir: 'le soir', nuit: 'la nuit' };
export const dansFenetre = (heure: string, [a, b]: [string, string]) => (a <= b ? heure >= a && heure < b : heure >= a || heure < b);

export interface Comprehension {
  destination: string | null; origine: string | null; jour: Jour | null; periode: Periode | null;
  /** Heure précise dite (HH:MM). */ heure: string | null; fenetre: [string, string] | null;
}
export interface Ville { nom: string; alias: string[] }
export const VILLES: Ville[] = [
  { nom: 'Yaoundé', alias: ['yaounde', 'yde', 'yaunde', 'younde'] }, { nom: 'Douala', alias: ['douala', 'dla', 'duala'] }, { nom: 'Bafoussam', alias: ['bafoussam', 'foussam'] },
  { nom: 'Bamenda', alias: ['bamenda', 'bda'] }, { nom: 'Kribi', alias: ['kribi'] }, { nom: 'Bertoua', alias: ['bertoua'] }, { nom: 'Ngaoundéré', alias: ['ngaoundere', 'n gaoundere', 'ngaounde'] }
];

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, ' ').replace(/[^a-z0-9: ]/g, ' ').replace(/\s+/g, ' ').trim();
const SEMAINE: [string[], number][] = [[['dimanche', 'sunday'], 0], [['lundi', 'monday'], 1], [['mardi', 'tuesday'], 2], [['mercredi', 'wednesday'], 3], [['jeudi', 'thursday'], 4], [['vendredi', 'friday'], 5], [['samedi', 'saturday'], 6]];
const MOIS: string[][] = [['janvier', 'january', 'jan'], ['fevrier', 'february', 'feb', 'fev'], ['mars', 'march', 'mar'], ['avril', 'april', 'apr', 'avr'], ['mai', 'may'], ['juin', 'june'], ['juillet', 'july', 'jul'], ['aout', 'august', 'aug'], ['septembre', 'september', 'sept', 'sep'], ['octobre', 'october', 'oct'], ['novembre', 'november', 'nov'], ['decembre', 'december', 'dec']];
const A_ORIGINE = /(?:^| )(de|du|depuis|from|partir de|depart de)$/;
const A_DESTINATION = /(?:^| )(a|au|vers|pour|to|go|aller|chez|direction|jusqua|jusque|en)$/;
const pad = (n: number) => String(n).padStart(2, '0');
const mot = (t: string, m: string) => new RegExp(`(?:^| )${m}(?: |$)`).test(t);

function trouverVilles(t: string, villes: Ville[]) {
  const trouves: { nom: string; pos: number }[] = [];
  for (const v of villes) for (const a of [norm(v.nom), ...v.alias]) {
    const m = new RegExp(`(?:^| )${a}(?= |$)`).exec(t);
    if (m) { const pos = m.index + (m[0].startsWith(' ') ? 1 : 0); if (!trouves.some((x) => x.nom === v.nom)) trouves.push({ nom: v.nom, pos }); break; }
  }
  return trouves.sort((a, b) => a.pos - b.pos);
}
function trouverJour(t: string, ref: Jour): { jour: Jour | null; periode: Periode | null } {
  if (/(?:^| )apres demain(?: |$)|day after tomorrow/.test(t)) return { jour: ajouterJours(ref, 2), periode: null };
  if (/(?:^| )(demain|tomorrow|tomoro|tumoro)(?: |$)/.test(t)) return { jour: ajouterJours(ref, 1), periode: null };
  if (/ce soir|tonight/.test(t)) return { jour: ref, periode: 'soir' };
  if (/cette nuit/.test(t)) return { jour: ref, periode: 'nuit' };
  if (/aujourd hui|today|maintenant|tout de suite|right now/.test(t)) return { jour: ref, periode: null };
  const dans = /(?:dans|in) (\d{1,2}) (?:jours?|days?)/.exec(t);
  if (dans && Number(dans[1]) >= 0) return { jour: ajouterJours(ref, Number(dans[1])), periode: null };
  const dt = /(?:^| )(\d{1,2})(?:er|st|nd|rd|th)? (?:de )?([a-z]{3,9})(?: |$)/.exec(t);
  if (dt) {
    const mois = MOIS.findIndex((alias) => alias.includes(dt[2])), q = Number(dt[1]);
    if (mois >= 0 && q >= 1 && q <= 31) {
      const base = enDate(ref); let annee = base.getFullYear(); let j = jourDe(new Date(annee, mois, q, 12));
      if (j < ref) j = jourDe(new Date(++annee, mois, q, 12));
      if (enDate(j).getMonth() === mois) return { jour: j, periode: null };
    }
  }
  if (/week end|weekend/.test(t)) return { jour: ajouterJours(ref, ((6 - enDate(ref).getDay() + 7) % 7) || 7), periode: null };
  for (const [noms, num] of SEMAINE) if (noms.some((n) => mot(t, n))) return { jour: ajouterJours(ref, ((num - enDate(ref).getDay() + 7) % 7) || 7), periode: null };
  return { jour: null, periode: null };
}
function trouverPeriode(t: string): Periode | null {
  if (/tres tot|early|aube|petit matin/.test(t)) return 'aube';
  if (/apres midi|afternoon|aprem/.test(t)) return 'apres-midi';
  if (/(?:^| )(matin|matinee|morning)(?: |$)/.test(t)) return 'matin';
  if (/(?:^| )(midi|noon)(?: |$)/.test(t)) return 'midi';
  if (/(?:^| )(soir|soiree|evening)(?: |$)/.test(t)) return 'soir';
  if (/(?:^| )(nuit|night)(?: |$)/.test(t)) return 'nuit';
  return null;
}
function trouverHeure(t: string, periode: Periode | null): string | null {
  const ap = /(?:^| )(\d{1,2})(?::(\d{2}))? ?(am|pm)(?: |$)/.exec(t);
  if (ap) {
    let h = Number(ap[1]); if (h < 1 || h > 12) return null;
    if (ap[3] === 'pm' && h < 12) h += 12; if (ap[3] === 'am' && h === 12) h = 0;
    return `${pad(h)}:${ap[2] ?? '00'}`;
  }
  const m = /(?:^| )(\d{1,2}) ?(?:h|heures?|:) ?(\d{2})?(?: |$)/.exec(t);
  if (!m) return null;
  let h = Number(m[1]); const mi = m[2] ? Number(m[2]) : 0;
  if (h > 23 || mi > 59) return null;
  if ((periode === 'soir' || periode === 'apres-midi') && h < 12 && h > 0) h += 12;
  return `${pad(h)}:${pad(mi)}`;
}
const horsDe = (h: string, delta: number) => { const m = Math.min(1439, Math.max(0, Number(h.slice(0, 2)) * 60 + Number(h.slice(3)) + delta)); return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };

/** Analyse une phrase. `ref` = jour d'aujourd'hui. Les villes inconnues sont ignorées (la destination reste `null`). */
export function analyser(texte: string, ref: Jour, villes: Ville[] = VILLES): Comprehension {
  const t = norm(texte), vide: Comprehension = { destination: null, origine: null, jour: null, periode: null, heure: null, fenetre: null };
  if (!t) return vide;
  const mentions = trouverVilles(t, villes).map((v) => {
    const avant = t.slice(0, v.pos).trim();
    return { ...v, role: A_ORIGINE.test(avant) ? 'o' as const : A_DESTINATION.test(avant) ? 'd' as const : '?' as const };
  });
  let origine = mentions.find((m) => m.role === 'o')?.nom ?? null, destination = mentions.find((m) => m.role === 'd')?.nom ?? null;
  const flous = mentions.filter((m) => m.role === '?').map((m) => m.nom);
  if (!destination && flous.length) {
    if (!origine && flous.length >= 2) { origine = flous[0]; destination = flous[1]; } else destination = flous[0];
  } else if (!origine && flous.length && mentions.filter((m) => m.role !== '?').length && destination) origine = flous[0];
  if (origine && origine === destination) origine = null;
  const j = trouverJour(t, ref), periode = j.periode ?? trouverPeriode(t), heure = trouverHeure(t, periode);
  const fenetre: [string, string] | null = heure ? [horsDe(heure, -60), horsDe(heure, 60)] : periode ? FENETRES[periode] : null;
  return { destination, origine, jour: j.jour, periode, heure, fenetre };
}
/** « Demain », « Après-demain », « Aujourd’hui » ou « mar. 3 nov ». */
export function libelleJour(jour: Jour, ref: Jour): string {
  const e = ecartJours(ref, jour);
  return e === 0 ? 'Aujourd’hui' : e === 1 ? 'Demain' : e === 2 ? 'Après-demain' : jourSemaineCourt(jour);
}

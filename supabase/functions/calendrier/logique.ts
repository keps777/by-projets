// Calendrier iCalendar (.ics) des blocs à venir, auquel l'iPhone s'abonne : chaque bloc devient un événement avec ses alertes
// (les rappels de la tâche et, pour une alarme, ses insistances). Aucune API Deno ici.
import { rappelsPlanifies, type RappelPlanifie } from '../_shared/core/index.ts';

export interface EvenementCalendrier {
  uid: string;
  debut: string;
  fin: string;
  titre: string;
  /** Rubrique et projet, pour la description. */
  detail: string | null;
  /** Alertes : seulement pour un bloc encore prévu. */
  alertes: RappelPlanifie[];
}

export interface TacheCalendrier { titre: string; rappel_min: number | null; rappels_avant_min: number[] | null; alarme: boolean | null }

/** Alertes d'un bloc : vides si le bloc n'est plus « prévu ». */
export function alertesDuBloc(etat: string, t: Pick<TacheCalendrier, 'rappel_min' | 'rappels_avant_min' | 'alarme'>): RappelPlanifie[] {
  return etat === 'prevue' ? rappelsPlanifies(t) : [];
}

const pad = (n: number) => String(n).padStart(2, '0');
/** « 20261007T180000Z » */
export function dateIcs(iso: string): string {
  const d = new Date(iso);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

export const echapper = (t: string) => t.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Lignes de plus de 75 octets coupées (RFC 5545), la suite commençant par une espace. */
export function plier(ligne: string): string {
  const enc = new TextEncoder();
  if (enc.encode(ligne).length <= 75) return ligne;
  const morceaux: string[] = [];
  let courant = '', taille = 0, limite = 75;
  for (const c of ligne) {
    const n = enc.encode(c).length;
    if (taille + n > limite) { morceaux.push(courant); courant = ''; taille = 0; limite = 74; }
    courant += c; taille += n;
  }
  morceaux.push(courant);
  return morceaux.join('\r\n ');
}

function alerte(a: RappelPlanifie, titre: string): string[] {
  const declencheur = a.delai >= 0 ? `TRIGGER:-PT${a.delai}M` : `TRIGGER;RELATED=START:PT${-a.delai}M`;
  const texte = a.rang ? `Alarme ${a.rang}/5 : ${titre}` : a.delai === 0 ? `À l’heure : ${titre}` : `Bientôt : ${titre}`;
  return ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${echapper(texte)}`, declencheur, 'END:VALARM'];
}

export function construireCalendrier(evenements: EvenementCalendrier[], maintenant: Date, nom = 'Luther Life'): string {
  const stamp = dateIcs(maintenant.toISOString());
  const lignes = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Luther Life//Calendrier//FR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${echapper(nom)}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'
  ];
  for (const e of evenements) {
    lignes.push('BEGIN:VEVENT', `UID:${e.uid}@luther-life`, `DTSTAMP:${stamp}`, `DTSTART:${dateIcs(e.debut)}`, `DTEND:${dateIcs(e.fin)}`, `SUMMARY:${echapper(e.titre)}`);
    if (e.detail) lignes.push(`DESCRIPTION:${echapper(e.detail)}`);
    for (const a of e.alertes) lignes.push(...alerte(a, e.titre));
    lignes.push('END:VEVENT');
  }
  lignes.push('END:VCALENDAR');
  return lignes.map(plier).join('\r\n') + '\r\n';
}

/** Un jeton valable : au moins 32 caractères sûrs (lettres, chiffres, tiret, souligné). */
export const jetonValide = (j: string | null): j is string => !!j && /^[A-Za-z0-9_-]{32,128}$/.test(j);

export const JOURS_AVANT = 1;
export const JOURS_APRES = 60;

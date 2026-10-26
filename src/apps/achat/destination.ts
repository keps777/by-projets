// La destination d'un vol : nom de l'aéroport, préposition du pays, décalage horaire avec Montréal et heure locale là-bas. Fonctions pures.
const NOMS: Record<string, string> = {
  YUL: 'Montréal-Trudeau', CDG: 'Paris-Charles de Gaulle', LIS: 'Lisbonne-Humberto Delgado', FCO: 'Rome-Fiumicino', KEF: 'Reykjavik-Keflavik', PUJ: 'Punta Cana', HAV: 'La Havane-José Martí',
  BOG: 'Bogotá-El Dorado', MEX: 'Mexico-Benito Juárez', LAX: 'Los Angeles', PPT: 'Papeete-Faa’a', NRT: 'Tokyo-Narita'
};
export const nomAeroport = (code: string, ville: string): string => NOMS[code] ?? ville;
const PAYS_A: Record<string, string> = {
  France: 'en France', Portugal: 'au Portugal', Italie: 'en Italie', Islande: 'en Islande', 'République dominicaine': 'en République dominicaine', Cuba: 'à Cuba', Colombie: 'en Colombie', Mexique: 'au Mexique',
  'États-Unis': 'aux États-Unis', 'Polynésie française': 'en Polynésie française', Japon: 'au Japon', Canada: 'au Canada'
};
/** « en France », « au Portugal », « à Cuba » ; une formule neutre pour un pays inconnu. */
export const paysAvecPreposition = (pays: string): string => PAYS_A[pays] ?? 'dans le pays de destination';
const ZONES: Record<string, string> = {
  YUL: 'America/Toronto', CDG: 'Europe/Paris', LIS: 'Europe/Lisbon', FCO: 'Europe/Rome', KEF: 'Atlantic/Reykjavik', PUJ: 'America/Santo_Domingo', HAV: 'America/Havana', BOG: 'America/Bogota',
  MEX: 'America/Mexico_City', LAX: 'America/Los_Angeles', PPT: 'Pacific/Tahiti', NRT: 'Asia/Tokyo'
};
/** Décalages d'hiver par rapport à Montréal (minutes), si l'environnement ne connaît pas les fuseaux (repli). */
const HIVER: Record<string, number> = { CDG: 360, LIS: 300, FCO: 360, KEF: 300, PUJ: 60, HAV: 0, BOG: 0, MEX: -60, LAX: -180, PPT: -300, NRT: 840 };

function decalageZone(zone: string, instantUtc: number): number {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
  const p = Object.fromEntries(f.formatToParts(new Date(instantUtc)).map((x) => [x.type, Number(x.value)]));
  return (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - instantUtc) / 60_000;
}
/** Décalage horaire en minutes de `code` par rapport à Montréal à la date `jour` (YYYY-MM-DD) : +360 pour Paris en décembre. */
export function decalageMinutes(code: string, jour: string): number {
  const zone = ZONES[code]; if (!zone || code === 'YUL') return 0;
  try { const t = Date.parse(`${jour}T12:00:00Z`); return decalageZone(zone, t) - decalageZone(ZONES.YUL, t); } catch { return HIVER[code] ?? 0; }
}
/** « +6 h », « −3 h », « 0 h », « +9 h 30 ». */
export function libelleDecalage(min: number): string {
  if (min === 0) return '0 h'; const a = Math.abs(min), h = Math.floor(a / 60), m = a % 60;
  return `${min > 0 ? '+' : '−'}${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}`;
}
/** Phrase d'avance ou de retard : « Paris a 6 h d'avance sur Montréal en décembre. » */
export function phraseDecalage(ville: string, min: number, mois: string): string {
  if (min === 0) return `${ville} est à la même heure que Montréal en ${mois}.`;
  const a = Math.abs(min), h = Math.floor(a / 60), m = a % 60, duree = `${h} h${m ? ` ${String(m).padStart(2, '0')}` : ''}`;
  return `${ville} a ${duree} ${min > 0 ? 'd’avance' : 'de retard'} sur Montréal en ${mois}.`;
}
const p2 = (n: number) => String(n).padStart(2, '0');
/** Heure et jour « ailleurs » : on lit l'heure murale de `ms` (Montréal dans la démo) et on y ajoute le décalage. Renvoie `{ hms, hm, ms }` où `ms` est l'instant mural décalé (à lire en UTC). */
export function heureAilleurs(ms: number, decalageMin: number): { hms: string; hm: string; jour: Date } {
  const d = new Date(ms), mural = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()) + decalageMin * 60_000, a = new Date(mural);
  return { hms: `${p2(a.getUTCHours())}:${p2(a.getUTCMinutes())}:${p2(a.getUTCSeconds())}`, hm: `${p2(a.getUTCHours())}:${p2(a.getUTCMinutes())}`, jour: a };
}
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'], MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
/** « mar. 13 oct. » pour l'objet renvoyé par `heureAilleurs` (champs UTC). */
export const jourAilleurs = (a: Date): string => `${JOURS[a.getUTCDay()]} ${a.getUTCDate()} ${MOIS[a.getUTCMonth()]}`;
/** L'heure d'arrivée « 07:10 » ramenée à Montréal : « 01:10 ». */
export function heureArriveeAMontreal(hhmm: string, decalageMin: number): string {
  const [h, m] = hhmm.split(':').map(Number), t = (((h * 60 + m - decalageMin) % 1440) + 1440) % 1440; return `${p2(Math.floor(t / 60))}:${p2(t % 60)}`;
}

// Points relais et livraison moto : règles pures (commissions, téléphone camerounais, codes colis, horaires, géographie simulée de Douala).
// Aucune dépendance au monde : tout est testable en isolation (voir relais.test.ts).

export const COMMISSION_RELAIS = 300;   // F par colis remis au destinataire
export const GAIN_COURSE = 1000;        // F par course de livraison moto (= supplément moto payé par l'expéditeur)
export const JOURS_OUVRES_MOIS = 26;
export const DELAI_RETRAIT_JOURS = 7;   // au-delà, le colis retourne à la gare
export const MAX_COURSES_ACTIVES = 3;

export const gainMensuelRelais = (colisParJour: number) => Math.max(0, Math.round(colisParJour)) * COMMISSION_RELAIS * JOURS_OUVRES_MOIS;
export const gainMensuelLivreur = (coursesParJour: number) => Math.max(0, Math.round(coursesParJour)) * GAIN_COURSE * JOURS_OUVRES_MOIS;

// ------------------------------------------------------------------ téléphone et codes
/** Mobile camerounais : 9 chiffres commençant par 6 (62 Camtel, 65 à 69 MTN/Orange/Nexttel). Accepte +237, 237, 00237, espaces et tirets. */
export function normaliserTel(saisie: string): string | null {
  const brut = saisie.replace(/[\s.\-()]/g, '');
  const m = brut.match(/^(?:\+|00)?(?:237)?(\d{9})$/);
  return m && /^6[256789]\d{7}$/.test(m[1]) ? m[1] : null;
}
/** « 677102233 » → « 6 77 10 22 33 » */
export const formaterTel = (tel: string) => (/^\d{9}$/.test(tel) ? `${tel[0]} ${tel.slice(1, 3)} ${tel.slice(3, 5)} ${tel.slice(5, 7)} ${tel.slice(7, 9)}` : tel);
/** Code colis tel que saisi ou scanné → forme canonique « AM-C-9Q2 » ; null si illisible. Accepte « am c 9q2 », « AMC9Q2 » ou les 3 derniers caractères. */
export function normaliserCodeColis(saisie: string): string | null {
  let s = saisie.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.startsWith('AMC')) s = s.slice(3);
  return /^[0-9A-Z]{3}$/.test(s) ? `AM-C-${s}` : null;
}
export const codeRetraitValide = (s: string) => /^\d{4}$/.test(s);
/** « 4819 » → « 4 8 1 9 » (lisible à voix haute). */
export const espacerCode = (c: string) => c.split('').join(' ');
export function erreurDestinataire(nom: string, tel: string): { nom?: string; tel?: string } {
  const e: { nom?: string; tel?: string } = {};
  const n = nom.trim();
  if (n.length < 2) e.nom = 'Écris le nom du destinataire';
  else if (n.length > 60) e.nom = 'Nom trop long';
  if (!tel.trim()) e.tel = 'Écris son numéro';
  else if (!normaliserTel(tel)) e.tel = 'Numéro camerounais invalide (ex. 6 77 10 22 33)';
  return e;
}

// ------------------------------------------------------------------ géographie simulée (Douala, autour de la gare d'Akwa)
export interface Point { lat: number; lon: number }
export const GARE_AKWA: Point = { lat: 4.0511, lon: 9.6967 };
/** Position à partir d'un décalage en mètres (est, nord) de la gare. */
export const pointDepuisGare = (est: number, nord: number): Point => ({ lat: GARE_AKWA.lat + nord / 111_320, lon: GARE_AKWA.lon + est / (111_320 * Math.cos((GARE_AKWA.lat * Math.PI) / 180)) });
export function distanceM(a: Point, b: Point): number {
  const R = 6_371_000, rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
/** 298 → « 300 m » (au 50 m près) ; 1 402 → « 1,4 km » (au 100 m près). */
export function formaterDistance(m: number): string {
  if (m < 1000) return `${Math.max(50, Math.round(m / 50) * 50)} m`;
  return `${(Math.round(m / 100) / 10).toLocaleString('fr-FR', { minimumFractionDigits: 1 })} km`;
}
/** Position d'un pin sur la carte (x en % de la largeur, y en px sur 260 px de haut) à partir du décalage (est, nord) en mètres. */
export const positionCarte = (est: number, nord: number) => ({ x: Math.min(92, Math.max(8, 7 + (est / 2200) * 80)), y: Math.min(220, Math.max(52, 228 - (nord / 1400) * 170)) });

// ------------------------------------------------------------------ boutiques (points relais)
export type TypeBoutique = 'Boutique' | 'Pharmacie' | 'Station' | 'Librairie';
export const TYPES_BOUTIQUE: TypeBoutique[] = ['Boutique', 'Pharmacie', 'Station', 'Librairie'];
export interface Boutique {
  nom: string; type: TypeBoutique; adresse: string; /** Heures pleines (7 = 7 h). */ ouverture: number; fermeture: number; h24: boolean;
  /** Jours ouverts, 0 = dimanche. */ jours: number[]; /** Décalage en mètres par rapport à la gare d'Akwa (position simulée). */ est: number; nord: number;
}
export const distanceBoutique = (b: Boutique) => distanceM(GARE_AKWA, pointDepuisGare(b.est, b.nord));
const NOMS_JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
export function libelleJours(jours: number[]): string {
  const j = [...new Set(jours)].sort();
  if (j.length === 7) return 'tous les jours';
  if (j.join() === '1,2,3,4,5,6') return 'lundi à samedi';
  if (j.join() === '1,2,3,4,5') return 'lundi à vendredi';
  return j.map((d) => NOMS_JOURS[d]).join(' ');
}
export const libelleHoraires = (b: Boutique) => (b.h24 ? '24 h/24' : `${b.ouverture} h – ${b.fermeture} h · ${libelleJours(b.jours)}`);
export type ToneOuverture = 'ok' | 'ac' | 'wa' | 'er';
export interface EtatOuverture { ouvert: boolean; libelle: string; ton: ToneOuverture }
/** Ouvert à l'instant `maintenant` ? « ferme 18 h » prévient dans les 3 dernières heures. */
export function etatOuverture(b: Boutique, maintenant: Date): EtatOuverture {
  if (b.h24) return { ouvert: true, libelle: '24 h', ton: 'ac' };
  const h = maintenant.getHours() + maintenant.getMinutes() / 60;
  if (!b.jours.includes(maintenant.getDay())) return { ouvert: false, libelle: 'fermé aujourd’hui', ton: 'er' };
  if (h < b.ouverture) return { ouvert: false, libelle: `ouvre ${b.ouverture} h`, ton: 'er' };
  if (h >= b.fermeture) return { ouvert: false, libelle: 'fermé', ton: 'er' };
  return b.fermeture - h <= 3 ? { ouvert: true, libelle: `ferme ${b.fermeture} h`, ton: 'wa' } : { ouvert: true, libelle: 'ouvert', ton: 'ok' };
}
export function erreursBoutique(b: { nom: string; adresse: string; ouverture: number; fermeture: number; h24: boolean; jours: number[] }): { nom?: string; adresse?: string; horaires?: string } {
  const e: { nom?: string; adresse?: string; horaires?: string } = {};
  if (b.nom.trim().length < 2) e.nom = 'Donne le nom de ta boutique';
  if (b.adresse.trim().length < 5) e.adresse = 'Précise l’adresse (quartier et rue)';
  if (!b.h24 && (b.fermeture - b.ouverture < 6)) e.horaires = 'Ouvert au moins 6 h par jour';
  if (!b.h24 && b.jours.length < 6) e.horaires = 'Ouvert au moins 6 jours sur 7';
  return e;
}
/** Position simulée stable pour une boutique inscrite : dérivée de son nom (jamais d'aléa). */
export function positionSimulee(nom: string): { est: number; nord: number } {
  let h = 7; for (const c of nom) h = (h * 31 + c.charCodeAt(0)) % 100_003;
  return { est: 150 + (h % 1650), nord: 100 + (Math.floor(h / 7) % 1200) };
}

// ------------------------------------------------------------------ colis en rayon
export interface AgeRayon { jours: number; pl: string; ton: 'ok' | 'wa' | 'er'; aRetourner: boolean; texte: string }
const debutJour = (ms: number) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
export function ageEnRayon(depuisMs: number, maintenantMs: number): AgeRayon {
  const jours = Math.max(0, Math.round((debutJour(maintenantMs) - debutJour(depuisMs)) / 86_400_000));
  return { jours, pl: jours >= DELAI_RETRAIT_JOURS ? 'à rendre' : `J+${jours}`, ton: jours <= 2 ? 'ok' : jours <= 4 ? 'wa' : 'er', aRetourner: jours >= DELAI_RETRAIT_JOURS, texte: jours === 0 ? 'aujourd’hui' : jours === 1 ? 'hier' : `il y a ${jours} j` };
}

// ------------------------------------------------------------------ livraison moto
export const QUARTIERS: { nom: string; km: number }[] = [
  { nom: 'Bonamoussadi', km: 6 }, { nom: 'Bonapriso', km: 3 }, { nom: 'Deïdo', km: 4 }, { nom: 'Bonanjo', km: 2 }, { nom: 'Makepe', km: 7 }, { nom: 'Logbessou', km: 9 }
];
export const QUARTIER_DEFAUT = 'Bonamoussadi';
export const kmCourse = (quartier: string | undefined) => QUARTIERS.find((q) => q.nom === quartier)?.km ?? 5;
export const ETAPES_COURSE = ['parti du relais', 'en route', 'presque là', 'livré'] as const;
/** Minutes restantes selon l'étape simulée (0 parti, 1 en route, 2 presque là) ; 0 une fois remis. */
export function etaCourse(km: number, etape: number): number {
  const total = Math.max(5, Math.round(km * 2.3));
  return etape <= 0 ? total : etape === 1 ? Math.max(2, Math.round(total * 0.43)) : etape === 2 ? 1 : 0;
}
/** Position du livreur sur la carte de suivi (x en % de la largeur, y en px) : du relais (étape 0) vers la maison (étape 3). */
export const POSITIONS_COURSE = [{ x: 18, y: 170 }, { x: 46, y: 120 }, { x: 69, y: 80 }, { x: 77, y: 60 }] as const;
export const MAISON = { x: 77, y: 60 };

/** Heure d'arrivée d'un bus : « 08:00 » + durée → « 11:30 ». */
export function heureArrivee(heureDepart: string, dureeMin: number, retardMin = 0): string {
  const [h, m] = heureDepart.split(':').map(Number), t = (h * 60 + m + dureeMin + retardMin) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

// Arrêts sur la ligne : liste des arrêts d'un départ, horaires de passage (retard compris) et prix prorata pour « monter en route ».
// Module pur : aucune dépendance au monde simulé. Les distances et arrêts sont ceux de la démo (Yaoundé-Douala, Yaoundé-Bafoussam, Yaoundé-Bamenda, Douala-Kribi).
import { hhmm, minutes } from './retard.ts';

export interface ArretLigne { nom: string; sous: string; km: number }
interface Axe { de: string; vers: string; km: number; arrets: ArretLigne[] }

/** Axes connus, orientés ; l'axe inverse se déduit en miroir. */
const AXES: Axe[] = [
  { de: 'Yaoundé', vers: 'Douala', km: 245, arrets: [
    { nom: 'Mbankomo', sous: 'devant la station Total', km: 25 }, { nom: 'Boumnyebel', sous: 'carrefour du marché', km: 95 }, { nom: 'Pouma', sous: 'arrêt officiel', km: 130 },
    { nom: 'Edéa', sous: 'gare routière', km: 175 }, { nom: 'Yassa', sous: 'entrée de Douala', km: 230 }] },
  { de: 'Yaoundé', vers: 'Bafoussam', km: 290, arrets: [{ nom: 'Obala', sous: 'devant le marché', km: 40 }, { nom: 'Bafia', sous: 'gare routière', km: 120 }, { nom: 'Makénéné', sous: 'carrefour principal', km: 215 }] },
  { de: 'Yaoundé', vers: 'Bamenda', km: 370, arrets: [{ nom: 'Bafia', sous: 'gare routière', km: 120 }, { nom: 'Makénéné', sous: 'carrefour principal', km: 215 }, { nom: 'Bafoussam', sous: 'gare routière', km: 290 }, { nom: 'Santa', sous: 'entrée de Bamenda', km: 350 }] },
  { de: 'Douala', vers: 'Kribi', km: 170, arrets: [{ nom: 'Edéa', sous: 'gare routière', km: 65 }, { nom: 'Ébomé', sous: 'carrefour d’entrée de Kribi', km: 150 }] }
];
/** Distance par défaut d'une ligne inconnue. */
const KM_DEFAUT = 200;
export const PRIX_MINI_ARRET = 1000;

/** Arrêts intermédiaires de Ville A → Ville B, dans l'ordre du trajet. */
export function axeDe(de: string, vers: string): { km: number; arrets: ArretLigne[] } {
  const direct = AXES.find((a) => a.de === de && a.vers === vers);
  if (direct) return { km: direct.km, arrets: direct.arrets };
  const inverse = AXES.find((a) => a.de === vers && a.vers === de);
  if (inverse) return { km: inverse.km, arrets: [...inverse.arrets].reverse().map((a) => ({ ...a, km: inverse.km - a.km })) };
  return { km: KM_DEFAUT, arrets: [] };
}
export const distanceKm = (de: string, vers: string) => axeDe(de, vers).km;

export interface Arret {
  id: string; nom: string; sous: string; km: number; /** Part du trajet déjà faite en arrivant ici, 0 à 1. */ fraction: number; type: 'depart' | 'etape' | 'arrivee';
  /** Minutes depuis minuit du jour de départ (peut dépasser 1 440). */ min: number; heure: string;
}
export const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export interface ParamsParcours { de: string; vers: string; gareDe: string; gareVers: string; heure: string; dureeMin: number; retardMin: number }
/** Gare de départ, arrêts intermédiaires, gare d'arrivée. Le bus roule à vitesse moyenne constante : l'heure de passage est proportionnelle à la distance. */
export function parcours(p: ParamsParcours): Arret[] {
  const { km, arrets } = axeDe(p.de, p.vers), debut = minutes(p.heure) + p.retardMin;
  const fait = (id: string, nom: string, sous: string, k: number, type: Arret['type']): Arret => {
    const fraction = Math.max(0, Math.min(1, k / km)), min = Math.round(debut + fraction * p.dureeMin);
    return { id, nom, sous, km: k, fraction, type, min, heure: hhmm(min) };
  };
  return [
    fait('depart', `${p.de} · ${p.gareDe}`, 'gare de départ', 0, 'depart'),
    ...arrets.map((a) => fait(slug(a.nom), a.nom, a.sous, a.km, 'etape')),
    fait('arrivee', `${p.vers} · ${p.gareVers}`, 'gare d’arrivée', km, 'arrivee')
  ];
}

const arrondi50 = (n: number) => Math.round(n / 50) * 50;
/** Prix du billet depuis un arrêt : prorata de la distance restante, minimum 1 000 F ; billet plein depuis la gare de départ, rien à l'arrivée. */
export function prixArret(prixDepart: number, a: Pick<Arret, 'type' | 'fraction'>): number {
  if (a.type === 'depart') return prixDepart;
  if (a.type === 'arrivee') return 0;
  return Math.min(prixDepart, Math.max(PRIX_MINI_ARRET, arrondi50(prixDepart * (1 - a.fraction))));
}
/** Prochain arrêt pas encore atteint (premier dont l'heure dépasse `nowMin`), et le délai en minutes. */
export function prochainArret(arrets: Arret[], nowMin: number): { arret: Arret; dansMin: number } | null {
  const a = arrets.find((x) => x.min > nowMin);
  return a ? { arret: a, dansMin: a.min - nowMin } : null;
}
/** Un arrêt est « passé » quand le bus l'a dépassé (ou quand il est parti de la gare, pour le départ). */
export const arretPasse = (a: Arret, nowMin: number) => a.min <= nowMin;
export { quaiDe } from './quai.ts';

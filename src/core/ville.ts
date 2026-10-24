// Trajets en ville : moto, taxi, covoiturage urbain, bus urbain. Estimations simulées à partir de la distance.
export const QUARTIERS: Record<string, Record<string, Record<string, number>>> = {
  Yaoundé: {
    Bastos: { Mvan: 4.5, Nsam: 6.2, Tongolo: 5.4 }, 'Mvog-Ada': { Mvan: 2.1, Nsam: 3.8, Tongolo: 3 }, Essos: { Mvan: 3.4, Nsam: 5.5, Tongolo: 2.2 },
    'Biyem-Assi': { Mvan: 5, Nsam: 2.5, Tongolo: 6.1 }, Melen: { Mvan: 3, Nsam: 4.4, Tongolo: 3.9 }
  },
  Douala: { Akwa: { Akwa: 0.5 }, Bonanjo: { Akwa: 2 }, Bonapriso: { Akwa: 3.5 }, Deido: { Akwa: 3 }, Bonabéri: { Akwa: 7.5 } }
};
export const QUARTIER_PAR_DEFAUT: Record<string, string> = { Yaoundé: 'Bastos', Douala: 'Akwa' };
/** Motos disponibles autour d'un quartier (simulé, stable) et délai d'arrivée en minutes. */
const MOTOS: Record<string, [number, number]> = { Bastos: [4, 2], 'Mvog-Ada': [3, 3], Essos: [5, 2], 'Biyem-Assi': [3, 4], Melen: [2, 4], Akwa: [5, 2], Bonanjo: [4, 3], Bonapriso: [3, 3], Deido: [3, 4], Bonabéri: [2, 5] };
export function motosAutour(quartier: string): { nb: number; minutes: number } {
  const t = MOTOS[quartier]; if (t) return { nb: t[0], minutes: t[1] };
  const g = [...quartier].reduce((s, c) => s + c.charCodeAt(0), 0);
  return { nb: 2 + (g % 4), minutes: 2 + (g % 3) };
}
export type ModeVille = 'moto' | 'taxi' | 'covoit' | 'bus';
export interface OptionVille { mode: ModeVille; titre: string; sous: string; prix: number; dureeMin: number; badge: string; ton: '' | 'ok' | 'inf'; lien: string }
const a50 = (n: number) => Math.round(n / 50) * 50;
export const prixMoto = (km: number) => a50(150 + 120 * km);
export const prixTaxi = (km: number) => a50(500 + 220 * km);
export const PRIX_BUS_URBAIN = 250;
/** Prochain bus urbain (toutes les 15 min, à :10 :25 :40 :55), strictement après `minutes` du jour. */
export function prochainBusUrbain(minutes: number, frequence = 15, decalage = 10): string {
  let t = minutes + 1; while ((t - decalage) % frequence !== 0) t++;
  t %= 1440; return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
export interface CovoitVille { id: string; conducteur: string; depart: string; heure: string; places: number; prix: number }
/** Les quatre façons d'aller d'un quartier à une gare, avec le plus rapide et le moins cher repérés. */
export function optionsVille(km: number, quartier: string, minutes: number, motos: { nb: number; minutes: number }, covoits: CovoitVille[]): OptionVille[] {
  const bruts: OptionVille[] = [
    { mode: 'moto', titre: 'Moto · Yango', sous: `Arrive dans ${motos.minutes} min · ${Math.round(km * 3.1)} min de route`, prix: prixMoto(km), dureeMin: Math.round(km * 3.1), badge: '', ton: '', lien: '/course' },
    { mode: 'taxi', titre: 'Taxi · course', sous: `Arrive dans 6 min · ${Math.round(km * 4)} min de route`, prix: prixTaxi(km), dureeMin: Math.round(km * 4), badge: '4 places', ton: '', lien: '/course' }
  ];
  const cv = covoits[0];
  if (cv) bruts.push({ mode: 'covoit', titre: 'Covoiturage en ville', sous: `${cv.conducteur} part de ${cv.depart} à ${cv.heure} · ${cv.places} place${cv.places > 1 ? 's' : ''}`, prix: cv.prix, dureeMin: Math.round(km * 3.8), badge: '', ton: '', lien: '/covoit/ville' });
  bruts.push({ mode: 'bus', titre: 'Bus urbain · ligne 12', sous: `Prochain à ${prochainBusUrbain(minutes)} · arrêt ${quartier} II`, prix: PRIX_BUS_URBAIN, dureeMin: Math.round(km * 5.5), badge: '', ton: '', lien: '/arret' });
  const vite = Math.min(...bruts.map((o) => o.dureeMin)), pas = Math.min(...bruts.map((o) => o.prix));
  return bruts.map((o) => {
    if (o.dureeMin === vite && o.mode !== 'bus') return { ...o, badge: 'le plus rapide', ton: 'ok' as const };
    if (o.prix === pas) return { ...o, badge: 'le moins cher', ton: 'inf' as const };
    return o;
  });
}

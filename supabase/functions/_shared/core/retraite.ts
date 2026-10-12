// Retraite de 24 h : rattraper en une journée ce qui est en retard dans chaque thème (rubrique). Fonctions pures.
// On estime le temps de rattrapage de chaque retard, puis on le répartit dans les plages libres d'une journée-type
// (nuit, repas et pauses comprises). Les durées par unité sont des estimations prudentes, affichées comme telles.
import type { Metrique } from './types.ts';

export interface BesoinRetraite {
  /** Une même saisie (projet + clé) n'est rattrapée qu'une fois, même si plusieurs sous-projets la comptent. */
  cle: string;
  projetId: string; projetNom: string; rubriqueId: string; rubriqueNom: string; spId: string; spNom: string;
  type: Metrique['type'];
  /** Clé de la métrique rattrapée (valeurs prévues du bloc). */
  cleMetrique: string;
  /** Retard en unités de la métrique (chapitres, pages, fois…) — secondes pour le temps. */
  unites: number;
  minutes: number;
  /** « 12 ch », « 2 fois »… */
  detail: string;
}

export type TypeBloc = 'ouverture' | 'activite' | 'pause' | 'repas' | 'bilan' | 'nuit' | 'cloture';
export interface BlocRetraite {
  /** Minutes depuis minuit du jour de départ (au-delà de 1440 : le lendemain). */
  debut: number; duree: number; type: TypeBloc; titre: string;
  besoin?: BesoinRetraite;
  /** Ce que ce bloc rattrape (unités de la métrique). */
  unitesCouvertes?: number;
}
export interface PlanRetraite {
  blocs: BlocRetraite[];
  /** Minutes de rattrapage estimées, et minutes réellement placées. */
  besoinTotal: number; place: number; manque: number;
  parTheme: { rubriqueId: string; rubriqueNom: string; besoin: number; place: number }[];
}

const MIN_PAR_UNITE_NOMBRE: Record<string, number> = { chapitres: 12, pages: 2, personnes: 15, ames: 15 };

/** Temps estimé (minutes, arrondi aux 5 min au-dessus) pour rattraper `retard` (unité de base) d'une métrique ; 0 si ça ne se rattrape pas en retraite. */
export function minutesDeRetard(m: Pick<Metrique, 'type' | 'cle'>, retard: number): number {
  if (!(retard > 0)) return 0;
  let min = 0;
  switch (m.type) {
    case 'temps': min = retard / 60; break;
    case 'nombre': min = retard * (MIN_PAR_UNITE_NOMBRE[m.cle.split(':')[1] ?? ''] ?? 10); break;
    case 'fois': min = retard * 30; break;
    case 'oui_non': min = retard * 15; break;
    case 'choix': min = retard * 30; break;
    case 'montant': min = 10; break; // un geste (donner, virer), pas une durée
    case 'distance': min = (retard / 1000) * 6; break;
    default: return 0;
  }
  return min < 5 ? 0 : Math.ceil(min / 5) * 5;
}

const FIXES: { debut: number; duree: number; type: TypeBloc; titre: string }[] = [
  { debut: 360, duree: 30, type: 'ouverture', titre: 'Ouverture · me poser devant Dieu' },
  { debut: 750, duree: 60, type: 'repas', titre: 'Repas et silence' },
  { debut: 930, duree: 30, type: 'pause', titre: 'Marche et pause' },
  { debut: 1140, duree: 60, type: 'repas', titre: 'Repas' },
  { debut: 1290, duree: 30, type: 'bilan', titre: 'Bilan de la retraite et plan de la semaine' },
  { debut: 1320, duree: 450, type: 'nuit', titre: 'Nuit' },
  { debut: 1770, duree: 30, type: 'cloture', titre: 'Clôture · merci' }
];
/** Plages libres entre les blocs fixes (06 h 30–12 h 30, 13 h 30–15 h 30, 16 h–19 h, 20 h–21 h 30). */
const PLAGES: [number, number][] = [[390, 750], [810, 930], [960, 1140], [1200, 1290]];
const BLOC_MAX = 90;
const PAUSE = 10;
/** Part des plages réellement utilisée pour travailler (le reste : petites pauses). */
const CAPACITE = 660;

export function planifierRetraite(besoins: BesoinRetraite[]): PlanRetraite {
  const utiles = besoins.filter((b) => b.minutes > 0);
  const besoinTotal = utiles.reduce((s, b) => s + b.minutes, 0);
  const facteur = besoinTotal > CAPACITE ? CAPACITE / besoinTotal : 1;
  const cibles = utiles.map((b) => ({ b, reste: Math.max(15, Math.round((b.minutes * facteur) / 5) * 5), alloue: 0 }));
  for (const c of cibles) c.alloue = c.reste;

  const blocs: BlocRetraite[] = FIXES.map((f) => ({ ...f }));
  let i = 0;
  for (const [debut, fin] of PLAGES) {
    let curseur = debut;
    while (i < cibles.length && fin - curseur >= 15) {
      const c = cibles[i];
      const duree = Math.min(c.reste, BLOC_MAX, fin - curseur);
      blocs.push({ debut: curseur, duree, type: 'activite', titre: c.b.projetNom, besoin: c.b, unitesCouvertes: (c.b.unites * duree) / c.b.minutes });
      curseur += duree; c.reste -= duree;
      if (c.reste <= 0) i++;
      if (duree >= 60 && fin - curseur >= 20 && i < cibles.length) { blocs.push({ debut: curseur, duree: PAUSE, type: 'pause', titre: 'Pause' }); curseur += PAUSE; }
    }
  }
  blocs.sort((a, b) => a.debut - b.debut);
  const place = blocs.filter((b) => b.type === 'activite').reduce((s, b) => s + b.duree, 0);
  const themes = new Map<string, PlanRetraite['parTheme'][number]>();
  for (const b of utiles) { const t = themes.get(b.rubriqueId) ?? { rubriqueId: b.rubriqueId, rubriqueNom: b.rubriqueNom, besoin: 0, place: 0 }; t.besoin += b.minutes; themes.set(b.rubriqueId, t); }
  for (const b of blocs) if (b.besoin) themes.get(b.besoin.rubriqueId)!.place += b.duree;
  return { blocs, besoinTotal, place, manque: Math.max(0, Math.round(besoinTotal - place)), parTheme: [...themes.values()] };
}

// Le monde vit seul : à chaque tick, les départs passent à « embarquement », « parti », « arrivé » selon l'horloge, et le bus avance.
import { aujourdhui, maintenant } from '../data/horloge.ts';
import { app } from '../data/store.svelte.ts';
import { ligneDe, departEnMs } from './actions.ts';

export function avancerMonde(now = maintenant()) {
  const jour = aujourdhui();
  for (const d of app.monde.departs) {
    if (d.statut === 'annule' || d.jour > jour) continue;
    const l = ligneDe(d), debut = departEnMs(d), fin = debut + l.dureeMin * 60_000;
    const statut = now >= fin ? 'arrive' : now >= debut ? 'parti' : now >= debut - 30 * 60_000 ? 'embarquement' : 'prevu';
    if (d.statut !== statut) d.statut = statut;
    const av = statut === 'arrive' ? 1 : statut === 'parti' ? (now - debut) / (fin - debut) : 0;
    if (Math.abs(d.avancement - av) > 0.005) d.avancement = Math.round(av * 1000) / 1000;
  }
}

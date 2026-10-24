// Le monde vit seul : à chaque tick, les départs passent à « embarquement », « parti », « arrivé » selon l'horloge, et le bus avance.
// Un départ donné à la main par le chauffeur (`partiA`) reste « parti » : l'horloge ne le ramène pas en arrière, et son heure réelle est celle du chauffeur.
import { aujourdhui, maintenant } from '../data/horloge.ts';
import { app } from '../data/store.svelte.ts';
import { ligneDe, departEnMs } from './actions.ts';
import type { StatutDepart } from './types.ts';

export function avancerMonde(now = maintenant()) {
  const jour = aujourdhui();
  for (const d of app.monde.departs) {
    if (d.statut === 'annule' || (d.jour > jour && d.partiA === undefined)) continue;
    const l = ligneDe(d), manuel = d.partiA !== undefined, debut = manuel ? d.partiA! : departEnMs(d), fin = debut + l.dureeMin * 60_000;
    let statut: StatutDepart = now >= fin ? 'arrive' : now >= debut ? 'parti' : now >= debut - 30 * 60_000 ? 'embarquement' : 'prevu';
    if (manuel && (statut === 'prevu' || statut === 'embarquement')) statut = 'parti';
    if (d.statut !== statut) d.statut = statut;
    const av = statut === 'arrive' ? 1 : statut === 'parti' ? Math.max(0, (now - debut) / (fin - debut)) : 0;
    if (Math.abs(d.avancement - av) > 0.005) d.avancement = Math.round(av * 1000) / 1000;
  }
}

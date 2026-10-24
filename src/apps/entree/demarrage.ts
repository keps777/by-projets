// Lancé une fois au démarrage de l'app : prépare les préférences, fait avancer les dossiers de litige et les points de fidélité.
import { app } from '../../data/store.svelte.ts';
import { avancerLitiges, crediterBillets } from './actions.ts';
import { preferences } from './etat.ts';

let minuteur: ReturnType<typeof setInterval> | undefined;
export default function demarrage() {
  preferences();
  if (typeof document !== 'undefined') document.documentElement.lang = app.session.langue === 'pcm' ? 'en' : app.session.langue;
  const tick = () => {
    avancerLitiges();
    const id = app.session.personneId; if (id && app.session.role === 'voyageur') crediterBillets(id);
  };
  tick();
  if (!minuteur) minuteur = setInterval(tick, 30_000); // un seul minuteur, même si le démarrage est rejoué après « remettre le monde à zéro »
}

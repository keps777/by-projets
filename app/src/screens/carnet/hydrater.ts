// Affichage des médias d'une note riche : le HTML ne porte que des identifiants (`data-media`) ; l'adresse vient de l'appareil ou du serveur.
import { urlMedia } from '../../data/media.svelte.ts';

/** Donne leur adresse aux images et vidéos citées sous `racine` ; un média introuvable est signalé (« indisponible sur cet appareil »). */
export function hydrater(racine: HTMLElement): void {
  for (const m of Array.from(racine.querySelectorAll<HTMLElement>('[data-media]'))) {
    const id = m.getAttribute('data-media')!;
    if (m.getAttribute('src')) continue;
    void urlMedia(id).then((u) => {
      const fig = m.closest('figure');
      if (u) { m.setAttribute('src', u); fig?.removeAttribute('data-absent'); } else fig?.setAttribute('data-absent', '1');
    });
  }
}

/** Action Svelte : `use:hydraterAction={contenu}` hydrate à l'affichage et à chaque changement du contenu. */
export function hydraterAction(noeud: HTMLElement, _contenu?: unknown) {
  hydrater(noeud);
  return { update() { queueMicrotask(() => hydrater(noeud)); } };
}

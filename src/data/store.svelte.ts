// Magasin unique : le « monde » NexG-TT (vols, droits de voyage, offres, comptes…), la session et les tranches de chaque fonctionnalité.
// Réactif ($state), persisté dans localStorage. Backend simulé : voir docs/architecture.md.
import { decoder, encoder } from './codec.ts';
import { CLE_STOCKAGE } from './constantes.ts';
import { aujourdhui, jourDe, maintenant } from './horloge.ts';
import { etatInitial } from './seed.ts';
import type { Etat } from '../domain/types.ts';

function charger(): Etat {
  try { const brut = localStorage.getItem(CLE_STOCKAGE); if (brut) { const e = decoder(brut) as Etat; if (e.version === 1 && e.monde?.vols?.length) return e; } } catch { /* stockage indisponible */ }
  return etatInitial();
}
export const app: Etat = $state(charger());
export { maintenant, aujourdhui, jourDe };
let n = 0;
export const nouvelId = (prefixe = 'x') => `${prefixe}-${Date.now().toString(36)}-${(++n).toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

/** Tranche d'une fonctionnalité : créée à la première lecture avec sa valeur par défaut, puis persistée avec le reste. */
export function tranche<T extends object>(cle: string, defaut: () => T): T {
  if (!(cle in app.tranches)) {
    const valeur = defaut();
    // Lue depuis un `$derived`, la création est interdite par Svelte : on rend la valeur par défaut, non enregistrée ; la tranche sera créée par la première action.
    try { app.tranches[cle] = valeur; } catch { return valeur; }
  }
  return app.tranches[cle] as T;
}

const apresReinitialisation: (() => void)[] = [];
/** Enregistre ce qui doit être refait après « réinitialiser la démo » (tranches, historique de démonstration…). */
export function surReinitialisation(f: () => void) { apresReinitialisation.push(f); }
/** Remet le monde de démonstration à zéro (garde la langue), puis rejoue les démarrages enregistrés. */
export function reinitialiser() {
  const e = etatInitial(), langue = app.session.langue;
  for (const k of Object.keys(app) as (keyof Etat)[]) delete (app as Partial<Etat>)[k];
  Object.assign(app, e); app.session.langue = langue;
  for (const f of apresReinitialisation) { try { f(); } catch { /* un démarrage en échec ne bloque pas les autres */ } }
}

let timer: ReturnType<typeof setTimeout> | undefined;
export function demarrer() {
  $effect.root(() => {
    $effect(() => {
      const instantane = encoder($state.snapshot(app));
      clearTimeout(timer);
      timer = setTimeout(() => { try { localStorage.setItem(CLE_STOCKAGE, instantane); } catch { /* quota ou mode privé */ } }, 150);
    });
  });
  window.addEventListener('pagehide', () => { try { localStorage.setItem(CLE_STOCKAGE, encoder($state.snapshot(app))); } catch { /* idem */ } });
}

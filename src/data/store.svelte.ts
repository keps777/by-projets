// Magasin unique : état réactif, persisté dans localStorage (backend simulé, voir docs/architecture.md).
import { demo, vierge } from './seed.ts';
import { CLE_STOCKAGE } from './constantes.ts';
import { maintenant } from './horloge.ts';
import type { Credit, Etat, Mouvement, Notification } from './types.ts';

function charger(): Etat {
  try { const brut = localStorage.getItem(CLE_STOCKAGE); if (brut) { const e = JSON.parse(brut) as Etat; if (e.version === 1) return e; } } catch { /* stockage indisponible */ }
  return vierge();
}
export const app: Etat = $state(charger());

/** Horloge : surchargeable par les tests (`?maintenant=2026-10-28T09:00`) pour rejouer la paie (voir horloge.ts). */
export { maintenant };
let n = 0;
export const nouvelId = (prefixe = 'x') => `${prefixe}-${maintenant().toString(36)}-${(++n).toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;

/** Tranche d'une fonctionnalité : créée à la première lecture avec sa valeur par défaut, puis persistée avec le reste. */
export function tranche<T extends object>(cle: string, defaut: () => T): T {
  if (!(cle in app.tranches)) {
    const valeur = defaut();
    // Lue depuis un `$derived` (un aperçu de paie par exemple), la création est interdite par Svelte : on rend alors la valeur par défaut,
    // non enregistrée ; la tranche sera réellement créée par la première action, et le `$derived` se recalculera.
    try { app.tranches[cle] = valeur; } catch { return valeur; }
  }
  return app.tranches[cle] as T;
}

export function mouvement(m: Omit<Mouvement, 'id' | 'ts'> & { ts?: number }) {
  app.solde += m.montant;
  app.mouvements.unshift({ id: nouvelId('m'), ts: m.ts ?? maintenant(), ...m });
}
export function notifier(n: Omit<Notification, 'id' | 'ts' | 'lu'> & { ts?: number }) { app.notifications.unshift({ id: nouvelId('n'), ts: n.ts ?? maintenant(), lu: false, ...n }); }
/** Marque comme lues les notifications dont le lien vérifie `ciblee` (la facture est réglée : « à régler » n'a plus de sens). */
export function marquerLues(ciblee: (lien: string) => boolean) { for (const n of app.notifications) if (n.lien && ciblee(n.lien)) n.lu = true; }
export const nonLues = () => app.notifications.filter((x) => !x.lu).length;
export const creditsActifs = (): Credit[] => app.credits.filter((c) => c.statut === 'actif');
/** Somme des mensualités de crédit en cours (entre dans la règle des 33 %). */
export const totalMensualites = () => creditsActifs().reduce((s, c) => s + c.mensualite, 0);

/** Remplace tout l'état (bascule démo/vierge, déconnexion complète). */
export function reinitialiser(mode: 'demo' | 'vierge') {
  const e = mode === 'demo' ? demo() : vierge();
  for (const k of Object.keys(app) as (keyof Etat)[]) delete (app as Partial<Etat>)[k];
  Object.assign(app, e);
}

let timer: ReturnType<typeof setTimeout> | undefined;
export function demarrer() {
  $effect.root(() => {
    $effect(() => {
      const instantane = JSON.stringify($state.snapshot(app));
      clearTimeout(timer);
      timer = setTimeout(() => { try { localStorage.setItem(CLE_STOCKAGE, instantane); } catch { /* quota ou mode privé */ } }, 150);
    });
  });
  window.addEventListener('pagehide', () => { try { localStorage.setItem(CLE_STOCKAGE, JSON.stringify($state.snapshot(app))); } catch { /* idem */ } });
  window.addEventListener('storage', () => { /* une autre fenêtre : on ne fusionne pas, la plus récente gagne au prochain rechargement */ });
}

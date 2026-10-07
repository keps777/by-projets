// Invitation à envoyer le rapport du jour : à l'heure du rapport (23:45 par défaut, Réglages › Notifications), si l'app est ouverte et que le
// rapport du jour n'est pas encore envoyé, une fenêtre propose de le relire et de l'envoyer. « Dans 15 min » la rappelle, « Pas ce soir » la tait jusqu'à demain.
import { HEURE_RAPPORT_DEFAUT } from '@core/defauts.ts';
import { magasin } from '../../data/magasin.svelte.ts';
import { profil } from '../../data/requetes.ts';
import { horloge, maintenantLocal } from '../../data/temps.svelte.ts';
import { routeur } from '../../routeur.svelte.ts';
import { alarmes } from '../../alarme/alarme.svelte.ts';
import { rapportDuJour } from './donnees.ts';

const CLE = 'luther-life:invitation-rapport';
const DELAI_PLUS_TARD_MS = 15 * 60_000;
/** Écrans où l'invitation n'a pas de sens (on y est déjà, ou pas encore connecté). */
const ECRANS_SANS_INVITATION = ['/connexion', '/rapports', '/export', '/rapports/export', '/installation'];

interface Etat { jour: string; jusqua: number | 'jour' }

function lire(): Etat | null {
  try { return JSON.parse(localStorage.getItem(CLE) ?? 'null') as Etat | null; } catch { return null; }
}

export const minutesDeRapport = (hhmm: string | undefined): number => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? HEURE_RAPPORT_DEFAUT) ?? /^(\d{1,2}):(\d{2})/.exec(HEURE_RAPPORT_DEFAUT)!;
  return Math.min(1439, +m[1] * 60 + +m[2]);
};

class Invitation {
  #etat = $state<Etat | null>(lire());

  /** Vrai quand la fenêtre doit s'afficher. */
  visible = $derived.by(() => {
    const p = profil();
    if (!magasin.pret || !p || alarmes.courante) return false;
    if (ECRANS_SANS_INVITATION.some((e) => routeur.chemin === e || routeur.chemin.startsWith(`${e}/`))) return false;
    const { jour, minutes } = maintenantLocal();
    if (minutes < minutesDeRapport(p.heure_rapport)) return false;
    if (rapportDuJour(jour)?.envoye_a) return false;
    const e = this.#etat;
    if (e && e.jour === jour && (e.jusqua === 'jour' || horloge.maintenant < e.jusqua)) return false;
    return true;
  });

  #poser(e: Etat): void {
    this.#etat = e;
    try { localStorage.setItem(CLE, JSON.stringify(e)); } catch { /* sans stockage : la fenêtre revient à la prochaine ouverture */ }
  }

  plusTard(): void { this.#poser({ jour: maintenantLocal().jour, jusqua: Date.now() + DELAI_PLUS_TARD_MS }); }
  pasCeSoir(): void { this.#poser({ jour: maintenantLocal().jour, jusqua: 'jour' }); }
  ouvrir(): void { routeur.aller('/rapports'); }
}

export const invitation = new Invitation();

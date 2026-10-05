// Apparence (nuit / jour / auto) : appliquée sur <html data-theme>. Le profil fait foi, le téléphone s'en souvient pour le démarrage.
import { magasin } from '../data/magasin.svelte.ts';

export type Apparence = 'nuit' | 'jour' | 'auto';
const CLE = 'luther-life:apparence';

class Theme {
  apparence = $state<Apparence>((typeof localStorage !== 'undefined' && (localStorage.getItem(CLE) as Apparence)) || 'nuit');
  #systemeClair = $state(typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: light)').matches);

  /** Mode réellement affiché. */
  mode = $derived<'nuit' | 'jour'>(this.apparence === 'auto' ? (this.#systemeClair ? 'jour' : 'nuit') : this.apparence);

  demarrer(): void {
    if (typeof matchMedia !== 'undefined') matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => { this.#systemeClair = e.matches; });
    $effect.root(() => {
      $effect(() => { const p = magasin.lignes.profils[0]?.apparence; if (p) this.choisir(p, false); });
      $effect(() => {
        document.documentElement.dataset.theme = this.apparence;
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', this.mode === 'nuit' ? '#0E0F13' : '#F5F4F0');
      });
    });
  }

  choisir(a: Apparence, memoriser = true): void {
    this.apparence = a;
    try { localStorage.setItem(CLE, a); } catch { /* stockage indisponible */ }
    if (memoriser) { const p = magasin.lignes.profils[0]; if (p && p.apparence !== a) magasin.ecrire('profils', { id: p.id, apparence: a }); }
  }
}
export const theme = new Theme();

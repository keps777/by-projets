<script lang="ts">
  import Icone from '../../ui/Icone.svelte';
  import { nav } from './nav.ts';
  /** Îlot dynamique (Dynamic Island) du bus : réutilisable sur l'écran verrouillé, dans l'en-tête de l'accueil, etc. */
  let { compagnie, quai, texte, eta, etendu = false, href = '/direct' }: { compagnie: string; quai?: number; texte: string; eta: string; etendu?: boolean; href?: string } = $props();
</script>

<a class="isl" class:x={etendu} {href} use:nav aria-label="Ouvrir le suivi du bus : {compagnie}, {texte}, {eta}">
  <span class="bub aq pic"><Icone nom="bus" taille={18} trait={2.2} /></span>
  <span class="col grow"><span class="t13 b7 ell">{compagnie}{quai ? ` · quai ${quai}` : ''}</span><span class="t12 mut ell">{texte}</span></span>
  <span class="ttl t18 aq">{eta}</span>
</a>

<style>
  .isl { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-radius: 30px; background: #000; border: 1px solid rgba(255, 255, 255, 0.14); min-width: 200px; max-width: 100%; color: #f2f4ff; text-decoration: none; box-shadow: 0 20px 40px -20px rgba(0, 0, 0, 0.9); transition: min-width 0.3s; }
  .isl.x { min-width: min(340px, 100%); }
  .pic { width: 34px; height: 34px; border-radius: 50%; }
</style>

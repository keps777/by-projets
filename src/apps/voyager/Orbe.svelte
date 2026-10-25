<script lang="ts">
  import { retour } from '../../router.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import OrbeContenu from './OrbeContenu.svelte';

  /** Page autonome `/orbe` (lien profond) : même contenu que la fenêtre globale `OrbeFeuille`, affiché en plein écran. */
</script>

{#snippet entete()}
  <div class="halo" aria-hidden="true"></div>
  <header class="hd">
    <a class="ib" href="/" aria-label="Fermer" onclick={(e) => { e.preventDefault(); retour('/'); }}><Icone nom="fermer" /></a>
    <span class="ttl t18">Tout AfriMove</span>
    <span class="pl ac">orbe</span>
  </header>
{/snippet}

<Mobile enteteLibre={entete}>
  <OrbeContenu />
</Mobile>

<style>
  .halo { position: absolute; left: 50%; top: 40px; width: min(420px, 100%); height: 420px; margin-left: calc(min(420px, 100%) / -2); border-radius: 50%; background: radial-gradient(circle, rgba(139, 124, 255, 0.35), transparent 60%); pointer-events: none; }
</style>

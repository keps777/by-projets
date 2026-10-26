<script lang="ts">
  import Icone from '../../ui/Icone.svelte';
  import { reseau } from './temps.svelte.ts';
  /** Bandeau « hors ligne » : les prix viennent du dernier chargement (cache de l'appareil). */
</script>
<div class="bandeau" role="status" aria-live="polite">{#if !reseau.enLigne}<Icone nom="hors_ligne" taille={16} /><span>Hors ligne : ces prix datent de votre dernière visite.</span>{/if}</div>
<style>
  .bandeau:empty { display: none; }
  .bandeau { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 12px; background: var(--signal-soft); color: var(--signal-ink); font-size: 13px; line-height: 18px; font-weight: 600; }
</style>

<script lang="ts">
  /** Code d'aéroport en lettres de tableau d'affichage (maquettes : tuiles sombres, lettres jaunes). */
  let { code, taille = 'm' }: { code: string; taille?: 's' | 'm' } = $props();
</script>
<span class="plaque" class:s={taille === 's'} aria-hidden="true">{#each code.split('') as c}<span class="lettre">{c}</span>{/each}</span>
<style>
  .plaque { display: inline-flex; gap: 3px; }
  .lettre { width: 22px; height: 30px; display: flex; align-items: center; justify-content: center; border-radius: 4px; background: #1c1f25; box-shadow: inset 0 -15px 0 #15171b; font: 600 17px/1 'IBM Plex Mono', ui-monospace, monospace; color: var(--accent); }
  .s .lettre { width: 20px; height: 28px; font-size: 16px; }
</style>

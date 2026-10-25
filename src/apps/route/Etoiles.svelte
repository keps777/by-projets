<script lang="ts">
  import IconeCv from './IconeCv.svelte';
  /** Choix d'une note de 1 à 5 étoiles (groupe de boutons radio, flèches du clavier). */
  let { valeur = $bindable(0), label = 'Ta note' }: { valeur?: number; label?: string } = $props();
  const MOTS = ['', 'Décevant', 'Moyen', 'Bien', 'Très bien', 'Parfait'];
  function touche(e: KeyboardEvent) {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0; if (!d) return;
    e.preventDefault(); valeur = Math.max(1, Math.min(5, (valeur || 0) + d)); (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role=radio]')[valeur - 1]?.focus();
  }
</script>

<div class="col g8" style="align-items: center">
  <div class="rang" role="radiogroup" aria-label={label} tabindex="-1" onkeydown={touche}>
    {#each [1, 2, 3, 4, 5] as n (n)}
      <button type="button" role="radio" aria-checked={valeur === n} aria-label="{n} étoile{n > 1 ? 's' : ''}" tabindex={valeur === n || (!valeur && n === 1) ? 0 : -1} class:on={n <= valeur} onclick={() => (valeur = n)}><IconeCv nom="etoile" taille={34} trait={1.6} /></button>
    {/each}
  </div>
  <span class="t14 b7 aq" aria-live="polite">{MOTS[valeur] || 'Touche une étoile'}</span>
</div>

<style>
  .rang { display: flex; gap: 2px; }
  button { width: 52px; height: 52px; display: grid; place-items: center; border: 0; background: transparent; color: rgba(255, 255, 255, 0.28); cursor: pointer; border-radius: 14px; transition: transform 0.2s cubic-bezier(0.34, 1.6, 0.5, 1), color 0.2s; }
  button.on { color: #ffc24b; transform: scale(1.08); } button.on :global(svg) { fill: currentColor; } button:focus-visible { outline: 2px solid #7febff; outline-offset: 1px; }
  @media (prefers-reduced-motion: reduce) { button { transition: none; } }
</style>

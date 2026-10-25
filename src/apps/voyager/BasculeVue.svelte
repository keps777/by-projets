<script lang="ts" generics="T extends string = 'liste' | '3d'">
  /** Sélecteur segmenté à deux options visibles (par défaut « Liste » / « 3D »), avec une pastille qui glisse de l'une à l'autre. Flèches du clavier, un seul arrêt de tabulation. */
  let { valeur = $bindable(), options, label = 'Affichage des départs' }: { valeur: T; options?: { id: T; nom: string }[]; label?: string } = $props();
  const OPTIONS = $derived(options ?? ([{ id: 'liste', nom: 'Liste' }, { id: '3d', nom: '3D' }] as unknown as { id: T; nom: string }[]));
  const i = $derived(OPTIONS.findIndex((o) => o.id === valeur));
  let boutons: HTMLButtonElement[] = [];
  function touche(e: KeyboardEvent) {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : e.key === 'Home' ? -9 : e.key === 'End' ? 9 : 0;
    if (!d) return;
    e.preventDefault();
    const n = Math.max(0, Math.min(OPTIONS.length - 1, i + d));
    valeur = OPTIONS[n].id; boutons[n]?.focus();
  }
</script>

<div class="bv" role="radiogroup" aria-label={label} style="--i:{i}; --n:{OPTIONS.length}">
  <span class="pastille" aria-hidden="true"></span>
  {#each OPTIONS as o, n (o.id)}
    <button type="button" role="radio" aria-checked={valeur === o.id} tabindex={valeur === o.id ? 0 : -1} bind:this={boutons[n]} onclick={() => (valeur = o.id)} onkeydown={touche}>{o.nom}</button>
  {/each}
</div>

<style>
  .bv { position: relative; display: grid; grid-template-columns: repeat(var(--n, 2), 1fr); padding: 4px; border-radius: 18px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.12); backdrop-filter: blur(14px); }
  .pastille { position: absolute; top: 4px; bottom: 4px; left: 4px; width: calc((100% - 8px) / var(--n, 2)); border-radius: 14px; background: linear-gradient(135deg, rgba(139, 124, 255, 0.5), rgba(61, 224, 255, 0.34)); border: 1px solid rgba(255, 255, 255, 0.3); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.35), 0 6px 16px -8px rgba(124, 108, 255, 0.8); transform: translateX(calc(var(--i) * 100%)); transition: transform 0.34s cubic-bezier(0.34, 1.32, 0.5, 1); pointer-events: none; }
  button { position: relative; z-index: 1; min-height: 44px; min-width: 0; padding: 0 12px; border: 0; border-radius: 14px; background: transparent; color: #b7c0db; font: 700 14px 'Sora Variable', 'Sora', sans-serif; cursor: pointer; transition: color 0.25s; }
  button[aria-checked='true'] { color: #f2f4ff; }
  button:focus-visible { outline: 2px solid #7febff; outline-offset: 1px; }
  @media (max-width: 359px) { button { font-size: 13px; padding: 0 4px; white-space: nowrap; } }
  @media (prefers-reduced-motion: reduce) { .pastille { transition: none; } }
</style>

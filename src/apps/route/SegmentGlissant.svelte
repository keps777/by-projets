<script lang="ts">
  /** Sélecteur segmenté à pastille glissante (tablist) : clic, flèches du clavier, Début/Fin. La pastille glisse avec un ressort doux. */
  let { options, valeur = $bindable(), label, petit = false, onchoisir, idPrefixe = 'seg' }: {
    options: { id: string; label: string }[]; valeur: string; label: string; petit?: boolean; onchoisir?: (id: string) => void; idPrefixe?: string;
  } = $props();
  const i = $derived(Math.max(0, options.findIndex((o) => o.id === valeur)));
  function choisir(id: string) { if (id === valeur) return; valeur = id; onchoisir?.(id); }
  function touche(e: KeyboardEvent) {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : e.key === 'Home' ? -99 : e.key === 'End' ? 99 : 0; if (!d) return;
    e.preventDefault(); const k = Math.max(0, Math.min(options.length - 1, Math.abs(d) > 1 ? (d < 0 ? 0 : options.length - 1) : i + d)); choisir(options[k].id);
    (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role=tab]')[k]?.focus();
  }
</script>

<div class="seg" class:petit role="tablist" aria-label={label} tabindex="-1" onkeydown={touche} style="--n: {options.length}; --i: {i}">
  <span class="pastille" aria-hidden="true"></span>
  {#each options as o (o.id)}
    <button type="button" role="tab" id="{idPrefixe}-{o.id}" aria-selected={o.id === valeur} tabindex={o.id === valeur ? 0 : -1} onclick={() => choisir(o.id)}>{o.label}</button>
  {/each}
</div>

<style>
  .seg { position: relative; display: grid; grid-template-columns: repeat(var(--n), 1fr); padding: 4px; border-radius: 18px; background: rgba(255, 255, 255, 0.07); border: 1px solid rgba(255, 255, 255, 0.12); backdrop-filter: blur(12px); }
  .pastille { position: absolute; top: 4px; bottom: 4px; left: 4px; width: calc((100% - 8px) / var(--n)); border-radius: 14px; background: linear-gradient(135deg, rgba(139, 124, 255, 0.55), rgba(61, 224, 255, 0.4)); box-shadow: 0 6px 18px -6px rgba(124, 108, 255, 0.8), inset 0 1px 0 rgba(255, 255, 255, 0.3);
    transform: translateX(calc(var(--i) * 100%)); transition: transform 0.42s cubic-bezier(0.34, 1.4, 0.5, 1); }
  button { position: relative; z-index: 1; min-height: 44px; padding: 0 10px; border: 0; background: transparent; color: #b7c0db; border-radius: 14px; font: 700 14px 'Sora Variable', 'Sora', sans-serif; cursor: pointer; white-space: nowrap; transition: color 0.2s; }
  button[aria-selected='true'] { color: #fff; }
  button:focus-visible { outline: 2px solid #7febff; outline-offset: -2px; }
  .petit button { font-size: 13px; padding: 0 8px; }
  @media (prefers-reduced-motion: reduce) { .pastille { transition: none; } }
</style>

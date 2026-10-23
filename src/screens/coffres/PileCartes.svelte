<script lang="ts" generics="T">
  import type { Snippet } from 'svelte';
  /** Pile de cartes à faire glisser (doigt ou souris). La carte de devant est `courant` ; les autres sont décalées derrière. */
  let { items, courant = $bindable(0), carte, hauteur = 280, libelle = 'Pile de cartes' }: { items: T[]; courant: number; carte: Snippet<[T, number]>; hauteur?: number; libelle?: string } = $props();
  const n = $derived(items.length);
  let dx = $state(0); let glisse = $state(false); let debutX = 0; let bouge = false;
  const position = (i: number) => (n ? (i - courant + n) % n : 0);
  const aller = (delta: number) => { if (n > 1) courant = (courant + delta + n) % n; };
  function bas(e: PointerEvent) { if (n < 2) return; glisse = true; bouge = false; debutX = e.clientX; dx = 0; }
  function deplace(e: PointerEvent) { if (!glisse) return; dx = e.clientX - debutX; if (Math.abs(dx) > 8) bouge = true; }
  function haut() {
    if (!glisse) return; glisse = false;
    if (dx < -60) aller(1); else if (dx > 60) aller(-1);
    dx = 0;
  }
  /** Un glissement ne doit pas déclencher le lien sous le doigt. */
  const clic = (e: MouseEvent) => { if (bouge) { e.preventDefault(); e.stopPropagation(); bouge = false; } };
  function transform(p: number) {
    if (p === 0) return glisse ? `translateX(${dx}px) rotate(${dx / 24}deg)` : 'none';
    return `translateY(${p * 14}px) scale(${1 - p * 0.055})`;
  }
</script>

<div class="pile" style:height="{hauteur + 40}px" role="group" aria-roledescription="pile de cartes" aria-label={libelle}>
  {#each items as it, i (i)}
    {@const p = position(i)}
    <div class="carte" class:devant={p === 0} class:glisse={glisse && p === 0} style:height="{hauteur}px" style:z-index={n - p} style:opacity={p > 2 ? 0 : 1 - p * 0.22}
      style:transform={transform(p)} inert={p !== 0} aria-hidden={p !== 0}
      onpointerdown={p === 0 ? bas : undefined} onpointermove={p === 0 ? deplace : undefined} onpointerup={p === 0 ? haut : undefined} onpointercancel={p === 0 ? haut : undefined} onclickcapture={p === 0 ? clic : undefined}>
      {@render carte(it, i)}
    </div>
  {/each}
  <div class="points" aria-hidden="true">{#each items as _, i (i)}<span class:on={position(i) === 0}></span>{/each}</div>
</div>

<style>
  .pile { position: relative; touch-action: pan-y; }
  .carte { position: absolute; left: 0; right: 0; top: 0; transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.3s; user-select: none; touch-action: pan-y; }
  .carte:not(.devant) :global(article > *) { visibility: hidden; }
  .carte.glisse { transition: none; cursor: grabbing; } .devant { cursor: grab; }
  .points { position: absolute; left: 0; right: 0; bottom: 0; display: flex; justify-content: center; gap: 6px; }
  .points span { width: 8px; height: 6px; border-radius: 3px; background: var(--ligne-forte); transition: width 0.3s, background 0.3s; } .points span.on { width: 22px; background: var(--texte); }
</style>

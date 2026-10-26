<script lang="ts">
  /** Une cellule du tableau à palettes (split-flap) : moitié haute plus claire, charnière au milieu. `grande` : la marque ; sinon : un code de destination. */
  let { ch, pose = false, grande = false }: { ch: string; pose?: boolean; grande?: boolean } = $props();
</script>
<span class="cel" class:grande class:pose data-flap="1" aria-hidden="true">{ch}<span class="charn"></span></span>
<style>
  .cel { position: relative; flex: 0 1 20px; min-width: 0; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 4px; background: #1C1F25; box-shadow: inset 0 -14px 0 #15171B; font: 600 15px/1 'IBM Plex Mono', ui-monospace, monospace; color: var(--ink3); transition: color 160ms ease; }
  .charn { position: absolute; left: 0; right: 0; top: 13px; height: 2px; background: #060708; }
  .pose { color: var(--signal); animation: nx-flap 160ms ease-out; }
  .grande { flex-basis: 40px; height: 58px; border-radius: 6px; box-shadow: inset 0 -29px 0 #15171B; font-size: 34px; } .grande .charn { top: 28px; }
  /* PC : palettes du tableau large (planche WebOuverture). */
  @media (min-width: 900px) {
    .cel { flex: none; width: 26px; height: 36px; border-radius: 6px; background: #1B2D45; box-shadow: inset 0 -18px 0 #15263C; font-size: 19px; color: #C9D3DF; } .charn { top: 17px; background: #0B1B2E; }
    .pose { color: var(--signal); }
    .grande { width: 52px; height: 76px; box-shadow: inset 0 -38px 0 #15263C; font-size: 44px; } .grande .charn { top: 37px; }
  }
  @media (prefers-reduced-motion: reduce) { .pose { animation: none; } }
</style>

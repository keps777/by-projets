<script lang="ts">
  let { actif, onchange, label, couleur = 'var(--accent)' }: { actif: boolean; onchange: (v: boolean) => void; label: string; couleur?: string } = $props();
</script>

<button type="button" role="switch" aria-checked={actif} aria-label={label} class="sw" class:actif style:--on={couleur} onclick={() => onchange(!actif)}>
  <span></span>
</button>

<style>
  .sw { flex: none; width: 44px; height: 26px; border-radius: 13px; border: 0; padding: 0; position: relative; background: var(--piste-interrupteur); transition: background 0.2s; }
  .sw.actif { background: var(--on); }
  .sw span { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 10px; background: #fff; transition: left 0.2s; }
  .sw.actif span { left: 21px; }
  .sw::after { content: ''; position: absolute; inset: -9px -4px; }
</style>

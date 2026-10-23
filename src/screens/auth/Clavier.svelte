<script lang="ts">
  /** Pavé numérique à 12 touches (1-9, vide, 0, effacer). Accepte aussi le clavier physique. */
  let { onchiffre, oneffacer, desactive = false, compact = false, physique = true }: {
    onchiffre: (d: string) => void; oneffacer: () => void; desactive?: boolean; compact?: boolean; physique?: boolean;
  } = $props();
  const chiffres = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
  function touche(e: KeyboardEvent) {
    if (desactive || !physique || e.ctrlKey || e.metaKey || e.altKey) return;
    const cible = e.target as HTMLElement | null;
    if (cible && (cible.tagName === 'INPUT' || cible.tagName === 'TEXTAREA' || cible.tagName === 'SELECT' || cible.isContentEditable)) return;
    if (/^\d$/.test(e.key)) { e.preventDefault(); onchiffre(e.key); }
    else if (e.key === 'Backspace') { e.preventDefault(); oneffacer(); }
  }
</script>

<svelte:window onkeydown={touche} />

<div class="pave" class:compact role="group" aria-label="Pavé numérique">
  {#each chiffres as d (d)}<button type="button" aria-label="Chiffre {d}" disabled={desactive} onclick={() => onchiffre(d)}>{d}</button>{/each}
  <span aria-hidden="true"></span>
  <button type="button" aria-label="Chiffre 0" disabled={desactive} onclick={() => onchiffre('0')}>0</button>
  <button type="button" class="eff" aria-label="Effacer" disabled={desactive} onclick={oneffacer}>⌫</button>
</div>

<style>
  .pave { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .pave.compact { gap: 6px; }
  button { height: 54px; border-radius: 14px; border: 1px solid var(--ligne); background: var(--carte); font: 500 22px var(--mono); transition: transform 0.08s, background 0.15s; }
  .compact button { height: 48px; font-size: 20px; }
  button:active:not(:disabled) { transform: scale(0.96); background: var(--carte2); }
  button:disabled { opacity: 0.45; cursor: default; }
  .eff { font-size: 20px; color: var(--doux); }
</style>

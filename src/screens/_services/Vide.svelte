<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icone from '../../ui/Icone.svelte';
  /** État vide : icône, titre, explication, puis action(s) en enfant. */
  let { icone, titre, texte, children }: { icone: string; titre: string; texte: string; children?: Snippet } = $props();
</script>

<div class="vide">
  <span class="ico" aria-hidden="true"><Icone nom={icone} taille={26} /></span>
  <h2>{titre}</h2>
  <p>{texte}</p>
  {#if children}<div class="act">{@render children()}</div>{/if}
</div>

<style>
  .vide { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 10px; padding: 36px 18px; border: 1px dashed var(--ligne-forte); border-radius: 22px; }
  .ico { width: 56px; height: 56px; border-radius: 28px; background: var(--primaire-fond); color: var(--pale); display: grid; place-items: center; }
  h2 { font-size: 17px; } p { color: var(--muted); font-size: 13.5px; max-width: 30ch; line-height: 1.45; } .act { width: 100%; margin-top: 6px; display: flex; flex-direction: column; gap: 8px; }
</style>

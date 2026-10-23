<script lang="ts">
  import type { LigneH } from './types.ts';
  /** Barres horizontales : libellé, barre SVG, valeur. Chaque ligne est lisible telle quelle (c'est son propre tableau). */
  let { lignes, selection = -1, onchoisir, titre }: { lignes: LigneH[]; selection?: number; onchoisir?: (i: number) => void; titre: string } = $props();
  const max = $derived(Math.max(1, ...lignes.map((l) => l.valeur)));
</script>

<ul class="h" aria-label={titre}>
  {#each lignes as l, i (l.libelle)}
    {#snippet corps()}
      <span class="lib">{l.libelle}{#if l.note}<small>{l.note}</small>{/if}</span>
      <svg viewBox="0 0 100 12" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect width="100" height="12" rx="6" class="piste" /><rect width={Math.max(l.valeur > 0 ? 1.5 : 0, (l.valeur / max) * 100)} height="12" rx="6" fill={l.couleur} /></svg>
      <strong class="mono">{l.texte}</strong>
    {/snippet}
    <li class:actif={i === selection}>
      {#if onchoisir}<button onclick={() => onchoisir?.(i)} aria-pressed={i === selection}>{@render corps()}</button>{:else}<div>{@render corps()}</div>{/if}
    </li>
  {/each}
</ul>

<style>
  .h { list-style: none; display: flex; flex-direction: column; gap: 2px; }
  li > button, li > div { display: grid; grid-template-columns: minmax(96px, 1.1fr) 2fr minmax(70px, auto); align-items: center; gap: 10px; width: 100%; min-height: 44px; padding: 4px 8px; border-radius: 10px; text-align: left; font-size: 14px; }
  li > button:hover, li.actif > button { background: var(--carte2); } .lib { display: flex; flex-direction: column; } small { color: var(--muted); font-size: 12px; }
  svg { width: 100%; height: 12px; display: block; } .piste { fill: var(--carte2); } li.actif .piste { fill: var(--ligne-forte); } strong { text-align: right; font-size: 13.5px; }
  @media (max-width: 480px) { li > button, li > div { grid-template-columns: 1fr auto; } svg { grid-column: 1 / -1; grid-row: 2; } }
</style>

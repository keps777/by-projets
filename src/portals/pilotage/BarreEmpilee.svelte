<script lang="ts">
  import type { LigneH } from './types.ts';
  let { lignes, selection = -1, titre }: { lignes: LigneH[]; selection?: number; titre: string } = $props();
  const total = $derived(lignes.reduce((s, l) => s + l.valeur, 0));
  const gap = 1.2;
  const segs = $derived(lignes.filter((l) => l.valeur > 0).reduce<{ x: number; l: LigneH; w: number }[]>((acc, l) => {
    const w = total > 0 ? (l.valeur / total) * 100 : 0, x = acc.length ? acc[acc.length - 1].x + acc[acc.length - 1].w : 0;
    acc.push({ x, l, w }); return acc;
  }, []));
  const idt = $props.id();
</script>

<svg viewBox="0 0 100 10" preserveAspectRatio="none" role="img" aria-labelledby="t{idt}" class="e">
  <title id="t{idt}">{titre} : {lignes.map((l) => `${l.libelle} ${l.texte}`).join(', ')}</title>
  {#each segs as s (s.l.libelle)}<rect x={s.x + gap / 2} width={Math.max(0.5, s.w - gap)} height="10" rx="2" fill={s.l.couleur} opacity={selection < 0 || lignes[selection]?.libelle === s.l.libelle ? 1 : 0.25} />{/each}
</svg>

<style>.e { width: 100%; height: 16px; display: block; border-radius: 8px; }</style>

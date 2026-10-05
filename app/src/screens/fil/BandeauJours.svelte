<script lang="ts">
  import { ajouterJours, lundiDe, JOURS_LONGS } from '@core/dates.ts';
  import { blocsDuJour } from '../../data/requetes.ts';
  import { statsJour } from './vue-blocs.ts';

  /** Bandeau des 7 jours de la semaine du jour affiché : toucher un jour l'affiche ; la barre montre ce qui est fait. */
  let { jour, aujourdhui, onchoisir }: { jour: string; aujourdhui: string; onchoisir: (j: string) => void } = $props();

  const LETTRES = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const jours = $derived.by(() => {
    const lundi = lundiDe(jour);
    return LETTRES.map((l, i) => {
      const j = ajouterJours(lundi, i);
      return { j, l, num: +j.slice(8), nom: JOURS_LONGS[i], pct: j <= aujourdhui ? statsJour(blocsDuJour(j)).pct : 0 };
    });
  });
</script>

<div class="bandeau">
  {#each jours as d (d.j)}
    <button type="button" onclick={() => onchoisir(d.j)} aria-label="{d.nom} {d.num}" aria-pressed={d.j === jour}>
      <span class="lettre">{d.l}</span>
      <span class="num" class:auj={d.j === aujourdhui} class:sel={d.j === jour && d.j !== aujourdhui}>{d.num}</span>
      <span class="piste"><span class="barre" class:auj={d.j === aujourdhui} style:width="{d.pct}%"></span></span>
    </button>
  {/each}
</div>

<style>
  .bandeau { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); padding: 4px 10px 8px; border-bottom: 1px solid var(--ligne); flex: none; }
  button { border: 0; background: transparent; padding: 0; min-height: 44px; display: flex; flex-direction: column; align-items: center; gap: 3px; }
  .lettre { font-size: 11px; font-weight: 600; color: var(--muted); }
  .num { width: 34px; height: 34px; border-radius: 17px; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 600; }
  .num.sel { background: var(--surface-2); }
  .num.auj { background: var(--jour-aujourdhui); color: var(--jour-aujourdhui-texte); }
  .piste { width: 24px; height: 3px; border-radius: 2px; background: var(--surface-2); overflow: hidden; }
  .barre { display: block; height: 3px; background: var(--muted); }
  .barre.auj { background: var(--maintenant); }
</style>

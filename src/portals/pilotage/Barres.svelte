<script lang="ts">
  import { echelle } from '../../core/pilotage.ts';
  import TableauAlt from './TableauAlt.svelte';
  import type { Barre } from './types.ts';
  let { titre, desc, donnees, selection = -1, onchoisir, unite = '', hauteur = 220, serie = 'Valeur' }: {
    titre: string; desc: string; donnees: Barre[]; selection?: number; onchoisir?: (i: number) => void; unite?: string; hauteur?: number; serie?: string;
  } = $props();
  const n = $derived(donnees.length);
  const gauche = 32, haut = 22, bas = 26;
  const pas = $derived(donnees.length <= 6 ? 76 : 44);
  const larg = $derived(gauche + n * pas + 6);
  const ech = $derived(echelle(Math.max(0, ...donnees.map((d) => d.valeur))));
  const zone = $derived(hauteur - haut - bas);
  const yDe = (v: number) => haut + zone - (zone * Math.max(0, v)) / ech.max;
  const court = (v: number) => (v >= 1000 ? `${Math.round(v / 100) / 10} k`.replace('.', ',') : String(Math.round(v * 10) / 10).replace('.', ','));
  const cle = (e: KeyboardEvent, i: number) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onchoisir?.(i); } };
  const idt = $props.id();
  let defile = $state<HTMLElement | null>(null);
  // Garde la barre sélectionnée visible quand le graphique défile (écran étroit).
  $effect(() => { if (defile && selection >= 0) defile.scrollLeft = Math.max(0, gauche + (selection + 0.5) * pas - defile.clientWidth / 2); });
</script>

<figure class="fig">
  <div class="def" bind:this={defile}>
    <svg viewBox="0 0 {larg} {hauteur}" style:min-width="{larg}px" style:max-width="{Math.round(larg * 1.3)}px" role="group" aria-labelledby="t{idt} d{idt}">
      <title id="t{idt}">{titre}</title><desc id="d{idt}">{desc}</desc>
      {#each ech.graduations as g (g)}
        <line x1={gauche} x2={larg - 4} y1={yDe(g)} y2={yDe(g)} class="grille" />
        <text x={gauche - 6} y={yDe(g) + 4} class="axe" text-anchor="end">{court(g)}</text>
      {/each}
      {#each donnees as d, i (i)}
        {@const x = gauche + i * pas}
        {#snippet dessin()}
          <rect class="zone" {x} y={haut} width={pas} height={zone + bas} />
          <rect x={x + 7} y={yDe(d.valeur)} width={pas - 14} height={Math.max(2, haut + zone - yDe(d.valeur))} rx="5" fill={d.couleur} />
          {#if i === selection}<text x={x + pas / 2} y={yDe(d.valeur) - 5} text-anchor="middle" class="val">{court(d.valeur)}</text>{/if}
          <text x={x + pas / 2} y={hauteur - 8} text-anchor="middle" class="axe" class:gras={i === selection}>{d.libelle}</text>
        {/snippet}
        {#if onchoisir}
          <g class="barre" class:actif={i === selection} role="button" tabindex="0" aria-label={d.aria} aria-pressed={i === selection} onclick={() => onchoisir?.(i)} onkeydown={(e) => cle(e, i)}>{@render dessin()}</g>
        {:else}
          <g class="barre" role="img" aria-label={d.aria}>{@render dessin()}</g>
        {/if}
      {/each}
      <line x1={gauche} x2={larg - 4} y1={haut + zone} y2={haut + zone} class="base" />
    </svg>
  </div>
  <TableauAlt legende={titre} colonnes={['Période', `${serie}${unite ? ` (${unite})` : ''}`]} lignes={donnees.map((d) => [d.libelle, d.texte])} />
</figure>

<style>
  .fig { display: flex; flex-direction: column; gap: 4px; } .def { overflow-x: auto; }
  svg { display: block; width: 100%; height: auto; } .grille { stroke: var(--ligne); stroke-width: 1; } .base { stroke: var(--ligne-forte); stroke-width: 1.5; }
  .axe { font: 11px var(--sans); fill: var(--muted); } .axe.gras { fill: var(--texte); font-weight: 700; } .val { font: 700 11px var(--sans); fill: var(--texte); }
  .zone { fill: transparent; } .barre[role='button'] { cursor: pointer; outline: none; } .barre[role='button']:hover .zone { fill: rgba(48, 80, 255, 0.06); }
  .barre[role='button']:focus-visible .zone { stroke: var(--primaire); stroke-width: 2; rx: 6; } .barre.actif .zone { fill: rgba(48, 80, 255, 0.08); }
</style>

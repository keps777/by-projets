<script lang="ts">
  // Temps d'un sous-projet qui en suit plusieurs : chaque temps avec son total du mois (et son objectif), puis le total de tout.
  import { cibleDuMois, fenetreDuMois } from '@core/progression.ts';
  import type { Metrique } from '@core/types.ts';
  import type { SousProjetLigne } from '@core/lignes.ts';
  import { valeursDuSousProjet } from '../../data/requetes.ts';
  import { dureeMin } from '../fil/format.ts';
  import { totauxDeTemps } from './temps-total.ts';

  let { sp, metriques, mois }: { sp: SousProjetLigne; metriques: Metrique[]; mois: string } = $props();

  const f = $derived(fenetreDuMois(sp, mois));
  const t = $derived(f ? totauxDeTemps(metriques, valeursDuSousProjet(sp), f.debut, f.fin) : null);
  const cible = (m: Metrique) => cibleDuMois(m, sp, mois);
  const texte = (s: number) => dureeMin(Math.round(s / 60));
  const totalCible = $derived(t ? t.lignes.reduce((s, l) => s + (cible(l.m) ?? 0), 0) : 0);
</script>

{#if t}
  <section class="carte temps" aria-label="Temps du mois">
    <span class="etiquette">Temps · ce mois</span>
    {#each t.lignes as l (l.m.id)}
      {@const c = cible(l.m)}
      <div class="ligne">
        <span class="nom">{l.m.nom}</span>
        <span class="mono val">{texte(l.total)}{#if c}<span class="muted"> / {texte(c)}</span>{/if}</span>
        {#if c}<span class="piste"><span class="rempli" style:width="{Math.min(100, Math.round((l.total / c) * 100))}%"></span></span>{/if}
      </div>
    {/each}
    <div class="ligne total">
      <span class="nom">Total de tous les temps</span>
      <span class="mono val">{texte(t.total)}{#if totalCible}<span class="muted"> / {texte(totalCible)}</span>{/if}</span>
    </div>
  </section>
{/if}

<style>
  .temps { border-radius: 20px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
  .ligne { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 10px; align-items: baseline; font-size: 14px; }
  .nom { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
  .val { font-size: 14px; }
  .piste { grid-column: 1 / -1; position: relative; display: block; height: 6px; border-radius: 3px; background: var(--piste); overflow: hidden; }
  .rempli { position: absolute; left: 0; top: 0; bottom: 0; border-radius: inherit; background: var(--c); }
  .total { padding-top: 10px; border-top: 1px solid var(--ligne); font-size: 15px; }
  .total .nom { color: var(--c-encre, var(--texte)); }
</style>

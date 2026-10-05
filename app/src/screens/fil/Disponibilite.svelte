<script lang="ts">
  import type { Disponibilite } from '@core/disponibilite.ts';
  import { COULEUR_SANS_PROJET, type BlocVue } from '../../data/requetes.ts';
  import { couleurRubrique, styleCouleur } from '../../ui/couleurs.ts';
  import { theme } from '../../ui/theme.svelte.ts';
  import Icone from '../../ui/Icone.svelte';
  import { dureeMin, hm } from './format.ts';

  /** Résultat de la vérification de disponibilité : « Créneau libre », ou la tâche en conflit et les créneaux libres juste après et juste avant. */
  let { dispo, duree, occupant, detaille = false, onchoisir }: {
    dispo: Disponibilite; duree: number; occupant?: BlocVue; detaille?: boolean; onchoisir: (debut: number) => void;
  } = $props();

  const suggestions = $derived([
    dispo.apres != null ? { type: 'Juste après', debut: dispo.apres } : null,
    dispo.avant != null ? { type: 'Juste avant', debut: dispo.avant } : null
  ].filter((x): x is { type: string; debut: number } => x !== null));
  const titre = $derived(occupant?.titre ?? dispo.occupePar?.titre ?? '');
</script>

{#if dispo.libre}
  <div class="libre">
    <Icone nom="coche" taille={18} trait={2.6} />
    {detaille ? (dispo.libreJusqua != null ? `Libre jusqu’à ${hm(dispo.libreJusqua)}` : 'Libre pour le reste de la journée') : 'Créneau libre'}
  </div>
{:else}
  <div class="occupe">
    {#if detaille}
      <span class="alerte-texte fort">Ce créneau est déjà occupé par :</span>
      <div class="occupant" style={styleCouleur(couleurRubrique(occupant?.couleur ?? COULEUR_SANS_PROJET, theme.mode))}>
        <span class="barre"></span>
        <span class="col"><span class="nom">{titre}</span>
          {#if dispo.occupePar}<span class="mono heures">{hm(dispo.occupePar.debut)} – {hm(dispo.occupePar.fin)}{occupant ? ` · ${occupant.projet?.nom ?? 'Sans projet'}` : ''}</span>{/if}
        </span>
      </div>
      {#if suggestions.length}<span class="alerte-texte">Créneaux libres les plus proches pour {dureeMin(duree)} :</span>{/if}
    {:else}
      <span class="alerte-texte fort">Occupé par « {titre} »</span>
    {/if}
    {#if suggestions.length}
      <div class="sugg">
        {#each suggestions as s (s.type)}
          <button type="button" onclick={() => onchoisir(s.debut)}>
            <span class="muted type">{s.type}</span><span class="mono">{hm(s.debut)} – {hm(s.debut + duree)}</span>
          </button>
        {/each}
      </div>
    {/if}
    {#if !detaille}<span class="alerte-texte petit">Tu peux aussi garder cette heure : les deux tâches se chevauchent.</span>{/if}
  </div>
{/if}

<style>
  .libre { display: flex; align-items: center; gap: 10px; background: var(--bon-fond); color: var(--bon); border-radius: 16px; padding: 12px 14px; font-size: 14px; font-weight: 600; }
  .occupe { display: flex; flex-direction: column; gap: 10px; background: var(--alerte-fond); border-radius: 16px; padding: 12px 14px; }
  .alerte-texte { font-size: 12px; color: var(--alerte); }
  .alerte-texte.fort { font-size: 13px; font-weight: 600; }
  .occupant { display: flex; align-items: center; gap: 10px; background: var(--c-fond); color: var(--c-encre); border-radius: 12px; padding: 10px 12px; }
  .occupant .barre { width: 8px; height: 30px; border-radius: 4px; background: var(--c); flex: none; }
  .col { display: flex; flex-direction: column; min-width: 0; }
  .nom { font-size: 14px; font-weight: 600; }
  .heures { font-size: 11px; opacity: 0.85; }
  .sugg { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  .sugg button { min-height: 52px; border-radius: 12px; border: 0; background: var(--surface); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; }
  .sugg .type { font-size: 11px; }
  .sugg .mono { font-size: 14px; }
</style>

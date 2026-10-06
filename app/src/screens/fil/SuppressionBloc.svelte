<script lang="ts">
  // Supprimer la tâche d'un bloc : une seule occurrence, celle-ci et les suivantes, ou toute la série (spec §7.2).
  import type { Tache } from '@core/lignes.ts';
  import Volet from '../../ui/Volet.svelte';
  import { supprimerOccurrences, type Portee } from '../../data/actions/taches.ts';
  import { dire } from '../../ui/toast.svelte.ts';

  let { ouvert, tache, occId, titre, onfermer, onsupprime }: {
    ouvert: boolean; tache: Tache | null; occId: string | null; titre: string; onfermer: () => void; onsupprime: () => void;
  } = $props();

  const serie = $derived(!!tache && tache.regle.frequence !== 'une_fois');

  function supprimer(portee: Portee) {
    if (!tache) return;
    supprimerOccurrences(tache.id, portee, occId ?? undefined);
    dire(portee === 'cette' ? 'Bloc supprimé' : portee === 'suivantes' ? 'Ce bloc et les suivants sont supprimés' : 'Tâche supprimée');
    onsupprime();
  }
</script>

<Volet {ouvert} {onfermer} label="Supprimer">
  <div class="choix">
    <h2 class="titre">{serie ? 'Supprimer une tâche qui se répète' : 'Supprimer cette tâche ?'}</h2>
    <p class="muted">« {titre} »{serie ? '' : ' disparaîtra du Fil. Ce que tu as déjà enregistré dans les sous-projets reste.'}</p>
    {#if serie}
      <button type="button" onclick={() => supprimer('cette')}><span class="t">Seulement ce bloc</span><span class="muted s">Les autres jours restent</span></button>
      <button type="button" onclick={() => supprimer('suivantes')}><span class="t">Celui-ci et les suivants</span><span class="muted s">La série s’arrête la veille</span></button>
      <button type="button" class="danger" onclick={() => supprimer('toute')}><span class="t">Toute la série</span><span class="muted s">Les blocs déjà faits sont gardés</span></button>
    {:else}
      <button type="button" class="danger" onclick={() => supprimer('toute')}><span class="t">Supprimer la tâche</span></button>
    {/if}
    <button type="button" class="annuler" onclick={onfermer}>Annuler</button>
  </div>
</Volet>

<style>
  .choix { display: flex; flex-direction: column; gap: 10px; }
  h2 { font-size: 22px; }
  button { min-height: 56px; border-radius: 16px; border: 1px solid var(--ligne); background: var(--surface); color: var(--texte); text-align: left; padding: 8px 16px; display: flex; flex-direction: column; justify-content: center; gap: 2px; }
  .t { font-size: 16px; font-weight: 600; }
  .s { font-size: 12px; }
  .danger .t { color: var(--mauvais); }
  .annuler { align-items: center; border: 0; background: transparent; color: var(--muted); font-size: 15px; font-weight: 600; }
</style>

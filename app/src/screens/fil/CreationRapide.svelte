<script lang="ts">
  import Icone from '../../ui/Icone.svelte';
  import type { MesureRapide } from '../../data/actions/projets.ts';

  /** Création en une ligne d'un projet (nom seul) ou d'un sous-projet (nom + ce qu'il mesure), sans quitter « Nouvelle tâche ». */
  let { libelle, exemple, avecMesure = false, oncreer }: {
    libelle: string; exemple: string; avecMesure?: boolean; oncreer: (nom: string, mesure: MesureRapide) => void;
  } = $props();

  const MESURES: { valeur: MesureRapide; label: string }[] = [
    { valeur: 'temps', label: 'Le temps' }, { valeur: 'fois', label: 'Le nombre de fois' }, { valeur: 'les_deux', label: 'Les deux' }
  ];
  let ouvert = $state(false);
  let nom = $state('');
  let mesure = $state<MesureRapide>('temps');

  function creer() {
    const n = nom.trim();
    if (!n) return;
    oncreer(n, mesure);
    nom = ''; mesure = 'temps'; ouvert = false;
  }
</script>

{#if !ouvert}
  <button type="button" class="ouvrir" onclick={() => (ouvert = true)}><Icone nom="plus" taille={16} trait={2.4} /> {libelle}</button>
{:else}
  <form class="forme" onsubmit={(e) => { e.preventDefault(); creer(); }}>
    <!-- svelte-ignore a11y_autofocus -->
    <input type="text" bind:value={nom} placeholder={exemple} aria-label={libelle} autocomplete="off" enterkeyhint="done" autofocus />
    {#if avecMesure}
      <div class="mesures" role="group" aria-label="Ce que le sous-projet mesure">
        {#each MESURES as m (m.valeur)}
          <button type="button" class:actif={mesure === m.valeur} aria-pressed={mesure === m.valeur} onclick={() => (mesure = m.valeur)}>{m.label}</button>
        {/each}
      </div>
    {/if}
    <div class="actions">
      <button type="button" class="annuler" onclick={() => { ouvert = false; nom = ''; }}>Annuler</button>
      <button type="submit" class="creer" disabled={!nom.trim()}>Créer</button>
    </div>
  </form>
{/if}

<style>
  .ouvrir { width: 100%; min-height: 48px; border: 0; border-top: 1px solid var(--ligne); background: transparent; display: flex; align-items: center; gap: 8px; padding: 0 14px; font-size: 14px; font-weight: 600; color: var(--accent-encre); text-align: left; }
  .forme { display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; border-top: 1px solid var(--ligne); }
  input { width: 100%; min-height: 46px; border-radius: 14px; border: 1px solid var(--ligne); background: var(--surface-2); padding: 0 12px; font-size: 16px; }
  .mesures { display: flex; flex-wrap: wrap; gap: 6px; }
  .mesures button { min-height: 40px; padding: 0 12px; border-radius: 20px; border: 1px solid var(--ligne); background: transparent; font-size: 13px; font-weight: 600; }
  .mesures button.actif { background: var(--c); border-color: var(--c); color: var(--c-sur); }
  .actions { display: flex; gap: 8px; justify-content: flex-end; }
  .actions button { min-height: 44px; padding: 0 18px; border-radius: 14px; border: 1px solid var(--ligne); background: transparent; font-size: 14px; font-weight: 600; }
  .actions .creer { background: var(--c); border-color: var(--c); color: var(--c-sur); }
  .actions .creer:disabled { opacity: 0.4; }
</style>

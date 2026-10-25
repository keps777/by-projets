<script lang="ts" module>
  export interface OptionListe { id: string; label: string; detail?: string }
</script>

<script lang="ts">
  import Feuille from '../../ui/Feuille.svelte';
  import IconeCv from './IconeCv.svelte';
  /** Sélecteur en fenêtre : une liste de choix (villes, quartiers, jours) avec recherche facultative et une première option « partout / tous ». */
  let { ouvert = $bindable(false), titre, sous = '', options, valeur, toutes = '', recherche = false, onchoisir }: {
    ouvert?: boolean; titre: string; sous?: string; options: OptionListe[]; valeur: string; toutes?: string; recherche?: boolean; onchoisir: (id: string) => void;
  } = $props();
  let filtre = $state('');
  $effect(() => { if (ouvert) filtre = ''; });
  const liste = $derived(options.filter((o) => !filtre.trim() || o.label.toLowerCase().includes(filtre.trim().toLowerCase())));
  function prendre(id: string) { onchoisir(id); ouvert = false; }
</script>

<Feuille bind:ouvert {titre} {sous}>
  {#if recherche}<input class="inp" type="search" placeholder="Rechercher…" aria-label="Rechercher dans la liste" bind:value={filtre} />{/if}
  <div class="liste" role="listbox" aria-label={titre}>
    {#if toutes && !filtre}<button type="button" role="option" aria-selected={valeur === ''} class="opt" class:on={valeur === ''} onclick={() => prendre('')}><span class="grow t15 b7">{toutes}</span>{#if valeur === ''}<IconeCv nom="valide" taille={18} trait={2.4} />{/if}</button>{/if}
    {#each liste as o (o.id)}
      <button type="button" role="option" aria-selected={valeur === o.id} class="opt" class:on={valeur === o.id} onclick={() => prendre(o.id)}>
        <span class="col grow"><span class="t15 b7">{o.label}</span>{#if o.detail}<span class="t12 mut">{o.detail}</span>{/if}</span>{#if valeur === o.id}<span class="aq"><IconeCv nom="valide" taille={18} trait={2.4} /></span>{/if}
      </button>
    {:else}<span class="t14 mut c">Aucun résultat.</span>{/each}
  </div>
</Feuille>

<style>
  .liste { display: flex; flex-direction: column; gap: 6px; }
  .opt { display: flex; align-items: center; gap: 10px; min-height: 56px; padding: 6px 14px; border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(255, 255, 255, 0.05); color: #f2f4ff; font: inherit; text-align: left; cursor: pointer; }
  .opt.on { border-color: #8b7cff; background: linear-gradient(135deg, rgba(139, 124, 255, 0.25), rgba(61, 224, 255, 0.1)); } .opt:focus-visible { outline: 2px solid #7febff; outline-offset: 2px; }
  .t15 { font-size: 15px; }
</style>

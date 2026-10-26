<script lang="ts">
  import Icone from './Icone.svelte';
  /** Champ de formulaire accessible : libellé, aide, erreur annoncée (role="alert") avec icône et texte, jamais la couleur seule. */
  let { id, label, valeur = $bindable(''), type = 'text', aide = '', erreur = '', inputmode, autocomplete, placeholder = '', requis = false, maxlength, onsaisie }:
    { id: string; label: string; valeur?: string; type?: string; aide?: string; erreur?: string; inputmode?: 'text' | 'email' | 'tel' | 'numeric' | 'search'; autocomplete?: import('svelte/elements').FullAutoFill; placeholder?: string; requis?: boolean; maxlength?: number; onsaisie?: (v: string) => void } = $props();
</script>
<div class="champ" data-erreur={erreur ? '' : undefined}>
  <label for={id}>{label}{#if requis}<span aria-hidden="true"> *</span>{/if}</label>
  <input {id} {type} {inputmode} {autocomplete} {placeholder} {maxlength} bind:value={valeur} oninput={() => onsaisie?.(valeur)} aria-invalid={erreur ? 'true' : undefined} aria-required={requis ? 'true' : undefined} aria-describedby={erreur ? `${id}-e` : aide ? `${id}-a` : undefined} />
  {#if erreur}<span class="erreur" id="{id}-e" role="alert"><Icone nom="alerte" taille={16} />{erreur}</span>{:else if aide}<span class="aide" id="{id}-a">{aide}</span>{/if}
</div>

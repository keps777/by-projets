<script lang="ts">
  /** Liste déroulante étiquetée (le kit n'a que des champs de saisie). */
  let { valeur = $bindable(''), etiquette, options, erreur = '' }: { valeur?: string; etiquette: string; options: string[]; erreur?: string } = $props();
  const id = `s${Math.random().toString(36).slice(2, 8)}`;
</script>

<div class="champ" class:err={!!erreur}>
  <label class="et" for={id}>{etiquette}</label>
  <select {id} bind:value={valeur} aria-invalid={!!erreur} aria-describedby={erreur ? `${id}-e` : undefined}>{#each options as o (o)}<option value={o}>{o}</option>{/each}</select>
  {#if erreur}<span class="msg" id="{id}-e" role="alert">{erreur}</span>{/if}
</div>

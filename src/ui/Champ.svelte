<script lang="ts">
  let { valeur = $bindable(''), etiquette = '', placeholder = '', type = 'text', inputmode, erreur = '', suffixe = '', autofocus = false, oninput }: {
    valeur?: string; etiquette?: string; placeholder?: string; type?: string; inputmode?: 'numeric' | 'tel' | 'text' | 'decimal'; erreur?: string; suffixe?: string; autofocus?: boolean; oninput?: () => void;
  } = $props();
  const id = `c${Math.random().toString(36).slice(2, 8)}`;
</script>

<label for={id} class="champ" class:err={!!erreur}>
  {#if etiquette}<span class="et">{etiquette}</span>{/if}
  <span class="boite"><input {id} {type} {inputmode} {placeholder} bind:value={valeur} {oninput} {...(autofocus ? { autofocus: true } : {})} />{#if suffixe}<em>{suffixe}</em>{/if}</span>
  {#if erreur}<span class="msg" role="alert">{erreur}</span>{/if}
</label>

<style>
  .champ { display: flex; flex-direction: column; gap: 6px; } .et { font: 500 10.5px var(--mono); letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); }
  .boite { display: flex; align-items: center; gap: 8px; min-height: 52px; padding: 0 16px; border-radius: 14px; background: var(--carte); border: 1px solid var(--ligne-forte); }
  .boite:focus-within { border-color: var(--primaire); } .err .boite { border-color: var(--danger); } input { flex: 1; min-width: 0; font-size: 16px; outline: none; } em { font-style: normal; color: var(--muted); font-size: 13px; }
  .msg { color: var(--danger); font-size: 12.5px; }
</style>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { retour, aller } from '../router.svelte.ts';
  import Icone from './Icone.svelte';
  import Dock, { type ItemDock } from './Dock.svelte';
  /** Écran mobile standard : en-tête (retour, titre, action), corps défilant, dock optionnel. Même structure que les maquettes (.scr .hd .bd). */
  let { titre = '', sous = '', retourVers, sansRetour = false, dock, droite, enteteLibre, children, bas }: {
    titre?: string; sous?: string; retourVers?: string; sansRetour?: boolean; dock?: ItemDock[]; droite?: Snippet; enteteLibre?: Snippet; children: Snippet; bas?: Snippet;
  } = $props();
</script>

<div class="scr">
  {#if enteteLibre}{@render enteteLibre()}
  {:else if titre || droite}
    <header class="hd">
      <div class="row g12" style="min-width: 0">
        {#if !sansRetour}<button type="button" class="ib" aria-label="Retour" onclick={() => (retourVers ? aller(retourVers) : retour('/'))}><Icone nom="retour" /></button>{/if}
        <div class="col"><span class="ttl t18 ell">{titre}</span>{#if sous}<span class="t13 mut ell">{sous}</span>{/if}</div>
      </div>
      {#if droite}{@render droite()}{/if}
    </header>
  {/if}
  <div class="bd" class:nd={!dock}>{@render children()}</div>
  {#if bas}{@render bas()}{/if}
  {#if dock}<Dock items={dock} />{/if}
</div>

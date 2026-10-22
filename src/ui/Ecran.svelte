<script lang="ts">
  import type { Snippet } from 'svelte';
  import { retour } from '../router.svelte.ts';
  import Icone from './Icone.svelte';
  /** Écran mobile : en-tête (retour + titre), contenu défilant, pied fixe optionnel. */
  let { titre = '', sur = '', retourVers = '/', sansRetour = false, droite, pied, children }: {
    titre?: string; sur?: string; retourVers?: string; sansRetour?: boolean; droite?: Snippet; pied?: Snippet; children: Snippet;
  } = $props();
</script>

<section class="ecran">
  {#if titre || !sansRetour}
    <header>
      {#if !sansRetour}<button class="rond" onclick={() => retour(retourVers)} aria-label="Retour"><Icone nom="retour" taille={18} trait={2.2} /></button>{:else}<span></span>{/if}
      <div class="t">{#if sur}<small>{sur}</small>{/if}<h1>{titre}</h1></div>
      <div class="d">{#if droite}{@render droite()}{/if}</div>
    </header>
  {/if}
  <div class="corps">{@render children()}</div>
  {#if pied}<footer>{@render pied()}</footer>{/if}
</section>

<style>
  .ecran { display: flex; flex-direction: column; min-height: 100%; }
  header { display: grid; grid-template-columns: 40px 1fr 40px; align-items: center; gap: 8px; padding: calc(env(safe-area-inset-top) + 10px) 16px 6px; position: sticky; top: 0; background: color-mix(in srgb, var(--fond) 92%, transparent); backdrop-filter: blur(10px); z-index: 5; }
  .rond { width: 40px; height: 40px; border-radius: 20px; background: var(--carte); border: 1px solid var(--ligne); display: grid; place-items: center; }
  .t { text-align: center; min-width: 0; } .t small { display: block; font: 500 10px var(--mono); letter-spacing: 0.12em; color: var(--muted); text-transform: uppercase; }
  h1 { font-size: 17px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .d { display: flex; justify-content: flex-end; }
  .corps { flex: 1; padding: 10px 16px 24px; display: flex; flex-direction: column; gap: 14px; }
  footer { position: sticky; bottom: 0; padding: 12px 16px calc(env(safe-area-inset-bottom) + 12px); background: linear-gradient(transparent, var(--fond) 30%); }
</style>

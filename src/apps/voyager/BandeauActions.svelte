<script lang="ts">
  import { onMount } from 'svelte';
  import { aller } from '../../router.svelte.ts';
  import { animationsPermises } from '../../core/marque.ts';

  /** Bandeau d'actions rapides qui défile en continu d'un bord de l'écran à l'autre (contenu dupliqué, copie `aria-hidden`).
   *  Pause au toucher, au survol et au focus ; avec le mouvement réduit (ou sous automatisation) : simple rangée défilable. */
  const ACTIONS = [{ href: '/voix', nom: 'Dis où tu vas' }, { href: '/ville', nom: 'Dans la ville' }, { href: '/covoit/conduire', nom: 'Je conduis' }, { href: '/reseau', nom: 'Réseau' }];
  const param = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('bandeau');
  const automatise = typeof navigator !== 'undefined' && !!navigator.webdriver;
  const lire = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let reduit = $state(lire());
  let appui = $state(false);
  const defile = $derived(animationsPermises({ automatise, parametre: param, mouvementReduit: reduit }));
  onMount(() => {
    const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    const f = () => (reduit = lire());
    mq?.addEventListener('change', f);
    return () => mq?.removeEventListener('change', f);
  });
  const go = (e: MouseEvent, href: string) => { e.preventDefault(); aller(href); };
</script>

{#snippet liens(copie: boolean)}
  <div class="moitie" aria-hidden={copie ? 'true' : undefined}>
    {#each ACTIONS as a (a.href)}
      <a class="b s sm puce" href={a.href} tabindex={copie ? -1 : undefined} onclick={(e) => go(e, a.href)}>{a.nom}</a>
    {/each}
  </div>
{/snippet}

<nav class="bandeau" class:defile aria-label="Actions rapides" onpointerdown={() => (appui = true)} onpointerup={() => (appui = false)} onpointercancel={() => (appui = false)} onpointerleave={() => (appui = false)}>
  <div class="piste" class:appui>
    {@render liens(false)}
    {#if defile}{@render liens(true)}{/if}
  </div>
</nav>

<style>
  .bandeau { margin: 0 -16px; overflow-x: auto; scrollbar-width: none; overscroll-behavior-x: contain; }
  .bandeau::-webkit-scrollbar { display: none; }
  .piste { display: flex; width: max-content; min-width: 100%; padding: 2px 0; }
  .moitie { display: flex; gap: 8px; padding: 0 16px 0 16px; flex: none; }
  .defile { overflow: hidden; -webkit-mask-image: linear-gradient(90deg, transparent, #000 7%, #000 93%, transparent); mask-image: linear-gradient(90deg, transparent, #000 7%, #000 93%, transparent); }
  .defile .piste { animation: bandeau 26s linear infinite; will-change: transform; }
  .defile .moitie { padding-right: 8px; min-width: min(100vw, 460px); }
  .defile:hover .piste, .defile:focus-within .piste, .defile .piste.appui { animation-play-state: paused; }
  .puce { flex: none; white-space: nowrap; background: linear-gradient(135deg, rgba(139, 124, 255, 0.2), rgba(61, 224, 255, 0.12)); border-color: rgba(139, 124, 255, 0.4); backdrop-filter: blur(14px); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.14); }
  .puce:focus-visible { outline: 2px solid #7febff; outline-offset: 2px; }
  @keyframes bandeau { to { transform: translate3d(-50%, 0, 0); } }
</style>

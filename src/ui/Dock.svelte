<script lang="ts" module>
  /** Dernier onglet actif connu et sa position mesurée (en fraction de la largeur du dock) : chaque écran remonte son propre <Dock>, la pastille repart donc de là. */
  let memoire: { signature: string; actif: string; x: number; l: number } | null = null;
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { aller } from '../router.svelte.ts';
  import Icone from './Icone.svelte';
  import { ouvrirOrbe } from './overlays.svelte.ts';
  export interface ItemDock { href: string; label: string; icone: string; /** Bouton central en relief (orbe). */ orbe?: boolean; actif?: boolean }
  /** Barre de navigation flottante du bas (verre dépoli) avec pastille d'onglet actif qui glisse d'un onglet à l'autre (« liquid glass »). */
  let { items, label = 'Navigation principale' }: { items: ItemDock[]; label?: string } = $props();

  let nav = $state<HTMLElement>();
  let pastille = $state<HTMLElement>();
  let glisse = $state(false);
  const signature = $derived(items.map((i) => i.href).join('|'));
  const actif = $derived(items.find((i) => i.actif && !i.orbe)?.href ?? '');

  /** Position de l'onglet actif dans le dock (offsetLeft : indifférent au transform). */
  function mesurer(): { x: number; l: number; W: number } | null {
    const a = nav?.querySelector<HTMLElement>('a.on');
    if (!nav || !a || !nav.clientWidth) return null;
    return { x: a.offsetLeft, l: a.offsetWidth, W: nav.clientWidth };
  }
  const placer = (x: number, l: number) => { if (pastille) { pastille.style.width = `${l}px`; pastille.style.transform = `translate3d(${x}px,0,0)`; } };
  const reduit = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let minuteur: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    const m = mesurer();
    if (!m || !pastille) return;
    const avant = memoire && memoire.signature === signature && memoire.actif !== actif ? memoire : null;
    if (avant && !reduit()) {
      // Départ à l'ancienne position (sans transition), puis glissement vers le nouvel onglet.
      pastille.style.transition = 'none';
      placer(avant.x * m.W, avant.l * m.W);
      void pastille.offsetWidth;
      pastille.style.transition = '';
      glisse = true;
      requestAnimationFrame(() => placer(m.x, m.l));
      minuteur = setTimeout(() => (glisse = false), 700);
    } else {
      pastille.style.transition = 'none';
      placer(m.x, m.l);
      void pastille.offsetWidth;
      pastille.style.transition = '';
    }
    memoire = { signature, actif, x: m.x / m.W, l: m.l / m.W };
    const surTaille = () => { const n = mesurer(); if (!n || !pastille) return; pastille.style.transition = 'none'; placer(n.x, n.l); memoire = { signature, actif, x: n.x / n.W, l: n.l / n.W }; };
    addEventListener('resize', surTaille);
    return () => { removeEventListener('resize', surTaille); clearTimeout(minuteur); };
  });

  function cliquer(e: MouseEvent, it: ItemDock) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (it.orbe && it.href === '/orbe') ouvrirOrbe(); // fenêtre sur la page courante ; le href reste pour l'accessibilité et le clic milieu
    else aller(it.href);
  }
</script>

<nav class="dock" aria-label={label} bind:this={nav}>
  {#if actif}<span class="pastille" class:glisse aria-hidden="true" bind:this={pastille}><i></i></span>{/if}
  {#each items as it (it.href + it.label)}
    <a href={it.href} class:on={it.actif && !it.orbe} class:orb={it.orbe} aria-label={it.orbe ? it.label : undefined} aria-current={it.actif ? 'page' : undefined} aria-haspopup={it.orbe && it.href === '/orbe' ? 'dialog' : undefined} onclick={(e) => cliquer(e, it)}>
      <Icone nom={it.icone} taille={it.orbe ? 26 : 22} trait={it.orbe ? 2.2 : 1.9} />{#if !it.orbe}<span>{it.label}</span>{/if}
    </a>
  {/each}
</nav>

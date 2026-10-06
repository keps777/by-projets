<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icone from './Icone.svelte';
  /**
   * Feuille qui monte du bas. Se ferme de trois façons faciles : le bouton ✕ en haut, un glissement vers le bas
   * (depuis le haut de la feuille, ou depuis n'importe où quand elle est tout en haut), ou un appui à côté.
   */
  let { ouvert, onfermer, label = '', children }: { ouvert: boolean; onfermer: () => void; label?: string; children?: Snippet } = $props();

  let feuille: HTMLDivElement | undefined = $state();
  let decalage = $state(0);
  let glisse = $state(false);

  $effect(() => {
    const el = feuille;
    if (!el) return;
    let y0 = 0, actif = false;
    const debut = (e: TouchEvent) => {
      // On ne tire que depuis le haut de la feuille (zone de la poignée) ou quand le contenu est déjà tout en haut.
      const t = e.touches[0];
      const dansEntete = t.clientY - el.getBoundingClientRect().top < 56;
      actif = e.touches.length === 1 && (dansEntete || el.scrollTop <= 0);
      y0 = t.clientY; decalage = 0;
    };
    const bouge = (e: TouchEvent) => {
      if (!actif) return;
      const dy = e.touches[0].clientY - y0;
      if (dy <= 0) { if (glisse) { decalage = 0; glisse = false; } return; }
      if (!glisse && el.scrollTop > 0 && !(y0 - el.getBoundingClientRect().top < 56)) { actif = false; return; }
      glisse = true; decalage = dy;
      if (e.cancelable) e.preventDefault();
    };
    const fin = () => {
      if (actif && glisse && decalage > 90) onfermer();
      actif = false; glisse = false; decalage = 0;
    };
    el.addEventListener('touchstart', debut, { passive: true });
    el.addEventListener('touchmove', bouge, { passive: false });
    el.addEventListener('touchend', fin);
    el.addEventListener('touchcancel', fin);
    return () => { el.removeEventListener('touchstart', debut); el.removeEventListener('touchmove', bouge); el.removeEventListener('touchend', fin); el.removeEventListener('touchcancel', fin); };
  });
</script>

<svelte:window onkeydown={(e) => { if (ouvert && e.key === 'Escape') onfermer(); }} />

{#if ouvert}
  <div class="couche">
    <button type="button" class="voile" aria-label="Fermer" onclick={onfermer}></button>
    <div class="feuille" class:glisse role="dialog" aria-modal="true" aria-label={label} bind:this={feuille} style:transform={decalage ? `translateY(${decalage}px)` : undefined}>
      <div class="entete">
        <span class="poignee"></span>
        <button type="button" class="fermer" aria-label="Fermer" onclick={onfermer}><Icone nom="fermer" taille={18} trait={2.4} /></button>
      </div>
      {@render children?.()}
    </div>
  </div>
{/if}

<style>
  .couche { position: fixed; inset: 0; z-index: 50; display: flex; flex-direction: column; justify-content: flex-end; max-width: 480px; margin: 0 auto; }
  .voile { position: absolute; inset: 0; border: 0; padding: 0; background: var(--voile); animation: fondu 0.2s ease; }
  .feuille { position: relative; max-height: 92%; overflow-y: auto; overscroll-behavior: contain; background: var(--feuille); border-radius: 28px 28px 0 0; padding: 0 18px calc(22px + var(--bas-sûr)); display: flex; flex-direction: column; gap: 14px; animation: monter 0.25s ease; }
  .feuille.glisse { transition: none; }
  .feuille:not(.glisse) { transition: transform 0.2s ease; }
  /* En-tête fixe en haut de la feuille : poignée au centre, bouton ✕ à droite (toujours visible, même quand le contenu défile). */
  .entete { position: sticky; top: 0; z-index: 2; flex: none; height: 52px; margin: 0 -18px; display: flex; align-items: center; justify-content: center; background: var(--feuille); border-radius: 28px 28px 0 0; }
  .poignee { width: 40px; height: 5px; border-radius: 3px; background: var(--ligne); }
  .fermer { position: absolute; right: 12px; top: 6px; width: 40px; height: 40px; border-radius: 20px; border: 0; background: var(--surface-2); color: var(--texte); display: inline-flex; align-items: center; justify-content: center; }
  .fermer::after { content: ''; position: absolute; inset: -2px; }
  @keyframes monter { from { transform: translateY(40px); opacity: 0; } to { transform: none; opacity: 1; } }
  @keyframes fondu { from { opacity: 0; } to { opacity: 1; } }
</style>

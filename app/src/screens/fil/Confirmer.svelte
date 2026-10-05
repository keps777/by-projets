<script lang="ts">
  import type { Snippet } from 'svelte';

  /** Fenêtre centrée « As-tu terminé ? » (fin du minuteur, Terminer). La couleur vient de --c posé par le parent. */
  let { ouvert, sur, question, children }: { ouvert: boolean; sur: string; question: string; children: Snippet } = $props();
</script>

{#if ouvert}
  <div class="couche" role="alertdialog" aria-modal="true" aria-label={question}>
    <div class="voile"></div>
    <div class="boite">
      <span class="anneau">
        <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true"><circle class="trace" cx="36" cy="36" r="33" fill="none" stroke="var(--c)" stroke-width="4" /></svg>
        <svg class="coche" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--c)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </span>
      <div class="textes">
        <span class="mono muted sur">{sur}</span>
        <span class="titre question">{question}</span>
      </div>
      {@render children()}
    </div>
  </div>
{/if}

<style>
  .couche { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; padding: 24px; max-width: 480px; margin: 0 auto; }
  .voile { position: absolute; inset: 0; background: var(--voile); animation: fondu 0.2s ease both; }
  .boite { position: relative; width: 100%; background: var(--feuille); border-radius: 28px; padding: 24px 20px 18px; display: flex; flex-direction: column; align-items: center; gap: 14px; text-align: center; animation: entrer 0.32s cubic-bezier(0.2, 0.9, 0.3, 1.15) both; }
  .anneau { width: 72px; height: 72px; border-radius: 36px; background: var(--c-fond); display: flex; align-items: center; justify-content: center; position: relative; }
  .anneau svg:first-child { position: absolute; inset: 0; transform: rotate(-90deg); }
  /* L'anneau se trace, puis la coche se dessine. */
  .trace { stroke-dasharray: 207.4; stroke-dashoffset: 0; animation: tracer 0.6s ease-out 0.08s both; }
  .coche path { stroke-dasharray: 22; animation: cocher 0.3s ease-out 0.5s both; }
  .textes { display: flex; flex-direction: column; gap: 4px; }
  .sur { font-size: 13px; }
  .question { font-size: 22px; letter-spacing: -0.01em; line-height: 1.2; }
  .boite :global(.oui) { width: 100%; height: 52px; border-radius: 16px; border: 0; background: var(--c); color: var(--c-sur); font-size: 16px; font-weight: 600; display: flex; align-items: center; justify-content: center; }
  .boite :global(.duo) { width: 100%; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .boite :global(.non) { width: 100%; height: 46px; border-radius: 14px; border: 1px solid var(--ligne); background: transparent; font-size: 14px; font-weight: 600; }
  @keyframes entrer { from { transform: scale(0.92); opacity: 0; } to { transform: none; opacity: 1; } }
  @keyframes fondu { from { opacity: 0; } }
  @keyframes tracer { from { stroke-dashoffset: 207.4; } }
  @keyframes cocher { from { stroke-dashoffset: 22; } to { stroke-dashoffset: 0; } }
</style>

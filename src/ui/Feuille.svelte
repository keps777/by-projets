<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icone from './Icone.svelte';
  /** Fenêtre modale (feuille montante sur mobile, boîte centrée sur PC) : focus piégé, Échap et voile ferment. */
  let { ouvert = $bindable(false), titre, sous, children, pied, surfermer }: { ouvert?: boolean; titre: string; sous?: string; children: Snippet; pied?: Snippet; surfermer?: () => void } = $props();
  let boite: HTMLElement | undefined = $state();
  const fermer = () => { ouvert = false; surfermer?.(); };
  $effect(() => {
    if (!ouvert) return;
    const avant = document.activeElement as HTMLElement | null, defil = document.body.style.overflow; document.body.style.overflow = 'hidden';
    queueMicrotask(() => (boite?.querySelector<HTMLElement>('[autofocus],button,a,input,select,textarea') ?? boite)?.focus());
    return () => { document.body.style.overflow = defil; avant?.focus?.(); };
  });
  function touche(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); fermer(); return; }
    if (e.key !== 'Tab' || !boite) return;
    const f = [...boite.querySelectorAll<HTMLElement>('button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')].filter((x) => !x.hasAttribute('disabled'));
    if (!f.length) return; const a = f[0], z = f[f.length - 1];
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  }
</script>
{#if ouvert}
  <div class="voile" role="presentation" onclick={fermer}></div>
  <div class="feuille" bind:this={boite} role="dialog" aria-modal="true" aria-label={titre} tabindex="-1" onkeydown={touche}>
    <span class="poignee" aria-hidden="true"></span>
    <header><div class="col g4"><h2 class="t-section">{titre}</h2>{#if sous}<p class="t-sec">{sous}</p>{/if}</div><button type="button" class="x" aria-label="Fermer" onclick={fermer}><Icone nom="fermer" /></button></header>
    <div class="corps">{@render children()}</div>
    {#if pied}<footer>{@render pied()}</footer>{/if}
  </div>
{/if}
<style>
  .voile { position: fixed; inset: 0; background: rgba(6, 7, 8, 0.6); z-index: 70; animation: fond 0.2s; }
  .feuille { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: min(100%, 520px); max-height: 90dvh; z-index: 71; display: flex; flex-direction: column; gap: 12px; padding: 8px 20px calc(env(safe-area-inset-bottom) + 20px); border-radius: 24px 24px 0 0; background: var(--surface); color: var(--ink); border: 1px solid var(--line); animation: monte 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); }
  .poignee { width: 44px; height: 5px; border-radius: 3px; background: var(--line-strong); margin: 0 auto; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
  .x { width: 44px; height: 44px; border-radius: 999px; border: 1px solid var(--line); background: var(--surface2); display: grid; place-items: center; cursor: pointer; flex: none; }
  .corps { overflow-y: auto; display: flex; flex-direction: column; gap: 12px; min-height: 0; }
  footer { display: flex; flex-direction: column; gap: 8px; }
  @keyframes monte { from { transform: translate(-50%, 40px); opacity: 0; } }
  @keyframes fond { from { opacity: 0; } }
  @media (min-width: 900px) { .feuille { bottom: auto; top: 50%; transform: translate(-50%, -50%); border-radius: 24px; animation: centre 0.25s; } @keyframes centre { from { opacity: 0; transform: translate(-50%, -48%); } } }
</style>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { tick } from 'svelte';
  /** Fenêtre modale du portail : tiroir à droite sur grand écran, feuille en bas sur mobile. Échap ou clic hors de la fenêtre pour fermer. */
  let { ouvert = $bindable(false), titre, sous = '', large = false, children }: { ouvert?: boolean; titre: string; sous?: string; large?: boolean; children: Snippet } = $props();
  let boite: HTMLElement | undefined = $state();
  let origine: HTMLElement | null = null;
  const fermer = () => (ouvert = false);
  /** Déplace la fenêtre à la racine de <body> : elle échappe aux conteneurs (défilement, impression) de la page. */
  function racine(n: HTMLElement) { document.body.appendChild(n); }
  $effect(() => {
    if (ouvert) { origine = document.activeElement as HTMLElement | null; tick().then(() => boite?.focus()); }
    else if (origine) { origine.focus?.(); origine = null; }
  });
  /** Écoute la fenêtre entière : le focus peut tomber sur <body> quand le bouton cliqué disparaît (ex. « Valider la retenue »). */
  function touche(e: KeyboardEvent) {
    if (!ouvert) return;
    if (e.key === 'Escape') { e.stopPropagation(); fermer(); return; }
    if (e.key !== 'Tab' || !boite) return;
    const f = [...boite.querySelectorAll<HTMLElement>('a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    const premier = f[0], dernier = f[f.length - 1];
    if (!boite.contains(document.activeElement)) { e.preventDefault(); premier.focus(); }
    else if (e.shiftKey && (document.activeElement === premier || document.activeElement === boite)) { e.preventDefault(); dernier.focus(); }
    else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
  }
</script>

<svelte:window onkeydown={touche} />
{#if ouvert}
  <div class="voile" role="presentation" onclick={fermer} use:racine></div>
  <div class="fenetre pe" class:large role="dialog" aria-modal="true" aria-label={titre} tabindex="-1" bind:this={boite} use:racine>
    <header>
      <div><h2>{titre}</h2>{#if sous}<p class="doux">{sous}</p>{/if}</div>
      <button class="x" onclick={fermer} aria-label="Fermer">×</button>
    </header>
    <div class="contenu">{@render children()}</div>
  </div>
{/if}

<style>
  .voile { position: fixed; inset: 0; background: rgba(15, 20, 34, 0.5); z-index: 40; }
  .fenetre { position: fixed; z-index: 41; background: var(--carte); color: var(--texte); display: flex; flex-direction: column; box-shadow: var(--ombre); padding: 0; outline: none;
    left: 0; right: 0; bottom: 0; max-height: 92dvh; border-radius: 22px 22px 0 0; animation: monte 0.25s ease-out; }
  header { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; padding: 18px 20px 12px; border-bottom: 1px solid var(--ligne); }
  .fenetre h2 { font-size: 19px; font-weight: 700; } .fenetre p { font-size: 13.5px; margin-top: 2px; }
  .x { width: 44px; height: 44px; border-radius: 22px; font-size: 26px; line-height: 1; flex: none; color: var(--muted); } .x:hover { background: var(--carte2); }
  .contenu { padding: 16px 20px 24px; overflow-y: auto; display: flex; flex-direction: column; gap: 14px; }
  @media (min-width: 800px) {
    .fenetre { left: auto; top: 0; width: 460px; max-height: none; border-radius: 0; animation: glisse 0.25s ease-out; }
    .fenetre.large { width: min(760px, 94vw); }
  }
  @keyframes monte { from { transform: translateY(40px); opacity: 0; } } @keyframes glisse { from { transform: translateX(40px); opacity: 0; } }
</style>

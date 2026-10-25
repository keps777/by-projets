<script lang="ts">
  import type { Snippet } from 'svelte';
  import { tick } from 'svelte';
  /** Fenêtre modale commune AfriMove (verre dépoli) : monte du bas avec un ressort doux, se ferme au glisser vers le bas, sur Échap ou sur le voile.
   *  Toute action qui « ouvrait une autre page » (hors réseau, annuler, problème, partager, moto-taxi, orbe…) s'affiche dans cette fenêtre, sur la page courante. */
  let { ouvert = $bindable(false), titre = '', sous = '', hauteur = 'auto', sens = 'bas', surfermer, children, pied }: {
    ouvert?: boolean; titre?: string; sous?: string; /** `auto` (selon le contenu) ou `haute` (≈ 90 % de l'écran). */ hauteur?: 'auto' | 'haute'; /** `bas` : monte du bas ; `haut` : se déroule depuis le haut. */ sens?: 'bas' | 'haut';
    surfermer?: () => void; children: Snippet; pied?: Snippet;
  } = $props();
  let el = $state<HTMLElement | undefined>(), decalage = $state(0), glisse = $state(false), debut = 0, precedent: Element | null = null;
  const fermer = () => { ouvert = false; surfermer?.(); };
  $effect(() => {
    if (!ouvert) { decalage = 0; return; }
    precedent = document.activeElement; const defil = document.body.style.overflow; document.body.style.overflow = 'hidden';
    tick().then(() => (el?.querySelector<HTMLElement>('[data-focus], button, a, input, select, textarea') ?? el)?.focus());
    return () => { document.body.style.overflow = defil; (precedent as HTMLElement | null)?.focus?.(); };
  });
  function touche(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); fermer(); return; }
    if (e.key !== 'Tab' || !el) return;
    const f = [...el.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null);
    if (!f.length) return; const a = f[0], z = f[f.length - 1];
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  }
  const bas = (e: PointerEvent) => { glisse = true; debut = e.clientY; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); };
  const deplace = (e: PointerEvent) => { if (glisse) decalage = Math.max(0, (e.clientY - debut) * (sens === 'bas' ? 1 : -1)); };
  const haut = () => { if (!glisse) return; glisse = false; if (decalage > 110) fermer(); else decalage = 0; };
</script>

{#if ouvert}
  <div class="voile" role="presentation" onclick={fermer}></div>
  <div bind:this={el} class="feuille {sens}" class:haute={hauteur === 'haute'} class:glisse role="dialog" aria-modal="true" aria-label={titre || 'Fenêtre'} tabindex="-1" onkeydown={touche}
    style:transform={decalage ? `translate(-50%, ${sens === 'bas' ? decalage : -decalage}px)` : null}>
    <div class="poignee" role="presentation" onpointerdown={bas} onpointermove={deplace} onpointerup={haut} onpointercancel={haut}><span></span></div>
    {#if titre}<header><div class="col"><h2 class="ttl t20">{titre}</h2>{#if sous}<span class="t13 mut">{sous}</span>{/if}</div><button type="button" class="ib" aria-label="Fermer" onclick={fermer}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button></header>{/if}
    <div class="corps">{@render children()}</div>
    {#if pied}<footer>{@render pied()}</footer>{/if}
  </div>
{/if}

<style>
  .voile { position: fixed; inset: 0; z-index: 70; background: rgba(2, 4, 10, 0.62); backdrop-filter: blur(3px); animation: fond 0.25s ease; }
  .feuille { position: fixed; left: 50%; z-index: 71; width: min(100%, 460px); max-height: 90dvh; display: flex; flex-direction: column; gap: 10px; padding: 8px 16px calc(env(safe-area-inset-bottom) + 16px);
    background: linear-gradient(180deg, rgba(24, 28, 52, 0.96), rgba(8, 11, 24, 0.98)); border: 1px solid rgba(255, 255, 255, 0.18); box-shadow: 0 -30px 80px -20px rgba(124, 108, 255, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.16); color: #f2f4ff; transition: transform 0.28s cubic-bezier(0.2, 0.8, 0.2, 1); }
  .feuille.bas { bottom: 0; transform: translateX(-50%); border-radius: 28px 28px 0 0; animation: monte 0.42s cubic-bezier(0.18, 1.1, 0.3, 1); }
  .feuille.haut { top: 0; transform: translateX(-50%); border-radius: 0 0 28px 28px; padding-top: calc(env(safe-area-inset-top) + 12px); animation: descend 0.42s cubic-bezier(0.18, 1.1, 0.3, 1); }
  .feuille.haute { height: 90dvh; } .feuille.glisse { transition: none; }
  .poignee { display: grid; place-items: center; min-height: 26px; touch-action: none; cursor: grab; } .poignee span { width: 44px; height: 5px; border-radius: 3px; background: rgba(255, 255, 255, 0.3); }
  header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; } .corps { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; scrollbar-width: none; } footer { display: flex; flex-direction: column; gap: 8px; }
  @keyframes monte { from { transform: translate(-50%, 100%); opacity: 0.6; } } @keyframes descend { from { transform: translate(-50%, -100%); opacity: 0.6; } } @keyframes fond { from { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .feuille.bas, .feuille.haut { animation: fond 0.2s; } }
</style>

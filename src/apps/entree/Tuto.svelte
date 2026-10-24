<script lang="ts">
  import { aller } from '../../router.svelte.ts';
  import { app } from '../../data/store.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import { t, type CleI18n } from './i18n.ts';

  /** Tutoriel en 3 cartes 3D : glisser au doigt (ou flèches du clavier) fait tourner le carrousel. */
  const cartes: { titre: CleI18n; texte: CleI18n; icone: string }[] = [
    { titre: 'tuto1t', texte: 'tuto1', icone: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5L12 12l8-4.5M12 12v9' },
    { titre: 'tuto2t', texte: 'tuto2', icone: 'M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M8.5 9.5v1.5M15.5 9.5v1.5M12 9.5v4h-1.2M9 15.2a4.5 4.5 0 0 0 6 0' },
    { titre: 'tuto3t', texte: 'tuto3', icone: 'M6 18m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M18 6m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M8.5 18H14a3 3 0 0 0 0-6H10a3 3 0 0 1 0-6h5.5' }
  ];
  let i = $state(0), glisse = $state(0), x0 = $state<number | null>(null);
  const derniere = $derived(i === cartes.length - 1);
  const aller_ = (n: number) => { i = Math.max(0, Math.min(cartes.length - 1, n)); };
  const fin = () => { app.session.vuTuto = true; aller('/connexion'); };
  const transformer = (k: number) => { const d = k - i - glisse / 220; return `translateX(${d * 60}px) translateZ(${-Math.abs(d) * 160}px) rotateY(${-d * 18}deg)`; };

  function bas(e: PointerEvent) { x0 = e.clientX; glisse = 0; (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); }
  function bouge(e: PointerEvent) { if (x0 === null) return; glisse = Math.max(-220, Math.min(220, e.clientX - x0)); }
  function haut() { if (x0 === null) return; const dx = glisse; x0 = null; glisse = 0; if (dx < -40) aller_(i + 1); else if (dx > 40) aller_(i - 1); }
  function touche(e: KeyboardEvent) { if (e.key === 'ArrowRight') { e.preventDefault(); aller_(i + 1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); aller_(i - 1); } }
</script>

<Mobile sansRetour>
  {#snippet enteteLibre()}
    <header class="hd">
      <span class="pl" aria-live="polite">{i + 1} / {cartes.length}</span>
      <a class="b g sm" href="/connexion" onclick={(e) => { e.preventDefault(); fin(); }}>{t('passer')}</a>
    </header>
  {/snippet}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div class="stage" role="group" aria-roledescription="carrousel" aria-label="Tutoriel" tabindex="0" onkeydown={touche} onpointerdown={bas} onpointermove={bouge} onpointerup={haut} onpointercancel={haut} class:glisse={x0 !== null}>
    {#each cartes as c, k (c.titre)}
      <article class="tc" style="transform: {transformer(k)}; opacity: {k === i ? 1 : 0.45}; z-index: {k === i ? 3 : 1}" aria-hidden={k !== i} inert={k !== i}>
        <div class="ico" aria-hidden="true"><svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d={c.icone} /></svg></div>
        <h2 class="ttl t24">{t(c.titre)}</h2>
        <span class="t14 mut">{t(c.texte)}</span>
      </article>
    {/each}
  </div>
  <div class="dots" aria-hidden="true">{#each cartes as c, k (c.titre)}<i class:on={k === i}></i>{/each}</div>
  <div class="col" style="gap: 8px; margin-top: auto">
    {#if derniere}
      <a class="b p" href="/connexion" onclick={(e) => { e.preventDefault(); fin(); }}>{t('cestParti')}</a>
    {:else}
      <button class="b p" type="button" onclick={() => aller_(i + 1)}>{t('suivant')}</button>
    {/if}
    <button class="b g" type="button" onclick={() => aller_(i - 1)} disabled={i === 0}>{t('precedent')}</button>
  </div>
</Mobile>

<style>
  .stage { position: relative; height: 420px; flex: none; perspective: 1000px; perspective-origin: 50% 30%; touch-action: pan-y; outline-offset: 4px; overflow-x: clip; }
  .tc { position: absolute; left: 30px; right: 30px; top: 20px; height: 360px; border-radius: 30px; border: 1px solid rgba(255, 255, 255, 0.22); background: linear-gradient(160deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.05)); backdrop-filter: blur(16px); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 24px; text-align: center; transition: transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.45s; box-shadow: 0 40px 80px -40px rgba(0, 0, 0, 0.9); }
  .stage.glisse .tc { transition: none; }
  .tc h2 { margin: 0; }
  .ico { width: 110px; height: 110px; border-radius: 34px; display: grid; place-items: center; background: linear-gradient(135deg, #8b7cff, #3de0ff); color: #06080f; box-shadow: 0 30px 50px -24px rgba(124, 108, 255, 0.8); }
  .dots { display: flex; justify-content: center; gap: 8px; }
  .dots i { width: 8px; height: 8px; border-radius: 4px; background: rgba(255, 255, 255, 0.25); transition: width 0.3s; }
  .dots i.on { width: 28px; background: #3de0ff; }
  .b:disabled { opacity: 0.35; cursor: default; }
  @media (max-height: 720px) { .stage { height: 360px; } .tc { height: 310px; padding: 16px; } .ico { width: 84px; height: 84px; } }
</style>

<script lang="ts">
  import { tick } from 'svelte';
  import Icone from '../../ui/Icone.svelte';
  import { deplacer, descriptionItem, libelleItem, libellePassager, libelleStatut, type ItemBillet } from '../../core/selectionBillet.ts';

  /** « Ton bus » : menu déroulant (liste de choix accessible) de tous les billets en cours et à venir, les miens et ceux achetés pour des proches.
   *  Vide : rien. Un seul billet : un résumé sans menu. Deux ou plus : menu animé, flèches, Début/Fin, Entrée, Échap. */
  let { items, valeur, onchoisir, etiquette = 'Ton bus', id = 'sel-bus' }: { items: ItemBillet[]; valeur?: string; onchoisir: (id: string) => void; etiquette?: string; id?: string } = $props();
  let ouvert = $state(false), actif = $state(-1), racine = $state<HTMLElement | undefined>(), liste = $state<HTMLElement | undefined>();
  const courant = $derived(items.find((i) => i.id === valeur) ?? items[0]);
  const idx = $derived(Math.max(0, items.findIndex((i) => i.id === courant?.id)));
  const ton = (i: ItemBillet) => (i.statut === 'en_route' || i.statut === 'a_bord' ? 'ok' : i.statut === 'embarquement' ? 'wa' : i.statut === 'annule' ? 'er' : 'ac');

  async function ouvrir() { ouvert = true; actif = idx; await tick(); defiler(); }
  function fermer(refocus = false) { ouvert = false; actif = -1; if (refocus) racine?.querySelector<HTMLElement>('[role="combobox"]')?.focus(); }
  const defiler = () => liste?.querySelector<HTMLElement>(`[data-i="${actif}"]`)?.scrollIntoView({ block: 'nearest' });
  function choisir(i: number) { const it = items[i]; if (!it) return; fermer(true); if (it.id !== courant?.id) onchoisir(it.id); }
  async function touche(e: KeyboardEvent) {
    if (e.key === 'Escape') { if (ouvert) { e.stopPropagation(); e.preventDefault(); fermer(true); } return; }
    if (e.key === 'Tab') { if (ouvert) fermer(); return; }
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (!ouvert) await ouvrir(); else if (actif >= 0) choisir(actif); else fermer(true); return; }
    const n = deplacer(actif < 0 ? idx : actif, e.key, items.length); if (n === null) return;
    e.preventDefault(); if (!ouvert) { await ouvrir(); if (e.key === 'ArrowDown' || e.key === 'ArrowUp') return; }
    actif = n; await tick(); defiler();
  }
  const dehors = (e: PointerEvent) => { if (ouvert && racine && !racine.contains(e.target as Node)) fermer(); };
</script>

<svelte:window onpointerdown={dehors} />

{#if items.length && courant}
  <div class="racine" bind:this={racine} data-testid="selecteur-bus">
    <span class="lab" id="{id}-lab">{etiquette}</span>
    {#snippet resume(i: ItemBillet)}
      <span class="av" class:hot={!i.pourMoi} aria-hidden="true">{i.pourMoi ? 'Toi' : i.passager[0]}</span>
      <span class="col grow" style="min-width: 0"><span class="t14 b7 ell">{libellePassager(i)}</span><span class="t12 mut ell">{i.trajet} · {i.heure}</span></span>
      <span class="pl {ton(i)}">{libelleStatut(i.statut)}</span>
    {/snippet}
    {#if items.length === 1}
      <div class="decl un" role="group" aria-labelledby="{id}-lab" aria-label={descriptionItem(courant)}>{@render resume(courant)}</div>
    {:else}
      <button type="button" class="decl" class:on={ouvert} role="combobox" aria-haspopup="listbox" aria-expanded={ouvert} aria-controls="{id}-liste" aria-labelledby="{id}-lab {id}-val" aria-activedescendant={ouvert && actif >= 0 ? `${id}-o${actif}` : undefined}
        onclick={() => (ouvert ? fermer() : ouvrir())} onkeydown={touche}>
        <span id="{id}-val" class="valeur">{@render resume(courant)}</span>
        <span class="chev" aria-hidden="true"><Icone nom="suivant" taille={18} /></span>
        <span class="nb" aria-hidden="true">{items.length}</span>
      </button>
      <div class="pan" class:ouvert inert={!ouvert}>
        <ul bind:this={liste} id="{id}-liste" role="listbox" aria-labelledby="{id}-lab" tabindex="-1">
          {#each items as it, i (it.id)}
            <li role="presentation" style="--d: {i * 35}ms">
              <button type="button" role="option" tabindex="-1" id="{id}-o{i}" data-i={i} data-testid="option-bus" aria-selected={it.id === courant.id} aria-label={descriptionItem(it)} class:choisi={it.id === courant.id} class:act={i === actif}
                onclick={() => choisir(i)} onpointermove={() => (actif = i)}>
                <span class="av" class:hot={!it.pourMoi} aria-hidden="true">{it.pourMoi ? 'Toi' : it.passager[0]}</span>
                <span class="col grow" style="min-width: 0"><span class="t14 b7 ell">{libellePassager(it)}</span><span class="t12 mut">{libelleItem(it)}{it.siege ? ` · place ${it.siege}` : ''}</span></span>
                <span class="pl {ton(it)}">{libelleStatut(it.statut)}</span>
                {#if it.id === courant.id}<span class="coche" aria-hidden="true"><Icone nom="ok" taille={18} trait={2.4} /></span>{/if}
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
{/if}

<style>
  .racine { position: relative; flex: none; display: flex; flex-direction: column; gap: 6px; z-index: 5; }
  .decl { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 64px; padding: 8px 12px; border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.16); background: linear-gradient(135deg, rgba(139, 124, 255, 0.2), rgba(61, 224, 255, 0.1)); color: #f2f4ff; font: inherit; text-align: left; position: relative; }
  button.decl { cursor: pointer; padding-right: 40px; transition: border-color 0.2s, box-shadow 0.2s; }
  button.decl:focus-visible { outline: 2px solid #7febff; outline-offset: 2px; }
  .decl.on { border-color: #8b7cff; box-shadow: 0 0 0 4px rgba(139, 124, 255, 0.2); }
  .valeur { display: contents; }
  .chev { position: absolute; right: 12px; top: 50%; margin-top: -9px; display: grid; transform: rotate(90deg); transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); color: #b3a8ff; }
  .decl.on .chev { transform: rotate(-90deg); }
  .nb { position: absolute; right: 9px; top: -7px; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 10px; background: #8b7cff; color: #06080f; font: 700 11px 'Geist Mono', monospace; display: grid; place-items: center; }
  .av { flex: none; width: 40px; height: 40px; border-radius: 14px; display: grid; place-items: center; font: 700 13px 'Sora Variable', 'Sora', sans-serif; background: rgba(61, 224, 255, 0.16); color: #7febff; }
  .av.hot { background: rgba(255, 91, 222, 0.2); color: #ff9bea; font-size: 16px; }
  .pan { position: absolute; left: 0; right: 0; top: 100%; margin-top: 6px; transform-origin: top center; opacity: 0; transform: translateY(-8px) scaleY(0.92); visibility: hidden; pointer-events: none;
    transition: opacity 0.2s ease, transform 0.32s cubic-bezier(0.18, 1.1, 0.3, 1), visibility 0s linear 0.32s; border-radius: 20px; background: rgba(12, 16, 34, 0.98); border: 1px solid rgba(255, 255, 255, 0.2); box-shadow: 0 30px 60px -20px rgba(0, 0, 0, 0.9), 0 0 40px -10px rgba(124, 108, 255, 0.5); overflow: hidden; }
  .pan.ouvert { opacity: 1; transform: none; visibility: visible; pointer-events: auto; transition-delay: 0s; }
  ul { list-style: none; margin: 0; padding: 6px; max-height: min(52dvh, 360px); overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
  .pan.ouvert li { animation: entre 0.3s both; animation-delay: var(--d); }
  li button { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 60px; padding: 8px 10px; border-radius: 14px; border: 1px solid transparent; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
  li button.act { background: rgba(255, 255, 255, 0.08); }
  li button.choisi { border-color: rgba(139, 124, 255, 0.55); background: rgba(139, 124, 255, 0.14); }
  .coche { color: #7febff; display: grid; }
  @keyframes entre { from { opacity: 0; transform: translateY(-6px); } }
  @media (prefers-reduced-motion: reduce) { .pan, .chev, button.decl { transition: opacity 0.15s; } .pan { transform: none; } .pan.ouvert li { animation: none; } }
</style>

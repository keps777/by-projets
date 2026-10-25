<script lang="ts" module>
  export interface Choix { id: string; titre: string; sous?: string; badge?: string; ton?: 'ok' | 'ac' | 'wa' | 'er' | '' }
</script>

<script lang="ts">
  import IconeCv from './IconeCv.svelte';
  /** Menu déroulant animé (liste de choix) : bouton, liste qui se déroule, flèches, Entrée, Échap. */
  let { choix, valeur = $bindable(''), label, vide = 'Rien à choisir' }: { choix: Choix[]; valeur: string; label: string; vide?: string } = $props();
  let ouvert = $state(false), actif = $state(0), racine: HTMLElement | undefined = $state();
  const courant = $derived(choix.find((c) => c.id === valeur) ?? choix[0]);
  const idListe = `menu-${Math.random().toString(36).slice(2, 7)}`;
  function ouvrir() { if (!choix.length) return; actif = Math.max(0, choix.findIndex((c) => c.id === courant?.id)); ouvert = true; }
  function prendre(id: string) { valeur = id; ouvert = false; (racine?.querySelector('button.tete') as HTMLElement | null)?.focus(); }
  function touche(e: KeyboardEvent) {
    if (!choix.length) return;
    if (e.key === 'Escape' && ouvert) { e.stopPropagation(); ouvert = false; return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (!ouvert) { ouvrir(); return; } actif = (actif + (e.key === 'ArrowDown' ? 1 : -1) + choix.length) % choix.length; (racine?.querySelectorAll<HTMLElement>('[role=option]')[actif])?.focus(); }
    else if ((e.key === 'Enter' || e.key === ' ') && ouvert && (e.target as HTMLElement).getAttribute('role') === 'option') { e.preventDefault(); prendre(choix[actif].id); }
  }
  function dehors(e: PointerEvent) { if (ouvert && racine && !racine.contains(e.target as Node)) ouvert = false; }
</script>

<svelte:window onpointerdown={dehors} />
<div class="menu" bind:this={racine} onkeydown={touche} role="presentation">
  <button type="button" class="tete" aria-haspopup="listbox" aria-expanded={ouvert} aria-controls={idListe} aria-label="{label} : {courant ? `${courant.titre}, ${courant.sous ?? ''}` : vide}" onclick={() => (ouvert ? (ouvert = false) : ouvrir())} disabled={!choix.length}>
    <span class="col grow"><span class="lab">{label}</span>
      {#if courant}<span class="t16 b7 ell">{courant.titre}</span><span class="t12 mut ell">{courant.sous ?? ''}</span>{:else}<span class="t14 mut">{vide}</span>{/if}</span>
    {#if courant?.badge}<span class="cv-badge {courant.ton ?? ''}">{courant.badge}</span>{/if}
    <span class="fleche" class:o={ouvert}><IconeCv nom="bas" taille={20} /></span>
  </button>
  <div class="zone" class:o={ouvert} inert={!ouvert}>
    <ul id={idListe} role="listbox" aria-label={label}>
      {#each choix as c, k (c.id)}
        <li role="option" tabindex={ouvert ? 0 : -1} aria-selected={c.id === courant?.id} class:act={k === actif} onclick={() => prendre(c.id)} onkeydown={() => {}}>
          <span class="col grow"><span class="t14 b7 ell">{c.titre}</span><span class="t12 mut ell">{c.sous ?? ''}</span></span>
          {#if c.badge}<span class="cv-badge {c.ton ?? ''}">{c.badge}</span>{/if}
          {#if c.id === courant?.id}<span class="aq"><IconeCv nom="valide" taille={18} trait={2.4} /></span>{/if}
        </li>
      {/each}
    </ul>
  </div>
</div>

<style>
  .menu { position: relative; flex: none; }
  .tete { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 64px; padding: 8px 14px; border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.18); background: linear-gradient(160deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.05)); backdrop-filter: blur(16px); color: #f2f4ff; font: inherit; text-align: left; cursor: pointer; }
  .tete:disabled { opacity: 0.7; cursor: default; } .tete:focus-visible { outline: 2px solid #7febff; outline-offset: 2px; }
  .fleche { display: grid; transition: transform 0.35s cubic-bezier(0.34, 1.4, 0.5, 1); color: #7febff; } .fleche.o { transform: rotate(180deg); }
  .zone { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 0.38s cubic-bezier(0.2, 0.8, 0.2, 1); } .zone.o { grid-template-rows: 1fr; }
  ul { list-style: none; overflow: hidden; min-height: 0; margin: 0; padding: 0; border-radius: 18px; background: rgba(12, 16, 32, 0.96); border: 0 solid rgba(255, 255, 255, 0.16); }
  .zone.o ul { margin-top: 6px; border-width: 1px; max-height: 280px; overflow-y: auto; box-shadow: 0 24px 50px -20px rgba(0, 0, 0, 0.8); }
  li { display: flex; align-items: center; gap: 10px; min-height: 56px; padding: 8px 14px; cursor: pointer; border-bottom: 1px solid rgba(255, 255, 255, 0.07); }
  li:last-child { border-bottom: 0; } li:hover, li.act, li:focus-visible { background: rgba(139, 124, 255, 0.2); outline: none; } li[aria-selected='true'] { background: rgba(61, 224, 255, 0.1); }
  @media (prefers-reduced-motion: reduce) { .zone, .fleche { transition: none; } }
</style>

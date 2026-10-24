<script lang="ts">
  import type { Snippet } from 'svelte';
  import './siege.css';
  import { app } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import IconeSiege from './IconeSiege.svelte';
  import Lien from './Lien.svelte';

  /** Cadre commun des écrans web du siège : barre latérale (qui s'empile sur téléphone) et zone principale.
   *  `section="comptable"` : écrans ouverts à la comptable ; `"public"` : la porte de démonstration (/parcours) ; sinon réservé au patron. */
  let { actif, section = 'general', children }: { actif: string; section?: 'general' | 'comptable' | 'public'; children: Snippet } = $props();
  const comptable = $derived(app.session.role === 'comptable');
  const interdit = $derived(comptable && section === 'general');
  const liens = [
    { id: 'tableau', nom: 'Tableau', href: '/patron', icone: 'tableau' }, { id: 'analyses', nom: 'Analyses', href: '/siege/analyses', icone: 'analyses' },
    { id: 'comptable', nom: 'Comptable', href: '/siege/comptable', icone: 'comptable' }, { id: 'config', nom: 'Configuration', href: '/siege/config', icone: 'config' },
    { id: 'controle', nom: 'Salle de contrôle', href: '/siege/controle', icone: 'controle' }, { id: 'assistant', nom: 'Assistant', href: '/assistant', icone: 'assistant' }
  ];
  const bas = [{ id: 'parcours', nom: 'Tous les parcours', href: '/parcours', icone: 'parcours' }, { id: 'voyageur', nom: 'App voyageur', href: '/', icone: 'voyageur' }];
  const visibles = $derived(comptable ? liens.filter((l) => l.id === 'comptable') : liens);
  $effect(() => { if (interdit) aller('/siege/comptable', { remplacer: true }); });
</script>

<div class="pg">
  <nav class="side" aria-label="Navigation siège">
    <div class="brand">
      <svg width="34" height="34" viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" rx="22" fill="#0A0E1C" /><circle cx="36" cy="36" r="22" fill="none" stroke="#8B7CFF" stroke-width="3" stroke-dasharray="6 5" /><path d="M36 20 L48 50 L41 50 L36 36 L31 50 L24 50 Z" fill="#3DE0FF" /><circle cx="55" cy="22" r="4" fill="#FF5BDE" /></svg>
      <span class="col"><span class="ttl t14">AfriMove</span><span class="t12 mut">Bêta Express · siège</span></span>
    </div>
    {#each visibles as l (l.id)}<Lien href={l.href} class={l.id === actif ? 'on' : ''} aria-current={l.id === actif ? 'page' : undefined}><IconeSiege nom={l.icone} />{l.nom}</Lien>{/each}
    {#each bas as l, i (l.id)}<Lien href={l.href} class="{i === 0 ? 'bas' : ''} {l.id === actif ? 'on' : ''}" aria-current={l.id === actif ? 'page' : undefined}><IconeSiege nom={l.icone} />{l.nom}</Lien>{/each}
  </nav>
  <main class="mainp">
    {#if interdit}<p class="vide-etat" role="status">Cette section est réservée au patron. Redirection vers la comptabilité…</p>{:else}{@render children()}{/if}
  </main>
</div>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { retour as reculer, aller } from '../router.svelte.ts';
  import { app } from '../data/store.svelte.ts';
  import Icone from './Icone.svelte';
  import Logo from './Logo.svelte';
  import NavBas, { type Onglet } from './NavBas.svelte';
  /** Cadre commun des écrans. Mobile : colonne de 390 à 520 px ; PC (≥ 900 px) : contenu centré jusqu'à 1120 px, navigation en haut.
   *  - `onglet` : écran de l'application (en-tête logo + cloche + avatar, barre d'onglets) ; sans `onglet` : écran « plein » (onboarding, détail) avec bouton retour et titre.
   *  - `face` : jour (recto) ou nuit (verso). `retour` : chemin de repli du bouton retour (par défaut, l'historique). */
  let { titre, sous, face = 'jour', onglet, retour, sansRetour = false, etape, droite, children, large = false, pied }:
    { titre?: string; sous?: string; face?: 'jour' | 'nuit'; onglet?: Onglet; retour?: string; sansRetour?: boolean; etape?: string; droite?: Snippet; children: Snippet; large?: boolean; pied?: Snippet } = $props();
  const compte = $derived(app.monde.comptes.find((c) => c.id === app.session.compteId));
  const initiales = $derived(compte ? `${compte.prenom[0]}${compte.nom[0]}` : '');
  const nonLues = $derived(compte ? app.monde.notifications.filter((n) => n.compteId === compte.id && !n.lu).length : 0);
</script>

<div class="nx ecran" data-face={face} class:large>
  <header class="entete">
    {#if onglet}
      <a class="marque" href="/" onclick={(e) => { e.preventDefault(); aller('/'); }} aria-label="NexG-TT, accueil"><Logo /></a>
      <div class="actions">
        <a class="rond" href="/notifications" aria-label={nonLues ? `Notifications, ${nonLues} non lues` : 'Notifications'} onclick={(e) => { e.preventDefault(); aller('/notifications'); }}><Icone nom="cloche" />{#if nonLues}<span class="pastille" aria-hidden="true"></span>{/if}</a>
        <a class="rond av" href="/compte" aria-label="Mon compte" onclick={(e) => { e.preventDefault(); aller('/compte'); }}>{initiales || '·'}</a>
      </div>
    {:else}
      {#if sansRetour}<span class="vide" aria-hidden="true"></span>{:else}<button type="button" class="rond" aria-label="Retour" onclick={() => (retour ? aller(retour) : reculer('/'))}><Icone nom="retour" /></button>{/if}
      <div class="titre"><p class="t-ecran-c">{titre ?? ''}</p>{#if etape}<span class="t-aide">{etape}</span>{/if}</div>
      {#if droite}<div class="actions">{@render droite()}</div>{:else}<span class="vide" aria-hidden="true"></span>{/if}
    {/if}
  </header>
  <main id="contenu" class="contenu"><div class="interieur">{#if onglet && titre}<h1 class="sr">{titre}</h1>{/if}{#if sous}<p class="t-sec sous">{sous}</p>{/if}{@render children()}</div></main>
  {#if pied}<div class="pied"><div class="interieur">{@render pied()}</div></div>{/if}
  {#if onglet}<NavBas actif={onglet} />{/if}
</div>

<style>
  .ecran { min-height: 100dvh; display: grid; grid-template-rows: auto 1fr auto auto; grid-template-areas: 'entete' 'contenu' 'pied' 'nav'; width: min(100%, 520px); margin: 0 auto; position: relative; }
  .entete { grid-area: entete; display: grid; grid-template-columns: 44px 1fr auto; align-items: center; gap: 8px; padding: max(24px, env(safe-area-inset-top)) 12px 8px; }
  .entete:has(.marque) { grid-template-columns: 1fr auto; padding: max(24px, env(safe-area-inset-top)) 20px 8px; }
  .titre { text-align: center; display: flex; flex-direction: column; } .t-ecran-c { font: 600 20px/24px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; margin: 0; }
  .actions { display: flex; gap: 8px; align-items: center; } .vide { width: 44px; height: 44px; }
  .rond { position: relative; width: 44px; height: 44px; border-radius: 999px; background: var(--surface); border: 1px solid var(--line); color: var(--ink); display: grid; place-items: center; cursor: pointer; text-decoration: none; }
  .rond.av { background: var(--accent); color: var(--on-signal); font: 700 15px/1 'Barlow', sans-serif; letter-spacing: 0.04em; }
  [data-face='jour'] .rond.av { background: #0B1B2E; color: #fff; }
  .pastille { position: absolute; top: 9px; right: 10px; width: 9px; height: 9px; border-radius: 999px; background: var(--signal); border: 2px solid var(--surface); }
  .contenu { grid-area: contenu; min-height: 0; padding: 8px 20px 24px; } .interieur { display: flex; flex-direction: column; gap: 20px; } .sous { margin-top: -8px; }
  .pied { grid-area: pied; position: sticky; bottom: 0; padding: 12px 20px calc(12px + env(safe-area-inset-bottom)); background: linear-gradient(180deg, transparent, var(--bg) 28%); } .pied .interieur { gap: 8px; }
  .ecran > :global(.nav) { grid-area: nav; position: sticky; bottom: 0; z-index: 20; }
  @media (min-width: 900px) {
    .ecran { width: 100%; grid-template-rows: auto auto 1fr auto; grid-template-areas: 'entete' 'nav' 'contenu' 'pied'; }
    .entete { padding: 20px max(32px, calc((100% - 1120px) / 2)) 8px; } .entete:has(.marque) { padding-inline: max(32px, calc((100% - 1120px) / 2)); }
    .ecran > :global(.nav) { position: static; padding: 0 max(32px, calc((100% - 1120px) / 2)); }
    .contenu, .pied { padding-inline: max(32px, calc((100% - 1120px) / 2)); } .ecran:not(.large) .interieur { max-width: 640px; }
    .pied { position: static; background: none; } .pied .interieur { max-width: 640px; }
  }
</style>

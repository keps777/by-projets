<script lang="ts">
  import { onMount } from 'svelte';
  import { aller } from '../../router.svelte.ts';
  import { app, maintenant, aujourdhui } from '../../data/store.svelte.ts';
  import { notificationsDe, nonLues, personneCourante, heureLocale } from '../../domain/actions.ts';
  import { grouperParJour } from '../../core/fenetres.ts';
  import { t } from './i18n.ts';
  import { avancerLitiges, marquerLu, marquerToutLu } from './actions.ts';
  import type { Notification } from '../../domain/types.ts';
  import { nav } from './lien.ts';

  /** Contenu des notifications du monde simulé (`notificationsDe`) : groupées par jour, marquer lu, lien vers l'écran concerné.
   *  Monté par la page `/notifications` ET par la fenêtre globale (`NotificationsFeuille`). `fenetre` : barre « compteur · tout marquer lu » et entrée en cascade ;
   *  `apres` : appelé avant de suivre un lien (ferme la fenêtre). */
  let { fenetre = false, apres }: { fenetre?: boolean; apres?: () => void } = $props();
  const moi = $derived(personneCourante());
  const liste = $derived(moi ? notificationsDe(moi.id) : []);
  const nb = $derived(nonLues(app.session.personneId));
  const groupes = $derived.by(() => {
    const titres = { auj: t('aujourdhui'), hier: t('hier'), avant: t('avant') };
    let rang = 2;
    return grouperParJour(liste, aujourdhui()).map((g) => { const debut = rang; rang += 1 + g.items.length; return { ...g, titre: titres[g.cle], debut }; });
  });
  const rang = (n: number) => Math.min(n, 14);
  /** Pictogramme selon le type de notification. */
  const ICONES: Record<string, string> = {
    billet: 'M3.5 7.5h17v3a2 2 0 0 0 0 4v3h-17v-3a2 2 0 0 0 0-4z', remboursement: 'M3 7h18v10H3zM12 12m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0', retard: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l3 2',
    colis: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5L12 12l8-4.5M12 12v9', caisse: 'M3 7h18v10H3z', fidelite: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
    litige: 'M12 3l9.5 17h-19zM12 10v4M12 17.5v.5', compte: 'M12 8m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M4.5 20.5a7.5 7.5 0 0 1 15 0', defaut: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0'
  };
  const icone = (n: Notification) => ICONES[n.type ?? ''] ?? ICONES.defaut;
  function ouvrir(n: Notification, e: MouseEvent) { e.preventDefault(); marquerLu(n.id); apres?.(); if (n.lien) aller(n.lien); }
  onMount(() => avancerLitiges(maintenant()));
</script>

<div class="notifs" class:fen={fenetre}>
  {#if fenetre && nb > 0}
    <div class="barre cas" style:--i="0"><button class="b s sm" type="button" onclick={() => moi && marquerToutLu(moi.id)}>{t('toutMarquerLu')}</button></div>
  {/if}
  {#if groupes.length === 0}
    <div class="center vide cas" style:--i="0"><span class="ill"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={ICONES.defaut} /></svg></span><h2 class="ttl t18" style="margin: 0">Rien pour l’instant</h2><span class="t14 mut">Tes billets, colis et retards apparaîtront ici.</span></div>
  {/if}
  {#each groupes as g (g.cle)}
    <span class="lab cas" style:--i={rang(g.debut)}>{g.titre}</span>
    <ul class="gl col" style="gap: 0; list-style: none">
      {#each g.items as n, k (n.id)}
        <li class="cas" style:--i={rang(g.debut + 1 + k)}>
          <a class="nt" class:un={!n.lu} href={n.lien ?? '/notifications'} onclick={(e) => ouvrir(n, e)} aria-label="{n.titre}. {n.sous}{n.lu ? '' : ' (non lue)'}">
            <span class="bub" class:aq={!n.lu}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={icone(n)} /></svg></span>
            <span class="col grow"><span class="t14 b7">{n.titre}</span><span class="t13 mut">{n.sous}</span></span>
            <span class="t12 mut3" style="padding-right: 14px">{heureLocale(n.ts)}</span>
          </a>
        </li>
      {/each}
    </ul>
  {/each}
  {#if moi?.role === 'voyageur'}<a class="b g cas" style:--i={rang(2 + groupes.length + liste.length)} href="/reglages" use:nav onclick={() => apres?.()}>Choisir ce qui me réveille</a>{/if}
</div>

<style>
  .notifs { display: flex; flex-direction: column; gap: 12px; flex: 1; } .notifs > :global(*) { flex: none; } .notifs > :global(.center) { flex: 1 1 auto; }
  .barre { display: flex; align-items: center; justify-content: flex-end; }
  .vide { min-height: 260px; } .vide .ill { width: 110px; height: 110px; border-radius: 36px; }
  .nt { display: flex; align-items: flex-start; gap: 12px; padding: 12px 0; min-height: 56px; text-decoration: none; color: inherit; position: relative; }
  .nt.un:after { content: ''; position: absolute; right: 0; top: 16px; width: 8px; height: 8px; border-radius: 50%; background: #3de0ff; box-shadow: 0 0 10px #3de0ff; }
  li + li .nt { border-top: 1px solid rgba(255, 255, 255, 0.08); }
  .b:disabled { opacity: 0.5; }
  .fen .cas { animation: entre 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.15) both; animation-delay: calc(var(--i, 0) * 50ms + 150ms); }
  @keyframes entre { from { opacity: 0; transform: translateY(20px); } }
  @media (prefers-reduced-motion: reduce) { .fen .cas { animation: fondu 0.2s both; animation-delay: 0s; } @keyframes fondu { from { opacity: 0; } } }
</style>

<script lang="ts">
  import { onMount } from 'svelte';
  import { aller } from '../../router.svelte.ts';
  import { app, maintenant, aujourdhui } from '../../data/store.svelte.ts';
  import { notificationsDe, nonLues, personneCourante, heureLocale } from '../../domain/actions.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { dockVoyageur } from '../../ui/dockVoyageur.ts';
  import { ajouterJours, jourDe } from '../../core/dates.ts';
  import { t } from './i18n.ts';
  import { avancerLitiges, marquerLu, marquerToutLu } from './actions.ts';
  import type { Notification } from '../../domain/types.ts';
  import { nav } from './lien.ts';

  /** Notifications du monde simulé (`notificationsDe`) : groupées par jour, marquer lu, lien vers l'écran concerné. */
  const moi = $derived(personneCourante());
  const liste = $derived(moi ? [...notificationsDe(moi.id)].sort((a, b) => b.ts - a.ts) : []);
  const nb = $derived(nonLues(app.session.personneId));
  const jourDeN = (n: Notification) => jourDe(new Date(n.ts));
  const groupes = $derived.by(() => {
    const auj = aujourdhui(), hier = ajouterJours(auj, -1);
    const g: { cle: string; titre: string; items: Notification[] }[] = [{ cle: 'auj', titre: t('aujourdhui'), items: [] }, { cle: 'hier', titre: t('hier'), items: [] }, { cle: 'avant', titre: t('avant'), items: [] }];
    for (const n of liste) { const j = jourDeN(n); g[j >= auj ? 0 : j === hier ? 1 : 2].items.push(n); }
    return g.filter((x) => x.items.length);
  });
  /** Pictogramme selon le type de notification. */
  const ICONES: Record<string, string> = {
    billet: 'M3.5 7.5h17v3a2 2 0 0 0 0 4v3h-17v-3a2 2 0 0 0 0-4z', remboursement: 'M3 7h18v10H3zM12 12m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0', retard: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l3 2',
    colis: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5L12 12l8-4.5M12 12v9', caisse: 'M3 7h18v10H3z', fidelite: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z',
    litige: 'M12 3l9.5 17h-19zM12 10v4M12 17.5v.5', compte: 'M12 8m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0M4.5 20.5a7.5 7.5 0 0 1 15 0', defaut: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0'
  };
  const icone = (n: Notification) => ICONES[n.type ?? ''] ?? ICONES.defaut;
  const heure = (n: Notification) => heureLocale(n.ts);
  function ouvrir(n: Notification, e: MouseEvent) { e.preventDefault(); marquerLu(n.id); if (n.lien) aller(n.lien); }
  onMount(() => avancerLitiges(maintenant()));
</script>

<Mobile dock={dockVoyageur('moi')} sansRetour>
  {#snippet enteteLibre()}
    <header class="hd">
      <div class="row g12" style="min-width: 0">
        <button type="button" class="ib" aria-label="Retour" onclick={() => aller('/moi')}><Icone nom="retour" /></button>
        <h1 class="ttl t16 ell" style="margin: 0">{t('notifications')}</h1>
      </div>
      <button class="b s sm tout" type="button" disabled={nb === 0} onclick={() => moi && marquerToutLu(moi.id)}>{nb === 0 ? t('toutLu') : t('toutMarquerLu')}</button>
    </header>
  {/snippet}
  {#if groupes.length === 0}
    <div class="center"><span class="ill"><svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={ICONES.defaut} /></svg></span><h2 class="ttl t18" style="margin: 0">Rien pour l’instant</h2><span class="t14 mut">Tes billets, colis et retards apparaîtront ici.</span></div>
  {/if}
  {#each groupes as g (g.cle)}
    <span class="lab">{g.titre}</span>
    <ul class="gl col" style="gap: 0; list-style: none">
      {#each g.items as n (n.id)}
        <li>
          <a class="nt" class:un={!n.lu} href={n.lien ?? '/notifications'} onclick={(e) => ouvrir(n, e)} aria-label="{n.titre}. {n.sous}{n.lu ? '' : ' (non lue)'}">
            <span class="bub" class:aq={!n.lu}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={icone(n)} /></svg></span>
            <span class="col grow"><span class="t14 b7">{n.titre}</span><span class="t13 mut">{n.sous}</span></span>
            <span class="t12 mut3" style="padding-right: 14px">{heure(n)}</span>
          </a>
        </li>
      {/each}
    </ul>
  {/each}
  <a class="b g" href="/reglages" use:nav>Choisir ce qui me réveille</a>
</Mobile>

<style>
  .nt { display: flex; align-items: flex-start; gap: 12px; padding: 12px 0; min-height: 56px; text-decoration: none; color: inherit; position: relative; }
  .nt.un:after { content: ''; position: absolute; right: 0; top: 16px; width: 8px; height: 8px; border-radius: 50%; background: #3de0ff; box-shadow: 0 0 10px #3de0ff; }
  li + li .nt { border-top: 1px solid rgba(255, 255, 255, 0.08); }
  .b:disabled { opacity: 0.5; }
  .tout { white-space: nowrap; flex: none; }
</style>

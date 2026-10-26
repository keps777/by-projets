<script lang="ts">
  import { onMount } from 'svelte';
  import './compte.css';
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Pic from './Pic.svelte';
  import { etatForce, reseau } from './reseau.svelte.ts';
  import { maintenant } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { FILTRES_NOTIF, TYPES_NOTIF, filtrerNotifs, grouperParJour, heureRelative, marquerLu, nonLues, notificationsDe, texteCompteur, toutMarquerLu, type FiltreNotif } from './notifs.ts';
  import type { Notification } from '../../domain/types.ts';

  /** Centre de notifications : non lues, filtres, groupes par jour, marquer lu, liens profonds. États : chargement, vide, filtre vide, erreur, hors ligne. */
  const compte = $derived(compteCourant());
  let now = $state(maintenant());
  const toutes = $derived(compte ? notificationsDe(compte.id) : []);
  const filtre = $state<{ v: FiltreNotif }>({ v: 'toutes' });
  const visibles = $derived(filtrerNotifs(toutes, filtre.v));
  const groupes = $derived(grouperParJour(visibles, now));
  const n = $derived(nonLues(toutes));
  const marquable = $derived(n > 0 && reseau.enLigne);
  let vue = $state<'normal' | 'chargement' | 'erreur'>('normal');
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  onMount(() => { const f = etatForce(); if (f === 'erreur' || f === 'chargement') vue = f; now = maintenant(); return () => clearTimeout(minuterie); });
  function reessayer() { vue = 'chargement'; clearTimeout(minuterie); minuterie = setTimeout(() => (vue = 'normal'), 900); }
  function ouvrir(notif: Notification, e: MouseEvent) {
    marquerLu(notif.id);
    if (notif.lien && !(e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) { e.preventDefault(); aller(notif.lien); }
  }
  const tout = () => { if (marquable && compte) toutMarquerLu(compte.id); };
</script>

<Ecran titre="Notifications" face="nuit" {droite}>
  <div class="cp page">
    {#if vue === 'chargement'}
      <div aria-busy="true"><span class="sr" role="status">Chargement des notifications…</span>
        <div class="cp-sq" aria-hidden="true">{#each [0, 1, 2, 3, 4] as i (i)}<div><i class="b"></i><span class="c"><i style="height:10px;width:38%"></i><i style="height:14px;width:92%"></i><i style="height:10px;width:64%"></i></span></div>{/each}</div></div>
    {:else if vue === 'erreur'}
      <section class="cp-erreur" role="alert" aria-labelledby="err-titre"><span class="rond"><Icone nom="alerte" taille={28} /></span><h2 id="err-titre">Impossible de charger vos notifications</h2><p>Vérifiez votre connexion, puis réessayez.</p>
        <button type="button" class="btn" onclick={reessayer}>Réessayer</button><a class="cp-lien" href="/aide/contact" onclick={(e) => { e.preventDefault(); aller('/aide/contact'); }}>Contacter l’assistance</a></section>
    {:else}
      {#if toutes.length}
        <div class="haut"><p id="compteur" role="status" aria-live="polite" class="cpt">{texteCompteur(n)}</p>
          <button type="button" class="tout" aria-disabled={marquable ? 'false' : 'true'} onclick={tout}>Tout marquer comme lu</button></div>
        <div role="group" aria-label="Filtrer par type" class="puces">
          {#each FILTRES_NOTIF as f (f.id)}<button type="button" aria-pressed={filtre.v === f.id} onclick={() => (filtre.v = f.id)}>{f.label}</button>{/each}
        </div>
      {/if}
      {#if !reseau.enLigne}<div class="cp-hl" role="status"><Icone nom="hors_ligne" taille={20} /><span class="col"><b>Hors ligne : dernières notifications reçues</b><span class="d">Reconnectez-vous pour actualiser la liste.</span></span></div>{/if}

      {#if !toutes.length}
        <section class="cp-etat" aria-labelledby="vide-titre"><span class="rond"><Pic nom="cloche" taille={30} /></span><h2 id="vide-titre">Rien de nouveau</h2><p>Vos échéances, ventes et offres apparaîtront ici dès qu’il y aura du nouveau.</p>
          <a class="btn" href="/notifications/preferences" onclick={(e) => { e.preventDefault(); aller('/notifications/preferences'); }}>Régler mes notifications</a></section>
      {:else if !visibles.length}
        <section class="cp-etat" aria-labelledby="vf-titre"><span class="rond"><Pic nom="cloche_barree" taille={30} /></span><h2 id="vf-titre">Aucune notification de ce type</h2><p>Essayez un autre filtre ou affichez toutes vos notifications.</p>
          <button type="button" class="btn sec" onclick={() => (filtre.v = 'toutes')}>Voir toutes</button></section>
      {:else}
        {#each groupes as g (g.id)}
          <section class="cp-groupe" aria-labelledby={`g-${g.id}`} data-groupe={g.id}><h2 id={`g-${g.id}`} class="cp-sur">{g.titre}</h2>
            <ul class="cp-liste">
              {#each g.items as it (it.id)}
                {@const t = TYPES_NOTIF[it.type]}
                <li><a class="item" class:nl={!it.lu} href={it.lien ?? '/notifications'} data-notification={it.id} data-type={it.type} onclick={(e) => ouvrir(it, e)}>
                  {#if !it.lu}<span class="sr">Non lue.</span>{/if}
                  <span class={`ic ${t.ton}`} aria-hidden="true"><Pic nom={t.icone} taille={20} /></span>
                  <span class="col g3 grow"><span class="ligne"><span class={`typ ${t.ton}`}>{t.libelle}</span><span class="mono h">{heureRelative(it.quand, now)}</span></span>
                    <span class="tit">{it.titre}</span><span class="ext">{it.sous}</span></span>
                  {#if !it.lu}<span class="pt" aria-hidden="true"></span>{/if}</a></li>
              {/each}
            </ul></section>
        {/each}
        <a class="cp-ligne carte-l" href="/alertes" onclick={(e) => { e.preventDefault(); aller('/alertes'); }}><Pic nom="cloche" /><span class="cp-t grow">Gérer mes alertes de prix et de drops</span><span class="cp-chev"><Pic nom="chevron" taille={18} /></span></a>
      {/if}
    {/if}
  </div>
</Ecran>

{#snippet droite()}
  <a class="prefs" href="/notifications/preferences" aria-label="Préférences de notifications" onclick={(e) => { e.preventDefault(); aller('/notifications/preferences'); }}><Pic nom="curseurs" taille={22} /></a>
{/snippet}

<style>
  .page { display: flex; flex-direction: column; gap: 22px; } .g3 { gap: 3px; }
  .prefs { width: 44px; height: 44px; border-radius: 999px; display: flex; align-items: center; justify-content: center; color: var(--ink); }
  .haut { display: flex; align-items: center; justify-content: space-between; gap: 12px; } .cpt { margin: 0; font-size: 15px; font-weight: 600; }
  .tout { min-height: 44px; padding: 0 0 0 12px; border: 0; background: transparent; color: var(--accent); font-size: 14px; font-weight: 600; cursor: pointer; } .tout[aria-disabled='true'] { color: var(--ink3); cursor: default; }
  .puces { display: flex; gap: 8px; margin: 0 -20px; padding: 0 20px; overflow-x: auto; contain: inline-size; scrollbar-width: none; } .puces::-webkit-scrollbar { display: none; }
  .puces button { flex: none; min-height: 44px; padding: 0 16px; border-radius: 999px; background: var(--surface2); border: 1px solid var(--line-strong); color: var(--ink2); font: 700 14px/1 'Barlow', sans-serif; cursor: pointer; } .puces button[aria-pressed='true'] { background: var(--accent-soft); border-color: var(--accent); color: var(--ink); }
  .item { position: relative; display: flex; align-items: flex-start; gap: 12px; min-height: 72px; padding: 14px 16px; box-sizing: border-box; color: var(--ink); text-decoration: none; } .item.nl { background: var(--surface2); } .item:hover { background: var(--surface2); }
  .ic { width: 40px; height: 40px; flex: none; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: var(--surface3); color: var(--ink2); } .ic.accent { background: var(--accent-soft); color: var(--accent); } .ic.up { background: rgba(98, 199, 255, 0.12); color: var(--up); } .ic.ok { background: var(--ok-soft); color: var(--ok); }
  .ligne { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; } .typ { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink2); } .typ.accent { color: var(--accent); } .typ.up { color: var(--up); } .typ.ok { color: var(--ok); }
  .h { flex: none; font-size: 12px; color: var(--ink3); font-variant-numeric: tabular-nums; } .tit { font-size: 15px; line-height: 20px; font-weight: 500; color: var(--ink2); overflow-wrap: anywhere; } .nl .tit { font-weight: 700; color: var(--ink); } .ext { font-size: 13px; line-height: 18px; color: var(--ink3); } .nl .ext { color: var(--ink2); }
  .pt { flex: none; width: 8px; height: 8px; margin-top: 6px; border-radius: 999px; background: var(--accent); }
  .carte-l { border-radius: 20px; background: var(--surface); border: 1px solid var(--line); }
</style>

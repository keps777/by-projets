<script lang="ts">
  import { app } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import { deconnecter, notificationsDe, personneCourante } from '../../domain/actions.ts';
  import { NOM_ROLE } from '../../domain/acces.ts';
  import { formaterTel } from '../../core/supervision.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import { dockSuperviseur } from './dock.ts';
  import { hhmm, initiales, va } from './nav.ts';
  import { ouvrirNotifications } from '../../ui/overlays.svelte.ts';

  const moi = $derived(personneCourante());
  const gare = $derived(app.monde.gares.find((g) => g.id === moi?.gareId));
  const notifs = $derived(moi ? notificationsDe(moi.id).slice(0, 6) : []);
  function sortir() { deconnecter(); aller('/entree', { remplacer: true }); }
</script>

<Mobile titre="Moi" sansRetour dock={dockSuperviseur('moi')}>
  {#if moi}
    <div class="gl ac row g12"><span class="av" aria-hidden="true">{initiales(moi)}</span><span class="col"><span class="ttl t18">{moi.prenom} {moi.nom}</span><span class="t13 mut">{NOM_ROLE[moi.role]}{gare ? ` · gare de ${gare.nom}` : ''}</span></span></div>
    <div class="gl col" style="gap: 0">
      <div class="li"><span class="grow t14">Téléphone</span><span class="t14 b7 mono">{formaterTel(moi.tel)}</span></div>
      <div class="li"><span class="grow t14">Visage enregistré</span><span class="pl {moi.visage ? 'ok' : ''}">{moi.visage ? 'oui' : 'non'}</span></div>
      <div class="li"><span class="grow t14">Règle de clôture</span><span class="t14 b7">{app.monde.params.regles.cloture ? 'avant 20:00' : 'désactivée'}</span></div>
    </div>
    <div class="row sp"><span class="lab">Notifications</span><button type="button" class="t13 aq" style="background: none; border: 0; min-height: 44px; cursor: pointer" aria-haspopup="dialog" onclick={ouvrirNotifications}>Tout voir</button></div>
    <div class="gl col" style="gap: 0">
      {#each notifs as n (n.id)}
        {#if n.lien}<a class="li" href={n.lien} onclick={va(n.lien)}><span class="col grow"><span class="t14 b7">{n.titre}</span><span class="t12 mut">{n.sous}</span></span><span class="t12 mut3 mono">{hhmm(n.ts)}</span></a>
        {:else}<div class="li"><span class="col grow"><span class="t14 b7">{n.titre}</span><span class="t12 mut">{n.sous}</span></span><span class="t12 mut3 mono">{hhmm(n.ts)}</span></div>{/if}
      {:else}<div class="t13 mut c" style="padding: 12px 0">Aucune notification.</div>{/each}
    </div>
    <button type="button" class="b s" style="margin-top: auto" onclick={sortir}>Se déconnecter</button>
  {/if}
</Mobile>

<script lang="ts">
  import { aller } from '../../router.svelte.ts';
  import { app } from '../../data/store.svelte.ts';
  import { nonLues, personneCourante } from '../../domain/actions.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { dockVoyageur } from '../../ui/dockVoyageur.ts';
  import { t } from './i18n.ts';
  import { marquerToutLu } from './actions.ts';
  import NotificationsContenu from './NotificationsContenu.svelte';

  /** Page autonome `/notifications` (lien profond) : même contenu que la fenêtre globale `NotificationsFeuille` (la cloche ouvre la fenêtre, pas cette page). */
  const moi = $derived(personneCourante());
  const nb = $derived(nonLues(app.session.personneId));
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
  <NotificationsContenu />
</Mobile>

<style>
  .b:disabled { opacity: 0.5; }
  .tout { white-space: nowrap; flex: none; }
</style>

<script lang="ts">
  import Feuille from '../../ui/Feuille.svelte';
  import { app } from '../../data/store.svelte.ts';
  import { notificationsDe, nonLues } from '../../domain/actions.ts';
  import { compteurNotifications } from '../../core/fenetres.ts';
  import { overlays, fermerNotifications } from '../../ui/overlays.svelte.ts';
  import { t } from './i18n.ts';
  import NotificationsContenu from './NotificationsContenu.svelte';

  /** La cloche en fenêtre : monte du bas SUR la page courante (voile flouté). Ouvrir une notification la marque lue, ferme la fenêtre puis suit le lien. */
  const id = $derived(app.session.personneId);
  const sous = $derived(compteurNotifications(id ? notificationsDe(id).length : 0, nonLues(id)));
</script>

<Feuille bind:ouvert={overlays.notifications} titre={t('notifications')} {sous} hauteur="haute">
  <NotificationsContenu fenetre apres={fermerNotifications} />
</Feuille>

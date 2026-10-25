<script lang="ts">
  import { param } from '../../router.svelte.ts';
  import { departParId, gare, ligneDe, personneCourante } from '../../domain/actions.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import { dockVoyageur } from '../../ui/dockVoyageur.ts';
  import { billetChoisi } from '../reglement/selection.ts';
  import { courseActive } from './actions.ts';
  import CourseContenu from './CourseContenu.svelte';

  /** Moto-taxi vers la gare (lien profond `/course`) : la page Billets, l'écran Direct et les autres écrans affichent le même contenu dans la fenêtre « Moto-taxi vers la gare ». */
  const moi = $derived(personneCourante());
  const active = $derived(courseActive(moi?.id));
  const departId = $derived(param('depart') ?? (moi ? billetChoisi(moi.id)?.departId : undefined));
  const d = $derived(active ? departParId(active.departId) : departId ? departParId(departId) : undefined);
  const gareDe = $derived(d ? gare(ligneDe(d).gareDe) : undefined);
</script>

<Mobile titre="Moto-taxi vers la gare" sous={gareDe && d ? `Vers la gare de ${gareDe.nom} · pour le bus de ${d.heure}` : 'Moto ou taxi, au choix'} retourVers="/" dock={dockVoyageur('voyager')}>
  <CourseContenu {departId} />
</Mobile>

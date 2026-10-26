<script lang="ts">
  import { param } from '../../router.svelte.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { dropAffiche, etatDrop } from '../../domain/drop.ts';
  import { tempsReel } from '../voyager/temps.svelte.ts';
  import Direct from './Direct.svelte';
  import Epuise from './Epuise.svelte';

  /** Drop membres : le drop en direct (compte à rebours, places, réservation) ou, quand il n'y a plus de place ou qu'il est terminé, l'écran « épuisé » sur la même route. `?etat=epuise` force l'aperçu de l'état épuisé. */
  const temps = tempsReel(1000);
  const compte = $derived(compteCourant());
  const drop = $derived(dropAffiche(temps.maintenant));
  const simule = $derived(param('etat') === 'epuise');
  const direct = $derived(!!drop && !simule && etatDrop(drop, temps.maintenant) === 'direct');
</script>
{#if drop && direct}<Direct {drop} now={temps.maintenant} {compte} />{:else}<Epuise {drop} now={temps.maintenant} {compte} {simule} />{/if}

<script lang="ts">
  import { onMount } from 'svelte';
  import { aller } from '../../router.svelte.ts';
  import Bouton from '../../ui/Bouton.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { formaterTel } from '../../core/auth.ts';
  import Etape from './Etape.svelte';
  import SaisieOtp from './SaisieOtp.svelte';
  import { etatAuth } from './etat.ts';

  const b = etatAuth().brouillon;
  let verifie = $state(b.etape >= 2);
  onMount(() => { if (b.etape < 1 || !b.tel) aller('/inscription/telephone', { remplacer: true }); });
  function continuer() { b.etape = Math.max(b.etape, 2) as typeof b.etape; aller('/inscription/identite'); }
</script>

<Etape retourVers="/inscription/telephone" repere="ÉTAPE 2 / 5 · CODE SMS" segments={5} segmentActif={2} titre="Tapez le code reçu au +237 {formaterTel(b.tel)}." sous="Valable 5 minutes.">
  {#if b.tel}<SaisieOtp numero={b.tel} bind:verifie compact />{/if}
  {#snippet pied()}
    <Bouton desactive={!verifie} onclick={continuer}>Continuer<Icone nom="fleche" taille={18} trait={2.2} /></Bouton>
  {/snippet}
</Etape>

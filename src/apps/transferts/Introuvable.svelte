<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { va } from '../voyager/lien.ts';
  /** Droit absent, ou qui n'est plus dans le portefeuille du compte : on le dit, on propose la suite. */
  let { titre = 'Droit introuvable', message = 'Ce droit de voyage n’est pas (ou plus) dans votre portefeuille.', lien = '/portefeuille', libelleLien = 'Retour au portefeuille' }: { titre?: string; message?: string; lien?: string; libelleLien?: string } = $props();
</script>
<Ecran titre="Transfert" face="nuit" retour="/portefeuille">
  <div class="carte col g12" role="alert"><span class="ico"><Icone nom="alerte" taille={26} /></span><h1 class="t-section">{titre}</h1><p class="t-sec">{message}</p>
    <a class="btn" href={lien} onclick={(e) => va(e, lien)}>{libelleLien}</a></div>
</Ecran>
<style>
  .carte { align-items: flex-start; padding: 20px; } .ico { width: 48px; height: 48px; border-radius: 999px; display: grid; place-items: center; background: var(--err-soft); color: var(--err); } .t-section { text-transform: uppercase; letter-spacing: 0.02em; }
</style>

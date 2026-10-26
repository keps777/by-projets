<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { naviguer } from './lien.ts';
  /** État « introuvable » commun : droit absent ou à quelqu'un d'autre, offre disparue. */
  let { titre, message, lien = '/', libelleLien = 'Retour à l’accueil', retour }: { titre: string; message: string; lien?: string; libelleLien?: string; retour?: string } = $props();
</script>
<Ecran {titre} face="jour" {retour}>
  <div class="carte vide" role="alert"><span class="ico"><Icone nom="alerte" taille={26} /></span><p class="t-section">{titre}</p><p class="t-sec">{message}</p>
    <a class="btn" href={lien} onclick={(e) => naviguer(e, lien)}>{libelleLien}</a></div>
</Ecran>
<style>
  .vide { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; padding: 20px; }
  .ico { width: 48px; height: 48px; border-radius: 999px; display: grid; place-items: center; background: var(--err-soft); color: var(--err); }
  .t-section { text-transform: uppercase; letter-spacing: 0.02em; }
</style>

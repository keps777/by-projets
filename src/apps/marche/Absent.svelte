<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { naviguer } from './lien.ts';
  /** État « introuvable » ou « impossible » de la face nuit : titre, explication, lien de sortie. */
  let { titre, message, details = [], lien = '/portefeuille', libelleLien = 'Voir mon portefeuille', retour, autre, libelleAutre }: { titre: string; message: string; details?: string[]; lien?: string; libelleLien?: string; retour?: string; autre?: string; libelleAutre?: string } = $props();
</script>
<Ecran {titre} face="nuit" {retour}>
  <div class="carte vide" role="alert"><span class="ico"><Icone nom="info" taille={26} /></span><p class="t-section">{titre}</p><p class="t-sec">{message}</p>
    {#each details as d}<p class="t-aide">{d}</p>{/each}
    <a class="btn" href={lien} onclick={(e) => naviguer(e, lien)}>{libelleLien}</a>
    {#if autre && libelleAutre}<a class="btn sec" href={autre} onclick={(e) => naviguer(e, autre)}>{libelleAutre}</a>{/if}</div>
</Ecran>
<style>
  .vide { display: flex; flex-direction: column; gap: 12px; align-items: stretch; padding: 20px; }
  .vide .btn { align-self: stretch; }
  .ico { width: 48px; height: 48px; border-radius: 999px; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); }
  .t-section { text-transform: uppercase; letter-spacing: 0.02em; }
</style>

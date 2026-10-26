<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import { ROUTES, aller } from '../../router.svelte.ts';
  /** Annuaire de toutes les routes déclarées : pratique en développement et pour la démonstration. */
  const liens = ROUTES.filter((r) => !r.chemin.includes(':')).sort((a, b) => a.chemin.localeCompare(b.chemin));
</script>
<Ecran titre="Tous les écrans" face="nuit" retour="/">
  <ul class="liste-plain col g8">{#each liens as r (r.chemin)}<li><a class="carte row g12" href={r.chemin} onclick={(e) => { e.preventDefault(); aller(r.chemin); }}><span class="grow"><b>{r.titre}</b><br /><span class="t-aide mono">{r.chemin}</span></span><span class="puce">{r.acces ?? 'compte'}</span></a></li>{/each}</ul>
</Ecran>

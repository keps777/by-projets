<script lang="ts">
  import Mobile from '../../ui/Mobile.svelte';
  import { aller } from '../../router.svelte.ts';
  import { app } from '../../data/store.svelte.ts';
  import { ACCUEIL } from '../../domain/acces.ts';
  import { MODULES } from '../patron/modules.ts';

  /** Écran d'un service que le patron a désactivé (Modules) : la voyageuse et les agents le voient, le patron peut le rallumer. */
  let { module }: { module: string } = $props();
  const nom = $derived(MODULES.find((m) => m.cle === module)?.nom ?? 'Ce service');
  const patron = $derived(app.session.role === 'patron');
  const accueil = $derived(app.session.role ? ACCUEIL[app.session.role] : '/entree');
</script>

<Mobile titre="Service désactivé" sansRetour>
  <div class="center">
    <div class="ill er" aria-hidden="true"><span class="ttl" style="font-size: 36px">OFF</span></div>
    <span class="ttl t20">{nom} : désactivé</span>
    <span class="t14 mut" style="max-width: 32ch">{patron ? 'Tu as désactivé ce module : il est caché aux voyageurs et aux agents.' : 'Ta compagnie n’offre pas ce service pour le moment.'}</span>
  </div>
  {#if patron}<a class="b p" href="/modules" onclick={(e) => { e.preventDefault(); aller('/modules'); }}>Gérer les modules</a>{/if}
  <a class="b {patron ? 'g' : 'p'}" href={accueil} onclick={(e) => { e.preventDefault(); aller(accueil); }}>Retour à l’accueil</a>
</Mobile>

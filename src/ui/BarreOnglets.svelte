<script lang="ts">
  import { aller } from '../router.svelte.ts';
  import Icone from './Icone.svelte';
  let { actif = '' }: { actif?: string } = $props();
  const onglets = [{ id: 'accueil', nom: 'Accueil', vers: '/', icone: 'accueil' }, { id: 'coffres', nom: 'Coffres', vers: '/coffres', icone: 'coffre' }, { id: 'score', nom: 'Score', vers: '/score', icone: 'score' }, { id: 'profil', nom: 'Profil', vers: '/profil', icone: 'profil' }];
</script>

<nav aria-label="Navigation principale">
  {#each onglets.slice(0, 2) as o (o.id)}<a href={o.vers} class:actif={actif === o.id} onclick={(e) => { e.preventDefault(); aller(o.vers); }}><Icone nom={o.icone} /><span>{o.nom}</span></a>{/each}
  <a class="scan" href="/pay/scan" aria-label="Scanner pour payer" onclick={(e) => { e.preventDefault(); aller('/pay/scan'); }}><Icone nom="scan" taille={24} trait={2} /></a>
  {#each onglets.slice(2) as o (o.id)}<a href={o.vers} class:actif={actif === o.id} onclick={(e) => { e.preventDefault(); aller(o.vers); }}><Icone nom={o.icone} /><span>{o.nom}</span></a>{/each}
</nav>

<style>
  nav { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); width: min(100%, 460px); display: grid; grid-template-columns: 1fr 1fr 64px 1fr 1fr; align-items: center; padding: 8px 8px calc(env(safe-area-inset-bottom) + 6px); background: color-mix(in srgb, var(--fond) 90%, transparent); backdrop-filter: blur(14px); border-top: 1px solid var(--ligne); z-index: 20; }
  a { display: flex; flex-direction: column; align-items: center; gap: 3px; color: var(--faint); font-size: 10.5px; font-weight: 550; padding: 4px 0; } a.actif { color: var(--texte); }
  .scan { width: 56px; height: 56px; border-radius: 28px; margin-top: -26px; background: var(--primaire); color: #fff; justify-content: center; box-shadow: 0 8px 26px rgba(48, 80, 255, 0.5); border: 4px solid var(--fond); }
</style>

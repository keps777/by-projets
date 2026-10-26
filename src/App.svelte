<script lang="ts">
  import type { Component } from 'svelte';
  import { onMount } from 'svelte';
  import { ROUTES, aller, resoudre, routeur } from './router.svelte.ts';
  import { app } from './data/store.svelte.ts';
  import { compteCourant, estAdmin } from './domain/compte.ts';
  import ToastHote from './ui/ToastHote.svelte';

  /** Racine : résout la route, applique la garde d'accès (public / compte / admin), charge l'écran à la demande. */
  const trouve = $derived(resoudre(ROUTES, routeur.chemin));
  const route = $derived(trouve?.route);
  const params = $derived(trouve?.params ?? {});
  const acces = $derived(route?.acces ?? 'compte');
  const compte = $derived(compteCourant());
  /** Redirection de garde : pas de compte → ouverture ; compte non admin sur une route admin → accueil. */
  const appareilConnu = $derived(!!(app.tranches.acces as { appareil?: unknown } | undefined)?.appareil);
  const redirection = $derived(!route ? null : acces === 'public' ? null : !compte ? (appareilConnu ? '/connexion' : '/ouverture') : acces === 'admin' && !estAdmin(compte) ? '/' : null);
  $effect(() => { if (redirection) aller(redirection, { remplacer: true }); });

  let Ecran = $state<Component<any> | null>(null), erreur = $state(false);
  let cle = 0;
  $effect(() => {
    const r = route; if (!r || redirection) { Ecran = null; return; }
    const ma = ++cle; erreur = false;
    r.composant().then((m) => { if (ma === cle) Ecran = m.default; }).catch(() => { if (ma === cle) erreur = true; });
  });
  $effect(() => { document.title = route ? `${route.titre} — NexG-TT` : 'NexG-TT'; });
  onMount(() => { void app; });
</script>

<a class="saut" href="#contenu">Aller au contenu</a>
{#if erreur}
  <div class="nx" data-face="nuit" style="min-height:100dvh;display:grid;place-items:center;padding:24px;text-align:center"><div class="col g12"><p class="t-ecran">Écran indisponible</p><p class="t-sec">Vérifiez votre connexion puis rechargez la page.</p><button type="button" class="btn" onclick={() => location.reload()}>Recharger</button></div></div>
{:else if Ecran && !redirection}
  {#key routeur.chemin}<Ecran {...params} />{/key}
{:else if !route}
  {#await import('./apps/_socle/NonTrouve.svelte') then m}<m.default />{/await}
{/if}
<ToastHote />

<style>
  .saut { position: fixed; left: 8px; top: -64px; z-index: 100; padding: 12px 16px; border-radius: 12px; background: #FFD23F; color: #0B1B2E; font: 700 14px 'Barlow', sans-serif; }
  .saut:focus { top: 8px; }
</style>

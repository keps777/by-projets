<script lang="ts">
  import type { Component } from 'svelte';
  import { routeur, resoudre, ROUTES, aller, type Route } from './router.svelte.ts';
  import { app, maintenant } from './data/store.svelte.ts';
  import { sessionExpiree } from './core/auth.ts';
  import { toast } from './ui/toast.svelte.ts';
  import BarreOnglets from './ui/BarreOnglets.svelte';
  import NonTrouve from './screens/_socle/NonTrouve.svelte';

  /** Fonctions lancées à la connexion par les fonctionnalités (moteur de paie, rappels…) : `screens/*\/demarrage.ts`. */
  const modulesDemarrage = import.meta.glob<{ default: () => void }>(['./screens/*/demarrage.ts', './portals/*/demarrage.ts'], { eager: true });
  // Le socle (rattrapage des paies) passe en dernier : les fonctionnalités doivent d'abord avoir enregistré leurs prélèvements.
  const demarrages = Object.entries(modulesDemarrage).sort(([a], [b]) => Number(a.includes('/_socle/')) - Number(b.includes('/_socle/'))).map(([, m]) => m.default);

  const trouve = $derived(resoudre(ROUTES, routeur.chemin));
  const route: Route | undefined = $derived(trouve?.route);
  let vue: Component<any> | null = $state(null);
  let chargee = $state('');

  // Garde : connecté ou non, session expirée après 5 min d'inactivité.
  $effect(() => {
    if (route?.garde === 'connecte') {
      if (app.auth.connecte && sessionExpiree(app.auth.derniereActivite, maintenant())) app.auth.connecte = false;
      if (!app.auth.connecte) aller(app.auth.hash ? '/connexion' : '/bienvenue', { remplacer: true });
    }
  });
  $effect(() => { document.documentElement.dataset.theme = route?.cadre === 'portail' ? 'clair' : 'nuit'; });
  $effect(() => {
    if (!route) { vue = null; return; }
    const cle = route.chemin; chargee = cle;
    route.composant().then((m) => { if (chargee === cle) vue = m.default; });
    document.title = route.titre ? `${route.titre} · AssureMe` : 'AssureMe';
  });
  $effect(() => { if (app.auth.connecte) demarrages.forEach((f) => f()); });

  const toucher = () => { if (app.auth.connecte) app.auth.derniereActivite = maintenant(); };
</script>

<svelte:window onpointerdown={toucher} onkeydown={toucher} />

<div class="cadre" class:portail={route?.cadre === 'portail'}>
  {#if !route}<NonTrouve />
  {:else if vue}{#key routeur.chemin}{@const V = vue}<V params={trouve?.params ?? {}} />{/key}{/if}
</div>
{#if route && (route.cadre ?? 'membre') === 'membre' && route.onglet}<BarreOnglets actif={route.onglet} />{/if}
{#if toast.message}<div class="toast {toast.ton}" role="status">{toast.message}</div>{/if}

<style>
  .cadre { min-height: 100dvh; width: min(100%, 460px); margin: 0 auto; position: relative; padding-bottom: env(safe-area-inset-bottom); }
  .cadre.portail { width: 100%; max-width: 1180px; }
  .toast { position: fixed; left: 50%; bottom: calc(env(safe-area-inset-bottom) + 90px); transform: translateX(-50%); z-index: 60; padding: 12px 18px; border-radius: 14px; background: var(--carte2); border: 1px solid var(--bon); font-weight: 550; box-shadow: var(--ombre); animation: monte 0.25s; }
  .toast.danger { border-color: var(--danger); } @keyframes monte { from { opacity: 0; transform: translate(-50%, 12px); } }
</style>

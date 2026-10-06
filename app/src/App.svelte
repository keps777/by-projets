<script lang="ts">
  import type { Component } from 'svelte';
  import { session } from './data/auth.svelte.ts';
  import { horloge } from './data/temps.svelte.ts';
  import { synchro } from './data/sync.svelte.ts';
  import { magasin } from './data/magasin.svelte.ts';
  import { reparerAbonnementSiBesoin } from './screens/accueil/push.ts';
  import { prolongerHorizon } from './data/actions/taches.ts';
  import { routeur, interceptionLiens } from './routeur.svelte.ts';
  import { trouverRoute } from './routes.ts';
  import { theme } from './ui/theme.svelte.ts';
  import Toasts from './ui/Toasts.svelte';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';

  horloge.demarrer();
  theme.demarrer();
  void session.demarrer();

  // À chaque ouverture de session : synchroniser, puis prolonger l'horizon des occurrences. Avec le serveur, on attend
  // la première synchronisation réussie : un appareil resté longtemps fermé écraserait sinon des blocs déjà faits ailleurs.
  let synchroLancee = false;
  $effect(() => {
    if (session.etat === 'deconnecte') synchroLancee = false;
    if (session.etat !== 'connecte' || synchroLancee) return;
    synchroLancee = true;
    synchro.demarrer();
    synchro.apresSynchro(prolongerHorizon);
    // Notifications déjà autorisées mais appareil mal enregistré : on le répare seul, à l'ouverture et au retour dans l'app.
    synchro.apresSynchro(() => void reparerAbonnementSiBesoin(magasin.lignes.abonnements_push));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void reparerAbonnementSiBesoin(magasin.lignes.abonnements_push); });
    void synchro.synchroniser();
  });

  const cible = $derived(trouverRoute(routeur.chemin));

  // Garde : sans session, seul l'écran de connexion est accessible ; connecté, on le quitte.
  $effect(() => {
    if (session.etat === 'demarrage') return;
    if (session.etat === 'deconnecte' && routeur.chemin !== '/connexion') routeur.aller('/connexion', true);
    else if (session.etat === 'connecte' && routeur.chemin === '/connexion') routeur.aller('/', true);
  });

  let ecran = $state<Component<any> | null>(null);
  let paramsEcran = $state<Record<string, string>>({});
  // Chemin réellement affiché : la transition ne part qu'une fois le nouvel écran chargé.
  let cheminAffiche = $state('');
  $effect(() => {
    const c = cible;
    if (!c) { ecran = null; return; }
    let annule = false;
    const chemin = routeur.chemin;
    void c.route.charger().then((m) => { if (!annule) { ecran = m.default; paramsEcran = c.params; cheminAffiche = chemin; } });
    return () => { annule = true; };
  });

  const pret = $derived(session.etat !== 'demarrage');
  const Ecran = $derived(ecran);
</script>

<svelte:document onclick={interceptionLiens} />

{#if !pret || (cible && !Ecran)}
  <div class="attente" aria-busy="true"><span class="titre">Luther Life</span></div>
{:else if cible && Ecran}
  {#key cheminAffiche}
    <div class="vue" in:fly={{ y: 8, duration: 220, easing: cubicOut }}><Ecran params={paramsEcran} /></div>
  {/key}
{:else}
  <div class="attente"><span class="titre">Page introuvable</span><a href="/">Retour au Fil</a></div>
{/if}

{#if session.etat === 'connecte' && synchro.etat !== 'local' && synchro.etat !== 'synchronise'}
  <div class="synchro" class:alerte={synchro.etat === 'erreur'}>
    {synchro.etat === 'hors_ligne' ? 'Hors ligne' : synchro.etat === 'erreur' ? 'Synchronisation interrompue' : 'Synchronisation…'}
  </div>
{/if}
<!-- Fond opaque sous la barre d'état de l'iPhone : le contenu qui défile ne passe pas sous l'heure et les icônes. -->
<div class="barre-statut" aria-hidden="true"></div>
<Toasts />

<style>
  .vue { height: 100%; }
  .barre-statut { position: fixed; top: 0; left: 0; right: 0; height: var(--haut-sûr); background: var(--fond); z-index: 40; pointer-events: none; }
  .attente { height: 100dvh; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; font-size: 24px; }
  .attente a { font-size: 14px; color: var(--accent); }
  .synchro { position: fixed; left: 50%; bottom: calc(76px + var(--bas-sûr)); transform: translateX(-50%); z-index: 80; background: var(--surface-2); color: var(--muted); font-size: 11px; font-weight: 600; padding: 5px 12px; border-radius: 14px; border: 1px solid var(--ligne); }
  .synchro.alerte { color: var(--alerte); }
</style>

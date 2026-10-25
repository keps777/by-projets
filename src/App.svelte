<script lang="ts">
  import { untrack, type Component } from 'svelte';
  import { routeur, resoudre, ROUTES, aller } from './router.svelte.ts';
  import { app, maintenant, surReinitialisation } from './data/store.svelte.ts';
  import { SESSION_INACTIVITE_MS } from './data/constantes.ts';
  import { peut } from './domain/acces.ts';
  import { avancerMonde } from './domain/simulation.ts';
  import { toast } from './ui/toast.svelte.ts';
  import Squelette from './ui/Squelette.svelte';
  import NonTrouve from './apps/_socle/NonTrouve.svelte';
  import ModuleOff from './apps/_socle/ModuleOff.svelte';
  import { moduleActif } from './apps/patron/modules.ts';
  import { overlays, ouvrirOrbe, fermerTout } from './ui/overlays.svelte.ts';
  import { cleDePage, estRaccourciOrbe, notificationsAutorisees, orbeAutorisee } from './core/fenetres.ts';

  /** Fonctions lancées au démarrage par chaque application : `apps/*\/demarrage.ts` (export par défaut). */
  const demarrages = Object.values(import.meta.glob<{ default: () => void }>('./apps/*/demarrage.ts', { eager: true })).map((m) => m.default);

  const trouve = $derived(resoudre(ROUTES, routeur.chemin));
  const route = $derived(trouve?.route);
  let vue: Component<any> | null = $state(null);
  let chargee = $state('');

  // Garde : une route à rôles demande une session du bon rôle (le patron passe partout).
  $effect(() => {
    const r = route; if (!r?.roles) return;
    const s = app.session;
    if (s.personneId && s.role && maintenant() - s.derniereActivite > SESSION_INACTIVITE_MS) { s.personneId = null; s.role = null; }
    if (!s.personneId) aller(s.vuTuto ? '/connexion' : '/splash', { remplacer: true });
    else if (!peut(s.role, r.roles)) aller('/entree', { remplacer: true });
  });
  $effect(() => {
    if (!route) { vue = null; document.title = 'Page introuvable · AfriMove'; return; }
    const cle = route.chemin; chargee = cle; vue = null;
    route.composant().then((m) => { if (chargee === cle) vue = m.default; });
    document.title = `${route.titre} · AfriMove`;
  });
  $effect(() => { untrack(() => { demarrages.forEach((f) => f()); avancerMonde(); surReinitialisation(() => { demarrages.forEach((f) => f()); avancerMonde(); }); }); const t = setInterval(() => avancerMonde(), 30_000); return () => clearInterval(t); });

  // Fenêtres globales (orbe du dock, cloche) : elles s'affichent SUR la page courante, chargées à la première ouverture.
  // L'orbe : pages voyageur seulement ; les notifications : toute personne connectée sur une page mobile (pas au siège).
  const orbeOk = $derived(!!route?.roles?.includes('voyageur') && orbeAutorisee(app.session.role, route?.cadre, routeur.chemin));
  const notifsOk = $derived(!!route?.roles && notificationsAutorisees(app.session.role, route.cadre, routeur.chemin));
  let OrbeF: Component | null = $state(null), NotifsF: Component | null = $state(null);
  $effect(() => { if (overlays.orbe && orbeOk && !OrbeF) import('./apps/voyager/OrbeFeuille.svelte').then((m) => (OrbeF = m.default)); });
  $effect(() => { if (overlays.notifications && notifsOk && !NotifsF) import('./apps/entree/NotificationsFeuille.svelte').then((m) => (NotifsF = m.default)); });
  // Toute navigation (lien, retour arrière, remplacement) ferme les fenêtres ; sans droit sur la page, elles ne restent pas « armées » pour plus tard.
  let pageVue = '';
  $effect(() => { const cle = cleDePage(routeur.chemin, routeur.recherche); if (cle !== pageVue) { pageVue = cle; fermerTout(); } });
  $effect(() => { if (!orbeOk) overlays.orbe = false; if (!notifsOk) overlays.notifications = false; });
  /** Ctrl/⌘ + K : ouvre l'orbe sur la page courante (déjà ouverte ou page `/orbe` : le champ de recherche prend le focus). */
  const raccourci = (e: KeyboardEvent) => { if (orbeOk && estRaccourciOrbe(e)) { e.preventDefault(); if (!overlays.orbe) ouvrirOrbe(); } };
  const toucher = () => { if (app.session.personneId) app.session.derniereActivite = maintenant(); };
</script>

<svelte:window onpointerdown={toucher} onkeydown={(e) => { toucher(); raccourci(e); }} />

<div class={route?.cadre === 'web' ? 'cadre-web' : 'cadre-mobile'}>
  {#if !route}<NonTrouve />
  {:else if route.module && !moduleActif(route.module)}<ModuleOff module={route.module} />
  {:else if vue}{#key routeur.chemin}{@const V = vue}<V params={trouve?.params ?? {}} />{/key}
  {:else}<Squelette web={route.cadre === 'web'} />{/if}
</div>
{#if orbeOk && OrbeF}<OrbeF />{/if}
{#if notifsOk && NotifsF}<NotifsF />{/if}
{#if toast.message}<div class="toast-app {toast.ton}" role="status">{toast.message}</div>{/if}

<style>
  .toast-app { position: fixed; left: 50%; bottom: calc(env(safe-area-inset-bottom) + 110px); transform: translateX(-50%); z-index: 90; padding: 12px 18px; border-radius: 16px; background: rgba(5, 7, 13, 0.92); border: 1px solid #4ade80; color: #f2f4ff; font: 600 14px 'Sora Variable', 'Sora', sans-serif; backdrop-filter: blur(14px); box-shadow: 0 20px 50px -20px rgba(0, 0, 0, 0.8); animation: monte 0.25s; max-width: 90vw; }
  .toast-app.er { border-color: #ff6b6b; } .toast-app.wa { border-color: #ffc24b; } @keyframes monte { from { opacity: 0; transform: translate(-50%, 12px); } }
</style>

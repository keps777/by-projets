<script lang="ts">
  import { onMount } from 'svelte';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import Bouton from '../../ui/Bouton.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { DUREE_VERROU_MS, estVerrouille, secondesAvantDeverrou } from '../../core/auth.ts';
  import { minutesSecondes } from '../../core/inscription.ts';
  import Alerte from './Alerte.svelte';
  import { purgerVerrou } from './actions.ts';

  let maint = $state(maintenant());
  let support = $state(false);
  onMount(() => {
    if (!app.auth.verrou.verrouJusqua) { aller('/connexion', { remplacer: true }); return; }
    const t = setInterval(() => (maint = maintenant()), 1000);
    return () => clearInterval(t);
  });
  const secondes = $derived(secondesAvantDeverrou(app.auth.verrou, maint));
  const total = DUREE_VERROU_MS / 1000;
  const expire = $derived(!estVerrouille(app.auth.verrou, maint));
  const CIRC = 603;
  function reessayer() { purgerVerrou(); aller('/connexion'); }
</script>

<main class="verrou">
  <header><button type="button" class="rond" aria-label="Retour" onclick={() => aller('/connexion', { remplacer: true })}><Icone nom="retour" taille={18} trait={2.2} /></button><span class="repere">Accès suspendu</span></header>
  <div class="tete"><small>3 CODES INCORRECTS</small><h1>Compte verrouillé.</h1><p>Pour protéger votre argent, l'accès est suspendu quelques minutes. Rien n'a été débité.</p></div>

  <div class="cadran" role="timer" aria-label="Temps avant nouvel essai">
    <svg viewBox="0 0 220 220" aria-hidden="true"><circle cx="110" cy="110" r="96" fill="none" stroke="#1e2638" stroke-width="8" /><circle cx="110" cy="110" r="96" fill="none" stroke={expire ? 'var(--bon)' : 'var(--danger)'} stroke-width="8" stroke-linecap="round" stroke-dasharray={CIRC} stroke-dashoffset={Math.round(CIRC * (1 - Math.min(1, secondes / total)))} transform="rotate(-90 110 110)" /></svg>
    <div class="centre"><span class="ic" aria-hidden="true"><Icone nom={expire ? 'ok' : 'verrou'} taille={26} trait={2} /></span><b class="mono">{minutesSecondes(secondes)}</b><small>AVANT NOUVEL ESSAI</small></div>
  </div>

  {#if expire}<Alerte ton="succes">Vous pouvez réessayer maintenant.</Alerte>{/if}
  {#if support}<Alerte ton="info"><b class="mono">+237 2 33 00 00 00</b><br />Support AssureMe · lun-sam 8h-18h</Alerte>{/if}

  <div class="actions">
    <Bouton variante="secondaire" href="/code-oublie">Réinitialiser avec un SMS<Icone nom="fleche" taille={18} trait={2.2} /></Bouton>
    <Bouton variante="discret" onclick={() => (support = !support)}>{support ? 'Masquer le numéro du support' : 'Appeler le support'}</Bouton>
    <Bouton variante={expire ? 'primaire' : 'discret'} onclick={reessayer} desactive={!expire}>{expire ? 'Réessayer maintenant' : 'Réessayer plus tard'}</Bouton>
  </div>
</main>

<style>
  .verrou { display: flex; flex-direction: column; gap: 16px; min-height: 100dvh; padding: calc(env(safe-area-inset-top) + 12px) 20px calc(env(safe-area-inset-bottom) + 16px); }
  header { display: flex; align-items: center; gap: 12px; min-height: 44px; } .rond { width: 44px; height: 44px; border-radius: 22px; background: var(--carte); border: 1px solid var(--ligne); display: grid; place-items: center; } .repere { font: 500 11px var(--mono); letter-spacing: 0.12em; color: var(--danger); text-transform: uppercase; }
  .tete { display: flex; flex-direction: column; gap: 8px; } small { font: 500 10.5px var(--mono); letter-spacing: 0.12em; color: var(--danger); } h1 { font-size: 30px; font-weight: 650; letter-spacing: -0.04em; line-height: 1.05; } .tete p { color: var(--muted); line-height: 1.45; }
  .cadran { position: relative; width: 220px; height: 220px; align-self: center; margin: 6px 0; } svg { width: 100%; height: 100%; display: block; } svg circle:last-child { transition: stroke-dashoffset 1s linear; }
  .centre { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; } .ic { color: var(--danger); } .centre b { font-size: 44px; font-weight: 500; letter-spacing: -0.02em; } .centre small { color: var(--muted); font-size: 9.5px; }
  .actions { margin-top: auto; display: flex; flex-direction: column; gap: 10px; }
</style>

<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import Bouton from '../../ui/Bouton.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Alerte from './Alerte.svelte';
  import { biometrieSimulee, connecterBiometrieSimulee, connecterParBiometrie, purgerVerrou } from './actions.ts';

  type Phase = 'scan' | 'ok' | 'echec' | 'indisponible' | 'verrouille' | 'bloque';
  let phase = $state<Phase>('scan');
  let secousse = $state(0);
  const simulation = $derived(biometrieSimulee());
  onMount(() => { if (!app.auth.hash) aller('/bienvenue', { remplacer: true }); else if (app.auth.connecte) aller('/', { remplacer: true }); });

  function conclure(r: 'ok' | 'indisponible' | 'annule' | 'echec' | 'verrouille' | 'bloque') {
    if (r === 'ok') { phase = 'ok'; setTimeout(() => aller('/', { remplacer: true }), 700); }
    else if (r === 'indisponible' || r === 'verrouille' || r === 'bloque') phase = r;
    else { phase = 'echec'; secousse++; }
  }
  async function reconnaitre() { phase = 'scan'; purgerVerrou(); conclure(await connecterParBiometrie()); }
  function simulerOk() { conclure(connecterBiometrieSimulee() ? 'ok' : 'verrouille'); }
  function simulerEchec() { conclure('echec'); }

  const titre = $derived({ scan: 'Regardez l\'écran.', ok: 'Reconnu. Bon retour.', echec: 'Visage non reconnu.', indisponible: 'Biométrie indisponible.', verrouille: 'Compte verrouillé.', bloque: 'Appareil bloqué.' }[phase]);
  const sous = $derived({
    scan: simulation ? 'Démonstration : simulez la reconnaissance avec les boutons ci-dessous.' : 'Placez votre visage ou votre doigt sur le capteur. La reconnaissance se fait en local.',
    ok: 'Ouverture de votre espace AssureMe.',
    echec: 'Retirez lunettes ou masque et réessayez, ou entrez votre code.',
    indisponible: "Cet appareil ou ce navigateur ne permet pas la biométrie pour AssureMe. Entrez votre code.",
    verrouille: 'Trop de codes incorrects : attendez la fin du verrouillage.',
    bloque: 'Réinitialisez votre code par SMS pour réactiver cet appareil.'
  }[phase]);
  const teinte = $derived(phase === 'ok' ? 'var(--bon)' : phase === 'scan' ? 'var(--primaire-clair)' : 'var(--danger)');
</script>

<main class="fid">
  <header><button type="button" class="rond" aria-label="Retour" onclick={() => aller('/connexion', { remplacer: true })}><Icone nom="retour" taille={18} trait={2.2} /></button><div><b>Face ID</b><small>RECONNEXION RAPIDE</small></div></header>
  <div class="tete"><h1>{titre}</h1><p role="status">{sous}</p></div>

  <div class="scene">
    {#key secousse}
      <div class="cadre" class:secoue={phase === 'echec'} style:--cc={teinte}>
        <span class="visage" style:color={phase === 'ok' ? 'var(--bon)' : phase === 'echec' || phase === 'indisponible' ? 'var(--danger)' : '#6e778c'}>
          {#if phase === 'ok'}<Icone nom="ok" taille={80} trait={1.8} />{:else}<Icone nom="empreinte" taille={80} trait={1.4} />{/if}
        </span>
        {#if phase === 'scan'}<i class="balai"></i>{/if}
      </div>
    {/key}
  </div>

  {#if phase === 'indisponible' || phase === 'verrouille' || phase === 'bloque'}<Alerte ton="avert">{sous}</Alerte>{/if}

  <div class="actions">
    {#if phase === 'scan' || phase === 'echec'}
      {#if simulation}
        <Bouton onclick={simulerOk}>Simuler la reconnaissance<Icone nom="fleche" taille={18} trait={2.2} /></Bouton>
        <Bouton variante="secondaire" onclick={simulerEchec}>Simuler un échec</Bouton>
        {#if phase === 'echec'}<Bouton variante="discret" onclick={() => (phase = 'scan')}>Réessayer</Bouton>{/if}
      {:else}
        <Bouton onclick={reconnaitre}>{phase === 'echec' ? 'Réessayer' : 'Lancer la reconnaissance'}<Icone nom="empreinte" taille={18} /></Bouton>
      {/if}
    {/if}
    <Bouton variante="discret" href="/connexion">Utiliser mon code</Bouton>
  </div>
</main>

<style>
  .fid { display: flex; flex-direction: column; gap: 16px; min-height: 100dvh; padding: calc(env(safe-area-inset-top) + 12px) 20px calc(env(safe-area-inset-bottom) + 16px); }
  header { display: flex; align-items: center; gap: 12px; min-height: 44px; } .rond { width: 44px; height: 44px; border-radius: 22px; background: var(--carte); border: 1px solid var(--ligne); display: grid; place-items: center; } header div { display: flex; flex-direction: column; } header b { font-size: 16px; } small { font: 500 10px var(--mono); letter-spacing: 0.12em; color: var(--muted); }
  .tete { text-align: center; display: flex; flex-direction: column; gap: 8px; } h1 { font-size: 26px; font-weight: 650; letter-spacing: -0.035em; } .tete p { color: var(--muted); font-size: 14px; line-height: 1.45; }
  .scene { flex: 1; display: grid; place-items: center; }
  .cadre { position: relative; width: 190px; height: 230px; border-radius: 70px; border: 2px solid var(--cc); display: grid; place-items: center; overflow: hidden; box-shadow: 0 0 50px color-mix(in srgb, var(--cc) 35%, transparent); transition: all 0.3s; }
  .balai { position: absolute; left: 6%; right: 6%; height: 2px; background: var(--cc); box-shadow: 0 0 14px var(--cc); animation: balai 1.6s ease-in-out infinite; } .secoue { animation: secoue 0.45s; }
  .actions { display: flex; flex-direction: column; gap: 10px; }
  @keyframes balai { 0%, 100% { top: 6%; } 50% { top: 92%; } } @keyframes secoue { 0%, 100% { transform: translateX(0); } 15% { transform: translateX(-10px); } 30% { transform: translateX(9px); } 45% { transform: translateX(-7px); } 60% { transform: translateX(5px); } 75% { transform: translateX(-3px); } }
</style>

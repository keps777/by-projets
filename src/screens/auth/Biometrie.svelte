<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../../data/store.svelte.ts';
  import { aller, param } from '../../router.svelte.ts';
  import Bouton from '../../ui/Bouton.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Alerte from './Alerte.svelte';
  import Etape from './Etape.svelte';
  import { activerBiometrie, type ResultatBiometrie } from './actions.ts';
  import { biometrieDisponible } from './biometrie.ts';

  const depuisProfil = param('depuis') === 'profil';
  const suite = depuisProfil ? '/profil/appareils' : '/notifications-permission';
  onMount(() => { if (!app.compte) aller('/connexion', { remplacer: true }); void biometrieDisponible().then((d) => (disponible = d)); });

  let methode = $state<'visage' | 'empreinte'>('visage');
  let phase = $state<'attente' | 'analyse' | 'fait' | 'echec'>(app.auth.biometrie && app.auth.idBiometrie ? 'fait' : 'attente');
  let disponible = $state<boolean | null>(null);
  let raison = $state<ResultatBiometrie | null>(null);
  const nom = $derived(methode === 'visage' ? 'Face ID' : "l'empreinte");

  async function activer() {
    if (phase === 'analyse') return;
    phase = 'analyse'; raison = null;
    const r = await activerBiometrie();
    raison = r; phase = r === 'ok' ? 'fait' : 'echec';
  }
  const message = $derived(
    phase === 'fait' ? (methode === 'visage' ? 'Face ID activé. Votre visage reste sur ce téléphone.' : 'Empreinte enregistrée. Elle reste sur ce téléphone.')
    : phase === 'analyse' ? 'Gardez le visage ou le doigt immobile…'
    : 'Rien ne quitte votre téléphone. AssureMe ne reçoit jamais votre empreinte.'
  );
</script>

<Etape retourVers={depuisProfil ? '/profil/appareils' : '/inscription/confirmer-code'} repere="SÉCURITÉ 3 / 4 · BIOMÉTRIE" segments={depuisProfil ? 0 : 4} segmentActif={3} titre="Entrez en un regard." sous="Utilisez votre visage ou votre empreinte pour ouvrir l'app. Votre code reste là en secours.">
  <div class="choix" role="radiogroup" aria-label="Méthode">
    <button type="button" role="radio" aria-checked={methode === 'visage'} class:on={methode === 'visage'} disabled={phase === 'analyse'} onclick={() => { methode = 'visage'; if (phase !== 'fait') phase = 'attente'; }}>
      <Icone nom="profil" taille={26} /><b>Face ID</b><small>Reconnaissance du visage</small>
    </button>
    <button type="button" role="radio" aria-checked={methode === 'empreinte'} class:on={methode === 'empreinte'} disabled={phase === 'analyse'} onclick={() => { methode = 'empreinte'; if (phase !== 'fait') phase = 'attente'; }}>
      <Icone nom="empreinte" taille={26} /><b>Empreinte</b><small>Capteur du téléphone</small>
    </button>
  </div>

  <div class="scene">
    <div class="anneau {phase}" aria-hidden="true">
      {#if phase === 'fait'}<Icone nom="ok" taille={64} trait={2} />{:else if methode === 'visage'}<Icone nom="profil" taille={64} trait={1.4} />{:else}<Icone nom="empreinte" taille={64} trait={1.4} />{/if}
      {#if phase === 'analyse'}<i class="balai"></i>{/if}
    </div>
    <p class="etat" role="status">{message}</p>
  </div>

  {#if phase === 'echec'}
    <Alerte ton="avert">
      {#if raison === 'indisponible'}La biométrie n'est pas disponible sur cet appareil ou ce navigateur. Votre code suffit : vous pourrez activer la biométrie plus tard dans Sécurité.
      {:else if raison === 'annule'}Reconnaissance annulée. Vous pouvez réessayer, ou continuer avec votre code.
      {:else}La reconnaissance a échoué. Réessayez, ou continuez avec votre code.{/if}
    </Alerte>
  {:else if disponible === false && phase === 'attente'}
    <Alerte ton="info">Cet appareil n'annonce pas de capteur biométrique : vous pouvez tout de même essayer, sinon votre code reste le moyen d'entrer.</Alerte>
  {/if}

  {#snippet pied()}
    {#if phase === 'fait'}
      <Bouton onclick={() => aller(suite)}>Continuer<Icone nom="fleche" taille={18} trait={2.2} /></Bouton>
    {:else}
      <Bouton desactive={phase === 'analyse'} onclick={activer}>{phase === 'echec' ? 'Réessayer' : `Activer ${nom}`}</Bouton>
      <Bouton variante="discret" onclick={() => aller(suite)}>Plus tard</Bouton>
    {/if}
  {/snippet}
</Etape>

<style>
  .choix { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .choix button { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; min-height: 108px; padding: 14px; border-radius: 18px; background: var(--carte); border: 1px solid var(--ligne); color: var(--muted); text-align: left; transition: all 0.2s; }
  .choix button.on { background: rgba(48, 80, 255, 0.14); border-color: var(--primaire); color: var(--primaire-clair); } .choix b { color: var(--texte); margin-top: 8px; font-size: 15px; } .choix small { color: var(--muted); font-size: 12px; }
  .scene { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px; padding: 10px 0; }
  .anneau { position: relative; width: 150px; height: 150px; border-radius: 75px; display: grid; place-items: center; border: 2px solid rgba(255, 255, 255, 0.12); color: #c5cbda; box-shadow: 0 30px 60px -30px rgba(48, 80, 255, 0.6); overflow: hidden; transition: all 0.3s; }
  .anneau.analyse { border-color: rgba(124, 147, 255, 0.7); color: #7c93ff; box-shadow: 0 0 50px rgba(48, 80, 255, 0.5); } .anneau.fait { border-color: rgba(61, 213, 152, 0.6); color: var(--bon); box-shadow: 0 0 50px rgba(61, 213, 152, 0.35); }
  .anneau.echec { border-color: rgba(255, 122, 47, 0.5); color: var(--alerte); }
  .balai { position: absolute; left: 10%; right: 10%; height: 2px; background: #7c93ff; box-shadow: 0 0 14px #7c93ff; animation: balai 1.6s ease-in-out infinite; }
  .etat { text-align: center; color: var(--muted); font-size: 13.5px; line-height: 1.45; max-width: 300px; }
  @keyframes balai { 0%, 100% { top: 10%; } 50% { top: 88%; } }
</style>

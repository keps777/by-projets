<script lang="ts">
  import { app } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import Bouton from '../../ui/Bouton.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { fcfa } from '../../core/money.ts';
  import { deconnecter } from './actions.ts';
  import { idAppareil } from './appareil.ts';

  let phase = $state<'demande' | 'fait'>('demande');
  let portee = $state<'ici' | 'tous'>('ici');
  // Le prénom et les appareils sont lus avant la déconnexion : l'écran de fin ne dépend pas de la session.
  const prenom = app.compte?.prenom ?? '';
  const solde = app.compte ? fcfa(app.solde) : '';
  const autres = $derived(app.auth.appareils.filter((a) => a.id !== idAppareil()).map((a) => a.nom));
  const nomsTous = $derived(['cet appareil', ...autres].join(', ').replace(/, ([^,]*)$/, ' et $1'));
  const textes = {
    ici: 'Cet appareil est déconnecté. Revenez quand vous voulez avec votre code ou Face ID.',
    tous: 'Tous vos appareils sont déconnectés. Il faudra votre code ou un SMS pour revenir.'
  };
  function confirmer() { deconnecter(portee); phase = 'fait'; }
</script>

<main class="decon">
  {#if phase === 'demande'}
    {#if app.compte}<div class="solde"><small>SOLDE</small><b class="mono">{solde}</b></div>{/if}
    <div class="corps">
      <h1>Se déconnecter ?</h1>
      <p class="muted">Vos prélèvements et vos coffres continuent normalement.</p>
      <div class="choix" role="radiogroup" aria-label="Portée de la déconnexion">
        <button type="button" role="radio" aria-checked={portee === 'ici'} class:on={portee === 'ici'} onclick={() => (portee = 'ici')}><span class="radio"><i></i></span><span><b>Cet appareil seulement</b><small>Les autres restent connectés</small></span></button>
        <button type="button" role="radio" aria-checked={portee === 'tous'} class:on={portee === 'tous'} onclick={() => (portee = 'tous')}><span class="radio"><i></i></span><span><b>Tous mes appareils</b><small>{autres.length ? nomsTous.charAt(0).toUpperCase() + nomsTous.slice(1) : 'Cet appareil uniquement pour le moment'}</small></span></button>
      </div>
    </div>
    <div class="actions">
      <Bouton variante="danger" onclick={confirmer}>{portee === 'tous' ? 'Déconnecter tous mes appareils' : 'Se déconnecter'}</Bouton>
      <Bouton variante="discret" href={app.auth.connecte ? '/' : '/connexion'}>Annuler</Bouton>
    </div>
  {:else}
    <div class="fin">
      <span class="ok" aria-hidden="true"><Icone nom="ok" taille={34} trait={2.4} /></span>
      <h1>À bientôt{prenom ? `, ${prenom}` : ''}.</h1>
      <p class="muted" role="status">{textes[portee]}</p>
    </div>
    <div class="actions"><Bouton onclick={() => aller('/splash', { remplacer: true })}>Rouvrir l'app<Icone nom="fleche" taille={18} trait={2.2} /></Bouton></div>
  {/if}
</main>

<style>
  .decon { display: flex; flex-direction: column; gap: 16px; min-height: 100dvh; padding: calc(env(safe-area-inset-top) + 18px) 20px calc(env(safe-area-inset-bottom) + 16px); }
  .solde { display: flex; flex-direction: column; gap: 2px; } small { font: 500 10.5px var(--mono); letter-spacing: 0.12em; color: var(--muted); } .solde b { font-size: 34px; font-weight: 500; letter-spacing: -0.03em; }
  .corps { flex: 1; display: flex; flex-direction: column; gap: 12px; justify-content: center; } h1 { font-size: 28px; font-weight: 650; letter-spacing: -0.04em; }
  .choix { display: flex; flex-direction: column; gap: 10px; margin-top: 8px; }
  .choix button { display: flex; align-items: center; gap: 14px; min-height: 68px; padding: 14px; border-radius: 18px; background: var(--carte); border: 1px solid var(--ligne-forte); text-align: left; transition: all 0.2s; } .choix button.on { background: rgba(48, 80, 255, 0.14); border-color: var(--primaire); }
  .choix span:last-child { display: flex; flex-direction: column; gap: 2px; } b { font-size: 15px; } .choix small { font: 400 12.5px var(--sans); letter-spacing: 0; color: var(--muted); }
  .radio { width: 20px; height: 20px; border-radius: 10px; border: 2px solid #3a4566; display: grid; place-items: center; flex: none; } .radio i { width: 10px; height: 10px; border-radius: 5px; } .on .radio { border-color: var(--primaire); } .on .radio i { background: var(--primaire); }
  .actions { display: flex; flex-direction: column; gap: 10px; }
  .fin { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; text-align: center; } .fin p { max-width: 300px; line-height: 1.45; }
  .ok { width: 84px; height: 84px; border-radius: 42px; background: rgba(61, 213, 152, 0.14); color: var(--bon); display: grid; place-items: center; box-shadow: 0 0 50px rgba(61, 213, 152, 0.3); }
</style>

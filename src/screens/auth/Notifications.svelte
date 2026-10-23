<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../../data/store.svelte.ts';
  import { aller, param } from '../../router.svelte.ts';
  import Bouton from '../../ui/Bouton.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Alerte from './Alerte.svelte';
  import Etape from './Etape.svelte';
  import Interrupteur from './Interrupteur.svelte';
  import { demanderPermissionNotif, lirePermissionNotif } from './actions.ts';
  import { etatAuth } from './etat.ts';

  const e = etatAuth();
  const depuisProfil = param('depuis') === 'profil';
  const suite = depuisProfil ? '/profil' : '/inscription/pret';
  onMount(() => { if (!app.compte) aller('/connexion', { remplacer: true }); });
  let occupe = $state(false);
  let retour = $state<'accordee' | 'refusee' | 'indisponible' | 'inconnue' | null>(null);

  const apercus = $derived([
    { on: e.notif.paiements, t: 'Paiement confirmé · Clinique Les Palmiers', s: '7 100 FCFA, reçu signé', quand: '14:31' },
    { on: e.notif.salaire, t: 'Jour de paie · 451 000 reçus', s: '69 000 prélevés par AssureMe', quand: '09:12' },
    { on: e.notif.score, t: 'AssureScore 746, +4 points', s: 'Plus que 54 pour passer Elite', quand: 'HIER' }
  ].filter((x) => x.on));
  async function autoriser() {
    occupe = true;
    const p = await demanderPermissionNotif();
    occupe = false; retour = p;
    if (p === 'accordee') aller(suite);
  }
</script>

<Etape retourVers={depuisProfil ? '/profil' : '/biometrie'} repere="SÉCURITÉ 4 / 4 · NOTIFICATIONS" segments={depuisProfil ? 0 : 4} segmentActif={4} titre="Restez au courant, sans bruit." sous="Trois sortes d'alertes seulement. Vous pouvez tout changer plus tard dans votre profil.">
  <div class="regl">
    <Interrupteur bind:actif={e.notif.paiements} titre="Paiements et factures" aide="Chaque débit, chaque reçu signé" />
    <Interrupteur bind:actif={e.notif.salaire} titre="Prélèvement sur salaire" aide="Le jour de paie, ce qui est prélevé et ce qui reste" />
    <Interrupteur bind:actif={e.notif.score} titre="AssureScore" aide="Quand vous gagnez des points ou changez de niveau" />
  </div>

  <p class="lib">APERÇU SUR VOTRE ÉCRAN VERROUILLÉ <span>· exemples</span></p>
  <div class="apercus" aria-live="polite">
    {#each apercus as a (a.t)}
      <div class="notif"><span class="ic"><Icone nom="cloche" taille={18} /></span><div><b>{a.t}</b><small>{a.s}</small></div><span class="q mono">{a.quand}</span></div>
    {:else}
      <Alerte ton="avert">Aucune notification activée. Vous risquez de manquer un prélèvement.</Alerte>
    {/each}
  </div>

  {#if retour === 'refusee'}<Alerte ton="avert">Les notifications sont bloquées dans ce navigateur. Activez-les dans les réglages du navigateur, ou gardez les alertes dans l'app (cloche d'accueil).</Alerte>
  {:else if retour === 'indisponible'}<Alerte ton="info">Ce navigateur ne gère pas les notifications. Vos alertes restent visibles dans l'app. Sur iPhone, ajoutez AssureMe à l'écran d'accueil pour les recevoir.</Alerte>
  {:else if retour === 'inconnue'}<Alerte ton="info">Autorisation non donnée pour l'instant. Vous pourrez la donner depuis votre profil.</Alerte>
  {:else if lirePermissionNotif() === 'accordee'}<Alerte ton="succes">Les notifications sont déjà autorisées sur cet appareil.</Alerte>{/if}

  {#snippet pied()}
    <Bouton desactive={occupe} onclick={autoriser}>Autoriser les notifications<Icone nom="fleche" taille={18} trait={2.2} /></Bouton>
    <Bouton variante="discret" onclick={() => aller(suite)}>{retour && retour !== 'accordee' ? 'Continuer' : 'Plus tard'}</Bouton>
  {/snippet}
</Etape>

<style>
  .regl { padding: 4px 16px; border-radius: 18px; background: var(--carte); border: 1px solid var(--ligne); }
  .lib { font: 500 10.5px var(--mono); letter-spacing: 0.1em; color: var(--muted); } .lib span { color: var(--faint); }
  .apercus { display: flex; flex-direction: column; gap: 8px; }
  .notif { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 16px; background: rgba(30, 38, 56, 0.7); border: 1px solid var(--ligne); }
  .ic { width: 36px; height: 36px; border-radius: 10px; background: var(--primaire); color: #fff; display: grid; place-items: center; flex: none; } .notif div { flex: 1; min-width: 0; display: flex; flex-direction: column; } b { font-size: 13.5px; font-weight: 600; } small { color: var(--muted); font-size: 12px; } .q { font-size: 11px; color: var(--faint); }
</style>

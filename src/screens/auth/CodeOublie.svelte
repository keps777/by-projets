<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import Bouton from '../../ui/Bouton.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { formaterTel, LONGUEUR_CODE, masquerTel } from '../../core/auth.ts';
  import Alerte from './Alerte.svelte';
  import Clavier from './Clavier.svelte';
  import Etape from './Etape.svelte';
  import SaisieCode from './SaisieCode.svelte';
  import SaisieOtp from './SaisieOtp.svelte';
  import { envoyerOtp, reinitialiserCode } from './actions.ts';
  import { codeTropSimple } from '../../core/auth.ts';

  let etape = $state<1 | 2 | 3 | 4>(1);
  let verifie = $state(false);
  let code = $state('');
  let message = $state<'' | 'simple' | 'identique'>('');
  let occupe = $state(false);
  onMount(() => { if (!app.compte || !app.auth.hash) aller('/bienvenue', { remplacer: true }); });
  const tel = $derived(app.compte?.telephone ?? '');
  const simple = $derived(code.length === LONGUEUR_CODE && codeTropSimple(code));
  const LIBELLES = { 1: 'ÉTAPE 1 / 3 · VÉRIFICATION', 2: 'ÉTAPE 2 / 3 · CODE SMS', 3: 'ÉTAPE 3 / 3 · NOUVEAU CODE', 4: 'TERMINÉ' } as const;

  async function envoyer() { occupe = true; await envoyerOtp(tel); occupe = false; verifie = false; etape = 2; }
  function chiffre(d: string) { if (code.length < LONGUEUR_CODE) { code += d; message = ''; } }
  async function enregistrer() {
    if (code.length !== LONGUEUR_CODE || simple) return;
    occupe = true;
    const r = await reinitialiserCode(code);
    occupe = false;
    if (r === 'ok') { code = ''; etape = 4; } else { message = r; code = ''; }
  }
  function retour() { if (etape === 2 || etape === 3) etape = (etape - 1) as 1 | 2; else aller('/connexion', { remplacer: true }); }
</script>

<Etape onretour={retour} repere={LIBELLES[etape]} segments={3} segmentActif={etape === 4 ? 3 : etape} tonSegments={etape === 4 ? 'var(--bon)' : 'var(--primaire)'}
  titre={etape === 1 ? 'Code oublié ?' : etape === 2 ? 'Tapez le code reçu.' : etape === 3 ? 'Choisissez un nouveau code.' : 'Code modifié.'}
  sous={etape === 1 ? 'Pas de souci. On envoie un code SMS pour vérifier que c\'est bien vous, puis vous choisissez un nouveau code.'
    : etape === 2 ? `Envoyé au +237 ${masquerTel(tel)}. Valable 5 minutes.`
    : etape === 3 ? '6 chiffres, différents de l\'ancien. Évitez les suites.'
    : 'Par sécurité, vos autres appareils ont été déconnectés. Reconnectez-vous avec votre nouveau code.'}>

  {#if etape === 1}
    <div class="num"><span class="ic"><Icone nom="telephone" taille={22} /></span><div><b class="mono">+237 {formaterTel(tel)}</b><small>Numéro lié à votre compte</small></div></div>
    <a class="autre" href="/inscription/telephone" onclick={(e) => { e.preventDefault(); aller('/inscription/telephone'); }}>Ce n'est plus votre numéro ? <span>Changer de compte</span></a>
  {:else if etape === 2}
    <SaisieOtp numero={tel} bind:verifie compact />
  {:else if etape === 3}
    <SaisieCode valeur={code} ton={simple ? 'alerte' : 'neutre'} etiquette="Nouveau code" />
    <div class="etat" aria-live="polite">
      {#if simple}<Alerte ton="avert">Code trop simple. Évitez les suites et les chiffres répétés.</Alerte>
      {:else if message === 'simple'}<Alerte ton="avert">Code trop simple. Choisissez-en un autre.</Alerte>
      {:else if message === 'identique'}<Alerte ton="avert">Choisissez un code différent de l'ancien.</Alerte>{/if}
    </div>
    <div class="espace"></div>
    <Clavier onchiffre={chiffre} oneffacer={() => (code = code.slice(0, -1))} desactive={occupe} />
  {:else}
    <div class="fin"><span class="ok" aria-hidden="true"><Icone nom="ok" taille={34} trait={2.4} /></span></div>
  {/if}

  {#snippet pied()}
    {#if etape === 1}<Bouton desactive={occupe} onclick={envoyer}>Envoyer le code SMS<Icone nom="fleche" taille={18} trait={2.2} /></Bouton>
    {:else if etape === 2}<Bouton desactive={!verifie} onclick={() => { code = ''; etape = 3; }}>Vérifier<Icone nom="fleche" taille={18} trait={2.2} /></Bouton>
    {:else if etape === 3}<Bouton desactive={code.length !== LONGUEUR_CODE || simple || occupe} onclick={enregistrer}>Enregistrer le code<Icone nom="fleche" taille={18} trait={2.2} /></Bouton>
    {:else}<Bouton onclick={() => aller('/connexion', { remplacer: true })}>Se connecter<Icone nom="fleche" taille={18} trait={2.2} /></Bouton>{/if}
    {#if etape !== 4}<Bouton variante="discret" onclick={retour}>{etape === 1 ? 'Retour à la connexion' : 'Étape précédente'}</Bouton>{/if}
  {/snippet}
</Etape>

<style>
  .num { display: flex; align-items: center; gap: 14px; padding: 16px; border-radius: 18px; background: var(--carte); border: 1px solid var(--ligne); } .ic { width: 44px; height: 44px; border-radius: 14px; background: var(--primaire-fond); color: var(--primaire-clair); display: grid; place-items: center; flex: none; }
  .num div { display: flex; flex-direction: column; gap: 2px; } .num b { font-size: 17px; font-weight: 500; } small { color: var(--muted); font-size: 12.5px; }
  .autre { color: var(--muted); font-size: 13.5px; min-height: 44px; display: inline-flex; align-items: center; } .autre span { color: var(--primaire-clair); font-weight: 600; margin-left: 4px; }
  .etat { min-height: 52px; display: flex; align-items: center; } .etat > :global(*) { width: 100%; } .espace { flex: 1; }
  .fin { flex: 1; display: grid; place-items: center; } .ok { width: 84px; height: 84px; border-radius: 42px; background: rgba(61, 213, 152, 0.14); color: var(--bon); display: grid; place-items: center; box-shadow: 0 0 50px rgba(61, 213, 152, 0.3); }
</style>

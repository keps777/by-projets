<script lang="ts">
  import { onMount } from 'svelte';
  import { aller } from '../../router.svelte.ts';
  import { app } from '../../data/store.svelte.ts';
  import Bouton from '../../ui/Bouton.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { LONGUEUR_CODE } from '../../core/auth.ts';
  import Alerte from './Alerte.svelte';
  import Clavier from './Clavier.svelte';
  import Etape from './Etape.svelte';
  import SaisieCode from './SaisieCode.svelte';
  import { creerCompte } from './actions.ts';
  import { temp } from './memoire.svelte.ts';

  // Le premier code n'existe qu'en mémoire : après un rechargement, on le redemande.
  onMount(() => { if (!temp.premierCode && !app.compte) aller('/inscription/creer-code', { remplacer: true }); });
  let code = $state('');
  let statut = $state<'attente' | 'faux' | 'creation' | 'ok'>(app.compte && !temp.premierCode ? 'ok' : 'attente');
  let secousse = $state(0);

  async function chiffre(d: string) {
    if (statut === 'ok' || statut === 'creation') return;
    if (statut === 'faux') { code = ''; statut = 'attente'; }
    if (code.length >= LONGUEUR_CODE) return;
    code += d;
    if (code.length < LONGUEUR_CODE) return;
    if (code !== temp.premierCode) { statut = 'faux'; secousse++; return; }
    statut = 'creation';
    await creerCompte(code);
    statut = 'ok';
  }
  function efface() { if (statut === 'ok' || statut === 'creation') return; code = statut === 'faux' ? '' : code.slice(0, -1); statut = 'attente'; }
  function recommencer() { temp.premierCode = ''; aller('/inscription/creer-code', { remplacer: true }); }
</script>

<Etape retourVers="/inscription/creer-code" repere="SÉCURITÉ 2 / 4 · CONFIRMATION" segments={4} segmentActif={2} titre="Retapez le même code." sous="Une dernière vérification pour être sûr de ne pas vous enfermer dehors.">
  <SaisieCode valeur={statut === 'ok' && !code ? '••••••' : code} visible={false} ton={statut === 'faux' ? 'mauvais' : statut === 'ok' ? 'ok' : 'neutre'} {secousse} etiquette="Confirmation du code" />
  <div class="etat" aria-live="polite">
    {#if statut === 'faux'}<Alerte ton="erreur">Les deux codes ne correspondent pas. Essayez encore.</Alerte>
    {:else if statut === 'ok'}<Alerte ton="succes">Codes identiques. Votre code est enregistré.</Alerte>
    {:else if statut === 'creation'}<Alerte ton="info">Enregistrement sécurisé du code…</Alerte>
    {:else}<Alerte ton="info">Saisissez à nouveau votre code</Alerte>{/if}
    {#if statut === 'faux'}<Bouton variante="discret" plein={false} onclick={recommencer}>Recommencer</Bouton>{/if}
  </div>
  <div class="espace"></div>
  <Clavier onchiffre={chiffre} oneffacer={efface} desactive={statut === 'ok' || statut === 'creation'} />
  {#snippet pied()}
    <Bouton desactive={statut !== 'ok'} onclick={() => aller('/biometrie')}>Continuer<Icone nom="fleche" taille={18} trait={2.2} /></Bouton>
  {/snippet}
</Etape>

<style>
  .etat { min-height: 56px; display: flex; flex-direction: column; align-items: center; gap: 4px; justify-content: center; } .etat > :global(.a) { width: 100%; }
  .espace { flex: 1; }
</style>

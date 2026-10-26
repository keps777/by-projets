<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { app } from '../../data/store.svelte.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import FaceMarche from './FaceMarche.svelte';
  import FaceVoyage from './FaceVoyage.svelte';
  import { tempsReel } from './temps.svelte.ts';

  /** Accueil double face, un seul écran : Voyager (jour) ⇄ Mes actifs (nuit). La face est mémorisée dans `app.session.face`.
   *  Sans compte (`/explorer`) : version réduite, face Voyager seulement, sans cloche ni avatar, avec l'invitation à créer un compte. */
  const compte = $derived(compteCourant());
  const temps = tempsReel(1000);
  const face = $derived(compte && app.session.face === 'marche' ? 'marche' : 'voyage');
  const choisir = (f: 'voyage' | 'marche') => { app.session.face = f; };
</script>

<Ecran titre={compte ? 'Accueil' : 'Explorer'} onglet={compte ? 'accueil' : undefined} sansRetour large face={face === 'marche' ? 'nuit' : 'jour'}>
  {#if compte}
    <div class="bascule" role="group" aria-label="Face de l’application">
      <button type="button" aria-pressed={face === 'voyage'} onclick={() => choisir('voyage')}><Icone nom="soleil" taille={16} trait={2} />Voyager</button>
      <button type="button" aria-pressed={face === 'marche'} onclick={() => choisir('marche')}><Icone nom="lune" taille={16} trait={2} />Mes actifs</button>
    </div>
    <p class="sr" aria-live="polite">{face === 'marche' ? 'Face Mes actifs' : 'Face Voyager'}</p>
    {#key face}
      {#if face === 'marche'}<FaceMarche {compte} now={temps.maintenant} />{:else}<FaceVoyage {compte} now={temps.maintenant} />{/if}
    {/key}
  {:else}
    <FaceVoyage now={temps.maintenant} />
  {/if}
</Ecran>

<style>
  @media (min-width: 900px) { .bascule { display: none !important; } } /* la bascule est dans l'en-tête PC */
  .bascule { display: flex; gap: 2px; padding: 3px; border-radius: 999px; background: var(--surface2); border: 1px solid var(--surface2); transition: background-color 450ms ease; margin-top: -4px; }
  :global([data-face='nuit']) .bascule { border-color: var(--line); }
  .bascule button { flex: 1; min-height: 44px; padding: 0 14px; border: 0; border-radius: 999px; display: flex; align-items: center; justify-content: center; gap: 6px; background: transparent; color: var(--ink2); font: 700 13px/1 'Barlow', sans-serif; letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer; transition: background-color 300ms ease, color 300ms ease; }
  .bascule button[aria-pressed='true'] { background: #0B1B2E; color: #fff; }
  :global([data-face='nuit']) .bascule button[aria-pressed='true'] { background: var(--signal); color: #0D0E11; }
  .bascule button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>

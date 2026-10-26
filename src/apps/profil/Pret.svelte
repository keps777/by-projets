<script lang="ts">
  import { onMount } from 'svelte';
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { aller } from '../../router.svelte.ts';
  import { app } from '../../data/store.svelte.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { recapitulatif, terminerInscription } from './actions.ts';
  import { naviguer } from './lien.ts';
  import { largeur } from './largeur.svelte.ts';

  /** Fin de l'inscription : récapitulatif, deux espaces à découvrir, carte et identité restent facultatives. */
  const compte = $derived(compteCourant());
  const lignes = $derived(compte ? recapitulatif(compte) : []);
  onMount(() => terminerInscription());
  function decouvrir(face: 'voyage' | 'marche' = 'voyage') { app.session.face = face; terminerInscription(); aller('/'); }
  const icones: Record<string, string> = { compte: 'moi', notifications: 'cloche', partage: 'verifie', carte: 'carte', identite: 'piece' };
  const volets = ['P', 'R', 'Ê', 'T'];
  /** Sur PC : seulement ce qui reste facultatif (carte et identité). */
  const facultatifs = $derived(lignes.filter((l) => (l.cle === 'carte' || l.cle === 'identite') && !l.fait));
</script>

{#snippet piedMobile()}<button type="button" class="btn" onclick={() => decouvrir('voyage')}>Découvrir<Icone nom="suivant" taille={20} /></button>{/snippet}
<Ecran titre="" face="jour" sansRetour large pied={largeur.pc ? undefined : piedMobile}>
  <div class="tete">
  <div class="marque"><span class="logo">NEXG<span class="bleu">·TT</span></span>
    <span class="volets" role="img" aria-label="Prêt">{#each volets as ch, i (i)}<span aria-hidden="true" style="animation-delay:{80 + i * 110}ms">{ch}</span>{/each}</span></div>

  <section class="col g8"><h1 class="t-titre">Votre espace est prêt{compte?.prenom ? `, ${compte.prenom}` : ''}</h1>
    <p class="intro">Deux espaces, un seul compte. Par où commencer ? Vous passerez de l'un à l'autre à tout moment.</p></section>
  </div>
  <div class="cartes">

  <a class="voyager" href="/" onclick={(e) => { e.preventDefault(); decouvrir('voyage'); }}>
    <span class="etq"><Icone nom="soleil" taille={14} trait={2} />Voyager</span>
    <span class="grand">Trouver un vol, préparer un voyage</span>
    <span class="trajet"><span class="yul" aria-hidden="true">{compte?.aeroport ?? 'YUL'}</span><span class="pointille" aria-hidden="true"></span><Icone nom="avion" taille={20} /><span class="pointille" aria-hidden="true"></span><span class="go"><Icone nom="suivant" taille={20} trait={2} /></span></span>
  </a>
  <a class="actifs" href="/" data-face="nuit" onclick={(e) => { e.preventDefault(); decouvrir('marche'); }}>
    <span class="etq jaune"><Icone nom="lune" taille={14} trait={2} />Mes actifs</span>
    <span class="grand maj">Suivre et revendre mes billets</span>
    <span class="trajet"><span class="puces" aria-hidden="true"><span class="pu a">Détenu</span><span class="pu b">En vente</span><span class="pu c">Nommé</span></span><span class="go jaune-bg"><Icone nom="suivant" taille={20} trait={2} /></span></span>
  </a>

  </div>

  {#if largeur.pc}
    {#if facultatifs.length}
      <section aria-labelledby="reste-title" class="col g8 reste">
        <h2 id="reste-title" class="sur">Reste facultatif</h2>
        <ul class="liste liste-plain">
          {#each facultatifs as l (l.cle)}
            {@const vers = l.cle === 'carte' ? '/carte?retour=/pret' : '/identite?retour=/pret'}
            <li><a class="ligne lien-ligne" href={vers} onclick={(e) => naviguer(e, vers)}><Icone nom={icones[l.cle]} taille={22} /><span class="grow"><span class="k">{l.titre}&nbsp;:</span> <span class="v">{l.valeur}</span></span><span class="act-l">{l.cle === 'carte' ? 'Ajouter' : 'Vérifier'}</span><Icone nom="suivant" taille={20} /></a></li>
          {/each}
        </ul>
        <p class="aide">Rien n'est bloqué : chaque élément vous sera redemandé seulement au moment où il sert.</p>
      </section>
    {/if}
  {:else}
  <section aria-labelledby="recap-title" class="col g8">
    <h2 id="recap-title" class="sur">Votre compte</h2>
    <ul class="liste liste-plain">
      {#each lignes as l (l.cle)}
        <li class="ligne"><Icone nom={icones[l.cle]} taille={20} /><span class="grow"><span class="k">{l.titre}&nbsp;:</span> <span class="v" class:att={!l.fait}>{l.valeur}</span></span>
          {#if l.cle === 'carte' && !l.fait}<a class="lien" href="/carte?retour=/pret" onclick={(e) => naviguer(e, '/carte?retour=/pret')}>Ajouter<Icone nom="suivant" taille={18} /></a>
          {:else if l.cle === 'identite' && !l.fait}<a class="lien" href="/identite?retour=/pret" onclick={(e) => naviguer(e, '/identite?retour=/pret')}>Vérifier<Icone nom="suivant" taille={18} /></a>
          {:else}<span class="coche" aria-label="fait"><Icone nom="ok" taille={18} trait={2.25} /></span>{/if}</li>
      {/each}
    </ul>
    <p class="aide">Rien n'est bloqué : chaque élément vous sera redemandé seulement au moment où il sert.</p>
  </section>
  {/if}
</Ecran>

<style>
  .marque { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .logo { font: 700 24px/1 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.06em; } .bleu { color: var(--accent); }
  .volets { display: flex; gap: 3px; padding: 5px; border-radius: 10px; background: #0B1B2E; }
  .volets span { width: 24px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 4px; background: #1C1F25; box-shadow: inset 0 -16px 0 #15171B; font: 600 18px/1 'IBM Plex Mono', ui-monospace, monospace; color: #FFD23F; animation: nx-flap 420ms cubic-bezier(.2, .8, .2, 1) both; }
  .t-titre { font: 600 46px/44px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: -0.005em; text-wrap: balance; overflow-wrap: anywhere; }
  .intro { font-size: 15px; line-height: 22px; color: var(--ink2); }
  .voyager, .actifs { position: relative; display: flex; flex-direction: column; gap: 14px; min-height: 196px; padding: 18px; border-radius: 22px; text-decoration: none; overflow: hidden; animation: nx-rise 460ms cubic-bezier(.2, .7, .2, 1) both; }
  .voyager { background: #fff; color: #0B1B2E; box-shadow: 0 1px 0 #D3DCE6, 0 12px 32px rgba(11, 27, 46, 0.1); animation-delay: 380ms; }
  .actifs { background: #0D0E11; color: #F3F4F6; border: 1px solid #2C303A; animation-delay: 520ms; }
  .etq { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border-radius: 999px; background: #0B1B2E; color: #fff; font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.1em; text-transform: uppercase; } .etq.jaune { background: #FFD23F; color: #0D0E11; }
  .grand { font: 600 32px/32px 'Barlow Condensed', 'Arial Narrow', sans-serif; text-wrap: balance; overflow-wrap: anywhere; } .grand.maj { text-transform: uppercase; letter-spacing: 0.01em; }
  .trajet { display: flex; align-items: center; gap: 10px; margin-top: auto; } .yul { font: 700 22px/1 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; }
  .voyager .trajet > :global(svg) { color: var(--accent); } .pointille { flex: 1; border-top: 2px dotted #B9C5D3; }
  .go { width: 44px; height: 44px; flex: none; border-radius: 999px; background: #0B1B2E; color: #fff; display: flex; align-items: center; justify-content: center; } .go.jaune-bg { border-radius: 12px; background: #FFD23F; color: #0D0E11; }
  .puces { flex: 1; display: flex; flex-wrap: wrap; gap: 6px; } .pu { display: inline-flex; align-items: center; height: 24px; padding: 0 8px; border-radius: 999px; font: 700 11px/1 'Barlow', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; }
  .pu.a { background: #262A33; color: #B9BEC9; } .pu.b { background: rgba(98, 199, 255, 0.12); color: #62C7FF; } .pu.c { background: rgba(124, 227, 181, 0.12); color: #7CE3B5; }
  .sur { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); }
  .liste { border-radius: 16px; background: var(--surface); border: 1px solid var(--line); overflow: hidden; }
  .ligne { display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 6px 14px; } .ligne + .ligne { border-top: 1px solid var(--line); } .ligne > :global(svg) { color: var(--ink2); }
  .k { font-weight: 600; font-size: 15px; } .v { font-weight: 500; color: var(--ink2); font-size: 15px; overflow-wrap: anywhere; } .v.att { color: var(--ink2); }
  .lien { flex: none; display: inline-flex; align-items: center; min-height: 44px; font: 600 14px/1 'Barlow', sans-serif; color: var(--accent); } .coche { flex: none; display: flex; color: var(--ok); }
  .aide { font-size: 13px; line-height: 18px; color: var(--ink3); }
  @keyframes nx-rise { 0% { opacity: 0; transform: translateY(12px); } 100% { opacity: 1; transform: translateY(0); } }
  .tete, .cartes { display: contents; }
  .reste .liste li + li { border-top: 1px solid var(--line); } .lien-ligne { color: inherit; text-decoration: none; }
  @media (min-width: 900px) {
    :global(.entete > .vide) { display: none; } /* Ecran (sansRetour) laisse une case vide dans l'en-tête */
    .tete { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px 32px; flex-wrap: wrap; }
    .marque { order: 2; } .logo { display: none; }
    .volets { gap: 4px; padding: 6px; border-radius: 12px; } .volets span { width: 34px; height: 46px; border-radius: 5px; font-size: 26px; background: #1B2D45; box-shadow: inset 0 -23px 0 #15263C; }
    .t-titre { font-size: 52px; line-height: 50px; letter-spacing: 0; } .intro { max-width: 640px; font-size: 17px; line-height: 26px; }
    .cartes { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .voyager, .actifs { min-height: 240px; padding: 24px; border-radius: 24px; gap: 16px; }
    .voyager::before { content: ''; position: absolute; right: -56px; top: -56px; width: 190px; height: 190px; border-radius: 999px; border: 1px dashed #B9C5D3; }
    .voyager::after { content: ''; position: absolute; right: -12px; top: -12px; width: 98px; height: 98px; border-radius: 999px; border: 1px solid #D3DCE6; }
    .actifs::after { content: ''; position: absolute; right: 72px; top: 22px; width: 22px; height: 30px; border-radius: 4px; background: #1C1F25; box-shadow: inset 0 -15px 0 #15171B, 26px 0 0 #1C1F25, 52px 0 0 #1C1F25; }
    .etq { height: 32px; padding: 0 14px; gap: 6px; font-size: 12px; position: relative; z-index: 1; } .grand { font-size: 38px; line-height: 38px; position: relative; z-index: 1; }
    .yul { font-size: 26px; } .pointille { border-top-color: #7A8597; } .go { width: 48px; height: 48px; } .go.jaune-bg { border-radius: 12px; }
    .pu { height: 26px; padding: 0 10px; font-size: 12px; }
    .reste { max-width: 720px; gap: 10px; } .reste .sur { font-size: 12px; }
    .reste .liste { border-radius: 16px; } .reste .ligne { min-height: 64px; padding: 0 18px; gap: 14px; color: var(--ink); } .reste .k { font-size: 16px; } .reste .v { font-size: 16px; font-weight: 500; }
    .act-l { font: 700 15px/1 'Barlow', sans-serif; color: var(--accent); } .lien-ligne > :global(svg:last-child) { color: var(--accent); }
    .reste .aide { font-size: 14px; line-height: 20px; color: var(--ink2); }
  }
</style>

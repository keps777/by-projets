<script lang="ts">
  import { onDestroy } from 'svelte';
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { aller, param } from '../../router.svelte.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { DOCUMENTS, numeroDocumentValide, resultatIdentite, retourSur, verifierIdentite, type TypeDocument } from './actions.ts';
  import { reseau } from './enligne.svelte.ts';
  import { largeur } from './largeur.svelte.ts';

  /** Identité facultative : on explique quand elle est demandée, puis on simule la vérification (document, saisie, attente, résultat). Aucun document n'est envoyé. */
  type Phase = 'intro' | 'saisie' | 'attente' | 'ok' | 'refuse';
  const retour = $derived(retourSur(param('retour')));
  const compte = $derived(compteCourant());
  const dejaFait = $derived(!!compte?.identiteVerifiee);
  let phase = $state<Phase>('intro'), typeDoc = $state<TypeDocument>('passeport'), numero = $state(''), erreur = $state(''), etapeActive = $state(1);
  const timers: ReturnType<typeof setTimeout>[] = [];
  const arreter = () => { while (timers.length) clearTimeout(timers.pop()); };
  onDestroy(arreter);

  const lignes = [{ q: 'Explorer et acheter', non: true }, { q: 'Revendre un billet ou un bagage' }, { q: 'Recevoir de l\'argent' }];
  const etapes = [
    { t: 'Pièce d\'identité', s: 'Une photo de votre passeport ou permis de conduire.' },
    { t: 'Égoportrait', s: 'Pour vérifier que la pièce est bien la vôtre.' },
    { t: 'Confirmation', s: 'La réponse s\'affiche dans l\'app, avec la marche à suivre.' }
  ];
  const enCours = $derived(phase === 'saisie' || phase === 'attente');

  function commencer() { erreur = ''; etapeActive = 1; phase = 'saisie'; queueMicrotask(() => document.getElementById('id-num')?.focus()); }
  function stopper() { arreter(); phase = 'intro'; numero = ''; erreur = ''; etapeActive = 1; }
  function envoyer(e: Event) {
    e.preventDefault(); if (!reseau.enLigne) return;
    if (!numeroDocumentValide(numero)) { erreur = 'Saisissez le numéro du document : 6 à 12 lettres ou chiffres.'; document.getElementById('id-num')?.focus(); return; }
    erreur = ''; phase = 'attente'; etapeActive = 2;
    timers.push(setTimeout(() => (etapeActive = 3), 1100));
    timers.push(setTimeout(() => {
      const r = resultatIdentite(numero); numero = '';
      if (r === 'ok') { if (compte) verifierIdentite(compte.id); etapeActive = 4; phase = 'ok'; } else phase = 'refuse';
    }, 2300));
  }
  const suite = () => aller(retour);
</script>

{#snippet actions()}
    {#if phase === 'intro' && !dejaFait}<button type="button" class="btn sec" onclick={commencer}><Icone nom="piece" taille={20} />Vérifier maintenant</button>{/if}
    {#if enCours}<button type="button" class="btn sec" onclick={stopper}>Arrêter la vérification (démo)</button>{/if}
    {#if phase === 'refuse'}<button type="button" class="btn sec" onclick={commencer}>Réessayer</button>{/if}
    {#if phase === 'ok' || (phase === 'intro' && dejaFait)}<button type="button" class="btn" onclick={suite}>Continuer<Icone nom="suivant" taille={20} /></button>
    {:else}<button type="button" class="btn" onclick={suite}>Plus tard</button>{/if}
  {/snippet}

<Ecran titre="Facultatif" face="jour" retour={retour} large pied={largeur.pc ? undefined : actions}>
  <section class="hero" data-face="nuit">
    <div class="row g10">{#if largeur.pc}<span class="facultatif">Facultatif</span>{/if}<span class="volets" aria-hidden="true"><span style="animation-delay:120ms">I</span><span style="animation-delay:220ms">D</span></span>
      <span class="sur"><Icone nom="lune" taille={14} trait={2} />Pour l'espace Mes actifs</span></div>
    <h1>Vérifier votre identité, seulement quand il le faut</h1>
    <p>Pour explorer et acheter, rien à faire. La vérification arrive au moment de revendre ou de recevoir de l'argent.</p>
  </section>

  <div class="grille">
    <div class="gauche">
    <section class="col g12 quand-sec">
        <table class="quand"><caption>Quand est-ce demandé ?</caption>
          <thead><tr><th scope="col">Ce que vous faites</th><th scope="col" class="c2">Vérification</th></tr></thead>
          <tbody>
            {#each lignes as l (l.q)}<tr><th scope="row">{l.q}</th><td>{#if l.non}<span class="p non">Non</span>{:else}<span class="p oui"><Icone nom="verifie" taille={12} trait={2.5} />Oui</span>{/if}</td></tr>{/each}
            <tr><th scope="row">Nommer un voyageur</th><td class="petit">Informations du passeport du voyageur seulement</td></tr>
          </tbody></table>
        <p class="info"><Icone nom="info" taille={16} /><span>Revendre et recevoir de l'argent : requis par la réglementation sur les versements (à confirmer).</span></p>
        {#if largeur.pc}<p class="hyp"><span class="h">[H]</span><span>Moment et modalités de la vérification : à valider (obligations sur les versements, SECURITY_REQUIREMENTS R6 et R14).</span></p>{/if}
      </section>

    </div>
    <div class="droite">
    <section class="bloc" aria-labelledby="steps-title">
        <div class="tete"><h2 id="steps-title" class="t-section">Si vous le faites maintenant</h2><span class="est"><Icone nom="horloge" taille={14} trait={2} />Quelques minutes — estimation</span></div>
        <ol class="liste-plain etapes">
          {#each etapes as s, i (s.t)}
            {@const n = i + 1}
            <li><span class="rond" class:actif={enCours && etapeActive === n} class:fait={etapeActive > n} aria-hidden="true">{#if etapeActive > n}<Icone nom="ok" taille={16} trait={2.5} />{:else}{n}{/if}</span>
              <span class="col g4"><span class="t">{s.t}</span><span class="s">{s.s}</span></span></li>
          {/each}
        </ol>

        {#if !reseau.enLigne && phase !== 'ok'}<p class="alerte" role="alert"><Icone nom="hors_ligne" taille={18} />Vous êtes hors ligne : la vérification reprendra au retour du réseau.</p>{/if}

        {#if phase === 'saisie'}
          <form class="saisie" onsubmit={envoyer} novalidate>
            <p class="demo"><Icone nom="piece" taille={18} /><span><strong>Démo : étape 1 ouverte.</strong> L'appareil photo s'ouvrirait ici. Aucun document n'est envoyé dans cette maquette.</span></p>
            <fieldset class="docs"><legend class="t-sec">Type de document</legend>
              {#each DOCUMENTS as d (d.id)}<label class="radio" class:on={typeDoc === d.id}><input type="radio" name="doc" value={d.id} bind:group={typeDoc} />{d.label}</label>{/each}</fieldset>
            <div class="champ" data-erreur={erreur ? '' : undefined}><label for="id-num">Numéro du document (démo)</label>
              <input id="id-num" type="text" autocomplete="off" autocapitalize="characters" bind:value={numero} oninput={() => (erreur = '')} aria-invalid={erreur ? 'true' : undefined} aria-describedby={erreur ? 'id-num-e' : 'id-num-a'} />
              {#if erreur}<span class="erreur" id="id-num-e" role="alert"><Icone nom="alerte" taille={16} />{erreur}</span>{:else}<span class="aide" id="id-num-a">Inventez-en un : six caractères ou plus. Rien n'est envoyé.</span>{/if}</div>
            <button type="submit" class="btn fonce" disabled={!reseau.enLigne}>Envoyer pour vérification</button>
          </form>
        {:else if phase === 'attente'}
          <p class="attente" role="status"><span class="tour" aria-hidden="true"></span><span><strong>Vérification en cours…</strong> {etapeActive === 2 ? 'Comparaison du portrait (simulée).' : 'Confirmation de la réponse (simulée).'}</span></p>
        {:else if phase === 'ok'}
          <p class="ok" role="status"><Icone nom="verifie" taille={20} trait={2} /><span><strong>Identité vérifiée.</strong> Vous pouvez maintenant revendre et recevoir de l'argent. Démo : aucun vrai document n'a été examiné.</span></p>
        {:else if phase === 'refuse'}
          <p class="alerte" role="alert"><Icone nom="alerte" taille={18} /><span><strong>Document illisible (démo).</strong> La vérification n'a pas abouti. Reprenez avec un autre numéro.</span></p>
        {:else if dejaFait}
          <p class="ok" role="status"><Icone nom="verifie" taille={20} trait={2} /><span><strong>Identité déjà vérifiée.</strong> Rien à refaire.</span></p>
        {/if}
      </section>

      {#if largeur.pc}<div class="act">{@render actions()}</div>{/if}
      <p class="plus">Vous pourrez la faire plus tard depuis Mes actifs, au moment de revendre un billet.</p>

    </div>
  </div>
</Ecran>

<style>
  .hero { display: flex; flex-direction: column; gap: 16px; padding: 22px 20px 26px; margin: 0 -8px; border-radius: 28px; background: var(--bg); color: var(--ink); }
  .row.g10 { gap: 10px; flex-wrap: wrap; }
  .volets { display: flex; gap: 3px; } .volets span { width: 26px; height: 34px; display: flex; align-items: center; justify-content: center; border-radius: 4px; background: #1C1F25; box-shadow: inset 0 -17px 0 #15171B; font: 600 19px/1 'IBM Plex Mono', ui-monospace, monospace; color: #FFD23F; animation: nx-flap 380ms cubic-bezier(.2, .8, .2, 1) both; }
  .sur { display: inline-flex; align-items: center; gap: 6px; font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); }
  .hero h1 { font: 600 38px/40px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.005em; text-wrap: balance; overflow-wrap: anywhere; } .hero p { font-size: 15px; line-height: 22px; color: var(--ink2); }
  .quand { width: 100%; border-collapse: separate; border-spacing: 0; border-radius: 18px; background: var(--surface); border: 1px solid var(--line); overflow: hidden; font-size: 15px; }
  caption { caption-side: top; text-align: left; padding: 0 0 10px; font: 600 24px/28px 'Barlow Condensed', 'Arial Narrow', sans-serif; }
  thead th { padding: 10px 14px 8px; text-align: left; font: 700 11px/16px 'Barlow', sans-serif; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink3); background: #F5F8FB; } .c2 { width: 132px; }
  tbody th, tbody td { padding: 14px; text-align: left; border-top: 1px solid var(--line); } tbody th { font-weight: 600; } .petit { font: 600 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .p { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: 999px; font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; } .non { background: var(--surface2); color: var(--ink2); } .oui { background: var(--accent-soft); color: var(--accent); }
  .info { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; line-height: 19px; color: var(--ink2); } .info :global(svg) { margin-top: 2px; }
  .bloc { display: flex; flex-direction: column; gap: 14px; padding: 18px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); }
  .tete { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; } .est { display: inline-flex; align-items: center; gap: 6px; min-height: 28px; padding: 0 10px; border-radius: 999px; background: var(--surface2); color: var(--ink2); font: 600 13px/1 'Barlow', sans-serif; }
  .etapes { display: flex; flex-direction: column; gap: 12px; } .etapes li { display: flex; align-items: flex-start; gap: 12px; }
  .rond { flex: none; width: 32px; height: 32px; border-radius: 999px; background: var(--surface2); color: var(--ink2); display: flex; align-items: center; justify-content: center; font: 600 14px/1 'IBM Plex Mono', ui-monospace, monospace; transition: background-color 0.2s; }
  .rond.actif { background: var(--accent); color: #fff; } .rond.fait { background: var(--ok); color: #fff; }
  .t { font: 700 15px/20px 'Barlow', sans-serif; } .s { font-size: 13px; line-height: 18px; color: var(--ink2); }
  .saisie { display: flex; flex-direction: column; gap: 14px; animation: nx-rise 300ms cubic-bezier(.2, .7, .2, 1) both; }
  .demo { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 12px; background: var(--accent-soft); font-size: 13px; line-height: 19px; } .demo :global(svg) { flex: none; margin-top: 1px; color: var(--accent); }
  .docs { margin: 0; padding: 0; border: 0; min-width: 0; display: flex; flex-direction: column; gap: 8px; } .docs legend { padding: 0; margin-bottom: 8px; }
  .radio { display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 0 14px; border-radius: 12px; border: 1px solid var(--line-strong); background: var(--surface); font-weight: 600; cursor: pointer; } .radio.on { border-color: var(--accent); background: var(--accent-soft); }
  .radio input { width: 22px; height: 22px; margin: 0; accent-color: var(--accent); } .radio:has(input:focus-visible) { outline: 2px solid var(--focus); outline-offset: 2px; }
  .fonce { background: #0B1B2E; color: #fff; } .fonce:hover { background: #16314f; }
  .attente, .ok, .alerte { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 12px; font-size: 13px; line-height: 19px; }
  .attente { background: var(--accent-soft); align-items: center; } .ok { background: var(--ok-soft); color: var(--ok); } .ok strong { color: var(--ok); } .alerte { background: var(--err-soft); color: var(--err); }
  .tour { flex: none; width: 20px; height: 20px; border-radius: 999px; border: 3px solid var(--line-strong); border-top-color: var(--accent); animation: tour 0.9s linear infinite; }
  @keyframes tour { to { transform: rotate(360deg); } }
  .plus { font-size: 13px; line-height: 19px; color: var(--ink3); }
  @keyframes nx-rise { 0% { opacity: 0; transform: translateY(12px); } 100% { opacity: 1; transform: translateY(0); } }
  .grille, .gauche, .droite { display: contents; } .facultatif, .hyp { display: none; }
  @media (min-width: 900px) {
    .hero { gap: 18px; padding: 28px; margin: 0; border-radius: 24px; }
    .row.g10 { gap: 12px 16px; align-items: center; }
    .facultatif { display: inline-flex; align-items: center; min-height: 32px; padding: 0 14px; border-radius: 999px; background: var(--surface2); color: var(--ink2); font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.14em; text-transform: uppercase; }
    .volets { gap: 4px; } .volets span { width: 34px; height: 48px; border-radius: 6px; font-size: 26px; box-shadow: inset 0 -24px 0 #15171B; } .sur { font-size: 13px; gap: 8px; color: var(--ink2); }
    .hero h1 { max-width: 820px; font-size: 48px; line-height: 48px; letter-spacing: 0; } .hero p { max-width: 720px; font-size: 17px; line-height: 26px; }
    .grille { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 520px); gap: 24px; align-items: start; }
    .gauche, .droite { display: flex; flex-direction: column; min-width: 0; } .droite { gap: 18px; }
    .quand-sec { gap: 0; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); overflow: hidden; }
    .quand { border: 0; border-radius: 0; font-size: 14px; line-height: 20px; }
    caption { padding: 18px 18px 12px; font-size: 26px; line-height: 30px; }
    thead th { padding: 10px 18px; font-size: 12px; letter-spacing: 0.12em; color: var(--ink2); } .c2 { width: auto; }
    tbody th, tbody td { padding: 14px 18px; } tbody th { width: 56%; font-size: 16px; font-weight: 700; } .petit { font: 400 14px/20px 'Barlow', sans-serif; }
    .p { height: 28px; padding: 0 12px; } .non { background: var(--surface2); } .oui { color: var(--accent-2); }
    .info { padding: 14px 18px 18px; font-size: 14px; line-height: 20px; } .info :global(svg) { margin-top: 1px; flex: none; }
    .hyp { display: flex; align-items: flex-start; gap: 8px; margin: 0; padding: 0 18px 18px; font-size: 13px; line-height: 20px; color: var(--ink2); }
    .h { flex: none; display: inline-flex; align-items: center; height: 20px; padding: 0 6px; border-radius: 6px; background: rgba(255, 210, 63, 0.30); color: #5C4600; font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.04em; }
    .bloc { padding: 22px; gap: 14px; } .bloc .t-section { margin: 0; font-size: 22px; line-height: 26px; letter-spacing: 0.04em; text-transform: uppercase; }
    .est { background: none; padding: 0; min-height: 0; font-weight: 600; }
    .etapes { gap: 16px; } .etapes li { gap: 14px; } .rond { width: 36px; height: 36px; font-size: 16px; } .t { font-size: 16px; line-height: 22px; } .s { font-size: 14px; line-height: 20px; } .etapes li .col { padding-top: 2px; }
    .act { display: flex; flex-direction: column; gap: 12px; } .act .btn { min-height: 56px; font-size: 16px; } .act .btn:not(.sec):not(.fonce) { font-size: 17px; }
    .plus { font-size: 14px; line-height: 20px; color: var(--ink2); }
  }
</style>

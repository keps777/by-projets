<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Champ from '../../ui/Champ.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { aller } from '../../router.svelte.ts';
  import { AEROPORTS } from '../../data/seed.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import Etapes from './Etapes.svelte';
  import { INTERETS, basculerInteret, enregistrerProfil, libelleAeroport, phraseBonjour, phraseChoix, profil, trouverAeroport } from './actions.ts';
  import { naviguer } from './lien.ts';

  /** Étape 2 sur 4 : prénom, nom, aéroport habituel et centres d'intérêt, tout est facultatif. */
  const depart = compteCourant(); const tr = profil();
  const nomAeroport = (code: string | undefined) => { const a = AEROPORTS.find((x) => x.code === code) ?? AEROPORTS[0]; return libelleAeroport(a); };
  let prenom = $state(depart?.prenom ?? ''), nom = $state(depart?.nom ?? '');
  let aeroport = $state(nomAeroport(depart?.aeroport)), erreurAero = $state('');
  let interets = $state<string[]>([...tr.interets]);
  const trouve = $derived(trouverAeroport(aeroport));

  function continuer(e?: Event) {
    e?.preventDefault(); const c = compteCourant(); if (!c) return;
    const r = enregistrerProfil(c.id, { prenom, nom, aeroport, interets });
    if (!r.ok) { erreurAero = r.erreur; document.getElementById('pf-airport')?.focus(); return; }
    aller('/partage');
  }
  /** « Plus tard » : on passe l'étape sans rien écrire. */
  function plusTard() { aller('/partage'); }
</script>

<Ecran titre="" face="jour" retour="/code">
  {#snippet droite()}<a class="plus-tard" href="/partage" onclick={(e) => { e.preventDefault(); plusTard(); }}>Plus tard</a>{/snippet}
  <Etapes etape={2} />
  <form class="col g20" onsubmit={continuer} id="form-profil" novalidate>
    <section class="col g8"><h1 class="t-titre">Faisons connaissance</h1><p class="intro">Trois réponses rapides, toutes facultatives. Elles servent à vous proposer les bons départs.</p></section>

    <div class="col g12">
      <div class="champ"><label for="pf-name">Prénom</label>
        <input id="pf-name" type="text" autocomplete="given-name" bind:value={prenom} aria-describedby="pf-name-help" />
        <span class="aide" id="pf-name-help" aria-live="polite">{phraseBonjour(prenom)}</span></div>
      <Champ id="pf-nom" label="Nom" bind:valeur={nom} autocomplete="family-name" aide="Facultatif. Le nom du voyageur se donne plus tard, billet par billet." />
    </div>

    <div class="champ" data-erreur={erreurAero ? '' : undefined}>
      <label for="pf-airport">Aéroport habituel</label>
      <div class="aero">
        <span class="ico"><Icone nom="avion" taille={20} /></span>
        <input id="pf-airport" type="text" autocomplete="off" list="pf-aeroports" bind:value={aeroport} oninput={() => (erreurAero = '')} aria-invalid={erreurAero ? 'true' : undefined} aria-describedby={erreurAero ? 'pf-airport-e' : 'pf-airport-help'} />
        <span class="code" aria-hidden="true">{trouve?.code ?? '···'}</span>
        <datalist id="pf-aeroports">{#each AEROPORTS as a (a.code)}<option value={libelleAeroport(a)}></option>{/each}</datalist>
      </div>
      {#if erreurAero}<span class="erreur" id="pf-airport-e" role="alert"><Icone nom="alerte" taille={16} />{erreurAero}</span>
      {:else}<span class="aide" id="pf-airport-help">Point de départ proposé par défaut. Vous pourrez toujours en choisir un autre.</span>{/if}
    </div>

    <fieldset class="interets">
      <legend><span class="lg-t">Ce qui vous intéresse</span><span class="lg-s">Plusieurs choix possibles</span></legend>
      <div class="puces">
        {#each INTERETS as it (it.id)}
          {@const on = interets.includes(it.id)}
          <button type="button" class="chip" class:on aria-pressed={on} onclick={() => (interets = basculerInteret(interets, it.id))}>{#if on}<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12 5 5 9-10" /></svg>{/if}{it.label}</button>
        {/each}
      </div>
      <p class="compte" aria-live="polite">{phraseChoix(interets.length)}</p>
    </fieldset>

    <aside class="note"><span class="pic" aria-hidden="true"><Icone nom="cloche" taille={18} /></span>
      <p><strong>Vos choix servent à vos alertes ; modifiables à tout moment.</strong> Le nom du voyageur se donne plus tard, billet par billet.</p></aside>
  </form>
  {#snippet pied()}<button type="submit" form="form-profil" class="btn">Continuer<Icone nom="suivant" taille={20} /></button>{/snippet}
</Ecran>

<style>
  .plus-tard { display: flex; align-items: center; min-height: 44px; padding: 0 8px; color: var(--accent); font: 600 15px/1 'Barlow', sans-serif; }
  .t-titre { font: 600 44px/44px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: -0.005em; margin: 0; overflow-wrap: anywhere; }
  .intro { color: var(--ink2); font-size: 15px; line-height: 22px; }
  .g20 { gap: 22px; }
  .aero { position: relative; } .aero input { width: 100%; padding: 0 70px 0 44px; }
  .ico { position: absolute; left: 14px; top: 16px; color: var(--ink2); pointer-events: none; display: flex; }
  .code { position: absolute; right: 8px; top: 8px; height: 36px; padding: 0 10px; display: flex; align-items: center; border-radius: 8px; background: var(--ink); color: #fff; font: 700 20px/1 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.06em; }
  .interets { margin: 0; padding: 0; border: 0; min-width: 0; display: flex; flex-direction: column; gap: 12px; }
  legend { padding: 0; margin: 0 0 12px; display: flex; flex-direction: column; gap: 2px; }
  .lg-t { font: 600 24px/28px 'Barlow Condensed', 'Arial Narrow', sans-serif; } .lg-s { font-size: 13px; color: var(--ink3); }
  .puces { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 16px; border-radius: 999px; background: var(--surface); color: var(--ink); border: 1px solid var(--line-strong); font: 600 15px/1 'Barlow', sans-serif; cursor: pointer; transition: background-color 180ms ease, color 180ms ease; }
  .chip.on { background: var(--ink); color: #fff; border-color: var(--ink); }
  .compte { font: 600 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .note { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); }
  .pic { flex: none; width: 36px; height: 36px; border-radius: 10px; background: var(--accent-soft); color: var(--accent); display: flex; align-items: center; justify-content: center; }
  .note p { font-size: 14px; line-height: 20px; color: var(--ink2); } .note strong { color: var(--ink); font-weight: 600; }
</style>

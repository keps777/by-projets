<script lang="ts">
  import { onMount } from 'svelte';
  import './compte.css';
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Pic from './Pic.svelte';
  import { etatForce, reseau } from './reseau.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import { grouperFaq } from './aide.ts';

  /** Aide : recherche (sans accents), questions fréquentes en accordéon accessible, accès à l'assistance. États : chargement, sans résultat, erreur, hors ligne. */
  let q = $state(''), ouverte = $state<string | null>(null), vue = $state<'normal' | 'chargement' | 'erreur'>('normal');
  const groupes = $derived(grouperFaq(q));
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  onMount(() => { const f = etatForce(); if (f === 'erreur' || f === 'chargement') vue = f; return () => clearTimeout(minuterie); });
  function reessayer() { vue = 'chargement'; clearTimeout(minuterie); minuterie = setTimeout(() => (vue = 'normal'), 900); }
  const va = (e: MouseEvent, c: string) => { if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); aller(c); };
</script>

<Ecran titre="Aide" face="nuit" retour="/compte" pied={bas}>
  <div class="cp page">
    {#if !reseau.enLigne}<div class="cp-hl" role="status"><Icone nom="hors_ligne" taille={20} /><span class="col"><b>Hors ligne : les réponses déjà chargées restent lisibles.</b><span class="d">Reconnectez-vous pour écrire à l’assistance.</span></span></div>{/if}

    {#if vue === 'chargement'}
      <div aria-busy="true"><span class="sr" role="status">Chargement de l’aide…</span><div class="cp-sq" aria-hidden="true">{#each [0, 1, 2, 3] as i (i)}<div><span class="c"><i style="height:14px;width:80%"></i></span></div>{/each}</div></div>
    {:else if vue === 'erreur'}
      <section class="cp-erreur" role="alert" aria-labelledby="err-titre"><span class="rond"><Icone nom="alerte" taille={28} /></span><h2 id="err-titre">Impossible de charger l’aide</h2><p>Vérifiez votre connexion, puis réessayez. Vous pouvez aussi écrire à l’assistance.</p><button type="button" class="btn sec" onclick={reessayer}>Réessayer</button></section>
    {:else}
      <div class="cp-champ"><label for="aide-q">Rechercher dans l’aide</label>
        <div class="rech"><span class="loupe" aria-hidden="true"><Pic nom="chercher" taille={20} /></span>
          <input id="aide-q" type="search" autocomplete="off" placeholder="Ex. échéance, commission" style="padding-left:44px;padding-right:48px" bind:value={q} oninput={() => (ouverte = null)} />
          {#if q}<button type="button" class="vider" aria-label="Vider le champ de recherche" onclick={() => { q = ''; ouverte = null; document.getElementById('aide-q')?.focus(); }}><Pic nom="fermer" taille={18} /></button>{/if}</div></div>
      <p class="sr" role="status" aria-live="polite">{q.trim() ? (groupes.length ? `${groupes.reduce((n, g) => n + g.questions.length, 0)} réponse(s)` : 'Aucun résultat') : ''}</p>

      {#each groupes as g (g.id)}
        <section class="cp-groupe" aria-labelledby={`th-${g.id}`}><h2 id={`th-${g.id}`} class="cp-sur">{g.titre}</h2>
          <div class="cp-liste">
            {#each g.questions as f (f.id)}
              {@const ouvert = ouverte === f.id}
              <div data-question-bloc={f.id}>
                <h3><button type="button" id={`q-${f.id}`} data-question={f.id} aria-expanded={ouvert} aria-controls={`r-${f.id}`} onclick={() => (ouverte = ouvert ? null : f.id)}><span class="grow">{f.q}</span><span class="fl" class:on={ouvert}><Pic nom="chevron" taille={18} /></span></button></h3>
                {#if ouvert}<div id={`r-${f.id}`} role="region" aria-labelledby={`q-${f.id}`} class="rep"><p>{f.a}</p>{#if f.lien}<a class="cp-lien l0" href={f.lien.chemin} onclick={(e) => va(e, f.lien!.chemin)}>{f.lien.texte}</a>{/if}</div>{/if}
              </div>
            {/each}
          </div></section>
      {:else}
        <section class="cp-etat" role="status"><span class="rond"><Pic nom="chercher" taille={30} /></span><p class="gros">Aucun résultat pour « {q} »</p><p>Essayez un autre mot, ou écrivez-nous.</p>
          <button type="button" class="btn sec sm" onclick={() => { q = ''; ouverte = null; }}>Effacer la recherche</button></section>
      {/each}
    {/if}
  </div>
</Ecran>

{#snippet bas()}
<div class="cp-barre">
  {#if reseau.enLigne}
    <a class="btn" href="/aide/contact" onclick={(e) => va(e, '/aide/contact')}><Pic nom="message" taille={20} />Écrire à l’assistance</a>
  {:else}
    <p id="ecrire-aide" class="t-sec centre">Hors ligne : écrire à l’assistance demande une connexion.</p>
    <button type="button" class="btn" aria-disabled="true" aria-describedby="ecrire-aide"><Pic nom="message" taille={20} />Écrire à l’assistance</button>
  {/if}
</div>
{/snippet}

<style>
  .page { display: flex; flex-direction: column; gap: 22px; }
  .rech { position: relative; display: flex; align-items: center; } .rech input { padding: 0 48px 0 44px; } .loupe { position: absolute; left: 14px; color: var(--ink3); pointer-events: none; display: flex; }
  .vider { position: absolute; right: 4px; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; border: 0; background: transparent; color: var(--ink2); cursor: pointer; }
  h3 { margin: 0; font-size: 15px; } .cp-liste > div + div { border-top: 1px solid var(--line); }
  h3 button { width: 100%; display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 12px 16px; box-sizing: border-box; background: none; border: 0; color: var(--ink); font: 600 15px/21px 'Barlow', sans-serif; text-align: left; cursor: pointer; }
  .fl { color: var(--ink3); display: flex; transition: transform 0.15s; } .fl.on { transform: rotate(90deg); }
  .rep { display: flex; flex-direction: column; gap: 4px; padding: 0 16px 8px; font-size: 14px; line-height: 21px; color: var(--ink2); } .rep p { margin: 0; } .l0 { align-self: flex-start; padding: 0; }
  .gros { font-size: 18px; line-height: 24px; font-weight: 700; color: var(--ink) !important; overflow-wrap: anywhere; }
</style>
